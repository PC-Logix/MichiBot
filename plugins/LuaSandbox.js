'use strict';

const { say, text } = require('../utils/helper');

const {
  runLuaSnippet,
  runSeleneSnippet,
  resetLuaSandbox,
  shutdownLuaSandbox
} = require('../utils/luaSandbox');

const PUBLIC = {
  public: true
};

function luaContext(ctx) {
  return {
    nick: ctx.nick,
    target: ctx.to,
    channel: ctx.isPrivate ? '' : ctx.to,
    argument: (ctx.args || []).join(' '),
    args: ctx.args || [],
    command: ctx.command,
    prefix: ctx.prefix
  };
}

function luaOptions(ctx) {
  const cfg = ctx.config?.luaSandbox || {};

  return {
    baseDir: ctx.baseDir,
    timeoutMs: Number(cfg.timeoutMs || 3500),
    maxLength: Number(cfg.maxMessageLength || 420),
    maxOutputLength: Number(cfg.maxOutputLength || 2000)
  };
}

async function runAndReply(ctx, runner, snippet) {
  if (!snippet) {
    return say(ctx, 'No snippet provided.');
  }

  try {
    const result = await runner(snippet, luaContext(ctx), luaOptions(ctx));

    if (result) {
      return say(ctx, result);
    }

    return undefined;
  } catch (err) {
    return say(ctx, err.message || String(err));
  }
}

module.exports = {
  name: 'LuaSandbox',

  commands: [
    {
      name: 'lua',
      access: PUBLIC,
      cooldown: { seconds: 10, perUser: true, ignorePermissions: true }
    },
    {
      name: 'selene',
      access: PUBLIC,
      cooldown: { seconds: 10, perUser: true, ignorePermissions: true }
    },
    {
      name: 'resetlua',
      access: {
        globalRank: 'Admin'
      }
    }
  ],

  init() {
    console.log('[LuaSandbox] initialized');
  },

  dispose() {
    shutdownLuaSandbox();
  },

  async handleCommand(ctx) {
    const snippet = text(ctx);

    if (ctx.command === 'resetlua') {
      const result = await resetLuaSandbox(luaOptions(ctx));
      return say(ctx, result || 'Sandbox reset');
    }

    if (ctx.command === 'lua') {
      if (/^reset\b/i.test(snippet)) {
        const result = await resetLuaSandbox(luaOptions(ctx));
        return say(ctx, result || 'Sandbox reset');
      }

      return runAndReply(ctx, runLuaSnippet, snippet);
    }

    if (ctx.command === 'selene') {
      return runAndReply(ctx, runSeleneSnippet, snippet);
    }

    return undefined;
  }
};