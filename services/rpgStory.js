'use strict';

const fs = require('fs');
const path = require('path');

const STORY_DIRECTORY = path.join(__dirname, '..', 'resources', 'rpg', 'stories');
const DEFAULT_STORY = 'crossroads';
const cache = new Map();

function normalizeId(value) {
  const id = String(value || '').trim().toLowerCase();
  if (!/^[a-z0-9_-]+$/.test(id)) throw new Error('Story IDs may only contain letters, numbers, underscores, and hyphens.');
  return id;
}

function configuredStory() {
  if (process.env.MICHIBOT_RPG_STORY) return normalizeId(process.env.MICHIBOT_RPG_STORY);
  try {
    const config = require('../config.json');
    return normalizeId(config.rpg?.story || DEFAULT_STORY);
  } catch (_) {
    return DEFAULT_STORY;
  }
}

function requireString(value, location) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${location} must be a non-empty string.`);
}

function requireNumber(value, location, minimum = 0) {
  if (!Number.isFinite(value) || value < minimum) throw new Error(`${location} must be a number of at least ${minimum}.`);
}

function validateStory(raw, expectedId) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Story pack root must be an object.');
  const id = normalizeId(raw.id);
  if (id !== expectedId) throw new Error(`Story ID '${id}' does not match filename '${expectedId}.json'.`);
  requireString(raw.title, 'title');
  requireString(raw.intro, 'intro');
  requireString(raw.startRoom, 'startRoom');
  requireString(raw.mapText, 'mapText');
  if (!raw.rooms || typeof raw.rooms !== 'object' || Array.isArray(raw.rooms)) throw new Error('rooms must be an object.');
  if (!raw.enemies || typeof raw.enemies !== 'object' || Array.isArray(raw.enemies)) throw new Error('enemies must be an object.');
  if (raw.discoveries === undefined) raw.discoveries = {};
  if (!raw.discoveries || typeof raw.discoveries !== 'object' || Array.isArray(raw.discoveries)) throw new Error('discoveries must be an object.');
  if (!raw.rooms[raw.startRoom]) throw new Error(`Start room '${raw.startRoom}' does not exist.`);

  for (const [roomId, room] of Object.entries(raw.rooms)) {
    if (!/^[a-z0-9_-]+$/.test(roomId)) throw new Error(`Invalid room ID '${roomId}'.`);
    requireString(room.name, `rooms.${roomId}.name`);
    requireString(room.description, `rooms.${roomId}.description`);
    if (!room.exits || typeof room.exits !== 'object' || Array.isArray(room.exits)) throw new Error(`rooms.${roomId}.exits must be an object.`);
    for (const [direction, destination] of Object.entries(room.exits)) {
      requireString(direction, `rooms.${roomId}.exits direction`);
      if (!raw.rooms[destination]) throw new Error(`Room '${roomId}' exits to missing room '${destination}'.`);
    }
    if (room.encounters !== undefined) {
      if (!Array.isArray(room.encounters)) throw new Error(`rooms.${roomId}.encounters must be an array.`);
      for (const enemyId of room.encounters) {
        if (!raw.enemies[enemyId]) throw new Error(`Room '${roomId}' references missing enemy '${enemyId}'.`);
      }
    }
    if (room.discoveries !== undefined) {
      if (!Array.isArray(room.discoveries)) throw new Error(`rooms.${roomId}.discoveries must be an array.`);
      for (const discoveryId of room.discoveries) {
        if (!raw.discoveries[discoveryId]) throw new Error(`Room '${roomId}' references missing discovery '${discoveryId}'.`);
      }
    }
  }

  for (const [enemyId, enemy] of Object.entries(raw.enemies)) {
    if (!/^[a-z0-9_-]+$/.test(enemyId)) throw new Error(`Invalid enemy ID '${enemyId}'.`);
    requireString(enemy.name, `enemies.${enemyId}.name`);
    if (enemy.encounterText !== undefined) requireString(enemy.encounterText, `enemies.${enemyId}.encounterText`);
    if (enemy.victoryText !== undefined) requireString(enemy.victoryText, `enemies.${enemyId}.victoryText`);
    for (const field of ['level', 'health', 'attack', 'defense', 'accuracy', 'dodge', 'die', 'xp']) {
      requireNumber(enemy[field], `enemies.${enemyId}.${field}`, field === 'die' || field === 'health' || field === 'level' ? 1 : 0);
    }
    if (!Array.isArray(enemy.gold) || enemy.gold.length !== 2) throw new Error(`enemies.${enemyId}.gold must be [minimum, maximum].`);
    requireNumber(enemy.gold[0], `enemies.${enemyId}.gold[0]`);
    requireNumber(enemy.gold[1], `enemies.${enemyId}.gold[1]`, enemy.gold[0]);
  }

  for (const [discoveryId, discovery] of Object.entries(raw.discoveries)) {
    if (!/^[a-z0-9_-]+$/.test(discoveryId)) throw new Error(`Invalid discovery ID '${discoveryId}'.`);
    requireString(discovery.name, `discoveries.${discoveryId}.name`);
    requireString(discovery.foundText, `discoveries.${discoveryId}.foundText`);
    requireNumber(discovery.cooldownSeconds, `discoveries.${discoveryId}.cooldownSeconds`, 1);
    for (const field of ['xp', 'heal']) {
      if (discovery[field] !== undefined) requireNumber(discovery[field], `discoveries.${discoveryId}.${field}`);
    }
    if (discovery.gold !== undefined) {
      if (!Array.isArray(discovery.gold) || discovery.gold.length !== 2) throw new Error(`discoveries.${discoveryId}.gold must be [minimum, maximum].`);
      requireNumber(discovery.gold[0], `discoveries.${discoveryId}.gold[0]`);
      requireNumber(discovery.gold[1], `discoveries.${discoveryId}.gold[1]`, discovery.gold[0]);
    }
  }

  return raw;
}

function storyPath(id) {
  return path.join(STORY_DIRECTORY, `${normalizeId(id)}.json`);
}

function loadStory(id, force = false) {
  const normalized = normalizeId(id);
  if (!force && cache.has(normalized)) return cache.get(normalized);
  const filePath = storyPath(normalized);
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error(`RPG story '${normalized}' was not found in ${STORY_DIRECTORY}.`);
    throw new Error(`Could not load RPG story '${normalized}': ${error.message}`);
  }
  const story = validateStory(raw, normalized);
  cache.set(normalized, story);
  return story;
}

function listStories() {
  if (!fs.existsSync(STORY_DIRECTORY)) return [];
  return fs.readdirSync(STORY_DIRECTORY, { withFileTypes: true })
    .filter(entry => entry.isFile() && /^[a-z0-9_-]+\.json$/i.test(entry.name))
    .map(entry => entry.name.slice(0, -5).toLowerCase())
    .sort();
}

module.exports = {
  DEFAULT_STORY,
  STORY_DIRECTORY,
  configuredStory,
  listStories,
  loadStory,
  normalizeId,
  validateStory
};
