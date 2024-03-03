module.exports = {
  handleMessage: (client, channel, from, message) => {
    if (message.toLowerCase() === '%ping') {
      client.say(channel, 'pong');
    }
  },
};
