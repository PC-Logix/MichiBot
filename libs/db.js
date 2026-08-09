'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dataDir = path.join(__dirname, '..', 'data');
const legacyDbPath = path.join(dataDir, 'michibot.db');
const defaultDbPath = path.join(dataDir, 'botdata.sqlite');

function resolveDbPath() {
  if (process.env.MICHIBOT_DB_PATH) return path.resolve(process.env.MICHIBOT_DB_PATH);

  // LanteaBot's old database was normally michibot.db. If you drop that file
  // into data/, use it directly instead of making a fresh botdata.sqlite.
  if (fs.existsSync(legacyDbPath)) return legacyDbPath;

  return defaultDbPath;
}

let db = null;
let dbPath = resolveDbPath();

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
}

function boolEnv(name) {
  const value = String(process.env[name] || '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(value);
}

function openDb() {
  if (db) return db;

  ensureDataDir();
  dbPath = resolveDbPath();

  db = new Database(dbPath);
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = FULL');

  // WAL can make changes sit in botdata.sqlite-wal until checkpointed, which
  // looks like nothing saved if you inspect/copy only the main .sqlite file.
  // Default to DELETE so committed writes land directly in the database file.
  if (boolEnv('MICHIBOT_SQLITE_WAL')) db.pragma('journal_mode = WAL');
  else db.pragma('journal_mode = DELETE');

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

function checkpointDb(mode = 'TRUNCATE') {
  if (!db) return false;

  try {
    db.pragma(`wal_checkpoint(${mode})`);
    return true;
  } catch (_) {
    return false;
  }
}

function closeDb() {
  if (!db) return;
  checkpointDb('TRUNCATE');
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
  checkpointDb,
  tableExists,
  getDbPath,
  get dbPath() { return dbPath; },
  dataDir,
  legacyDbPath,
  defaultDbPath
};
