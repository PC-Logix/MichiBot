'use strict';

const { getDb } = require('../libs/db');

function db() {
  const database = getDb();
  database.exec(`
    CREATE TABLE IF NOT EXISTS TimedBans(
      channel,
      username,
      hostmask,
      expires,
      placedby,
      reason,
      type
    )
  `);

  const columns = new Set(database.prepare('PRAGMA table_info(TimedBans)').all()
    .map(row => String(row.name || '').toLowerCase()));
  if (!columns.has('type')) database.exec('ALTER TABLE TimedBans ADD COLUMN type');
  return database;
}

function parseDuration(input) {
  const source = String(input || '').trim().toLowerCase();
  if (!source) return 0;

  const unitMs = {
    w: 604_800_000,
    d: 86_400_000,
    h: 3_600_000,
    m: 60_000,
    s: 1_000
  };
  let total = 0;
  let consumed = '';
  const pattern = /(\d+)\s*([wdhms])/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    total += Number(match[1]) * unitMs[match[2]];
    consumed += match[0];
  }

  return total > 0 && consumed.replace(/\s/g, '') === source.replace(/\s/g, '') ? total : 0;
}

function formatDuration(milliseconds) {
  let seconds = Math.max(0, Math.ceil(Number(milliseconds || 0) / 1000));
  const parts = [];
  for (const [unit, size] of [['w', 604800], ['d', 86400], ['h', 3600], ['m', 60], ['s', 1]]) {
    const amount = Math.floor(seconds / size);
    if (!amount) continue;
    parts.push(`${amount}${unit}`);
    seconds %= size;
  }
  return parts.join(' ') || '0s';
}

function sendChanServ(ctx, message) {
  const text = String(message || '').trim();
  if (!text) return false;
  if (typeof ctx?.reply === 'function') {
    ctx.reply('chanserv', text);
    return true;
  }
  if (typeof ctx?.client?.say === 'function') {
    ctx.client.say('chanserv', text);
    return true;
  }
  return false;
}

function normalizeType(type) {
  return String(type || '').toLowerCase() === 'quiet' ? 'quiet' : 'ban';
}

function addTimedAction(ctx, {
  type = 'ban',
  channel,
  username,
  hostmask = '',
  duration = '1h',
  placedBy = '',
  reason = ''
} = {}) {
  const actionType = normalizeType(type);
  const targetChannel = String(channel || '').trim();
  const targetNick = String(username || '').trim();
  const durationMs = parseDuration(duration);
  if (!targetChannel || !targetNick) throw new Error('Channel and nick are required.');
  if (!durationMs) throw new Error(`Unable to parse '${duration}'. Use values such as 30m, 2h, or 1d12h.`);

  const expires = Date.now() + durationMs;
  const storedMask = String(hostmask || '').trim() || targetNick;
  db().prepare(`
    INSERT INTO TimedBans(channel, username, hostmask, expires, placedby, reason, type)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(targetChannel, targetNick, storedMask, expires, String(placedBy || ''), String(reason || ''), actionType);

  if (actionType === 'ban') {
    sendChanServ(ctx, `ban ${targetChannel} ${targetNick}`);
    const expiry = new Date(expires).toLocaleString('en-US');
    sendChanServ(ctx, `kick ${targetChannel} ${targetNick} Reason: ${String(reason || '').trim()} | For: ${duration} | Expires: ${expiry}`);
  } else {
    sendChanServ(ctx, `quiet ${targetChannel} ${targetNick}`);
  }

  return {
    channel: targetChannel,
    username: targetNick,
    hostmask: storedMask,
    expires,
    placedBy: String(placedBy || ''),
    reason: String(reason || ''),
    type: actionType
  };
}

function listTimedActions(channel = '') {
  const target = String(channel || '').trim();
  const rows = target ? db().prepare(`
    SELECT rowid AS id, channel, username, hostmask, expires, placedby, reason, type
    FROM TimedBans WHERE LOWER(channel) = LOWER(?)
    ORDER BY expires, rowid
  `).all(target) : db().prepare(`
    SELECT rowid AS id, channel, username, hostmask, expires, placedby, reason, type
    FROM TimedBans ORDER BY expires, rowid
  `).all();
  return rows.map(row => ({
    id: Number(row.id),
    channel: String(row.channel || ''),
    username: String(row.username || ''),
    hostmask: String(row.hostmask || ''),
    expires: Number(row.expires || 0),
    placedBy: String(row.placedby || ''),
    reason: String(row.reason || ''),
    type: normalizeType(row.type)
  }));
}

function expireTimedActions(ctx, now = Date.now()) {
  const expired = db().prepare(`
    SELECT rowid AS id, channel, username, hostmask, expires, placedby, reason, type
    FROM TimedBans WHERE expires <= ?
    ORDER BY expires, rowid
  `).all(Number(now));

  const remove = db().prepare('DELETE FROM TimedBans WHERE rowid = ?');
  let count = 0;
  for (const row of expired) {
    const action = normalizeType(row.type);
    const target = String(row.hostmask || row.username || '').trim();
    if (!sendChanServ(ctx, `${action === 'ban' ? 'unban' : 'unquiet'} ${row.channel} ${target}`)) continue;
    remove.run(row.id);
    count += 1;
  }
  return count;
}

module.exports = {
  addTimedAction,
  ensureSchema: db,
  expireTimedActions,
  formatDuration,
  listTimedActions,
  parseDuration,
  sendChanServ
};
