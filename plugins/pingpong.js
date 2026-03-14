'use strict';

module.exports = {
  commands: ['ping'],

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