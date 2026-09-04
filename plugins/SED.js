'use strict';

const optionalHooks = require('../services/optionalHooks');
const { say, text } = require('../utils/helper');

const HOOK_NAME = 'SED';
const MODERATOR = { globalRank: 'Moderator' };
const history = new Map();

function key(channel) {
  return String(channel || '').toLowerCase();
}

function channelFor(ctx) {
  return String(ctx?.replyTarget || ctx?.to || '').trim();
}

function parseSubstitution(input) {
  const value = String(input || '').trim();
  if (!value.startsWith('s/')) return null;

  const separator = value.indexOf('/', 2);
  if (separator < 0) return null;

  const pattern = value.slice(2, separator);
  let remainder = value.slice(separator + 1);
  let flags = '';
  const flagSeparator = remainder.indexOf('/');

  if (flagSeparator >= 0) {
    flags = remainder.slice(flagSeparator + 1);
    if (!/^[gi]*$/.test(flags)) return null;
    remainder = remainder.slice(0, flagSeparator);
  }

  if (!pattern) return null;

  return {
    pattern,
    replacement: remainder,
    flags
  };
}

function remember(ctx) {
  if (ctx?.isPrivate) return;

  const channel = channelFor(ctx);
  if (!channel || !ctx?.text) return;

  const channelKey = key(channel);
  if (!history.has(channelKey)) history.set(channelKey, []);
  const messages = history.get(channelKey);
  messages.push({
    nick: ctx.nick,
    text: ctx.text
  });

  while (messages.length > 50) messages.shift();
}

function applySubstitution(ctx, substitution) {
  const channel = channelFor(ctx);
  if (ctx?.isPrivate || !channel || !optionalHooks.isEnabled(HOOK_NAME, channel)) return false;

  let regex;
  try {
    const flags = `${substitution.flags.includes('g') ? 'g' : ''}${substitution.flags.includes('i') ? 'i' : ''}`;
    regex = new RegExp(substitution.pattern, flags);
  } catch (error) {
    say(ctx, `Bad regex: ${error.message}`);
    return true;
  }

  const messages = (history.get(key(channel)) || []).slice().reverse();
  for (const message of messages) {
    regex.lastIndex = 0;
    if (!regex.test(message.text)) continue;

    regex.lastIndex = 0;
    const replacement = message.text.replace(regex, substitution.replacement);
    if (replacement === message.text) continue;

    say(ctx, `<${message.nick}> ${replacement}`);
    return true;
  }

  say(ctx, 'Nothing to sed.');
  return true;
}

module.exports = {
  name: 'SED',
  commands: [{
    name: 'sed',
    access: MODERATOR,
    cooldown: { seconds: 10 }
  }],

  init() {
    optionalHooks.ensureSchema();
    console.log(`[SED] initialized for ${optionalHooks.getEnabledChannels(HOOK_NAME).length} channel(s)`);
  },

  onMessage(ctx) {
    const substitution = parseSubstitution(ctx?.text);
    if (substitution) {
      applySubstitution(ctx, substitution);
      return;
    }

    remember(ctx);
  },

  handleCommand(ctx) {
    const action = text(ctx).toLowerCase();
    const channel = channelFor(ctx);

    if (action === 'enable') {
      return say(ctx, optionalHooks.enable(HOOK_NAME, channel) ?
        'Enabled SED for this channel.' :
        'SED is already enabled for this channel.');
    }

    if (action === 'disable') {
      return say(ctx, optionalHooks.disable(HOOK_NAME, channel) ?
        'Disabled SED for this channel.' :
        'SED is already disabled for this channel.');
    }

    return say(ctx, `SED is ${optionalHooks.isEnabled(HOOK_NAME, channel) ? 'enabled' : 'disabled'} in this channel.`);
  },

  _private: {
    HOOK_NAME,
    MODERATOR,
    applySubstitution,
    history,
    parseSubstitution,
    remember
  }
};
