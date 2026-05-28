'use strict';
const {
  say,
  text
} = require('../utils/helper');
module.exports = {
  name: 'Moo',
  commands: ['moo'],
  init() {
    console.log('[Moo] initialized');
  },
  async handleCommand(ctx) {
    let s = text(ctx);
    if (!s) return say(ctx, 'Moo?');
    s = s.replace(/u/g, 'o').replace(/U/g, 'O');
    say(ctx, s.replace(/o/g, 'oo').replace(/O/g, 'OO'));
  }
};
