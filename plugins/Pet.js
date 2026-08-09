'use strict';
const inventory = require('../services/inventory');
const { getHealingItemBonus } = require('../services/itemBonuses');
const {
  normalizeSelfTarget,
  parseTargetAndItem,
  pick,
  randInt,
  say
} = require('../utils/helper');
const actions = ['petting', 'brushing', 'patting'];
module.exports = {
  name: 'Pet',
  commands: [{ name: 'pet', aliases: ['stroke', 'pat'] }],
  init() {
    inventory.ensureSchema();
    console.log('[Pet] initialized');
  },
  async handleCommand(ctx) {
    let {
      target,
      item
    } = parseTargetAndItem(ctx);
    if (!target) return say(ctx, `${ctx.nick} flails at nothingness...`);
    target = normalizeSelfTarget(target, ctx.nick);
    if (target.toLowerCase() === ctx.nick.toLowerCase()) return say(ctx, "Don't pet yourself in public.");
    const inventoryItem = item ? inventory.createLooseItem(item) : inventory.getRandomItem(true);
    let dust = '';
    if (inventoryItem) {
      dust = inventoryItem.decrementUses(false, true, true);
      if (dust) dust = ` ${dust}`;
    }

    const die = inventoryItem ? inventoryItem.getDiceSizeFromItemName() : 4;
    const roll = randInt(1, die);
    const bonuses = inventoryItem ? getHealingItemBonus(inventoryItem) : null;
    const total = Math.max(0, roll + (bonuses ? bonuses.getTotal() : 0));
    const hp = bonuses && bonuses.size() > 0 ?
      `1d${die} => ${roll} (${bonuses}) => ${total}` :
      `1d${die} => ${total}`;
    const it = inventoryItem ? inventoryItem.getName() : '';
    say(ctx,
    `${ctx.nick} is ${pick(actions)} ${target}${it ? ` with ${it}` : ''}. ${target} regains ${hp} hit points!${dust}`);
  }
};
