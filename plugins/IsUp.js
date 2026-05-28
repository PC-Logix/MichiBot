'use strict';
const {
  fetchText,
  say,
  text
} = require('../utils/helper');
module.exports = {
  name: 'IsUp',
  commands: ['isup'],
  init() {
    console.log('[IsUp] initialized');
  },
  async handleCommand(ctx) {
    let url = text(ctx).split(/\s+/)[0];
    if (!url) return say(ctx, `Usage: ${ctx.prefix}isup <url>`);
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    try {
      const res = await fetchText(url, 7000);
      say(ctx, `${url} returned HTTP ${res.statusCode}.`);
    } catch (e) {
      say(ctx, `${url} seems down or unreachable: ${e.message}`);
    }
  }
};
