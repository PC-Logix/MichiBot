'use strict';
const {
  fetchText,
  stripIrcFormatting
} = require('../utils/helper');
const seen = new Map();

function findUrls(s) {
  return String(s || '').match(/https?:\/\/[^\s<>]+/ig) || [];
}

function titleOf(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? m[1].replace(/\s+/g, ' ').trim().replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') : '';
}
module.exports = {
  name: 'URLExpander',
  init() {
    console.log('[URLExpander] initialized');
  },
  async onMessage(ctx) {
    const urls = findUrls(stripIrcFormatting(ctx.text));
    for (const url of urls.slice(0, 2)) {
      const old = seen.get(url);
      if (old && Date.now() - old < 300000) continue;
      seen.set(url, Date.now());
      try {
        const res = await fetchText(url, 6000);
        const ct = String(res.headers['content-type'] || '');
        if (!ct.includes('text/html')) continue;
        const title = titleOf(res.body);
        if (title) ctx.reply(ctx.replyTarget, `Title: ${title}`);
      } catch (_) {}
    }
  }
};
