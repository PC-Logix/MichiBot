'use strict';

const { getDb } = require('../libs/db');

function db() {
  const database = getDb();
  database.exec(`
    CREATE TABLE IF NOT EXISTS InternetPoints(
      nick STRING UNIQUE PRIMARY KEY,
      points
    )
  `);
  return database;
}

function normalizeIdentity(identity) {
  return String(identity || '').trim();
}

function getPoints(identity) {
  const name = normalizeIdentity(identity);
  if (!name) return 0;
  const row = db().prepare(`
    SELECT points FROM InternetPoints
    WHERE LOWER(nick) = LOWER(?)
    LIMIT 1
  `).get(name);
  const value = Number(row?.points || 0);
  return Number.isFinite(value) ? Math.abs(value) : 0;
}

function setPoints(identity, points) {
  const name = normalizeIdentity(identity);
  if (!name) throw new Error('A user is required.');
  const value = Number(points);
  if (!Number.isFinite(value)) throw new Error('Points must be numeric.');

  const existing = db().prepare(`
    SELECT nick FROM InternetPoints
    WHERE LOWER(nick) = LOWER(?)
    LIMIT 1
  `).get(name);

  if (existing) {
    db().prepare('UPDATE InternetPoints SET points = ? WHERE LOWER(nick) = LOWER(?)')
      .run(Math.abs(value), name);
  } else {
    db().prepare('INSERT INTO InternetPoints(nick, points) VALUES (?, ?)')
      .run(name, Math.abs(value));
  }
  return Math.abs(value);
}

function addPoint(identity) {
  return setPoints(identity, getPoints(identity) + 1);
}

module.exports = {
  addPoint,
  ensureSchema: db,
  getPoints,
  normalizeIdentity,
  setPoints
};
