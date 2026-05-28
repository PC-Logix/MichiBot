'use strict';

module.exports = {
  commands: [{ name: 'ping', aliases: ['p'] }],

  init() {
    console.log('[pingpong] initialized');
  },

  dispose() {
    console.log('[pingpong] disposed');
  },

  async handleCommand(ctx) {
    if (ctx.command === 'ping') {
      ctx.reply(ctx.to, 'pong');
    }
  }
};
