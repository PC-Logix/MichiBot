'use strict';

const combat = require('../services/combat');
const inventory = require('../services/inventory');
const { getOffensiveItemBonus } = require('../services/itemBonuses');
const channelState = require('../utils/channelState');
const {
  act,
  antiPingMessage,
  pick,
  randInt,
  say
} = require('../utils/helper');
const potionApi = require('./Potions').api;

const HIT_CHANCE = 40;

function botNick(ctx) {
  return String(ctx?.client?.user?.nick || ctx?.config?.userName || ctx?.config?.nick || 'MichiBot');
}

function parseShellArgs(args) {
  const values = Array.isArray(args) ? args.map(String) : [];
  return {
    targets: [values.shift() || '', values.shift() || '', values.shift() || ''],
    payload: values.join(' ').trim()
  };
}

function usersIn(ctx) {
  return channelState.getUsers(ctx.replyTarget || ctx.to);
}

function randomUser(ctx, blacklist) {
  const blocked = new Set(blacklist.map(value => String(value).toLowerCase()));
  const candidates = usersIn(ctx).filter(user => !blocked.has(String(user).toLowerCase()));
  return candidates.length ? pick(candidates) : ctx.nick;
}

function resolveTargets(ctx, suppliedTargets) {
  const blacklist = [ctx.nick];
  return suppliedTargets.map(target => {
    const resolved = String(target || '').trim() || randomUser(ctx, blacklist);
    blacklist.push(resolved);
    return resolved;
  });
}

function sendWithoutPings(ctx, message) {
  return say(ctx, antiPingMessage(message, usersIn(ctx)));
}

function damageRoll(item, diceSize, minimum) {
  return combat.rollDiceResult(1, diceSize, getOffensiveItemBonus(item), minimum);
}

function itemShellResult(ctx, item, targets, hitRoll) {
  const [primary, secondary, tertiary] = targets;
  const hit = Number(hitRoll) < HIT_CHANCE;
  const baseDiceSize = item.getDiceSizeFromItemName();
  const primaryDamage = damageRoll(item, baseDiceSize + (hit ? 4 : 2), 4);
  const secondaryDamage = damageRoll(item, baseDiceSize + 2, 2);
  const tertiaryDamage = damageRoll(item, baseDiceSize + 2, 2);
  const first = primaryDamage.getResultString();
  const second = secondaryDamage.getResultString();
  const third = tertiaryDamage.getResultString();

  let strike;
  if (hit) {
    const auxiliaryDamage = second === third ?
      `${second} damage each` :
      `${second}, and ${third} damage respectively`;
    strike = `It strikes ${primary}. They take ${first} damage. ${secondary} and ${tertiary} stood too close and take ${auxiliaryDamage}.`;
  } else {
    const damage = first === second && first === third ?
      `${first} damage each` :
      `${first}, ${second}, and ${third} splash damage respectively`;
    strike = `It strikes the ground near ${primary}, ${secondary}, and ${tertiary}. They take ${damage}.`;
  }

  sendWithoutPings(ctx, `${ctx.nick} loads ${item.getName(false)} into a shell and fires it. ${strike}`);
  const dust = item.damage(hit ? 1 : 2, false, true, true);
  if (dust) sendWithoutPings(ctx, dust);

  return {
    hit,
    primaryDamage,
    secondaryDamage,
    tertiaryDamage,
    dust
  };
}

function potionShellResult(ctx, potionText, targets) {
  const [primary, secondary, tertiary] = targets;
  const resolved = potionApi.resolvePotion(potionText, primary, ctx.nick, true);
  const description = potionApi.resolvedPotionDescription(resolved);
  const discovery = resolved.potion.isNew ? ' (New!)' : '';

  sendWithoutPings(
    ctx,
    `${ctx.nick} loads ${description.replace(/ potion$/, '')}${discovery} potion into a shell and fires it. ` +
    `It lands and explodes into a cloud of vapour which engulfs ${primary}, ${secondary}, and ${tertiary}`
  );

  for (const target of targets) {
    sendWithoutPings(ctx, potionApi.renderResolvedPotion(
      resolved,
      target,
      ctx.nick,
      true,
      ctx.prefix || '#'
    ));
  }

  return resolved;
}

function executeShell(ctx, { hitRoll = randInt(1, 100) } = {}) {
  const parsed = parseShellArgs(ctx.args);
  const potionText = parsed.payload;
  const item = potionText ? null : inventory.getRandomItem(false);

  if (!item && !potionText) {
    return sendWithoutPings(ctx, `${ctx.nick} found nothing to load into the shell...`);
  }

  const targets = resolveTargets(ctx, parsed.targets);
  if (targets.some(target => !combat.canInteractWith(target, botNick(ctx)))) {
    return act(ctx, `kicks ${ctx.nick} into space.`);
  }

  if (potionText) return potionShellResult(ctx, potionText, targets);
  return itemShellResult(ctx, item, targets, hitRoll);
}

module.exports = {
  name: 'Shell',
  commands: [{
    name: 'shell',
    help: 'Be a nuisance with your very own mortar!'
  }],

  init() {
    inventory.ensureSchema();
    console.log('[Shell] initialized');
  },

  handleCommand(ctx) {
    return executeShell(ctx);
  },

  _private: {
    HIT_CHANCE,
    executeShell,
    itemShellResult,
    parseShellArgs,
    potionShellResult,
    randomUser,
    resolveTargets
  }
};
