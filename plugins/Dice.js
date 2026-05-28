'use strict';
const {
  rollDiceInString,
  safeCalc,
  say,
  text
} = require('../utils/helper');
module.exports = {
  name: 'Dice',
  commands: [{ name: 'dice', aliases: ['roll', 'math', 'expression', 'exp', 'calc'] }],
  init() {
    console.log('[Dice] initialized');
  },
  async handleCommand(ctx) {
    const raw = text(ctx);
    if (!raw) return say(ctx, `Usage: ${ctx.prefix}${ctx.command} <expression>`);
    if (/^the meaning of life$/i.test(raw)) return say(ctx, '42');
    try {
      const expanded = rollDiceInString(raw, false);
      if (raw.includes('=>')) return say(ctx, expanded);
      const calcInput = expanded.replace(/\[([^\]]+)\]/g, (_, inner) => inner.split(',').reduce((a, b) => a +
        Number(b.trim() || 0), 0));
      const result = safeCalc(calcInput);
      say(ctx, expanded === result ? result : `${expanded} => ${result}`);
    } catch (err) {
      say(ctx, `Could not calculate that: ${err.message}`);
    }
  }
};
