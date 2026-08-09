'use strict';
const inventory = require('../services/inventory');
const {
  randInt,
  text
} = require('../utils/helper');
const events = ["Inari's lewdness!", 'the existence of wasps!', 'E.T for Atari being terrible!', 'space being cold!',
  'all NaN bugs', 'slow internet speeds', 'the zombie breakout', 'Half-life 3 not being out',
  'the moon not being made of cheese', 'forgetting to feed the tentacle pit', 'that one spoon going missing',
  'whatever that was', 'the thing that just happened', 'doughnuts', 'the next person getting bap\'d'
];
module.exports = {
  name: 'Blame',
  commands: [{ name: 'blame', cooldown: { seconds: 5 } }],
  init() {
    inventory.ensureSchema();
    console.log('[Blame] initialized');
  },
  async handleCommand(ctx) {
    const who = text(ctx) || ctx.nick;
    const roll = randInt(0, Math.floor(events.length * 1.25));
    const randomItem = inventory.getRandomItem(true);
    const event = events[roll] || `adding ${randomItem ? randomItem.getName() : 'nothing'} to the inventory!`;
    ctx.action(ctx.replyTarget, `blames ${who} for ${event}`);
  }
};
