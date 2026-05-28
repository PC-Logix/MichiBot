'use strict';
const {
  fetchJson,
  say,
  text
} = require('../utils/helper');
module.exports = {
  name: 'xkcd',
  commands: ['xkcd'],
  init() {
    console.log('[xkcd] initialized');
  },
  async handleCommand(ctx) {
    const n = text(ctx).split(/\s+/)[0];
    const url = n ? `https://xkcd.com/${encodeURIComponent(n)}/info.0.json` : 'https://xkcd.com/info.0.json';
    try {
      const {
        json
      } = await fetchJson(url);
      say(ctx, `xkcd #${json.num}: ${json.safe_title} - ${json.alt} (${json.img})`);
    } catch (e) {
      say(ctx, `Could not fetch xkcd: ${e.message}`);
    }
  }
};
