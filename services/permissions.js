'use strict';

const fs = require('fs');
const path = require('path');
const {
  getDb,
  tableExists
} = require('../libs/db');
const {
  resolveDiscordUserIdFromBridge
} = require('../services/bridgeAuth');

const legacyPermissionsPath = path.join(__dirname, '..', 'permissions.json');

let permissions = {
  ranks: []
};

const rankOrder = ['Trusted', 'Moderator', 'Admin'];

function norm(value) {
  return String(value || '').trim().toLowerCase();
}

function ensurePermissionSchema() {
  const database = getDb();

  database.exec(`
    CREATE TABLE IF NOT EXISTS permission_ranks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS permission_rank_subjects (
      rank_id INTEGER NOT NULL,
      subject TEXT NOT NULL,
      PRIMARY KEY (rank_id, subject),
      FOREIGN KEY (rank_id) REFERENCES permission_ranks(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_permission_ranks_name
      ON permission_ranks(name);

    CREATE INDEX IF NOT EXISTS idx_permission_rank_subjects_subject
      ON permission_rank_subjects(subject);
  `);
}

function migrateLegacyUserTableIfNeeded() {
  const database = getDb();

  try {
    if (!tableExists(database, 'permission_rank_users')) {
      return;
    }

    const subjectCountRow = database.prepare(`
      SELECT COUNT(*) AS count
      FROM permission_rank_subjects
    `).get();

    if (Number(subjectCountRow?.count || 0) > 0) {
      return;
    }

    const rows = database.prepare(`
      SELECT rank_id, account_name
      FROM permission_rank_users
    `).all();

    if (rows.length === 0) {
      return;
    }

    const insertSubject = database.prepare(`
      INSERT OR IGNORE INTO permission_rank_subjects (rank_id, subject)
      VALUES (?, ?)
    `);

    const migrate = database.transaction((items) => {
      for (const row of items) {
        const subject = makeAccountSubject(row.account_name);
        if (!subject) continue;
        insertSubject.run(row.rank_id, subject);
      }
    });

    migrate(rows);
    console.log(`[permissions] Migrated ${rows.length} legacy permission subject(s) from permission_rank_users`);
  } catch (error) {
    console.error('Error migrating legacy permission_rank_users table:', error.message);
  }
}

function ensurePermissionStorage() {
  ensurePermissionSchema();
  migrateLegacyUserTableIfNeeded();
}

function makeAccountSubject(accountName) {
  const acct = String(accountName || '').trim();
  if (!acct) return null;
  return `acct:${acct}`;
}

function makeDiscordSubject(discordId) {
  const id = String(discordId || '').trim();
  if (!/^\d+$/.test(id)) return null;
  return `discord:${id}`;
}

function normalizeStoredSubject(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  if (/^acct:/i.test(raw)) {
    return makeAccountSubject(raw.slice(5));
  }

  if (/^discord:/i.test(raw)) {
    return makeDiscordSubject(raw.slice(8));
  }

  return makeAccountSubject(raw);
}

function subjectKey(subject) {
  const normalized = normalizeStoredSubject(subject);
  return norm(normalized);
}

function dbHasPermissionData() {
  const database = getDb();

  const row = database.prepare(`
    SELECT EXISTS(
      SELECT 1
      FROM permission_ranks
      LIMIT 1
    ) AS has_data
  `).get();

  return !!row?.has_data;
}

function loadLegacyPermissionsFile() {
  try {
    if (!fs.existsSync(legacyPermissionsPath)) {
      return {
        ranks: []
      };
    }

    const raw = fs.readFileSync(legacyPermissionsPath, 'utf8');
    const parsed = JSON.parse(raw);

    return {
      ranks: Array.isArray(parsed?.ranks) ? parsed.ranks : []
    };
  } catch (error) {
    console.error('Error reading legacy permissions.json:', error.message);
    return {
      ranks: []
    };
  }
}

function writePermissionsToDb(permissionObject) {
  const database = getDb();
  const ranks = Array.isArray(permissionObject?.ranks) ? permissionObject.ranks : [];

  const replaceAll = database.transaction((rankList) => {
    database.prepare('DELETE FROM permission_rank_subjects').run();
    database.prepare('DELETE FROM permission_ranks').run();

    const insertRank = database.prepare(`
      INSERT INTO permission_ranks (name)
      VALUES (?)
    `);

    const insertSubject = database.prepare(`
      INSERT INTO permission_rank_subjects (rank_id, subject)
      VALUES (?, ?)
    `);

    for (const rank of rankList) {
      const rankName = String(rank?.name || '').trim();
      if (!rankName) continue;

      const result = insertRank.run(rankName);
      const rankId = result.lastInsertRowid;

      const users = Array.isArray(rank?.users) ? rank.users : [];
      const seenSubjects = new Set();

      for (const user of users) {
        const subject = normalizeStoredSubject(user);
        const key = subjectKey(subject);

        if (!subject || !key || seenSubjects.has(key)) continue;
        seenSubjects.add(key);

        insertSubject.run(rankId, subject);
      }
    }
  });

  replaceAll(ranks);
}

function maybeMigrateLegacyPermissions() {
  try {
    if (dbHasPermissionData()) {
      return;
    }

    const legacy = loadLegacyPermissionsFile();
    const legacyRanks = Array.isArray(legacy?.ranks) ? legacy.ranks : [];

    if (legacyRanks.length === 0) {
      return;
    }

    writePermissionsToDb(legacy);
    console.log(`[permissions] Migrated ${legacyRanks.length} rank(s) from permissions.json to SQLite`);
  } catch (error) {
    console.error('Error migrating legacy permissions:', error.message);
  }
}

function readPermissionsFromDb() {
  const database = getDb();

  const rows = database.prepare(`
    SELECT
      r.name AS rank_name,
      s.subject AS subject
    FROM permission_ranks r
    LEFT JOIN permission_rank_subjects s
      ON s.rank_id = r.id
    ORDER BY r.name COLLATE NOCASE, s.subject COLLATE NOCASE
  `).all();

  const rankMap = new Map();

  for (const row of rows) {
    const rankName = String(row.rank_name || '').trim();
    if (!rankName) continue;

    if (!rankMap.has(rankName)) {
      rankMap.set(rankName, {
        name: rankName,
        users: []
      });
    }

    const subject = normalizeStoredSubject(row.subject);
    if (subject) {
      rankMap.get(rankName).users.push(subject);
    }
  }

  return {
    ranks: Array.from(rankMap.values())
  };
}

function loadPermissions() {
  try {
    ensurePermissionStorage();
    maybeMigrateLegacyPermissions();
    permissions = readPermissionsFromDb();
  } catch (error) {
    console.error('Error loading permissions from SQLite:', error.message);
    permissions = {
      ranks: []
    };
  }

  return permissions;
}

function savePermissions() {
  try {
    ensurePermissionStorage();
    writePermissionsToDb(permissions);
    permissions = readPermissionsFromDb();
  } catch (error) {
    console.error('Error saving permissions to SQLite:', error.message);
  }
}

function getPermissions() {
  return permissions;
}

function getRanksForSubject(subject) {
  const wanted = subjectKey(subject);
  if (!wanted) return [];

  return permissions.ranks.filter(rank =>
    Array.isArray(rank?.users) && rank.users.some(user => subjectKey(user) === wanted)
  );
}

function getHighestRankForSubject(subject) {
  const ranks = getRanksForSubject(subject);
  if (ranks.length === 0) return null;

  return ranks
    .slice()
    .sort((a, b) => rankLevel(b?.name) - rankLevel(a?.name))[0] || null;
}

function getRanksForAccount(accountName) {
  const subject = makeAccountSubject(accountName);
  return subject ? getRanksForSubject(subject) : [];
}

function getHighestRank(accountName) {
  const subject = makeAccountSubject(accountName);
  return subject ? getHighestRankForSubject(subject) : null;
}

function rankLevel(rankName) {
  const idx = rankOrder.findIndex(name => norm(name) === norm(rankName));
  return idx === -1 ? -1 : idx;
}

function subjectHasRank(subject, rankName) {
  const wantedSubject = subjectKey(subject);
  const wantedRank = norm(rankName);
  if (!wantedSubject || !wantedRank) return false;

  return permissions.ranks.some(rank =>
    norm(rank?.name) === wantedRank &&
    Array.isArray(rank?.users) &&
    rank.users.some(user => subjectKey(user) === wantedSubject)
  );
}

function subjectHasAtLeastRank(subject, rankName) {
  const highest = getHighestRankForSubject(subject);
  if (!highest) return false;

  const actual = rankLevel(highest.name);
  const needed = rankLevel(rankName);

  if (needed === -1) {
    return subjectHasRank(subject, rankName);
  }

  return actual >= needed;
}

function subjectsHaveAtLeastRank(subjects, rankName) {
  const list = Array.isArray(subjects) ? subjects : [];
  return list.some(subject => subjectHasAtLeastRank(subject, rankName));
}

function accountHasRank(accountName, rankName) {
  const subject = makeAccountSubject(accountName);
  return subject ? subjectHasRank(subject, rankName) : false;
}

function accountHasAtLeastRank(accountName, rankName) {
  const subject = makeAccountSubject(accountName);
  return subject ? subjectHasAtLeastRank(subject, rankName) : false;
}

function hasChannelMode(ctx, modeName) {
  if (!ctx || ctx.isPrivate) return false;

  const mode = norm(modeName);
  const flags = ctx.channelModes || {};

  if (mode === 'voice') return !!flags.voice;
  if (mode === 'halfop') return !!flags.halfop;
  if (mode === 'op') return !!flags.op;
  if (mode === 'admin') return !!flags.admin;
  if (mode === 'owner') return !!flags.owner;

  return false;
}

function getLocalPermissionSubjects(ctx) {
  const subjects = [];
  const seen = new Set();

  const add = (subject) => {
    const normalized = normalizeStoredSubject(subject);
    const key = subjectKey(normalized);
    if (!normalized || !key || seen.has(key)) return;
    seen.add(key);
    subjects.push(normalized);
  };

  if (ctx?.account) {
    add(makeAccountSubject(ctx.account));
  }

  if (ctx?.permissionSubject) {
    add(ctx.permissionSubject);
  }

  if (Array.isArray(ctx?.permissionSubjects)) {
    for (const subject of ctx.permissionSubjects) {
      add(subject);
    }
  }

  return subjects;
}

async function getPermissionSubjectsForContext(ctx) {
  const subjects = getLocalPermissionSubjects(ctx);
  const seen = new Set(subjects.map(subjectKey).filter(Boolean));

  if (ctx?.isBridge && ctx?.source === 'discord-bridge') {
    const discordId = await resolveDiscordUserIdFromBridge(ctx);
    const discordSubject = makeDiscordSubject(discordId);
    const key = subjectKey(discordSubject);

    if (discordSubject && key && !seen.has(key)) {
      seen.add(key);
      subjects.push(discordSubject);
    }
  }

  if (ctx && Array.isArray(subjects)) {
    ctx.permissionSubjects = subjects.slice();
  }

  return subjects;
}

function contextHasGlobalRankSync(ctx, rankName) {
  const subjects = getLocalPermissionSubjects(ctx);
  return subjectsHaveAtLeastRank(subjects, rankName);
}

async function contextHasGlobalRank(ctx, rankName) {
  const subjects = await getPermissionSubjectsForContext(ctx);
  return subjectsHaveAtLeastRank(subjects, rankName);
}

function matchesAccessRule(ctx, rule) {
  if (!rule) return false;

  if (rule.public) return true;

  if (rule.globalRank) {
    return contextHasGlobalRankSync(ctx, rule.globalRank);
  }

  if (rule.channelMode) {
    return hasChannelMode(ctx, rule.channelMode);
  }

  if (rule.privateOnly) {
    return !!ctx?.isPrivate;
  }

  if (rule.channelOnly) {
    return !ctx?.isPrivate;
  }

  if (Array.isArray(rule.anyOf)) {
    return rule.anyOf.some(item => matchesAccessRule(ctx, item));
  }

  if (Array.isArray(rule.allOf)) {
    return rule.allOf.every(item => matchesAccessRule(ctx, item));
  }

  return false;
}

async function matchesAccessRuleAsync(ctx, rule) {
  if (!rule) return false;

  if (rule.public) return true;

  if (rule.globalRank) {
    return contextHasGlobalRank(ctx, rule.globalRank);
  }

  if (rule.channelMode) {
    return hasChannelMode(ctx, rule.channelMode);
  }

  if (rule.privateOnly) {
    return !!ctx?.isPrivate;
  }

  if (rule.channelOnly) {
    return !ctx?.isPrivate;
  }

  if (Array.isArray(rule.anyOf)) {
    for (const item of rule.anyOf) {
      if (await matchesAccessRuleAsync(ctx, item)) {
        return true;
      }
    }
    return false;
  }

  if (Array.isArray(rule.allOf)) {
    for (const item of rule.allOf) {
      if (!(await matchesAccessRuleAsync(ctx, item))) {
        return false;
      }
    }
    return true;
  }

  return false;
}

function canAccess(ctx, access) {
  const effective = access || {
    public: true
  };
  return matchesAccessRule(ctx, effective);
}

async function canAccessAsync(ctx, access) {
  const effective = access || {
    public: true
  };
  return matchesAccessRuleAsync(ctx, effective);
}

function isAdmin(accountOrCtx) {
  const account = typeof accountOrCtx === 'string' ?
    accountOrCtx :
    accountOrCtx?.account;

  return accountHasAtLeastRank(account, 'Admin');
}

module.exports = {
  init: loadPermissions,
  loadPermissions,
  getPermissions,
  savePermissions,
  makeAccountSubject,
  makeDiscordSubject,
  normalizeStoredSubject,
  getRanksForSubject,
  getHighestRankForSubject,
  getRanksForAccount,
  getHighestRank,
  rankLevel,
  subjectHasRank,
  subjectHasAtLeastRank,
  subjectsHaveAtLeastRank,
  accountHasRank,
  accountHasAtLeastRank,
  getPermissionSubjectsForContext,
  canAccess,
  canAccessAsync,
  isAdmin
};
