'use strict';

const {
  act,
  text
} = require('../utils/helper');

function parseLegacyArguments(input) {
  const raw = String(input || '').trim();
  if (!raw) return { thing: '', times: null };

  const quoted = raw.match(/^"(.*?)(?<!\\)"/);
  if (quoted) {
    const remainder = raw.slice(quoted[0].length).replace(/^ /, '');
    const timesMatch = remainder.match(/^(\d+)(?:\s|$)/);
    return {
      thing: quoted[1].replace(/\\"/g, '"'),
      times: timesMatch ? Number.parseInt(timesMatch[1], 10) : null
    };
  }

  const match = raw.match(/^(\S+)(?:\s+(.*))?$/);
  const thing = match ? match[1] : raw;
  const remainder = match ? String(match[2] || '') : '';
  const timesMatch = remainder.match(/^(\d+)(?:\s|$)/);

  return {
    thing,
    times: timesMatch ? Number.parseInt(timesMatch[1], 10) : null
  };
}

module.exports = {
  name: 'Jiggle',
  commands: [{
    name: 'jiggle',
    help: 'Jiggle',
    cooldown: {
      seconds: 120,
      perUser: true,
      ignorePermissions: true
    }
  }],

  init() {
    console.log('[Jiggle] initialized');
  },

  handleCommand(ctx) {
    const { thing, times } = parseLegacyArguments(text(ctx));

    if (!thing) return act(ctx, 'jiggles');
    if (times === null) return act(ctx, `jiggles ${thing}`);
    return act(ctx, `jiggles ${thing} ${times} times`);
  },

  parseLegacyArguments
};
