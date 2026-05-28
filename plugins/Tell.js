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
    CREATE TABLE IF NOT EXISTS Tells(
      sender,
      rcpt,
      channel,
      message
    );
  `);
  return d;
}

function utcStamp() {
  const d = new Date();
  const month = d.toLocaleString('en-US', {
    month: 'short',
    timeZone: 'UTC'
  });
  const day = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${month} ${day} @ ${hh}:${mm}`;
}

function deliver(ctx) {
  if (!ctx.nick) return;

  const rows = db().prepare(`
    SELECT rowid AS id, sender, channel, message
    FROM Tells
    WHERE LOWER(rcpt) = ?
    ORDER BY rowid
  `).all(ctx.nick.toLowerCase());

  if (!rows.length) return;

  const del = db().prepare('DELETE FROM Tells WHERE rowid = ?');
  for (const row of rows) {
    say(ctx, `${ctx.nick}: ${row.sender} asked me to tell you: ${row.message}`);
    del.run(row.id);
  }
}

module.exports = {
  name: 'Tell',
  commands: ['tell'],

  init() {
    db();
    console.log('[Tell] initialized using legacy Tells table');
  },

  async onMessage(ctx) {
    deliver(ctx);
  },

  async handleCommand(ctx) {
    const raw = text(ctx);
    const match = raw.match(/^(\S+)\s+([\s\S]+)$/);
    if (!match) return say(ctx, `Usage: ${ctx.prefix}tell <nick> <message>`);

    const recipient = match[1].replace(/\s*\p{P}+\s*$/u, '');
    const message = `${match[2].trim()} on ${utcStamp()} UTC`;

    if (!recipient) return say(ctx, `Usage: ${ctx.prefix}tell <nick> <message>`);
    if (recipient.toLowerCase() === String(ctx.nick || '').toLowerCase()) {
      return say(ctx, 'You can tell yourself that.');
    }

    db().prepare(`
      INSERT INTO Tells(sender, rcpt, channel, message)
      VALUES (?, ?, ?, ?)
    `).run(ctx.nick, recipient.toLowerCase(), ctx.replyTarget, message);

    return say(ctx, `${recipient} will be notified of this message when next seen.`);
  }
};
