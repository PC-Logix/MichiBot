'use strict';

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
