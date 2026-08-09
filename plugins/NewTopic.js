'use strict';

const { getDb } = require('../libs/db');
const inventory = require('../services/inventory');
const channelState = require('../utils/channelState');
const { addressedSay, antiPingMessage, pick } = require('../utils/helper');
const { dramaParse } = require('./Drama');

const TRUSTED = { globalRank: 'Trusted' };

function db() {
  const database = getDb();
  database.exec('CREATE TABLE IF NOT EXISTS Topics(id INTEGER PRIMARY KEY, topic)');
  return database;
}

module.exports = {
  name: 'NewTopic',
  commands: [{
    name: 'newtopic',
    help: 'Generates a new topic'
  }, {
    name: 'addtopic',
    access: TRUSTED,
    help: 'Add a topic to the random topic list.'
  }, {
    name: 'deltopic',
    access: TRUSTED,
    help: 'Delete a topic by ID.'
  }],

  init() {
    db();
    inventory.ensureSchema();
    console.log('[NewTopic] initialized');
  },

  handleCommand(ctx) {
    const params = Array.isArray(ctx.args) ? ctx.args.join(' ').trim() : '';

    if (ctx.command === 'addtopic') {
      if (!params) return addressedSay(ctx, 'Missing required argument: Topic');
      db().prepare('INSERT INTO Topics(topic) VALUES (?)').run(params);
      return addressedSay(ctx, 'Ok');
    }

    if (ctx.command === 'deltopic') {
      if (!/^-?\d+$/.test(params)) return addressedSay(ctx, 'TopicID must be an integer.');
      db().prepare('DELETE FROM Topics WHERE id = ?').run(Number(params));
      return addressedSay(ctx, 'Ok');
    }

    const row = db().prepare('SELECT id, topic FROM Topics ORDER BY RANDOM() LIMIT 1').get();
    let message = row ? `#${row.id} ${row.topic}` : '';

    if (/\[randomitem\]/i.test(message)) {
      const item = inventory.getRandomItem(true);
      if (item) message = message.replace(/\[randomitem\]/i, item.getName(true));
    }
    if (/\[drama\]/i.test(message)) message = message.replace(/\[drama\]/i, dramaParse());
    if (/\[randomuser\]/i.test(message)) {
      const users = channelState.getUsers(ctx.replyTarget || ctx.to);
      if (users.length) message = message.replace(/\[randomuser\]/i, pick(users));
    }

    const users = channelState.getUsers(ctx.replyTarget || ctx.to);
    return addressedSay(ctx, antiPingMessage(message, users));
  }
};
