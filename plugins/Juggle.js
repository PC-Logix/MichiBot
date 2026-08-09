'use strict';

const inventory = require('../services/inventory');
const { IRC_RESET, act, addressedSay, pick, randInt, say } = require('../utils/helper');

const FAIL_RESPONSES = [
  'Oops...',
  'ohno',
  'Not again...',
  'Dammit!',
  '#@%&!!',
  'Fore!',
  'I hope nobody saw that...',
  "I didn't do it!"
];

const SUCCESS_RESPONSES = [
  'Yes!',
  'I did it!',
  'Woo!',
  "I'm awesome!",
  'Take that RNG!',
  'In yo face!',
  'Exactly as planned.'
];

module.exports = {
  name: 'Juggle',
  commands: [{
    name: 'juggle',
    help: 'Juggle with items',
    cooldown: { seconds: 60 }
  }],

  init() {
    inventory.ensureSchema();
    console.log('[Juggle] initialized');
  },

  handleCommand(ctx) {
    const rawAmount = Array.isArray(ctx.args) ? ctx.args[0] : '';
    let itemAmount = rawAmount == null || rawAmount === '' ? 3 : Number.parseInt(rawAmount, 10);
    if (!Number.isFinite(itemAmount)) return addressedSay(ctx, 'Number must be an integer.');
    itemAmount = Math.max(1, Math.min(6, itemAmount));

    const items = inventory.getRandomItems(itemAmount, false);
    if (!items.length) return addressedSay(ctx, "I can't find any items to juggle with.");

    act(ctx, `juggles with ${inventory.formatItemNames(items)}`);
    let dropped = 0;
    for (const item of items) {
      const dropRoll = randInt(0, 100);
      if (dropRoll < (100 * (0.20 + (0.08 * itemAmount)))) {
        dropped += 1;
        const damage = randInt(1, 5);
        const dust = item.damage(damage, true, false, true);
        act(ctx, `drops ${item.getName()}${IRC_RESET} which takes ${damage} damage${dust}`);
      }
    }

    if (dropped > 0) return say(ctx, pick(FAIL_RESPONSES));
    act(ctx, "doesn't drop anything");
    return say(ctx, pick(SUCCESS_RESPONSES));
  }
};
