'use strict';

const path = require('path');
const { spawn } = require('child_process');

const DEFAULT_TIMEOUT_MS = 1_000;
const DEFAULT_MAX_OUTPUT_LENGTH = 420;
const DEFAULT_MAX_SCRIPT_LENGTH = 8_000;
const MAX_RESPONSE_BYTES = 32 * 1024;
const runnerPath = path.join(__dirname, 'jsSandboxRunner.js');

function normalizeOutput(value, maxLength = DEFAULT_MAX_OUTPUT_LENGTH) {
  const text = String(value || '')
    .replace(/\r/g, '')
    .replace(/\n/g, ' | ')
    .trim();
  return text.length <= maxLength ? text : `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

function runJavaScriptSnippet(script, context = {}, options = {}) {
  const source = String(script || '');
  const maxScriptLength = Number(options.maxScriptLength || DEFAULT_MAX_SCRIPT_LENGTH);
  const timeoutMs = Math.max(100, Math.min(5_000, Number(options.timeoutMs || DEFAULT_TIMEOUT_MS)));
  const maxLength = Math.max(64, Number(options.maxLength || DEFAULT_MAX_OUTPUT_LENGTH));
  const maxOutputLength = Math.max(maxLength, Number(options.maxOutputLength || 2_000));

  if (!source.trim()) return Promise.reject(new Error('No snippet provided.'));
  if (source.length > maxScriptLength) return Promise.reject(new Error(`JavaScript snippet exceeds ${maxScriptLength} characters.`));

  return new Promise((resolve, reject) => {
    const args = [
      '--permission',
      `--allow-fs-read=${runnerPath}`,
      '--max-old-space-size=32',
      '--disable-proto=throw',
      runnerPath
    ];
    const child = spawn(process.execPath, args, {
      cwd: __dirname,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {}
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };

    const timer = setTimeout(() => {
      try { child.kill(); } catch (_) {}
      finish(reject, new Error('JavaScript execution timed out.'));
    }, timeoutMs + 750);

    child.stdout.on('data', chunk => {
      stdout += chunk;
      if (stdout.length > MAX_RESPONSE_BYTES) {
        try { child.kill(); } catch (_) {}
        finish(reject, new Error('JavaScript sandbox produced too much output.'));
      }
    });
    child.stderr.on('data', chunk => {
      if (stderr.length < 4_000) stderr += chunk;
    });
    child.on('error', error => finish(reject, error));
    child.on('exit', code => {
      if (settled) return;
      let message;
      try {
        message = JSON.parse(stdout || '{}');
      } catch (_) {
        const detail = stderr.trim().split(/\r?\n/).filter(Boolean).pop();
        return finish(reject, new Error(detail || `JavaScript sandbox exited with code ${code}.`));
      }
      if (!message.ok) return finish(reject, new Error(message.error || 'JavaScript execution failed.'));
      return finish(resolve, normalizeOutput(message.result, maxLength));
    });

    child.stdin.end(JSON.stringify({
      script: source,
      context,
      timeoutMs,
      maxOutputLength
    }));
  });
}

module.exports = {
  DEFAULT_MAX_OUTPUT_LENGTH,
  DEFAULT_MAX_SCRIPT_LENGTH,
  DEFAULT_TIMEOUT_MS,
  normalizeOutput,
  runJavaScriptSnippet
};
