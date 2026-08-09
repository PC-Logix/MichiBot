'use strict';

const {
  say,
  text
} = require('../utils/helper');

const TIMEOUT_MS = 60_000;

const pendingPing = new Map();
const pendingMsp = new Map();

function normalizeNick(nick) {
  return String(nick || '').trim().toLowerCase();
}

function antiPing(nick) {
  const value = String(nick || '');

  if (!value) {
    return value;
  }

  return value.length > 1
    ? `${value[0]}\u200B${value.slice(1)}`
    : value;
}

function cleanExpired(map) {
  const cutoff = Date.now() - TIMEOUT_MS;

  for (const [nick, data] of map.entries()) {
    if (!data || data.timestamp < cutoff) {
      map.delete(nick);
    }
  }
}

function parseTargets(ctx) {
  return text(ctx)
    .split(/\s+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function getCallerNick(ctx) {
  return String(
    ctx.nick ||
    ctx.user?.nick ||
    ctx.from ||
    ''
  ).trim();
}

function getClient(ctx) {
  return ctx.client || ctx.bot || ctx.irc || ctx.connection || null;
}

function getReplyTarget(ctx) {
  return ctx.target || ctx.channel || ctx.to || null;
}

function isBridgeCall(ctx) {
  return !!(
    ctx.callingRelay ||
    ctx.relay ||
    ctx.bridge ||
    ctx.isBridge ||
    ctx.source === 'bridge'
  );
}

function sendRaw(client, ...args) {
  if (!client) {
    return false;
  }

  if (typeof client.raw === 'function') {
    client.raw(...args);
    return true;
  }

  if (typeof client.send === 'function') {
    client.send(...args);
    return true;
  }

  return false;
}

function sendCtcpPing(ctx, nick, timestamp) {
  const client = getClient(ctx);
  const targetNick = String(nick || '').trim();

  if (!client || !targetNick) {
    return false;
  }

  if (typeof client.ctcpRequest === 'function') {
    client.ctcpRequest(targetNick, 'PING', String(timestamp));
    return true;
  }

  if (typeof client.ctcp === 'function') {
    client.ctcp(targetNick, 'PING', String(timestamp));
    return true;
  }

  return sendRaw(client, 'PRIVMSG', targetNick, `\x01PING ${timestamp}\x01`);
}

function sendPing(ctx, useMilliseconds) {
  const targetUsers = parseTargets(ctx);
  const callerNick = getCallerNick(ctx);

  if (isBridgeCall(ctx) && targetUsers.length === 0) {
    return say(ctx, "Sorry. You can't get your ping from over a bridge. You can ping irc users by passing one or more as arguments.");
  }

  const usersToPing = targetUsers.length > 0 ? targetUsers : [callerNick];

  if (!usersToPing.length || !usersToPing[0]) {
    return say(ctx, `Usage: ${ctx.prefix}${ctx.command} [nick ...]`);
  }

  const map = useMilliseconds ? pendingMsp : pendingPing;

  cleanExpired(pendingPing);
  cleanExpired(pendingMsp);

  const timestamp = Date.now();

  for (const nick of usersToPing) {
    const key = normalizeNick(nick);

    if (!key) {
      continue;
    }

    map.set(key, {
      ctx,
      target: getReplyTarget(ctx),
      timestamp
    });

    if (!sendCtcpPing(ctx, nick, timestamp)) {
      map.delete(key);
      return say(ctx, 'Ping failed: IRC client does not expose a CTCP/raw send method.');
    }
  }
}

function getNoticeText(event) {
  return String(
    event?.notice ||
    event?.message ||
    event?.text ||
    event?.params?.[1] ||
    event?.args?.[1] ||
    ''
  );
}

function getNoticeNick(event) {
  return String(
    event?.nick ||
    event?.user?.nick ||
    event?.from ||
    event?.prefix?.nick ||
    event?.source?.nick ||
    ''
  );
}

function makeReplyCtx(data) {
  if (data.ctx) {
    return data.ctx;
  }

  return {
    target: data.target,
    channel: data.target
  };
}

function handleNotice(event) {
  const notice = getNoticeText(event);

  if (!notice.startsWith('\x01PING ')) {
    return false;
  }

  const nick = getNoticeNick(event);
  const key = normalizeNick(nick);

  if (!key) {
    return false;
  }

  cleanExpired(pendingPing);
  cleanExpired(pendingMsp);

  if (pendingPing.has(key)) {
    const data = pendingPing.get(key);
    pendingPing.delete(key);

    const elapsed = Date.now() - data.timestamp;
    const seconds = (elapsed / 1000).toFixed(2).replace(/\.?0+$/, '');

    say(makeReplyCtx(data), `Ping reply from ${antiPing(nick)} ${seconds}s`);
    return true;
  }

  if (pendingMsp.has(key)) {
    const data = pendingMsp.get(key);
    pendingMsp.delete(key);

    const elapsed = Date.now() - data.timestamp;

    say(makeReplyCtx(data), `Ping reply from ${antiPing(nick)} ${elapsed}ms`);
    return true;
  }

  return false;
}

module.exports = {
  name: 'Ping',
  commands: [
    {
      name: 'ping',
      aliases: ['p'],
      help: 'Sends a CTCP Ping to you, or the user supplied to check latency.'
    },
    {
      name: 'msp',
      aliases: ['msping'],
      help: 'Sends a CTCP Ping to you, or the user supplied to check latency, replies with milliseconds.'
    }
  ],

  init() {
    console.log('[Ping] initialized');
  },

  handleCommand(ctx) {
    const command = String(ctx.command || '').toLowerCase();

    if (command === 'msp' || command === 'msping') {
      return sendPing(ctx, true);
    }

    return sendPing(ctx, false);
  },

  handleNotice,
  onNotice: handleNotice,
  notice: handleNotice
};