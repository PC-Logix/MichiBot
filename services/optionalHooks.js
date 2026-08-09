'use strict';

const { getDb } = require('../libs/db');

function db() {
  const database = getDb();
  database.exec('CREATE TABLE IF NOT EXISTS OptionalHooks(hook, channel)');
  return database;
}

function getEnabledChannels(hook) {
  return db().prepare(`
    SELECT channel FROM OptionalHooks
    WHERE LOWER(hook) = LOWER(?)
    ORDER BY LOWER(channel), channel
  `).all(String(hook || '')).map(row => String(row.channel));
}

function isEnabled(hook, channel) {
  const name = String(channel || '').trim();
  if (!hook || !name) return false;
  return !!db().prepare(`
    SELECT 1 FROM OptionalHooks
    WHERE LOWER(hook) = LOWER(?) AND LOWER(channel) = LOWER(?)
    LIMIT 1
  `).get(String(hook), name);
}

function enable(hook, channel) {
  const name = String(channel || '').trim();
  if (!hook || !name || isEnabled(hook, name)) return false;
  db().prepare('INSERT INTO OptionalHooks(hook, channel) VALUES (?, ?)').run(String(hook), name);
  return true;
}

function disable(hook, channel) {
  return db().prepare(`
    DELETE FROM OptionalHooks
    WHERE LOWER(hook) = LOWER(?) AND LOWER(channel) = LOWER(?)
  `).run(String(hook || ''), String(channel || '').trim()).changes > 0;
}

module.exports = { disable, enable, ensureSchema: db, getEnabledChannels, isEnabled };
