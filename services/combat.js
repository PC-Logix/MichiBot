'use strict';

const { randInt } = require('../utils/helper');
const { ItemBonusCollection } = require('./itemBonuses');

const REACTION_TIME_MINUTES = 5;
const REACTION_TIME_MS = REACTION_TIME_MINUTES * 60 * 1000;

const EVENT_TYPES = Object.freeze({
  ATTACK: Object.freeze({ name: 'attack', baseDc: 12 }),
  PET: Object.freeze({ name: 'pet', baseDc: 8 }),
  POTION: Object.freeze({ name: 'potion', baseDc: 14 }),
  MISC: Object.freeze({ name: 'misc', baseDc: 10 }),
  FLING: Object.freeze({ name: 'fling', baseDc: 10 })
});

const pendingEvents = [];
let scheduler = null;

function cleanNick(value) {
  return String(value ?? '')
    .replace(/\u200b/g, '')
    .replace(/^@/, '')
    .replace(/[\x00-\x1f\x7f-\x9f]/g, '');
}

function normalizeEventType(type) {
  if (type && typeof type === 'object' && Number.isFinite(Number(type.baseDc))) return type;
  const key = String(type || '').trim().toUpperCase();
  return EVENT_TYPES[key] || EVENT_TYPES.MISC;
}

function getReactionTimeString() {
  return `${REACTION_TIME_MINUTES} minute${REACTION_TIME_MINUTES === 1 ? '' : 's'}`;
}

function addEvent({
  triggeringUser,
  targetUser,
  target,
  damage = 0,
  implement = '',
  type = EVENT_TYPES.MISC,
  result = '',
  createdAt = Date.now()
}) {
  const event = {
    triggeringUser: cleanNick(triggeringUser),
    targetUser: cleanNick(targetUser).toLowerCase(),
    target: String(target || ''),
    createdAt: Number(createdAt || Date.now()),
    damage: Number(damage || 0),
    implement: String(implement || ''),
    type: normalizeEventType(type),
    result: String(result || '')
  };
  pendingEvents.push(event);
  return event;
}

function getEventsFor(user) {
  const nick = cleanNick(user).toLowerCase();
  return pendingEvents.filter(event => event.targetUser === nick);
}

function removeEvent(event) {
  const index = pendingEvents.indexOf(event);
  if (index < 0) return false;
  pendingEvents.splice(index, 1);
  return true;
}

function takeFirstEventFor(user) {
  const event = getEventsFor(user)[0] || null;
  if (event) removeEvent(event);
  return event;
}

function flushExpired(send, now = Date.now()) {
  const expired = [];
  for (const event of pendingEvents.slice()) {
    if (Number(now) <= event.createdAt + REACTION_TIME_MS) continue;
    try {
      send(event);
      expired.push(event);
    } catch (_) {
      // Match the old queue: a failed send leaves the event for the next pass.
    }
  }
  for (const event of expired) removeEvent(event);
  return expired.length;
}

function startScheduler(send, { intervalMs = 5000 } = {}) {
  stopScheduler();
  scheduler = setInterval(() => flushExpired(send), Math.max(1, Number(intervalMs || 5000)));
  if (typeof scheduler.unref === 'function') scheduler.unref();
  return scheduler;
}

function stopScheduler() {
  if (!scheduler) return false;
  clearInterval(scheduler);
  scheduler = null;
  return true;
}

function getPendingEvents() {
  return pendingEvents.slice();
}

function clearEvents() {
  pendingEvents.splice(0, pendingEvents.length);
}

function rollDiceResult(diceAmount, diceSize, bonus = new ItemBonusCollection(), minValue = 0) {
  const amount = Math.max(0, Math.floor(Number(diceAmount || 0)));
  const size = Math.max(0, Math.floor(Number(diceSize || 0)));
  let rollResult = 0;
  for (let i = 0; i < amount; i += 1) rollResult += randInt(1, size);

  const result = {
    rollResult,
    bonus,
    minValue: Number(minValue || 0),
    diceAmount: amount,
    diceSize: size,
    getTotal() {
      return Math.max(this.minValue, this.rollResult + this.bonus.getTotal());
    },
    getResultString(printBonus = true) {
      if (!this.diceAmount || !this.diceSize) return null;
      if (this.bonus.size() > 0 && printBonus) {
        return `${this.diceAmount}d${this.diceSize} => ${this.rollResult} (${this.bonus}) => ${this.getTotal()}`;
      }
      return `${this.diceAmount}d${this.diceSize} => ${this.getTotal()}`;
    }
  };
  return result;
}

function getNumberPrefix(number) {
  return [8, 11, 18].includes(Number(number)) ? 'an' : 'a';
}

function canInteractWith(target, botNick = '') {
  const value = String(target || '').toLowerCase();
  const ourNick = String(botNick || '').toLowerCase();
  if (ourNick && value.includes(ourNick)) return false;
  return !new Set([
    'me', 'herself', 'himself', 'itself', 'themself', 'themselves', 'themselfs'
  ]).has(value);
}

module.exports = {
  REACTION_TIME_MINUTES,
  REACTION_TIME_MS,
  EVENT_TYPES,
  addEvent,
  canInteractWith,
  cleanNick,
  clearEvents,
  flushExpired,
  getEventsFor,
  getNumberPrefix,
  getPendingEvents,
  getReactionTimeString,
  removeEvent,
  rollDiceResult,
  startScheduler,
  stopScheduler,
  takeFirstEventFor
};
