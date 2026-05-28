'use strict';
const {
  pick,
  say,
  text
} = require('../utils/helper');
const answers = ['Signs point to yes', 'Without a doubt', 'Reply hazy, try again', 'Ask again later', 'My reply is no',
  'Outlook not so good', '*The Bowling ball doesn\'t answer'
];
module.exports = {
  name: 'EightBall',
  commands: [{ name: 'eightball', aliases: ['8ball'] }],
  init() {
    console.log('[EightBall] initialized');
  },
  async handleCommand(ctx) {
    const q = text(ctx);
    if (q && ((q.length > 6 && /\?$/.test(q)) || q === '^')) {
      const a = pick(answers);
      if (a.startsWith('*')) ctx.action(ctx.replyTarget, a.slice(1));
      else say(ctx, a);
    } else say(ctx, "I don't think that's a question...");
  }
};
