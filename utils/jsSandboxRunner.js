'use strict';

const vm = require('vm');

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  input += chunk;
  if (input.length > 128 * 1024) process.exit(2);
});

function cleanContext(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    nick: String(source.nick || ''),
    target: String(source.target || ''),
    channel: String(source.channel || ''),
    argument: String(source.argument || ''),
    command: String(source.command || ''),
    prefix: String(source.prefix || ''),
    args: Array.isArray(source.args) ? source.args.slice(0, 100).map(item => String(item)) : []
  };
}

function safeResult(value) {
  if (value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'bigint') return `${value}n`;
  try {
    if (value === null || ['number', 'boolean'].includes(typeof value)) return String(value);
    return JSON.stringify(value);
  } catch (_) {
    try {
      return String(value);
    } catch (_) {
      return '[unprintable result]';
    }
  }
}

function run(payload) {
  const script = String(payload?.script || '');
  const timeoutMs = Math.max(50, Math.min(5_000, Number(payload?.timeoutMs || 1_000)));
  const maxOutputLength = Math.max(64, Math.min(8_000, Number(payload?.maxOutputLength || 2_000)));
  const output = [];
  let outputLength = 0;

  const sandbox = Object.create(null);
  Object.defineProperty(sandbox, '__emit', {
    value(value) {
      if (outputLength >= maxOutputLength) return;
      const text = String(value);
      output.push(text.slice(0, maxOutputLength - outputLength));
      outputLength += text.length;
    },
    configurable: true
  });

  const context = vm.createContext(sandbox, {
    name: 'MichiBot JavaScript Sandbox',
    codeGeneration: {
      strings: false,
      wasm: false
    }
  });

  const values = JSON.stringify(cleanContext(payload?.context));
  const bootstrap = new vm.Script(`
    'use strict';
    (() => {
      const emit = globalThis.__emit;
      delete globalThis.__emit;
      const format = value => {
        if (value === undefined) return 'undefined';
        if (typeof value === 'bigint') return String(value) + 'n';
        if (typeof value === 'object' && value !== null) {
          try { return JSON.stringify(value); } catch (_) { return String(value); }
        }
        return String(value);
      };
      const write = (...args) => emit(args.map(format).join(' '));
      globalThis.print = write;
      globalThis.console = Object.freeze({ log: write, info: write, warn: write, error: write });
      const values = JSON.parse(${JSON.stringify(values)});
      for (const key of Object.keys(values)) globalThis[key] = values[key];
    })();
  `);
  bootstrap.runInContext(context, { timeout: timeoutMs });

  const compiled = new vm.Script(`'use strict';\n${script}`, {
    filename: 'irc-snippet.js',
    displayErrors: true
  });
  const result = compiled.runInContext(context, {
    timeout: timeoutMs,
    displayErrors: true,
    breakOnSigint: true
  });

  return (output.length ? output.join('\n') : safeResult(result)).slice(0, maxOutputLength);
}

process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(input || '{}');
    process.stdout.write(JSON.stringify({ ok: true, result: run(payload) }));
  } catch (error) {
    process.stdout.write(JSON.stringify({
      ok: false,
      error: String(error?.message || error || 'JavaScript execution failed').slice(0, 2_000)
    }));
  }
});
