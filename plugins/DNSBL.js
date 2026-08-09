'use strict';

const dnsbl = require('../services/dnsbl');
const moderation = require('../services/moderation');
const optionalHooks = require('../services/optionalHooks');
const { addressedSay, say, text } = require('../utils/helper');

const HOOK_NAME = 'DNSBL';
const MOD_IN_CHANNEL = {
  allOf: [
    { channelOnly: true },
    { globalRank: 'Moderator' }
  ]
};
const MODERATOR = { globalRank: 'Moderator' };

function joinHostname(event) {
  return String(
    event?.hostname ||
    event?.host ||
    event?.user?.hostname ||
    event?.user?.host ||
    ''
  ).trim();
}

module.exports = {
  name: 'DNSBL',
  commands: [
    { name: 'dnsbl', access: MOD_IN_CHANNEL, cooldown: { seconds: 10 } },
    { name: 'checkdnsbl', access: { public: true }, cooldown: { seconds: 10 } },
    { name: 'adddnsbl', access: MODERATOR, cooldown: { seconds: 10 } },
    { name: 'remdnsbl', access: MODERATOR, cooldown: { seconds: 10 } },
    { name: 'listdnsbl', access: { public: true }, cooldown: { seconds: 10 } }
  ],

  init() {
    dnsbl.ensureSchema();
    moderation.ensureSchema();
    optionalHooks.ensureSchema();
    console.log(`[DNSBL] initialized with ${dnsbl.listServices().length} service(s)`);
  },

  async onJoin(event, extra = {}) {
    const channel = String(event?.channel || '').trim();
    const nick = String(event?.nick || '').trim();
    const hostname = joinHostname(event);
    const botNick = String(extra?.client?.user?.nick || extra?.config?.userName || '').trim();
    if (!channel || !nick || !hostname || nick.toLowerCase() === botNick.toLowerCase()) return;
    if (!optionalHooks.isEnabled(HOOK_NAME, channel)) return;

    try {
      const result = await dnsbl.checkAddress(hostname);
      if (!result.listedOn.length) return;
      const ctx = typeof extra.buildContext === 'function' ? extra.buildContext() : { client: extra.client };
      moderation.addTimedAction(ctx, {
        type: 'ban',
        channel,
        username: nick,
        hostmask: `*!*@${hostname}`,
        duration: '6h',
        placedBy: 'DNSBL Check',
        reason: `Listed on ${result.listedOn.join(', ')}`
      });
    } catch (_) {
      // Join moderation must fail open when DNS or hostname resolution fails.
    }
  },

  async handleCommand(ctx) {
    const input = text(ctx);

    if (ctx.command === 'dnsbl') {
      const action = input.toLowerCase();
      const channel = ctx.replyTarget || ctx.to;
      if (action === 'enable') {
        return addressedSay(ctx, optionalHooks.enable(HOOK_NAME, channel) ?
          'Enabled DNSBL checks for this channel.' :
          'DNSBL checks are already enabled for this channel.');
      }
      if (action === 'disable') {
        return addressedSay(ctx, optionalHooks.disable(HOOK_NAME, channel) ?
          'Disabled DNSBL checks for this channel.' :
          'DNSBL checks are already disabled for this channel.');
      }
      return addressedSay(ctx, `DNSBL is ${optionalHooks.isEnabled(HOOK_NAME, channel) ? 'enabled' : 'disabled'} in this channel.`);
    }

    if (ctx.command === 'listdnsbl') {
      const services = dnsbl.listServices();
      return say(ctx, services.length ? services.join(', ') : 'No DNSBLs tracked');
    }

    if (ctx.command === 'adddnsbl') {
      if (!input) return addressedSay(ctx, `Usage: ${ctx.prefix}adddnsbl <service>`);
      try {
        return addressedSay(ctx, dnsbl.addService(input) ? `Added ${dnsbl.normalizeService(input)}` : 'DNSBL service is already tracked.');
      } catch (error) {
        return addressedSay(ctx, error.message);
      }
    }

    if (ctx.command === 'remdnsbl') {
      if (!input) return addressedSay(ctx, `Usage: ${ctx.prefix}remdnsbl <service>`);
      return addressedSay(ctx, dnsbl.removeService(input) ? `Removed ${dnsbl.normalizeService(input)}` : 'DNSBL service was not tracked.');
    }

    if (ctx.command === 'checkdnsbl') {
      if (!input) return addressedSay(ctx, `Usage: ${ctx.prefix}checkdnsbl <address>`);
      try {
        const result = await dnsbl.checkAddress(input);
        return say(ctx, result.listedOn.length ?
          `${input} found on ${result.listedOn.join(', ')}` :
          `Host wasn't found on any tracked DNSBLs`);
      } catch (error) {
        return addressedSay(ctx, `Unable to check ${input}: ${error.message}`);
      }
    }
  },

  _private: {
    HOOK_NAME,
    MODERATOR,
    MOD_IN_CHANNEL,
    joinHostname
  }
};
