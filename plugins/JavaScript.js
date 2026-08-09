'use strict';

const { runJavaScriptSnippet } = require('../utils/jsSandbox');
const { say, text } = require('../utils/helper');

function sandboxContext(ctx) {
  return {
    nick: ctx.nick,
    target: ctx.to,
    channel: ctx.isPrivate ? '' : ctx.to,
    argument: text(ctx),
    args: ctx.args || [],
    command: ctx.command,
    prefix: ctx.prefix
  };
}

function sandboxOptions(ctx) {
  const config = ctx.config?.jsSandbox || {};
  return {
    timeoutMs: Number(config.timeoutMs || 1_000),
    maxLength: Number(config.maxMessageLength || 420),
    maxOutputLength: Number(config.maxOutputLength || 2_000),
    maxScriptLength: Number(config.maxScriptLength || 8_000)
  };
}

module.exports = {
  name: 'JavaScript',
  commands: [{
    name: 'js',
    access: { public: true },
    cooldown: { seconds: 10, perUser: true, ignorePermissions: true }
  }],

  init() {
    console.log('[JavaScript] isolated sandbox initialized');
  },

  async handleCommand(ctx) {
    const snippet = text(ctx);
    if (!snippet) return say(ctx, 'No snippet provided.');
    try {
      const result = await runJavaScriptSnippet(snippet, sandboxContext(ctx), sandboxOptions(ctx));
      if (result) return say(ctx, result);
    } catch (error) {
      return say(ctx, error.message || String(error));
    }
  },

  _private: {
    sandboxContext,
    sandboxOptions
  }
};
