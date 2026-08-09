'use strict';

const channelState = require('../utils/channelState');
const {
  addressedSay,
  antiPingMessage,
  pick,
  say,
  splitLegacyMessage
} = require('../utils/helper');

const SENTENCES = [
  "In this Star Wars movie, our heroes return to take on the First Order and new villain [1] with help from their new friend [2].  Rey builds a new Light Saber with a [3] blade, and they head out to confront The First Order's new superweapon The [4], a space station capable of [5].  They unexpectedly join forces with their old enemy [6] and destroy the superwapon in a battle featuring [7] P.S. Rey's parents are [8] and [9]."
];

const WORDS = {
  1: ['Kyle Ren', 'Malloc', 'Darth Sebelius', 'Theranos', 'Lord Juul'],
  2: ['Kim Spacemeasurer', 'Teen Yoda', 'Dab Tweetdeck', 'Yaz Progestin', 'TI-83'],
  3: ['beige', 'ochre', 'mauve', 'aquamarine', 'taupe'],
  4: ['Sun Obliterator', 'Moonsquisher', 'World Eater', 'Planet Zester', 'Superconducting Supercollider'],
  5: [
    'blowing up a planet with a bunch of beams of energy that combine into one',
    'blowing up a bunch of planets with one beam of energy that splits into many',
    'cutting a planet in half and smashing the halves together like two cymbals',
    'increasing the CO2 levels in a planets atmosphere, causing rapid heating',
    'triggering the end credits before the movie is done'
  ],
  6: ['Boba Fett', 'Slacious Crumb', 'The Space Slug', 'The Bottom Half of Darth Maul', 'YouTube Commenters'],
  7: [
    'a bow that shoots little Lightsaber-headed arrows',
    'X-Wings and TIE Fighters dodging the giant letters of the opening crawl',
    'a Sith educational display that uses force lightning to demonstate the dielectric breakdown of air',
    'Kylo Ren putting on another helmet over his smaller one',
    'a Sith car wash where the bristles on the brushes are little Lightsabers'
  ],
  8: ['Luke', 'Leia', 'Han', 'Obi-Wan', 'A Random Junk Trader'],
  9: ['Poe', 'BB-8', 'Amilyn Holdo', 'Laura Dern', 'A Random Junk Trader', 'That One Droid from the Jawa Sandcrawler that says Gronk']
};

function spoilerParse() {
  let spoiler = pick(SENTENCES);

  for (const [key, values] of Object.entries(WORDS)) {
    spoiler = spoiler.replace(new RegExp(`\\[${key}\\]`, 'g'), () => pick(values));
  }

  return spoiler;
}

module.exports = {
  name: 'SWSpoilerGen',
  commands: [{
    name: 'swspoiler',
    help: 'Generates a random spoiler for Star Wars'
  }],

  init() {
    console.log('[SWSpoilerGen] initialized');
  },

  handleCommand(ctx) {
    const target = ctx.replyTarget || ctx.to;
    const users = channelState.getUsers(target);
    const spoiler = antiPingMessage(spoilerParse(), users);

    if (spoiler.length <= 320) {
      addressedSay(ctx, spoiler);
      return;
    }

    for (const line of splitLegacyMessage(spoiler, 320)) {
      say(ctx, line);
    }
  },

  spoilerParse
};
