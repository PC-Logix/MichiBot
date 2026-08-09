'use strict';

const optionalHooks = require('../services/optionalHooks');
const moderation = require('../services/moderation');
const { addressedSay, say, text } = require('../utils/helper');

const HOOK_NAME = 'antispam';
const NEW_USER_WINDOW_MS = 5_000;
const CHANNEL_OP_OR_ADMIN = {
  anyOf: [
    { globalRank: 'Admin' },
    {
      allOf: [
        { channelOnly: true },
        { channelMode: 'op' }
      ]
    }
  ]
};

const newUsers = new Map();

function userKey(channel, nick) {
  return `${String(channel || '').trim().toLowerCase()}\u0000${String(nick || '').trim().toLowerCase()}`;
}

function prune(now = Date.now()) {
  for (const [key, expires] of newUsers) {
    if (expires <= now) newUsers.delete(key);
  }
}

function recordJoin(channel, nick, now = Date.now()) {
  const key = userKey(channel, nick);
  if (!channel || !nick) return false;
  prune(now);
  newUsers.set(key, Number(now) + NEW_USER_WINDOW_MS);
  return true;
}

function isNewUser(channel, nick, now = Date.now()) {
  prune(now);
  return (newUsers.get(userKey(channel, nick)) || 0) > Number(now);
}

function isAllUpperCase(value) {
  const input = String(value || '');
  if (!input || !/^[\p{L}\p{N}]+$/u.test(input)) return false;
  for (const char of input) {
    if (char === char.toLowerCase() && char !== char.toUpperCase()) return false;
  }
  return true;
}

module.exports = {
  name: 'SpamDetect',
  commands: [{
    name: 'antispam',
    access: CHANNEL_OP_OR_ADMIN
  }],

  init() {
    optionalHooks.ensureSchema();
    newUsers.clear();
    console.log(`[SpamDetect] initialized for ${optionalHooks.getEnabledChannels(HOOK_NAME).length} channel(s)`);
  },

  dispose() {
    newUsers.clear();
  },

  onJoin(event) {
    recordJoin(event?.channel, event?.nick);
  },

  onMessage(ctx) {
    const channel = ctx.to;
    if (ctx.isPrivate || !optionalHooks.isEnabled(HOOK_NAME, channel)) return;
    if (!isNewUser(channel, ctx.nick) || !isAllUpperCase(ctx.text)) return;
    moderation.sendChanServ(ctx, `kick ${channel} ${ctx.nick} Possible Spam detected!`);
    newUsers.delete(userKey(channel, ctx.nick));
  },

  handleCommand(ctx) {
    const action = text(ctx).toLowerCase();
    const channel = ctx.replyTarget || ctx.to;

    if (action === 'enable') {
      return addressedSay(ctx, optionalHooks.enable(HOOK_NAME, channel) ?
        'Enabled antispam for this channel' :
        'Antispam is already enabled for this channel');
    }

    if (action === 'disable') {
      return addressedSay(ctx, optionalHooks.disable(HOOK_NAME, channel) ?
        'Disabled antispam for this channel' :
        'Antispam is already disabled for this channel');
    }

    if (action === 'list') {
      return say(ctx, `Enabled antispam channels: [${optionalHooks.getEnabledChannels(HOOK_NAME).join(', ')}]`);
    }

    return addressedSay(ctx, `Usage: ${ctx.prefix}antispam <enable|disable|list>`);
  },

  _private: {
    CHANNEL_OP_OR_ADMIN,
    HOOK_NAME,
    NEW_USER_WINDOW_MS,
    isAllUpperCase,
    isNewUser,
    newUsers,
    prune,
    recordJoin,
    userKey
  }
};
