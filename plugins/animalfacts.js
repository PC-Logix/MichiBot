'use strict';

const https = require('https');

const ANIMAL_NAMES = [
  'dog',
  'cat',
  'panda',
  'fox',
  'red_panda',
  'koala',
  'birb',
  'bird',
  'racoon',
  'raccoon',
  'kangaroo'
];

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function normalizeAnimal(input) {
  let animal = String(input || '').trim().toLowerCase();

  if (!animal || animal === 'random') {
    animal = randomItem(ANIMAL_NAMES);
  }

  if (animal === 'birb') {
    animal = 'bird';
  } else if (animal === 'red panda') {
    animal = 'red_panda';
  } else if (animal === 'racoon') {
    animal = 'raccoon';
  }

  return animal;
}

function titleCaseAnimal(animal) {
  const pretty = String(animal || '').replace(/_/g, ' ');
  return pretty.charAt(0).toUpperCase() + pretty.slice(1);
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let body = '';

      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }

      res.setEncoding('utf8');

      res.on('data', (chunk) => {
        body += chunk;
      });

      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(new Error(`Invalid JSON response: ${err.message}`));
        }
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

async function getAnimalFact(animal) {
  const url = `https://some-random-api.com/animal/${encodeURIComponent(animal)}`;
  const json = await fetchJson(url);

  if (!json || typeof json.fact !== 'string' || !json.fact.trim()) {
    throw new Error('API response did not contain a fact');
  }

  return json.fact.trim();
}

module.exports = {
  commands: ['catfact', 'catfacts', 'fact'],

  init() {
    console.log('[animalfacts] initialized');
  },

  dispose() {
    console.log('[animalfacts] disposed');
  },

  async handleCommand(ctx) {
    if (ctx.command === 'catfact' || ctx.command === 'catfacts') {
      try {
        const fact = await getAnimalFact('cat');
        ctx.reply(ctx.to, fact);
      } catch (err) {
        console.error('[animalfacts] catfact failed:', err);
        ctx.reply(ctx.to, 'Failed to fetch a cat fact.');
      }
      return;
    }

    if (ctx.command === 'fact') {
      const requestedAnimal = ctx.args.join(' ');
      const animal = normalizeAnimal(requestedAnimal);

      if (!ANIMAL_NAMES.includes(animal) && animal !== 'bird' && animal !== 'raccoon') {
        ctx.reply(ctx.to, `Not a valid option. ${ANIMAL_NAMES.join(', ')}`);
        return;
      }

      try {
        const fact = await getAnimalFact(animal);
        ctx.reply(ctx.to, `${titleCaseAnimal(animal)} fact: ${fact}`);
      } catch (err) {
        console.error('[animalfacts] fact failed:', err);
        ctx.reply(ctx.to, `Failed to fetch a fact for ${titleCaseAnimal(animal)}.`);
      }
    }
  }
};