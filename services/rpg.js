'use strict';

const { getDb } = require('../libs/db');

const DEFAULT_ACTIVITY_XP = 0.25;
const DEFAULT_ACTIVITY_COOLDOWN_MS = 60 * 1000;

const CHARACTER_COLUMNS = {
  userName: "STRING DEFAULT ''",
  health: 'DOUBLE DEFAULT 20',
  xp: 'DOUBLE DEFAULT 0',
  level: 'INT DEFAULT 1',
  strength: 'INT DEFAULT 1',
  defense: 'INT DEFAULT 1',
  accuracy: 'INT DEFAULT 1',
  dodge: 'INT DEFAULT 1',
  gainStrength: 'INT DEFAULT 0',
  gainDefense: 'INT DEFAULT 0',
  gainAccuracy: 'INT DEFAULT 0',
  gainDodge: 'INT DEFAULT 0',
  numAttacked: 'INT DEFAULT 0',
  numAttacks: 'INT DEFAULT 0',
  deaths: 'INT DEFAULT 0',
  revives: 'INT DEFAULT 0',
  lastActivityXp: 'INT DEFAULT 0'
};

function db() {
  const database = getDb();
  database.exec(`
    CREATE TABLE IF NOT EXISTS RPGUsers(
      account STRING UNIQUE PRIMARY KEY,
      userName STRING,
      health DOUBLE,
      xp DOUBLE,
      level INT,
      strength INT,
      defense INT,
      accuracy INT,
      dodge INT,
      gainStrength INT,
      gainDefense INT,
      gainAccuracy INT,
      gainDodge INT,
      numAttacked INT,
      numAttacks INT,
      deaths INT,
      revives INT
    )
  `);

  const existing = new Set(database.prepare('PRAGMA table_info(RPGUsers)').all()
    .map(row => String(row.name || '').toLowerCase()));
  for (const [name, definition] of Object.entries(CHARACTER_COLUMNS)) {
    if (!existing.has(name.toLowerCase())) {
      database.exec(`ALTER TABLE RPGUsers ADD COLUMN ${name} ${definition}`);
    }
  }
  return database;
}

function identity(value) {
  const result = String(value || '').trim();
  if (!result) throw new Error('An authenticated account or nickname is required.');
  return result;
}

function defaults(account, userName) {
  return {
    account: identity(account),
    userName: String(userName || account || '').trim(),
    health: 20,
    xp: 0,
    level: 1,
    strength: 1,
    defense: 1,
    accuracy: 1,
    dodge: 1,
    gainStrength: 0,
    gainDefense: 0,
    gainAccuracy: 0,
    gainDodge: 0,
    numAttacked: 0,
    numAttacks: 0,
    deaths: 0,
    revives: 0,
    lastActivityXp: 0
  };
}

function normalizeCharacter(row) {
  if (!row) return null;
  const result = {};
  for (const key of ['account', 'userName']) result[key] = String(row[key] || '');
  for (const key of ['health', 'xp']) result[key] = Number(row[key] || 0);
  for (const key of Object.keys(CHARACTER_COLUMNS).filter(key => !['userName', 'health', 'xp'].includes(key))) {
    result[key] = Number(row[key] || 0);
  }
  return result;
}

function getCharacter(account, userName = '') {
  const accountName = identity(account);
  let row = db().prepare(`
    SELECT * FROM RPGUsers WHERE LOWER(account) = LOWER(?) LIMIT 1
  `).get(accountName);

  if (!row) {
    const character = defaults(accountName, userName);
    db().prepare(`
      INSERT INTO RPGUsers(
        account, userName, health, xp, level, strength, defense, accuracy, dodge,
        gainStrength, gainDefense, gainAccuracy, gainDodge,
        numAttacked, numAttacks, deaths, revives, lastActivityXp
      ) VALUES (
        @account, @userName, @health, @xp, @level, @strength, @defense, @accuracy, @dodge,
        @gainStrength, @gainDefense, @gainAccuracy, @gainDodge,
        @numAttacked, @numAttacks, @deaths, @revives, @lastActivityXp
      )
    `).run(character);
    return character;
  }

  const character = normalizeCharacter(row);
  if (userName && character.userName !== String(userName)) {
    character.userName = String(userName);
    saveCharacter(character);
  }
  return character;
}

function saveCharacter(character) {
  const value = normalizeCharacter(character);
  if (!value?.account) throw new Error('Character account is required.');
  db().prepare(`
    UPDATE RPGUsers SET
      userName=@userName, health=@health, xp=@xp, level=@level,
      strength=@strength, defense=@defense, accuracy=@accuracy, dodge=@dodge,
      gainStrength=@gainStrength, gainDefense=@gainDefense,
      gainAccuracy=@gainAccuracy, gainDodge=@gainDodge,
      numAttacked=@numAttacked, numAttacks=@numAttacks,
      deaths=@deaths, revives=@revives, lastActivityXp=@lastActivityXp
    WHERE LOWER(account)=LOWER(@account)
  `).run(value);
  Object.assign(character, value);
  return character;
}

function maxHealth(character) {
  return 20 + Math.floor(Number(character.level || 1) * 0.2);
}

function nextLevelThreshold(character) {
  return (Number(character.level || 1) * 2) * 1.25;
}

function experienceToNextLevel(character) {
  return nextLevelThreshold(character) - Number(character.xp || 0);
}

function pendingGain(character) {
  return ['gainStrength', 'gainDefense', 'gainAccuracy', 'gainDodge']
    .some(key => Number(character[key] || 0) !== 0);
}

function shouldLevelUp(character) {
  return nextLevelThreshold(character) < Number(character.xp || 0) && !pendingGain(character);
}

function rollD4(random = Math.random) {
  return Math.floor(random() * 4) + 1;
}

function levelUp(character, override = false, random = Math.random) {
  if (!override && !shouldLevelUp(character)) return null;
  character.level += 1;
  character.health = maxHealth(character);
  const gains = {
    strength: rollD4(random),
    defense: rollD4(random),
    accuracy: rollD4(random),
    dodge: rollD4(random)
  };
  character.gainStrength = gains.strength;
  character.gainDefense = gains.defense;
  character.gainAccuracy = gains.accuracy;
  character.gainDodge = gains.dodge;
  saveCharacter(character);
  return gains;
}

function gainExperience(character, amount, random = Math.random) {
  const gain = Number(amount);
  if (!Number.isFinite(gain)) throw new Error('Experience must be numeric.');
  character.xp += gain;
  saveCharacter(character);
  return levelUp(character, false, random);
}

function gainActivityExperience(character, {
  amount = DEFAULT_ACTIVITY_XP,
  cooldownMs = DEFAULT_ACTIVITY_COOLDOWN_MS,
  now = Date.now(),
  random = Math.random
} = {}) {
  const gain = Number(amount);
  const cooldown = Math.max(0, Number(cooldownMs || 0));
  const timestamp = Number(now);
  if (!Number.isFinite(gain) || gain <= 0) throw new Error('Activity experience must be a positive number.');
  if (!Number.isFinite(timestamp)) throw new Error('Activity timestamp must be numeric.');

  const elapsed = timestamp - Number(character.lastActivityXp || 0);
  if (elapsed < cooldown) {
    return { awarded: false, amount: 0, remainingMs: cooldown - elapsed, gains: null };
  }

  character.lastActivityXp = timestamp;
  const gains = gainExperience(character, gain, random);
  return { awarded: true, amount: gain, remainingMs: 0, gains };
}

function applyStatGain(character, stat) {
  const normalized = String(stat || '').toLowerCase();
  const gainKey = {
    strength: 'gainStrength',
    defense: 'gainDefense',
    accuracy: 'gainAccuracy',
    dodge: 'gainDodge'
  }[normalized];
  if (!gainKey) throw new Error(`Unknown RPG stat '${stat}'.`);
  const gain = Number(character[gainKey] || 0);
  if (gain <= 0) return 0;
  character[normalized] += gain;
  character.gainStrength = 0;
  character.gainDefense = 0;
  character.gainAccuracy = 0;
  character.gainDodge = 0;
  saveCharacter(character);
  return gain;
}

function status(character, capitalize = false) {
  const percentage = Number(character.health || 0) / maxHealth(character);
  let value = 'unknown';
  if (percentage < 0) value = 'down';
  else if (percentage < 0.25) value = 'mortally wounded';
  else if (percentage < 0.5) value = 'wounded';
  else if (percentage < 0.75) value = 'hurt';
  else if (percentage < 1) value = 'uncomfortable';
  else if (percentage === 1) value = 'healthy';
  return capitalize ? value[0].toUpperCase() + value.slice(1) : value;
}

function formatNumber(value) {
  const number = Number(value || 0);
  return Number.isInteger(number) ? String(number) : String(number);
}

function summary(character) {
  return `${character.userName} [${formatNumber(character.health)}/${formatNumber(maxHealth(character))}], ` +
    `Level ${character.level}, ${formatNumber(character.xp)} xp out of ${formatNumber(nextLevelThreshold(character))} xp for next level.`;
}

module.exports = {
  DEFAULT_ACTIVITY_COOLDOWN_MS,
  DEFAULT_ACTIVITY_XP,
  applyStatGain,
  ensureSchema: db,
  experienceToNextLevel,
  gainExperience,
  gainActivityExperience,
  getCharacter,
  levelUp,
  maxHealth,
  nextLevelThreshold,
  pendingGain,
  saveCharacter,
  shouldLevelUp,
  status,
  summary
};
