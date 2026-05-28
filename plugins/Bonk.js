'use strict';
const {
  act,
  diceSidesFromItem,
  itemOrRandom,
  normalizeSelfTarget,
  parseTargetAndItem,
  rollDiceInString,
  say
} = require('../utils/helper');
module.exports = {
  name: 'Bonk',
  commands: ['bonk'],
  init() {
    console.log('[Bonk] initialized');
  },
  async handleCommand(ctx) {
    let {
      target,
      item
    } = parseTargetAndItem(ctx);
    if (!target) return act(ctx, `${ctx.nick} swings at the void`);
    target = normalizeSelfTarget(target, ctx.nick);
    if (/^no(pe)?$/i.test(target)) return act(ctx, `bonks ${ctx.nick} on the head preemptively!`);
    const it = itemOrRandom(item);
    const dmg = rollDiceInString(`1d${it?diceSidesFromItem(it,4):4} damage`, true);
    const self = target.toLowerCase() === ctx.nick.toLowerCase();
    say(ctx, it ? `${ctx.nick} bonks ${self?'themselves':target} on the head with ${it} for ${dmg}!` :
      `${ctx.nick} bonks ${self?'themselves':target} on the head for ${dmg}!`);
  }
};
