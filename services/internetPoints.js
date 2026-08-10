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

function mergeIdentity(sourceIdentity, targetIdentity) {
  const source = normalizeIdentity(sourceIdentity);
  const target = normalizeIdentity(targetIdentity);
  if (!source || !target || source.toLowerCase() === target.toLowerCase()) return { changed: false };
  const sourceRow = db().prepare('SELECT nick, points FROM InternetPoints WHERE LOWER(nick)=LOWER(?)').get(source);
  if (!sourceRow) return { changed: false };
  const sourcePoints = Number(sourceRow.points || 0);
  const targetPoints = getPoints(target);
  setPoints(target, targetPoints + sourcePoints);
  db().prepare('DELETE FROM InternetPoints WHERE LOWER(nick)=LOWER(?)').run(source);
  return { changed: true, points: targetPoints + sourcePoints };
}

module.exports = {
  addPoint,
  ensureSchema: db,
  getPoints,
  mergeIdentity,
  normalizeIdentity,
  setPoints
};
