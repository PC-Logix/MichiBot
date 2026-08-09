'use strict';

const potionData = require('../utils/potionData');
const {
  addressedSay,
  pick,
  randInt
} = require('../utils/helper');

const CURSES = [
  'Heckgosh', 'Jeepers', 'By my throth', 'Goshhawk', 'Willikers', 'Dogast',
  'Dagnabbit', 'Consarn it', 'Fopdoodle', 'Gadsbudlikins', 'Potzblitz',
  'Zounderkite', 'Aw jeez', 'Dagnammit', 'Fudge', 'Jiminy Cricket',
  'Dad-Sizzle', 'Bejabbers', 'Sard', 'Waesucks', 'Crud', 'Fiddlesticks'
];

const POSITIVE = [
  'Woooo', 'Yay', 'Yay', 'Boo-yah', 'Huzzah', 'Hooray', 'Yippee', 'Yippee',
  'Kapow', 'Boom', 'Swell', 'Awesome', 'Bingo', 'Eureka', 'Yeah', 'Wild', 'Awesome'
];

const SURPRISED = ['Woah', 'Wah', 'Zoinks', 'Wut', 'Golly', 'Geez', 'Uh-oh', 'Wow', 'Yow'];
const NEGATIVE = ['Darn it', 'Darn', 'Blast', 'Shoot', 'Yikes', 'Eh'];

function randomGarbageName() {
  const item = pick(potionData.garbageItems || []);
  return item && item[1] ? String(item[1]).toLowerCase() : '[Error]';
}

function randomExpression(type = 'all', lowerCase = false) {
  let words = [];

  if (type === 'all') {
    words = CURSES.concat(
      POSITIVE,
      SURPRISED,
      Array.from({ length: 3 }, () => `Holy ${randomGarbageName()} Batman`),
      NEGATIVE
    );
  } else if (type === 'curse') {
    words = CURSES;
  } else if (type === 'positive') {
    words = POSITIVE;
  } else if (type === 'surprised') {
    words = SURPRISED.concat(
      Array.from({ length: 3 }, () => `Holy ${randomGarbageName()} Batman`)
    );
  } else if (type === 'negative') {
    words = NEGATIVE;
  }

  if (!words.length) return '...';
  const result = pick(words);
  return lowerCase ? result.toLowerCase() : result;
}

function randomExclamations() {
  const maxLength = randInt(1, 8);
  let result = '';

  for (let i = 1; i < maxLength; i += 1) {
    result += pick(['!', '1']);
  }

  if (!result.includes('!')) result += '!';
  return result;
}

const sharedCooldown = {
  key: 'exclamation',
  minutes: 5,
  perUser: true
};

module.exports = {
  name: 'Exclamation',
  commands: [
    {
      name: 'curseword',
      aliases: ['curses', 'cursewd', 'cursew', 'swear', 'swearword'],
      help: 'Holy manbats Batman!',
      cooldown: sharedCooldown
    },
    {
      name: 'exclamation',
      aliases: ['excl'],
      help: 'Wot in tarnation?!',
      cooldown: sharedCooldown
    }
  ],

  init() {
    console.log('[Exclamation] initialized');
  },

  handleCommand(ctx) {
    const type = ctx.command === 'curseword' ? 'curse' : 'all';
    addressedSay(ctx, `${randomExpression(type)}${randomExclamations()}`);
  },

  randomExpression,
  randomExclamations
};
