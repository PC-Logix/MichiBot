'use strict';

const {
  say,
  text
} = require('../utils/helper');

const COUNTERS_A = ['a', 'an', 'the', 'a whole lot of', 'many', 'a lot of', 'a number of'];
const COUNTERS_TWENTY = ['twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const COUNTERS_ONE = [
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen',
  'eighteen', 'nineteen'
];
const COUNTERS_HUNDRED = [
  'hundred', 'thousand', 'million', 'milliard', 'billion', 'billiard', 'trillion',
  'quadrillion', 'quintillion', 'sextillion', 'septillion', 'octillion', 'nonillion',
  'decillion', 'undecillion', 'duodecillion', 'tredecillion', 'quattuordecillion',
  'quindecillion', 'sexdecillion', 'septendecillion', 'octodecillion',
  'novemdecillion', 'vigintillion', 'centillion'
];

function matchPrefix(input, prefix) {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return String(input || '').match(new RegExp(`^(${escaped}) (.*)$`, 'i'));
}

function solvePrefixes(input) {
  for (const prefix of COUNTERS_A) {
    const match = matchPrefix(input, prefix);
    if (!match) continue;

    for (const magnitude of COUNTERS_HUNDRED) {
      const extended = matchPrefix(input, `${prefix} ${magnitude}`);
      if (extended) return [extended[1], extended[2]];
    }
    return [match[1], match[2]];
  }

  for (const prefix of COUNTERS_ONE) {
    const match = matchPrefix(input, prefix);
    if (!match) continue;

    for (const magnitude of COUNTERS_HUNDRED) {
      const extended = matchPrefix(input, `${prefix} ${magnitude}`);
      if (extended) return [extended[1], extended[2]];
    }
    return [match[1], match[2]];
  }

  for (const prefix of COUNTERS_TWENTY) {
    const match = matchPrefix(input, prefix);
    if (!match) continue;

    for (const one of COUNTERS_ONE) {
      const extended = matchPrefix(input, `${prefix} ${one}`);
      if (!extended) continue;

      for (const magnitude of COUNTERS_HUNDRED) {
        const full = matchPrefix(input, `${prefix} ${one} ${magnitude}`);
        if (full) return [full[1], full[2]];
      }
      return [extended[1], extended[2]];
    }

    for (const magnitude of COUNTERS_HUNDRED) {
      const extended = matchPrefix(input, `${prefix} ${magnitude}`);
      if (extended) return [extended[1], extended[2]];
    }
    return [match[1], match[2]];
  }

  return null;
}

function parseItem(ctx) {
  const raw = text(ctx);
  const quoted = raw.match(/^"(.*?)(?<!\\)"/);
  return quoted ? quoted[1].replace(/\\"/g, '"') : raw;
}

module.exports = {
  name: 'MakeMagic',
  commands: [{
    name: 'makemagic',
    help: 'Magic?'
  }],

  init() {
    console.log('[MakeMagic] initialized');
  },

  handleCommand(ctx) {
    const item = parseItem(ctx);
    if (!item) return say(ctx, `Usage: ${ctx.prefix}makemagic Item:string`);

    const prefixes = solvePrefixes(item);
    return say(ctx, prefixes ? prefixes.join(' magic ') : "Seems I'm out of mana...");
  },

  solvePrefixes
};
