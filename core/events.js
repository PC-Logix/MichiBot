'use strict';

const {
  handleMessage
} = require('../libs/commandHandler');

function getExtensions(extensionManager) {
  const loaded = extensionManager.getLoadedExtensions();

  if (!loaded) {
    return [];
  }

  if (loaded instanceof Map) {
    return Array.from(loaded.values());
  }

  if (Array.isArray(loaded)) {
    return loaded;
  }

  if (typeof loaded === 'object') {
    return Object.values(loaded);
  }

  return [];
}

async function dispatchExtensionEvent({
  extensionManager,
  logger,
  handlerNames,
  event,
  extra = {}
}) {
  const extensions = getExtensions(extensionManager);

  for (const runtimeInfo of extensions) {
    if (!runtimeInfo) {
      continue;
    }

    const extension = runtimeInfo.module || runtimeInfo;

    for (const handlerName of handlerNames) {
      const handler = extension[handlerName];

      if (typeof handler !== 'function') {
        continue;
      }

      try {
        await handler.call(extension, event, extra);
      } catch (err) {
        logger.error(
          `[michibot] ${handlerName} failed in ${extension.name || runtimeInfo.fileName || extension.filename || 'unknown extension'}:`,
          err
        );
      }

      break;
    }
  }
}

function bindIrcEvents({
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
  buildContext,
  currentPrefixRef,
  normalizeMessage,
  reply
}) {
  capabilityManager.bindEvents();

  client.on('account', (event) => {
    const nick = String(event?.nick || '').trim();
    if (!nick) return;

    if (event.account && event.account !== '*') {
      accountState.setAccount(nick, event.account);
      logger.log(`[auth] account ${nick} -> ${event.account}`);
    } else {
      accountState.clearAccount(nick);
      logger.log(`[auth] account ${nick} -> (logged out)`);
    }
  });

  client.on('loggedin', (event) => {
    const nick = String(event?.nick || '').trim();
    const account = String(event?.account || '').trim();
    if (nick && account) {
      accountState.setAccount(nick, account);
      logger.log(`[auth] loggedin ${nick} -> ${account}`);
    }
  });

  client.on('loggedout', (event) => {
    const nick = String(event?.nick || '').trim();
    if (nick) {
      accountState.clearAccount(nick);
      logger.log(`[auth] loggedout ${nick}`);
    }
  });

  client.on('whois', (info) => {
    const nick = String(info?.nick || '').trim();
    const account = String(info?.account || '').trim();
    if (nick && account) {
      accountState.setAccount(nick, account);
      logger.log(`[auth] whois event ${nick} -> ${account}`);
    }
  });

  client.on('userlist', (event) => {
    const channelName = String(event?.channel || '').trim();
    if (!channelName) return;

    channelState.clearChannel(channelName);

    const users = Array.isArray(event?.users) ? event.users : [];
    for (const user of users) {
      const nick = String(user?.nick || '').trim();
      if (!nick) continue;
      channelState.setUserModes(channelName, nick, Array.isArray(user?.modes) ? user.modes : []);
    }

    stateHelpers.seedWhoisForChannel(channelName, users);
  });

  client.on('join', async (event) => {
    const channelName = String(event?.channel || '').trim();
    const nick = String(event?.nick || '').trim();
    if (!channelName || !nick) return;

    channelState.ensureUser(channelName, nick);

    if (event.account && event.account !== '*') {
      accountState.setAccount(nick, event.account);
    } else {
      stateHelpers.maybeWhoisJoinedUser(nick, `join:${channelName}`);
    }

    await dispatchExtensionEvent({
      extensionManager,
      logger,
      handlerNames: [
        'handleJoin',
        'onJoin'
      ],
      event,
      extra: {
        client,
        config,
        currentPrefix: currentPrefixRef.get(),
        buildContext
      }
    });
  });

  client.on('part', (event) => {
    if (event?.channel && event?.nick) {
      channelState.removeUser(event.channel, event.nick);
    }
  });

  client.on('kick', (event) => {
    if (event?.channel && event?.kicked) {
      channelState.removeUser(event.channel, event.kicked);
    }
  });

  client.on('quit', (event) => {
    const nick = String(event?.nick || '').trim();
    if (nick) {
      channelState.removeUserFromAll(nick);
      accountState.remove(nick);
    }
  });

  client.on('nick', (event) => {
    const oldNick = String(event?.nick || '').trim();
    const newNick = String(event?.new_nick || '').trim();
    if (oldNick && newNick) {
      channelState.renameUser(oldNick, newNick);
      accountState.rename(oldNick, newNick);
    }
  });

  client.on('mode', (event) => {
    const channelName = String(event?.target || '').trim();
    if (!channelName.startsWith('#')) {
      return;
    }

    for (const mode of Array.isArray(event?.modes) ? event.modes : []) {
      const sign = String(mode?.mode || '');
      const targetNick = String(mode?.param || '').trim();
      if (!targetNick || sign.length < 2) continue;

      const adding = sign[0] === '+';
      const modeChar = sign[1];
      if (!['q', 'a', 'o', 'h', 'v'].includes(modeChar)) continue;

      if (adding) {
        channelState.addUserMode(channelName, targetNick, modeChar);
      } else {
        channelState.removeUserMode(channelName, targetNick, modeChar);
      }
    }
  });

  client.on('registered', () => {
    logger.log('Connected and registered');
    logger.log(`[caps] Enabled: ${capabilityManager.getEnabledCaps().join(', ') || '(none acknowledged yet)'}`);

    for (const channelName of config.channels || []) {
      client.join(channelName);
    }
  });

  client.on('close', () => {
    logger.warn('Connection closed');
  });

  client.on('socket close', () => {
    logger.warn('Socket closed');
  });

  client.on('error', (err) => {
    logger.error('IRC error:', err);
  });

  client.on('notice', async (event) => {
    await dispatchExtensionEvent({
      extensionManager,
      logger,
      handlerNames: [
        'handleNotice',
        'onNotice',
        'notice'
      ],
      event,
      extra: {
        client,
        config,
        currentPrefix: currentPrefixRef.get(),
        commandRegistry,
        aliasRegistry,
        buildContext,
        normalizeMessage,
        reply
      }
    });
  });

  client.on('action', async (event) => {
    await dispatchExtensionEvent({
      extensionManager,
      logger,
      handlerNames: [
        'handleAction',
        'onAction'
      ],
      event,
      extra: {
        client,
        config,
        currentPrefix: currentPrefixRef.get(),
        buildContext
      }
    });
  });

  client.on('message', async (event) => {
    const nick = String(event?.nick || '').trim();
    const target = String(event?.target || '').trim();
    if (!nick || !target) {
      return;
    }

    if (typeof event?.account === 'string' && event.account && event.account !== '*') {
      accountState.setAccount(nick, event.account);
    }

    const account = stateHelpers.getCachedAccount(nick);
    const channelModes = stateHelpers.getChannelModes(target, nick);

    await handleMessage({
      client,
      config,
      currentPrefix: currentPrefixRef.get(),
      commandRegistry,
      aliasRegistry,
      loadedExtensions: extensionManager.getLoadedExtensions(),
      buildContext,
      normalizeMessage,
      event,
      account,
      channelModes,
      log: logger.log,
      error: logger.error,
      reply
    });
  });
}

module.exports = {
  bindIrcEvents
};
