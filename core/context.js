'use strict';

const fs = require('fs');
const path = require('path');
const {
  resetCooldown
} = require('../libs/cooldowns');

function createContextFactory({
  client,
  config,
  permissions,
  commandRegistry,
  aliasRegistry,
  currentPrefixRef,
  extensionManager,
  registerCommand,
  unregisterCommand,
  registerAlias,
  unregisterAlias,
  normalizeCommandName,
  logger,
  stateHelpers,
  configPath
}) {
  function reply(target, message) {
    client.say(target, message);
  }

  function notice(target, message) {
    client.notice(target, message);
  }

  function action(target, message) {
    client.action(target, message);
  }

  function saveConfig() {
    try {
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
      return true;
    } catch (err) {
      logger.error('Failed to save config:', err);
      return false;
    }
  }

  function setPrefix(newPrefix, persist = false) {
    const trimmed = String(newPrefix || '').trim();
    if (!trimmed) {
      return {
        ok: false,
        prefix: currentPrefixRef.get(),
        message: 'Invalid prefix'
      };
    }

    currentPrefixRef.set(trimmed);

    if (persist) {
      config.commandPrefix = trimmed;
      const saved = saveConfig();
      if (!saved) {
        return {
          ok: false,
          prefix: currentPrefixRef.get(),
          message: 'Prefix changed in memory but failed to save to config'
        };
      }
    }

    return {
      ok: true,
      prefix: currentPrefixRef.get(),
      message: `Command prefix changed to: ${currentPrefixRef.get()}`
    };
  }

  async function listCommandsVisibleTo(ctx) {
    const visible = [];

    for (const info of commandRegistry.values()) {
      if (info.hidden) {
        continue;
      }

      if (await permissions.canAccessAsync(ctx, info.access)) {
        visible.push(info.name);
      }
    }

    for (const alias of aliasRegistry.values()) {
      if (alias.hidden) {
        continue;
      }

      const target = commandRegistry.get(normalizeCommandName(alias.target));
      if (!target || target.hidden) {
        continue;
      }

      if (await permissions.canAccessAsync(ctx, target.access)) {
        visible.push(alias.name);
      }
    }

    return Array.from(new Set(visible)).sort();
  }

  function buildModulesContext() {
    const modules = {};
    const loaded = extensionManager.getLoadedExtensions();

    for (const runtimeInfo of loaded.values()) {
      if (runtimeInfo.type !== 'modules') continue;

      const key = path.basename(runtimeInfo.fileName, '.js');
      modules[key] = runtimeInfo.module;
    }

    return modules;
  }

  function buildContext() {
    return {
      client,
      config,
      permissions,
      modules: buildModulesContext(),

      reply,
      notice,
      action,

      commands: {
        register(commandNameOrSpec, handler, extensionKey = 'runtime') {
          return registerCommand(commandNameOrSpec, handler, extensionKey);
        },
        unregister(commandName, extensionKey = '') {
          return unregisterCommand(commandName, extensionKey);
        },
        registerAlias(aliasSpec, targetCommand, extensionKey = 'runtime') {
          return registerAlias(aliasSpec, targetCommand, extensionKey);
        },
        unregisterAlias(aliasName, extensionKey = '') {
          return unregisterAlias(aliasName, extensionKey);
        },
        has(commandName) {
          const normalized = normalizeCommandName(commandName);
          return commandRegistry.has(normalized) || aliasRegistry.has(normalized);
        },
        hasCommand(commandName) {
          return commandRegistry.has(normalizeCommandName(commandName));
        },
        hasAlias(aliasName) {
          return aliasRegistry.has(normalizeCommandName(aliasName));
        },
        list() {
          return Array.from(commandRegistry.keys()).sort();
        },
        listAliases() {
          return Array.from(aliasRegistry.values())
            .map(alias => ({
              name: alias.name,
              target: alias.target,
              defaultArgs: Array.isArray(alias.defaultArgs) ? alias.defaultArgs.slice() : [],
              hidden: !!alias.hidden
            }))
            .sort((a, b) => a.name.localeCompare(b.name));
        },
        async listVisible(ctx) {
          return listCommandsVisibleTo(ctx);
        },
        getCooldown(commandName) {
          const command = commandRegistry.get(normalizeCommandName(commandName));
          return command?.cooldown || null;
        },
        resetCooldown(commandOrKey, user = '') {
          const command = commandRegistry.get(normalizeCommandName(commandOrKey));
          return resetCooldown(command?.cooldown || commandOrKey, user);
        }
      },

      bot: {
        getPrefix() {
          return currentPrefixRef.get();
        },
        setPrefix(newPrefix, persist = false) {
          return setPrefix(newPrefix, persist);
        },
        getLoadedExtensions() {
          return Array.from(extensionManager.getLoadedExtensions().keys()).sort();
        },
        getLoadedPlugins() {
          return Array.from(extensionManager.getLoadedExtensions().values())
            .filter(ext => ext.type === 'plugins')
            .map(ext => ext.fileName)
            .sort();
        },
        getLoadedModules() {
          return Array.from(extensionManager.getLoadedExtensions().values())
            .filter(ext => ext.type === 'modules')
            .map(ext => ext.fileName)
            .sort();
        },
        async refreshAccount(nick) {
          return stateHelpers.refreshAccountForNick(nick);
        },
        partChannel(channelName, message = '') {
          const target = String(channelName || '').trim();
          if (!target) {
            return {
              ok: false,
              message: 'No channel provided'
            };
          }

          client.part(target, message || undefined);
          return {
            ok: true,
            message: `Parting ${target}`
          };
        },
        joinChannel(channelName, key = '') {
          const target = String(channelName || '').trim();
          if (!target) {
            return {
              ok: false,
              message: 'No channel provided'
            };
          }

          client.join(target, key || undefined);
          return {
            ok: true,
            message: `Joining ${target}`
          };
        },
        loadPlugin(name) {
          return extensionManager.loadExtensionByName('plugins', name);
        },
        unloadPlugin(name) {
          return extensionManager.unloadExtensionByName('plugins', name);
        },
        reloadPlugin(name) {
          return extensionManager.reloadExtensionByName('plugins', name);
        },
        loadModule(name) {
          return extensionManager.loadExtensionByName('modules', name);
        },
        unloadModule(name) {
          return extensionManager.unloadExtensionByName('modules', name);
        },
        reloadModule(name) {
          return extensionManager.reloadExtensionByName('modules', name);
        }
      }
    };
  }

  return {
    action,
    buildContext,
    notice,
    reply,
    setPrefix
  };
}

module.exports = {
  createContextFactory
};
