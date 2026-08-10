'use strict';

const crypto = require('crypto');
const { getDb, tableExists, getDbPath } = require('../libs/db');
const { getHelpMetadata } = require('../libs/helpMetadata');
const storyPacks = require('../services/rpgStory');

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
    { name: 'RPG Guide', href: '/rpg' },
    { name: 'Quotes', href: '/quotes' },
    { name: 'Tonk', href: '/tonk' },
    { name: 'WhoPinged', href: '/whopinged' },
    { name: 'Stats', href: '/stats' },
    { name: 'Inventory', href: '/inventory' },
    { name: 'Potions', href: '/potions' },
    { name: 'Dynamic Commands', href: '/dyncmds' }
  ];
}

function discoveryReward(discovery) {
  const rewards = [];
  if (Array.isArray(discovery.gold)) rewards.push(`${discovery.gold[0]}-${discovery.gold[1]} gold`);
  if (Number(discovery.xp || 0) > 0) rewards.push(`${discovery.xp} XP`);
  if (Number(discovery.heal || 0) > 0) rewards.push(`${discovery.heal} health`);
  return rewards.join(', ') || 'story effect';
}

function getRpgGuide(configuredStory = '') {
  let activeStory = String(configuredStory || storyPacks.configuredStory());
  if (hasTable('RPGWorldSettings')) {
    const selected = db().prepare('SELECT value FROM RPGWorldSettings WHERE key=?').get('activeStory');
    if (selected?.value) activeStory = String(selected.value);
  }

  const stories = storyPacks.listStories().map(id => {
    try {
      const story = storyPacks.loadStory(id);
      const roomEntries = Object.entries(story.rooms);
      return {
        id: story.id,
        title: story.title,
        intro: story.intro,
        mapText: story.mapText,
        active: story.id.toLowerCase() === activeStory.toLowerCase(),
        startRoom: story.rooms[story.startRoom]?.name || story.startRoom,
        roomCount: roomEntries.length,
        enemyCount: Object.keys(story.enemies).length,
        safeRooms: roomEntries.filter(([, room]) => room.safe).map(([, room]) => room.name),
        discoveries: Object.entries(story.discoveries || {}).map(([discoveryId, discovery]) => ({
          id: discoveryId,
          name: discovery.name,
          rooms: roomEntries.filter(([, room]) => (room.discoveries || []).includes(discoveryId)).map(([, room]) => room.name),
          cooldown: formatDuration(Number(discovery.cooldownSeconds) * 1000),
          reward: discoveryReward(discovery)
        }))
      };
    } catch (error) {
      return { id, title: id, active: id.toLowerCase() === activeStory.toLowerCase(), error: error.message };
    }
  });

  return { activeStory, stories };
}

function rpgStatus(health, maxHealth) {
  const percentage = Number(health || 0) / Math.max(1, Number(maxHealth || 1));
  if (percentage < 0) return 'Down';
  if (percentage < 0.25) return 'Mortally wounded';
  if (percentage < 0.5) return 'Wounded';
  if (percentage < 0.75) return 'Hurt';
  if (percentage < 1) return 'Uncomfortable';
  return 'Healthy';
}

function rpgNumber(value) {
  const number = safeNumber(value, 0);
  return Number.isInteger(number) ? String(number) : String(Number(number.toFixed(2)));
}

function getRpgCharacters() {
  if (!hasTable('RPGUsers')) return [];
  const users = db().prepare('SELECT * FROM RPGUsers').all();
  const worldRows = hasTable('RPGWorldState') ? db().prepare('SELECT * FROM RPGWorldState').all() : [];
  const worlds = new Map(worldRows.map(row => [String(row.account || '').toLowerCase(), row]));
  const linkedAccounts = hasTable('IdentityLinks') ? new Set(db().prepare('SELECT ircAccount FROM IdentityLinks').all()
    .map(row => String(row.ircAccount || '').toLowerCase())) : new Set();
  const stories = new Map();
  for (const id of storyPacks.listStories()) {
    try {
      stories.set(id, storyPacks.loadStory(id));
    } catch (_) {
      // A broken custom pack should not hide otherwise valid character data.
    }
  }

  return users.map(user => {
    const account = String(user.account || '');
    const world = worlds.get(account.toLowerCase()) || {};
    const level = Math.max(1, safeNumber(user.level, 1));
    const xp = safeNumber(user.xp, 0);
    const nextXp = level * 2 * 1.25;
    const maxHealth = 20 + Math.floor(level * 0.2);
    const health = safeNumber(user.health, 0);
    const story = stories.get(String(world.story || '').toLowerCase());
    const room = story?.rooms?.[world.room];
    const enemyBase = world.enemy ? story?.enemies?.[world.enemy] : null;
    let enemy = world.enemy ? String(world.enemy) : '';
    if (enemyBase) {
      const enemyLevel = Math.max(safeNumber(enemyBase.level, 1), safeNumber(world.enemyLevel, enemyBase.level));
      const enemyMaxHealth = safeNumber(enemyBase.health, 0) + (Math.max(0, enemyLevel - safeNumber(enemyBase.level, 1)) * 3);
      enemy = `${enemyBase.name} (level ${rpgNumber(enemyLevel)}, ${rpgNumber(world.enemyHealth)}/${rpgNumber(enemyMaxHealth)} HP)`;
    }
    const pending = [
      ['strength', user.gainStrength],
      ['defense', user.gainDefense],
      ['accuracy', user.gainAccuracy],
      ['dodge', user.gainDodge]
    ].filter(([, gain]) => safeNumber(gain, 0) > 0).map(([stat, gain]) => `${stat} +${rpgNumber(gain)}`);

    return {
      name: String(user.userName || '').trim() || '(unnamed character)',
      linked: linkedAccounts.has(account.toLowerCase()),
      level,
      xp: rpgNumber(xp),
      nextXp: rpgNumber(nextXp),
      xpPercent: Math.min(100, Math.max(0, (xp / Math.max(1, nextXp)) * 100)),
      health: rpgNumber(health),
      maxHealth: rpgNumber(maxHealth),
      healthPercent: Math.min(100, Math.max(0, (health / Math.max(1, maxHealth)) * 100)),
      status: rpgStatus(health, maxHealth),
      strength: rpgNumber(user.strength),
      defense: rpgNumber(user.defense),
      accuracy: rpgNumber(user.accuracy),
      dodge: rpgNumber(user.dodge),
      attacks: Math.max(0, safeNumber(user.numAttacks, 0)),
      attacked: Math.max(0, safeNumber(user.numAttacked, 0)),
      deaths: Math.max(0, safeNumber(user.deaths, 0)),
      revives: Math.max(0, safeNumber(user.revives, 0)),
      gold: Math.max(0, safeNumber(world.gold, 0)),
      victories: Math.max(0, safeNumber(world.victories, 0)),
      story: story?.title || (world.story ? String(world.story) : 'Not exploring'),
      room: room?.name || (world.room ? String(world.room) : 'No world position yet'),
      enemy,
      pending
    };
  }).sort((a, b) => b.level - a.level || Number(b.xp) - Number(a.xp) || a.name.localeCompare(b.name));
}

function getRpgWorldStatus(activeStoryId) {
  const id = String(activeStoryId || '').toLowerCase();
  let story;
  try {
    story = storyPacks.loadStory(id);
  } catch (error) {
    return { story: id, title: id, finds: [], error: error.message };
  }

  const rows = hasTable('RPGWorldDiscoveries') ? db().prepare(`
    SELECT room, discovery, availableAt, claimedBy
    FROM RPGWorldDiscoveries WHERE story=? COLLATE NOCASE
  `).all(id) : [];
  const claims = new Map(rows.map(row => [`${String(row.room)}\u0000${String(row.discovery)}`, row]));
  const now = Date.now();
  const finds = [];
  for (const [roomId, room] of Object.entries(story.rooms)) {
    for (const discoveryId of room.discoveries || []) {
      const discovery = story.discoveries[discoveryId];
      const claim = claims.get(`${roomId}\u0000${discoveryId}`);
      const availableAt = safeNumber(claim?.availableAt, 0);
      const available = availableAt <= now;
      finds.push({
        id: discoveryId,
        name: discovery.name,
        room: room.name,
        reward: discoveryReward(discovery),
        available,
        claimedBy: available ? '' : String(claim?.claimedBy || ''),
        returnsIn: available ? '' : formatDuration(availableAt - now)
      });
    }
  }
  return { story: story.id, title: story.title, finds };
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


function normalizeCommandName(value) {
  return String(value || '').trim().toLowerCase();
}

function getDynamicCommandRows() {
  if (!hasTable('Commands')) return [];

  return db().prepare(`
    SELECT command, return_value, help
    FROM Commands
    ORDER BY lower(command) ASC
  `).all().map(row => ({
    name: normalizeCommandName(row.command),
    rawName: row.command,
    rawCommand: row.return_value || '',
    help: row.help || '',
    args: '[Target:string Params:string]',
    access: { public: true },
    extensionKey: 'plugins:DynamicCommands.js',
    aliases: [],
    cooldown: null,
    isDynamic: true
  })).filter(row => row.name);
}

function accessLevel(access) {
  if (!access || access.public) return 0;

  if (typeof access === 'string') {
    const text = access.toLowerCase();
    if (text.includes('admin')) return 3;
    if (text.includes('mod')) return 2;
    if (text.includes('trusted')) return 1;
    return 0;
  }

  if (access.globalRank) {
    const rank = String(access.globalRank).toLowerCase();
    if (rank === 'admin') return 3;
    if (rank === 'moderator' || rank === 'mod') return 2;
    if (rank === 'trusted') return 1;
  }

  if (access.channelMode) return 2;

  if (Array.isArray(access.anyOf) && access.anyOf.length) {
    return Math.min(...access.anyOf.map(accessLevel));
  }

  if (Array.isArray(access.allOf) && access.allOf.length) {
    return Math.max(...access.allOf.map(accessLevel));
  }

  return 0;
}

function accessLabel(access) {
  const level = accessLevel(access);
  if (level >= 3) return 'Admin';
  if (level === 2) return 'Moderator';
  if (level === 1) return 'Trusted';
  return 'Anyone';
}

function normalizePermFilter(value) {
  const text = String(value || 'Anyone').trim().toLowerCase();
  if (text === 'admin') return { label: 'Admin', level: 3 };
  if (text === 'moderator' || text === 'mod') return { label: 'Moderator', level: 2 };
  if (text === 'trusted') return { label: 'Trusted', level: 1 };
  return { label: 'Anyone', level: 0 };
}

function cooldownParts(cooldown) {
  if (!cooldown) return [];

  const seconds = Number(cooldown.seconds || 0) +
    (Number(cooldown.minutes || 0) * 60) +
    (Number(cooldown.hours || 0) * 3600) +
    (Number(cooldown.days || 0) * 86400);

  if (seconds > 0) {
    return [`Cooldown: ${formatDuration(seconds * 1000).replace(/\s+/g, ' ')}`];
  }

  if (cooldown.key) return ['Cooldown: shared'];
  return [];
}

function commandAliases(commandName, aliasRegistry, prefix) {
  if (!aliasRegistry || typeof aliasRegistry.values !== 'function') return [];

  const targetName = normalizeCommandName(commandName);
  const aliases = [];

  for (const alias of aliasRegistry.values()) {
    if (alias.hidden) continue;
    if (normalizeCommandName(alias.target) !== targetName) continue;

    const defaultArgs = Array.isArray(alias.defaultArgs) ? alias.defaultArgs : [];
    aliases.push({
      name: alias.name,
      usage: `${prefix}${alias.name}`,
      target: alias.target,
      defaultArgs,
      display: `${prefix}${alias.name}${defaultArgs.length ? ` → ${prefix}${alias.target} ${defaultArgs.join(' ')}` : ''}`
    });
  }

  return aliases.sort((a, b) => a.name.localeCompare(b.name));
}

function buildHelpRow(info, prefix, aliasRegistry, options = {}) {
  const name = normalizeCommandName(info.name || info.rawName);
  const meta = getHelpMetadata(name) || {};
  const aliases = options.aliases || commandAliases(name, aliasRegistry, prefix);
  const access = info.access || { public: true };
  const permission = accessLabel(access);
  const extra = [`Permission: ${permission}`].concat(cooldownParts(info.cooldown || null));

  let help = String(info.help || meta.help || '').trim();
  if (!help && options.rawCommand) {
    help = 'No description, raw command:';
  }

  return {
    name,
    usage: `${prefix}${name}`,
    help,
    args: info.args || info.arguments || meta.args || '',
    access,
    accessLabel: permission,
    accessLevel: accessLevel(access),
    extra,
    cooldown: info.cooldown || null,
    extensionKey: info.extensionKey || '',
    aliases,
    rawCommand: options.rawCommand || '',
    isDynamic: !!options.isDynamic
  };
}

function getCommandHelp(commandRegistry, prefix, aliasRegistry, options = {}) {
  const permFilter = normalizePermFilter(options.permFilter);
  const dynamicRows = getDynamicCommandRows();
  const dynamicNames = new Set(dynamicRows.map(row => row.name));
  const normal = [];

  if (commandRegistry && typeof commandRegistry.values === 'function') {
    for (const info of commandRegistry.values()) {
      if (info.hidden) continue;

      const name = normalizeCommandName(info.name);
      const isRuntimeDynamic = dynamicNames.has(name);
      if (isRuntimeDynamic) continue;

      const row = buildHelpRow(info, prefix, aliasRegistry);
      if (row.accessLevel <= permFilter.level) normal.push(row);
    }
  }

  const dynamic = dynamicRows
    .map(row => buildHelpRow(row, prefix, aliasRegistry, {
      rawCommand: row.rawCommand,
      isDynamic: true,
      aliases: []
    }))
    .filter(row => row.accessLevel <= permFilter.level);

  normal.sort((a, b) => a.name.localeCompare(b.name));
  dynamic.sort((a, b) => a.name.localeCompare(b.name));

  return {
    normal,
    dynamic,
    permFilter,
    total: normal.length + dynamic.length
  };
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
  getRpgGuide,
  getRpgCharacters,
  getRpgWorldStatus,
  getStatsGrouped,
  getStatus,
  getTonkMeta,
  getTonkRows,
  htmlEscape,
  timeAgo
};
