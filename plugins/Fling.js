'use strict';
const combat = require('../services/combat');
const inventory = require('../services/inventory');
const { getOffensiveItemBonus } = require('../services/itemBonuses');
const channelState = require('../utils/channelState');
const {
  act,
  parseTargetAndItem,
  pick,
  randInt,
  say
} = require('../utils/helper');
const places = [
  'on the arm', 'in the head', 'on the butt', 'in their pride', 'in the small of the back',
  'on the heel', 'on the left hand', 'underneath their foot', 'in their spleen',
  "on a body part they didn't even know they had", 'in the face', 'on a small but very important bone',
  "right where they didn't expect", 'right where the last item hit', 'right in their lunch'
];

function botNick(ctx) {
  return String(ctx?.client?.user?.nick || ctx?.config?.userName || ctx?.config?.nick || 'MichiBot');
}

module.exports = {
  name: 'Fling',
  commands: [{ name: 'fling', aliases: ['sling', 'shoot', 'launch'] }],
  init() {
    inventory.ensureSchema();
    console.log('[Fling] initialized');
  },
  async handleCommand(ctx) {
    let {
      target,
      item
    } = parseTargetAndItem(ctx);
    const inventoryItem = item ? inventory.createLooseItem(item) : inventory.getRandomItem(false);
    const it = inventoryItem ? inventoryItem.getName() : '';
    const verbs = {
      fling: 'flings',
      sling: 'slings',
      shoot: 'shoots',
      launch: 'launches'
    };
    const verb = verbs[ctx.invokedCommand] || verbs[ctx.command] || 'flings';
    if (!it) return say(ctx,
      `${ctx.nick} makes a ${verb.replace(/s$/,'ing')} motion but realizes there was nothing there...`);
    if (!target) {
      const users = channelState.getUsers(ctx.replyTarget || ctx.to);
      target = users.length ? pick(users) : 'someone nearby';
    }
    if (!combat.canInteractWith(target, botNick(ctx))) target = ctx.nick;

    let itemDamage;
    if (randInt(1, 100) > 20) {
      const damage = combat.rollDiceResult(
        1,
        inventoryItem.getDiceSizeFromItemName(),
        getOffensiveItemBonus(inventoryItem)
      );
      const result = `${ctx.nick} ${verb} ${it} in a random direction. It hits ${target} ${pick(places)}. They take ${damage.getResultString() || 'no damage'} damage!`;
      combat.addEvent({
        triggeringUser: ctx.nick,
        targetUser: target,
        target: ctx.replyTarget || ctx.to,
        damage: damage.getTotal(),
        implement: it,
        type: combat.EVENT_TYPES.FLING,
        result
      });
      say(ctx, `${ctx.nick} is flinging something at ${target}! They have ${combat.getReactionTimeString()} if they want to attempt to ${ctx.prefix}defend against it!`);
      itemDamage = 1;
    } else {
      say(ctx, `${ctx.nick} ${verb} ${it} in a random direction. It hits the ground near ${target}`);
      itemDamage = 2;
    }
    const dust = inventoryItem.damage(itemDamage, false, true, true);
    if (dust) act(ctx, dust);
  }
};
