'use strict';

const crypto = require('crypto');
const { getDb, tableExists, getDbPath } = require('../libs/db');

function db() {
  return getDb();
}

function hasTable(name) {
  return tableExists(db(), name);
}

function htmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatDuration(ms) {
  let remaining = Math.max(0, Math.floor(safeNumber(ms, 0)));
  const days = Math.floor(remaining / 86400000);
  remaining %= 86400000;
  const hours = Math.floor(remaining / 3600000);
  remaining %= 3600000;
  const minutes = Math.floor(remaining / 60000);
  remaining %= 60000;
  const seconds = Math.floor(remaining / 1000);

  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (seconds || !parts.length) parts.push(`${seconds}s`);
  return parts.join(' ');
}

function timeAgo(timestamp) {
  const ts = safeNumber(timestamp, 0);
  if (!ts) return 'unknown';
  return `${formatDuration(Date.now() - ts)} ago`;
}

function formatDate(timestamp) {
  const ts = safeNumber(timestamp, 0);
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleString();
  } catch (_) {
    return String(timestamp);
  }
}

function displayTonkPoints(points) {
  const value = safeNumber(points, 0) / 1000;
  return Number(value.toFixed(8)).toString();
}

function getTonkVerificationCode() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(((now.getHours() + 11) % 12) + 1).padStart(2, '0');
  return crypto.createHash('md5').update(`${yyyy}-${mm}-${dd} ${hh}`).digest('hex').toUpperCase().slice(0, 5);
}

function getNav() {
  return [
    { name: 'Home', href: '/' },
    { name: 'Help', href: '/help' },
    { name: 'Quotes', href: '/quotes' },
    { name: 'Tonk', href: '/tonk' },
    { name: 'WhoPinged', href: '/whopinged' },
    { name: 'Stats', href: '/stats' },
    { name: 'Inventory', href: '/inventory' },
    { name: 'Potions', href: '/potions' },
    { name: 'Dynamic Commands', href: '/dyncmds' }
  ];
}

function getStatus() {
  const tables = [
    'Quotes',
    'Pings',
    'Statistics',
    'Inventory',
    'JsonData',
    'LastSeen',
    'Tells',
    'Reminders',
    'Commands'
  ];

  return {
    dbPath: getDbPath(),
    tables: tables.map(name => ({ name, exists: hasTable(name) }))
  };
}

function getQuotes({ id, user, q, page = 1, pageSize = 100 } = {}) {
  if (!hasTable('Quotes')) {
    return { rows: [], count: 0, page: 1, pageSize, pages: 1 };
  }

  const where = [];
  const params = [];

  if (id) {
    where.push('id = ?');
    params.push(Number(id));
  }

  if (user) {
    where.push('LOWER(user) = LOWER(?)');
    params.push(String(user));
  }

  if (q) {
    where.push('(LOWER(user) LIKE LOWER(?) OR LOWER(data) LIKE LOWER(?) OR LOWER(COALESCE(added_by, \'\')) LIKE LOWER(?))');
    const needle = `%${String(q)}%`;
    params.push(needle, needle, needle);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const count = db().prepare(`SELECT COUNT(*) AS count FROM Quotes ${whereSql}`).get(...params).count;
  const pages = Math.max(1, Math.ceil(count / pageSize));
  const safePage = Math.min(Math.max(1, Number(page) || 1), pages);
  const offset = (safePage - 1) * pageSize;

  const rows = db().prepare(`
    SELECT id, user, data, added_by
    FROM Quotes
    ${whereSql}
    ORDER BY id DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset);

  return { rows, count, page: safePage, pageSize, pages };
}

function getTonkRows() {
  if (!hasTable('JsonData')) return [];

  return db().prepare(`
    SELECT substr(mykey, ?) AS nick, CAST(store AS REAL) AS raw_points
    FROM JsonData
    WHERE mykey LIKE ?
    ORDER BY CAST(store AS REAL) DESC, lower(substr(mykey, ?)) ASC
  `).all('tonkrecord'.length + 2, 'tonkrecord_%', 'tonkrecord'.length + 2)
    .map((row, index) => ({
      rank: index + 1,
      nick: row.nick,
      rawPoints: safeNumber(row.raw_points, 0),
      points: displayTonkPoints(row.raw_points)
    }));
}

function getTonkMeta(prefix) {
  if (!hasTable('JsonData')) {
    return {
      currentRecord: null,
      lastTonk: null,
      verificationCode: getTonkVerificationCode(),
      prefix
    };
  }

  const record = db().prepare('SELECT store FROM JsonData WHERE mykey = ?').get('tonkrecord');
  const last = db().prepare('SELECT store FROM JsonData WHERE mykey = ?').get('lasttonk');
  let currentRecord = null;

  if (record?.store) {
    const parts = String(record.store).split(';');
    currentRecord = {
      durationMs: safeNumber(parts[0], 0),
      duration: formatDuration(parts[0]),
      holder: parts.slice(1).join(';') || ''
    };
  }

  return {
    currentRecord,
    lastTonk: last?.store ? { timestamp: safeNumber(last.store, 0), age: timeAgo(last.store), date: formatDate(last.store) } : null,
    verificationCode: getTonkVerificationCode(),
    prefix
  };
}

function getPings({ nick, page = 1, pageSize = 100 } = {}) {
  if (!hasTable('Pings')) {
    return { rows: [], count: 0, page: 1, pageSize, pages: 1 };
  }

  const where = [];
  const params = [];

  if (nick) {
    where.push('LOWER(whowaspinged) = LOWER(?)');
    params.push(String(nick));
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const count = db().prepare(`SELECT COUNT(*) AS count FROM Pings ${whereSql}`).get(...params).count;
  const pages = Math.max(1, Math.ceil(count / pageSize));
  const safePage = Math.min(Math.max(1, Number(page) || 1), pages);
  const offset = (safePage - 1) * pageSize;

  const rows = db().prepare(`
    SELECT id, whowaspinged, whopinged, message, time, channel
    FROM Pings
    ${whereSql}
    ORDER BY time DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset)
    .map(row => ({ ...row, ago: timeAgo(row.time), date: formatDate(row.time) }));

  return { rows, count, page: safePage, pageSize, pages };
}

function getStats() {
  if (!hasTable('Statistics')) return [];

  return db().prepare(`
    SELECT COALESCE("group", '(none)') AS stat_group, COALESCE("key", '(none)') AS stat_key, count
    FROM Statistics
    ORDER BY lower(COALESCE("group", '')), CAST(count AS REAL) DESC, lower(COALESCE("key", '')) ASC
  `).all();
}

function getStatsGrouped() {
  const groups = new Map();
  for (const row of getStats()) {
    const group = row.stat_group || '(none)';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(row);
  }
  return Array.from(groups.entries()).map(([name, rows]) => ({ name, rows }));
}

function getInventory({ owner, q, page = 1, pageSize = 100 } = {}) {
  if (!hasTable('Inventory')) {
    return { rows: [], count: 0, page: 1, pageSize, pages: 1 };
  }

  const where = [];
  const params = [];

  if (owner) {
    where.push('LOWER(COALESCE(owner, \'\')) = LOWER(?)');
    params.push(String(owner));
  }

  if (q) {
    where.push('(LOWER(item_name) LIKE LOWER(?) OR LOWER(COALESCE(owner, \'\')) LIKE LOWER(?) OR LOWER(COALESCE(added_by, \'\')) LIKE LOWER(?))');
    const needle = `%${String(q)}%`;
    params.push(needle, needle, needle);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const count = db().prepare(`SELECT COUNT(*) AS count FROM Inventory ${whereSql}`).get(...params).count;
  const pages = Math.max(1, Math.ceil(count / pageSize));
  const safePage = Math.min(Math.max(1, Number(page) || 1), pages);
  const offset = (safePage - 1) * pageSize;

  const rows = db().prepare(`
    SELECT id, item_name, uses_left, is_favourite, added_by, added, owner, cursed
    FROM Inventory
    ${whereSql}
    ORDER BY id DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset)
    .map(row => ({ ...row, addedDate: formatDate(row.added) }));

  return { rows, count, page: safePage, pageSize, pages };
}

function getPotionSummary() {
  const groups = [];

  if (hasTable('Statistics')) {
    const potionStats = db().prepare(`
      SELECT COALESCE("group", '(none)') AS stat_group, COALESCE("key", '(none)') AS stat_key, count
      FROM Statistics
      WHERE LOWER(COALESCE("group", '')) LIKE '%potion%'
      ORDER BY lower(COALESCE("group", '')), CAST(count AS REAL) DESC, lower(COALESCE("key", '')) ASC
    `).all();

    const byGroup = new Map();
    for (const row of potionStats) {
      if (!byGroup.has(row.stat_group)) byGroup.set(row.stat_group, []);
      byGroup.get(row.stat_group).push(row);
    }
    for (const [name, rows] of byGroup) groups.push({ name, rows });
  }

  return groups;
}

function getCommandHelp(commandRegistry, prefix, aliasRegistry) {
  if (!commandRegistry || typeof commandRegistry.values !== 'function') return [];

  const rows = Array.from(commandRegistry.values())
    .filter(info => !info.hidden)
    .map(info => ({
      name: info.name,
      usage: `${prefix}${info.name}`,
      access: info.access || { public: true },
      help: info.help || '',
      extensionKey: info.extensionKey || '',
      isAlias: false,
      target: ''
    }));

  if (aliasRegistry && typeof aliasRegistry.values === 'function') {
    for (const alias of aliasRegistry.values()) {
      if (alias.hidden) continue;

      const target = commandRegistry.get(alias.target);
      if (!target || target.hidden) continue;

      const defaultArgs = Array.isArray(alias.defaultArgs) ? alias.defaultArgs : [];
      const suffix = defaultArgs.length ? ` ${defaultArgs.join(' ')}` : '';

      rows.push({
        name: alias.name,
        usage: `${prefix}${alias.name}`,
        access: target.access || { public: true },
        help: `Alias for ${prefix}${alias.target}${suffix}`,
        extensionKey: alias.extensionKey || '',
        isAlias: true,
        target: alias.target
      });
    }
  }

  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

module.exports = {
  displayTonkPoints,
  formatDate,
  formatDuration,
  getCommandHelp,
  getInventory,
  getNav,
  getPings,
  getPotionSummary,
  getQuotes,
  getStatsGrouped,
  getStatus,
  getTonkMeta,
  getTonkRows,
  htmlEscape,
  timeAgo
};
