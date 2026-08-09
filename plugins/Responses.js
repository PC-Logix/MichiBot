'use strict';

const {
  act,
  addressedSay,
  pick,
  say
} = require('../utils/helper');

const RESPONSE_TIMEOUT_MS = 30_000;

const SURPRISE_RESPONSES = Object.freeze([
  'What? D:', 'Nooooo', 'Whatever.', 'Nuuh', "I'll stab you in the face!",
  'How dare you?!', 'Fight me!', 'No u!', "Someone's mad."
]);
const THANKS_RESPONSES = Object.freeze(['Thanks!', 'Wow thanks!']);
const AFFIRMATIVE_RESPONSES = Object.freeze([
  'Meh.', 'Sure, I guess', 'Hm?', 'What? No.', "That's fine I guess",
  'Sure, whatever', 'Yeah right.', 'Maybe.', 'Okay'
]);
const CARE_RESPONSES = Object.freeze([
  'No caring detected in the area',
  'The tricorder shows 0%, captain',
  'Records show zero shits given',
  'Scans indicate 0.001 units of caring, with a 0.02% margin of error',
  'Earlier instances indicate you do not.',
  'Barely even registers on the care-o-meter',
  'The needle seems to be stuck below 0',
  'Detecting trace amounts of background caring, but nothing significant'
]);
const HURT_RESPONSES = Object.freeze([
  'ow', 'ouch', 'owies', 'ohno D:', 'aaah', 'agh', 'ack', 'owwwww'
]);

const TRIGGERS = Object.freeze([
  ['thanks', 'welcome'], ['thank you', 'welcome'],
  ['hi', 'hello'], ['hello', 'hello'], ['hai', 'hello'], ['ohhai', 'hello'],
  ['good morning', 'hello'], ['good afternoon', 'hello'],
  ['seriously', 'surprise'], ['srsly', 'surprise'], ['how dare you', 'surprise'],
  ['howdareyou', 'surprise'], ['no u', 'surprise'], ['no you', 'surprise'], ['really', 'surprise'],
  ["you're welcome", 'smile'], ['youre welcome', 'smile'], ['no problem', 'smile'],
  ['good', 'thanks'], ['excellent', 'thanks'], ['nice', 'thanks'],
  ['poor', 'angry'], ["you're cute", 'iknow'], ['there there', 'cry'], ['mean', 'cry'],
  ['naughty bits', 'blush'], ['lewd bits', 'blush'], ['boops', 'squeak'], ['pokes', 'squeak'],
  ['defragments', 'tickles'], ['care', 'whocares'], ["that won't work", 'face'],
  ['right', 'right'], ['pets', 'pet'], ['do the flop', 'flop'],
  ['baps', 'hurt'], ['slaps', 'hurt'], ['hits', 'hurt']
].map(Object.freeze));

let lastResponse = 0;

function botNick(ctx) {
  return String(ctx?.client?.user?.nick || ctx?.config?.userName || ctx?.config?.nick || '').trim();
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findResponseType(message) {
  for (const [phrase, type] of TRIGGERS) {
    if (new RegExp(`\\b${escapeRegex(phrase)}\\b`, 'i').test(message)) return type;
  }
  return null;
}

function respond(ctx, type) {
  switch (type) {
    case 'welcome': return addressedSay(ctx, "You're welcome!");
    case 'surprise': return addressedSay(ctx, pick(SURPRISE_RESPONSES));
    case 'smile': return act(ctx, 'smiles ^.^');
    case 'thanks': return addressedSay(ctx, pick(THANKS_RESPONSES));
    case 'angry': return addressedSay(ctx, "Don't you poor me! I'll poor you in the face! D:<");
    case 'iknow': return addressedSay(ctx, 'I know! :D');
    case 'cry': return say(ctx, ' ;_;');
    case 'squeak': return act(ctx, 'squeaks!');
    case 'blush': return say(ctx, 'o///o');
    case 'tickles': return say(ctx, 'That tickles!');
    case 'whocares': return addressedSay(ctx, pick(CARE_RESPONSES));
    case 'face': return say(ctx, 'Your face wont work!');
    case 'flop': return act(ctx, 'does the flop');
    case 'hurt': return addressedSay(ctx, pick(HURT_RESPONSES));
    case 'hello': return say(ctx, `Hello ${ctx.nick}`);
    case 'right': return say(ctx, pick(AFFIRMATIVE_RESPONSES));
    case 'pet': return act(ctx, 'purrs');
    default: return undefined;
  }
}

function handleResponse(ctx, now = Date.now()) {
  const ourNick = botNick(ctx);
  const message = String(ctx?.text || ctx?.message || '');
  if (!ourNick || !message.toLowerCase().includes(ourNick.toLowerCase())) return false;
  if (Number(now) <= lastResponse + RESPONSE_TIMEOUT_MS) return false;

  // The old hook consumed its global response window as soon as the bot was
  // mentioned, even if the remainder did not match a response phrase.
  lastResponse = Number(now);
  const withoutNick = message.replace(new RegExp(escapeRegex(ourNick), 'ig'), '');
  const type = findResponseType(withoutNick);
  if (!type) return false;
  respond(ctx, type);
  return true;
}

module.exports = {
  name: 'Responses',

  init() {
    lastResponse = 0;
    console.log('[Responses] initialized');
  },

  onMessage(ctx) {
    return handleResponse(ctx);
  },

  _private: {
    AFFIRMATIVE_RESPONSES,
    CARE_RESPONSES,
    HURT_RESPONSES,
    RESPONSE_TIMEOUT_MS,
    SURPRISE_RESPONSES,
    THANKS_RESPONSES,
    TRIGGERS,
    findResponseType,
    handleResponse,
    reset() {
      lastResponse = 0;
    },
    respond
  }
};
