let commandPrefix; // Command prefix will be set when the module is loaded
module.exports = {
    init: (config, permissionsModule) => {
        commandPrefix = config.commandPrefix || '!';
    },
    handleMessage: (client, channel, from, message) => {
        // Check if the message is a command and handle it
        if (message.startsWith(commandPrefix)) {
            console.log(`Handling message: ${message}`);
            const parts = message.split(' ');
            const command = parts[0].toLowerCase();

            switch (command) {
                case `${commandPrefix}loadplugin`:
                    client.say(channel, 'pong');
            }
        }
    },
};