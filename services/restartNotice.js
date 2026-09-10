'use strict';

const fs = require('fs');
const path = require('path');
const { dataDir } = require('../libs/db');

const noticePath = path.join(dataDir, 'restart-notice.json');

function saveRestartNotice(notice) {
  const target = String(notice?.target || '').trim();
  if (!target) return false;

  const message = String(notice?.message || 'Update complete; restart finished.').trim();

  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(noticePath, JSON.stringify({ target, message }) + '\n', 'utf8');
    return true;
  } catch (_) {
    return false;
  }
}

function getRestartNotice() {
  try {
    const parsed = JSON.parse(fs.readFileSync(noticePath, 'utf8'));

    const target = String(parsed?.target || '').trim();
    const message = String(parsed?.message || '').trim();
    return target && message ? { target, message } : null;
  } catch (_) {
    return null;
  }
}

function clearRestartNotice() {
  try {
    fs.unlinkSync(noticePath);
  } catch (_) {
    // The notice may already have been removed by a prior successful start.
  }
}

module.exports = {
  clearRestartNotice,
  getRestartNotice,
  saveRestartNotice,
};
