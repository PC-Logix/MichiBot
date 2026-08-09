'use strict';

const optionalHooks = require('../services/optionalHooks');
const rpg = require('../services/rpg');
const { addressedSay, say, text } = require('../utils/helper');

const HOOK_NAME = 'RPG';
const MOD_IN_CHANNEL = {
  allOf: [
    { channelOnly: true },
    { globalRank: 'Moderator' }
  ]
};
const ADMIN = { globalRank: 'Admin' };

async function hasAccess(ctx, access) {
  if (!ctx.isBridge && !ctx.account && typeof ctx.bot?.refreshAccount === 'function') {
    ctx.account = await ctx.bot.refreshAccount(ctx.nick);
  }
  return ctx.permissions.canAccessAsync(ctx, access);
}

async function resolveIdentity(ctx, nick = ctx.nick) {
  const target = String(nick || '').trim();
  if (!target) return '';
  if (target.toLowerCase() === String(ctx.nick || '').toLowerCase() && ctx.account) return ctx.account;
  if (!ctx.isBridge && typeof ctx.bot?.refreshAccount === 'function') {
    const account = await ctx.bot.refreshAccount(target);
    if (account) return account;
  }
  if (target.toLowerCase() === String(ctx.nick || '').toLowerCase() &&
    typeof ctx.permissions?.getPermissionSubjectsForContext === 'function') {
    const subjects = await ctx.permissions.getPermissionSubjectsForContext(ctx);
    const discord = subjects.find(subject => /^discord:/i.test(subject));
    if (discord) return discord;
  }
  return target;
}

function levelMessage(character, gains) {
  return `${character.userName} leveled up! Gain ${gains.strength} strength, ${gains.defense} defense, ` +
    `${gains.accuracy} accuracy or ${gains.dodge} dodge by entering the appropriate sub command now!`;
}

module.exports = {
  name: 'RPG',
  commands: [{ name: 'rpg', access: { public: true } }],

  init() {
    rpg.ensureSchema();
    optionalHooks.ensureSchema();
    console.log('[RPG] initialized');
  },

  async handleCommand(ctx) {
    const raw = text(ctx);
    const [subcommand = '', ...parts] = raw.split(/\s+/);
    const action = subcommand.toLowerCase();
    const channel = ctx.replyTarget || ctx.to;

    if (action === 'enable' || action === 'disable') {
      if (!(await hasAccess(ctx, MOD_IN_CHANNEL))) return;
      const changed = action === 'enable' ?
        optionalHooks.enable(HOOK_NAME, channel) :
        optionalHooks.disable(HOOK_NAME, channel);
      return addressedSay(ctx, changed ?
        `${action === 'enable' ? 'Enabled' : 'Disabled'} RPG for this channel.` :
        `RPG is already ${action === 'enable' ? 'enabled' : 'disabled'} for this channel.`);
    }

    if (!action || action === 'state') {
      return addressedSay(ctx, `RPG is ${optionalHooks.isEnabled(HOOK_NAME, channel) ? 'enabled' : 'disabled'} in this channel.`);
    }

    if (!optionalHooks.isEnabled(HOOK_NAME, channel)) return addressedSay(ctx, 'RPG is disabled in this channel.');

    if (action === 'givexp') {
      if (!(await hasAccess(ctx, ADMIN))) return;
      const [target, amountText] = parts;
      const amount = Number(amountText);
      if (!target || !Number.isFinite(amount)) return addressedSay(ctx, `Usage: ${ctx.prefix}rpg givexp <user> <amount>`);
      const character = rpg.getCharacter(await resolveIdentity(ctx, target), target);
      const gains = rpg.gainExperience(character, amount);
      if (gains) return say(ctx, levelMessage(character, gains));
      return say(ctx, `${character.userName} now has ${character.xp} experience! (${rpg.experienceToNextLevel(character)} until next level)`);
    }

    const character = rpg.getCharacter(await resolveIdentity(ctx), ctx.nick);

    if (action === 'stats') {
      say(ctx, rpg.summary(character));
      return say(ctx, `${character.strength} strength, ${character.defense} defense, ${character.accuracy} accuracy & ${character.dodge} dodge.`);
    }

    if (['strength', 'defense', 'accuracy', 'dodge'].includes(action)) {
      const gain = rpg.applyStatGain(character, action);
      return say(ctx, gain > 0 ?
        `You gained ${gain} ${action}! You now have ${character[action]}` :
        `You have no ${action} to gain at the moment.`);
    }

    if (action === 'status') return say(ctx, `Your status is "${rpg.status(character, true)}"`);

    return addressedSay(ctx, `Usage: ${ctx.prefix}rpg <state|enable|disable|stats|status|strength|defense|accuracy|dodge|givexp>`);
  },

  _private: {
    ADMIN,
    HOOK_NAME,
    MOD_IN_CHANNEL,
    hasAccess,
    levelMessage,
    resolveIdentity
  }
};
