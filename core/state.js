'use strict';

function createStateHelpers({ accountState, channelState, normalizeCommandName, client, logger }) {
  const whoisPending = new Map();
  const whoisSeededChannels = new Set();

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

  function refreshAccountForNick(nick, timeoutMs = 1200, reason = 'command') {
    const targetNick = String(nick || '').trim();
    if (!targetNick) {
      return Promise.resolve(null);
    }

    const cached = getCachedAccount(targetNick);
    if (cached) {
      return Promise.resolve(cached);
    }

    const pendingKey = normalizeCommandName(targetNick);
    if (whoisPending.has(pendingKey)) {
      return whoisPending.get(pendingKey);
    }

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
        if (account) {
          accountState.setAccount(targetNick, account);
        }
        finish(account || getCachedAccount(targetNick), account ? 'whois' : (info?.error || 'whois'));
      });
    });

    whoisPending.set(pendingKey, promise);
    return promise;
  }

  function maybeSeedWhoisForUser(nick, reason = 'seed') {
    const targetNick = String(nick || '').trim();
    if (!targetNick) return;
    if (getCachedAccount(targetNick)) return;
    if (whoisPending.has(normalizeCommandName(targetNick))) return;

    refreshAccountForNick(targetNick, 2500, reason).catch(err => {
      logger.error(`WHOIS seed failed for ${targetNick}:`, err);
    });
  }

  function seedWhoisForChannel(channelName, users) {
    const channelKey = String(channelName || '').trim().toLowerCase();
    if (!channelKey || whoisSeededChannels.has(channelKey)) {
      return;
    }

    whoisSeededChannels.add(channelKey);

    const list = Array.isArray(users) ? users : [];
    const targets = list
      .map(user => String(user?.nick || '').trim())
      .filter(Boolean);

    if (targets.length > 0) {
      logger.log(`[auth] Seeding WHOIS for ${channelName}: ${targets.join(', ')}`);
    }

    for (const nick of targets) {
      maybeSeedWhoisForUser(nick, `seed:${channelName}`);
    }
  }

  return {
    getCachedAccount,
    getChannelModes,
    maybeSeedWhoisForUser,
    refreshAccountForNick,
    seedWhoisForChannel
  };
}

module.exports = {
  createStateHelpers
};
