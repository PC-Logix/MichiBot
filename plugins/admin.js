'use strict';

let admin = null;
let bot = null;

const commandSpecs = [
  { name: 'listplugins', access: { globalRank: 'Admin' } },
  { name: 'listcommands', access: { public: true } },
  { name: 'loadplugin', access: { globalRank: 'Admin' } },
  { name: 'unloadplugin', access: { globalRank: 'Admin' } },
  { name: 'reloadplugin', access: { globalRank: 'Admin' } },
  {
    name: 'changeprefix',
    access: {
      anyOf: [
        { globalRank: 'Admin' },
        { allOf: [{ channelOnly: true }, { channelMode: 'op' }] }
      ]
    }
  },
  { name: 'greet', access: { globalRank: 'Admin' } },
  {
    name: 'part',
    access: {
      anyOf: [
        { globalRank: 'Admin' },
        { allOf: [{ channelOnly: true }, { channelMode: 'op' }] }
      ]
    }
  }
];

function usage(ctx, text) {
  ctx.reply(ctx.replyTarget, `Usage: ${bot.getPrefix()}${text}`);
}

function getArg(ctx, index) {
  return String(ctx.args?.[index] || '').trim();
}

module.exports = {
  commands: commandSpecs,

  init(ctx) {
    bot = ctx.bot;
    admin = ctx.modules?.admin;
    console.log('[admin-plugin] initialized');
  },

  async handleCommand(ctx) {
    switch (ctx.command) {
      case 'listplugins': {
        const plugins = admin.listPlugins();
        ctx.reply(ctx.replyTarget, `Plugins: ${plugins.join(', ') || '(none)'}`);
        return;
      }

      case 'listcommands': {
        const visible = await admin.listVisibleCommands(ctx);
        ctx.reply(ctx.replyTarget, `Commands: ${visible.join(', ') || '(none)'}`);
        return;
      }

      case 'loadplugin': {
        const pluginName = getArg(ctx, 0);
        if (!pluginName) return usage(ctx, 'loadplugin <plugin>');

        const result = await admin.loadPlugin(pluginName);
        ctx.reply(ctx.replyTarget, result.message);
        return;
      }

      case 'unloadplugin': {
        const pluginName = getArg(ctx, 0);
        if (!pluginName) return usage(ctx, 'unloadplugin <plugin>');

        const result = await admin.unloadPlugin(pluginName);
        ctx.reply(ctx.replyTarget, result.message);
        return;
      }

      case 'reloadplugin': {
        const pluginName = getArg(ctx, 0);
        if (!pluginName) return usage(ctx, 'reloadplugin <plugin>');

        const result = await admin.reloadPlugin(pluginName);
        ctx.reply(ctx.replyTarget, result.message);
        return;
      }

      case 'changeprefix': {
        const newPrefix = getArg(ctx, 0);
        if (!newPrefix) return usage(ctx, 'changeprefix <prefix>');

        const result = admin.changePrefix(newPrefix, true);
        ctx.reply(ctx.replyTarget, result.message);
        return;
      }

      case 'part': {
        const targetChannel = getArg(ctx, 0) || (!ctx.isPrivate ? ctx.to : '');
        if (!targetChannel) return usage(ctx, 'part <channel>');

        const result = admin.partChannel(targetChannel, ctx.nick);
        ctx.reply(ctx.replyTarget, result.message);
        return;
      }

      case 'greet':
        ctx.reply(ctx.replyTarget, 'Lasciate ogne speranza, voi ch\'intrate');
        return;
    }
  }
};