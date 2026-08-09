'use strict';
const inventory = require('../services/inventory');
const {
  addressedSay,
  randInt
} = require('../utils/helper');
module.exports = {
  name: 'WhatIsLove',
  commands: [{ name: 'whatislove', aliases: ['loveis'] }],
  init() {
    inventory.ensureSchema();
    console.log('[WhatIsLove] initialized');
  },
  async handleCommand(ctx) {
    const first = inventory.getRandomItem(true);
    if (!first) return addressedSay(ctx, 'Love is... nothing!');
    if (randInt(0, 100) < 25) {
      const second = inventory.getRandomItem(false);
      if (second) return addressedSay(ctx, `Love is... ${first.getName()}, with ${second.getName()} on top!`);
    }
    return addressedSay(ctx, `Love is... ${first.getName()}!`);
  }
};
