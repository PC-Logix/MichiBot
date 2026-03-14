'use strict';

function log(...args) {
  console.log('[michibot]', ...args);
}

function warn(...args) {
  console.warn('[michibot]', ...args);
}

function error(...args) {
  console.error('[michibot]', ...args);
}

module.exports = {
  log,
  warn,
  error
};
