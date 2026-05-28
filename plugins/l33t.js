'use strict';
const {
  say,
  text
} = require('../utils/helper');

function toLeet(str) {
  let s = String(str || '');
  let ck = false,
    plural = false;
  if (s.endsWith('ck')) {
    ck = true;
    s = s.slice(0, -2);
  } else if (s.endsWith('s')) {
    plural = true;
    s = s.slice(0, -1);
  }
  const map = {
    a: '@',
    e: '3',
    i: '1',
    o: '0',
    u: 'v',
    f: 'p',
    s: '$',
    g: '9',
    y: 'j',
    t: '+',
    '!': '1'
  };
  let out = '';
  for (const ch of s) {
    let r = map[ch] || ch;
    r = (r.toLowerCase() === r) ? r.toUpperCase() : r.toLowerCase();
    out += r;
  }
  return out + (ck ? 'x' : plural ? 'z' : '');
}
module.exports = {
  name: 'l33t',
  commands: [{ name: '1337', aliases: ['leet', 'l33t', '1ee7'] }],
  init() {
    console.log('[l33t] initialized');
  },
  async handleCommand(ctx) {
    say(ctx, toLeet(text(ctx)));
  }
};
