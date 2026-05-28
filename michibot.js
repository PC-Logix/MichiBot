'use strict';

const path = require('path');
const IRC = require('irc-framework');
const config = require('./config.json');

const permissions = require('./services/permissions.js');
const accountState = require('./utils/accountState');
const channelState = require('./utils/channelState');
const {
  normalizeMessage
} = require('./libs/messageNormalizer');
const {
  normalizeCommandName
} = require('./libs/commandHandler');
const {
  normalizeCooldownSpec
} = require('./libs/cooldowns');

const logger = require('./core/logger');
const {
  createCapabilityManager
} = require('./core/capabilities');
const {
  createContextFactory
} = require('./core/context');
const {
  bindIrcEvents
} = require('./core/events');
const {
  createExtensionManager
} = require('./core/extensions');
const {
  createStateHelpers
} = require('./core/state');
const {
  createWebServer
} = require('./web/server');

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
const aliasRegistry = new Map();
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
      access: {
        public: true
      },
      aliases: []
    };
  }

  const spec = commandNameOrSpec || {};
  return {
    name: normalizeCommandName(spec.name),
    access: spec.access || {
      public: true
    },
    hidden: !!spec.hidden,
    help: spec.help || '',
    aliases: Array.isArray(spec.aliases) ? spec.aliases : [],
    cooldown: normalizeCooldownSpec(spec.cooldown || spec.rateLimit || null, normalizeCommandName(spec.name))
  };
}

function splitDefaultArgs(value) {
  if (Array.isArray(value)) {
    return value.map(part => String(part || '').trim()).filter(Boolean);
  }

  return String(value || '').trim().split(/\s+/).filter(Boolean);
}

function normalizeAliasSpec(aliasSpec, targetCommand) {
  if (typeof aliasSpec === 'string') {
    return {
      name: normalizeCommandName(aliasSpec),
      target: targetCommand,
      defaultArgs: [],
      hidden: false
    };
  }

  const spec = aliasSpec || {};
  const defaultArgs = splitDefaultArgs(
    spec.defaultArgs ??
    spec.defaults ??
    spec.args ??
    spec.prependArgs ??
    spec.params ??
    ''
  );

  return {
    name: normalizeCommandName(spec.name || spec.alias),
    target: normalizeCommandName(spec.target || targetCommand),
    defaultArgs,
    hidden: !!spec.hidden
  };
}

function formatAliasForLog(aliasInfo) {
  const args = Array.isArray(aliasInfo.defaultArgs) && aliasInfo.defaultArgs.length ? ` ${aliasInfo.defaultArgs.join(' ')}` : '';
  return `${aliasInfo.name} -> ${aliasInfo.target}${args}`;
}

function registerAlias(aliasSpec, targetCommand, extensionKey = 'runtime') {
  const aliasInfo = normalizeAliasSpec(aliasSpec, normalizeCommandName(targetCommand));

  if (!aliasInfo.name || !aliasInfo.target) {
    return false;
  }

  if (commandRegistry.has(aliasInfo.name)) {
    logger.warn(
      `Alias "${aliasInfo.name}" from ${extensionKey} conflicts with an existing command; skipping duplicate`
    );
    return false;
  }

  if (aliasRegistry.has(aliasInfo.name)) {
    const existing = aliasRegistry.get(aliasInfo.name);
    logger.warn(
      `Alias "${aliasInfo.name}" from ${extensionKey} conflicts with alias from ${existing.extensionKey}; skipping duplicate`
    );
    return false;
  }

  aliasRegistry.set(aliasInfo.name, {
    extensionKey,
    name: aliasInfo.name,
    target: aliasInfo.target,
    defaultArgs: aliasInfo.defaultArgs,
    hidden: !!aliasInfo.hidden
  });

  logger.log(`Registered alias "${formatAliasForLog(aliasRegistry.get(aliasInfo.name))}" from ${extensionKey}`);
  return true;
}

function unregisterAlias(aliasName, extensionKey = '') {
  const normalized = normalizeCommandName(aliasName);
  if (!normalized || !aliasRegistry.has(normalized)) {
    return false;
  }

  const existing = aliasRegistry.get(normalized);
  if (extensionKey && existing.extensionKey !== extensionKey) {
    return false;
  }

  aliasRegistry.delete(normalized);
  logger.log(`Unregistered alias "${normalized}"${extensionKey ? ` from ${extensionKey}` : ''}`);
  return true;
}

function registerCommand(commandNameOrSpec, handler, extensionKey) {
  const spec = normalizeCommandSpec(commandNameOrSpec);
  const normalized = spec.name;
  if (!normalized) {
    return false;
  }

  if (commandRegistry.has(normalized)) {
    const existing = commandRegistry.get(normalized);
    logger.warn(
      `Command "${normalized}" from ${extensionKey} conflicts with ${existing.extensionKey}; skipping duplicate`
    );
    return false;
  }

  if (aliasRegistry.has(normalized)) {
    const existing = aliasRegistry.get(normalized);
    logger.warn(
      `Command "${normalized}" from ${extensionKey} conflicts with alias from ${existing.extensionKey}; skipping duplicate`
    );
    return false;
  }

  commandRegistry.set(normalized, {
    extensionKey,
    handler,
    access: spec.access,
    hidden: !!spec.hidden,
    help: spec.help || '',
    name: normalized,
    cooldown: spec.cooldown || null
  });

  logger.log(`Registered command "${normalized}" from ${extensionKey}`);

  for (const aliasSpec of spec.aliases) {
    registerAlias(aliasSpec, normalized, extensionKey);
  }

  return true;
}


function unregisterCommand(commandName, extensionKey = '') {
  const normalized = normalizeCommandName(commandName);
  if (!normalized || !commandRegistry.has(normalized)) {
    return false;
  }

  const existing = commandRegistry.get(normalized);
  if (extensionKey && existing.extensionKey !== extensionKey) {
    return false;
  }

  commandRegistry.delete(normalized);

  for (const [aliasName, alias] of aliasRegistry.entries()) {
    if (alias.target === normalized && (!extensionKey || alias.extensionKey === extensionKey)) {
      aliasRegistry.delete(aliasName);
      logger.log(`Unregistered alias "${aliasName}"${extensionKey ? ` from ${extensionKey}` : ''}`);
    }
  }

  logger.log(`Unregistered command "${normalized}"${extensionKey ? ` from ${extensionKey}` : ''}`);
  return true;
}

function unregisterCommandsForExtension(extensionKey) {
  for (const [commandName, info] of commandRegistry.entries()) {
    if (info.extensionKey === extensionKey) {
      commandRegistry.delete(commandName);
      logger.log(`Unregistered command "${commandName}" from ${extensionKey}`);
    }
  }

  for (const [aliasName, info] of aliasRegistry.entries()) {
    if (info.extensionKey === extensionKey) {
      aliasRegistry.delete(aliasName);
      logger.log(`Unregistered alias "${aliasName}" from ${extensionKey}`);
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
  aliasRegistry,
  currentPrefixRef,
  extensionManager: {
    getLoadedExtensions: () => extensionManager.getLoadedExtensions(),
    loadExtensionByName: (...args) => extensionManager.loadExtensionByName(...args),
    unloadExtensionByName: (...args) => extensionManager.unloadExtensionByName(...args),
    reloadExtensionByName: (...args) => extensionManager.reloadExtensionByName(...args)
  },
  registerCommand,
  unregisterCommand,
  registerAlias,
  unregisterAlias,
  normalizeCommandName,
  logger,
  stateHelpers,
  configPath
});

const webServer = createWebServer({
  baseDir: __dirname,
  config,
  logger,
  commandRegistry,
  aliasRegistry,
  prefixRef: currentPrefixRef
});

extensionManager = createExtensionManager({
  baseDir: __dirname,
  logger,
  buildContext: contextFactory.buildContext,
  registerCommand,
  unregisterCommandsForExtension,
  webServer
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
  aliasRegistry,
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

  webServer.start();

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
