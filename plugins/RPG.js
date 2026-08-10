'use strict';

const optionalHooks = require('../services/optionalHooks');
const identities = require('../services/identityLinks');
const rpg = require('../services/rpg');
const world = require('../services/rpgWorld');
const { parseCommandMessage } = require('../libs/commandHandler');
const { addressedSay, say, stripIrcFormatting, text } = require('../utils/helper');

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
  if (target.toLowerCase() === String(ctx.nick || '').toLowerCase() && ctx.account) return identities.resolveIdentity(ctx.account);
  if (!ctx.isBridge && typeof ctx.bot?.refreshAccount === 'function') {
    const account = await ctx.bot.refreshAccount(target);
    if (account) return identities.resolveIdentity(account);
  }
  if (target.toLowerCase() === String(ctx.nick || '').toLowerCase() &&
    typeof ctx.permissions?.getPermissionSubjectsForContext === 'function') {
    const subjects = await ctx.permissions.getPermissionSubjectsForContext(ctx);
    const discord = subjects.find(subject => /^discord:/i.test(subject));
    if (discord) return identities.resolveIdentity(discord);
  }
  return identities.resolveIdentity(target);
}

function levelMessage(character, gains) {
  return `${character.userName} leveled up! Gain ${gains.strength} strength, ${gains.defense} defense, ` +
    `${gains.accuracy} accuracy or ${gains.dodge} dodge by entering the appropriate sub command now!`;
}

function activitySettings(ctx) {
  const config = ctx.config?.rpg?.activity || {};
  const xp = Number(config.xp);
  const cooldownSeconds = Number(config.cooldownSeconds);
  const minLength = Number(config.minLength);
  return {
    enabled: config.enabled !== false,
    xp: Number.isFinite(xp) && xp > 0 ? xp : rpg.DEFAULT_ACTIVITY_XP,
    cooldownMs: Number.isFinite(cooldownSeconds) && cooldownSeconds >= 0 ?
      cooldownSeconds * 1000 : rpg.DEFAULT_ACTIVITY_COOLDOWN_MS,
    minLength: Number.isFinite(minLength) && minLength > 0 ? Math.floor(minLength) : 3
  };
}

function isActivityMessage(ctx, settings) {
  if (!settings.enabled || ctx.isPrivate) return false;
  const channel = ctx.replyTarget || ctx.to;
  if (!channel || !optionalHooks.isEnabled(HOOK_NAME, channel)) return false;
  const message = stripIrcFormatting(ctx.text || '').trim();
  if (message.length < settings.minLength || !/[\p{L}\p{N}]/u.test(message)) return false;
  const currentPrefix = String(ctx.bot?.getPrefix?.() || ctx.config?.commandPrefix || '!');
  return !parseCommandMessage({ text: message, currentPrefix, client: ctx.client, config: ctx.config });
}

module.exports = {
  name: 'RPG',
  commands: [{ name: 'rpg', aliases: ['mud'], access: { public: true } }],

  init() {
    rpg.ensureSchema();
    world.ensureSchema();
    identities.ensureSchema();
    optionalHooks.ensureSchema();
    console.log('[RPG] initialized');
  },

  async onMessage(ctx) {
    const settings = activitySettings(ctx);
    if (!isActivityMessage(ctx, settings)) return;
    const character = rpg.getCharacter(await resolveIdentity(ctx), ctx.nick);
    const result = rpg.gainActivityExperience(character, {
      amount: settings.xp,
      cooldownMs: settings.cooldownMs
    });
    if (result.gains) return say(ctx, levelMessage(character, result.gains));
    return undefined;
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

    if (action === 'story') {
      if (!parts[0]) {
        return addressedSay(ctx, `Active story: ${world.activeStory().title} (${world.activeStoryId()}). Available: ${world.storyPacks.listStories().join(', ') || 'none'}.`);
      }
      if (!(await hasAccess(ctx, ADMIN))) return;
      try {
        const story = world.setActiveStory(parts[0]);
        return say(ctx, `RPG story changed to ${story.title} (${story.id}). Players will enter at ${story.rooms[story.startRoom].name}.`);
      } catch (error) {
        return addressedSay(ctx, error.message);
      }
    }

    if (action === 'reloadstory') {
      if (!(await hasAccess(ctx, ADMIN))) return;
      try {
        const story = world.reloadActiveStory();
        return say(ctx, `Reloaded RPG story ${story.title} (${story.id}).`);
      } catch (error) {
        return addressedSay(ctx, error.message);
      }
    }

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

    if (action === 'activity') {
      const settings = activitySettings(ctx);
      return addressedSay(ctx, settings.enabled ?
        `Chat activity grants ${settings.xp} XP at most once every ${settings.cooldownMs / 1000} seconds for non-command messages.` :
        'Chat activity XP is disabled by configuration.');
    }

    const character = rpg.getCharacter(await resolveIdentity(ctx), ctx.nick);
    const worldState = world.getState(character.account, ctx.nick);

    if (action === 'start') {
      say(ctx, world.activeStory().intro);
      return say(ctx, world.look(worldState));
    }

    if (['look', 'l'].includes(action)) return say(ctx, world.look(worldState));

    if (action === 'go' || Object.prototype.hasOwnProperty.call(world.DIRECTION_ALIASES, action) ||
      ['north', 'south', 'east', 'west', 'up', 'down'].includes(action)) {
      const requestedDirection = action === 'go' ? parts[0] : action;
      if (!requestedDirection) return addressedSay(ctx, `Usage: ${ctx.prefix}rpg go <direction>`);
      return say(ctx, world.move(worldState, requestedDirection).message);
    }

    if (action === 'explore') return say(ctx, world.explore(worldState, character).message);

    if (action === 'search') {
      const result = world.search(worldState, character);
      for (const message of result.messages) say(ctx, message);
      if (result.gains) return say(ctx, levelMessage(character, result.gains));
      return undefined;
    }

    if (action === 'attack' || action === 'fight') {
      const result = world.attack(worldState, character);
      for (const message of result.messages) say(ctx, message);
      if (result.gains) return say(ctx, levelMessage(character, result.gains));
      return undefined;
    }

    if (action === 'defend' || action === 'guard') {
      const result = world.defend(worldState, character);
      for (const message of result.messages) say(ctx, message);
      return undefined;
    }

    if (action === 'flee' || action === 'run') {
      const result = world.flee(worldState, character, parts[0]);
      for (const message of result.messages) say(ctx, message);
      return undefined;
    }

    if (action === 'rest' || action === 'sleep') return say(ctx, world.rest(worldState, character).message);

    if (action === 'who') {
      const players = world.playersInRoom(worldState);
      return say(ctx, players.length ? `Also here: ${players.join(', ')}.` : 'Nobody else is here right now.');
    }

    if (action === 'map') return say(ctx, world.mapText());

    if (action === 'gold') return say(ctx, `You have ${worldState.gold} gold and ${worldState.victories} victories.`);

    if (action === 'help') {
      return addressedSay(ctx, `Commands: look, go <direction>, explore, search, attack, defend, flee [direction], rest, who, map, gold, stats, status, activity, story, and stat choices.`);
    }

    if (action === 'stats') {
      say(ctx, rpg.summary(character));
      say(ctx, `${character.strength} strength, ${character.defense} defense, ${character.accuracy} accuracy & ${character.dodge} dodge.`);
      return say(ctx, `${world.roomFor(worldState).name}; ${worldState.gold} gold; ${worldState.victories} victories.`);
    }

    if (['strength', 'defense', 'accuracy', 'dodge'].includes(action)) {
      const gain = rpg.applyStatGain(character, action);
      return say(ctx, gain > 0 ?
        `You gained ${gain} ${action}! You now have ${character[action]}` :
        `You have no ${action} to gain at the moment.`);
    }

    if (action === 'status') return say(ctx, `Your status is "${rpg.status(character, true)}"`);

    return addressedSay(ctx, `Usage: ${ctx.prefix}rpg <start|look|go|explore|search|attack|defend|flee|rest|who|map|gold|stats|status|activity|help>`);
  },

  _private: {
    ADMIN,
    HOOK_NAME,
    MOD_IN_CHANNEL,
    activitySettings,
    hasAccess,
    isActivityMessage,
    levelMessage,
    resolveIdentity,
    world
  }
};
