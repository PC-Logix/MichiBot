# MichiBot
MichiBot, a modular IRC Bot written in Node.JS  MichiBot used to be based on LanteaBot, but no longer.

Any .js file in the plugins directory is loaded automatically, if you add a file while the bot is loading !loadplugin filename.js should work untested
files in modules are not dynamically loaded, I did a bad job on this. Admin / Permissions in this file are likely trash and I hate myself.