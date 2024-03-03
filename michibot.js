const fs = require('fs');
const path = require('path');
const irc = require('irc');

const config = require('./config.json');

// Initialize permissions module
const permissionsModule = require('./modules/permissions.js');
permissionsModule.init();

// Initialize admin module with permissions
const adminModule = require('./modules/admin.js');
adminModule.init(config, permissionsModule);


// Load modules dynamically from the 'modules' directory
const modulesDir = path.join(__dirname, 'modules');
const modules = [];

fs.readdirSync(modulesDir).forEach(file => {
  const modulePath = path.join(modulesDir, file);
  const module = require(modulePath);

  // Add the module to the array
  modules.push(module);
});


// Load all plugins from the 'plugins' directory
const loadPlugins = () => {
  const pluginsDir = path.join(__dirname, 'plugins');
  const pluginFiles = fs.readdirSync(pluginsDir).filter(file => file.endsWith('.js'));

  const loadedPlugins = [];

  for (const file of pluginFiles) {
    const pluginPath = path.join(pluginsDir, file);
    const loadedPlugin = require(pluginPath);

    console.log(`Loaded plugin: ${file}`);
    if (loadedPlugin.commands) {
      console.log(`Commands: ${loadedPlugin.commands.join(', ')}`);
    }

    // Initialize the plugin with the configuration
    if (loadedPlugin.init) {
      console.log(`Initializing plugin: ${file}`);
      loadedPlugin.init(config);  // Pass the config object to the plugin
    }

    loadedPlugins.push(loadedPlugin);
  }

  return loadedPlugins;
};

const plugins = loadPlugins();

const client = new irc.Client(config.server, config.userName, config);

// Combine loaded plugins and modules
const extensions = [...plugins, ...modules];

// Listen for messages in the channel
client.addListener('message', (from, to, message) => {
  console.log(`${to} <${from}> ${message}`);

  // Relay message to all loaded plugins and modules
  extensions.forEach(extension => {
    if (extension.handleMessage) {
      const result = extension.handleMessage(client, to, from, message);

      // Handle extension results if needed
      // console.log(`Extension result:`, result);
    }
  });
});


// Connect to the IRC server
client.connect();
