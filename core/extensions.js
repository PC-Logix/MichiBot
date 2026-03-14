'use strict';

const fs = require('fs');
const path = require('path');

function createExtensionManager({ baseDir, logger, buildContext, registerCommand, unregisterCommandsForExtension }) {
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

  async function initializeExtension(extensionKey, extension) {
    if (typeof extension.init === 'function') {
      await extension.init(buildContext());
      logger.log(`Initialized ${extensionKey}`);
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

  async function disposeExtension(runtimeInfo) {
    if (!runtimeInfo || !runtimeInfo.module) {
      return;
    }

    if (typeof runtimeInfo.module.dispose === 'function') {
      try {
        await runtimeInfo.module.dispose(buildContext());
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

      await initializeExtension(extensionKey, extension);
      registerExtensionCommands(extensionKey, extension);

      loadedExtensions.set(extensionKey, {
        extensionKey,
        type,
        fileName,
        fullPath,
        module: extension
      });

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
