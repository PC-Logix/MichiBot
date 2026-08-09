'use strict';

const inventory = require('../services/inventory');
const {
  normalizeCooldownSpec,
  getCooldownRemainingMs,
  updateCooldown,
  formatCooldownFailMessage
} = require('../libs/cooldowns');
const {
  act,
  addressedSay,
  say,
  splitLegacyMessage
} = require('../utils/helper');

const SUBCOMMANDS = 'list, create (add), remove (rem, del), preserve (pre), unpreserve (unpre), count, favourite (fav)';
const CREATE_COOLDOWN = normalizeCooldownSpec({ seconds: 60 }, 'inventory:create');
const REMOVE_COOLDOWN = normalizeCooldownSpec({ seconds: 60 }, 'inventory:remove');

function botNick(ctx) {
  return String(ctx?.client?.user?.nick || ctx?.config?.userName || ctx?.config?.nick || 'MichiBot');
}

function inventoryUrl(ctx) {
  const enabled = ctx?.config?.http?.enabled !== false && ctx?.config?.httpdEnabled !== false;
  const base = String(ctx?.config?.http?.baseDomain || ctx?.config?.httpdBaseDomain || '')
    .trim()
    .replace(/\/+$/, '');
  return enabled && base ? `${base}/inventory` : '';
}

async function hasRank(ctx, rank) {
  return ctx.permissions.canAccessAsync(ctx, { globalRank: rank });
}

async function consumeSubcommandCooldown(ctx, cooldown) {
  const remainingMs = getCooldownRemainingMs(cooldown, ctx.nick);
  if (remainingMs > 0 && !(await hasRank(ctx, 'Admin'))) {
    if (typeof ctx.notice === 'function') ctx.notice(ctx.nick, formatCooldownFailMessage(cooldown, remainingMs));
    else say(ctx, formatCooldownFailMessage(cooldown, remainingMs));
    return false;
  }

  updateCooldown(cooldown, ctx.nick);
  return true;
}

function listInventory(ctx) {
  const url = inventoryUrl(ctx);
  if (url) return addressedSay(ctx, `Here's my inventory: ${url}`);

  const items = inventory.getItems();
  if (!items.length) return addressedSay(ctx, 'There are no items.');

  const listing = items
    .map(item => `${item.getName()}${item.usesLeft === -1 ? ' (*)' : ''}`)
    .join(', ');
  for (const line of splitLegacyMessage(`Here's my inventory: ${listing}`)) addressedSay(ctx, line);
}

async function createItem(ctx, itemName) {
  if (!(await consumeSubcommandCooldown(ctx, CREATE_COOLDOWN))) return;

  const item = String(itemName || '');
  const ourNick = botNick(ctx);
  if (/^myself$/i.test(item) || item.toLowerCase() === ourNick.toLowerCase()) {
    return addressedSay(ctx, "I can't add myself to the inventory.");
  }
  if (item.toLowerCase() === String(ctx.nick || '').toLowerCase()) {
    return addressedSay(ctx, "You can't add yourself to the inventory.");
  }

  const cleaned = item.replace(/[.!?,‽]$/, '');
  if (!cleaned) return act(ctx, 'adds nothing to their inventory.');
  return act(ctx, inventory.addItem(cleaned, ctx.nick, false, true, { botNick: ourNick }));
}

async function removeItem(ctx, itemName) {
  if (!(await consumeSubcommandCooldown(ctx, REMOVE_COOLDOWN))) return;

  const canOverride = await hasRank(ctx, 'Admin');
  const result = inventory.removeItem(itemName, canOverride, canOverride);
  if (result === inventory.REMOVE_OK) return addressedSay(ctx, 'Removed item from inventory');
  if (result === inventory.ERROR_ITEM_IS_FAVOURITE) {
    return addressedSay(ctx, "This is my favourite thing. You can't make me get rid of it.");
  }
  if (result === inventory.ERROR_ITEM_IS_PRESERVED) {
    return addressedSay(ctx, "I've been told to preserve this. You can't remove it.");
  }
  if (result === inventory.ERROR_NO_ROWS_RETURNED) return addressedSay(ctx, 'No such item');
  return addressedSay(ctx, `Wrong things happened! (${result})`);
}

module.exports = {
  name: 'Inventory',
  commands: [{
    name: 'inventory',
    aliases: ['inv'],
    help: 'Interact with the bots inventory'
  }],

  init() {
    inventory.ensureSchema();
    console.log('[Inventory] initialized');
  },

  async handleCommand(ctx) {
    const args = Array.isArray(ctx.args) ? ctx.args.slice() : [];
    const requested = String(args.shift() || '').toLowerCase();
    const params = args.join(' ').trim();

    switch (requested) {
      case 'list':
        return listInventory(ctx);

      case 'count':
        try {
          return say(ctx, `The inventory contains ${inventory.getInventorySize()} items.`);
        } catch (_) {
          return act(ctx, 'shrugs');
        }

      case 'create':
      case 'add':
        if (!params) return addressedSay(ctx, 'Missing required argument: Item');
        return createItem(ctx, params);

      case 'remove':
      case 'rem':
      case 'del':
        if (!params) return addressedSay(ctx, 'Missing required argument: Item');
        return removeItem(ctx, params);

      case 'preserve':
      case 'pre':
        if (!(await hasRank(ctx, 'Trusted'))) return;
        if (!params) return addressedSay(ctx, 'Missing required argument: Item');
        inventory.preserveItem(params);
        return addressedSay(ctx, 'Item preserved');

      case 'unpreserve':
      case 'unpre':
        if (!(await hasRank(ctx, 'Trusted'))) return;
        if (!params) return addressedSay(ctx, 'Missing required argument: Item');
        inventory.unpreserveItem(params);
        return addressedSay(ctx, 'Item un-preserved');

      case 'favourite':
      case 'fav': {
        if (!(await hasRank(ctx, 'Trusted'))) return;
        const favourite = inventory.getFavouriteItem();
        if (!favourite) return addressedSay(ctx, 'I have no favourite item right now.');
        return addressedSay(ctx, `My favourite item is ${favourite.getName()}\x0f added by ${favourite.addedBy}`);
      }

      case '':
        return addressedSay(ctx, `Must specify sub-command. (Try: ${SUBCOMMANDS})`);

      default:
        return addressedSay(ctx, `Unknown sub-command '${requested}' (Try: ${SUBCOMMANDS})`);
    }
  }
};
