'use strict';

const combat = require('../services/combat');
const inventory = require('../services/inventory');
const { getOffensiveItemBonus, ItemBonusCollection } = require('../services/itemBonuses');
const { act, addressedSay, antiPing, parseTargetAndItem, rollDiceInString, say } = require('../utils/helper');

const ACTIONS = Object.freeze({
  stab: { is: 'stabbing', will: 'stab', past: 'stabbed' },
  hit: { is: 'hitting', will: 'hit', past: 'hit' },
  shiv: { is: 'shivving', will: 'shiv', past: 'shivved' },
  strike: { is: 'striking', will: 'strike', past: 'struck' },
  slap: { is: 'slapping', will: 'slap', past: 'slapped' },
  poke: { is: 'poking', will: 'poke', past: 'poked' },
  prod: { is: 'prodding', will: 'prod', past: 'prodded' },
  smack: { is: 'smacking', will: 'smack', past: 'smacked' },
  conk: { is: 'conking', will: 'conk', past: 'conked' },
  bite: { is: 'biting', will: 'bite', past: 'bitten' },
  claw: { is: 'clawing', will: 'claw', past: 'clawed' },
  punch: { is: 'punching', will: 'punch', past: 'punched' }
});

const ACTION_NAMES = Object.keys(ACTIONS);
const ACTION_LIST = ACTION_NAMES.join(', ');
const NON_ITEM_ACTIONS = new Set(['bite', 'claw', 'punch']);

function botNick(ctx) {
  return String(ctx?.client?.user?.nick || ctx?.config?.userName || ctx?.config?.nick || 'MichiBot');
}

function actionAliases() {
  return ACTION_NAMES.map(name => ({ name, defaultArgs: [name] }));
}

module.exports = {
  name: 'Attack',
  commands: [{
    name: 'attack',
    aliases: actionAliases(),
    cooldown: { seconds: 300, perUser: true },
    help: "Attack someone and deal damage! Each action can also be used as an alias, with an optional item written with or without 'with'."
  }],

  init() {
    inventory.ensureSchema();
    console.log('[Attack] initialized');
  },

  handleCommand(ctx) {
    const args = Array.isArray(ctx.args) ? ctx.args.slice() : [];
    const method = String(args.shift() || '').toLowerCase();
    const parsedTarget = parseTargetAndItem({ args });
    const attackTarget = parsedTarget.target;

    if (!ACTIONS[method]) return say(ctx, `Specify an action as the first parameter: ${ACTION_LIST}`);
    if (!attackTarget) return addressedSay(ctx, 'Missing required argument: Target');

    const withItem = parsedTarget.item;

    let item = null;
    if (!NON_ITEM_ACTIONS.has(method)) {
      item = withItem ? inventory.createLooseItem(withItem, botNick(ctx)) : inventory.getRandomItem(false);
    }

    let dust = '';
    if (item) {
      dust = item.decrementUses(false, true, true);
      if (dust) dust = ` ${dust}`;
    }

    if (!combat.canInteractWith(attackTarget, botNick(ctx))) {
      const weapon = item ? item.getName() : 'their orbital death ray';
      return act(ctx, rollDiceInString(
        `uses ${weapon} to vaporize ${antiPing(ctx.nick)} who takes 10d10 damage.${dust}`,
        true
      ));
    }

    let damage;
    if (item) {
      damage = combat.rollDiceResult(1, item.getDiceSizeFromItemName(), getOffensiveItemBonus(item));
    } else if (method === 'bite' || method === 'claw') {
      damage = combat.rollDiceResult(1, 6, new ItemBonusCollection());
    } else {
      damage = combat.rollDiceResult(1, 4, new ItemBonusCollection());
    }

    const rolledDamage = damage.getResultString();
    const damageString = rolledDamage ? `${rolledDamage} damage` : 'no damage';
    const itemName = item ? item.getName() : '';
    const result = `${ctx.nick} is ${ACTIONS[method].is} ${attackTarget}${item ? ` with ${itemName}` : ''} for ${damageString}!${dust}`;

    combat.addEvent({
      triggeringUser: ctx.nick,
      targetUser: attackTarget,
      target: ctx.replyTarget || ctx.to,
      damage: damage.getTotal(),
      implement: itemName,
      type: combat.EVENT_TYPES.ATTACK,
      result
    });

    return say(
      ctx,
      `${ctx.nick} is trying to ${ACTIONS[method].will} ${attackTarget}! They have ${combat.getReactionTimeString()} if they want to attempt to ${ctx.prefix}defend against it!`
    );
  },

  ACTIONS
};
