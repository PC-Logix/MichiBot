'use strict';

const vm = require('vm');
const { getDb, tableExists } = require('../libs/db');
const { say, act, text, pick } = require('../utils/helper');
const { runLuaSnippet } = require('../utils/luaSandbox');

const TRUSTED = {
  globalRank: 'Trusted'
};

const ADMIN = {
  globalRank: 'Admin'
};

const DEFAULT_HELP = 'Dynamic command with no help text set.';
const MAX_ALIAS_DEPTH = 10;
const MAX_MESSAGE_LENGTH = 420;
const RESERVED_COMMANDS = new Set(['command', 'dyncmd']);

let extensionKey = 'plugins:DynamicCommands.js';
let botContext = null;
let dynamicCommandNames = new Set();

function db() {
  const d = getDb();
  d.exec(`
    CREATE TABLE IF NOT EXISTS Commands (
      command STRING UNIQUE PRIMARY KEY,
      return_value TEXT,
      help STRING DEFAULT NULL
    );
  `);

  // Old versions briefly used a column named `return`.  Current LanteaBot DBs
  // use return_value, but keep this migration here so odd local copies still run.
  const cols = d.prepare('PRAGMA table_info(Commands)').all().map(row => row.name);
  if (cols.includes('return') && !cols.includes('return_value')) {
    d.exec(`
      ALTER TABLE Commands RENAME TO Commands_legacy_return;
      CREATE TABLE Commands (
        command STRING UNIQUE PRIMARY KEY,
        return_value TEXT,
        help STRING DEFAULT NULL
      );
      INSERT OR REPLACE INTO Commands(command, return_value, help)
      SELECT command, "return", help FROM Commands_legacy_return;
      DROP TABLE Commands_legacy_return;
    `);
  } else if (!cols.includes('help')) {
    d.exec('ALTER TABLE Commands ADD COLUMN help STRING DEFAULT NULL;');
  }

  return d;
}

function normalizeCommand(value) {
  return String(value || '')
    .trim()
    .replace(/^#+/, '')
    .toLowerCase();
}

function allCommands() {
  return db().prepare(`
    SELECT command, return_value, help
    FROM Commands
    ORDER BY lower(command) ASC
  `).all();
}

function searchCommands({ q = '', page = 1, pageSize = 100 } = {}) {
  const where = [];
  const params = [];

  if (q) {
    where.push('(LOWER(command) LIKE LOWER(?) OR LOWER(COALESCE(help, \'\')) LIKE LOWER(?) OR LOWER(COALESCE(return_value, \'\')) LIKE LOWER(?))');
    const needle = `%${String(q)}%`;
    params.push(needle, needle, needle);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const count = db().prepare(`SELECT COUNT(*) AS count FROM Commands ${whereSql}`).get(...params).count;
  const pages = Math.max(1, Math.ceil(count / pageSize));
  const safePage = Math.min(Math.max(1, Number(page) || 1), pages);
  const offset = (safePage - 1) * pageSize;

  const rows = db().prepare(`
    SELECT command, return_value, help
    FROM Commands
    ${whereSql}
    ORDER BY lower(command) ASC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset);

  return {
    rows,
    count,
    page: safePage,
    pageSize,
    pages,
    q: String(q || '')
  };
}

function getCommand(command) {
  const name = normalizeCommand(command);
  if (!name) return null;
  return db().prepare(`
    SELECT command, return_value, help
    FROM Commands
    WHERE lower(command) = lower(?)
    LIMIT 1
  `).get(name) || null;
}

function saveCommand(command, returnValue, help = null) {
  const name = normalizeCommand(command);
  if (!name) throw new Error('No command provided');

  db().prepare(`
    INSERT INTO Commands(command, return_value, help)
    VALUES (?, ?, ?)
    ON CONFLICT(command) DO UPDATE SET
      return_value = excluded.return_value,
      help = COALESCE(excluded.help, Commands.help)
  `).run(name, String(returnValue || ''), help == null ? null : String(help));

  return getCommand(name);
}

function setCommandHelp(command, help) {
  const name = normalizeCommand(command);
  const existing = getCommand(name);
  if (!existing) return false;

  db().prepare('UPDATE Commands SET help = ? WHERE lower(command) = lower(?)')
    .run(String(help || ''), name);
  return true;
}

function deleteCommand(command) {
  const name = normalizeCommand(command);
  if (!name) return false;

  const result = db().prepare('DELETE FROM Commands WHERE lower(command) = lower(?)').run(name);
  return result.changes > 0;
}

function randomInventoryItem() {
  try {
    if (!tableExists(db(), 'Inventory')) return null;
    const rows = db().prepare(`
      SELECT item_name
      FROM Inventory
      WHERE item_name IS NOT NULL AND TRIM(item_name) <> ''
    `).all();

    if (!rows.length) return null;
    return pick(rows).item_name;
  } catch (_) {
    return null;
  }
}

function dramaParse() {
  const options = [
    'the drama llama has arrived',
    'somehow this is probably Lizzy\'s fault',
    'there was much wailing and gnashing of teeth',
    'a tiny argument became everybody\'s problem',
    'the channel collectively made poor decisions'
  ];
  return pick(options);
}

function runJavaScript(code) {
  const output = [];
  const sandbox = {
    console: {
      log(...args) {
        output.push(args.map(value => String(value)).join(' '));
      }
    },
    print(...args) {
      output.push(args.map(value => String(value)).join(' '));
    },
    Math,
    Date,
    JSON,
    String,
    Number,
    Boolean,
    Array,
    Object,
    RegExp
  };

  try {
    const result = vm.runInNewContext(String(code || ''), sandbox, {
      timeout: 1000,
      displayErrors: false
    });

    if (output.length) return output.join(' | ');
    if (result == null) return '';
    return String(result).replace(/\r/g, '').replace(/\n/g, ' | ');
  } catch (err) {
    return err && err.message ? err.message : 'Script failed';
  }
}

function extractAliases(message) {
  const aliases = [];
  const cleaned = String(message || '').replace(/%(\w*?)%/g, (full, name) => {
    const command = normalizeCommand(name);
    if (command) aliases.push(command);
    return '';
  });

  return {
    aliases,
    cleaned
  };
}

function replaceMessageFormatArgs(message, args) {
  return String(message || '').replace(/\{(\d+)\}/g, (full, index) => {
    const i = Number(index);
    return args[i] == null ? full : String(args[i]);
  });
}

function pluralizeLegacyRandomText(count, text) {
  const raw = String(text || '').trim();

  if (count === 1) {
    return raw;
  }

  // Legacy convenience: "{r:1-200:little bug}" becomes "little bugs"
  if (/\bbug$/i.test(raw)) {
    return raw.replace(/\bbug$/i, 'bugs');
  }

  if (/\bperson$/i.test(raw)) {
    return raw.replace(/\bperson$/i, 'people');
  }

  if (/[sxz]$/i.test(raw) || /(ch|sh)$/i.test(raw)) {
    return `${raw}es`;
  }

  if (/[^aeiou]y$/i.test(raw)) {
    return raw.replace(/y$/i, 'ies');
  }

  return `${raw}s`;
}

function replaceLegacyRandomRanges(value) {
  return String(value || '').replace(
    /\{r:\s*(-?\d+)\s*-\s*(-?\d+)\s*:\s*([^}]+)\}/gi,
    (match, minRaw, maxRaw, labelRaw) => {
      let min = Number.parseInt(minRaw, 10);
      let max = Number.parseInt(maxRaw, 10);

      if (!Number.isFinite(min) || !Number.isFinite(max)) {
        return match;
      }

      if (max < min) {
        const tmp = min;
        min = max;
        max = tmp;
      }

      const count = Math.floor(Math.random() * (max - min + 1)) + min;
      const label = pluralizeLegacyRandomText(count, labelRaw);

      return `${count} ${label}`;
    }
  );
}

async function parsePlaceholders(message, ctx, args) {
  let out = String(message || '');
  const argumentString = args.join(' ');
  
  out = replaceLegacyRandomRanges(out);
  out = out.replace(/\[randomitem\]/gi, () => randomInventoryItem() || 'something');
  out = out.replace(/\[drama\]/gi, () => dramaParse());
  out = out.replace(/\[argument\]/gi, argumentString);
  out = out.replace(/\[nick\]/gi, ctx.nick || 'someone');
  out = replaceMessageFormatArgs(out, args);

  const luaContext = {
    nick: ctx.nick,
    target: ctx.to,
    channel: ctx.isPrivate ? '' : ctx.to,
    argument: argumentString,
    args,
    command: ctx.command,
    prefix: ctx.prefix
  };

  const luaOptions = {
    baseDir: ctx.baseDir,
    timeoutMs: Number(ctx.config?.luaSandbox?.timeoutMs || 3500),
    maxLength: MAX_MESSAGE_LENGTH,
    maxOutputLength: Number(ctx.config?.luaSandbox?.maxOutputLength || 2000)
  };

  if (/^\[js\]/i.test(out)) {
    out = runJavaScript(out.replace(/^\[js\]/i, '').trim());
  } else if (/^\[lua\]/i.test(out)) {
    try {
      out = await runLuaSnippet(
        out.replace(/^\[lua\]/i, '').trim(),
        luaContext,
        luaOptions
      );
    } catch (err) {
      out = err.message || String(err);
    }
  } else if (/^%lua\b/i.test(out)) {
    try {
      out = await runLuaSnippet(
        out.replace(/^%lua\b/i, '').trim(),
        luaContext,
        luaOptions
      );
    } catch (err) {
      out = err.message || String(err);
    }
  }

  return out;
}

function trimForIrc(message) {
  const str = String(message || '').replace(/\r/g, '').replace(/\n/g, ' | ').trim();
  if (str.length <= MAX_MESSAGE_LENGTH) return str;
  return `${str.slice(0, MAX_MESSAGE_LENGTH - 3)}...`;
}

function registerRuntimeCommand(commandName, row = null) {
  const name = normalizeCommand(commandName);
  if (!name || dynamicCommandNames.has(name) || RESERVED_COMMANDS.has(name)) return false;

  if (botContext?.commands?.has(name)) {
    return false;
  }

  const registered = botContext.commands.register({
    name,
    access: {
      public: true
    },
    help: row?.help || DEFAULT_HELP
  }, async (ctx) => {
    await executeDynamicCommand(ctx, name, ctx.args || []);
  }, extensionKey);

  if (!registered) return false;

  dynamicCommandNames.add(name);
  return true;
}

function unregisterRuntimeCommand(commandName) {
  const name = normalizeCommand(commandName);
  if (!name || !dynamicCommandNames.has(name)) return false;

  if (botContext?.commands?.unregister) {
    botContext.commands.unregister(name, extensionKey);
  }

  dynamicCommandNames.delete(name);
  return true;
}

function reloadRuntimeCommand(commandName) {
  unregisterRuntimeCommand(commandName);
  const row = getCommand(commandName);
  if (row) registerRuntimeCommand(row.command, row);
}

function registerAllDynamicCommands() {
  let registered = 0;
  for (const row of allCommands()) {
    if (registerRuntimeCommand(row.command, row)) registered += 1;
  }
  return registered;
}

async function executeDynamicCommand(ctx, commandName, args, seen = new Set(), depth = 0) {
  const command = normalizeCommand(commandName);
  if (!command || seen.has(command) || depth > MAX_ALIAS_DEPTH) return;

  const row = getCommand(command);
  if (!row) return;

  seen.add(command);

  const extracted = extractAliases(row.return_value || '');
  let message = await parsePlaceholders(extracted.cleaned, ctx, args || []);
  message = trimForIrc(message);

  if (message.replace(/\s+/g, '') !== '') {
    if (/^\[action\]/i.test(message)) {
      act(ctx, message.replace(/^\[action\]/i, '').trim());
    } else {
      say(ctx, message);
    }
  }

  for (const alias of extracted.aliases) {
    if (!seen.has(alias)) {
      await executeDynamicCommand(ctx, alias, args || [], seen, depth + 1);
    }
  }
}

function splitCommandContent(ctx) {
  const parts = String(text(ctx) || '').trim().split(/\s+/);
  const sub = normalizeCommand(parts.shift());
  return {
    sub,
    rest: parts.join(' ').trim()
  };
}

function splitFirstWord(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\S+)(?:\s+([\s\S]+))?$/);
  if (!match) return ['', ''];
  return [match[1], match[2] || ''];
}

function redirectWithMessage(res, path, message) {
  const sep = path.includes('?') ? '&' : '?';
  res.redirect(`${path}${sep}message=${encodeURIComponent(message)}`);
}

const commands = [
  {
    name: 'dyncmd',
    access: TRUSTED,
    cooldown: { seconds: 10 }
  },
  {
    name: 'command',
    access: TRUSTED
  }
];

module.exports = {
  name: 'DynamicCommands',
  commands,

  init(ctx) {
    extensionKey = ctx.extension?.key || extensionKey;
    botContext = ctx;
    const registered = registerAllDynamicCommands();
    console.log(`[DynamicCommands] initialized; registered ${registered} dynamic command(s)`);
  },

  dispose() {
    for (const name of Array.from(dynamicCommandNames)) {
      unregisterRuntimeCommand(name);
    }
    dynamicCommandNames = new Set();
  },

  registerWeb(ctx) {
    const router = ctx.express.Router();

    router.get('/', (req, res) => {
      res.render('dyncmds/index', {
        title: 'Dynamic Commands',
        result: searchCommands({
          q: req.query.q,
          page: req.query.page
        }),
        selected: req.query.command ? getCommand(req.query.command) : null,
        message: req.query.message || '',
        defaultHelp: DEFAULT_HELP
      });
    });
  },

  async handleCommand(ctx) {
    if (ctx.command === 'dyncmd') {
      const arg = normalizeCommand(ctx.args?.[0]);
      if (arg === 'enable' || arg === 'disable') {
        return say(ctx, `Dynamic command channel toggles are not ported yet; dynamic commands are currently globally enabled.`);
      }
      return say(ctx, 'Dynamic commands are enabled globally. Use #command placeholders for syntax help.');
    }

    const { sub, rest } = splitCommandContent(ctx);

    switch (sub) {
      case 'add': {
        const [cmd, content] = splitFirstWord(rest);
        const name = normalizeCommand(cmd);
        if (!name || !content) return say(ctx, `Usage: ${ctx.prefix}command add <command> <content>`);
        if (getCommand(name) || RESERVED_COMMANDS.has(name) || botContext?.commands?.has(name)) return say(ctx, "Can't override existing commands.");

        saveCommand(name, content, null);
        registerRuntimeCommand(name, getCommand(name));
        return say(ctx, `Command Added! Don't forget to set help text with ${ctx.prefix}command addhelp!`);
      }

      case 'del':
      case 'delete':
      case 'rem':
      case 'remove': {
        const [cmd] = splitFirstWord(rest);
        const name = normalizeCommand(cmd);
        if (!name) return say(ctx, `Usage: ${ctx.prefix}command del <command>`);
        if (!deleteCommand(name)) return say(ctx, `Unable to find command '${name}'`);
        unregisterRuntimeCommand(name);
        return say(ctx, 'Command deleted');
      }

      case 'addhelp':
      case 'sethelp':
      case 'help': {
        const [cmd, help] = splitFirstWord(rest);
        const name = normalizeCommand(cmd);
        if (!name || !help) return say(ctx, `Usage: ${ctx.prefix}command addhelp <command> <text>`);
        if (!setCommandHelp(name, help)) return say(ctx, 'fail 2');
        reloadRuntimeCommand(name);
        return say(ctx, 'Help Set');
      }

      case 'print': {
        const [cmd] = splitFirstWord(rest);
        const name = normalizeCommand(cmd);
        if (!name) return say(ctx, `Usage: ${ctx.prefix}command print <command>`);
        const row = getCommand(name);
        if (!row) return say(ctx, `Unable to find command '${name}'`);
        say(ctx, row.return_value || '');
        if (!dynamicCommandNames.has(name)) say(ctx, 'Command is not registered!');
        return;
      }

      case 'edit':
      case 'update':
      case 'change':
      case 'set': {
        const [cmd, content] = splitFirstWord(rest);
        const name = normalizeCommand(cmd);
        if (!name || !content) return say(ctx, `Usage: ${ctx.prefix}command edit <command> <content>`);
        if (!getCommand(name)) return say(ctx, "Can't add new commands with edit!");
        saveCommand(name, content, null);
        reloadRuntimeCommand(name);
        return say(ctx, 'Command Edited');
      }

      case 'alias':
        return say(ctx, 'To add an alias create a dynamic command with one or more commands to execute between two % like %command%.');

      case 'placeholders':
        return say(ctx, "Valid placeholders: %command% - Where 'command' is a different dyn-command. [randomitem] - Inserts a random item from the inventory. [drama] - ??. [argument] - The entire argument string. [nick] - The name of the caller. {n} - Where n is the number of an argument word starting at 0.");

      case 'prefixes':
        return say(ctx, 'Valid prefixes: [js] - Attempts to parse the dyn-command contents as javascript. [lua] - Runs the dyn-command contents through the Lua sandbox. [action] - Sends an ACTION instead of a normal message.');

      case 'list': {
        const names = allCommands().map(row => row.command);
        return say(ctx, `Dynamic commands: ${names.join(', ') || '(none)'}`);
      }

      default:
        return say(ctx, `Usage: ${ctx.prefix}command <add|del|addhelp|print|edit|list|alias|placeholders|prefixes>`);
    }
  },

  _private: {
    allCommands,
    getCommand,
    searchCommands,
    parsePlaceholders,
    extractAliases
  }
};
