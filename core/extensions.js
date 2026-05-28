'use strict';

const fs = require('fs');
const path = require('path');

function createExtensionManager({
  baseDir,
  logger,
  buildContext,
  registerCommand,
  unregisterCommandsForExtension,
  webServer
}) {
  const loadedExtensions = new Map();

  function getExtensionKey(type, fileName) {
    return `${type}:${fileName}`;
  }

  function getExtensionPath(type, fileName) {
    return path.join(baseDir, type, fileName);
  }

  function listJsFiles(dirPath) {
    if (!fs.existsSync(dirPath)) {
      return [];
    }

    return fs.readdirSync(dirPath).filter(file => file.endsWith('.js'));
  }

  function buildExtensionContext(runtimeInfo) {
    const ctx = buildContext();
    ctx.extension = {
      key: runtimeInfo.extensionKey,
      type: runtimeInfo.type,
      fileName: runtimeInfo.fileName,
      fullPath: runtimeInfo.fullPath
    };
    return ctx;
  }

  async function initializeExtension(runtimeInfo, extension) {
    if (typeof extension.init === 'function') {
      await extension.init(buildExtensionContext({
        ...runtimeInfo,
        module: extension
      }));
      logger.log(`Initialized ${runtimeInfo.extensionKey}`);
    }
  }

  function registerExtensionCommands(extensionKey, extension) {
    if (!Array.isArray(extension.commands) || typeof extension.handleCommand !== 'function') {
      return;
    }

    for (const commandSpec of extension.commands) {
      registerCommand(
        commandSpec,
        async (ctx) => extension.handleCommand(ctx),
        extensionKey
      );
    }
  }

  async function registerExtensionWeb(runtimeInfo) {
    if (!webServer || !runtimeInfo?.module || typeof runtimeInfo.module.registerWeb !== 'function') {
      return;
    }

    try {
      const webCtx = webServer.buildPluginContext({
        extension: {
          key: runtimeInfo.extensionKey,
          type: runtimeInfo.type,
          fileName: runtimeInfo.fileName,
          fullPath: runtimeInfo.fullPath
        },
        runtimeInfo,
        botContext: buildExtensionContext(runtimeInfo)
      });

      await runtimeInfo.module.registerWeb(webCtx);
      logger.log(`Registered web handlers for ${runtimeInfo.extensionKey}`);
    } catch (err) {
      logger.error(`Web registration failed for ${runtimeInfo.extensionKey}:`, err);
    }
  }

  async function disposeExtension(runtimeInfo) {
    if (!runtimeInfo || !runtimeInfo.module) {
      return;
    }

    if (webServer && typeof webServer.unregisterRoutesForExtension === 'function') {
      webServer.unregisterRoutesForExtension(runtimeInfo.extensionKey);
    }

    if (typeof runtimeInfo.module.dispose === 'function') {
      try {
        await runtimeInfo.module.dispose(buildExtensionContext(runtimeInfo));
        logger.log(`Disposed ${runtimeInfo.extensionKey}`);
      } catch (err) {
        logger.error(`Dispose failed for ${runtimeInfo.extensionKey}:`, err);
      }
    }
  }

  async function loadExtension(type, fileName) {
    const extensionKey = getExtensionKey(type, fileName);
    const fullPath = getExtensionPath(type, fileName);

    if (loadedExtensions.has(extensionKey)) {
      return {
        ok: false,
        message: `${type}/${fileName} is already loaded`
      };
    }

    if (!fs.existsSync(fullPath)) {
      return {
        ok: false,
        message: `${type}/${fileName} does not exist`
      };
    }

    try {
      delete require.cache[require.resolve(fullPath)];
      const extension = require(fullPath);
      const runtimeInfo = {
        extensionKey,
        type,
        fileName,
        fullPath,
        module: extension
      };

      await initializeExtension(runtimeInfo, extension);
      registerExtensionCommands(extensionKey, extension);

      loadedExtensions.set(extensionKey, runtimeInfo);
      await registerExtensionWeb(runtimeInfo);

      logger.log(`Loaded ${extensionKey}`);

      return {
        ok: true,
        message: `Loaded ${type}/${fileName}`
      };
    } catch (err) {
      logger.error(`Failed to load ${extensionKey}:`, err);
      return {
        ok: false,
        message: `Failed to load ${type}/${fileName}: ${err.message}`
      };
    }
  }

  async function unloadExtension(type, fileName) {
    const extensionKey = getExtensionKey(type, fileName);
    const runtimeInfo = loadedExtensions.get(extensionKey);

    if (!runtimeInfo) {
      return {
        ok: false,
        message: `${type}/${fileName} is not loaded`
      };
    }

    try {
      unregisterCommandsForExtension(extensionKey);
      await disposeExtension(runtimeInfo);
      loadedExtensions.delete(extensionKey);

      try {
        delete require.cache[require.resolve(runtimeInfo.fullPath)];
      } catch (_) {
        // ignore
      }

      logger.log(`Unloaded ${extensionKey}`);

      return {
        ok: true,
        message: `Unloaded ${type}/${fileName}`
      };
    } catch (err) {
      logger.error(`Failed to unload ${extensionKey}:`, err);
      return {
        ok: false,
        message: `Failed to unload ${type}/${fileName}: ${err.message}`
      };
    }
  }

  async function reloadExtension(type, fileName) {
    const unloadResult = await unloadExtension(type, fileName);
    if (!unloadResult.ok) {
      return unloadResult;
    }

    return loadExtension(type, fileName);
  }

  function normalizeFileName(name) {
    const trimmed = String(name || '').trim();
    if (!trimmed) {
      return '';
    }

    return trimmed.endsWith('.js') ? trimmed : `${trimmed}.js`;
  }

  async function loadExtensionByName(type, name) {
    const fileName = normalizeFileName(name);
    if (!fileName) {
      return {
        ok: false,
        message: `No ${type === 'plugins' ? 'plugin' : 'module'} name provided`
      };
    }

    return loadExtension(type, fileName);
  }

  async function unloadExtensionByName(type, name) {
    const fileName = normalizeFileName(name);
    if (!fileName) {
      return {
        ok: false,
        message: `No ${type === 'plugins' ? 'plugin' : 'module'} name provided`
      };
    }

    return unloadExtension(type, fileName);
  }

  async function reloadExtensionByName(type, name) {
    const fileName = normalizeFileName(name);
    if (!fileName) {
      return {
        ok: false,
        message: `No ${type === 'plugins' ? 'plugin' : 'module'} name provided`
      };
    }

    return reloadExtension(type, fileName);
  }

  async function loadAllFrom(type) {
    const dirPath = path.join(baseDir, type);
    const files = listJsFiles(dirPath);

    for (const fileName of files) {
      if (type === 'modules' && fileName === 'permissions.js') {
        continue;
      }

      const result = await loadExtension(type, fileName);
      if (!result.ok) {
        logger.warn(result.message);
      }
    }
  }

  function getLoadedExtensions() {
    return loadedExtensions;
  }

  return {
    getLoadedExtensions,
    loadAllFrom,
    loadExtensionByName,
    reloadExtensionByName,
    unloadExtensionByName
  };
}

module.exports = {
  createExtensionManager
};
