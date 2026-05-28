'use strict';
const dns = require('dns').promises;
const {
  say,
  text
} = require('../utils/helper');
module.exports = {
  name: 'LookUp',
  commands: ['lookup', 'rdns'],
  init() {
    console.log('[LookUp] initialized');
  },
  async handleCommand(ctx) {
    const q = text(ctx).split(/\s+/)[0];
    if (!q) return say(ctx, `Usage: ${ctx.prefix}${ctx.command} <host|ip>`);
    try {
      if (ctx.command === 'rdns' || /^\d+\.\d+\.\d+\.\d+$/.test(q)) {
        const names = await dns.reverse(q);
        say(ctx, `${q}: ${names.join(', ')}`);
      } else {
        const rows = await dns.lookup(q, {
          all: true
        });
        say(ctx, `${q}: ${rows.map(r=>r.address).join(', ')}`);
      }
    } catch (e) {
      say(ctx, `${q}: ${e.message}`);
    }
  }
};
