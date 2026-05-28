'use strict';

const channels = new Map(); // lowerChan -> { name, users: Map(lowerNick -> {nick, modes:Set}) }

function norm(value) {
  return String(value || '').trim().toLowerCase();
}

function ensureChannel(channelName) {
  const key = norm(channelName);
  if (!key) return null;

  if (!channels.has(key)) {
    channels.set(key, {
      name: String(channelName || '').trim(),
      users: new Map()
    });
  }

  return channels.get(key);
}

function ensureUser(channelName, nick) {
  const channel = ensureChannel(channelName);
  if (!channel) return null;

  const nickKey = norm(nick);
  if (!nickKey) return null;

  if (!channel.users.has(nickKey)) {
    channel.users.set(nickKey, {
      nick: String(nick || '').trim(),
      modes: new Set()
    });
  }

  return channel.users.get(nickKey);
}

function setUserModes(channelName, nick, modes) {
  const user = ensureUser(channelName, nick);
  if (!user) return;

  user.nick = String(nick || '').trim();
  user.modes = new Set(Array.isArray(modes) ? modes : []);
}

function addUserMode(channelName, nick, mode) {
  const user = ensureUser(channelName, nick);
  if (!user || !mode) return;
  user.modes.add(String(mode));
}

function removeUserMode(channelName, nick, mode) {
  const channel = ensureChannel(channelName);
  if (!channel || !mode) return;

  const user = channel.users.get(norm(nick));
  if (!user) return;
  user.modes.delete(String(mode));
}

function removeUser(channelName, nick) {
  const channel = ensureChannel(channelName);
  if (!channel) return;
  channel.users.delete(norm(nick));
}

function removeUserFromAll(nick) {
  const nickKey = norm(nick);
  for (const channel of channels.values()) {
    channel.users.delete(nickKey);
  }
}

function renameUser(oldNick, newNick) {
  const oldKey = norm(oldNick);
  const newKey = norm(newNick);
  if (!oldKey || !newKey) return;

  for (const channel of channels.values()) {
    const existing = channel.users.get(oldKey);
    if (!existing) continue;

    channel.users.delete(oldKey);
    existing.nick = String(newNick || '').trim();
    channel.users.set(newKey, existing);
  }
}

function clearChannel(channelName) {
  channels.delete(norm(channelName));
}

function parseNickWithPrefixes(entry) {
  const raw = String(entry || '').trim();
  if (!raw) return null;

  const modes = new Set();
  let nick = raw;

  while (nick.length > 0) {
    const first = nick[0];
    if (first === '~') {
      modes.add('q');
    } else if (first === '&') {
      modes.add('a');
    } else if (first === '@') {
      modes.add('o');
    } else if (first === '%') {
      modes.add('h');
    } else if (first === '+') {
      modes.add('v');
    } else {
      break;
    }
    nick = nick.slice(1);
  }

  nick = nick.trim();
  if (!nick) return null;

  return {
    nick,
    modes: Array.from(modes)
  };
}

function applyNames(channelName, namesList) {
  const channel = ensureChannel(channelName);
  if (!channel) return;

  for (const entry of String(namesList || '').split(/\s+/)) {
    const parsed = parseNickWithPrefixes(entry);
    if (!parsed) continue;
    setUserModes(channelName, parsed.nick, parsed.modes);
  }
}

function getUserModes(channelName, nick) {
  const channel = ensureChannel(channelName);
  if (!channel) return new Set();

  const user = channel.users.get(norm(nick));
  if (!user) return new Set();

  return new Set(user.modes);
}

function getModeFlags(channelName, nick) {
  const modes = getUserModes(channelName, nick);
  const has = (...letters) => letters.some(letter => modes.has(letter));

  return {
    owner: has('q'),
    admin: has('q', 'a'),
    op: has('q', 'a', 'o'),
    halfop: has('q', 'a', 'o', 'h'),
    voice: has('q', 'a', 'o', 'h', 'v'),
    rawModes: Array.from(modes).sort()
  };
}

function getUsers(channelName) {
  const channel = ensureChannel(channelName);
  if (!channel) return [];
  return Array.from(channel.users.values()).map(user => user.nick).sort((a, b) => a.localeCompare(b));
}

module.exports = {
  addUserMode,
  applyNames,
  clearChannel,
  ensureUser,
  getModeFlags,
  getUserModes,
  getUsers,
  parseNickWithPrefixes,
  removeUser,
  removeUserFromAll,
  removeUserMode,
  renameUser,
  setUserModes
};
