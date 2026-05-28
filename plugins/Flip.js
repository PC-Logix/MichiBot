'use strict';
const {
  say,
  stripIrcFormatting,
  text
} = require('../utils/helper');
const orig = "!().12345679<>?ABCDEFGJKLMPQRTUVWY[]_abcdefghijklmnpqrtuvwy{},'\"┳";
const repl = "¡)(˙⇂ⵒƐㄣϛ9Ɫ6><¿∀ℇƆᗡƎℲפſ丬˥WԀΌᴚ⊥∩ΛMλ][‾ɐqɔpǝɟɓɥıɾʞlɯudbɹʇnʌʍʎ}{',„┻";

function flip(s) {
  return Array.from(s).map(ch => {
    const a = orig.indexOf(ch);
    if (a !== -1) return repl[a];
    const b = repl.indexOf(ch);
    return b !== -1 ? orig[b] : ch;
  }).join('');
}
module.exports = {
  name: 'Flip',
  commands: ['flip'],
  init() {
    console.log('[Flip] initialized');
  },
  async handleCommand(ctx) {
    const s = text(ctx);
    say(ctx, s ? `(╯°□°）╯${Array.from(flip(stripIrcFormatting(s))).reverse().join('')}` : '(╯°□°）╯┻━┻');
  }
};
