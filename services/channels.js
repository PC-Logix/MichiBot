'use strict';

const { getDb } = require('../libs/db');

function normalizeChannel(value) {
  return String(value || '').trim();
}

function ensureSchema() {
  const database = getDb();
  database.exec('CREATE TABLE IF NOT EXISTS Channels(name)');
  return database;
}

function list() {
  const rows = ensureSchema().prepare('SELECT name FROM Channels ORDER BY rowid').all();
  const seen = new Set();
  const channels = [];
  for (const row of rows) {
    const channel = normalizeChannel(row.name);
    const key = channel.toLowerCase();
    if (!channel || seen.has(key)) continue;
    seen.add(key);
    channels.push(channel);
  }
  return channels;
}

function has(channel) {
  const target = normalizeChannel(channel);
  if (!target) return false;
  return !!ensureSchema().prepare(`
    SELECT 1 FROM Channels WHERE LOWER(TRIM(name))=LOWER(?) LIMIT 1
  `).get(target);
}

function add(channel) {
  const target = normalizeChannel(channel);
  if (!target || has(target)) return false;
  ensureSchema().prepare('INSERT INTO Channels(name) VALUES(?)').run(target);
  return true;
}

function remove(channel) {
  const target = normalizeChannel(channel);
  if (!target) return false;
  return ensureSchema().prepare('DELETE FROM Channels WHERE LOWER(TRIM(name))=LOWER(?)').run(target).changes > 0;
}

function initialize(configChannels = []) {
  const database = getDb();
  const existed = !!database.prepare(`
    SELECT 1 FROM sqlite_master
    WHERE type='table' AND LOWER(name)=LOWER(?)
    LIMIT 1
  `).get('Channels');
  ensureSchema();

  // A brand-new database starts with config.json's channel list. Once the
  // table exists, even an empty table is authoritative so parting the last
  // channel remains persistent across restarts.
  if (!existed) {
    for (const channel of Array.isArray(configChannels) ? configChannels : []) add(channel);
  }

  return list();
}

module.exports = {
  add,
  ensureSchema,
  has,
  initialize,
  list,
  normalizeChannel,
  remove
};
