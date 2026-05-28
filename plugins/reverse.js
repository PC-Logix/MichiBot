'use strict';
const {
  say,
  stripIrcFormatting,
  text
} = require('../utils/helper');
module.exports = {
  name: 'reverse',
  commands: ['reverse'],
  init() {
    console.log('[reverse] initialized');
  },
  async handleCommand(ctx) {
    say(ctx, stripIrcFormatting(text(ctx)).split('').reverse().join(''));
  }
};
