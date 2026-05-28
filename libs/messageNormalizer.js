'use strict';

function getBotNick(client, fallbackNick = '') {
  return String(client?.user?.nick || fallbackNick || '').trim();
}

function isPrivateMessage(client, to, fallbackNick = '') {
  const botNick = getBotNick(client, fallbackNick);
  return !!(to && botNick && String(to).toLowerCase() === botNick.toLowerCase());
}

function getDiscordBridgeConfig(config) {
  return config?.bridges?.discord || {};
}

function stripIrcFormatting(text) {
  return String(text || '')
    .replace(/\x03(?:\d{1,2}(?:,\d{1,2})?)?/g, '')
    .replace(/[\x02\x0f\x16\x1d\x1f\x1e]/g, '');
}

function stripZeroWidth(text) {
  return String(text || '').replace(/[\u200B-\u200D\uFEFF]/g, '');
}

function cleanBridgeText(text) {
  return stripZeroWidth(stripIrcFormatting(text)).trim();
}

function isKnownBridgeNick(config, from) {
  const bridgeConfig = getDiscordBridgeConfig(config);
  if (!bridgeConfig.enabled) {
    return false;
  }

  const nicks = Array.isArray(bridgeConfig.ircNicks) ? bridgeConfig.ircNicks : [];
  return nicks.some(nick =>
    String(nick).trim().toLowerCase() === String(from || '').trim().toLowerCase()
  );
}

function parseBridgeMessage(config, message) {
  const bridgeConfig = getDiscordBridgeConfig(config);
  const pattern = bridgeConfig.pattern || '^<([^>]+)>\\s+(.+)$';

  const cleanedMessage = cleanBridgeText(message);
  const regex = new RegExp(pattern);
  const match = cleanedMessage.match(regex);

  if (!match) {
    return null;
  }

  const bridgeUser = cleanBridgeText(match[1]);
  const bridgedText = String(match[2] || '').trim();

  if (!bridgeUser || !bridgedText) {
    return null;
  }

  return {
    bridgeUser,
    bridgedText
  };
}

function normalizeMessage({
  client,
  config,
  event,
  account,
  channelModes
}) {
  const from = String(event?.nick || '').trim();
  const to = String(event?.target || '').trim();
  const text = String(event?.message || '').trim();
  const privateMessage = isPrivateMessage(client, to, config?.userName);
  const replyTarget = privateMessage ? from : to;

  if (isKnownBridgeNick(config, from)) {
    const parsed = parseBridgeMessage(config, text);

    if (parsed) {
      return {
        source: 'discord-bridge',

        // Keep the full bot config on ctx so bridge auth can read:
        // ctx.config.bridges.discord.auth
        config,

        // Logical sender. Commands/plugins should treat this as the user.
        from: parsed.bridgeUser,
        nick: parsed.bridgeUser,
        actor: parsed.bridgeUser,
        displayName: parsed.bridgeUser,

        // IRC routing.
        to,
        target: to,
        text: parsed.bridgedText,
        message: parsed.bridgedText,
        isPrivate: privateMessage,
        isBridge: true,
        bridgeUser: parsed.bridgeUser,
        replyTarget,

        // Transport/debug identity. This is the actual IRC bridge bot.
        rawFrom: from,
        transportNick: from,
        rawText: text,

        // Account here belongs to the transport nick, not the bridged user.
        account: null,
        transportAccount: account || null,

        channelModes: channelModes || {}
      };
    }
  }

  return {
    source: 'irc',

    // Keep the full bot config on ctx for helpers that expect ctx.config.
    config,

    from,
    nick: from,
    actor: from,
    displayName: from,
    to,
    target: to,
    text,
    message: text,
    isPrivate: privateMessage,
    isBridge: false,
    bridgeUser: null,
    replyTarget,
    rawFrom: from,
    transportNick: from,
    rawText: text,
    account: account || null,
    transportAccount: account || null,
    channelModes: channelModes || {}
  };
}

module.exports = {
  normalizeMessage,
  isKnownBridgeNick,
  parseBridgeMessage
};