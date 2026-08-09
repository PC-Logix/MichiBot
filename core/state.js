'use strict';

function positiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.floor(parsed);
}

function createStateHelpers({
  accountState,
  channelState,
  normalizeCommandName,
  client,
  logger,
  config = {}
}) {
  const authConfig = config.auth || {};
  const whoisPending = new Map();
  const whoisSeededChannels = new Set();
  const whoisQueue = [];
  const whoisQueuedKeys = new Set();

  let whoisQueueRunning = false;
  let whoisQueueTimer = null;

  const whoisSeedOnJoin = authConfig.seedWhoisOnJoin === true;
  const whoisOnJoin = authConfig.whoisOnJoin === true;
  const whoisQueueDelayMs = positiveInt(authConfig.whoisQueueDelayMs ?? authConfig.whoisDelayMs, 2500);
  const whoisTimeoutMs = positiveInt(authConfig.whoisTimeoutMs, 2500);
  const maxSeedWhoisPerChannel = positiveInt(authConfig.maxSeedWhoisPerChannel, 5);

  function getMessageContextDefaults() {
    return {
      account: null,
      channelModes: {
        owner: false,
        admin: false,
        op: false,
        halfop: false,
        voice: false,
        rawModes: []
      }
    };
  }

  function getCachedAccount(nick) {
    const state = accountState.get(nick);
    return state.identified ? state.account : null;
  }

  function getChannelModes(channelName, nick) {
    if (!channelName || !nick || !String(channelName).startsWith('#')) {
      return getMessageContextDefaults().channelModes;
    }

    return channelState.getModeFlags(channelName, nick);
  }

  function clearWhoisQueueTimer() {
    if (whoisQueueTimer) {
      clearTimeout(whoisQueueTimer);
      whoisQueueTimer = null;
    }
  }

  function refreshAccountForNick(nick, timeoutMs = whoisTimeoutMs, reason = 'command') {
    const targetNick = String(nick || '').trim();
    if (!targetNick) return Promise.resolve(null);

    const cached = getCachedAccount(targetNick);
    if (cached) return Promise.resolve(cached);

    const pendingKey = normalizeCommandName(targetNick);
    if (whoisPending.has(pendingKey)) return whoisPending.get(pendingKey);

    logger.log(`[auth] WHOIS lookup requested for ${targetNick}${reason ? ` (${reason})` : ''}`);

    const promise = new Promise((resolve) => {
      let settled = false;

      const finish = (value, source = '') => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        whoisPending.delete(pendingKey);

        const finalValue = value || null;
        logger.log(`[auth] WHOIS lookup finished for ${targetNick}: ${finalValue || '(none)'}${source ? ` (${source})` : ''}`);
        resolve(finalValue);
      };

      const timer = setTimeout(() => {
        finish(getCachedAccount(targetNick), 'timeout');
      }, timeoutMs);

      client.whois(targetNick, (info) => {
        const account = String(info?.account || '').trim() || null;
        if (account) accountState.setAccount(targetNick, account);
        finish(account || getCachedAccount(targetNick), account ? 'whois' : (info?.error || 'whois'));
      });
    });

    whoisPending.set(pendingKey, promise);
    return promise;
  }

  function runWhoisQueue() {
    if (whoisQueueRunning) return;
    whoisQueueRunning = true;

    const next = () => {
      clearWhoisQueueTimer();

      const item = whoisQueue.shift();
      if (!item) {
        whoisQueueRunning = false;
        return;
      }

      const key = normalizeCommandName(item.nick);
      whoisQueuedKeys.delete(key);

      refreshAccountForNick(item.nick, item.timeoutMs || whoisTimeoutMs, item.reason).catch(err => {
        logger.error(`WHOIS seed failed for ${item.nick}:`, err);
      });

      whoisQueueTimer = setTimeout(next, whoisQueueDelayMs);
    };

    next();
  }

  function enqueueWhois(nick, reason = 'seed', timeoutMs = whoisTimeoutMs) {
    const targetNick = String(nick || '').trim();
    if (!targetNick) return false;
    if (getCachedAccount(targetNick)) return false;

    const key = normalizeCommandName(targetNick);
    if (!key) return false;
    if (whoisPending.has(key) || whoisQueuedKeys.has(key)) return false;

    whoisQueuedKeys.add(key);
    whoisQueue.push({ nick: targetNick, reason, timeoutMs });
    runWhoisQueue();
    return true;
  }

  function maybeSeedWhoisForUser(nick, reason = 'seed') {
    return enqueueWhois(nick, reason, whoisTimeoutMs);
  }

  function maybeWhoisJoinedUser(nick, reason = 'join') {
    if (!whoisOnJoin) return false;
    return enqueueWhois(nick, reason, whoisTimeoutMs);
  }

  function seedWhoisForChannel(channelName, users) {
    const channelKey = String(channelName || '').trim().toLowerCase();
    if (!channelKey || whoisSeededChannels.has(channelKey)) return;

    whoisSeededChannels.add(channelKey);

    if (!whoisSeedOnJoin) {
      logger.log(`[auth] Skipping WHOIS seed for ${channelName}; auth.seedWhoisOnJoin is disabled`);
      return;
    }

    const targets = (Array.isArray(users) ? users : [])
      .map(user => String(user?.nick || '').trim())
      .filter(Boolean)
      .slice(0, maxSeedWhoisPerChannel);

    if (targets.length > 0) {
      logger.log(`[auth] Queueing WHOIS seed for ${channelName}: ${targets.join(', ')}`);
    }

    for (const nick of targets) {
      maybeSeedWhoisForUser(nick, `seed:${channelName}`);
    }
  }

  function dispose() {
    clearWhoisQueueTimer();
    whoisQueue.length = 0;
    whoisQueuedKeys.clear();
    whoisQueueRunning = false;
  }

  return {
    getCachedAccount,
    getChannelModes,
    maybeSeedWhoisForUser,
    maybeWhoisJoinedUser,
    refreshAccountForNick,
    seedWhoisForChannel,
    dispose
  };
}

module.exports = { createStateHelpers };
