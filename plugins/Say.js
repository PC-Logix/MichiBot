'use strict';
const {
  text
} = require('../utils/helper');
module.exports = {
  name: 'Say',
  commands: [{
    name: 'say',
    access: {
      globalRank: 'Admin'
    }
  }, {
    name: 'me',
    access: {
      globalRank: 'Admin'
    }
  }],
  init() {
    console.log('[Say] initialized');
  },
  async handleCommand(ctx) {
    const raw = text(ctx);
    const m = raw.match(/^(#\S+)\s+([\s\S]+)$/);
    const target = m ? m[1] : ctx.replyTarget;
    const msg = m ? m[2] : raw;
    if (!msg) return ctx.reply(ctx.replyTarget, `Usage: ${ctx.prefix}${ctx.command} [#channel] <message>`);
    if (ctx.command === 'me') ctx.action(target, msg);
    else ctx.reply(target, msg);
  }
};
