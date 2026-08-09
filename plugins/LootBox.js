'use strict';

const combat = require('../services/combat');
const inventory = require('../services/inventory');
const potionData = require('../utils/potionData');
const { act, addressedSay, pick, randInt, solvePrefixes } = require('../utils/helper');

const RARITIES = Object.freeze([
  Object.freeze({ maximum: 1, name: 'Cursed', label: '1%' }),
  Object.freeze({ maximum: 5, name: 'Legendary', label: '5%' }),
  Object.freeze({ maximum: 10, name: 'Shiny', label: '10%' }),
  Object.freeze({ maximum: 25, name: 'Magic', label: '25%' }),
  Object.freeze({ maximum: 50, name: 'Rare', label: '50%' })
]);
const NORMAL_RARITY = Object.freeze({ maximum: 100, name: 'Normal', label: 'Junk' });

function botNick(ctx) {
  return String(ctx?.client?.user?.nick || ctx?.config?.userName || ctx?.config?.nick || 'MichiBot');
}

function selectRarity(roll) {
  const value = Math.max(1, Math.min(100, Math.floor(Number(roll || 1))));
  return RARITIES.find(rarity => value <= rarity.maximum) || NORMAL_RARITY;
}

function randomGarbage() {
  const row = pick(potionData.garbageItems || []);
  if (!row) return 'suspicious lint';
  const prefix = row[0] ? `${row[0]} ` : '';
  return `${prefix}${row[1]}`.toLowerCase();
}

function randomPotionName() {
  const consistency = pick(potionData.consistencies || []);
  const appearance = pick(potionData.appearances || []);
  if (!consistency || !appearance) return 'mysterious potion';
  return `${consistency.name} ${appearance.name} potion`;
}

function transformedItemName(item, rarity) {
  const prefixes = solvePrefixes(item.getNameRaw());
  if (prefixes) return `${prefixes[0]} ${rarity.name} ${prefixes[1]}! (${rarity.label})`;
  return `a ${rarity.name} ${item.getNameWithoutPrefix()}! (${rarity.label})`;
}

function openLootBox(ctx, rarityRoll = randInt(1, 100)) {
  const rarity = selectRarity(rarityRoll);
  let itemName;

  if (rarity.name === 'Normal') {
    itemName = `${randomGarbage()}.`;
  } else {
    const sourceItem = inventory.getRandomItem(true);
    if (!sourceItem) {
      itemName = `${randomGarbage()}.`;
    } else {
      itemName = transformedItemName(sourceItem, rarity);
      inventory.convertToOwnedLoot(sourceItem, itemName, ctx.nick, rarity.name === 'Cursed');
    }
  }

  if (itemName.includes('randompotion')) itemName = randomPotionName();

  const lootTarget = Array.isArray(ctx.args) ? ctx.args.join(' ').trim() : '';
  if (lootTarget && !combat.canInteractWith(lootTarget, botNick(ctx))) {
    return act(ctx, `Kicks ${ctx.nick} into the tentacle pit.`);
  }

  const itemString = `${itemName} (${rarity.label})`;
  if (lootTarget) return addressedSay(ctx, `You stab ${lootTarget}! It dropped ${itemString}!`);
  return addressedSay(ctx, `You get a loot box! It contains ${itemString}`);
}

module.exports = {
  name: 'LootBox',
  commands: [{
    name: 'lootbox',
    aliases: ['loot'],
    cooldown: { seconds: 60 },
    help: 'Get a loot box! What could be inside!'
  }],

  init() {
    inventory.ensureSchema();
    console.log('[LootBox] initialized');
  },

  handleCommand(ctx) {
    return openLootBox(ctx);
  },

  _private: {
    NORMAL_RARITY,
    RARITIES,
    openLootBox,
    randomGarbage,
    randomPotionName,
    selectRarity,
    transformedItemName
  }
};
