'use strict';

const { getDb } = require('../libs/db');
const identities = require('../services/identityLinks');
const points = require('../services/internetPoints');
const rpg = require('../services/rpg');
const world = require('../services/rpgWorld');
const ADMIN = { globalRank: 'Admin' };
const { addressedSay, text } = require('../utils/helper');

async function verifiedDiscordSubject(ctx) {
  if (!ctx.isBridge || typeof ctx.permissions?.getPermissionSubjectsForContext !== 'function') return '';
  const subjects = await ctx.permissions.getPermissionSubjectsForContext(ctx);
  return subjects.find(subject => /^discord:\d+$/i.test(subject)) || '';
}

async function authenticatedIrcAccount(ctx) {
  if (ctx.isBridge) return '';
  if (ctx.account) return String(ctx.account);
  if (typeof ctx.bot?.refreshAccount === 'function') {
    return String(await ctx.bot.refreshAccount(ctx.nick) || '');
  }
  return '';
}

module.exports = {
  name: 'IdentityClaim',
  commands: [{
    name: 'claim',
    access: { public: true },
    help: 'Link your Discord identity to your authenticated IRC account.'
  }, {
    name: 'linkdiscord',
    access: ADMIN,
    help: 'Admin: link a Discord user ID to a NickServ account.'
  }],

  init() {
    identities.ensureSchema();
    console.log('[IdentityClaim] initialized');
  },

  async handleCommand(ctx) {
    const raw = text(ctx);

    if (ctx.command === 'linkdiscord') {
      const parts = raw ? raw.split(/\s+/) : [];
      const [discordId = '', account = ''] = parts;
      if (parts.length !== 2 || !/^\d+$/.test(discordId) || !account) {
        return addressedSay(ctx, `Usage: ${ctx.prefix}linkdiscord <discord-user-id> <nickserv-account>`);
      }

      try {
        const complete = getDb().transaction(() => {
          const result = identities.linkIdentity(`discord:${discordId}`, account);
          if (result.ok) {
            result.characterMerge = rpg.mergeIdentity(result.discordSubject, result.ircAccount, ctx.nick);
            result.worldMerge = world.mergeIdentity(result.discordSubject, result.ircAccount, ctx.nick);
            result.pointsMerge = points.mergeIdentity(result.discordSubject, result.ircAccount);
          }
          return result;
        });
        const result = complete();
        if (!result.ok && result.reason === 'linked') {
          return addressedSay(ctx, `That Discord identity is already linked to IRC account ${result.ircAccount}.`);
        }
        return addressedSay(ctx, result.alreadyLinked ?
          `${result.discordSubject} is already linked to IRC account ${result.ircAccount}.` :
          `${result.discordSubject} is now linked to IRC account ${result.ircAccount}. Identity, permissions, RPG progress, and points are shared.`);
      } catch (error) {
        return addressedSay(ctx, error.message);
      }
    }

    const code = raw.split(/\s+/)[0] || '';

    if (ctx.isBridge) {
      if (code) return addressedSay(ctx, `Submit claim codes from IRC. Run ${ctx.prefix}claim without a code here to create one.`);
      const subject = await verifiedDiscordSubject(ctx);
      if (!subject) return addressedSay(ctx, 'I could not verify your Discord ID through the bridge.');
      const result = identities.createClaim(subject, ctx.nick);
      if (result.linked) return addressedSay(ctx, `Your Discord identity is already linked to IRC account ${result.ircAccount}.`);
      return addressedSay(ctx, `Your claim code is ${result.code}. From your authenticated IRC account, run ${ctx.prefix}claim ${result.code} within 10 minutes.`);
    }

    if (!code) return addressedSay(ctx, `Create a code from Discord first, then use ${ctx.prefix}claim <code> from IRC.`);
    const account = await authenticatedIrcAccount(ctx);
    if (!account) return addressedSay(ctx, 'You must be identified with an IRC account before claiming a Discord identity.');

    const complete = getDb().transaction(() => {
      const result = identities.consumeClaim(code, account);
      if (result.ok) {
        result.characterMerge = rpg.mergeIdentity(result.discordSubject, result.ircAccount, ctx.nick);
        result.worldMerge = world.mergeIdentity(result.discordSubject, result.ircAccount, ctx.nick);
        result.pointsMerge = points.mergeIdentity(result.discordSubject, result.ircAccount);
      }
      return result;
    });
    const result = complete();
    if (!result.ok && result.reason === 'linked') {
      return addressedSay(ctx, `That Discord identity is already linked to IRC account ${result.ircAccount}.`);
    }
    if (!result.ok) return addressedSay(ctx, 'That claim code is invalid or has expired.');
    return addressedSay(ctx, `${result.discordName || result.discordSubject} is now linked to IRC account ${result.ircAccount}. Identity, permissions, RPG progress, and points are shared.`);
  },

  _private: {
    authenticatedIrcAccount,
    identities,
    verifiedDiscordSubject
  }
};
