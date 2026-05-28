'use strict';
const {
  say,
  shuffle,
  text
} = require('../utils/helper');
module.exports = {
  name: 'Jumble',
  commands: [{ name: 'jumble', aliases: ['yoda'] }],
  init() {
    console.log('[Jumble] initialized');
  },
  async handleCommand(ctx) {
    say(ctx, shuffle(text(ctx).split(/\s+/).filter(Boolean)).join(' '));
  }
};
