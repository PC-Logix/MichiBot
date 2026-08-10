'use strict';

const path = require('path');
const { execFileSync } = require('child_process');
const packageMetadata = require('../package.json');

const repositoryUrl = String(
  typeof packageMetadata.repository === 'string' ?
    packageMetadata.repository :
    packageMetadata.repository?.url ||
    packageMetadata.homepage ||
    'https://github.com/PC-Logix/MichiBot'
).replace(/^git\+/, '').replace(/\.git$/, '').replace(/\/$/, '');

function getDefaultIrcVersion() {
  let commit = 'unknown';

  try {
    commit = execFileSync(
      'git',
      ['rev-parse', '--short', 'HEAD'],
      {
        cwd: path.resolve(__dirname, '..'),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      }
    ).trim() || commit;
  } catch (_err) {
    // Packaged deployments may not include the .git directory.
  }

  return `${repositoryUrl} ${commit}`;
}

function buildIrcConnectionOptions(config = {}) {
  const sasl = config?.auth?.sasl || {};
  const saslEnabled = sasl.enabled === true || config.sasl === true;
  const mechanism = String(sasl.mechanism || 'PLAIN').trim().toUpperCase();
  const account = String(sasl.account || config.nsaccount || config.userName || '').trim();
  const password = String(sasl.password || config.nspass || '');

  const options = {
    host: config.server,
    port: config.port || (config.secure ? 6697 : 6667),
    nick: config.userName,
    username: config.userName,
    gecos: config.realName || config.userName,
    version: String(config.version || '').trim() || getDefaultIrcVersion(),
    tls: !!config.secure,
    rejectUnauthorized: !config.selfSigned,
    auto_reconnect: config.autoRejoin !== false
  };

  if (config.serverPassword) options.password = String(config.serverPassword);

  if (saslEnabled && (password || mechanism === 'EXTERNAL')) {
    options.account = {
      account,
      password
    };
    options.sasl_mechanism = mechanism;
    options.sasl_disconnect_on_fail = sasl.disconnectOnFail !== false;
  }

  return options;
}

module.exports = { buildIrcConnectionOptions };
