'use strict';

const optionalHooks = require('../services/optionalHooks');
const channelState = require('../utils/channelState');
const { IRC_BOLD, IRC_COLOR, IRC_RESET, antiPingMessage, fetchJson, say, text } = require('../utils/helper');

const HOOK_NAME = 'YouTube';
const CHANNEL_OP_OR_ADMIN = {
  allOf: [
    { channelOnly: true },
    { anyOf: [{ globalRank: 'Admin' }, { channelMode: 'op' }] }
  ]
};
const YOUTUBE_URL = /https?:\/\/(?:www\.|m\.)?(?:youtube(?:-nocookie)?\.com|youtu\.be)\/[^\s<>]+/ig;
const cache = new Map();

function extractYouTubeId(input) {
  const match = String(input || '').match(YOUTUBE_URL);
  if (!match) return null;
  try {
    const url = new URL(match[0].replace(/[),.!?]+$/, ''));
    const host = url.hostname.toLowerCase().replace(/^www\.|^m\./, '');
    let id = '';
    if (host === 'youtu.be') id = url.pathname.split('/').filter(Boolean)[0] || '';
    else if (url.pathname === '/watch') id = url.searchParams.get('v') || '';
    else {
      const parts = url.pathname.split('/').filter(Boolean);
      if (['embed', 'shorts', 'live', 'v'].includes(parts[0])) id = parts[1] || '';
    }
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch (_) {
    return null;
  }
}

function parseIsoDuration(value) {
  const match = String(value || '').match(/^P(?:\d+D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
  if (!match) return '';
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  return [hours ? `${hours}h` : '', minutes ? `${minutes}m` : '', `${seconds}s`].filter(Boolean).join(' ');
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? new Intl.NumberFormat('en-US').format(parsed) : 'unknown';
}

function clean(value) {
  return String(value || '').replace(/[\x00-\x1f\x7f-\x9f]/g, ' ').replace(/\s+/g, ' ').trim();
}

function formatRichVideo(video) {
  const snippet = video.snippet || {};
  const stats = video.statistics || {};
  const duration = parseIsoDuration(video.contentDetails?.duration) || 'unknown';
  const published = snippet.publishedAt ? new Date(snippet.publishedAt) : null;
  const date = published && !Number.isNaN(published.valueOf()) ?
    `${published.getUTCDate()}/${published.getUTCMonth() + 1}/${published.getUTCFullYear()}` : 'unknown';
  return `${IRC_BOLD}${clean(snippet.title)}${IRC_RESET} | length: ${IRC_BOLD}${duration}${IRC_RESET}` +
    ` | Likes: ${IRC_COLOR}03${number(stats.likeCount)}${IRC_RESET}` +
    ` | Views: ${IRC_BOLD}${number(stats.viewCount)}${IRC_RESET}` +
    ` | by ${IRC_BOLD}${clean(snippet.channelTitle)}${IRC_RESET} | Published On ${date}`;
}

function formatOEmbed(data) {
  return `${IRC_BOLD}${clean(data.title)}${IRC_RESET} | by ${IRC_BOLD}${clean(data.author_name)}${IRC_RESET}`;
}

async function fetchVideo(ctx, id, fetcher = fetchJson) {
  const cached = cache.get(id);
  if (cached && Date.now() - cached.time < 300000) return cached.data;

  const apiKey = String(ctx?.config?.integrations?.youtube?.apiKey || '').trim();
  if (apiKey) {
    try {
      const endpoint = 'https://www.googleapis.com/youtube/v3/videos?' + new URLSearchParams({
        part: 'snippet,statistics,contentDetails', id, key: apiKey
      });
      const response = await fetcher(endpoint, 7000);
      if (response.statusCode === 200 && response.json?.items?.[0]) {
        const data = { kind: 'rich', video: response.json.items[0] };
        cache.set(id, { time: Date.now(), data });
        return data;
      }
    } catch (_) {
      // Fall through to public oEmbed metadata.
    }
  }

  const watchUrl = `https://www.youtube.com/watch?v=${id}`;
  const endpoint = `https://www.youtube.com/oembed?${new URLSearchParams({ url: watchUrl, format: 'json' })}`;
  const response = await fetcher(endpoint, 7000);
  if (response.statusCode !== 200 || !response.json?.title) return null;
  const data = { kind: 'oembed', oembed: response.json };
  cache.set(id, { time: Date.now(), data });
  return data;
}

function formatVideo(data) {
  if (data?.kind === 'rich') return formatRichVideo(data.video);
  if (data?.kind === 'oembed') return formatOEmbed(data.oembed);
  return '';
}

async function expand(ctx, fetcher = fetchJson) {
  if (ctx.isPrivate || !optionalHooks.isEnabled(HOOK_NAME, ctx.replyTarget || ctx.to)) return false;
  const id = extractYouTubeId(ctx.text);
  if (!id) return false;
  try {
    const data = await fetchVideo(ctx, id, fetcher);
    const output = formatVideo(data);
    if (!output) return false;
    say(ctx, antiPingMessage(output, channelState.getUsers(ctx.replyTarget || ctx.to)));
    return true;
  } catch (_) {
    return false;
  }
}

module.exports = {
  name: 'YTInfo',
  commands: [{ name: 'ytc', access: CHANNEL_OP_OR_ADMIN, help: 'Control YouTube video information for this channel.' }],
  init() { optionalHooks.ensureSchema(); console.log('[YTInfo] initialized'); },
  onMessage(ctx) { return expand(ctx); },
  handleCommand(ctx) {
    const action = text(ctx).toLowerCase();
    const channel = ctx.replyTarget || ctx.to;
    if (action === 'enable') optionalHooks.enable(HOOK_NAME, channel);
    else if (action === 'disable') optionalHooks.disable(HOOK_NAME, channel);
    if (action === 'list') return say(ctx, `Enabled YT channels: [${optionalHooks.getEnabledChannels(HOOK_NAME).join(', ')}]`);
    return say(ctx, `${optionalHooks.isEnabled(HOOK_NAME, channel) ? 'Enabled' : 'Disabled'} YTInfo for this channel`);
  },
  _private: {
    HOOK_NAME, YOUTUBE_URL, cache, expand, extractYouTubeId, fetchVideo,
    formatOEmbed, formatRichVideo, formatVideo, parseIsoDuration
  }
};
