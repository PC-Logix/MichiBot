'use strict';

const {
  addressedSay
} = require('../utils/helper');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad(value) {
  return String(value).padStart(2, '0');
}

function formatGmt(date = new Date()) {
  return `${date.getUTCFullYear()}-${MONTHS[date.getUTCMonth()]}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

module.exports = {
  name: 'OCTime',
  commands: [{
    name: 'octime',
    aliases: ['time'],
    help: 'Returns the time in GMT'
  }],

  init() {
    console.log('[OCTime] initialized');
  },

  handleCommand(ctx) {
    addressedSay(ctx, formatGmt());
  },

  formatGmt
};
