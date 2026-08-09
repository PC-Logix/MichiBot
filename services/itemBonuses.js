'use strict';

class ItemBonusCollection {
  constructor() {
    this.incapable = false;
    this.bonuses = new Map();
  }

  addBonus(name, modifier) {
    const key = String(name).trim();
    this.bonuses.set(key, Number(this.bonuses.get(key) || 0) + Number(modifier || 0));
  }

  getTotal() {
    return Array.from(this.bonuses.values()).reduce((total, value) => total + value, 0);
  }

  size() {
    return this.bonuses.size;
  }

  toString() {
    return Array.from(this.bonuses.entries())
      .filter(([, value]) => value !== 0)
      .map(([name, value]) => `${name} ${value > 0 ? '+' : ''}${value}`)
      .join(', ');
  }
}

function addMatches(collection, matches, itemName, modifier) {
  for (const match of matches) {
    if (itemName.includes(match.toLowerCase())) collection.addBonus(match, modifier);
  }
}

function bonusesFor(itemName, rules) {
  const name = String(itemName ?? '').toLowerCase();
  const result = new ItemBonusCollection();
  result.incapable = rules.incapable.some(match => name.includes(match.toLowerCase()));
  addMatches(result, rules.minusTwo, name, -2);
  addMatches(result, rules.minusOne, name, -1);
  addMatches(result, rules.plusOne, name, 1);
  addMatches(result, rules.plusTwo, name, 2);
  return result;
}

const OFFENSIVE = {
  incapable: ['Discharged ', 'Friendly ', 'Baby', 'Fake', 'Artificial ', 'Replica ', 'False', 'Uncharged '],
  minusTwo: ['broken ', 'Slime', 'Gooey '],
  minusOne: ['Ripped ', 'Fragile ', 'Crumbling ', 'Dull ', 'Stuffed ', 'Soft ', 'Fluffy ', 'Ill ', 'Plush', 'Defeat ', 'Depress', 'Artificial ', 'Damaged '],
  plusOne: ['Heavy ', 'Blunt ', 'Pointy ', 'Charged ', 'Cat ', 'Poison', 'Double ', 'Bees ', 'Military grade ', 'Power', 'Shark ', 'Bear ', 'Tiger ', 'Lion '],
  plusTwo: ['Sharp', 'Weighted ', 'Dangerous', 'Special ', 'Kitten ', 'Super ', 'Magic', 'Orbital ', 'Vorpal ', 'Chicken ', 'Nuclear ', 'Hippo', 'Sacred ', 'Holy ']
};

const DEFENSIVE = {
  incapable: ['Paper ', 'Fragile ', 'Artificial ', 'Replica ', 'Fake', 'False', 'Uncharged '],
  minusTwo: ['Broken '],
  minusOne: ['Ripped ', 'Fragile ', 'Crumbling ', 'Dull', 'Soft ', 'Ill ', 'Plush ', 'Defeat', 'Depress', 'Artificial ', 'Damaged ', 'Hurt '],
  plusOne: ['Hard', 'Solid ', 'Rugged ', 'Charged ', 'Defensive ', 'Military grade ', 'Power'],
  plusTwo: ['Reinforced ', 'Shielded ', 'Robust ', 'Super', 'Magic', 'Sacred ', 'Holy ']
};

const HEALING = {
  incapable: ['Plague', 'Ill ', 'Sick ', 'Infected ', 'Corrupt', 'Fake', 'Replica ', 'Desecrated ', 'Undead ', 'Dead ', 'Disease', 'False', 'Uncharged ', 'Unpowered ', 'Un-powered '],
  minusTwo: ['broken'],
  minusOne: ['Ripped ', 'Crumbling ', 'Ill ', 'Plush ', 'Defeat ', 'Depress', 'Artificial ', 'Damage', 'Attack ', 'Hurt ', 'Bees ', 'Nuclear '],
  plusOne: ['Friend', 'Happy ', 'Charged ', 'Healing ', 'Refreshing ', 'Sugar ', 'Lewd '],
  plusTwo: ['Healthy ', 'Magic', 'Super', 'Sacred ', 'Holy ']
};

function getOffensiveItemBonus(item) {
  return bonusesFor(typeof item?.getName === 'function' ? item.getName() : item, OFFENSIVE);
}

function getDefensiveItemBonus(item) {
  return bonusesFor(typeof item?.getName === 'function' ? item.getName() : item, DEFENSIVE);
}

function getHealingItemBonus(item) {
  return bonusesFor(typeof item?.getName === 'function' ? item.getName() : item, HEALING);
}

module.exports = {
  ItemBonusCollection,
  getDefensiveItemBonus,
  getHealingItemBonus,
  getOffensiveItemBonus
};
