'use strict';

const { getDb } = require('../libs/db');
const { addressedSay, text } = require('../utils/helper');

const ADMIN_IN_CHANNEL = {
  allOf: [
    { channelOnly: true },
    { globalRank: 'Admin' }
  ]
};
const IDLE_CHECK_MS = 60_000;
const MAX_TIMER_MS = 2_147_483_647;

let timer = null;
let ctxBase = null;

function db() {
  const database = getDb();
  database.exec(`
    CREATE TABLE IF NOT EXISTS Announcements(
      channel,
      schedule,
      lastran INTEGER DEFAULT 0,
      title,
      message
    )
  `);

  const columns = new Set(database.prepare('PRAGMA table_info(Announcements)').all().map(row => row.name));
  if (!columns.has('lastran')) database.exec('ALTER TABLE Announcements ADD COLUMN lastran INTEGER DEFAULT 0');
  if (!columns.has('title')) database.exec('ALTER TABLE Announcements ADD COLUMN title');
  if (!columns.has('message')) database.exec('ALTER TABLE Announcements ADD COLUMN message');
  return database;
}

function parseDuration(input) {
  const source = String(input || '').trim().toLowerCase();
  if (!source) return 0;

  let total = 0;
  let consumed = '';
  const pattern = /(\d+)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|week|weeks)/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    const amount = Number(match[1]);
    const unit = match[2][0];
    total += amount * ({
      s: 1_000,
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000,
      w: 604_800_000
    }[unit] || 0);
    consumed += match[0];
  }

  const compactSource = source.replace(/[\s+]/g, '');
  const compactConsumed = consumed.replace(/[\s+]/g, '');
  return total > 0 && compactSource === compactConsumed ? total : 0;
}

function formatDuration(milliseconds) {
  let remaining = Math.max(0, Math.ceil(Number(milliseconds || 0) / 1000));
  const parts = [];
  for (const [unit, size] of [['w', 604800], ['d', 86400], ['h', 3600], ['m', 60], ['s', 1]]) {
    const amount = Math.floor(remaining / size);
    if (!amount) continue;
    parts.push(`${amount}${unit}`);
    remaining %= size;
  }
  return parts.join(' ') || '0s';
}

function normalizeRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    channel: String(row.channel || ''),
    schedule: Math.max(0, Number(row.schedule || 0)),
    lastRan: Math.max(0, Number(row.lastran || 0)),
    title: String(row.title || ''),
    message: String(row.message || '')
  };
}

function getAnnouncements(channel = '') {
  const channelName = String(channel || '').trim();
  const rows = channelName ? db().prepare(`
    SELECT rowid AS id, channel, schedule, lastran, title, message
    FROM Announcements
    WHERE LOWER(channel) = LOWER(?)
    ORDER BY rowid
  `).all(channelName) : db().prepare(`
    SELECT rowid AS id, channel, schedule, lastran, title, message
    FROM Announcements
    ORDER BY LOWER(channel), rowid
  `).all();
  return rows.map(normalizeRow);
}

function addAnnouncement(channel, schedule, title, message, now = Date.now()) {
  const result = db().prepare(`
    INSERT INTO Announcements(channel, schedule, lastran, title, message)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    String(channel || '').trim(),
    Math.max(1, Number(schedule || 0)),
    Number(now),
    String(title || '').trim(),
    String(message || '').trim()
  );
  return normalizeRow(db().prepare(`
    SELECT rowid AS id, channel, schedule, lastran, title, message
    FROM Announcements WHERE rowid = ?
  `).get(result.lastInsertRowid));
}

function removeAnnouncement(channel, identifier) {
  const value = String(identifier || '').trim();
  if (!value) return 0;
  if (/^#?\d+$/.test(value)) {
    return db().prepare(`
      DELETE FROM Announcements
      WHERE rowid = ? AND LOWER(channel) = LOWER(?)
    `).run(Number(value.replace(/^#/, '')), String(channel || '').trim()).changes;
  }
  return db().prepare(`
    DELETE FROM Announcements
    WHERE LOWER(title) = LOWER(?) AND LOWER(channel) = LOWER(?)
  `).run(value, String(channel || '').trim()).changes;
}

function dueAnnouncements(now = Date.now()) {
  return getAnnouncements().filter(row =>
    row.channel && row.message && row.schedule > 0 && Number(now) >= row.lastRan + row.schedule
  );
}

function announcementText(row) {
  return row.title ? `ANNOUNCEMENT [${row.title}]: ${row.message}` : `ANNOUNCEMENT: ${row.message}`;
}

function deliverDue(now = Date.now(), send = null) {
  if (!ctxBase && typeof send !== 'function') return 0;
  const deliver = typeof send === 'function' ? send : (channel, message) => ctxBase.reply(channel, message);
  let delivered = 0;

  for (const row of dueAnnouncements(now)) {
    try {
      deliver(row.channel, announcementText(row), row);
      db().prepare('UPDATE Announcements SET lastran = ? WHERE rowid = ?').run(Number(now), row.id);
      delivered += 1;
    } catch (_) {
      // Leave lastran untouched so a transient send failure can retry.
    }
  }
  return delivered;
}

function nextDelay(now = Date.now()) {
  const rows = getAnnouncements().filter(row => row.schedule > 0 && row.channel && row.message);
  if (!rows.length) return IDLE_CHECK_MS;
  const nextAt = Math.min(...rows.map(row => row.lastRan + row.schedule));
  return Math.max(250, Math.min(nextAt - Number(now), MAX_TIMER_MS));
}

function scheduleNext() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!ctxBase) return;

  deliverDue();
  timer = setTimeout(scheduleNext, nextDelay());
  if (typeof timer.unref === 'function') timer.unref();
}

function parseAdd(raw) {
  const match = String(raw || '').match(/^add\s+(\S+)\s+(\S+)\s+([\s\S]+)$/i);
  if (!match) return null;
  const schedule = parseDuration(match[1]);
  if (!schedule) return null;
  return {
    schedule,
    scheduleText: match[1],
    title: match[2],
    message: match[3].trim()
  };
}

function listMessage(channel, now = Date.now()) {
  const rows = getAnnouncements(channel);
  if (!rows.length) return 'No announcements configured for this channel.';
  return rows.map(row => {
    const next = Math.max(0, row.lastRan + row.schedule - Number(now));
    return `#${row.id} ${row.title || '(untitled)'} every ${formatDuration(row.schedule)} ` +
      `(next in ${formatDuration(next)}): ${row.message}`;
  }).join(' | ');
}

module.exports = {
  name: 'Announcements',
  commands: [{
    name: 'announce',
    access: ADMIN_IN_CHANNEL,
    help: 'Manage repeating announcements for this channel.'
  }],

  init(ctx) {
    ctxBase = ctx;
    db();
    scheduleNext();
    console.log(`[Announcements] initialized with ${getAnnouncements().length} announcement(s)`);
  },

  dispose() {
    if (timer) clearTimeout(timer);
    timer = null;
    ctxBase = null;
  },

  handleCommand(ctx) {
    const raw = text(ctx).trim();
    const channel = ctx.replyTarget || ctx.to;
    const subcommand = String(raw.split(/\s+/, 1)[0] || '').toLowerCase();

    if (subcommand === 'add') {
      const parsed = parseAdd(raw);
      if (!parsed) {
        return addressedSay(ctx, `Usage: ${ctx.prefix}announce add <10m|2h|1d> <title> <message>`);
      }
      const row = addAnnouncement(channel, parsed.schedule, parsed.title, parsed.message);
      scheduleNext();
      return addressedSay(ctx, `Added announcement #${row.id} '${row.title}' every ${formatDuration(row.schedule)}.`);
    }

    if (subcommand === 'list') return addressedSay(ctx, listMessage(channel));

    if (subcommand === 'remove' || subcommand === 'delete' || subcommand === 'del') {
      const identifier = raw.replace(/^\S+\s*/i, '').trim();
      if (!identifier) return addressedSay(ctx, `Usage: ${ctx.prefix}announce remove <id|title>`);
      const removed = removeAnnouncement(channel, identifier);
      scheduleNext();
      return addressedSay(ctx, removed ?
        `Removed ${removed} announcement${removed === 1 ? '' : 's'}.` :
        `No announcement found for '${identifier}'.`);
    }

    if (subcommand === 'reload') {
      scheduleNext();
      return addressedSay(ctx, `Reloaded ${getAnnouncements(channel).length} announcement(s) for this channel.`);
    }

    return addressedSay(ctx, `Usage: ${ctx.prefix}announce <add|list|remove|reload>`);
  },

  _private: {
    ADMIN_IN_CHANNEL,
    IDLE_CHECK_MS,
    addAnnouncement,
    announcementText,
    db,
    deliverDue,
    dueAnnouncements,
    formatDuration,
    getAnnouncements,
    listMessage,
    nextDelay,
    parseAdd,
    parseDuration,
    removeAnnouncement,
    scheduleNext
  }
};
