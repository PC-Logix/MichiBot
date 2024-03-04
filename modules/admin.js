let commandPrefix; // Command prefix will be set when the module is loaded
let adminUsers; // Admin users will be set when the module is loaded
let permissionsModule; // Permissions module will be set when the module is loaded

const commands = [
  'loadplugin',
  'unloadplugin',
  'changeprefix',
  'greet',
];

module.exports = {
    init: (config, permissionsModule) => {
      commandPrefix = config.commandPrefix || '!';
      permissionsModule = permissionsModule; // Corrected this line
      console.log('Loaded permissions module:', permissionsModule);
      
      // Check if getPermissions method exists
      if (permissionsModule.getPermissions) {
        console.log('Loaded permissions:', permissionsModule.getPermissions());
      } else {
        console.error('permissionsModule.getPermissions is not defined');
      }
  
      console.log('Initialized admin module:', { commandPrefix });
  
      // Use permissions module to get admin users
      adminUsers = permissionsModule.getAdminUsers() || [];
      console.log('Admin users:', adminUsers);
    },

  commands: commands,

  isAdmin: (user) => {
    return adminUsers.includes(user);
  },

  // Handle incoming messages
  handleMessage: (client, channel, from, message, config) => {
    console.log('Handling message:', { from, isAdmin: module.exports.isAdmin(from, config) });
  
    // Check if the message is a command and handle it
    if (message.startsWith(commandPrefix)) {
      if (module.exports.isAdmin(from, config)) {
        // You can handle any additional logic for all messages here if needed
        console.log(`Handling message: ${message}`);
        const parts = message.split(' ');
        const command = parts[0].toLowerCase();

        switch (command) {
          case `${commandPrefix}loadplugin`:
            // Load a plugin
            const pluginName = parts[1];
            if (pluginName) {
              // Implement plugin loading logic here
              console.log(`Loading plugin: ${pluginName}`);
            } else {
              console.log(`Usage: ${commandPrefix}loadplugin <pluginName>`);
            }
            break;

          case `${commandPrefix}unloadplugin`:
            // Unload a plugin
            const unloadedPluginName = parts[1];
            if (unloadedPluginName) {
              // Implement plugin unloading logic here
              console.log(`Unloading plugin: ${unloadedPluginName}`);
            } else {
              console.log(`Usage: ${commandPrefix}unloadplugin <pluginName>`);
            }
            break;

          case `${commandPrefix}changeprefix`:
            // Change the command prefix
            const newPrefix = parts[1];
            if (newPrefix) {
              commandPrefix = newPrefix;
              console.log(`Command prefix changed to: ${newPrefix}`);
            } else {
              console.log(`Usage: ${commandPrefix}changeprefix <newPrefix>`);
            }
            break;

          case `${commandPrefix}greet`:
            // Respond with a static greet message
            client.say(channel, 'Lasciate ogne speranza, voi ch\'intrate');
            break;
        }
      }
    }
  },

  getCommandPrefix: () => {
    return commandPrefix;
  },
};
