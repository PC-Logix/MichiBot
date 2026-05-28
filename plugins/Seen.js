'use strict';

const {
  getDb
} = require('../libs/db');
const {
  say,
  text
} = require('../utils/helper');

function db() {
  const d = getDb();
  d.exec(`
    CREATE TABLE IF NOT EXISTS LastSeen(
      user PRIMARY KEY,
      timestamp,
      doing DEFAULT NULL
    );
  `);
  return d;
}

function age(ts) {
  let delta = Math.max(0, Date.now() - Number(ts || 0));
  const parts = [];

  const days = Math.floor(delta / 86400000);
  if (days) {
    parts.push(`${days}d`);
    delta %= 86400000;
  }

  const hours = Math.floor(delta / 3600000);
  if (hours) {
    parts.push(`${hours}h`);
    delta %= 3600000;
  }

  const minutes = Math.floor(delta / 60000);
  if (minutes) {
    parts.push(`${minutes}m`);
    delta %= 60000;
  }

  const seconds = Math.floor(delta / 1000);
  if (seconds || !parts.length) parts.push(`${seconds}s`);

  return `${parts.join(' ')} ago`;
}

function updateSeen(nick, doing) {
  if (!nick) return;

  db().prepare(`
    REPLACE INTO LastSeen(user, timestamp, doing)
    VALUES (?, ?, ?)
  `).run(String(nick).toLowerCase(), Date.now(), doing || null);
}

module.exports = {
  name: 'Seen',
  commands: ['seen'],

  init() {
    db();
    console.log('[Seen] initialized using legacy LastSeen table');
  },

  async onMessage(ctx) {
    if (!ctx.nick || !ctx.text) return;
    updateSeen(ctx.nick, `Saying: ${ctx.text}`);
  },

  async handleCommand(ctx) {
    const who = text(ctx).split(/\s+/)[0];
    if (!who) return say(ctx, `Usage: ${ctx.prefix}seen <nick>`);

    const row = db().prepare(`
      SELECT user, timestamp, doing
      FROM LastSeen
      WHERE LOWER(user) = ?
      ORDER BY timestamp DESC
      LIMIT 1
    `).get(who.toLowerCase());

    if (!row) return say(ctx, `${who} has not been seen`);

    const doing = row.doing == null || row.doing === '' ? 'No Record' : String(row.doing);
    return say(ctx, `${who} was last seen ${age(row.timestamp)}. ${doing}`);
  }
};
