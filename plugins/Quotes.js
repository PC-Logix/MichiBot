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
    CREATE TABLE IF NOT EXISTS Quotes(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user TEXT,
      data TEXT,
      added_by DEFAULT NULL
    );
  `);
  return d;
}

function antiPing(nick) {
  return String(nick || '').replace(/^(.)(.+)$/u, '$1\u200b$2');
}

function quoteLine(row) {
  return `Quote #${row.id}: <${antiPing(row.user)}> ${row.data}`;
}

module.exports = {
  name: 'Quotes',
  commands: [{ name: 'quote', aliases: ['q'] }, 'quotes'],

  init() {
    db();
    console.log('[Quotes] initialized using legacy Quotes table');
  },

  async handleCommand(ctx) {
    const raw = text(ctx).trim();
    const [subRaw, ...rest] = raw.split(/\s+/);
    const sub = String(subRaw || '').toLowerCase();

    if (ctx.command === 'quotes') {
      const count = db().prepare('SELECT COUNT(*) AS c FROM Quotes').get().c;
      return say(ctx, `${count} quote${count === 1 ? '' : 's'} stored.`);
    }

    if (sub === 'add') {
      const target = rest.shift();
      const quote = rest.join(' ').trim();
      if (!target || !quote) return say(ctx, `Usage: ${ctx.prefix}quote add <nick> <quote>`);

      const result = db().prepare(`
        INSERT INTO Quotes(user, data, added_by)
        VALUES (?, ?, ?)
      `).run(target, quote, ctx.nick);

      return say(ctx, `Quote added at id: ${result.lastInsertRowid}`);
    }

    if (sub === 'delete' || sub === 'del') {
      const id = Number(String(rest[0] || '').replace(/^#/, ''));
      if (!id) return say(ctx, `Usage: ${ctx.prefix}quote ${sub} <id>`);

      const result = db().prepare('DELETE FROM Quotes WHERE id = ?').run(id);
      return say(ctx, result.changes ? 'Quote removed.' : `No quote found for id #${id}`);
    }

    if (sub === 'list') {
      const target = rest.join(' ').trim();
      if (!target) return say(ctx, `Usage: ${ctx.prefix}quote list <nick>`);

      const rows = db().prepare(`
        SELECT id
        FROM Quotes
        WHERE LOWER(user) = ?
        ORDER BY id
      `).all(target.toLowerCase());

      if (!rows.length) return say(ctx, `No quotes found for user '${antiPing(target)}'`);
      return say(ctx, `User <${antiPing(target)}> has ${rows.length} quotes: ${rows.map(r => r.id).join(', ')}`);
    }

    let row;

    if (!raw) {
      row = db().prepare('SELECT id, user, data FROM Quotes ORDER BY RANDOM() LIMIT 1').get();
    } else if (raw.startsWith('#') || /^\d+$/.test(raw)) {
      const id = Number(raw.replace(/^#/, ''));
      row = db().prepare('SELECT id, user, data FROM Quotes WHERE id = ? LIMIT 1').get(id);
      if (!row) return say(ctx, `No quote found for id #${id}`);
    } else {
      row = db().prepare(`
        SELECT id, user, data
        FROM Quotes
        WHERE LOWER(user) = ?
        ORDER BY RANDOM()
        LIMIT 1
      `).get(raw.toLowerCase());

      if (!row) return say(ctx, `No quotes found for name '${antiPing(raw)}'`);
    }

    return say(ctx, row ? quoteLine(row) : 'No quotes stored.');
  }
};
