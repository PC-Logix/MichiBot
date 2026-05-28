'use strict';

function createCapabilityManager({
  client,
  logger,
  requestedCaps = []
}) {
  const enabledCaps = new Set();
  const requestedSet = new Set(
    (Array.isArray(requestedCaps) ? requestedCaps : [])
    .map(cap => String(cap || '').trim())
    .filter(Boolean)
  );

  function CapabilityMiddleware(caps) {
    const capList = Array.isArray(caps) ?
      caps.map(cap => String(cap || '').trim()).filter(Boolean) :
      [];

    return function capabilityMiddleware(clientInstance, raw_events, parsed_events) {
      if (capList.length === 0) {
        return;
      }

      logger.log(`[caps] Requesting: ${capList.join(', ')}`);

      // Prefer one grouped request
      clientInstance.requestCap(capList.join(' '));
    };
  }

  function handleCapEvent(name, event) {
    const rawCaps = event?.capabilities;
    let capNames = [];

    if (Array.isArray(rawCaps)) {
      capNames = rawCaps
        .map(cap => String(cap || '').trim())
        .filter(Boolean);
    } else if (rawCaps && typeof rawCaps === 'object') {
      capNames = Object.keys(rawCaps)
        .map(cap => String(cap || '').trim())
        .filter(Boolean);
    } else if (typeof rawCaps === 'string') {
      capNames = rawCaps
        .split(/\s+/)
        .map(cap => String(cap || '').trim())
        .filter(Boolean);
    }

    logger.log(`[caps] ${name.toUpperCase()}: ${capNames.join(' ') || '(none)'}`);

    if (name === 'ack' || name === 'new') {
      for (const cap of capNames) {
        if (requestedSet.has(cap)) {
          enabledCaps.add(cap);
        }
      }
    }

    if (name === 'del') {
      for (const cap of capNames) {
        enabledCaps.delete(cap);
      }
    }
  }

  function bindEvents() {
    client.on('cap ls', (event) => handleCapEvent('ls', event));
    client.on('cap ack', (event) => handleCapEvent('ack', event));
    client.on('cap nak', (event) => handleCapEvent('nak', event));
    client.on('cap new', (event) => handleCapEvent('new', event));
    client.on('cap del', (event) => handleCapEvent('del', event));
  }

  function useMiddleware() {
    client.use(CapabilityMiddleware(Array.from(requestedSet)));
  }

  function getEnabledCaps() {
    return Array.from(enabledCaps).sort();
  }

  return {
    bindEvents,
    getEnabledCaps,
    useMiddleware
  };
}

module.exports = {
  createCapabilityManager
};
