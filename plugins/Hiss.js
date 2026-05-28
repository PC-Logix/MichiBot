'use strict';
const {
  say,
  text
} = require('../utils/helper');
module.exports = {
  name: 'Hiss',
  commands: [{ name: 'hiss', aliases: ['snake', 'snek'] }],
  init() {
    console.log('[Hiss] initialized');
  },
  async handleCommand(ctx) {
    const s = text(ctx);
    say(ctx, s ? s.replace(/s/g, 'ss').replace(/S/g, 'SS') : 'Snek?');
  }
};
