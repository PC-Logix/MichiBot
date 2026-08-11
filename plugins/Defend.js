'use strict';

const combat = require('../services/combat');
const inventory = require('../services/inventory');
const { getDefensiveItemBonus, getOffensiveItemBonus } = require('../services/itemBonuses');
const { addressedSay, say, stripArgumentConnector } = require('../utils/helper');

const ACTIONS = Object.freeze({
  block: { will: 'block', past: 'blocked' },
  guard: { will: 'guard', past: 'guarded against' },
  deflect: { will: 'deflect', past: 'deflected' },
  parry: { will: 'parry', past: 'parried' },
  counterspell: { will: 'counterspell', past: 'counterspelled' },
  dodge: { will: 'dodge', past: 'dodged' }
});

const ACTION_NAMES = Object.keys(ACTIONS);
const ACTION_LIST = ACTION_NAMES.join(', ');

function actionAliases() {
  return ACTION_NAMES.map(name => ({ name, defaultArgs: [name] }));
}

function formatCheck(value, bonuses) {
  const detail = bonuses.toString();
  return `${value}${detail ? ` (${detail})` : ''}`;
}

function implementDisplay(event) {
  if (!event.implement) return '';
  return ` wielding ${inventory.createLooseItem(event.implement).getName(true)}`;
}

function resolveAttack(ctx, event, action, defenseItem, roll, dc, resultString, dcString) {
  const itemText = defenseItem ? ` using ${defenseItem.getName(true)}` : '';
  const attackerText = implementDisplay(event);
  const article = combat.getNumberPrefix(roll);

  if (roll >= dc + 5) {
    return say(ctx, `${ctx.nick} successfully ${action.past} ${event.triggeringUser}${attackerText}${itemText}. With ${article} ${resultString} vs ${dcString} ${ctx.nick} avoided all of the damage!`);
  }
  if (roll >= dc) {
    return say(ctx, `${ctx.nick} managed to partially ${action.will} ${event.triggeringUser}${attackerText}${itemText}. With ${article} ${resultString} vs ${dcString} ${ctx.nick} only takes half of the ${event.damage} damage.`);
  }
  return say(ctx, `${ctx.nick} failed to ${action.will} ${event.triggeringUser}${attackerText}${itemText}. With ${article} ${resultString} vs ${dcString} ${ctx.nick} takes the full ${event.damage} damage.`);
}

function resolveFling(ctx, event, action, roll, dc, resultString, dcString) {
  const article = combat.getNumberPrefix(roll);
  if (roll >= dc + 5) {
    return say(ctx, `${ctx.nick} successfully ${action.past} the ${event.implement} flung at them by ${event.triggeringUser} with ${article} ${resultString} vs ${dcString}, avoiding all the damage.`);
  }
  if (roll >= dc) {
    return say(ctx, `${ctx.nick} successfully ${action.past} the ${event.implement} flung at them by ${event.triggeringUser} with ${article} ${resultString} vs ${dcString}, taking only half of ${event.damage} damage.`);
  }
  return say(ctx, `${ctx.nick} fails to ${action.will} the ${event.implement} flung at them by ${event.triggeringUser} with ${article} ${resultString} vs ${dcString}, taking the full ${event.damage} damage.`);
}

module.exports = {
  name: 'Defend',
  commands: [{
    name: 'defend',
    aliases: actionAliases(),
    help: 'Defend against attacks and things thrown at you.'
  }, {
    name: 'defenddebug',
    access: { globalRank: 'Admin' },
    help: 'Inspect or process the pending defense queue.'
  }],

  init({ client } = {}) {
    inventory.ensureSchema();
    combat.startScheduler(event => client.say(event.target, event.result));
    console.log('[Defend] initialized');
  },

  dispose() {
    combat.stopScheduler();
  },

  handleCommand(ctx) {
    const args = Array.isArray(ctx.args) ? ctx.args.slice() : [];

    if (ctx.command === 'defenddebug') {
      const action = String(args.shift() || '').toLowerCase();
      if (action === 'force') {
        combat.flushExpired(event => ctx.client.say(event.target, event.result));
        return;
      }
      return addressedSay(ctx, `Events in queue: ${combat.getPendingEvents().length}`);
    }

    const method = String(args.shift() || '').toLowerCase();
    if (!ACTIONS[method]) return say(ctx, `Specify an action as the first parameter: ${ACTION_LIST}`);

    const event = combat.takeFirstEventFor(ctx.nick);
    if (!event) return addressedSay(ctx, 'Nothing to defend against right now.');

    const defenseName = stripArgumentConnector(args.join(' ').trim());
    const defenseItem = defenseName ? inventory.createLooseItem(defenseName) : null;
    const attackBonuses = getOffensiveItemBonus(event.implement);
    const defenseBonuses = defenseItem ? getDefensiveItemBonus(defenseItem) : getDefensiveItemBonus('');
    const dc = event.type.baseDc + attackBonuses.getTotal();
    const defenseRoll = combat.rollDiceResult(1, 20, defenseBonuses);
    const roll = defenseRoll.getTotal();
    const resultString = formatCheck(roll, defenseBonuses);
    const dcString = formatCheck(dc, attackBonuses);

    if (event.type.name === combat.EVENT_TYPES.ATTACK.name) {
      return resolveAttack(ctx, event, ACTIONS[method], defenseItem, roll, dc, resultString, dcString);
    }
    if (event.type.name === combat.EVENT_TYPES.FLING.name) {
      return resolveFling(ctx, event, ACTIONS[method], roll, dc, resultString, dcString);
    }

    return say(ctx, `${ctx.nick} attempts to ${ACTIONS[method].will}, but nothing recognizable happens.`);
  },

  ACTIONS
};
