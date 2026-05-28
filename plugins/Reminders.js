'use strict';

const {
  getDb
} = require('../libs/db');
const {
  say,
  text,
  randInt
} = require('../utils/helper');

let timer = null;
let ctxBase = null;

function db() {
  const d = getDb();
  d.exec(`
    CREATE TABLE IF NOT EXISTS Reminders(
      dest,
      nick,
      time,
      message
    );
  `);
  return d;
}

function parseDuration(input) {
  let s = String(input || '').trim().toLowerCase();
  if (s.startsWith('in')) s = s.replace(/^in\s*/, '').trim();

  if (s === 'later') s = `${randInt(3, 6)}h`;
  else if (s === 'laterish' || s === 'soon' || s === 'soonish') s = `${randInt(2, 4)}h`;
  else if (s === 'eventually') s = `${randInt(6, 100)}h`;
  else if (s === 'tomorrow') s = '24h';
  else if (s === 'whenever') s = `${randInt(100, 200)}h`;
  else if (s === 'a week' || s === 'one week') s = '1w';

  let total = 0;
  const re = /(\d+)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|week|weeks)/g;
  let match;
  let matched = false;

  while ((match = re.exec(s)) !== null) {
    matched = true;
    const n = Number(match[1]);
    const unit = match[2][0];
    total += n * ({
      s: 1000,
      m: 60000,
      h: 3600000,
      d: 86400000,
      w: 604800000
    }[unit] || 0);
  }

  return matched && total > 0 ? total : 0;
}

function formatWait(ms) {
  if (ms < 60000) return `${Math.max(1, Math.ceil(ms / 1000))}s`;
  if (ms < 3600000) return `${Math.ceil(ms / 60000)}m`;
  if (ms < 86400000) return `${Math.ceil(ms / 3600000)}h`;
  return `${Math.ceil(ms / 86400000)}d`;
}

function deliverDue() {
  if (!ctxBase) return;

  const rows = db().prepare(`
    SELECT rowid AS id, dest, nick, time, message
    FROM Reminders
    WHERE time <= ?
    ORDER BY time, rowid
    LIMIT 25
  `).all(Date.now());

  const del = db().prepare('DELETE FROM Reminders WHERE rowid = ?');

  for (const row of rows) {
    const dest = String(row.dest || '').trim();
    if (!dest || dest === 'query') {
      ctxBase.reply(row.nick, `REMINDER: ${row.message}`);
    } else {
      ctxBase.reply(dest, `${row.nick} REMINDER: ${row.message}`);
    }
    del.run(row.id);
  }
}

function scheduleNext() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }

  if (!ctxBase) return;
  deliverDue();

  const row = db().prepare('SELECT time FROM Reminders ORDER BY time ASC LIMIT 1').get();
  const delay = row ? Math.max(250, Math.min(Number(row.time) - Date.now(), 2147483647)) : 60000;

  timer = setTimeout(scheduleNext, delay);
  if (typeof timer.unref === 'function') timer.unref();
}

function parseReminderArgs(ctx, raw) {
  if (ctx.command === 'remindthem') {
    const match = String(raw || '').match(/^(\S+)\s+(\S+(?:\s*\+\s*\S+)*)\s+([\s\S]+)$/i);
    if (!match) return null;
    return {
      target: match[1],
      timeText: match[2],
      message: match[3]
    };
  }

  const match = String(raw || '').match(/^(\S+(?:\s*\+\s*\S+)*)\s+([\s\S]+)$/i);
  if (!match) return null;
  return {
    target: ctx.nick,
    timeText: match[1],
    message: match[2]
  };
}

module.exports = {
  name: 'Reminders',
  commands: [{ name: 'remind', aliases: ['remindme'] }, 'remindthem', 'reminders'],

  init(ctx) {
    ctxBase = ctx;
    db();
    scheduleNext();
    console.log('[Reminders] initialized using legacy Reminders table');
  },

  dispose() {
    if (timer) clearTimeout(timer);
    timer = null;
  },

  async handleCommand(ctx) {
    const raw = text(ctx);

    if (ctx.command === 'reminders') {
      const rows = db().prepare(`
        SELECT rowid AS id, message, time
        FROM Reminders
        WHERE LOWER(nick) = ?
        ORDER BY time
        LIMIT 5
      `).all(ctx.nick.toLowerCase());

      return say(ctx, rows.length ?
        rows.map(row => `#${row.id} in ${formatWait(Number(row.time) - Date.now())}: ${row.message}`).join(' | ') :
        'None. You have no reminders. But did you remember to rotate the fridge?');
    }

    const parsed = parseReminderArgs(ctx, raw);
    if (!parsed) {
      return say(ctx, ctx.command === 'remindthem' ?
        `Usage: ${ctx.prefix}remindthem <nick> <10m|2h|1d> <message>` :
        `Usage: ${ctx.prefix}${ctx.command} <10m|2h|1d> <message>`);
    }

    const duration = parseDuration(parsed.timeText);
    if (!duration) return say(ctx, `Unable to parse "${parsed.timeText}" as a time string.`);

    db().prepare(`
      INSERT INTO Reminders(dest, nick, time, message)
      VALUES (?, ?, ?, ?)
    `).run(ctx.replyTarget, parsed.target, Date.now() + duration, parsed.message.trim());

    scheduleNext();
    return say(ctx, parsed.target === ctx.nick ? `I'll tell you "${parsed.message.trim()}" in ${parsed.timeText}.` : `I'll tell ${parsed.target} "${parsed.message.trim()}" in ${parsed.timeText}.`);
  }
};
