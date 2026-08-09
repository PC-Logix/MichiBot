'use strict';

const optionalHooks = require('../services/optionalHooks');
const { pick, say, text } = require('../utils/helper');

const HOOK_NAME = 'alot';
const LUA_RESPONSES = Object.freeze([
  'Lua*',
  "It's Lua, not LUA. Name not an acronym."
]);

const CHANNEL_OP_OR_ADMIN = {
  allOf: [
    { channelOnly: true },
    {
      anyOf: [
        { globalRank: 'Admin' },
        { channelMode: 'op' }
      ]
    }
  ]
};

function getEnabledChannels() {
  return optionalHooks.getEnabledChannels(HOOK_NAME);
}

function isEnabled(channel) {
  return optionalHooks.isEnabled(HOOK_NAME, channel);
}

function enable(channel) {
  return optionalHooks.enable(HOOK_NAME, channel);
}

function disable(channel) {
  return optionalHooks.disable(HOOK_NAME, channel);
}

function commandPrefix(ctx) {
  return String(ctx?.prefix || ctx?.bot?.getPrefix?.() || '#');
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function handlePassive(ctx) {
  if (ctx.isPrivate || !isEnabled(ctx.replyTarget || ctx.to)) return false;

  const message = String(ctx.text || ctx.message || '').trim();
  const prefix = commandPrefix(ctx);
  if (new RegExp(`^${escapeRegex(prefix)}alot(?:\\s|$)`, 'i').test(message)) return false;

  if (/\balot\b/i.test(message)) {
    say(ctx, 'ALOT: http://tinyurl.com/y42zurt');
    return true;
  }
  if (/\bLUA\b/.test(message)) {
    say(ctx, pick(LUA_RESPONSES));
    return true;
  }
  return false;
}

module.exports = {
  name: 'Alot',
  commands: [{
    name: 'alot',
    access: CHANNEL_OP_OR_ADMIN,
    help: 'Enable or disable Alot and LUA corrections for this channel.'
  }],

  init() {
    optionalHooks.ensureSchema();
    console.log(`[Alot] initialized for ${getEnabledChannels().length} channel(s)`);
  },

  onMessage(ctx) {
    return handlePassive(ctx);
  },

  handleCommand(ctx) {
    const action = text(ctx).toLowerCase();
    const channel = ctx.replyTarget || ctx.to;

    if (action === 'enable') {
      enable(channel);
      return say(ctx, 'Enabled Alot for this channel');
    }
    if (action === 'disable') {
      if (disable(channel)) return say(ctx, 'Disabled Alot for this channel');
      return say(ctx, 'Alot is not enabled for this channel');
    }
    if (action === 'list') {
      return say(ctx, `Enabled Alot channels: [${getEnabledChannels().join(', ')}]`);
    }
    return say(ctx, `Usage: ${commandPrefix(ctx)}alot <enable|disable|list>`);
  },

  _private: {
    CHANNEL_OP_OR_ADMIN,
    HOOK_NAME,
    LUA_RESPONSES,
    disable,
    enable,
    getEnabledChannels,
    handlePassive,
    isEnabled
  }
};
