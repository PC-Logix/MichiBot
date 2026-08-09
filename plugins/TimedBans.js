'use strict';

const { addressedSay, text } = require('../utils/helper');
const moderation = require('../services/moderation');

const MOD_IN_CHANNEL = {
  allOf: [
    { channelOnly: true },
    { globalRank: 'Moderator' }
  ]
};
const SWEEP_INTERVAL_MS = 1_000;

let timer = null;
let baseCtx = null;

function sweep() {
  if (baseCtx) moderation.expireTimedActions(baseCtx);
}

function startTimer() {
  if (timer) clearInterval(timer);
  timer = setInterval(sweep, SWEEP_INTERVAL_MS);
  if (typeof timer.unref === 'function') timer.unref();
  sweep();
}

function listMessage(channel, now = Date.now()) {
  const rows = moderation.listTimedActions(channel);
  if (!rows.length) return 'There are no timed bans or quiets at the moment. Why not add a few?';
  return rows.map(row =>
    `Timed ${row.type} of ${row.username} expires in ${moderation.formatDuration(row.expires - now)}. Placed by: ${row.placedBy || '(unknown)'}`
  ).join(' | ');
}

module.exports = {
  name: 'TimedBans',
  commands: [{
    name: 'timed',
    access: MOD_IN_CHANNEL,
    aliases: [
      { name: 'tban', defaultArgs: ['ban'] },
      { name: 'tempban', defaultArgs: ['ban'] },
      { name: 'timedban', defaultArgs: ['ban'] },
      { name: 'tquiet', defaultArgs: ['quiet'] },
      { name: 'tempquiet', defaultArgs: ['quiet'] },
      { name: 'timedquiet', defaultArgs: ['quiet'] },
      { name: 'tlist', defaultArgs: ['list'] }
    ]
  }],

  init(ctx) {
    baseCtx = ctx;
    moderation.ensureSchema();
    startTimer();
    console.log(`[TimedBans] initialized with ${moderation.listTimedActions().length} action(s)`);
  },

  dispose() {
    if (timer) clearInterval(timer);
    timer = null;
    baseCtx = null;
  },

  handleCommand(ctx) {
    const raw = text(ctx);
    const [subcommand = '', nick = '', duration = '1h', ...reasonParts] = raw.split(/\s+/);
    const action = subcommand.toLowerCase();
    const channel = ctx.replyTarget || ctx.to;

    if (action === 'list') return addressedSay(ctx, listMessage(channel));
    if (!['ban', 'quiet'].includes(action) || !nick) {
      return addressedSay(ctx, `Usage: ${ctx.prefix}timed <ban|quiet|list> <nick> [time] [reason]`);
    }

    try {
      moderation.addTimedAction(ctx, {
        type: action,
        channel,
        username: nick,
        duration,
        placedBy: ctx.nick,
        reason: reasonParts.join(' ')
      });
      return addressedSay(ctx, `Timed ${action} set for ${nick} for ${duration}.`);
    } catch (error) {
      return addressedSay(ctx, error.message);
    }
  },

  _private: {
    MOD_IN_CHANNEL,
    SWEEP_INTERVAL_MS,
    listMessage,
    startTimer,
    sweep
  }
};
