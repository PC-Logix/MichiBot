'use strict';

const http = require('http');
const https = require('https');

const cache = new Map();

function now() {
  return Date.now();
}

function getConfig(ctx) {
  return ctx?.config?.bridges?.discord?.auth || {};
}

function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return null;

  if (entry.expiresAt <= now()) {
    cache.delete(key);
    return null;
  }

  return entry.value;
}

function cacheSet(key, value, ttlMs) {
  if (!ttlMs || ttlMs < 1) {
    return;
  }

  cache.set(key, {
    value,
    expiresAt: now() + ttlMs
  });
}

function buildCacheKey(ctx) {
  const parts = [
    String(ctx?.source || ''),
    String(ctx?.rawFrom || ''),
    String(ctx?.target || ctx?.to || ''),
    String(ctx?.bridgeUser || ''),
    String(ctx?.rawText || ''),
    String(ctx?.text || ctx?.message || '')
  ];

  return parts.join(' :: ');
}

function buildPayload(ctx) {
  return {
    source: String(ctx?.source || ''),
    channel: String(ctx?.target || ctx?.to || ''),
    replyTarget: String(ctx?.replyTarget || ''),
    transportNick: String(ctx?.rawFrom || ctx?.nick || ''),
    bridgeUser: String(ctx?.bridgeUser || ''),
    rawText: String(ctx?.rawText || ''),
    message: String(ctx?.text || ctx?.message || '')
  };
}

function httpRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const transport = target.protocol === 'https:' ? https : http;

    const req = transport.request(target, options, (res) => {
      let data = '';
      res.setEncoding('utf8');

      res.on('data', chunk => {
        data += chunk;
      });

      res.on('end', () => {
        resolve({
          statusCode: res.statusCode || 0,
          body: data
        });
      });
    });

    req.on('error', reject);

    if (options.timeout && options.timeout > 0) {
      req.setTimeout(options.timeout, () => {
        req.destroy(new Error('Bridge auth lookup timed out'));
      });
    }

    if (body) {
      req.write(body);
    }

    req.end();
  });
}

async function resolveDiscordUserIdFromBridge(ctx) {
  if (!ctx?.isBridge || ctx?.source !== 'discord-bridge') {
    return null;
  }

  const authConfig = getConfig(ctx);
  if (!authConfig?.enabled || !authConfig?.lookupUrl) {
    return null;
  }

  const cacheKey = buildCacheKey(ctx);
  const successTtlMs = Number(authConfig.cacheTtlMs || 5 * 60 * 1000);
  const failureTtlMs = Number(authConfig.failureCacheTtlMs || 30 * 1000);

  const cached = cacheGet(cacheKey);
  if (cached !== null) {
    return cached || null;
  }

  const payload = JSON.stringify(buildPayload(ctx));
  const headerName = String(authConfig.headerName || '').trim();
  const headerValue = String(authConfig.headerValue || '').trim();
  const headers = {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  };

  if (headerName && headerValue) {
    headers[headerName] = headerValue;
  }

  try {
    console.log('[bridgeAuth] lookup payload:', payload, '\r\n');
    console.log('[bridgeAuth] lookup url:', authConfig.lookupUrl, '\r\n');

    const response = await httpRequest(authConfig.lookupUrl, {
      method: String(authConfig.method || 'POST').toUpperCase(),
      headers,
      timeout: Number(authConfig.timeoutMs || 3000)
    }, payload);

    if (response.statusCode < 200 || response.statusCode >= 300) {
      cacheSet(cacheKey, '', failureTtlMs);
      return null;
    }

    const value = String(response.body || '').trim();
    if (!/^\d+$/.test(value)) {
      cacheSet(cacheKey, '', failureTtlMs);
      return null;
    }

    cacheSet(cacheKey, value, successTtlMs);
    return value;
  } catch (_) {
    cacheSet(cacheKey, '', failureTtlMs);
    return null;
  }
}

module.exports = {
  resolveDiscordUserIdFromBridge
};
