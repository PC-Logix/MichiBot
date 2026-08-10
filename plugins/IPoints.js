'use strict';

const channelState = require('../utils/channelState');
const points = require('../services/internetPoints');
const identities = require('../services/identityLinks');
const { addressedSay, antiPing, say, text } = require('../utils/helper');

async function resolveIdentity(ctx, nick) {
  const target = String(nick || '').trim();
  if (!target) return '';
  if (ctx.isBridge && target.toLowerCase() === String(ctx.nick || '').toLowerCase() &&
    typeof ctx.permissions?.getPermissionSubjectsForContext === 'function') {
    const subjects = await ctx.permissions.getPermissionSubjectsForContext(ctx);
    const discord = subjects.find(subject => /^discord:\d+$/i.test(subject));
    if (discord) return identities.resolveIdentity(discord);
  }
  if (!ctx.isBridge && typeof ctx.bot?.refreshAccount === 'function') {
    const account = await ctx.bot.refreshAccount(target);
    if (account) return identities.resolveIdentity(account);
  }
  return identities.resolveIdentity(target);
}

function channelHasUser(channel, nick) {
  const wanted = String(nick || '').trim().toLowerCase();
  return channelState.getUsers(channel).some(user => user.toLowerCase() === wanted);
}

module.exports = {
  name: 'IPoints',
  commands: [
    { name: 'points', access: { public: true } },
    { name: 'resetpoints', access: { globalRank: 'Admin' } }
  ],

  init() {
    points.ensureSchema();
    identities.ensureSchema();
    console.log('[IPoints] initialized');
  },

  async onMessage(ctx) {
    if (ctx.isPrivate) return;
    const match = String(ctx.text || '').trim().match(/^(.+?)\+\+$/);
    if (!match) return;

    const recipient = match[1].trim();
    if (!recipient || !channelHasUser(ctx.to, recipient)) return;
    if (recipient.toLowerCase() === String(ctx.nick || '').toLowerCase()) {
      return addressedSay(ctx, 'You can not give yourself points.');
    }

    const identity = await resolveIdentity(ctx, recipient);
    const total = points.addPoint(identity);
    return say(ctx, `${antiPing(ctx.nick)}: ${antiPing(identity)} now has ${total} points`);
  },

  async handleCommand(ctx) {
    const requested = text(ctx) || ctx.nick;
    const identity = await resolveIdentity(ctx, requested);

    if (ctx.command === 'resetpoints') {
      points.setPoints(identity, 0);
      return addressedSay(ctx, 'points reset');
    }

    return say(ctx, `${antiPing(ctx.nick)}: ${antiPing(identity)} has ${points.getPoints(identity)} points`);
  },

  _private: {
    channelHasUser,
    resolveIdentity
  }
};
