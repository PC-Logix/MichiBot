'use strict';
const {
  say,
  text
} = require('../utils/helper');
module.exports = {
  name: 'NickLen',
  commands: ['nicklen'],
  init() {
    console.log('[NickLen] initialized');
  },
  async handleCommand(ctx) {
    const nick = text(ctx) || ctx.nick;
    say(ctx, `${nick}: ${Array.from(nick).length} character${Array.from(nick).length===1?'':'s'}.`);
  }
};
