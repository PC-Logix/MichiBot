'use strict';
const {
  say,
  stripIrcFormatting,
  text
} = require('../utils/helper');

function rot13(s) {
  return s.replace(/[a-zA-Z]/g, c => String.fromCharCode((c <= 'Z' ? 90 : 122) >= (c = c.charCodeAt(0) + 13) ? c : c -
    26));
}
module.exports = {
  name: 'Rot13',
  commands: ['rot13'],
  init() {
    console.log('[Rot13] initialized');
  },
  async handleCommand(ctx) {
    say(ctx, rot13(stripIrcFormatting(text(ctx))));
  }
};
