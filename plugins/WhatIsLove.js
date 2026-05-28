'use strict';
const {
  pick,
  randomItem,
  say
} = require('../utils/helper');
module.exports = {
  name: 'WhatIsLove',
  commands: [{ name: 'whatislove', aliases: ['loveis'] }],
  init() {
    console.log('[WhatIsLove] initialized');
  },
  async handleCommand(ctx) {
    say(ctx, `Love is... ${randomItem()}${Math.random()<0.25 ? `, with ${randomItem()} on top!` : '!'}`);
  }
};
