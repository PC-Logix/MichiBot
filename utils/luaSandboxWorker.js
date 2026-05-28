'use strict';

const fs = require('fs');
const path = require('path');
const { parentPort, workerData } = require('worker_threads');

let fengari;
try {
  fengari = require('fengari');
} catch (err) {
  parentPort.postMessage({
    type: 'fatal',
    error: `Lua sandbox requires the npm package "fengari". Run: npm install fengari (${err.message})`
  });
}

const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari || {};

const baseDir = workerData?.baseDir || path.resolve(__dirname, '..');
const resourceDir = workerData?.resourceDir || path.join(baseDir, 'resources', 'jnlua');
const maxOutputLength = Number(workerData?.maxOutputLength || 2000);

let L = null;
let output = [];

function readResource(relativePath) {
  return fs.readFileSync(path.join(resourceDir, relativePath), 'utf8');
}

function asLuaString(value) {
  return to_luastring(String(value == null ? '' : value));
}

function stackToString(state) {
  const top = lua.lua_gettop(state);
  if (top <= 0) return '';

  const results = [];
  for (let i = 1; i <= top; i += 1) {
    if (lua.lua_isstring(state, i) || lua.lua_isnumber(state, i)) {
      results.push(to_jsstring(lua.lua_tolstring(state, i)));
    } else if (lua.lua_isboolean(state, i)) {
      results.push(lua.lua_toboolean(state, i) ? 'true' : 'false');
    } else if (lua.lua_isnil(state, i)) {
      results.push(lua.lua_typename(state, lua.lua_type(state, i)));
    } else {
      results.push(lua.lua_typename(state, lua.lua_type(state, i)));
    }
  }

  return results.join(', ');
}

function popError(state) {
  const message = lua.lua_isstring(state, -1)
    ? to_jsstring(lua.lua_tolstring(state, -1))
    : 'Lua error';
  lua.lua_settop(state, 0);
  return message;
}

function luaLiteral(value) {
  if (value == null) return 'nil';

  if (Array.isArray(value)) {
    return `{${value.map(luaLiteral).join(', ')}}`;
  }

  switch (typeof value) {
    case 'number':
      return Number.isFinite(value) ? String(value) : 'nil';
    case 'boolean':
      return value ? 'true' : 'false';
    case 'string':
      return JSON.stringify(value);
    default:
      return JSON.stringify(String(value));
  }
}

function runRaw(script, resultCount = lua.LUA_MULTRET) {
  lua.lua_settop(L, 0);
  const loadStatus = lauxlib.luaL_loadstring(L, asLuaString(script));
  if (loadStatus !== lua.LUA_OK) {
    return popError(L);
  }

  const callStatus = lua.lua_pcall(L, 0, resultCount, 0);
  if (callStatus !== lua.LUA_OK) {
    return popError(L);
  }

  const result = stackToString(L);
  lua.lua_settop(L, 0);
  return result;
}

function runScriptInSandbox(script, context = {}) {
  output = [];

  const prelude = [
    `nick = ${luaLiteral(context.nick || '')}`,
    `target = ${luaLiteral(context.target || '')}`,
    `channel = ${luaLiteral(context.channel || context.target || '')}`,
    `argument = ${luaLiteral(context.argument || '')}`,
    `command = ${luaLiteral(context.command || '')}`,
    `args = ${luaLiteral(Array.isArray(context.args) ? context.args : [])}`
  ].join('\n');

  lua.lua_settop(L, 0);
  lua.lua_getglobal(L, asLuaString('lua'));
  lua.lua_pushstring(L, asLuaString(`${prelude}\n${script}`));

  const callStatus = lua.lua_pcall(L, 1, lua.LUA_MULTRET, 0);
  if (callStatus !== lua.LUA_OK) {
    return popError(L);
  }

  const result = stackToString(L);
  lua.lua_settop(L, 0);

  const combined = [];
  if (result) combined.push(result);
  if (output.length) combined.push(output.join('\n'));

  return combined.join('\n').slice(0, maxOutputLength);
}

function initLua() {
  if (!fengari) return;

  L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  output = [];

  lua.lua_pushjsfunction(L, (state) => {
    output.push(stackToString(state));
    return 0;
  });
  lua.lua_setglobal(L, asLuaString('print'));

  const luasb = readResource('luasb.lua');
  const selene = readResource(path.join('selene', 'init.lua'));
  const sparser = readResource(path.join('selene', 'parser.lua'));

  const bootstrap = runRaw(luasb, 0);
  if (bootstrap) throw new Error(bootstrap);

  runScriptInSandbox(`selene = (function()\n${selene}\nend)()`);
  runScriptInSandbox(`selene.parser = (function()\n${sparser}\nend)()`);
  runScriptInSandbox('selene.load()');
}

function reset() {
  initLua();
  return 'Sandbox reset';
}

if (fengari) {
  try {
    initLua();
    parentPort.postMessage({ type: 'ready' });
  } catch (err) {
    parentPort.postMessage({ type: 'fatal', error: err.message || String(err) });
  }
}

parentPort.on('message', (message) => {
  const id = message?.id;

  try {
    if (message?.type === 'run') {
      const result = runScriptInSandbox(String(message.script || ''), message.context || {});
      parentPort.postMessage({ id, ok: true, result });
      return;
    }

    if (message?.type === 'selene') {
      const snippet = String(message.script || '');
      const parsed = runScriptInSandbox(`return selene.parse([==========[${snippet}]==========])`, message.context || {});
      const result = runScriptInSandbox(parsed, message.context || {});
      parentPort.postMessage({ id, ok: true, result });
      return;
    }

    if (message?.type === 'reset') {
      const result = reset();
      parentPort.postMessage({ id, ok: true, result });
      return;
    }

    parentPort.postMessage({ id, ok: false, error: 'Unknown Lua worker request.' });
  } catch (err) {
    parentPort.postMessage({ id, ok: false, error: err.message || String(err) });
  }
});
