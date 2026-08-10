'use strict';

const { execFile } = require('child_process');

const MAX_OUTPUT_LENGTH = 600;

function runGit(args, cwd) {
  return new Promise(resolve => {
    execFile('git', args, {
      cwd,
      maxBuffer: 1024 * 1024,
      windowsHide: true
    }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        stdout: String(stdout || ''),
        stderr: String(stderr || ''),
        error
      });
    });
  });
}

function summarizeOutput(result) {
  const output = `${result.stdout}\n${result.stderr}`
    .replace(/\s+/g, ' ')
    .trim();

  if (!output) return 'No details available.';
  if (output.length <= MAX_OUTPUT_LENGTH) return output;
  return `${output.slice(0, MAX_OUTPUT_LENGTH - 3)}...`;
}

async function getHead(cwd) {
  const result = await runGit(['rev-parse', 'HEAD'], cwd);
  return result.ok ? result.stdout.trim() : '';
}

async function updateRepository(cwd) {
  const before = await getHead(cwd);
  if (!before) {
    return {
      ok: false,
      updated: false,
      message: 'Update failed: unable to determine the current commit.'
    };
  }

  const pull = await runGit(['pull', '--ff-only'], cwd);
  if (!pull.ok) {
    return {
      ok: false,
      updated: false,
      message: `Update failed: ${summarizeOutput(pull)}`
    };
  }

  const after = await getHead(cwd);
  if (!after) {
    return {
      ok: false,
      updated: false,
      message: 'Update failed: unable to verify the resulting commit.'
    };
  }

  const updated = before !== after;
  return {
    ok: true,
    updated,
    message: updated ? 'Update downloaded successfully.' : 'Already up to date.'
  };
}

module.exports = {
  updateRepository
};
