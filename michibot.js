'use strict';

const path = require('path');
const IRC = require('irc-framework');
const config = require('./config.json');

const permissions = require('./modules/permissions.js');
const accountState = require('./utils/accountState');
const channelState = require('./utils/channelState');
const { normalizeMessage } = require('./lib/messageNormalizer');
const { normalizeCommandName } = require('./lib/commandHandler');

const logger = require('./core/logger');
const { createCapabilityManager } = require('./core/capabilities');
const { createContextFactory } = require('./core/context');
const { bindIrcEvents } = require('./core/events');
const { createExtensionManager } = require('./core/extensions');
const { createStateHelpers } = require('./core/state');

const REQUESTED_CAPS = [
  'account-notify',
  'extended-join',
  'multi-prefix',
  'userhost-in-names',
  'cap-notify',
  'chghost',
  'away-notify'
];

permissions.init();

const client = new IRC.Client();
const commandRegistry = new Map();
const configPath = path.join(__dirname, 'config.json');

const currentPrefixRef = {
  value: config.commandPrefix || '!',
  get() {
    return this.value;
  },
  set(next) {
    this.value = next;
  }
};

function normalizeCommandSpec(commandNameOrSpec) {
  if (typeof commandNameOrSpec === 'string') {
    return {
      name: normalizeCommandName(commandNameOrSpec),
      access: { public: true }
    };
  }

  const spec = commandNameOrSpec || {};
  return {
    name: normalizeCommandName(spec.name),
    access: spec.access || { public: true },
    hidden: !!spec.hidden
  };
}

function registerCommand(commandNameOrSpec, handler, extensionKey) {
  const spec = normalizeCommandSpec(commandNameOrSpec);
  const normalized = spec.name;
  if (!normalized) {
    return;
  }

  if (commandRegistry.has(normalized)) {
    const existing = commandRegistry.get(normalized);
    logger.warn(
      `Command "${normalized}" from ${extensionKey} conflicts with ${existing.extensionKey}; skipping duplicate`
    );
    return;
  }

  commandRegistry.set(normalized, {
    extensionKey,
    handler,
    access: spec.access,
    hidden: !!spec.hidden,
    name: normalized
  });

  logger.log(`Registered command "${normalized}" from ${extensionKey}`);
}

function unregisterCommandsForExtension(extensionKey) {
  for (const [commandName, info] of commandRegistry.entries()) {
    if (info.extensionKey === extensionKey) {
      commandRegistry.delete(commandName);
      logger.log(`Unregistered command "${commandName}" from ${extensionKey}`);
    }
  }
}

const stateHelpers = createStateHelpers({
  accountState,
  channelState,
  normalizeCommandName,
  client,
  logger
});

let extensionManager;

const contextFactory = createContextFactory({
  client,
  config,
  permissions,
  commandRegistry,
  currentPrefixRef,
  extensionManager: {
    getLoadedExtensions: () => extensionManager.getLoadedExtensions(),
    loadExtensionByName: (...args) => extensionManager.loadExtensionByName(...args),
    unloadExtensionByName: (...args) => extensionManager.unloadExtensionByName(...args),
    reloadExtensionByName: (...args) => extensionManager.reloadExtensionByName(...args)
  },
  registerCommand,
  normalizeCommandName,
  logger,
  stateHelpers,
  configPath
});

extensionManager = createExtensionManager({
  baseDir: __dirname,
  logger,
  buildContext: contextFactory.buildContext,
  registerCommand,
  unregisterCommandsForExtension
});

const capabilityManager = createCapabilityManager({
  client,
  logger,
  requestedCaps: REQUESTED_CAPS
});

bindIrcEvents({
  client,
  config,
  logger,
  capabilityManager,
  accountState,
  channelState,
  stateHelpers,
  commandRegistry,
  extensionManager,
  buildContext: contextFactory.buildContext,
  currentPrefixRef,
  normalizeMessage,
  reply: contextFactory.reply
});

capabilityManager.useMiddleware();

(async () => {
  await extensionManager.loadAllFrom('modules');
  await extensionManager.loadAllFrom('plugins');

  client.connect({
    host: config.server,
    port: config.port || (config.secure ? 6697 : 6667),
    nick: config.userName,
    username: config.userName,
    gecos: config.realName || config.userName,
    tls: !!config.secure,
    rejectUnauthorized: !config.selfSigned,
    auto_reconnect: config.autoRejoin !== false
  });
})();
