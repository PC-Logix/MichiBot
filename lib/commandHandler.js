'use strict';

function normalizeCommandName(name) {
  return String(name || '').trim().toLowerCase();
}

function escapeRegex(str) {
  return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getLiveCommandNames({ client, config }) {
  const names = new Set();

  const liveNick = String(client?.user?.nick || '').trim();
  if (liveNick) {
    names.add(liveNick);
  }

  const configuredNick = String(config?.userName || '').trim();
  if (configuredNick) {
    names.add(configuredNick);
  }

  const extraNames = Array.isArray(config?.nameCommands?.names)
    ? config.nameCommands.names
    : [];

  for (const name of extraNames) {
    const trimmed = String(name || '').trim();
    if (trimmed) {
      names.add(trimmed);
    }
  }

  return Array.from(names);
}

function isNameCommandEnabled(config) {
  return !!config?.nameCommands?.enabled;
}

function accessRuleMentionsGlobalRank(rule) {
  if (!rule || typeof rule !== 'object') {
    return false;
  }

  if (rule.globalRank) {
    return true;
  }

  if (Array.isArray(rule.anyOf) && rule.anyOf.some(accessRuleMentionsGlobalRank)) {
    return true;
  }

  if (Array.isArray(rule.allOf) && rule.allOf.some(accessRuleMentionsGlobalRank)) {
    return true;
  }

  return false;
}

function parseCommandMessage({ text, currentPrefix, client, config }) {
  const msg = String(text || '');

  if (msg.startsWith(currentPrefix)) {
    const raw = msg.slice(currentPrefix.length).trim();
    if (!raw) {
      return null;
    }

    const parts = raw.split(/\s+/);
    const command = normalizeCommandName(parts.shift());

    return {
      triggerType: 'prefix',
      trigger: currentPrefix,
      raw,
      command,
      args: parts
    };
  }

  if (isNameCommandEnabled(config)) {
    const botNames = getLiveCommandNames({ client, config });

    for (const botName of botNames) {
      const pattern = new RegExp(
        `^${escapeRegex(botName)}(?:[:,]\\s*|\\s+)(.+)$`,
        'i'
      );

      const match = msg.match(pattern);
      if (!match) {
        continue;
      }

      const raw = String(match[1] || '').trim();
      if (!raw) {
        return null;
      }

      const parts = raw.split(/\s+/);
      const command = normalizeCommandName(parts.shift());

      return {
        triggerType: 'name',
        trigger: botName,
        raw,
        command,
        args: parts
      };
    }
  }

  return null;
}

function buildRuntimeContext(baseContext, normalized) {
  return {
    ...baseContext,
    from: normalized.from,
    nick: normalized.nick,
    actor: normalized.actor,
    displayName: normalized.displayName,
    to: normalized.replyTarget,
    target: normalized.target,
    message: normalized.text,
    text: normalized.text,
    replyTarget: normalized.replyTarget,
    isBridge: normalized.isBridge,
    bridgeUser: normalized.bridgeUser,
    source: normalized.source,
    rawFrom: normalized.rawFrom,
    rawText: normalized.rawText,
    isPrivate: normalized.isPrivate,
    account: normalized.account,
    channelModes: normalized.channelModes
  };
}

async function dispatchPassiveListeners({ loadedExtensions, baseContext, normalized, error }) {
  const runtimeContext = buildRuntimeContext(baseContext, normalized);

  for (const runtimeInfo of loadedExtensions.values()) {
    if (typeof runtimeInfo.module.onMessage !== 'function') {
      continue;
    }

    try {
      await runtimeInfo.module.onMessage(runtimeContext);
    } catch (err) {
      error(`onMessage failed in ${runtimeInfo.extensionKey}:`, err);
    }
  }
}

async function dispatchCommand({
  parsed,
  normalized,
  baseContext,
  commandRegistry,
  currentPrefix,
  error,
  reply
}) {
  const registered = commandRegistry.get(parsed.command);
  if (!registered) {
    return;
  }

  const ctx = {
    ...buildRuntimeContext(baseContext, normalized),
    prefix: currentPrefix,
    raw: parsed.raw,
    command: parsed.command,
    args: parsed.args,
    triggerType: parsed.triggerType,
    trigger: parsed.trigger,
    access: registered.access || { public: true }
  };

  if (!ctx.isBridge && !ctx.account && typeof baseContext?.bot?.refreshAccount === 'function' && accessRuleMentionsGlobalRank(registered.access)) {
    ctx.account = await baseContext.bot.refreshAccount(ctx.nick);
  }

  if (!(await baseContext.permissions.canAccessAsync(ctx, registered.access))) {
    return;
  }

  try {
    await registered.handler(ctx);
  } catch (err) {
    error(`Command "${parsed.command}" failed in ${registered.extensionKey}:`, err);
    reply(normalized.replyTarget || normalized.to, `Error running command: ${parsed.command}`);
  }
}

async function handleMessage({
  client,
  config,
  currentPrefix,
  commandRegistry,
  loadedExtensions,
  buildContext,
  normalizeMessage,
  event,
  account,
  channelModes,
  log,
  error,
  reply
}) {
  const normalized = normalizeMessage({
    client,
    config,
    event,
    account,
    channelModes
  });

  const logName = normalized.isBridge ? normalized.bridgeUser : normalized.from;
  log(`[raw] ${normalized.to} <${normalized.rawFrom}> ${normalized.rawText}`);
  log(`[normalized] ${normalized.to} <${logName}> ${normalized.text}`);
  log(`${normalized.to} <${logName}> ${normalized.text}`);

  const baseContext = buildContext();

  await dispatchPassiveListeners({
    loadedExtensions,
    baseContext,
    normalized,
    error
  });

  const parsed = parseCommandMessage({
    text: normalized.text,
    currentPrefix,
    client,
    config
  });

  if (!parsed) {
    return;
  }

  await dispatchCommand({
    parsed,
    normalized,
    baseContext,
    commandRegistry,
    currentPrefix,
    error,
    reply
  });
}

module.exports = {
  handleMessage,
  parseCommandMessage,
  normalizeCommandName
};
