'use strict';

const DEFAULT_FAIL_MESSAGE = 'I cannot execute this command right now.';

const cooldownState = new Map();

function normalizeCooldownKey(value) {
  return String(value || '').trim().toLowerCase();
}

function splitMs(ms) {
  let remaining = Math.max(0, Math.ceil(Number(ms || 0) / 1000));
  const days = Math.floor(remaining / 86400);
  remaining -= days * 86400;
  const hours = Math.floor(remaining / 3600);
  remaining -= hours * 3600;
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining - (minutes * 60);

  const parts = [];
  if (days) parts.push(`${days} day${days === 1 ? '' : 's'}`);
  if (hours) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`);
  if (minutes) parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`);
  if (seconds || !parts.length) parts.push(`${seconds} second${seconds === 1 ? '' : 's'}`);

  return parts.join(', ');
}

function secondsFromSpec(spec) {
  if (!spec || typeof spec !== 'object') return 0;

  if (Number.isFinite(Number(spec.seconds))) return Math.max(0, Number(spec.seconds));
  if (Number.isFinite(Number(spec.limitSeconds))) return Math.max(0, Number(spec.limitSeconds));
  if (Number.isFinite(Number(spec.ms))) return Math.max(0, Number(spec.ms) / 1000);

  const hours = Number(spec.hours || spec.limitHours || 0);
  const minutes = Number(spec.minutes || spec.limitMinutes || 0);
  const seconds = Number(spec.limit || 0);

  return Math.max(0, (Number.isFinite(hours) ? hours * 3600 : 0) +
    (Number.isFinite(minutes) ? minutes * 60 : 0) +
    (Number.isFinite(seconds) ? seconds : 0));
}

function normalizeCooldownSpec(spec, fallbackKey) {
  if (!spec) return null;

  if (typeof spec === 'number') {
    return normalizeCooldownSpec({ seconds: spec }, fallbackKey);
  }

  const seconds = secondsFromSpec(spec);
  if (!seconds) return null;

  return {
    key: normalizeCooldownKey(spec.key || spec.group || fallbackKey),
    seconds,
    perUser: !!(spec.perUser || spec.perUserLimit || spec.user),
    ignorePermissions: !!(spec.ignorePermissions || spec.noBypass || spec.adminsIncluded),
    failMessage: String(spec.failMessage || spec.message || spec.customFailMessage || DEFAULT_FAIL_MESSAGE)
  };
}

function getStateBucket(key) {
  const normalized = normalizeCooldownKey(key);
  if (!cooldownState.has(normalized)) {
    cooldownState.set(normalized, {
      global: 0,
      users: new Map()
    });
  }
  return cooldownState.get(normalized);
}

function getCooldownRemainingMs(cooldown, user) {
  if (!cooldown) return 0;

  const bucket = getStateBucket(cooldown.key);
  const lastExecution = cooldown.perUser ?
    Number(bucket.users.get(String(user || '').toLowerCase()) || 0) :
    Number(bucket.global || 0);

  if (!lastExecution) return 0;

  return Math.max(0, (cooldown.seconds * 1000) - (Date.now() - lastExecution));
}

function updateCooldown(cooldown, user) {
  if (!cooldown) return;

  const bucket = getStateBucket(cooldown.key);
  const now = Date.now();

  if (cooldown.perUser) {
    bucket.users.set(String(user || '').toLowerCase(), now);
  } else {
    bucket.global = now;
  }
}

function resetCooldown(cooldownOrKey, user = '') {
  const key = typeof cooldownOrKey === 'string' ? cooldownOrKey : cooldownOrKey?.key;
  const normalized = normalizeCooldownKey(key);
  if (!normalized || !cooldownState.has(normalized)) return false;

  const bucket = cooldownState.get(normalized);
  if (user) {
    bucket.users.delete(String(user || '').toLowerCase());
  } else {
    bucket.global = 0;
    bucket.users.clear();
  }
  return true;
}

function formatCooldownFailMessage(cooldown, remainingMs) {
  const wait = splitMs(remainingMs);
  const base = cooldown?.failMessage || DEFAULT_FAIL_MESSAGE;
  return `${base} Wait ${wait}.`;
}

module.exports = {
  normalizeCooldownSpec,
  getCooldownRemainingMs,
  updateCooldown,
  resetCooldown,
  formatCooldownFailMessage,
  splitMs
};
