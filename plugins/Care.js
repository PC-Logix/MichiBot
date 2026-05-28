'use strict';
const {
  pick,
  say
} = require('../utils/helper');
const responses = ['Care level: 0%.', 'The care-o-meter flickers, sighs, and dies.',
  'A nearby lamp cares more than I do.', 'Care level: dangerously high.', 'Some care detected. Please recalibrate.'
];
module.exports = {
  name: 'Care',
  commands: [{ name: 'care', aliases: ['care-o-meter', 'careometer', 'doicare', 'howmuchcare'], cooldown: { seconds: 60 } }],
  init() {
    console.log('[Care] initialized');
  },
  async handleCommand(ctx) {
    say(ctx, pick(responses));
  }
};
