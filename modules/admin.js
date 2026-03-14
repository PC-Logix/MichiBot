'use strict';

let bot = null;

module.exports = {
  name: 'admin',

  init(ctx) {
    bot = ctx.bot;
    console.log('[admin-module] initialized');
  },

  listPlugins() {
    return bot.getLoadedPlugins();
  },

  async listVisibleCommands(ctx) {
    if (!ctx.isBridge && !ctx.account && typeof bot?.refreshAccount === 'function') {
      ctx.account = await bot.refreshAccount(ctx.nick);
    }

    return ctx.commands.listVisible(ctx);
  },

  async loadPlugin(pluginName) {
    return bot.loadPlugin(pluginName);
  },

  async unloadPlugin(pluginName) {
    return bot.unloadPlugin(pluginName);
  },

  async reloadPlugin(pluginName) {
    return bot.reloadPlugin(pluginName);
  },

  changePrefix(newPrefix, persist = true) {
    return bot.setPrefix(newPrefix, persist);
  },

  partChannel(channel, requestedBy) {
    return bot.partChannel(channel, `Requested by ${requestedBy}`);
  }
};
