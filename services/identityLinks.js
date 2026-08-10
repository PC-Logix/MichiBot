'use strict';

const crypto = require('crypto');
const { getDb } = require('../libs/db');

const CLAIM_TTL_MS = 10 * 60 * 1000;
const CODE_LENGTH = 7;
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function db() {
  const database = getDb();
  database.exec(`
    CREATE TABLE IF NOT EXISTS IdentityLinks(
      discordSubject TEXT PRIMARY KEY COLLATE NOCASE,
      ircAccount TEXT NOT NULL COLLATE NOCASE,
      linkedAt INT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS IdentityClaims(
      code TEXT PRIMARY KEY COLLATE NOCASE,
      discordSubject TEXT NOT NULL UNIQUE COLLATE NOCASE,
      discordName TEXT NOT NULL DEFAULT '',
      createdAt INT NOT NULL,
      expiresAt INT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_identity_links_irc
      ON IdentityLinks(ircAccount COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_identity_claims_expiry
      ON IdentityClaims(expiresAt);
  `);
  return database;
}

function discordSubject(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!/^discord:\d+$/.test(normalized)) throw new Error('A verified Discord identity is required.');
  return normalized;
}

function ircAccount(value) {
  const normalized = String(value || '').trim();
  if (!normalized || normalized === '*') throw new Error('An authenticated IRC account is required.');
  return normalized.replace(/^acct:/i, '');
}

function cleanupExpired(now = Date.now()) {
  return db().prepare('DELETE FROM IdentityClaims WHERE expiresAt <= ?').run(Number(now)).changes;
}

function getLink(value) {
  const subject = discordSubject(value);
  return db().prepare(`
    SELECT discordSubject, ircAccount, linkedAt FROM IdentityLinks
    WHERE discordSubject=? COLLATE NOCASE
  `).get(subject) || null;
}

function resolveIdentity(value) {
  const identity = String(value || '').trim();
  if (!identity) return '';
  if (/^acct:/i.test(identity)) return identity.slice(5);
  if (!/^discord:\d+$/i.test(identity)) return identity;
  return getLink(identity)?.ircAccount || identity.toLowerCase();
}

function expandPermissionSubjects(values) {
  const expanded = new Map();
  const accounts = new Map();
  const add = value => {
    const subject = String(value || '').trim();
    if (subject) expanded.set(subject.toLowerCase(), subject);
  };
  for (const value of Array.isArray(values) ? values : []) add(value);

  for (const subject of Array.from(expanded.values())) {
    if (/^discord:\d+$/i.test(subject)) {
      const link = getLink(subject);
      if (link) accounts.set(link.ircAccount.toLowerCase(), link.ircAccount);
      continue;
    }
    if (/^acct:/i.test(subject)) {
      const account = subject.slice(5);
      if (account) accounts.set(account.toLowerCase(), account);
    }
  }

  for (const account of accounts.values()) {
    add(`acct:${account}`);
    const links = db().prepare(`
      SELECT discordSubject FROM IdentityLinks
      WHERE ircAccount=? COLLATE NOCASE
    `).all(account);
    for (const link of links) add(link.discordSubject);
  }
  return Array.from(expanded.values());
}

function generateCode(randomInt = crypto.randomInt) {
  let code = '';
  for (let index = 0; index < CODE_LENGTH; index += 1) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

function createClaim(value, displayName = '', {
  now = Date.now(),
  randomInt = crypto.randomInt
} = {}) {
  const subject = discordSubject(value);
  const existing = getLink(subject);
  if (existing) return { ok: false, linked: true, ircAccount: existing.ircAccount };
  cleanupExpired(now);

  let code = '';
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = generateCode(randomInt);
    if (!db().prepare('SELECT 1 FROM IdentityClaims WHERE code=? COLLATE NOCASE').get(candidate)) {
      code = candidate;
      break;
    }
  }
  if (!code) throw new Error('Could not generate a unique identity claim code.');

  const expiresAt = Number(now) + CLAIM_TTL_MS;
  const create = db().transaction(() => {
    db().prepare('DELETE FROM IdentityClaims WHERE discordSubject=? COLLATE NOCASE').run(subject);
    db().prepare(`
      INSERT INTO IdentityClaims(code, discordSubject, discordName, createdAt, expiresAt)
      VALUES(?, ?, ?, ?, ?)
    `).run(code, subject, String(displayName || ''), Number(now), expiresAt);
  });
  create();
  return { ok: true, code, discordSubject: subject, expiresAt };
}

function consumeClaim(value, account, now = Date.now()) {
  const code = String(value || '').trim().toUpperCase();
  const targetAccount = ircAccount(account);
  if (!/^[A-Z0-9]{6,12}$/.test(code)) return { ok: false, reason: 'invalid' };
  cleanupExpired(now);
  const claim = db().prepare(`
    SELECT code, discordSubject, discordName, expiresAt FROM IdentityClaims
    WHERE code=? COLLATE NOCASE
  `).get(code);
  if (!claim) return { ok: false, reason: 'invalid' };

  const existing = getLink(claim.discordSubject);
  if (existing && existing.ircAccount.toLowerCase() !== targetAccount.toLowerCase()) {
    return { ok: false, reason: 'linked', ircAccount: existing.ircAccount };
  }

  if (!existing) {
    db().prepare(`
      INSERT INTO IdentityLinks(discordSubject, ircAccount, linkedAt)
      VALUES(?, ?, ?)
    `).run(claim.discordSubject, targetAccount, Number(now));
  }
  db().prepare('DELETE FROM IdentityClaims WHERE code=? COLLATE NOCASE').run(code);
  return {
    ok: true,
    alreadyLinked: !!existing,
    discordSubject: claim.discordSubject,
    discordName: String(claim.discordName || ''),
    ircAccount: targetAccount
  };
}

module.exports = {
  CLAIM_TTL_MS,
  CODE_ALPHABET,
  CODE_LENGTH,
  cleanupExpired,
  consumeClaim,
  createClaim,
  ensureSchema: db,
  expandPermissionSubjects,
  generateCode,
  getLink,
  resolveIdentity
};
