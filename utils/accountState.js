'use strict';

const state = new Map(); // lowerNick -> { nick, account, identified, lastChecked }

function norm(value) {
  return String(value || '').trim().toLowerCase();
}

function setAccount(nick, account) {
  const key = norm(nick);
  if (!key) return;

  const acct = String(account || '').trim();

  state.set(key, {
    nick: String(nick || '').trim(),
    account: acct || null,
    identified: !!acct && acct !== '*',
    lastChecked: Date.now()
  });
}

function clearAccount(nick) {
  const key = norm(nick);
  if (!key) return;

  state.set(key, {
    nick: String(nick || '').trim(),
    account: null,
    identified: false,
    lastChecked: Date.now()
  });
}

function get(nick) {
  return state.get(norm(nick)) || {
    nick: String(nick || '').trim(),
    account: null,
    identified: false,
    lastChecked: 0
  };
}

function remove(nick) {
  state.delete(norm(nick));
}

function rename(oldNick, newNick) {
  const oldKey = norm(oldNick);
  const newKey = norm(newNick);
  if (!oldKey || !newKey) return;

  const existing = state.get(oldKey);
  state.delete(oldKey);

  if (existing) {
    state.set(newKey, {
      ...existing,
      nick: String(newNick || '').trim(),
      lastChecked: Date.now()
    });
  } else {
    clearAccount(newNick);
  }
}

function hasAllowedAccount(nick, allowedAccounts) {
  const s = get(nick);
  if (!s.identified || !s.account) return false;

  const acct = norm(s.account);
  return (allowedAccounts || []).some(a => norm(a) === acct);
}

module.exports = {
  setAccount,
  clearAccount,
  get,
  remove,
  rename,
  hasAllowedAccount
};