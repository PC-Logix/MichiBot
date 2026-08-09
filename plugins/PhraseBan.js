'use strict';

const { getDb } = require('../libs/db');
const { addressedSay, text } = require('../utils/helper');
const moderation = require('../services/moderation');

const MOD_IN_CHANNEL = {
  allOf: [
    { channelOnly: true },
    { globalRank: 'Moderator' }
  ]
};
const ADMIN_IN_CHANNEL = {
  allOf: [
    { channelOnly: true },
    { globalRank: 'Admin' }
  ]
};
const DEFAULT_DURATION = '48h';
const DURATION_KEY = 'phraseban_duration';

function db() {
  const database = getDb();
  database.exec(`
    CREATE TABLE IF NOT EXISTS BannedPhrases(
      id INTEGER PRIMARY KEY,
      phrase VARCHAR(200),
      channel VARCHAR(200)
    );
    CREATE TABLE IF NOT EXISTS ExemptNicks(
      id INTEGER PRIMARY KEY,
      nick VARCHAR(200),
      channel VARCHAR(200)
    );
    CREATE TABLE IF NOT EXISTS JsonData(
      mykey PRIMARY KEY,
      store
    );
  `);
  return database;
}

function channelClause(column) {
  return `(${column} IS NULL OR TRIM(${column}) = '' OR LOWER(${column}) = LOWER(?))`;
}

function listPhrases(channel) {
  return db().prepare(`
    SELECT id, phrase, channel FROM BannedPhrases
    WHERE ${channelClause('channel')}
    ORDER BY LOWER(phrase), id
  `).all(String(channel || '')).map(row => ({
    id: Number(row.id),
    phrase: String(row.phrase || ''),
    channel: row.channel == null ? '' : String(row.channel)
  })).filter(row => row.phrase);
}

function addPhrase(channel, phrase) {
  const value = String(phrase || '').trim().toLowerCase();
  if (!value) return false;
  const exists = db().prepare(`
    SELECT 1 FROM BannedPhrases
    WHERE LOWER(phrase) = LOWER(?) AND ${channelClause('channel')}
    LIMIT 1
  `).get(value, String(channel || ''));
  if (exists) return false;
  db().prepare('INSERT INTO BannedPhrases(phrase, channel) VALUES (?, ?)')
    .run(value, String(channel || ''));
  return true;
}

function removePhrase(channel, phrase) {
  return db().prepare(`
    DELETE FROM BannedPhrases
    WHERE LOWER(phrase) = LOWER(?) AND ${channelClause('channel')}
  `).run(String(phrase || '').trim(), String(channel || '')).changes;
}

function clearPhrases() {
  return db().prepare('DELETE FROM BannedPhrases').run().changes;
}

function isExempt(channel, nick) {
  return !!db().prepare(`
    SELECT 1 FROM ExemptNicks
    WHERE LOWER(nick) = LOWER(?) AND ${channelClause('channel')}
    LIMIT 1
  `).get(String(nick || ''), String(channel || ''));
}

function addExemption(channel, nick) {
  const value = String(nick || '').trim().toLowerCase();
  if (!value || isExempt(channel, value)) return false;
  db().prepare('INSERT INTO ExemptNicks(nick, channel) VALUES (?, ?)')
    .run(value, String(channel || ''));
  return true;
}

function removeExemption(channel, nick) {
  return db().prepare(`
    DELETE FROM ExemptNicks
    WHERE LOWER(nick) = LOWER(?) AND ${channelClause('channel')}
  `).run(String(nick || '').trim(), String(channel || '')).changes;
}

function getDuration() {
  const row = db().prepare('SELECT store FROM JsonData WHERE LOWER(mykey) = LOWER(?) LIMIT 1')
    .get(DURATION_KEY);
  const value = String(row?.store || '').trim();
  return moderation.parseDuration(value) ? value : DEFAULT_DURATION;
}

function setDuration(value) {
  const duration = String(value || '').trim().toLowerCase();
  if (!moderation.parseDuration(duration)) return false;
  db().prepare('INSERT OR REPLACE INTO JsonData(mykey, store) VALUES (?, ?)')
    .run(DURATION_KEY, duration);
  return true;
}

async function hasAccess(ctx, access) {
  if (!ctx.isBridge && !ctx.account && typeof ctx.bot?.refreshAccount === 'function') {
    ctx.account = await ctx.bot.refreshAccount(ctx.nick);
  }
  return ctx.permissions.canAccessAsync(ctx, access);
}

module.exports = {
  name: 'PhraseBan',
  commands: [{
    name: 'phraseban',
    aliases: ['pb'],
    access: { public: true }
  }],

  init() {
    db();
    moderation.ensureSchema();
    console.log('[PhraseBan] initialized');
  },

  async onMessage(ctx) {
    if (ctx.isPrivate || !ctx.nick || isExempt(ctx.to, ctx.nick)) return;
    if (await hasAccess(ctx, { globalRank: 'Moderator' })) return;

    const message = String(ctx.text || '').toLowerCase();
    const match = listPhrases(ctx.to).find(row => message.includes(row.phrase.toLowerCase()));
    if (!match) return;

    moderation.addTimedAction(ctx, {
      type: 'ban',
      channel: ctx.to,
      username: ctx.nick,
      duration: getDuration(),
      placedBy: 'PhraseBan',
      reason: 'Banned phrase.'
    });
  },

  async handleCommand(ctx) {
    const raw = text(ctx);
    const [subcommand = '', ...parts] = raw.split(/\s+/);
    const action = subcommand.toLowerCase();
    const value = parts.join(' ').trim();
    const channel = ctx.replyTarget || ctx.to;

    if (action === 'list') {
      const phrases = listPhrases(channel).map(row => row.phrase);
      return addressedSay(ctx, `The words: ${phrases.join(', ') || '(none)'}`);
    }

    if (action === 'clear') {
      if (!(await hasAccess(ctx, ADMIN_IN_CHANNEL))) return;
      const count = clearPhrases();
      return addressedSay(ctx, `All banned phrases cleared! (${count})`);
    }

    if (!(await hasAccess(ctx, MOD_IN_CHANNEL))) return;

    if (action === 'add') {
      if (!value) return addressedSay(ctx, `Usage: ${ctx.prefix}phraseban add <phrase>`);
      return addressedSay(ctx, addPhrase(channel, value) ? 'Added phrase to banlist' : 'Phrase already banned.');
    }

    if (action === 'del' || action === 'rem') {
      if (!value) return addressedSay(ctx, `Usage: ${ctx.prefix}phraseban del <phrase>`);
      const removed = removePhrase(channel, value);
      return addressedSay(ctx, removed ? 'Removed phrase from banlist' : 'Phrase was not banned here.');
    }

    if (action === 'exadd') {
      if (!value) return addressedSay(ctx, `Usage: ${ctx.prefix}phraseban exadd <nick>`);
      return addressedSay(ctx, addExemption(channel, value) ? 'Added to exempt list!' : 'Nick already exempt.');
    }

    if (action === 'exdel' || action === 'exrem') {
      if (!value) return addressedSay(ctx, `Usage: ${ctx.prefix}phraseban exdel <nick>`);
      return addressedSay(ctx, removeExemption(channel, value) ? 'Removed from exempt list' : 'Nick was not exempt here.');
    }

    if (action === 'set' && String(parts[0] || '').toLowerCase() === 'duration') {
      const duration = parts.slice(1).join('').trim();
      if (!setDuration(duration)) return addressedSay(ctx, `Invalid duration. Use values such as 30m, 2h, or 1d12h.`);
      return addressedSay(ctx, `Duration updated to ${duration}.`);
    }

    return addressedSay(ctx, `Usage: ${ctx.prefix}phraseban <add|del|list|clear|exadd|exdel|set duration>`);
  },

  _private: {
    ADMIN_IN_CHANNEL,
    DEFAULT_DURATION,
    DURATION_KEY,
    MOD_IN_CHANNEL,
    addExemption,
    addPhrase,
    clearPhrases,
    db,
    getDuration,
    isExempt,
    listPhrases,
    removeExemption,
    removePhrase,
    setDuration
  }
};
