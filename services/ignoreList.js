'use strict';

const { getDb } = require('../libs/db');

function db() {
  const database = getDb();
  database.exec(`
    CREATE TABLE IF NOT EXISTS Ignore(
      username PRIMARY KEY,
      time INTEGER
    )
  `);
  return database;
}

function normalizeUsername(username) {
  return String(username || '')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
    .replace(/^"|"$/g, '')
    .trim();
}

function isIgnored(username) {
  const name = normalizeUsername(username);
  if (!name) return false;
  return !!db().prepare(`
    SELECT 1 FROM Ignore
    WHERE LOWER(username) = LOWER(?)
    LIMIT 1
  `).get(name);
}

function add(username, time = 0) {
  const name = normalizeUsername(username);
  if (!name || isIgnored(name)) return false;
  return db().prepare('INSERT INTO Ignore(username, time) VALUES (?, ?)')
    .run(name, Number(time) || 0).changes > 0;
}

function remove(username) {
  const name = normalizeUsername(username);
  if (!name) return false;
  return db().prepare('DELETE FROM Ignore WHERE LOWER(username) = LOWER(?)')
    .run(name).changes > 0;
}

function list() {
  return db().prepare(`
    SELECT username, time FROM Ignore
    ORDER BY LOWER(username), username
  `).all().map(row => ({
    username: String(row.username || ''),
    time: Number(row.time || 0)
  }));
}

module.exports = {
  add,
  ensureSchema: db,
  isIgnored,
  list,
  normalizeUsername,
  remove
};
