'use strict';

const inventory = require('../services/inventory');
const { act, addressedSay, parseTargetAndItem } = require('../utils/helper');

function botNick(ctx) {
  return String(ctx?.client?.user?.nick || ctx?.config?.userName || ctx?.config?.nick || 'MichiBot');
}

module.exports = {
  name: 'Give',
  commands: [{
    name: 'give',
    help: 'If the item is found in the inventory it is given to the target.'
  }],

  init() {
    inventory.ensureSchema();
    console.log('[Give] initialized');
  },

  handleCommand(ctx) {
    const { target, item: itemName } = parseTargetAndItem(ctx);
    const ourNick = botNick(ctx);

    if (!target) return addressedSay(ctx, 'Missing required argument: Target');

    if (target !== ourNick) {
      const item = !itemName || itemName === 'random' ?
        inventory.getRandomItem(false) :
        inventory.getItemByName(inventory.escapeHtml4(itemName));

      if (!item) {
        return act(ctx, 'searches through their inventory for a bit. "I couldn\'t find anything..."');
      }

      const result = inventory.removeItem(item);
      if (result === inventory.REMOVE_OK || result === inventory.ERROR_ITEM_IS_PRESERVED) {
        return act(ctx, `gives ${target} ${item.getName()} from their inventory`);
      }
      if (result === inventory.ERROR_ITEM_IS_FAVOURITE) {
        return addressedSay(ctx, 'No! This is my favourite thing! I wont give it away!');
      }
      if (result === inventory.ERROR_NO_ROWS_RETURNED) {
        return addressedSay(ctx, 'No item found to give away.');
      }
      return addressedSay(ctx, `Something went wrong (${result})`);
    }

    if (!itemName) return addressedSay(ctx, 'Missing required argument: Item');
    if (itemName !== ourNick) {
      const result = inventory.addItem(itemName, ctx.nick, false, false, { botNick: ourNick });
      if (result === 'already has a few of those.') {
        return act(ctx, 'politely declines, as they already have a few of those');
      }
      return act(ctx, `accepts ${inventory.fixItemName(itemName, true)} and adds it to their inventory`);
    }
  }
};
