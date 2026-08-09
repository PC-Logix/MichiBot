'use strict';

const { getDb } = require('../libs/db');
const rpg = require('./rpg');
const storyPacks = require('./rpgStory');

const REST_COOLDOWN_MS = 60 * 1000;

const WORLD_COLUMNS = {
  userName: "STRING DEFAULT ''",
  story: "STRING DEFAULT ''",
  room: "STRING DEFAULT ''",
  enemy: "STRING DEFAULT ''",
  enemyHealth: 'DOUBLE DEFAULT 0',
  enemyLevel: 'INT DEFAULT 0',
  gold: 'INT DEFAULT 0',
  lastRest: 'INT DEFAULT 0',
  victories: 'INT DEFAULT 0'
};

const DIRECTION_ALIASES = Object.freeze({ n: 'north', s: 'south', e: 'east', w: 'west', u: 'up', d: 'down' });

function db() {
  const database = getDb();
  database.exec(`
    CREATE TABLE IF NOT EXISTS RPGWorldState(
      account STRING UNIQUE PRIMARY KEY,
      userName STRING,
      story STRING,
      room STRING,
      enemy STRING,
      enemyHealth DOUBLE,
      enemyLevel INT,
      gold INT,
      lastRest INT,
      victories INT
    );
    CREATE TABLE IF NOT EXISTS RPGWorldSettings(
      key STRING UNIQUE PRIMARY KEY,
      value STRING
    );
  `);
  const existing = new Set(database.prepare('PRAGMA table_info(RPGWorldState)').all()
    .map(row => String(row.name || '').toLowerCase()));
  for (const [name, definition] of Object.entries(WORLD_COLUMNS)) {
    if (!existing.has(name.toLowerCase())) database.exec(`ALTER TABLE RPGWorldState ADD COLUMN ${name} ${definition}`);
  }
  const selected = database.prepare('SELECT value FROM RPGWorldSettings WHERE key=?').get('activeStory');
  const selectedStory = selected?.value || storyPacks.configuredStory();
  storyPacks.loadStory(selectedStory);
  if (!selected) database.prepare('INSERT INTO RPGWorldSettings(key, value) VALUES(?, ?)').run('activeStory', selectedStory);
  return database;
}

function activeStoryId() {
  return String(db().prepare('SELECT value FROM RPGWorldSettings WHERE key=?').get('activeStory')?.value || storyPacks.configuredStory());
}

function activeStory() {
  return storyPacks.loadStory(activeStoryId());
}

function setActiveStory(id) {
  const story = storyPacks.loadStory(id, true);
  db().prepare(`
    INSERT INTO RPGWorldSettings(key, value) VALUES('activeStory', ?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value
  `).run(story.id);
  return story;
}

function reloadActiveStory() {
  return storyPacks.loadStory(activeStoryId(), true);
}

function identity(value) {
  const result = String(value || '').trim();
  if (!result) throw new Error('An authenticated account or nickname is required.');
  return result;
}

function normalizeState(row) {
  if (!row) return null;
  const story = activeStory();
  const sameStory = String(row.story || '').toLowerCase() === story.id;
  return {
    account: String(row.account || ''),
    userName: String(row.userName || row.account || ''),
    story: story.id,
    room: sameStory && story.rooms[row.room] ? row.room : story.startRoom,
    enemy: sameStory && story.enemies[row.enemy] ? row.enemy : '',
    enemyHealth: sameStory ? Number(row.enemyHealth || 0) : 0,
    enemyLevel: sameStory ? Number(row.enemyLevel || 0) : 0,
    gold: Math.max(0, Number(row.gold || 0)),
    lastRest: Number(row.lastRest || 0),
    victories: Number(row.victories || 0)
  };
}

function getState(account, userName = '') {
  const accountName = identity(account);
  const database = db();
  let row = database.prepare('SELECT * FROM RPGWorldState WHERE LOWER(account)=LOWER(?) LIMIT 1').get(accountName);
  if (!row) {
    const state = normalizeState({ account: accountName, userName: userName || accountName });
    database.prepare(`
      INSERT INTO RPGWorldState(account, userName, story, room, enemy, enemyHealth, enemyLevel, gold, lastRest, victories)
      VALUES(@account, @userName, @story, @room, @enemy, @enemyHealth, @enemyLevel, @gold, @lastRest, @victories)
    `).run(state);
    return state;
  }
  const state = normalizeState(row);
  const changedStory = state.story !== String(row.story || '').toLowerCase();
  const changedLocation = state.room !== row.room || state.enemy !== String(row.enemy || '');
  const changedName = userName && state.userName !== String(userName);
  if (changedName) state.userName = String(userName);
  if (changedStory || changedLocation || changedName) saveState(state);
  return state;
}

function saveState(state) {
  const value = normalizeState(state);
  if (!value?.account) throw new Error('RPG world account is required.');
  db().prepare(`
    UPDATE RPGWorldState SET userName=@userName, story=@story, room=@room, enemy=@enemy,
      enemyHealth=@enemyHealth, enemyLevel=@enemyLevel, gold=@gold,
      lastRest=@lastRest, victories=@victories
    WHERE LOWER(account)=LOWER(@account)
  `).run(value);
  Object.assign(state, value);
  return state;
}

function direction(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return DIRECTION_ALIASES[normalized] || normalized;
}

function roomFor(state) {
  const story = activeStory();
  return story.rooms[state.room] || story.rooms[story.startRoom];
}

function enemyFor(state) {
  const story = activeStory();
  if (!state.enemy || !story.enemies[state.enemy]) return null;
  const base = story.enemies[state.enemy];
  const level = Math.max(base.level, Number(state.enemyLevel || base.level));
  const scale = Math.max(0, level - base.level);
  return {
    id: state.enemy,
    name: base.name,
    level,
    maxHealth: base.health + (scale * 3),
    attack: base.attack + Math.floor(scale / 2),
    defense: base.defense + Math.floor(scale / 2),
    accuracy: base.accuracy + Math.floor(scale / 2),
    dodge: base.dodge + Math.floor(scale / 3),
    die: base.die,
    xp: base.xp + scale,
    gold: [base.gold[0] + scale, base.gold[1] + (scale * 2)],
    encounterText: base.encounterText || '',
    victoryText: base.victoryText || ''
  };
}

function look(state) {
  const room = roomFor(state);
  const exits = Object.keys(room.exits).join(', ');
  const enemy = enemyFor(state);
  const danger = enemy ? ` ${enemy.name} (level ${enemy.level}, ${state.enemyHealth}/${enemy.maxHealth} HP) blocks your way!` : '';
  return `${room.name}: ${room.description} Exits: ${exits}.${danger}`;
}

function move(state, requestedDirection) {
  if (enemyFor(state)) return { ok: false, message: 'You cannot leave while an enemy blocks the way. Attack it or flee.' };
  const requested = direction(requestedDirection);
  const destination = roomFor(state).exits[requested];
  if (!destination) return { ok: false, message: `You cannot go ${requested || 'that way'}. Exits: ${Object.keys(roomFor(state).exits).join(', ')}.` };
  state.room = destination;
  saveState(state);
  return { ok: true, message: look(state) };
}

function randomIndex(length, random) {
  return Math.min(length - 1, Math.max(0, Math.floor(random() * length)));
}

function roll(sides, random) {
  return randomIndex(sides, random) + 1;
}

function explore(state, character, random = Math.random) {
  const existing = enemyFor(state);
  if (existing) return { ok: false, message: `${existing.name} is already waiting for you. It has ${state.enemyHealth}/${existing.maxHealth} HP.` };
  const room = roomFor(state);
  if (!room.encounters?.length) return { ok: false, message: 'This place is safe. There is nothing here to fight.' };
  const enemyId = room.encounters[randomIndex(room.encounters.length, random)];
  const base = activeStory().enemies[enemyId];
  const levelVariance = randomIndex(3, random) - 1;
  state.enemy = enemyId;
  state.enemyLevel = Math.max(base.level, Number(character.level || 1) + levelVariance);
  const enemy = enemyFor(state);
  state.enemyHealth = enemy.maxHealth;
  saveState(state);
  const introduction = enemy.encounterText ? `${enemy.encounterText} ` : '';
  return { ok: true, enemy, message: `${introduction}You face a ${enemy.name} (level ${enemy.level}, ${enemy.maxHealth} HP).` };
}

function clearEnemy(state) {
  state.enemy = '';
  state.enemyHealth = 0;
  state.enemyLevel = 0;
}

function enemyTurn(state, character, random, defending = false) {
  const enemy = enemyFor(state);
  if (!enemy) return { message: '', damage: 0, defeated: false };
  character.numAttacked += 1;
  const hitRoll = roll(20, random) + enemy.accuracy;
  const defenseTarget = 10 + Number(character.dodge || 0) + (defending ? 2 : 0);
  if (hitRoll < defenseTarget) return { message: `The ${enemy.name} misses you.`, damage: 0, defeated: false };
  let damage = Math.max(1, roll(enemy.die, random) + enemy.attack - Number(character.defense || 0));
  if (defending) damage = Math.max(1, Math.ceil(damage / 2));
  character.health -= damage;
  return { message: `The ${enemy.name} hits you for ${damage} damage.`, damage, defeated: character.health <= 0 };
}

function defeat(state, character) {
  const lostGold = Math.floor(state.gold / 2);
  const story = activeStory();
  state.gold -= lostGold;
  state.room = story.startRoom;
  clearEnemy(state);
  character.deaths += 1;
  character.health = rpg.maxHealth(character);
  rpg.saveCharacter(character);
  saveState(state);
  return `You wake at ${story.rooms[story.startRoom].name} with full health${lostGold ? ` and ${lostGold} less gold` : ''}.`;
}

function attack(state, character, random = Math.random) {
  const enemy = enemyFor(state);
  if (!enemy) return { ok: false, messages: ['There is nothing here to attack. Try exploring.'] };
  character.numAttacks += 1;
  const messages = [];
  const hitRoll = roll(20, random) + Number(character.accuracy || 0);
  if (hitRoll >= 10 + enemy.dodge) {
    const damage = Math.max(1, roll(6, random) + Number(character.strength || 0) - enemy.defense);
    state.enemyHealth -= damage;
    messages.push(`You hit the ${enemy.name} for ${damage} damage.`);
  } else {
    messages.push(`You miss the ${enemy.name}.`);
  }

  if (state.enemyHealth <= 0) {
    const gold = enemy.gold[0] + randomIndex((enemy.gold[1] - enemy.gold[0]) + 1, random);
    state.gold += gold;
    state.victories += 1;
    clearEnemy(state);
    const gains = rpg.gainExperience(character, enemy.xp, random);
    saveState(state);
    messages.push(`You defeat it and gain ${enemy.xp} XP and ${gold} gold. You now have ${state.gold} gold.`);
    if (enemy.victoryText) messages.push(enemy.victoryText);
    return { ok: true, victory: true, gains, messages };
  }

  const retaliation = enemyTurn(state, character, random);
  messages.push(retaliation.message);
  if (retaliation.defeated) {
    messages.push(defeat(state, character));
    return { ok: true, defeated: true, messages };
  }
  rpg.saveCharacter(character);
  saveState(state);
  messages.push(`You: ${character.health}/${rpg.maxHealth(character)} HP; ${enemy.name}: ${state.enemyHealth}/${enemy.maxHealth} HP.`);
  return { ok: true, messages };
}

function defend(state, character, random = Math.random) {
  const enemy = enemyFor(state);
  if (!enemy) return { ok: false, messages: ['There is nothing here to defend against.'] };
  const messages = ['You brace for the next attack.'];
  const retaliation = enemyTurn(state, character, random, true);
  messages.push(retaliation.message);
  if (retaliation.defeated) {
    messages.push(defeat(state, character));
    return { ok: true, defeated: true, messages };
  }
  rpg.saveCharacter(character);
  messages.push(`You have ${character.health}/${rpg.maxHealth(character)} HP.`);
  return { ok: true, messages };
}

function flee(state, character, requestedDirection = '', random = Math.random) {
  const enemy = enemyFor(state);
  if (!enemy) return { ok: false, messages: ['There is nothing to flee from.'] };
  const exits = Object.keys(roomFor(state).exits);
  const chosen = requestedDirection ? direction(requestedDirection) : exits[randomIndex(exits.length, random)];
  if (!roomFor(state).exits[chosen]) return { ok: false, messages: [`You cannot flee ${chosen || 'that way'}. Exits: ${exits.join(', ')}.`] };
  const messages = [];
  if (roll(20, random) + Number(character.dodge || 0) >= 10 + enemy.accuracy) {
    clearEnemy(state);
    state.room = roomFor(state).exits[chosen];
    saveState(state);
    messages.push(`You escape ${chosen}. ${look(state)}`);
    return { ok: true, escaped: true, messages };
  }
  messages.push(`The ${enemy.name} cuts off your escape.`);
  const retaliation = enemyTurn(state, character, random);
  messages.push(retaliation.message);
  if (retaliation.defeated) {
    messages.push(defeat(state, character));
    return { ok: true, defeated: true, messages };
  }
  rpg.saveCharacter(character);
  messages.push(`You have ${character.health}/${rpg.maxHealth(character)} HP.`);
  return { ok: true, escaped: false, messages };
}

function rest(state, character, now = Date.now()) {
  if (enemyFor(state)) return { ok: false, message: 'You cannot rest during a fight.' };
  if (!roomFor(state).safe) return { ok: false, message: 'This place is not safe enough to rest.' };
  if (character.health >= rpg.maxHealth(character)) return { ok: false, message: 'You are already fully rested.' };
  const remaining = REST_COOLDOWN_MS - (now - state.lastRest);
  if (remaining > 0) return { ok: false, message: `You can rest again in ${Math.ceil(remaining / 1000)} seconds.` };
  character.health = rpg.maxHealth(character);
  state.lastRest = now;
  rpg.saveCharacter(character);
  saveState(state);
  return { ok: true, message: `You rest and recover to ${character.health}/${rpg.maxHealth(character)} HP.` };
}

function playersInRoom(state) {
  return db().prepare(`
    SELECT userName FROM RPGWorldState
    WHERE story=? AND room=? AND LOWER(account)<>LOWER(?)
    ORDER BY LOWER(userName), userName
  `).all(state.story, state.room, state.account).map(row => String(row.userName || '')).filter(Boolean);
}

function mapText() {
  return activeStory().mapText;
}

module.exports = {
  DIRECTION_ALIASES,
  REST_COOLDOWN_MS,
  activeStory,
  activeStoryId,
  attack,
  defend,
  enemyFor,
  ensureSchema: db,
  explore,
  flee,
  getState,
  look,
  mapText,
  move,
  playersInRoom,
  reloadActiveStory,
  rest,
  roomFor,
  saveState,
  setActiveStory,
  storyPacks
};
