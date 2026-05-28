'use strict';

const {
  getDb
} = require('../libs/db');
const channelState = require('../utils/channelState');
const {
  say
} = require('../utils/helper');

const MAX_PING_AGE_MS = 259200000;
let cleanupTimer = null;

function db() {
  const d = getDb();
  d.exec(`
    CREATE TABLE IF NOT EXISTS Pings(
      id INTEGER PRIMARY KEY,
      whowaspinged,
      whopinged,
      message,
      time,
      channel
    );
  `);
  return d;
}

function usersIn(ctx) {
  return channelState.getUsers ? channelState.getUsers(ctx.to) : [];
}

function cleanupOldPings() {
  db().prepare('DELETE FROM Pings WHERE time <= ?').run(Date.now() - MAX_PING_AGE_MS);
}

function age(ts) {
  const seconds = Math.max(1, Math.floor((Date.now() - Number(ts || 0)) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

module.exports = {
  name: 'WhoPinged',
  commands: ['whopinged', 'clearpings'],

  init() {
    db();
    cleanupOldPings();
    cleanupTimer = setInterval(cleanupOldPings, 3600000);
    if (typeof cleanupTimer.unref === 'function') cleanupTimer.unref();
    console.log('[WhoPinged] initialized using legacy Pings table');
  },

  dispose() {
    if (cleanupTimer) clearInterval(cleanupTimer);
    cleanupTimer = null;
  },

  async onMessage(ctx) {
    if (!ctx.nick || !ctx.text || !ctx.to || ctx.isPrivate) return;

    const users = usersIn(ctx).filter(user => user.toLowerCase() !== ctx.nick.toLowerCase());
    if (!users.length) return;

    const byLower = new Map(users.map(user => [user.toLowerCase(), user]));
    const seen = new Set();

    for (const part of String(ctx.text).split(/\s+/)) {
      const cleaned = part.replace(/^\p{P}+|\p{P}+$/gu, '').toLowerCase();
      const matched = byLower.get(cleaned);
      if (!matched || seen.has(matched.toLowerCase())) continue;
      seen.add(matched.toLowerCase());

      db().prepare(`
        INSERT INTO Pings(whowaspinged, whopinged, message, time, channel)
        VALUES (?, ?, ?, ?, ?)
      `).run(matched, ctx.nick, ctx.text, Date.now(), ctx.to);
    }
  },

  async handleCommand(ctx) {
    if (ctx.command === 'clearpings') {
      const result = db().prepare('DELETE FROM Pings WHERE LOWER(whowaspinged) = ?').run(ctx.nick.toLowerCase());
      return say(ctx, result.changes ? `Ok, cleared ${result.changes} ping${result.changes === 1 ? '' : 's'}.` : 'Ok, no pings to clear.');
    }

    const rows = db().prepare(`
      SELECT id, whopinged, message, time, channel
      FROM Pings
      WHERE LOWER(whowaspinged) = ?
      ORDER BY time DESC
      LIMIT 5
    `).all(ctx.nick.toLowerCase());

    if (!rows.length) return say(ctx, 'No pings! :(');

    return say(ctx, rows.map(row => `${row.channel}: ${row.whopinged} ${age(row.time)}: ${row.message}`).join(' | '));
  }
};
