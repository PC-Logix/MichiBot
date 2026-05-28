'use strict';
const {
  itemOrRandom,
  normalizeSelfTarget,
  parseTargetAndItem,
  pick,
  rollDiceInString,
  say
} = require('../utils/helper');
const actions = ['petting', 'stroking', 'patting', 'scritching', 'carefully booping', 'gently fussing over'];
module.exports = {
  name: 'Pet',
  commands: [{ name: 'pet', aliases: ['stroke', 'pat'] }],
  init() {
    console.log('[Pet] initialized');
  },
  async handleCommand(ctx) {
    let {
      target,
      item
    } = parseTargetAndItem(ctx);
    if (!target) return say(ctx, `${ctx.nick} flails at nothingness...`);
    target = normalizeSelfTarget(target, ctx.nick);
    if (target.toLowerCase() === ctx.nick.toLowerCase()) return say(ctx, "Don't pet yourself in public.");
    const it = itemOrRandom(item);
    const hp = rollDiceInString(`1d${it?6:4}`, true);
    say(ctx,
    `${ctx.nick} is ${pick(actions)} ${target}${it?` with ${it}`:''}. ${target} regains ${hp} hit points!`);
  }
};
