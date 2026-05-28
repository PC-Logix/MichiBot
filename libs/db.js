'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dataDir = path.join(__dirname, '..', 'data');
const legacyDbPath = path.join(dataDir, 'michibot.db');
const defaultDbPath = path.join(dataDir, 'botdata.sqlite');

function resolveDbPath() {
  if (process.env.MICHIBOT_DB_PATH) {
    return path.resolve(process.env.MICHIBOT_DB_PATH);
  }

  // LanteaBot's old database was normally michibot.db. If you drop that file
  // into data/, use it directly instead of making a fresh botdata.sqlite.
  if (fs.existsSync(legacyDbPath)) {
    return legacyDbPath;
  }

  return defaultDbPath;
}

let db = null;
let dbPath = resolveDbPath();

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, {
      recursive: true
    });
  }
}

function openDb() {
  if (db) return db;

  ensureDataDir();
  dbPath = resolveDbPath();

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  return db;
}

function getDb() {
  return openDb();
}

function tableExists(database, tableName) {
  const row = database.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name = ?
    LIMIT 1
  `).get(String(tableName || '').trim());

  return !!row?.name;
}

function closeDb() {
  if (!db) return;
  db.close();
  db = null;
}

function getDbPath() {
  return dbPath;
}

module.exports = {
  getDb,
  openDb,
  closeDb,
  tableExists,
  getDbPath,
  get dbPath() {
    return dbPath;
  },
  dataDir,
  legacyDbPath,
  defaultDbPath
};
