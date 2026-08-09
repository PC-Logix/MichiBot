'use strict';
const inventory = require('../services/inventory');
const {
  act,
  normalizeSelfTarget,
  parseTargetAndItem,
  say
} = require('../utils/helper');
module.exports = {
  name: 'Bap',
  commands: ['bap'],
  init() {
    inventory.ensureSchema();
    console.log('[Bap] initialized');
  },
  async handleCommand(ctx) {
    let {
      target,
      item
    } = parseTargetAndItem(ctx);
    if (!target) return act(ctx, `${ctx.nick} flails at the darkness`);
    target = normalizeSelfTarget(target, ctx.nick);
    const inventoryItem = item ? inventory.createLooseItem(item) : inventory.getRandomItem(false);
    const it = inventoryItem ? inventoryItem.getName(true) : '';
    if (/^no(pe)?$/i.test(target)) return act(ctx, `smacks ${ctx.nick}!`);
    if (target.toLowerCase() === ctx.nick.toLowerCase()) say(ctx,
      `${ctx.nick} baps themselves${it?` with ${it}`:''}!`);
    else say(ctx, `${ctx.nick} baps ${target}${it?` with ${it}`:''}!`);
  }
};
