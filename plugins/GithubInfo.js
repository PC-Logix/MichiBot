'use strict';

const optionalHooks = require('../services/optionalHooks');
const { IRC_BOLD, IRC_RESET, antiPingMessage, fetchJson, say, text } = require('../utils/helper');

const HOOK_NAME = 'github';
const MODERATOR_IN_CHANNEL = { allOf: [{ channelOnly: true }, { globalRank: 'Moderator' }] };
const ISSUE_URL = /https?:\/\/(?:www\.)?github\.com\/([^/\s]+)\/([^/\s]+)\/(issues|pull)\/(\d+)/i;
const cache = new Map();

function issueReference(message) {
  const match = String(message || '').match(ISSUE_URL);
  return match ? { owner: match[1], repo: match[2], kind: match[3], number: Number(match[4]), url: match[0] } : null;
}

function headers(ctx) {
  const result = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  const token = String(ctx?.config?.integrations?.github?.token || '').trim();
  if (token) result.Authorization = `Bearer ${token}`;
  return result;
}

async function fetchIssue(ctx, reference, fetcher = fetchJson) {
  const key = `${reference.owner}/${reference.repo}/${reference.number}`.toLowerCase();
  const cached = cache.get(key);
  if (cached && Date.now() - cached.time < 300000) return cached.data;
  const endpoint = `https://api.github.com/repos/${encodeURIComponent(reference.owner)}/${encodeURIComponent(reference.repo)}/issues/${reference.number}`;
  const response = await fetcher(endpoint, 7000, headers(ctx));
  if (response.statusCode !== 200 || !response.json?.title) return null;
  cache.set(key, { time: Date.now(), data: response.json });
  return response.json;
}

function clean(value) {
  return String(value || '').replace(/[\x00-\x1f\x7f-\x9f]/g, ' ').replace(/\s+/g, ' ').trim();
}

function formatIssue(data) {
  const type = data.pull_request ? 'Pull request' : 'Issue';
  const state = clean(data.state || 'unknown');
  const posted = data.created_at ? new Date(data.created_at).toUTCString() : 'unknown';
  return `${IRC_BOLD}${type}: ${IRC_RESET}${clean(data.title)}${IRC_BOLD} | Posted by: ${IRC_RESET}` +
    `${clean(data.user?.login)}${IRC_BOLD} | Posted: ${IRC_RESET}${posted}${IRC_BOLD} | Status: ${IRC_RESET}${state}`;
}

async function expand(ctx, fetcher = fetchJson) {
  if (ctx.isPrivate || !optionalHooks.isEnabled(HOOK_NAME, ctx.replyTarget || ctx.to)) return false;
  const reference = issueReference(ctx.text);
  if (!reference) return false;
  try {
    const data = await fetchIssue(ctx, reference, fetcher);
    if (!data) return false;
    const users = require('../utils/channelState').getUsers(ctx.replyTarget || ctx.to);
    say(ctx, antiPingMessage(formatIssue(data), users));
    return true;
  } catch (_) {
    return false;
  }
}

module.exports = {
  name: 'GithubInfo',
  commands: [{ name: 'github', access: MODERATOR_IN_CHANNEL, cooldown: { seconds: 10 }, help: 'Github Ticket info' }],
  init() { optionalHooks.ensureSchema(); console.log('[GithubInfo] initialized'); },
  onMessage(ctx) { return expand(ctx); },
  handleCommand(ctx) {
    const state = text(ctx).toLowerCase();
    const channel = ctx.replyTarget || ctx.to;
    if (state === 'enable') optionalHooks.enable(HOOK_NAME, channel);
    else if (state === 'disable') optionalHooks.disable(HOOK_NAME, channel);
    return say(ctx, `GitHub Info is ${optionalHooks.isEnabled(HOOK_NAME, channel) ? 'enabled' : 'disabled'} in this channel`);
  },
  _private: { HOOK_NAME, ISSUE_URL, cache, expand, fetchIssue, formatIssue, issueReference }
};
