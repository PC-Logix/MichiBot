'use strict';
const {
  say,
  text
} = require('../utils/helper');

function run(src, input = '') {
  const tape = new Uint8Array(30000);
  let p = 0,
    ip = 0,
    out = '',
    inp = 0,
    steps = 0;
  const stack = [],
    jump = {};
  for (let i = 0; i < src.length; i++) {
    if (src[i] == '[') stack.push(i);
    if (src[i] == ']') {
      const j = stack.pop();
      if (j === undefined) throw Error('unmatched ]');
      jump[i] = j;
      jump[j] = i;
    }
  }
  if (stack.length) throw Error('unmatched [');
  while (ip < src.length && ++steps < 200000) {
    switch (src[ip]) {
      case '>':
        p = (p + 1) % tape.length;
        break;
      case '<':
        p = (p - 1 + tape.length) % tape.length;
        break;
      case '+':
        tape[p] = (tape[p] + 1) & 255;
        break;
      case '-':
        tape[p] = (tape[p] - 1) & 255;
        break;
      case '.':
        out += String.fromCharCode(tape[p]);
        if (out.length > 300) return out;
        break;
      case ',':
        tape[p] = inp < input.length ? input.charCodeAt(inp++) : 0;
        break;
      case '[':
        if (!tape[p]) ip = jump[ip];
        break;
      case ']':
        if (tape[p]) ip = jump[ip];
        break;
    }
    ip++;
  }
  if (steps >= 200000) throw Error('step limit hit');
  return out;
}
module.exports = {
  name: 'Brainfuck',
  commands: [{ name: 'bf', aliases: ['brainfuck'] }],
  init() {
    console.log('[Brainfuck] initialized');
  },
  async handleCommand(ctx) {
    const raw = text(ctx);
    if (!raw) return say(ctx, `Usage: ${ctx.prefix}${ctx.command} <program>`);
    try {
      say(ctx, run(raw) || '(no output)');
    } catch (e) {
      say(ctx, `Brainfuck error: ${e.message}`);
    }
  }
};
