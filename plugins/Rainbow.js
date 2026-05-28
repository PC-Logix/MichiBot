'use strict';
const {
  IRC_COLOR,
  say,
  text
} = require('../utils/helper');
const colors = ['04', '07', '08', '03', '02', '12', '06'];

function rainbow(s) {
  let i = 0;
  return Array.from(s).map(ch => `${IRC_COLOR}${colors[(i++)%colors.length]}${ch}`).join('');
}
module.exports = {
  name: 'Rainbow',
  commands: ['rainbow'],
  init() {
    console.log('[Rainbow] initialized');
  },
  async handleCommand(ctx) {
    say(ctx, rainbow(text(ctx) || 'Rainbows!'));
  }
};
