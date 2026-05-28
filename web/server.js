'use strict';

const path = require('path');
const express = require('express');
const data = require('./data');

function normalizeWebConfig(config) {
  const http = config.http || {};
  return {
    enabled: http.enabled !== false && config.httpdEnabled !== false,
    host: http.host || config.httpdHost || '0.0.0.0',
    port: Number(http.port || config.httpdPort || config.httpdport || process.env.PORT || 8080),
    baseDomain: http.baseDomain || config.httpdBaseDomain || ''
  };
}

function cleanMountPath(mountPath) {
  const raw = String(mountPath || '').trim();
  if (!raw) return '/';
  return raw.startsWith('/') ? raw : `/${raw}`;
}

function createWebServer({
  baseDir,
  config,
  logger,
  commandRegistry,
  aliasRegistry,
  prefixRef
}) {
  const webConfig = normalizeWebConfig(config || {});
  const app = express();
  const pluginRouter = express.Router();
  const registeredRoutes = [];

  app.disable('x-powered-by');
  app.set('view engine', 'ejs');
  app.set('views', path.join(baseDir, 'views'));

  app.use(express.urlencoded({
    extended: true
  }));
  app.use(express.json({
    limit: '1mb'
  }));

  app.use('/static', express.static(path.join(baseDir, 'public'), {
    maxAge: '1h'
  }));

  app.use((req, res, next) => {
    res.locals.botNick = config.userName || config.nick || 'MichiBot';
    res.locals.prefix = prefixRef?.get ? prefixRef.get() : (config.commandPrefix || '#');
    res.locals.nav = data.getNav();
    res.locals.baseDomain = webConfig.baseDomain;
    res.locals.currentPath = req.path;
    res.locals.query = req.query || {};
    res.locals.webRoutes = registeredRoutes.slice();
    next();
  });

  app.get('/', (req, res) => {
    res.render('index', {
      title: 'Index',
      status: data.getStatus()
    });
  });

  app.get('/help', (req, res) => {
    res.render('help', {
      title: 'Help',
      commands: data.getCommandHelp(commandRegistry, res.locals.prefix, aliasRegistry)
    });
  });

  app.get('/quotes', (req, res) => {
    res.render('quotes', {
      title: 'Quotes',
      quotes: data.getQuotes({
        id: req.query.id,
        user: req.query.user,
        q: req.query.q,
        page: req.query.page
      })
    });
  });

  app.get('/tonk', (req, res) => {
    res.render('tonk', {
      title: 'Tonk Leaders',
      meta: data.getTonkMeta(res.locals.prefix),
      rows: data.getTonkRows()
    });
  });

  app.get('/whopinged', (req, res) => {
    res.render('whopinged', {
      title: 'WhoPinged',
      pings: data.getPings({
        nick: req.query.nick,
        page: req.query.page
      })
    });
  });

  app.get('/stats', (req, res) => {
    res.render('stats', {
      title: 'Stats',
      groups: data.getStatsGrouped()
    });
  });

  app.get('/inventory', (req, res) => {
    res.render('inventory', {
      title: 'Inventory',
      inventory: data.getInventory({
        owner: req.query.owner,
        q: req.query.q,
        page: req.query.page
      })
    });
  });


  // Plugin-owned web handlers are mounted here.  This intentionally sits after
  // core pages and before the 404 handler, mirroring LanteaBot's "httpd hands a
  // path to the owning plugin" design.
  app.use(pluginRouter);

  app.use((req, res) => {
    res.status(404).render('error', {
      title: 'Not Found',
      statusCode: 404,
      message: 'That page does not exist.'
    });
  });

  app.use((err, req, res, next) => {
    if (logger && typeof logger.error === 'function') {
      logger.error('[web] request failed:', err);
    }

    if (res.headersSent) return next(err);

    res.status(500).render('error', {
      title: 'Server Error',
      statusCode: 500,
      message: err && err.message ? err.message : 'Something broke.'
    });
  });

  let server = null;

  function routeExists(extensionKey, mountPath) {
    return registeredRoutes.some(route => route.extensionKey === extensionKey && route.mountPath === mountPath);
  }

  function registerRouter(extensionKey, mountPath, router, options = {}) {
    const cleanPath = cleanMountPath(mountPath);
    const key = String(extensionKey || options.extensionKey || 'runtime');

    if (!router || typeof router !== 'function') {
      throw new Error(`Invalid router for ${key} at ${cleanPath}`);
    }

    if (routeExists(key, cleanPath)) {
      if (logger && typeof logger.warn === 'function') {
        logger.warn(`[web] route ${cleanPath} from ${key} is already registered; skipping duplicate`);
      }
      return {
        ok: false,
        message: `Route ${cleanPath} is already registered for ${key}`
      };
    }

    pluginRouter.use(cleanPath, router);
    registeredRoutes.push({
      extensionKey: key,
      mountPath: cleanPath,
      label: options.label || cleanPath
    });

    if (logger && typeof logger.log === 'function') {
      logger.log(`[web] registered ${cleanPath} from ${key}`);
    }

    return {
      ok: true,
      message: `Registered ${cleanPath}`
    };
  }

  function registerRoute(extensionKey, method, routePath, handler, options = {}) {
    const router = express.Router();
    const verb = String(method || 'get').toLowerCase();
    if (typeof router[verb] !== 'function') {
      throw new Error(`Unsupported HTTP method: ${method}`);
    }

    router[verb]('/', handler);
    return registerRouter(extensionKey, routePath, router, options);
  }

  function unregisterRoutesForExtension(extensionKey) {
    // Express does not expose a clean public route-removal API.  We keep route
    // registration startup-safe and duplicate-safe, but runtime unload/reload may
    // require a bot restart for web route changes to disappear fully.
    const key = String(extensionKey || '');
    const before = registeredRoutes.length;
    for (let i = registeredRoutes.length - 1; i >= 0; i -= 1) {
      if (registeredRoutes[i].extensionKey === key) {
        registeredRoutes.splice(i, 1);
      }
    }
    return before - registeredRoutes.length;
  }

  function buildPluginContext(extra = {}) {
    return {
      app,
      express,
      web: api,
      data,
      baseDir,
      config,
      logger,
      commandRegistry,
      prefixRef,
      ...extra
    };
  }

  function start() {
    if (!webConfig.enabled) {
      if (logger && typeof logger.log === 'function') logger.log('[web] disabled by config');
      return null;
    }

    if (server) return server;

    server = app.listen(webConfig.port, webConfig.host, () => {
      if (logger && typeof logger.log === 'function') {
        logger.log(`[web] listening on ${webConfig.host}:${webConfig.port}`);
      }
    });

    return server;
  }

  function stop() {
    if (!server) return;
    server.close();
    server = null;
  }

  const api = {
    app,
    express,
    registerRouter,
    registerRoute,
    unregisterRoutesForExtension,
    buildPluginContext,
    getRegisteredRoutes() {
      return registeredRoutes.slice();
    },
    start,
    stop,
    get server() {
      return server;
    }
  };

  return api;
}

module.exports = {
  createWebServer,
  normalizeWebConfig
};
