'use strict';

let admin = null;
let bot = null;

function safeRequireHelper() {
  try {
    return require('../utils/helper');
  } catch (_) {
    return {};
  }
}

const helper = safeRequireHelper();

const adminAccess = {
  globalRank: 'Admin'
};

const channelOpOrAdminAccess = {
  anyOf: [
    {
      globalRank: 'Admin'
    },
    {
      allOf: [
        {
          channelOnly: true
        },
        {
          channelMode: 'op'
        }
      ]
    }
  ]
};

const commandSpecs = [
  {
    name: 'listplugins',
    access: adminAccess
  },
  {
    name: 'listcommands',
    access: {
      public: true
    }
  },
  {
    name: 'listaliases',
    access: {
      public: true
    },
    cooldown: { seconds: 60 },
    aliases: ['aliases', 'alias']
  },
  {
    name: 'loadplugin',
    access: adminAccess
  },
  {
    name: 'unloadplugin',
    access: adminAccess
  },
  {
    name: 'reloadplugin',
    access: adminAccess
  },
  {
    name: 'changeprefix',
    access: channelOpOrAdminAccess
  },
  {
    name: 'greet',
    access: adminAccess
  },
  {
    name: 'part',
    access: channelOpOrAdminAccess
  },
  {
    name: 'raw',
    access: adminAccess
  },
  {
    name: 'join',
    access: adminAccess
  },
  {
    name: 'cycle',
    access: adminAccess
  },
  {
    name: 'chnick',
    access: adminAccess
  },
  {
    name: 'ram',
    access: adminAccess
  }
];

function getPrefix(ctx) {
  if (ctx?.prefix) return ctx.prefix;
  if (bot && typeof bot.getPrefix === 'function') return bot.getPrefix();
  return '#';
}

function reply(ctx, message) {
  if (helper.say) return helper.say(ctx, message);
  return ctx.reply(ctx.replyTarget, message);
}

function fullText(ctx) {
  if (helper.text) return helper.text(ctx);
  return String(ctx.args?.join(' ') || '').trim();
}

function usage(ctx, text) {
  return reply(ctx, `Usage: ${getPrefix(ctx)}${text}`);
}


function escapeRegex(text) {
  return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getBotNames(ctx) {
  const names = new Set();

  const liveNick = String(ctx?.client?.user?.nick || '').trim();
  if (liveNick) names.add(liveNick);

  const configuredNick = String(ctx?.config?.userName || '').trim();
  if (configuredNick) names.add(configuredNick);

  const configuredRealName = String(ctx?.config?.realName || '').trim();
  if (configuredRealName && !/\s/.test(configuredRealName)) {
    names.add(configuredRealName);
  }

  const extraNames = Array.isArray(ctx?.config?.nameCommands?.names) ?
    ctx.config.nameCommands.names :
    [];

  for (const name of extraNames) {
    const trimmed = String(name || '').trim();
    if (trimmed) names.add(trimmed);
  }

  return Array.from(names);
}

function isPrefixInquiry(ctx) {
  const message = String(ctx?.text || ctx?.message || '').trim();
  if (!message) return false;

  for (const botName of getBotNames(ctx)) {
    const pattern = new RegExp(
      `^${escapeRegex(botName)}\\s*(?::|,)?\\s*(?:prefix|commandchar|commandprefix)\\s*[?.!]*\\s*$`,
      'i'
    );

    if (pattern.test(message)) {
      return true;
    }
  }

  return false;
}

function getArg(ctx, index) {
  return String(ctx.args?.[index] || '').trim();
}

function rawWrite(ctx, line) {
  if (typeof ctx.client.raw === 'function') {
    ctx.client.raw(line);
    return true;
  }

  if (ctx.client.connection?.write) {
    ctx.client.connection.write(line + '\r\n');
    return true;
  }

  return false;
}

function joinChannel(ctx, channel, key) {
  if (ctx.bot && typeof ctx.bot.joinChannel === 'function') {
    ctx.bot.joinChannel(channel, key || '');
    return true;
  }

  if (ctx.client && typeof ctx.client.join === 'function') {
    if (key) ctx.client.join(channel, key);
    else ctx.client.join(channel);
    return true;
  }

  return rawWrite(ctx, key ? `JOIN ${channel} ${key}` : `JOIN ${channel}`);
}

function partChannel(ctx, channel, reason) {
  if (admin && typeof admin.partChannel === 'function') {
    return admin.partChannel(channel, reason);
  }

  if (ctx.client && typeof ctx.client.part === 'function') {
    ctx.client.part(channel, reason || 'Leaving');
    return {
      ok: true,
      message: `Parting ${channel}`
    };
  }

  if (rawWrite(ctx, `PART ${channel} :${reason || 'Leaving'}`)) {
    return {
      ok: true,
      message: `Parting ${channel}`
    };
  }

  return {
    ok: false,
    message: 'Unable to part channel.'
  };
}

module.exports = {
  name: 'admin',
  commands: commandSpecs,

  init(ctx) {
    bot = ctx.bot;
    admin = ctx.modules?.admin;
    console.log('[admin-plugin] initialized');
  },

  async onMessage(ctx) {
    if (!isPrefixInquiry(ctx)) {
      return;
    }

    return reply(ctx, getPrefix(ctx));
  },

  async handleCommand(ctx) {
    switch (ctx.command) {
      case 'listplugins': {
        const plugins = admin.listPlugins();
        return reply(ctx, `Plugins: ${plugins.join(', ') || '(none)'}`);
      }

      case 'listcommands': {
        const visible = await admin.listVisibleCommands(ctx);
        return reply(ctx, `Commands: ${visible.join(', ') || '(none)'}`);
      }

      case 'listaliases': {
        const aliases = ctx.commands.listAliases()
          .filter(alias => !alias.hidden)
          .map(alias => {
            const defaults = alias.defaultArgs.length ? ` ${alias.defaultArgs.join(' ')}` : '';
            return `${alias.name}->${alias.target}${defaults}`;
          });

        return reply(ctx, `Aliases: ${aliases.join(', ') || '(none)'}`);
      }

      case 'loadplugin': {
        const pluginName = getArg(ctx, 0);
        if (!pluginName) return usage(ctx, 'loadplugin <plugin>');

        const result = await admin.loadPlugin(pluginName);
        return reply(ctx, result.message);
      }

      case 'unloadplugin': {
        const pluginName = getArg(ctx, 0);
        if (!pluginName) return usage(ctx, 'unloadplugin <plugin>');

        const result = await admin.unloadPlugin(pluginName);
        return reply(ctx, result.message);
      }

      case 'reloadplugin': {
        const pluginName = getArg(ctx, 0);
        if (!pluginName) return usage(ctx, 'reloadplugin <plugin>');

        const result = await admin.reloadPlugin(pluginName);
        return reply(ctx, result.message);
      }

      case 'changeprefix': {
        const newPrefix = getArg(ctx, 0);
        if (!newPrefix) return usage(ctx, 'changeprefix <prefix>');

        const result = admin.changePrefix(newPrefix, true);
        return reply(ctx, result.message);
      }

      case 'part': {
        const targetChannel = getArg(ctx, 0) || (!ctx.isPrivate ? ctx.to : '');
        if (!targetChannel) return usage(ctx, 'part <channel>');

        const result = partChannel(ctx, targetChannel, ctx.nick);
        return reply(ctx, result.message);
      }

      case 'greet':
        return reply(ctx, 'Lasciate ogne speranza, voi ch\'intrate');

      case 'raw': {
        const line = fullText(ctx);
        if (!line) return usage(ctx, 'raw <irc line>');

        if (!rawWrite(ctx, line)) return reply(ctx, 'Unable to send raw line.');
        return reply(ctx, 'Sent raw line.');
      }

      case 'join': {
        const [channel, key] = ctx.args || [];
        if (!channel) return usage(ctx, 'join <#channel> [key]');

        if (!joinChannel(ctx, channel, key || '')) return reply(ctx, `Unable to join ${channel}`);
        return reply(ctx, `Joining ${channel}`);
      }

      case 'cycle': {
        const channel = ctx.args?.[0] || ctx.to;
        if (!channel || !channel.startsWith('#')) return usage(ctx, 'cycle [#channel]');

        if (ctx.client && typeof ctx.client.part === 'function') {
          ctx.client.part(channel, 'Cycling');
        } else {
          rawWrite(ctx, `PART ${channel} :Cycling`);
        }

        setTimeout(() => joinChannel(ctx, channel, ''), 1500);
        return reply(ctx, `Cycling ${channel}`);
      }

      case 'chnick': {
        const nick = getArg(ctx, 0);
        if (!nick) return usage(ctx, 'chnick <nick>');

        if (typeof ctx.client.changeNick === 'function') ctx.client.changeNick(nick);
        else if (typeof ctx.client.nick === 'function') ctx.client.nick(nick);
        else if (!rawWrite(ctx, `NICK ${nick}`)) return reply(ctx, 'Unable to change nick.');

        return reply(ctx, `Changing nick to ${nick}`);
      }

      case 'ram': {
        const m = process.memoryUsage();
        return reply(
          ctx,
          `RSS ${Math.round(m.rss / 1048576)} MB, heap ${Math.round(m.heapUsed / 1048576)}/${Math.round(m.heapTotal / 1048576)} MB`
        );
      }
    }
  }
};
