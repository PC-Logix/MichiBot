'use strict';
const inventory = require('../services/inventory');
const {
  act,
  normalizeSelfTarget,
  parseTargetAndItem,
  rollDiceInString,
  say
} = require('../utils/helper');
module.exports = {
  name: 'Zap',
  commands: ['zap'],
  init() {
    inventory.ensureSchema();
    console.log('[Zap] initialized');
  },
  async handleCommand(ctx) {
    let {
      target,
      item
    } = parseTargetAndItem(ctx);
    if (!target) return act(ctx, `${ctx.nick} makes some sparks`);
    target = normalizeSelfTarget(target, ctx.nick);
    if (/^no(pe)?$/i.test(target)) return act(ctx, `zaps ${ctx.nick}!`);
    const inventoryItem = /^nothing$/i.test(item) ? null :
      (item ? inventory.createLooseItem(item) : inventory.getRandomItem(false));
    const it = inventoryItem ? inventoryItem.getName(true) : '';
    const dmg = rollDiceInString(`1d${inventoryItem ? inventoryItem.getDiceSizeFromItemName() + 2 : 6} damage`, true);
    const self = target.toLowerCase() === ctx.nick.toLowerCase();
    say(ctx, it ? `${ctx.nick} zaps ${self?'themselves':target} using ${it} as a conductor for ${dmg}!` :
      `${ctx.nick} zaps ${self?'themselves':target} for ${dmg}!`);
  }
};
