'use strict';

const permissions = require('../services/permissions');
const { addressedSay, say, text } = require('../utils/helper');

const ADMIN = { globalRank: 'Admin' };

async function resolveSubject(ctx, value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const normalized = permissions.normalizeStoredSubject(raw);
  if (/^(?:acct|discord):/i.test(raw)) return normalized;
  if (/^\d+$/.test(raw)) return permissions.makeDiscordSubject(raw);

  if (raw.toLowerCase() === String(ctx.nick || '').toLowerCase() &&
    typeof permissions.getPermissionSubjectsForContext === 'function') {
    const subjects = await permissions.getPermissionSubjectsForContext(ctx);
    if (subjects.length) return subjects[0];
  }

  if (!ctx.isBridge && typeof ctx.bot?.refreshAccount === 'function') {
    const account = await ctx.bot.refreshAccount(raw);
    if (account) return permissions.makeAccountSubject(account);
  }
  return permissions.makeAccountSubject(raw);
}

async function currentSubjects(ctx) {
  if (!ctx.isBridge && !ctx.account && typeof ctx.bot?.refreshAccount === 'function') {
    ctx.account = await ctx.bot.refreshAccount(ctx.nick);
  }
  return permissions.getPermissionSubjectsForContext(ctx);
}

function highestRankForSubjects(subjects) {
  const ranks = [];
  for (const subject of subjects) ranks.push(...permissions.getRanksForSubject(subject));
  return ranks.sort((a, b) => permissions.rankLevel(b.name) - permissions.rankLevel(a.name))[0] || null;
}

function assignmentsText(rankFilter = '') {
  const rows = permissions.listRankAssignments()
    .filter(rank => !rankFilter || rank.name.toLowerCase() === rankFilter.toLowerCase());
  return rows.map(rank => `${rank.name}: ${rank.users.join(', ') || '(none)'}`).join(' | ') || 'No permission assignments.';
}

module.exports = {
  name: 'PermissionsAdmin',
  commands: [
    { name: 'addperm', access: ADMIN },
    { name: 'delperm', access: ADMIN },
    { name: 'listperms', access: ADMIN },
    { name: 'addadmin', access: ADMIN },
    { name: 'listadmins', access: { public: true } },
    { name: 'whatami', access: { public: true } },
    { name: 'authed', access: { public: true } }
  ],

  init() {
    permissions.loadPermissions();
    console.log('[PermissionsAdmin] initialized');
  },

  async handleCommand(ctx) {
    const raw = text(ctx);

    if (ctx.command === 'whatami') {
      const rank = highestRankForSubjects(await currentSubjects(ctx));
      return say(ctx, rank ? `You are '${rank.name}'` : 'You are nothing! NOTHING!');
    }

    if (ctx.command === 'authed') {
      const subjects = await currentSubjects(ctx);
      return addressedSay(ctx, subjects.length ?
        `Authenticated as ${subjects.join(', ')}` :
        'Nope.');
    }

    if (ctx.command === 'listadmins') return addressedSay(ctx, assignmentsText('Admin'));
    if (ctx.command === 'listperms') return addressedSay(ctx, assignmentsText(raw));

    if (ctx.command === 'addadmin') {
      if (!raw) return addressedSay(ctx, `Usage: ${ctx.prefix}addadmin <nick|account|discord:id>`);
      const subject = await resolveSubject(ctx, raw);
      return addressedSay(ctx, permissions.addSubjectToRank(subject, 'Admin') ?
        `${subject} added to Admin.` :
        `${subject} is already an Admin.`);
    }

    if (ctx.command === 'addperm') {
      const [target = '', rank = ''] = raw.split(/\s+/);
      if (!target || !rank) return addressedSay(ctx, `Usage: ${ctx.prefix}addperm <nick|subject> <Trusted|Moderator|Admin>`);
      try {
        const subject = await resolveSubject(ctx, target);
        return addressedSay(ctx, permissions.addSubjectToRank(subject, rank) ?
          `Added ${subject} to ${permissions.canonicalRankName(rank)}.` :
          `${subject} already has ${permissions.canonicalRankName(rank)}.`);
      } catch (error) {
        return addressedSay(ctx, error.message);
      }
    }

    if (ctx.command === 'delperm') {
      const [target = '', rank = ''] = raw.split(/\s+/);
      if (!target) return addressedSay(ctx, `Usage: ${ctx.prefix}delperm <nick|subject> [rank]`);
      try {
        const subject = await resolveSubject(ctx, target);
        const removed = permissions.removeSubjectFromRank(subject, rank);
        return addressedSay(ctx, removed ?
          `Removed ${subject} from ${rank || 'all ranks'}.` :
          `${subject} did not have that permission.`);
      } catch (error) {
        return addressedSay(ctx, error.message);
      }
    }
  },

  _private: {
    ADMIN,
    assignmentsText,
    currentSubjects,
    highestRankForSubjects,
    resolveSubject
  }
};
