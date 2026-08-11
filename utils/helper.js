'use strict';

const http = require('http');
const https = require('https');
const dns = require('dns').promises;
const vm = require('vm');

const IRC_COLOR = '\x03';
const IRC_BOLD = '\x02';
const IRC_RESET = '\x0f';

function text(ctx) {
  return Array.isArray(ctx.args) ? ctx.args.join(' ').trim() : '';
}

function say(ctx, message) {
  ctx.reply(ctx.replyTarget || ctx.to, String(message));
}

function act(ctx, message) {
  ctx.action(ctx.replyTarget || ctx.to, String(message));
}

function antiPing(value) {
  const input = String(value || '');
  const midpoint = Math.floor(input.length / 2);
  return `${input.slice(0, midpoint)}\u200B${input.slice(midpoint)}`;
}

function addressedSay(ctx, message, nick = ctx.nick) {
  say(ctx, `${antiPing(nick)}: ${message}`);
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function solvePrefixes(value) {
  const input = String(value || '');
  const countersA = ['a', 'an', 'the', 'a whole lot of', 'many', 'a lot of', 'a number of'];
  const countersTwenty = ['twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const countersOne = [
    'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen',
    'eighteen', 'nineteen'
  ];
  const countersHundred = [
    'hundred', 'thousand', 'million', 'milliard', 'billion', 'billiard', 'trillion',
    'quadrillion', 'quintillion', 'sextillion', 'septillion', 'octillion', 'nonillion',
    'decillion', 'undecillion', 'duodecillion', 'tredecillion', 'quattuordecillion',
    'quindecillion', 'sexdecillion', 'septendecillion', 'octodecillion',
    'novemdecillion', 'vigintillion', 'centillion'
  ];

  function matchPrefix(prefix) {
    const match = input.match(new RegExp(`^(${escapeRegex(prefix)}) (.*)$`, 'i'));
    return match ? [match[1], match[2]] : null;
  }

  for (const prefix of countersA) {
    const match = matchPrefix(prefix);
    if (!match) continue;
    for (const suffix of countersHundred) {
      const compound = matchPrefix(`${prefix} ${suffix}`);
      if (compound) return compound;
    }
    return match;
  }

  for (const prefix of countersOne) {
    const match = matchPrefix(prefix);
    if (!match) continue;
    for (const suffix of countersHundred) {
      const compound = matchPrefix(`${prefix} ${suffix}`);
      if (compound) return compound;
    }
    return match;
  }

  for (const prefix of countersTwenty) {
    const match = matchPrefix(prefix);
    if (!match) continue;
    for (const one of countersOne) {
      const compound = matchPrefix(`${prefix} ${one}`);
      if (!compound) continue;
      for (const suffix of countersHundred) {
        const extended = matchPrefix(`${prefix} ${one} ${suffix}`);
        if (extended) return extended;
      }
      return compound;
    }
    for (const suffix of countersHundred) {
      const compound = matchPrefix(`${prefix} ${suffix}`);
      if (compound) return compound;
    }
    return match;
  }

  return null;
}

function antiPingMessage(message, nicks) {
  let output = String(message || '');
  const names = Array.isArray(nicks) ? nicks.filter(Boolean).map(String) : [];

  for (const part of output.split(' ')) {
    if (!part || /^https?:\/\//i.test(part)) continue;

    const containsNick = names.some(nick =>
      new RegExp(`\\b${escapeRegex(nick)}\\b`, 'i').test(part)
    );
    if (!containsNick) continue;

    output = output.replace(new RegExp(escapeRegex(part), 'gi'), antiPing(part));
  }

  return output;
}

function splitLegacyMessage(message, lineSize = 320) {
  const input = String(message || '');
  if (input.length <= lineSize) return [input.trim()];

  const pattern = new RegExp(`\\b.{1,${Math.max(1, lineSize - 1)}}\\b\\W?`, 'g');
  const matches = input.match(pattern);
  return matches && matches.length ? matches.map(part => part.trim()) : [input.trim()];
}

function randInt(min, max) {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

function pick(arr) {
  return arr[randInt(0, arr.length - 1)];
}

function shuffle(arr) {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = randInt(0, i);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function stripIrcFormatting(value) {
  return String(value || '')
    .replace(/\x03(?:\d{1,2}(?:,\d{1,2})?)?/g, '')
    .replace(/[\x02\x0f\x16\x1d\x1f]/g, '');
}

function parseTargetAndItem(ctx) {
  const raw = text(ctx);
  if (!raw) return {
    target: '',
    item: ''
  };

  const match = raw.match(/^([^\s]+)(?:\s+(?:with|using)\s+(.+))?$/i);
  if (match) return {
    target: match[1],
    item: stripArgumentConnector(match[2] || '')
  };

  const parts = raw.split(/\s+/);
  return {
    target: parts.shift() || '',
    item: parts.join(' ').trim()
  };
}

function stripArgumentConnector(value) {
  return String(value || '').replace(/^(?:with|using)\s+/i, '').trim();
}

function doesTargetConsent(target, selfNick) {
  const t = String(target || '').trim();
  if (!t) return false;
  if (/^(me|myself)$/i.test(t)) return true;
  if (selfNick && t.toLowerCase() === String(selfNick).toLowerCase()) return true;
  return !/^no(pe)?$/i.test(t);
}

function normalizeSelfTarget(target, nick) {
  if (/^(me|myself)$/i.test(String(target || ''))) return nick;
  return target;
}

const DEFAULT_ITEMS = [
  'a trout', 'a pillow', 'a rolled-up newspaper', 'a rubber chicken', 'a baguette',
  'a suspiciously heavy book', 'a squeaky hammer', 'a sock full of dice', 'a wet noodle',
  'a nearby lamp', 'a pool noodle', 'an eldritch spatula', 'a plush shark'
];

function randomItem() {
  return pick(DEFAULT_ITEMS);
}

function itemOrRandom(value) {
  const v = String(value || '').trim();
  if (!v) return randomItem();
  if (/^nothing$/i.test(v)) return '';
  return v;
}

function diceSidesFromItem(item, base = 4) {
  const len = stripIrcFormatting(item).replace(/\s+/g, '').length;
  return Math.max(base, Math.min(20, len || base));
}

function rollNotation(notation) {
  const match = String(notation || '').trim().match(/^(\d*)d(\d+)(.*)$/i);
  if (!match) return null;
  const count = Math.max(1, Math.min(100, parseInt(match[1] || '1', 10)));
  const sides = Math.max(1, Math.min(1000000, parseInt(match[2], 10)));
  const suffix = match[3] || '';
  const rolls = [];
  for (let i = 0; i < count; i += 1) rolls.push(randInt(1, sides));
  let kept = rolls.slice();
  const kh = suffix.match(/k(?:h)?(\d+)/i);
  const kl = suffix.match(/kl(\d+)/i);
  if (kh) kept = rolls.slice().sort((a, b) => b - a).slice(0, parseInt(kh[1], 10));
  if (kl) kept = rolls.slice().sort((a, b) => a - b).slice(0, parseInt(kl[1], 10));
  const gt = suffix.match(/>(\d+)/);
  const lt = suffix.match(/<(\d+)/);
  const total = gt ? kept.filter(v => v >= parseInt(gt[1], 10)).length :
    lt ? kept.filter(v => v <= parseInt(lt[1], 10)).length :
    kept.reduce((a, b) => a + b, 0);
  return {
    rolls,
    kept,
    total,
    text: count === 1 ? String(total) : `[${rolls.join(', ')}]`
  };
}

function rollDiceInString(expression, compact = false) {
  return String(expression || '').replace(/\b(\d*)d(\d+)(?:k(?:h)?\d+|kl\d+|[<>]\d+)?\b/gi, (m) => {
    const result = rollNotation(m);
    if (!result) return m;
    return compact ? String(result.total) : `${result.text}`;
  });
}

function safeCalc(expression) {
  const expr = String(expression || '').trim();
  if (!expr) throw new Error('No expression');
  if (!/^[\d+\-*/%().,\s^]+$/.test(expr)) throw new Error('Unsupported expression');
  const jsExpr = expr.replace(/,/g, '').replace(/\^/g, '**');
  const result = vm.runInNewContext(jsExpr, Object.freeze({}), {
    timeout: 100
  });
  if (typeof result !== 'number' || !Number.isFinite(result)) throw new Error('Invalid result');
  return Number.isInteger(result) ? String(result) : String(Math.round(result * 1000000) / 1000000);
}

function fetchText(url, timeoutMs = 8000, headers = {}) {
  return new Promise((resolve, reject) => {
    const lib = String(url).startsWith('https:') ? https : http;
    const req = lib.get(url, {
      headers: {
        'User-Agent': 'MichiBot/LanteaPort',
        ...headers
      }
    }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        resolve(fetchText(new URL(res.headers.location, url).toString(), timeoutMs, headers));
        return;
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => {
        body += chunk;
        if (body.length > 1024 * 1024) req.destroy(new Error('Response too large'));
      });
      res.on('end', () => resolve({
        statusCode: res.statusCode,
        headers: res.headers,
        body
      }));
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('Request timed out')));
    req.on('error', reject);
  });
}

async function fetchJson(url, timeoutMs = 8000, headers = {}) {
  const res = await fetchText(url, timeoutMs, headers);
  return {
    ...res,
    json: JSON.parse(res.body)
  };
}

async function resolveDns(host, rrtype = 'A') {
  return dns.resolve(host, rrtype);
}

module.exports = {
  IRC_COLOR,
  IRC_BOLD,
  IRC_RESET,
  act,
  addressedSay,
  antiPing,
  antiPingMessage,
  diceSidesFromItem,
  doesTargetConsent,
  fetchJson,
  fetchText,
  itemOrRandom,
  normalizeSelfTarget,
  parseTargetAndItem,
  stripArgumentConnector,
  pick,
  randInt,
  randomItem,
  resolveDns,
  rollDiceInString,
  rollNotation,
  safeCalc,
  say,
  shuffle,
  solvePrefixes,
  splitLegacyMessage,
  stripIrcFormatting,
  text
};
