'use strict';

const {
  getDb
} = require('../libs/db');
const {
  act
} = require('../utils/helper');

module.exports = {
  name: 'DbVersion',
  commands: [{
    name: 'dbversion',
    help: 'Get current database version'
  }],

  init() {
    console.log('[DbVersion] initialized');
  },

  handleCommand(ctx) {
    const version = getDb().pragma('user_version', { simple: true });
    act(ctx, `Database version: ${version}`);
  }
};
