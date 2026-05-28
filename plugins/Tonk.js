'use strict';

const crypto = require('crypto');
const {
  getDb
} = require('../libs/db');
const {
  pick,
  randInt,
  say,
  text
} = require('../utils/helper');

const TONK_RECORD_KEY = 'tonkrecord';
const LAST_TONK_KEY = 'lasttonk';
const TONK_ATTEMPTS_KEY = 'tonkattempt';
const MAX_TONK_FAILS = 2;
const APPLY_BONUS_POINTS = true;
const ADMIN = {
  globalRank: 'Admin'
};

const SNIPE_TYPES = {
  blue: {
    keyword: 'blue',
    display: ['Blue Shell', 's'],
    typeClass: 'Shell',
    pointTransferPercentage: 0.2,
    hitDC: 0,
    maxUses: 1,
    targetPosition: '#1'
  },
  red: {
    keyword: 'red',
    display: ['Red Shell', 's'],
    typeClass: 'Shell',
    pointTransferPercentage: 0.5,
    hitDC: 14,
    maxUses: 3,
    targetPosition: '+5'
  },
  green: {
    keyword: 'green',
    display: ['Green Shell', 's'],
    typeClass: 'Shell',
    pointTransferPercentage: 0.3,
    hitDC: 10,
    maxUses: 5,
    targetPosition: '+3'
  },
  brick: {
    keyword: 'brick',
    display: ['Brick', 's'],
    typeClass: 'Brick',
    pointTransferPercentage: 0.2,
    hitDC: 10,
    maxUses: 2,
    targetPosition: '-5'
  }
};

const EXCLAMATIONS = [
  'Heckgosh', 'Jeepers', 'By my throth', 'Goshhawk', 'Willikers', 'Dogast',
  'Dagnabbit', 'Consarn it', 'Fopdoodle', 'Gadsbudlikins', 'Potzblitz',
  'Zounderkite', 'Aw jeez', 'Dagnammit', 'Fudge', 'Jiminy Cricket',
  'Dad-Sizzle', 'Bejabbers', 'Crud', 'Fiddlesticks', 'Woooo', 'Yay',
  'Boo-yah', 'Huzzah', 'Hooray', 'Yippee', 'Kapow', 'Boom', 'Swell',
  'Awesome', 'Bingo', 'Eureka', 'Yeah', 'Wild', 'Woah', 'Zoinks', 'Golly',
  'Geez', 'Wow', 'Yow', 'Blast', 'Shoot', 'Yikes'
];

function db() {
  const d = getDb();
  d.exec(`
    CREATE TABLE IF NOT EXISTS JsonData (
      mykey VARCHAR(255) PRIMARY KEY NOT NULL,
      store TEXT DEFAULT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS JsonData_key_uindex ON JsonData (mykey);
  `);
  return d;
}

function kvGet(key, fallback = '') {
  const row = db().prepare('SELECT store FROM JsonData WHERE mykey = ?').get(key);
  return row && row.store != null ? String(row.store) : fallback;
}

function kvSet(key, value) {
  db().prepare('INSERT OR REPLACE INTO JsonData (mykey, store) VALUES (?, ?)')
    .run(key, String(value));
}

function kvDelete(key) {
  db().prepare('DELETE FROM JsonData WHERE mykey = ?').run(key);
}

function keyForScore(nick) {
  return `${TONK_RECORD_KEY}_${nick}`;
}

function keyForAttempts(nick) {
  return `${TONK_ATTEMPTS_KEY}_${nick}`;
}

function scoreRows() {
  return db().prepare(`
    SELECT substr(mykey, ?) AS nick, CAST(store AS REAL) AS score
    FROM JsonData
    WHERE mykey LIKE ?
    ORDER BY CAST(store AS REAL) DESC, lower(substr(mykey, ?)) ASC
  `).all(TONK_RECORD_KEY.length + 2, `${TONK_RECORD_KEY}_%`, TONK_RECORD_KEY.length + 2);
}

function getScore(nick) {
  const value = kvGet(keyForScore(nick), '');
  const score = Number(value);
  return Number.isFinite(score) ? score : 0;
}

function hasScoreRecord(nick) {
  const name = String(nick || '').trim();
  if (!name) return false;
  const row = db().prepare('SELECT 1 AS exists_row FROM JsonData WHERE lower(mykey) = lower(?) LIMIT 1')
    .get(keyForScore(name));
  return !!row;
}

function setScore(nick, score) {
  kvSet(keyForScore(nick), Number(score || 0));
}

function addScore(nick, amount) {
  const next = getScore(nick) + Number(amount || 0);
  setScore(nick, next);
  return next;
}

function getScoreboardPosition(nick) {
  const needle = String(nick || '').toLowerCase();
  const rows = scoreRows();
  for (let i = 0; i < rows.length; i += 1) {
    if (String(rows[i].nick).toLowerCase() === needle) return i + 1;
  }
  return -1;
}

function getByScoreboardPosition(position) {
  const row = scoreRows()[position - 1];
  return row ? row.nick : null;
}

function getMaxScoreboardPosition() {
  return scoreRows().length;
}

function getScoreRemainingToAdvance(nick) {
  const needle = String(nick || '').toLowerCase();
  let previous = null;
  for (const row of scoreRows()) {
    if (String(row.nick).toLowerCase() === needle) return previous;
    previous = {
      user: row.nick,
      score: row.score
    };
  }
  return null;
}

function clearTonkFails() {
  db().prepare('DELETE FROM JsonData WHERE mykey LIKE ?').run(`${TONK_ATTEMPTS_KEY}_%`);
}

function getTonkFails(nick) {
  const attempts = Number(kvGet(keyForAttempts(nick), '0'));
  return Number.isFinite(attempts) ? attempts : 0;
}

function setTonkFails(nick, attempts) {
  kvSet(keyForAttempts(nick), Math.max(0, Number(attempts || 0)));
}

function displayTonkPoints(points) {
  const value = Number(points || 0) / 1000;
  return Number(value.toFixed(8)).toString();
}

function getHours(ms) {
  return Math.floor(Number(ms || 0) / 3600000);
}

function getHoursDouble(ms, decimals) {
  const factor = 10 ** decimals;
  return Math.round((Number(ms || 0) / 3600000) * factor) / factor;
}

function formatDuration(ms) {
  ms = Math.max(0, Math.floor(Number(ms || 0)));
  const days = Math.floor(ms / 86400000);
  ms %= 86400000;
  const hours = Math.floor(ms / 3600000);
  ms %= 3600000;
  const minutes = Math.floor(ms / 60000);
  ms %= 60000;
  const seconds = Math.floor(ms / 1000);
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (seconds || !parts.length) parts.push(`${seconds}s`);
  return parts.join(' ');
}

function parseDurationToMs(input) {
  let total = 0;
  const re = /(\d+)\s*([dhms])/gi;
  let match;
  while ((match = re.exec(String(input || ''))) !== null) {
    const n = Number(match[1]);
    const unit = match[2].toLowerCase();
    total += n * ({
      d: 86400000,
      h: 3600000,
      m: 60000,
      s: 1000
    } [unit] || 0);
  }
  return total;
}

function antiPing(nick) {
  return String(nick || '').replace(/^(.)(.+)$/u, '$1\u200b$2');
}

function getVerificationCode() {
  // Java used DateTime.now().toString("yyyy-MM-dd hh") and md5, then first 5 hex chars.
  // This keeps the same spirit; current local hour is enough for the gate.
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(((now.getHours() + 11) % 12) + 1).padStart(2, '0');
  return crypto.createHash('md5').update(`${yyyy}-${mm}-${dd} ${hh}`).digest('hex').toUpperCase().slice(0, 5);
}

function shellDisplay(type, plural = false) {
  return `${type.display[0]}${plural ? type.display[1] : ''}`;
}

function shellKey(nick) {
  return `tonk_snipe_shells_${nick}`;
}

function readShellMap(nick) {
  try {
    return JSON.parse(kvGet(shellKey(nick), '{}')) || {};
  } catch (_) {
    return {};
  }
}

function writeShellMap(nick, map) {
  kvSet(shellKey(nick), JSON.stringify(map || {}));
}

function shellCount(nick, type) {
  const spent = Number(readShellMap(nick)[type.keyword] || 0);
  return Math.max(0, type.maxUses - spent);
}

function spendShell(nick, type, uses = 1) {
  const map = readShellMap(nick);
  map[type.keyword] = Number(map[type.keyword] || 0) + uses;
  writeShellMap(nick, map);
}

function cooldownRemaining(key, hours = 24) {
  const last = Number(kvGet(key, '0'));
  if (!Number.isFinite(last) || last <= 0) return 0;
  return Math.max(0, (last + hours * 3600000) - Date.now());
}

function validateTargetPosition(sniper, target, type) {
  if (!type.targetPosition) return null;
  const targetPos = getScoreboardPosition(target);
  const sniperPos = getScoreboardPosition(sniper);

  if (sniperPos < 1) return 'You are not on the tonk scoreboard yet.';
  if (targetPos < 1) return `${target} is not on the tonk scoreboard.`;
  const staticMatch = type.targetPosition.match(/^#(\d+)$/);
  if (staticMatch) {
    const required = Number(staticMatch[1]);
    return targetPos === required ? null : `${shellDisplay(type, true)} can only target position #${required}`;
  }
  const ahead = type.targetPosition.match(/^\+(\d+)$/);
  if (ahead) {
    const limit = Number(ahead[1]);
    const diff = sniperPos - targetPos;
    return diff <= limit ? null : `${shellDisplay(type, true)} can only target within ${limit} positions ahead of you.`;
  }
  const behind = type.targetPosition.match(/^-(\d+)$/);
  if (behind) {
    const limit = Number(behind[1]);
    const diff = targetPos - sniperPos;
    return diff <= limit ? null : `${shellDisplay(type, true)} can only target within ${limit} positions behind you.`;
  }
  return null;
}

function setSnipe(sniper, target) {
  const now = Date.now();
  kvSet(`tonk_snipe_last_hit_${target}`, now);
  kvSet(`tonk_snipe_last_snipe_${sniper}`, now);
}

function doSnipe(sniper, target, type) {
  if (!hasScoreRecord(sniper)) {
    return 'You are not on the tonk scoreboard yet. You need to successfully score tonk points before you can shell anyone.';
  }

  if (target && !hasScoreRecord(target)) {
    return `${target} is not on the tonk scoreboard.`;
  }

  if (shellCount(sniper, type) <= 0) return `You are out of ${shellDisplay(type, true)}`;

  const snipeWait = cooldownRemaining(`tonk_snipe_last_snipe_${sniper}`, 24);
  if (snipeWait > 0) return `You can't snipe right now. Try again in ${formatDuration(snipeWait)}.`;

  const targetWait = cooldownRemaining(`tonk_snipe_last_hit_${target}`, 24);
  if (targetWait > 0) return `You can't target this user right now. Try again in ${formatDuration(targetWait)}.`;

  const invalid = validateTargetPosition(sniper, target, type);
  if (invalid) return invalid;

  spendShell(sniper, type, 1);
  const roll = randInt(1, 20);
  const success = roll >= type.hitDC;
  setSnipe(sniper, target);

  if (!success) return `Unfortunately you missed with a ${roll} vs ${type.hitDC}.`;

  const sniperPoints = getScore(sniper);
  const targetPoints = getScore(target);
  let diff = targetPoints - sniperPoints;
  if (diff <= 0) return `You hit ${target} but nothing happened... (Point difference was not greater than zero)`;

  const prePos = getScoreboardPosition(sniper);
  diff *= type.pointTransferPercentage;
  const sniperNew = sniperPoints + diff;
  const targetNew = targetPoints - diff;
  setScore(sniper, sniperNew);
  setScore(target, targetNew);

  const postPos = getScoreboardPosition(sniper);
  const pos = prePos === postPos ? ` Position #${postPos}` : ` Position #${prePos} => #${postPos}`;
  const overtaken = getByScoreboardPosition(postPos + 1);
  const overtook = prePos !== postPos && overtaken ? ` (Overtook ${overtaken})` : '';
  const sr = getScoreRemainingToAdvance(sniper);
  const advance = sr && sr.user ?
    ` Need ${displayTonkPoints(sr.score - sniperNew)} more points to pass ${antiPing(sr.user)}!` : '';

  return `You hit ${target}! They lost ${displayTonkPoints(diff)} tonk points which you gain! Congratulations!${pos}${overtook}${advance}`;
}

function getCurrentRecordHolder() {
  const recordRaw = kvGet(TONK_RECORD_KEY, '');
  const parts = String(recordRaw || '').split(';');
  return String(parts[1] || '').trim();
}

function hasPassedVerification(nick) {
  const needle = String(nick || '').toLowerCase();
  if (!needle) return false;

  // People with score rows have already played.
  if (getScoreboardPosition(nick) !== -1) return true;

  // The first verified tonk creates tonkrecord=0;<nick> but, like the Java
  // plugin, does not award a personal score row yet. Treat the current record
  // holder as verified so they do not get nagged every time until someone
  // earns real points.
  const holder = getCurrentRecordHolder();
  return holder && holder.toLowerCase() === needle;
}

function getBaseDomain(ctx) {
  return String(
    ctx?.config?.http?.baseDomain ||
    ctx?.config?.httpdBaseDomain ||
    ''
  ).trim().replace(/\/$/, '');
}

function sendVerificationHint(ctx) {
  if (typeof ctx.skipCooldown === 'function') {
    ctx.skipCooldown();
  }

  const baseDomain = getBaseDomain(ctx);
  const url = baseDomain ? `${baseDomain}/tonk` : 'https://michibot.pc-logix.com/tonk';
  const message = `You should probably read this: ${url}`;

  // Keep the anti-spam verification nudge out of channel when possible.
  // MichiBot contexts expose notice(); older/local test harnesses may not.
  if (typeof ctx.notice === 'function') {
    ctx.notice(ctx.nick, message);
  } else {
    say(ctx, message);
  }
}

function maybeRequireVerification(ctx, params) {
  if (hasPassedVerification(ctx.nick)) return false;
  if (String(params || '').trim().toUpperCase() === getVerificationCode()) return false;
  return true;
}

function handleTonk(ctx) {
  const verify = maybeRequireVerification(ctx, text(ctx));
  if (verify) return sendVerificationHint(ctx);

  const attempts = getTonkFails(ctx.nick);
  if (attempts >= MAX_TONK_FAILS) return say(ctx, 'A sad trumpet plays for an uncomfortably long time...');

  const tonkin = kvGet(LAST_TONK_KEY, '');
  const recordRaw = kvGet(TONK_RECORD_KEY, '');
  const now = Date.now();

  if (!tonkin || !recordRaw) {
    kvSet(TONK_RECORD_KEY, `0;${ctx.nick}`);
    kvSet(LAST_TONK_KEY, now);
    return say(ctx, `You got the first Tonk ${ctx.nick}, but this is only the beginning.`);
  }

  const last = Number(tonkin);
  const diff = now - last;
  const [recordMsRaw, recorderRaw] = recordRaw.split(';');
  const recordMs = Number(recordMsRaw || 0);
  const recorder = String(recorderRaw || '').trim() || ctx.nick;
  const nickIsRecorder = ctx.nick === recorder;

  if (recordMs < diff) {
    const recordHours = getHours(recordMs) + 1;
    const hours = getHoursDouble(diff - recordMs, 2);
    let position = '';
    let overtook = '';
    let advance = '';

    if (!nickIsRecorder) {
      const scoreGain = hours * recordHours;
      const prePos = getScoreboardPosition(ctx.nick);
      const newScore = addScore(ctx.nick, scoreGain);
      const postPos = getScoreboardPosition(ctx.nick);
      position =
        `${prePos === postPos || prePos === -1 ? ` Position #${postPos}` : ` Position #${prePos} => #${postPos}`}.`;
      if (prePos !== postPos) {
        const overtaken = getByScoreboardPosition(postPos + 1);
        if (overtaken) overtook = ` (Overtook ${overtaken})`;
      }
      const sr = getScoreRemainingToAdvance(ctx.nick);
      if (sr && sr.user) advance =
        ` Need ${displayTonkPoints(sr.score - newScore)} more points to pass ${antiPing(sr.user)}!`;
    }

    say(ctx,
      `${pick(EXCLAMATIONS)}! ${antiPing(ctx.nick)}! You beat ${nickIsRecorder ? 'your own' : `${antiPing(recorder)}'s`} previous record of ${formatDuration(recordMs)} (By ${formatDuration(diff - recordMs)})! I hope you're happy!`
      );
    say(ctx,
      `${ctx.nick}'s new record is ${formatDuration(diff)}! ${hours / 1000 > 0 ? (!nickIsRecorder ? ` ${ctx.nick} also gained ${displayTonkPoints(hours * recordHours)}${recordHours > 1 ? ` (${displayTonkPoints(hours)} x ${recordHours})` : ''} tonk points for stealing the tonk.` : ` No points gained for stealing from yourself. (Lost out on ${displayTonkPoints(hours)}${recordHours > 1 ? ` x ${recordHours} = ${displayTonkPoints(hours * recordHours)}` : ''})`) : ''}${position}${overtook}${advance}`
      );
    kvSet(TONK_RECORD_KEY, `${diff};${ctx.nick}`);
    kvSet(LAST_TONK_KEY, now);
    clearTonkFails();
  } else {
    say(ctx,
      `I'm sorry ${ctx.nick}, you were not able to beat ${recorder}'s record of ${formatDuration(recordMs)} this time. ${formatDuration(diff)} were wasted! Missed by ${formatDuration(recordMs - diff)}!`
      );
    kvSet(LAST_TONK_KEY, now);
    setTonkFails(ctx.nick, attempts + 1);
  }
}

function handleTonkOut(ctx) {
  const verify = maybeRequireVerification(ctx, text(ctx));
  if (verify) return sendVerificationHint(ctx);

  const attempts = getTonkFails(ctx.nick);
  if (attempts >= MAX_TONK_FAILS) return say(ctx, 'A sad flute plays for an uncomfortably long time...');

  const tonkin = kvGet(LAST_TONK_KEY, '');
  const recordRaw = kvGet(TONK_RECORD_KEY, '');
  const now = Date.now();
  if (!tonkin || !recordRaw) {
    kvSet(TONK_RECORD_KEY, `0;${ctx.nick}`);
    kvSet(LAST_TONK_KEY, now);
    return say(ctx, `You got the first Tonk ${ctx.nick}, but this is only the beginning.`);
  }

  const last = Number(tonkin);
  const diff = now - last;
  const [recordMsRaw, recorderRaw] = recordRaw.split(';');
  const recordMs = Number(recordMsRaw || 0);
  const recorder = String(recorderRaw || '').trim() || ctx.nick;
  const nickIsRecorder = ctx.nick === recorder;

  if (recordMs <= 0) {
    kvSet(LAST_TONK_KEY, now);
    return say(ctx, 'You gotta tonk before you can tonk out. For this transgression the timer has been reset.');
  }

  if (recordMs < diff) {
    const hours = getHours(diff);
    let gain = hours;
    const applyPoints = APPLY_BONUS_POINTS && hours > 1;
    if (applyPoints) gain += nickIsRecorder ? 2 * (hours - 1) : 2 * (hours - 1) * 0.75;

    const prePos = getScoreboardPosition(ctx.nick);
    const newScore = addScore(ctx.nick, gain);
    const postPos = getScoreboardPosition(ctx.nick);
    const position = prePos === postPos || prePos === -1 ? `Position #${postPos}` :
    `Position #${prePos} => #${postPos}`;
    const overtaken = getByScoreboardPosition(postPos + 1);
    const overtook = prePos !== postPos && overtaken ? ` (Overtook ${overtaken})` : '';
    const sr = getScoreRemainingToAdvance(ctx.nick);
    const advance = sr && sr.user ?
      ` Need ${displayTonkPoints(sr.score - newScore)} more points to pass ${antiPing(sr.user)}!` : '';

    say(ctx,
      `${pick(EXCLAMATIONS)}! ${antiPing(ctx.nick)}! You beat ${nickIsRecorder ? 'your own' : `${antiPing(recorder)}'s`} previous record of ${formatDuration(recordMs)} (By ${formatDuration(diff - recordMs)})! I hope you're happy!`
      );
    if (nickIsRecorder) {
      say(ctx,
        `${antiPing(ctx.nick)} has tonked out! Tonk has been reset! They gained ${displayTonkPoints(hours)} tonk points!${applyPoints ? ` plus ${displayTonkPoints(2 * (hours - 1))} bonus points for consecutive hours!` : ''} Current score: ${displayTonkPoints(newScore)}, ${position}${overtook}${advance}`
        );
    } else {
      say(ctx,
        `${antiPing(ctx.nick)} has stolen the tonkout! Tonk has been reset! They gained ${displayTonkPoints(hours)} tonk points!${applyPoints ? ` plus ${displayTonkPoints(2 * (hours - 1) * 0.5)} bonus points for consecutive hours! (Reduced to 50% because stealing)` : ''} Current score: ${displayTonkPoints(newScore)}. ${position}${overtook}${advance}`
        );
    }
    kvSet(TONK_RECORD_KEY, `0;${ctx.nick}`);
    kvSet(LAST_TONK_KEY, now);
    clearTonkFails();
  } else {
    say(ctx,
      `I'm sorry ${antiPing(ctx.nick)}, you were not able to beat ${antiPing(recorder)}'s record of ${formatDuration(recordMs)} this time. ${formatDuration(diff)} were wasted! Missed by ${formatDuration(recordMs - diff)}!`
      );
    kvSet(LAST_TONK_KEY, now);
    setTonkFails(ctx.nick, attempts + 1);
  }
}

function handleLeaders(ctx) {
  const rows = scoreRows().slice(0, 10);
  if (!rows.length) return say(ctx, 'No tonk leaders yet. Be the chaos you want to see in the world.');
  say(ctx, rows.map((r, i) => `#${i + 1}: ${r.nick} (${displayTonkPoints(r.score)})`).join(' | '));
}

function handleSnipe(ctx) {
  let sub = ctx.command;
  let args = ctx.args.slice();

  const aliasMap = {
    blueshell: 'blue',
    redshell: 'red',
    greenshell: 'green',
    shellcount: 'count',
    tonkshells: 'count',
    ammocount: 'count'
  };
  if (ctx.command === 'tonksnipe') {
    sub = (args.shift() || '').toLowerCase();
  } else if (aliasMap[ctx.command]) {
    sub = aliasMap[ctx.command];
  }

  if (!sub || sub === 'help') {
    return say(ctx, `Usage: ${ctx.prefix}tonksnipe <blue|red|green|count> [target]`);
  }

  if (sub === 'count') {
    const parts = Object.values(SNIPE_TYPES).map(type => {
      const count = shellCount(ctx.nick, type);
      return `${count} ${shellDisplay(type, count !== 1)}`;
    });
    return say(ctx, `You have ${parts.join(', ')}`);
  }

  const type = SNIPE_TYPES[sub];
  if (!type) return say(ctx, `Unknown tonk snipe type: ${sub}`);

  let target = args[0];
  if (type.keyword === 'blue') {
    if (getMaxScoreboardPosition() <= 1) return say(ctx, 'There are not enough people on the scoreboard.');
    target = getByScoreboardPosition(1);
    if (!target) return say(ctx, 'There seems to be no one in first position...');
    if (String(target).toLowerCase() === String(ctx.nick).toLowerCase()) return say(ctx,
      "You probably don't want to target yourself.");
  } else if (!target) {
    return say(ctx, 'Provide a target that is within range of you.');
  }

  return say(ctx, doSnipe(ctx.nick, target, type));
}

function clearEverything() {
  db().prepare(`
    DELETE FROM JsonData
    WHERE mykey LIKE ?
       OR mykey = ?
       OR mykey = ?
       OR mykey LIKE ?
       OR mykey LIKE 'tonk_snipe_shells_%'
       OR mykey LIKE 'tonk_snipe_last_hit_%'
       OR mykey LIKE 'tonk_snipe_last_snipe_%'
  `).run(`${TONK_RECORD_KEY}_%`, TONK_RECORD_KEY, LAST_TONK_KEY, `${TONK_ATTEMPTS_KEY}_%`);
}

function handleAdmin(ctx) {
  const raw = text(ctx);
  switch (ctx.command) {
    case 'resettonk':
    case 'tonkreset':
      kvSet(TONK_RECORD_KEY, `0;${ctx.nick}`);
      kvSet(LAST_TONK_KEY, Date.now());
      clearTonkFails();
      return say(ctx, `Tonk reset ${ctx.nick}, you are the record holder!`);
    case 'tonkback': {
      const ms = parseDurationToMs(raw);
      const last = Number(kvGet(LAST_TONK_KEY, Date.now()));
      kvSet(LAST_TONK_KEY, last - ms);
      return say(ctx, `Tonk moved back ${raw || '0s'}.`);
    }
    case 'tonkforward': {
      const ms = parseDurationToMs(raw);
      const last = Number(kvGet(LAST_TONK_KEY, Date.now()));
      kvSet(LAST_TONK_KEY, last + ms);
      return say(ctx, `Tonk moved forward ${raw || '0s'}.`);
    }
    case 'tonkmerge': {
      const [to, from] = ctx.args;
      if (!to || !from) return say(ctx, `Usage: ${ctx.prefix}tonkmerge <first_name> <second_name>`);
      const fromScore = getScore(from);
      const toScore = getScore(to);
      setScore(to, toScore + fromScore);
      kvDelete(keyForScore(from));
      return say(ctx,
        `Merge successful! ${from}: ${displayTonkPoints(fromScore)} + ${to}: ${displayTonkPoints(toScore)} => ${to}: ${displayTonkPoints(toScore + fromScore)}`
        );
    }
    case 'tonkdestroy': {
      if (!ctx.args.length) return say(ctx, `Usage: ${ctx.prefix}tonkdestroy <nick...>`);
      for (const nick of ctx.args) kvDelete(keyForScore(nick));
      return say(ctx, `Cleared ${ctx.args.join(',')}`);
    }
    case 'tonkreseteverything': {
      const top = scoreRows().slice(0, 3).map((r, i) => `#${i + 1}: ${r.nick}`).join(', ');
      if (top) say(ctx, `Top scores: ${top}`);
      clearEverything();
      return say(ctx, 'Resetting the tonk scoreboard forever!');
    }
  }
}

module.exports = {
  name: 'Tonk',
  commands: [
    {
      name: 'tonk',
      cooldown: {
        key: 'tonk_shared',
        minutes: 15,
        ignorePermissions: true
      }
    },
    {
      name: 'tonkout',
      cooldown: {
        key: 'tonk_shared',
        minutes: 15,
        ignorePermissions: true
      },
      aliases: ['tonktonk']
    },
    {
      name: 'tonkpoints',
      aliases: ['tonkscore']
    },
    'tonkattempts',
    {
      name: 'tonkleaders',
      aliases: ['tonkleader', 'tonkboard']
    },
    'tonkcode',
    {
      name: 'tonksnipe',
      aliases: [
        {
          name: 'blueshell',
          defaultArgs: ['blue']
        },
        {
          name: 'redshell',
          defaultArgs: ['red']
        },
        {
          name: 'greenshell',
          defaultArgs: ['green']
        },
        {
          name: 'shellcount',
          defaultArgs: ['count']
        },
        {
          name: 'tonkshells',
          defaultArgs: ['count']
        },
        {
          name: 'ammocount',
          defaultArgs: ['count']
        }
      ]
    },
    {
      name: 'resettonk',
      access: ADMIN,
      aliases: ['tonkreset']
    }, {
      name: 'tonkback',
      access: ADMIN
    }, {
      name: 'tonkforward',
      access: ADMIN
    }, {
      name: 'tonkmerge',
      access: ADMIN
    }, {
      name: 'tonkdestroy',
      access: ADMIN
    }, {
      name: 'tonkreseteverything',
      access: ADMIN
    }
  ],
  init() {
    db();
    console.log('[Tonk] initialized using legacy JsonData table');
  },
  async handleCommand(ctx) {
    switch (ctx.command) {
      case 'tonk':
        return handleTonk(ctx);
      case 'tonkout':
      case 'tonktonk':
        return handleTonkOut(ctx);
      case 'tonkpoints':
      case 'tonkscore': {
        const score = getScore(ctx.nick);
        if (!score) return say(ctx, "I can't find a record, so you have 0 points.");
        const sr = getScoreRemainingToAdvance(ctx.nick);
        const advance = sr && sr.user ?
          ` Need ${displayTonkPoints(sr.score - score)} more points to pass ${antiPing(sr.user)}!` : '';
        return say(ctx,
          `You currently have ${displayTonkPoints(score)} points! Position #${getScoreboardPosition(ctx.nick)}${advance}`
          );
      }
      case 'tonkattempts': {
        const attempts = MAX_TONK_FAILS - getTonkFails(ctx.nick);
        return say(ctx, attempts <= 0 ?
          `You have no attempts left. When a successful tonk or tonkout happens everyone gets ${MAX_TONK_FAILS} new attempts.` :
          `You have ${attempts} attempt${attempts === 1 ? '' : 's'} left.`);
      }
      case 'tonkleaders':
      case 'tonkleader':
      case 'tonkboard':
        return handleLeaders(ctx);
      case 'tonkcode':
        return say(ctx, getVerificationCode());
      case 'tonksnipe':
      case 'blueshell':
      case 'redshell':
      case 'greenshell':
      case 'shellcount':
      case 'tonkshells':
      case 'ammocount':
        return handleSnipe(ctx);
      case 'resettonk':
      case 'tonkreset':
      case 'tonkback':
      case 'tonkforward':
      case 'tonkmerge':
      case 'tonkdestroy':
      case 'tonkreseteverything':
        return handleAdmin(ctx);
      default:
        return null;
    }
  }
};
