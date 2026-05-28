'use strict';
const {
  diceSidesFromItem,
  itemOrRandom,
  parseTargetAndItem,
  pick,
  randInt,
  rollDiceInString,
  say
} = require('../utils/helper');
const places = ['in the face', 'in the knees', 'in the spleen', 'in the shoulder', 'right in the pride',
  'somewhere dramatic'
];
module.exports = {
  name: 'Fling',
  commands: [{ name: 'fling', aliases: ['sling', 'shoot', 'launch'] }],
  init() {
    console.log('[Fling] initialized');
  },
  async handleCommand(ctx) {
    let {
      target,
      item
    } = parseTargetAndItem(ctx);
    const it = itemOrRandom(item);
    const verbs = {
      fling: 'flings',
      sling: 'slings',
      shoot: 'shoots',
      launch: 'launches'
    };
    const verb = verbs[ctx.invokedCommand] || verbs[ctx.command] || 'flings';
    if (!it) return say(ctx,
      `${ctx.nick} makes a ${verb.replace(/s$/,'ing')} motion but realizes there was nothing there...`);
    target = target || 'someone nearby';
    if (randInt(1, 100) > 20) {
      const dmg = rollDiceInString(`1d${diceSidesFromItem(it,4)} damage`, true);
      say(ctx,
        `${ctx.nick} ${verb} ${it} in a random direction. It hits ${target} ${pick(places)}. They take ${dmg}!`);
    } else say(ctx, `${ctx.nick} ${verb} ${it} in a random direction. It hits the ground near ${target}`);
  }
};
