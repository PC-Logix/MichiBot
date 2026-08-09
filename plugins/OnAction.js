'use strict';

module.exports = {
  name: 'OnAction',

  init() {
    console.log('[OnAction] initialized');
  },

  handleAction(event, { client } = {}) {
    const action = String(event?.message || '');
    const target = String(event?.target || '').trim();
    const sender = String(event?.nick || '').trim();
    const botNick = String(client?.user?.nick || '').trim();

    if (!client || !target || !botNick) return;

    if (action.includes(`pets ${botNick}`)) {
      client.action(target, 'purrs');
    } else if (action.includes(`glomps ${botNick}`)) {
      client.action(target, 'gets out the pepper spray');
    } else if (action.includes(`high-fives ${botNick}`)) {
      client.action(target, `high-fives ${sender}`);
    }
  }
};
