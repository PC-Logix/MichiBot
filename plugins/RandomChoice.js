'use strict';
const {
  pick,
  say,
  shuffle,
  text,
  randInt
} = require('../utils/helper');
const colors = ['green', 'red', 'orange', 'pink', 'blue', 'octarine', 'gold', 'black'];
const templates0 = ['Make a decision yourself.', 'A nearby lamp replies something inaudible.',
  'I choose not to choose.'];
const templates1 = ['Yes.', 'No.', 'Probably.', 'Boo! No!', 'After all, why shouldn\'t you "{choice}"?',
  'A nearby lamp turns {color}.', '{user}\'s hair turns {color}'
];
const templates2 = ['Some "{choice}" sounds nice', 'I\'m 40% "{choice}"!', 'You *could* do "{choice}", I guess.',
  'I sense some "{choice}" in your future!', '"{choice}" is for cool kids!',
  'I received a message from future you, said to go with "{choice}".', 'You\'ll want to go with "{choice}".',
  'Eeny, meeny, miny, {choice}.', 'Oh no, not "{choice}" again! I\'ll have "{other_choice}" instead.',
  'A nearby lamp replies "{choice}".'
];
const templates3 = ['Definitely "{choice}"... Or maybe "{other_choice}"...',
  'On the one hand, there\'s "{choice}" but then there\'s also "{other_choice}"'
];

function splitChoices(raw) {
  return String(raw || '')
    // Lantea-style #choose commonly used commas, pipes, and plain "or".
    // The previous comma rule only matched commas NOT followed by spaces, so
    // "apples, oranges, crimes" was treated as a single choice.
    .split(/\s*\|\s*|\s*,\s*(?:or\s+)?|\s+or\s+/i)
    .map(x => x.trim().replace(/[?.!:]*$/, ''))
    .filter(Boolean);
}

function applyTemplate(t, choices, ctx) {
  const choice = pick(choices.length ? choices : ['']);
  const other = pick(choices.filter(x => x !== choice).length ? choices.filter(x => x !== choice) : choices);
  return t.replace(/\{choice\}/g, choice).replace(/\{other_choice\}/g, other || choice).replace(/\{count\}/g, String(
    randInt(1, 99))).replace(/\{raw_count\}/g, String(choices.length)).replace(/\{color\}/g, pick(colors)).replace(
    /\{user\}/g, ctx.nick);
}
module.exports = {
  name: 'RandomChoice',
  commands: [{ name: 'choose', aliases: ['choice', 'pick'] }],
  init() {
    console.log('[RandomChoice] initialized');
  },
  async handleCommand(ctx) {
    const raw = text(ctx);
    const semis = raw.split(/; ?/);
    if (semis.length === 2) {
      const choices = splitChoices(semis[1]);
      if (/\$\d\d?/.test(semis[0])) {
        const shuffled = shuffle(choices);
        say(ctx, semis[0].replace(/\$(\d\d?)/g, (_, n) => shuffled[Number(n) - 1] || ''));
        return;
      }
      if (semis[0].includes('$')) {
        say(ctx, semis[0].replace(/\$/g, pick(choices)));
        return;
      }
      say(ctx, `${pick(choices)} ${semis[0]}`.trim());
      return;
    }
    if (semis.length > 2) return say(ctx, 'What?!');
    const choices = splitChoices(raw);
    const pool = choices.length === 0 ? templates0 : choices.length === 1 ? templates1 : choices.length === 2 ?
      templates2 : templates3;
    say(ctx, applyTemplate(pick(pool), choices, ctx));
  }
};
