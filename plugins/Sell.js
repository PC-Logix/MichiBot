'use strict';

const {
  addressedSay,
  pick,
  text
} = require('../utils/helper');

const SALES_PITCHES = Object.freeze([
  'New %s! Buy now! Only 99.99! ',
  'Buy the new %s now to enhance your life!',
  '%s is now in stock! Get it before it\'s gone! 88.99 plus tax!',
  'Tired of being tired? Buy %s now and then go to bed!',
  'Get the fantastic %s now while it\'s available! Only 99.50!',
  'Happy to be alive? %s will make you 300% happier! (Side effects include not getting happier)'
]);

function salesPitch(item, template = pick(SALES_PITCHES)) {
  return String(template || '').replace('%s', String(item || ''));
}

module.exports = {
  name: 'Sell',
  commands: [{
    name: 'sell',
    help: 'Returns a sales pitch for the given argument.'
  }],

  init() {
    console.log('[Sell] initialized');
  },

  handleCommand(ctx) {
    const item = text(ctx);
    if (!item) return addressedSay(ctx, 'Missing required argument: Item');
    return addressedSay(ctx, salesPitch(item));
  },

  _private: {
    SALES_PITCHES,
    salesPitch
  }
};
