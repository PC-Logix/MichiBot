'use strict';

const { pick, say } = require('../utils/helper');
const potionApi = require('./Potions').api;

const WARP_LOCATIONS = Object.freeze([
  'You end up at home.',
  'You end up in your bed.',
  'You end up in a dimension populated by {transformations}.',
  'You end up in a dimension populated by {transformation} girls.',
  'You end up in a dimension populated by {transformation} boys.',
  'You end up in a dimension populated by {transformation} {transformation2} girls.',
  'You end up in a dimension populated by {transformation} {transformation2} boys.',
  'You end up in a dimension populated by {transformation} {transformations2}.',
  'You end up in a dimension inhabited by {p_transformation}.',
  'You end up in a dimension entirely filled with {consistency} {appearance} potion.',
  'You end up in a dimension ruled by {item}.',
  'You end up in a dimension that is just an endless field of flowers.',
  'You end up in a frozen world.',
  'You end up in a dry world.',
  'You end up in a world inhabited by mimes.',
  'You end up in a world inhabited by bards.',
  'You end up in a world inhabited by clowns.',
  'You end up at the location of a great treasure. The treasure of friendship!'
]);

function renderWarpLocation(template, prefix = '#') {
  return potionApi.renderTemplate(template, { prefix });
}

function randomWarpLocation(prefix = '#') {
  return renderWarpLocation(pick(WARP_LOCATIONS), prefix);
}

module.exports = {
  name: 'Warp',
  commands: [{
    name: 'warp',
    help: 'Go on a vacation! Or end up in a world made out of spaghetti...'
  }],

  init() {
    console.log(`[Warp] initialized with ${WARP_LOCATIONS.length} destinations`);
  },

  handleCommand(ctx) {
    return say(ctx, randomWarpLocation(ctx.prefix || '#'));
  },

  _private: {
    WARP_LOCATIONS,
    randomWarpLocation,
    renderWarpLocation
  }
};
