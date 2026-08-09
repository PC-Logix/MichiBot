'use strict';

const inventory = require('../services/inventory');
const {
  getDefensiveItemBonus,
  getHealingItemBonus,
  getOffensiveItemBonus
} = require('../services/itemBonuses');
const { addressedSay, say } = require('../utils/helper');

const SUBCOMMANDS = 'attack (att), defense (def), healing (heal)';

function rate(ctx, type, itemName) {
  if (!itemName) return addressedSay(ctx, "That's a very nice nothing you have there... I rate it 5/7!");

  const item = inventory.getItemByName(itemName);
  if (!item) return say(ctx, 'I had an oopsie while trying to create this item...');

  const die = item.getDiceSizeFromItemName();
  const config = {
    attack: {
      bonuses: getOffensiveItemBonus(itemName),
      incapable: 'This item is incapable of doing damage.',
      dieName: 'damage die',
      none: 'It has no attack bonuses.',
      bonusName: 'attack bonus'
    },
    defense: {
      bonuses: getDefensiveItemBonus(itemName),
      incapable: 'This item is incapable of blocking damage.',
      dieName: 'damage reduction die',
      none: 'It has no reduction bonus',
      bonusName: 'reduction bonus'
    },
    healing: {
      bonuses: getHealingItemBonus(itemName),
      incapable: 'This item is incapable of healing.',
      dieName: 'healing die',
      none: 'It has no healing bonus',
      bonusName: 'healing bonus'
    }
  }[type];

  if (config.bonuses.incapable) return say(ctx, config.incapable);
  if (config.bonuses.size() === 0) {
    return say(ctx, `This item's ${config.dieName} is a d${die}! ${config.none}`);
  }

  const total = config.bonuses.getTotal();
  return say(ctx, `This item's ${config.dieName} is a d${die}! It has a ${config.bonusName} of ${total > 0 ? '+' : ''}${total}, (${config.bonuses}).`);
}

module.exports = {
  name: 'RateItem',
  commands: [{
    name: 'rateitem',
    help: 'Rates items attack, defense or healing bonuses'
  }],

  init() {
    inventory.ensureSchema();
    console.log('[RateItem] initialized');
  },

  handleCommand(ctx) {
    const args = Array.isArray(ctx.args) ? ctx.args.slice() : [];
    let subcommand = String(args.shift() || '').toLowerCase();
    if (subcommand === 'att') subcommand = 'attack';
    if (subcommand === 'def') subcommand = 'defense';
    if (subcommand === 'heal') subcommand = 'healing';

    if (['attack', 'defense', 'healing'].includes(subcommand)) {
      return rate(ctx, subcommand, args.join(' ').trim());
    }
    if (!subcommand) return addressedSay(ctx, `Must specify sub-command. (Try: ${SUBCOMMANDS})`);
    return addressedSay(ctx, `Unknown sub-command '${subcommand}' (Try: ${SUBCOMMANDS})`);
  }
};
