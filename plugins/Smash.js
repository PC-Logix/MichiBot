'use strict';
const {
  pick,
  say
} = require('../utils/helper');
const things = ['a vase', 'the patriarchy', 'a suspicious crate', 'some expectations', 'a keyboard',
  'a stack of paperwork', 'the emergency glass', 'an imaginary bug'
];
module.exports = {
  name: 'Smash',
  commands: [{ name: 'smash', cooldown: { seconds: 30, perUser: true } }],
  init() {
    console.log('[Smash] initialized');
  },
  async handleCommand(ctx) {
    say(ctx, `${ctx.nick} smashes ${pick(things)}!`);
  }
};
