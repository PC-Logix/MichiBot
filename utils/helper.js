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
    item: (match[2] || '').trim()
  };

  const parts = raw.split(/\s+/);
  return {
    target: parts.shift() || '',
    item: parts.join(' ').trim()
  };
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
  diceSidesFromItem,
  doesTargetConsent,
  fetchJson,
  fetchText,
  itemOrRandom,
  normalizeSelfTarget,
  parseTargetAndItem,
  pick,
  randInt,
  randomItem,
  resolveDns,
  rollDiceInString,
  rollNotation,
  safeCalc,
  say,
  shuffle,
  stripIrcFormatting,
  text
};
