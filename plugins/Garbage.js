'use strict';
const {
  act,
  pick,
  text
} = require('../utils/helper');
const places = ['into the sun', 'down a garbage chute', 'into a suspicious portal', 'behind the couch',
  'into low orbit', 'where it belongs'
];
module.exports = {
  name: 'Garbage',
  commands: [{ name: 'garbage', aliases: ['gb'] }],
  init() {
    console.log('[Garbage] initialized');
  },
  async handleCommand(ctx) {
    const item = text(ctx);
    act(ctx, item ? `throws '${item}' ${pick(places)}, it was never seen again.` : `kicks a can ${pick(places)}`);
  }
};
