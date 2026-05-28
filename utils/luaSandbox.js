'use strict';

const path = require('path');
const { Worker } = require('worker_threads');

const DEFAULT_TIMEOUT_MS = 3500;
const DEFAULT_MAX_OUTPUT_LENGTH = 420;

let worker = null;
let nextId = 1;
let pending = new Map();
let lastOptions = null;
let fatalError = null;

function normalizeOutput(value, maxLength = DEFAULT_MAX_OUTPUT_LENGTH) {
  const text = String(value || '')
    .replace(/\r/g, '')
    .replace(/\n/g, ' | ')
    .trim();

  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
}

function failPending(err) {
  for (const item of pending.values()) {
    clearTimeout(item.timer);
    item.reject(err);
  }
  pending.clear();
}

function stopWorker() {
  if (worker) {
    try {
      worker.terminate();
    } catch (_) {
      // ignore
    }
  }
  worker = null;
}

function startWorker(options = {}) {
  lastOptions = {
    baseDir: options.baseDir || path.resolve(__dirname, '..'),
    resourceDir: options.resourceDir,
    timeoutMs: Number(options.timeoutMs || DEFAULT_TIMEOUT_MS),
    maxOutputLength: Number(options.maxOutputLength || 2000)
  };

  fatalError = null;
  stopWorker();

  worker = new Worker(path.join(__dirname, 'luaSandboxWorker.js'), {
    workerData: lastOptions
  });

  worker.on('message', (message) => {
    if (message?.type === 'fatal') {
      fatalError = message.error || 'Lua sandbox failed to initialize.';
      failPending(new Error(fatalError));
      return;
    }

    if (message?.type === 'ready') {
      return;
    }

    const item = pending.get(message?.id);
    if (!item) return;

    clearTimeout(item.timer);
    pending.delete(message.id);

    if (message.ok) {
      item.resolve(normalizeOutput(message.result, item.maxLength));
    } else {
      item.reject(new Error(message.error || 'Lua execution failed.'));
    }
  });

  worker.on('error', (err) => {
    fatalError = err.message || String(err);
    failPending(err);
  });

  worker.on('exit', (code) => {
    if (code !== 0 && pending.size) {
      failPending(new Error(`Lua sandbox worker exited with code ${code}.`));
    }
    worker = null;
  });

  return worker;
}

function ensureWorker(options = {}) {
  if (!worker) startWorker(Object.keys(options).length ? options : (lastOptions || options));
  if (fatalError) throw new Error(fatalError);
  return worker;
}

function request(type, script = '', context = {}, options = {}) {
  const activeWorker = ensureWorker(options);
  const timeoutMs = Number(options.timeoutMs || lastOptions?.timeoutMs || DEFAULT_TIMEOUT_MS);
  const maxLength = Number(options.maxLength || DEFAULT_MAX_OUTPUT_LENGTH);
  const id = nextId++;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      stopWorker();
      startWorker(lastOptions || options);
      reject(new Error('Lua script took too long. Sandbox reset.'));
    }, timeoutMs);

    pending.set(id, {
      resolve,
      reject,
      timer,
      maxLength
    });

    activeWorker.postMessage({
      id,
      type,
      script: String(script || ''),
      context: context || {}
    });
  });
}

async function runLuaSnippet(script, context = {}, options = {}) {
  return request('run', script, context, options);
}

async function runSeleneSnippet(script, context = {}, options = {}) {
  return request('selene', script, context, options);
}

async function resetLuaSandbox(options = {}) {
  if (!worker) startWorker(options);
  const result = await request('reset', '', {}, options);
  return result || 'Sandbox reset';
}

function shutdownLuaSandbox() {
  failPending(new Error('Lua sandbox stopped.'));
  stopWorker();
}

module.exports = {
  startWorker,
  runLuaSnippet,
  runSeleneSnippet,
  resetLuaSandbox,
  shutdownLuaSandbox
};
