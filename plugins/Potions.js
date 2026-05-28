'use strict';

const {
  getDb
} = require('../libs/db');

const {
  pick,
  randInt,
  say,
  text,
  rollDiceInString
} = require('../utils/helper');

const potionData = require('../utils/potionData');

const PUBLIC = {
  public: true
};

const ADMIN = {
  globalRank: 'Admin'
};

const STATE_KEY = 'potions_state_v1';
const DAYS_POTIONS_LAST = 4;

function db() {
  const d = getDb();
  d.exec(`
    CREATE TABLE IF NOT EXISTS JsonData (
      mykey VARCHAR(255) PRIMARY KEY NOT NULL,
      store TEXT DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS Statistics (
      id INTEGER PRIMARY KEY,
      "group" VARCHAR(1000),
      "key" VARCHAR(1000),
      count DOUBLE
    );
  `);
  return d;
}

function nowMs() {
  return Date.now();
}

function defaultState() {
  return {
    resetAt: nowMs() + (DAYS_POTIONS_LAST * 86400000),
    potions: {}
  };
}

function loadState() {
  const row = db().prepare('SELECT store FROM JsonData WHERE mykey = ?').get(STATE_KEY);
  if (!row?.store) return defaultState();

  try {
    const parsed = JSON.parse(row.store);
    if (!parsed || typeof parsed !== 'object') return defaultState();
    if (!parsed.potions || typeof parsed.potions !== 'object') parsed.potions = {};
    if (!Number.isFinite(Number(parsed.resetAt))) parsed.resetAt = defaultState().resetAt;
    return parsed;
  } catch (_) {
    return defaultState();
  }
}

function saveState(state) {
  db().prepare('INSERT OR REPLACE INTO JsonData (mykey, store) VALUES (?, ?)')
    .run(STATE_KEY, JSON.stringify(state));
}

function resetState() {
  const state = defaultState();
  saveState(state);
  return state;
}

function getState() {
  const state = loadState();
  if (Number(state.resetAt || 0) <= nowMs()) {
    return resetState();
  }
  return state;
}

function statIncrement(group, key, amount = 1) {
  const d = db();
  const row = d.prepare('SELECT id, count FROM Statistics WHERE "group" = ? AND "key" = ? LIMIT 1')
    .get(group, key);

  if (row) {
    d.prepare('UPDATE Statistics SET count = ? WHERE id = ?')
      .run(Number(row.count || 0) + amount, row.id);
  } else {
    d.prepare('INSERT INTO Statistics ("group", "key", count) VALUES (?, ?, ?)')
      .run(group, key, amount);
  }
}

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function titleCase(value) {
  const raw = String(value || '').trim();
  if (!raw) return raw;
  return raw.substring(0, 1).toUpperCase() + raw.substring(1);
}

function withPrefix(entry, lowercase = false) {
  if (!entry) return '';
  const name = lowercase ? entry.name.toLowerCase() : entry.name;
  const prefix = String(entry.prefix || '').trim();
  const textValue = prefix ? `${prefix} ${name}` : name;
  return lowercase ? textValue.toLowerCase() : textValue;
}

function articleFor(value) {
  const raw = String(value || '').trim();
  if (!raw) return 'a';
  return /^[aeiou]/i.test(raw) ? 'an' : 'a';
}

function withComputedPrefix(value, lowercase = false) {
  const raw = String(value || '').trim();
  if (!raw) return raw;
  const prefix = articleFor(raw);
  const result = `${prefix} ${raw}`;
  return lowercase ? result.toLowerCase() : result;
}

function pluralize(value) {
  const raw = String(value || '').trim();
  if (!raw) return raw;
  if (/[sxz]$/i.test(raw) || /(ch|sh)$/i.test(raw)) return `${raw}es`;
  if (/[^aeiou]y$/i.test(raw)) return raw.replace(/y$/i, 'ies');
  return `${raw}s`;
}

function formatResetAt(resetAt) {
  const diff = Math.max(0, Number(resetAt || 0) - nowMs());
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes || !parts.length) parts.push(`${minutes}m`);
  return parts.join(' ');
}

function randomEntry(entries) {
  return pick(entries);
}

function appearanceItem(entry, itemName, usePrefix = true) {
  const pattern = entry?.itemPattern || '{appearance} {item}';
  const value = pattern
    .replace(/\{appearance\}/g, entry?.name || '')
    .replace(/\{item\}/g, itemName || 'thing');

  return usePrefix && entry?.prefix ? `${entry.prefix} ${value}` : value;
}

function turnsTo(entry, lowercase = false) {
  const pattern = entry?.turnPattern || '{appearance}';
  const value = pattern.replace(/\{appearance\}/g, entry?.name || '');
  return lowercase ? value.toLowerCase() : value;
}

function rowName(row, includePrefix = false, lowercase = false, plural = false) {
  if (!row) return '';
  let name = row[1] || '';
  if (plural) {
    if (row[3] != null) {
      const cut = Number(row[3]);
      name = `${name.substring(0, Math.max(0, name.length - cut))}${row[2] || 's'}`;
    } else {
      name = `${name}${row[2] || 's'}`;
    }
  } else if (includePrefix && row[0]) {
    name = `${String(row[0]).replace(/\*/g, '')} ${name}`;
  }
  return lowercase ? name.toLowerCase() : name;
}

function randomGarbage(includePrefix = true, lowercase = false) {
  const row = randomEntry(potionData.garbageItems);
  if (!row) return lowercase ? 'suspicious lint' : 'Suspicious lint';
  let value;
  if (includePrefix && row[0]) value = `${row[0]} ${row[1]}`;
  else value = row[1];
  return lowercase ? value.toLowerCase() : value;
}

function randomTransformation({
  includePrefix = false,
  lowercase = true,
  plural = false,
  secondOrder = false
} = {}) {
  const rows = secondOrder ? potionData.animals : potionData.animals.concat(potionData.objects);
  return rowName(randomEntry(rows), includePrefix, lowercase, plural);
}

function findEntryInString(entries, input) {
  const wordsReversed = String(input || '').toLowerCase().split(/\s+/).filter(Boolean).reverse().join(' ');
  const sorted = entries.slice().sort((a, b) => b.name.length - a.name.length);

  for (const entry of sorted) {
    if (wordsReversed.includes(entry.name.toLowerCase())) return entry;
  }

  // Also support normal order because humans are weak and I am not judging.
  const normal = String(input || '').toLowerCase();
  for (const entry of sorted) {
    if (normal.includes(entry.name.toLowerCase())) return entry;
  }

  return null;
}

function combinationKey(consistency, appearance) {
  return `${normalize(consistency?.name)},${normalize(appearance?.name)}`;
}

function getPotionFromString(input = '') {
  let consistency = findEntryInString(potionData.consistencies, input);
  let appearance = findEntryInString(potionData.appearances, input);

  if (!consistency) consistency = randomEntry(potionData.consistencies);
  if (!appearance) appearance = randomEntry(potionData.appearances);

  const state = getState();
  const key = combinationKey(consistency, appearance);
  const existing = state.potions[key];

  return {
    consistency,
    appearance,
    key,
    isNew: !existing,
    state,
    stored: existing || null
  };
}

function getEffectForPotion(potion, targetName, triggererName, splash = false) {
  if (potion.stored) return potion.stored;

  let candidates = potionData.effects;
  if (normalize(potion.consistency.name) === 'mutable') {
    candidates = potionData.effects.slice(1, 7);
  }

  const source = randomEntry(candidates);
  const discoveredDrink = renderEffect(source.drink, {
    user: targetName,
    triggerer: triggererName,
    consistency: potion.consistency,
    appearance: potion.appearance,
    splash,
    discovering: true
  });

  const discoveredSplash = renderEffect(source.splash || source.drink, {
    user: targetName,
    triggerer: triggererName,
    consistency: potion.consistency,
    appearance: potion.appearance,
    splash: true,
    discovering: true
  });

  const stored = {
    key: source.key,
    drink: source.drink,
    splash: source.splash || null,
    discoveredDrink,
    discoveredSplash,
    discoverer: splash ? `${triggererName} (${targetName})` : targetName,
    discoveredAt: nowMs()
  };

  potion.state.potions[potion.key] = stored;
  saveState(potion.state);
  statIncrement('potion_effects', source.key, 1);

  return stored;
}

function replaceRandomRanges(value) {
  return String(value || '').replace(
    /\{r:\s*(-?\d+)\s*-\s*(-?\d+)\s*:\s*([^}]*)\}/gi,
    (match, minRaw, maxRaw, labelRaw) => {
      let min = Number.parseInt(minRaw, 10);
      let max = Number.parseInt(maxRaw, 10);
      if (!Number.isFinite(min) || !Number.isFinite(max)) return match;
      if (max < min) [min, max] = [max, min];

      const count = randInt(min, max);
      const label = String(labelRaw || '').trim();
      if (!label) return String(count);

      return `${count} ${count === 1 ? label : pluralize(label)}`;
    }
  );
}

function resolveEvades(value) {
  let out = String(value || '');

  out = out.replace(/\{evade:(\d+):([^}]+)\}/gi, (match, dcRaw, damage) => {
    const dc = Number(dcRaw);
    const roll = randInt(1, 20);
    if (roll >= dc) return `They successfully evaded it with a ${roll} vs DC ${dc}!`;
    const damageText = String(damage || '').trim() === '0' ? '' : ` and takes ${rollDiceInString(damage, true)} damage`;
    return `They fail to evade it with a ${roll} vs DC ${dc}${damageText}.`;
  });

  out = out.replace(/\{evade_qc:(\d+):([^:}]+):([^}]+)\}/gi, (match, dcRaw, success, fail) => {
    const dc = Number(dcRaw);
    const roll = randInt(1, 20);
    const chosen = roll >= dc ? success : fail;
    return `${chosen} (${roll} vs DC ${dc})`;
  });

  return out;
}

function renderLimit({
  user,
  triggerer,
  consistency,
  appearance,
  splash = false,
  prefix = '#'
} = {}) {
  let out = String(randomEntry(potionData.limits) || '').trim();

  const con = consistency || randomEntry(potionData.consistencies);
  const app = appearance || randomEntry(potionData.appearances);
  const codeword = randomEntry(potionData.codeWords) || 'mew';
  const codeword2 = randomEntry(potionData.codeWords.filter(w => w !== codeword)) || 'nyan';

  out = out.replace(/\{user\}/g, user || 'someone');
  out = out.replace(/\{triggerer\}/g, triggerer || '');
  out = out.replace(/\{prefix\}/g, prefix || '#');
  out = out.replace(/\{codeword2\}/g, codeword2);
  out = out.replace(/\{codeword\}/g, codeword);

  out = out.replace(/\{appearance:([^:}]+):p\}/gi, (_, item) => appearanceItem(app, item, true).toLowerCase());
  out = out.replace(/\{appearance:([^:}]+):\}/gi, (_, item) => appearanceItem(app, item, false).toLowerCase());
  out = out.replace(/\{appearance_p_lc\}/g, withPrefix(app, true));
  out = out.replace(/\{appearance_p\}/g, withPrefix(app, false));
  out = out.replace(/\{appearance_lc\}/g, app.name.toLowerCase());
  out = out.replace(/\{appearance\}/g, app.name);

  out = out.replace(/\{consistency_p_lc\}/g, withPrefix(con, true));
  out = out.replace(/\{consistency_p\}/g, withPrefix(con, false));
  out = out.replace(/\{consistency_lc\}/g, con.name.toLowerCase());
  out = out.replace(/\{consistency\}/g, con.name);

  out = replaceRandomRanges(out);
  out = rollDiceInString(out, true);
  out = resolveEvades(out);

  return out.replace(/\s+/g, ' ').replace(/\s+([,.!?])/g, '$1').trim();
}

function renderEffect(template, {
  user,
  triggerer,
  consistency,
  appearance,
  splash = false,
  prefix = '#'
} = {}) {
  const con = consistency || randomEntry(potionData.consistencies);
  const app = appearance || randomEntry(potionData.appearances);
  const app2 = randomEntry(potionData.appearances);
  const codeword = randomEntry(potionData.codeWords) || 'mew';
  const codeword2 = randomEntry(potionData.codeWords.filter(w => w !== codeword)) || 'nyan';

  const limit = renderLimit({
    user,
    triggerer,
    consistency: con,
    appearance: app,
    splash,
    prefix
  });

  let out = String(template || 'No effect.');

  out = out.replace(/\{user\}/g, user || 'someone');
  out = out.replace(/\{triggerer\}/g, triggerer || '');
  out = out.replace(/\{prefix\}/g, prefix || '#');
  out = out.replace(/\{limit\}/g, limit);
  out = out.replace(/\{codeword2\}/g, codeword2);
  out = out.replace(/\{codeword\}/g, codeword);

  out = out.replace(/\{appearance:([^:}]+):p\}/gi, (_, item) => appearanceItem(app, item, true).toLowerCase());
  out = out.replace(/\{appearance:([^:}]+):\}/gi, (_, item) => appearanceItem(app, item, false).toLowerCase());
  out = out.replace(/\{appearance_p_lc\}/g, withPrefix(app, true));
  out = out.replace(/\{appearance_p\}/g, withPrefix(app, false));
  out = out.replace(/\{appearance_lc\}/g, app.name.toLowerCase());
  out = out.replace(/\{appearance\}/g, app.name);
  out = out.replace(/\{turn_appearance_lc\}/g, turnsTo(app2, true));
  out = out.replace(/\{turn_appearance\}/g, turnsTo(app2, false));

  out = out.replace(/\{consistency_p_lc\}/g, withPrefix(con, true));
  out = out.replace(/\{consistency_p\}/g, withPrefix(con, false));
  out = out.replace(/\{consistency_lc\}/g, con.name.toLowerCase());
  out = out.replace(/\{consistency\}/g, con.name);

  out = out.replace(/\{transformation_pc\}/g, randomTransformation({ includePrefix: true, lowercase: false }));
  out = out.replace(/\{transformation_p\}/g, randomTransformation({ includePrefix: true, lowercase: true }));
  out = out.replace(/\{transformation2_p\}/g, randomTransformation({ includePrefix: true, lowercase: true, secondOrder: true }));
  out = out.replace(/\{transformation2\}/g, randomTransformation({ lowercase: true, secondOrder: true }));
  out = out.replace(/\{transformations_p\}/g, randomTransformation({ includePrefix: true, lowercase: true, plural: true }));
  out = out.replace(/\{transformations2_p\}/g, randomTransformation({ includePrefix: true, lowercase: true, plural: true, secondOrder: true }));
  out = out.replace(/\{transformations2\}/g, randomTransformation({ lowercase: true, plural: true, secondOrder: true }));
  out = out.replace(/\{transformations\}/g, randomTransformation({ lowercase: true, plural: true }));
  out = out.replace(/\{transformation\}/g, randomTransformation({ lowercase: true }));

  out = out.replace(/\{junk_or_item_p\}/g, randomGarbage(true, true));
  out = out.replace(/\{junk_or_item\}/g, randomGarbage(false, true));
  out = out.replace(/\{junk_p_lc\}/g, randomGarbage(true, true));
  out = out.replace(/\{junk_p\}/g, randomGarbage(true, false));
  out = out.replace(/\{junk\}/g, randomGarbage(false, false));
  out = out.replace(/\{item\}/g, randomGarbage(false, true));

  out = replaceRandomRanges(out);
  out = rollDiceInString(out, true);
  out = resolveEvades(out);

  return out.replace(/\s+/g, ' ').replace(/\s+([,.!?])/g, '$1').trim();
}

function concealedForDisplay(value) {
  return String(value || '')
    .replace(/\{user\}/g, 'someone')
    .replace(/\{triggerer\}/g, 'someone')
    .replace(/\{[^}]+\}/g, '...')
    .replace(/\s+/g, ' ')
    .trim();
}

function potionDescription(potion) {
  return `${potion.consistency.name} ${potion.appearance.name} potion`;
}

function handleSpecialFluid(ctx, fluid, splashTarget = '') {
  const key = normalize(fluid);
  const entry = potionData.specialFluids[key];
  if (!entry) return false;

  const rendered = renderEffect(splashTarget ? entry.splash : entry.drink, {
    user: splashTarget || ctx.nick,
    triggerer: ctx.nick,
    consistency: randomEntry(potionData.consistencies),
    appearance: randomEntry(potionData.appearances),
    splash: !!splashTarget,
    prefix: ctx.prefix || '#'
  });

  say(ctx, rendered);
  return true;
}

function drinkPotion(ctx, potionText) {
  const raw = String(potionText || '').trim();
  if (raw && handleSpecialFluid(ctx, raw)) return;

  const potion = getPotionFromString(raw);
  const effect = getEffectForPotion(potion, ctx.nick, ctx.nick, false);
  const effectText = renderEffect(effect.drink, {
    user: ctx.nick,
    triggerer: ctx.nick,
    consistency: potion.consistency,
    appearance: potion.appearance,
    splash: false,
    prefix: ctx.prefix || '#'
  });

  say(
    ctx,
    `You drink ${withPrefix(potion.consistency, true)} ${potion.appearance.name.toLowerCase()} potion${potion.isNew ? ' (New!)' : ''}. ${effectText}`
  );
}

function splashPotion(ctx, targetName, potionText) {
  const splashTarget = String(targetName || '').trim();
  if (!splashTarget) {
    return say(ctx, `Usage: ${ctx.prefix || '#'}splash <target> [potion]`);
  }

  const raw = String(potionText || '').trim();
  if (raw && handleSpecialFluid(ctx, raw, splashTarget)) return;

  const potion = getPotionFromString(raw);
  const effect = getEffectForPotion(potion, splashTarget, ctx.nick, true);
  const template = effect.splash || effect.drink;
  const effectText = renderEffect(template, {
    user: splashTarget,
    triggerer: ctx.nick,
    consistency: potion.consistency,
    appearance: potion.appearance,
    splash: true,
    prefix: ctx.prefix || '#'
  });

  say(
    ctx,
    `You fling ${withPrefix(potion.consistency, true)} ${potion.appearance.name.toLowerCase()} potion${potion.isNew ? ' (New!)' : ''} that splashes onto ${splashTarget}. ${effectText}`
  );
}

function potionSummary() {
  const state = getState();
  const rows = Object.entries(state.potions).map(([key, entry]) => {
    const [consistencyKey, appearanceKey] = key.split(',');
    const consistency = potionData.consistencies.find(e => normalize(e.name) === consistencyKey);
    const appearance = potionData.appearances.find(e => normalize(e.name) === appearanceKey);

    return {
      key,
      potion: `${titleCase(consistency?.name || consistencyKey)} ${titleCase(appearance?.name || appearanceKey)} Potion`,
      effectKey: entry.key,
      effect: concealedForDisplay(entry.discoveredDrink || entry.drink),
      discoverer: entry.discoverer || '',
      discoveredAt: entry.discoveredAt || 0
    };
  }).sort((a, b) => String(a.potion).localeCompare(String(b.potion)));

  const uniqueEffects = new Set(rows.map(row => row.effectKey)).size;

  return {
    resetAt: state.resetAt,
    resetIn: formatResetAt(state.resetAt),
    appearanceCount: potionData.appearances.length,
    consistencyCount: potionData.consistencies.length,
    combinationCount: potionData.appearances.length * potionData.consistencies.length,
    effectCount: potionData.effects.length,
    discoveredCount: rows.length,
    uniqueEffects,
    rows,
    appearances: potionData.appearances.slice().sort((a, b) => a.name.localeCompare(b.name)),
    consistencies: potionData.consistencies.slice().sort((a, b) => a.name.localeCompare(b.name))
  };
}

function lookupPotion(params) {
  const potion = getPotionFromString(params);
  return {
    key: potion.key,
    registered: !!potion.stored,
    consistency: potion.consistency.name,
    appearance: potion.appearance.name
  };
}

function baseDomain(ctx) {
  return ctx.config?.http?.baseDomain || ctx.config?.httpdBaseDomain || '';
}

module.exports = {
  name: 'Potions',

  commands: [
    {
      name: 'drink',
      access: PUBLIC,
      cooldown: {
        key: 'potions_combined',
        minutes: 30,
        perUser: true,
        failMessage: 'The bottle feels really heavy for some reason...'
      },
      aliases: [
        'chug',
        'toast',
        'sip',
        'ingest',
        'consume',
        'use',
        'absorb',
        'engross',
        'quaff',
        'skull',
        'down',
        'slurp',
        {
          name: 'water',
          defaultArgs: ['water']
        }
      ]
    },
    {
      name: 'randompotion',
      access: PUBLIC,
      cooldown: { seconds: 10 },
      aliases: ['potion', 'randpotion', 'gimmepotion']
    },
    {
      name: 'potionstats',
      access: PUBLIC,
      cooldown: { seconds: 10 },
      aliases: [
        'potionsdiscovered',
        'discoveredpotions',
        'potions',
        'potionshelf',
        'potionlist',
        'listpotions'
      ]
    },
    {
      name: 'discovered',
      access: PUBLIC,
      cooldown: { seconds: 10 }
    },
    {
      name: 'splash',
      access: PUBLIC,
      cooldown: {
        key: 'potions_combined',
        minutes: 30,
        perUser: true,
        failMessage: 'The bottle feels really heavy for some reason...'
      }
    },
    {
      name: 'potion_lookup',
      access: PUBLIC,
      cooldown: { seconds: 10 }
    },
    {
      name: 'resetpotions',
      access: ADMIN
    }
  ],

  init() {
    getState();
    console.log(`[Potions] initialized with ${potionData.appearances.length} appearances, ${potionData.consistencies.length} consistencies, ${potionData.effects.length} effects`);
  },

  registerWeb(ctx) {
    const router = ctx.express.Router();

    router.get('/', (req, res) => {
      res.render('potions/index', {
        title: 'Potion Shelf',
        summary: potionSummary(),
        message: req.query.message || ''
      });
    });

    ctx.web.registerRouter(ctx.extension.key, '/potions', router, {
      label: 'Potions'
    });
  },

  async handleCommand(ctx) {
    const raw = text(ctx);

    switch (ctx.command) {
      case 'drink':
        return drinkPotion(ctx, raw);

      case 'splash': {
        const parts = raw.split(/\s+/).filter(Boolean);
        const targetName = parts.shift();
        return splashPotion(ctx, targetName, parts.join(' '));
      }

      case 'randompotion':
      case 'potion':
      case 'randpotion':
      case 'gimmepotion': {
        const potion = getPotionFromString('');
        return say(ctx, `You get ${withPrefix(potion.consistency, true)} ${potion.appearance.name.toLowerCase()} potion${potion.isNew ? ' (New!)' : ''}`);
      }

      case 'potionstats':
      case 'potions':
      case 'potionshelf':
      case 'potionlist':
      case 'listpotions':
      case 'potionsdiscovered':
      case 'discoveredpotions':
      case 'discovered': {
        const summary = potionSummary();
        const url = baseDomain(ctx) ? `${baseDomain(ctx).replace(/\/$/, '')}/potions` : '';
        if (url) return say(ctx, `Potion shelf: ${url}`);

        return say(
          ctx,
          `There are ${summary.appearanceCount} appearances and ${summary.consistencyCount} consistencies. ` +
          `${summary.discoveredCount}/${summary.combinationCount} combinations have been discovered. ` +
          `${summary.effectCount} effects are loaded.`
        );
      }

      case 'potion_lookup': {
        const result = lookupPotion(raw);
        return say(ctx, `Potion combination key: ${result.key}, Potion registered: ${result.registered ? 'Yes' : 'No'}`);
      }

      case 'resetpotions': {
        resetState();
        return say(ctx, 'Potion shelf reset.');
      }

      default:
        return undefined;
    }
  }
};
