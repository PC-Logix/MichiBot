'use strict';
const {
  say
} = require('../utils/helper');
const history = new Map();

function key(ch) {
  return String(ch || '').toLowerCase();
}
module.exports = {
  name: 'SED',
  commands: [{ name: 'sed', cooldown: { seconds: 10 } }],
  init() {
    console.log('[SED] initialized');
  },
  async onMessage(ctx) {
    if (!ctx.text || /^s(.).+\1.*\1?/.test(ctx.text)) return;
    const k = key(ctx.to);
    if (!history.has(k)) history.set(k, []);
    const arr = history.get(k);
    arr.push({
      nick: ctx.nick,
      text: ctx.text
    });
    while (arr.length > 50) arr.shift();
  },
  async handleCommand(ctx) {
    const raw = ctx.raw.replace(/^sed\s*/i, '').trim() || ctx.message.trim();
    const m = raw.match(/^s(.)(.*?)\1(.*?)\1([gi]*)$/);
    if (!m) return say(ctx, `Usage: ${ctx.prefix}sed s/search/replace/[g]`);
    let re;
    try {
      re = new RegExp(m[2], m[4].includes('g') ? 'gi' : 'i');
    } catch (e) {
      return say(ctx, `Bad regex: ${e.message}`);
    }
    const arr = (history.get(key(ctx.to)) || []).slice().reverse();
    for (const h of arr) {
      if (re.test(h.text)) {
        re.lastIndex = 0;
        return say(ctx, `<${h.nick}> ${h.text.replace(re,m[3])}`);
      }
    }
    say(ctx, 'Nothing to sed.');
  }
};
