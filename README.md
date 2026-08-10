# MichiBot

**MichiBot** is a modular IRC bot written in Node.js.

It originally started life as a fork of **LanteaBot**, but over time the codebase has been restructured and most of the internals have been rewritten.

The current architecture separates core IRC behavior from plugins and modules, making it easier to extend the bot without touching the main runtime.

---

## Plugin System

Any `.js` file placed in the `plugins/` directory is automatically loaded when the bot starts.

Plugins can also be loaded manually at runtime:

```
!loadplugin <filename>
```

Hot-loading is intended to allow new functionality to be added without restarting the bot.

*(Runtime loading works for plugins only — modules are part of the core system and are not dynamically loaded.)*

---

## Project Layout

```
michibot.js            Bootstrap and application wiring

core/
  logger.js            Shared logging utilities
  capabilities.js      IRC CAP negotiation and tracking
  extensions.js        Plugin/module load + reload lifecycle
  state.js             Account, channel, and WHOIS state helpers
  context.js           Runtime context exposed to plugins/modules
  events.js            IRC event bindings and dispatch
```

---

## Notes

The bot is designed to keep core IRC handling isolated from plugin logic.
Core modules handle connection state, capability negotiation, and event routing, while plugins implement actual features and commands.

The CTCP `VERSION` response can be customized with `version` in `config.json`.
When omitted or blank, it defaults to the repository URL followed by the short
Git commit hash, for example `https://github.com/PC-Logix/MichiBot a3e8dee`.

Modules are loaded as part of the core runtime and are not currently hot-reloadable.

IRC auto-join channels are stored in the legacy SQLite `Channels(name)` table. On a brand-new database, the `channels` array in `config.json` seeds that table once. The `join` and `part` commands then persist changes to SQLite, and reconnects load the current database list.

Legacy `Ops` rows remain global bot administrators, and legacy `Permissions` rows remain scoped to their stored IRC channel. MichiBot reads both tables directly alongside its newer account and Discord permission assignments; it does not copy or replace the legacy rows.

## LanteaBot port status

The active LanteaBot features have been ported to JavaScript, including inventory and combat, potions, dynamic commands, reminders and announcements, GitHub and YouTube expansion, moderation, permissions, Internet Points, RPG data, Lua, and the isolated JavaScript sandbox.

Some Java hook names map to consolidated JavaScript components:

- `Aliases`, `Help`, and `Stats` are provided by the admin and web systems.
- `Calc` is handled by the `dice` command and its `calc` alias.
- `DrinkPotion` is implemented by `plugins/Potions.js`.
- `GenericEventListener` and `OnPrivateMessage` are represented by core event handling and SASL authentication.
- `JNLuaSandbox` and `PermissionsHook` are implemented by the Lua and permission services.
- `NetSplitDetect` was empty and has no ported behavior.

The intentionally retired integrations are GeoIP, Minecraft server information/status, search providers, translation, Twitter, and Wolfram Alpha.

The JavaScript sandbox requires Node.js 22 or newer. Each snippet runs in a fresh permission-restricted child process with time, memory, output, and code-generation limits. Configure it with `jsSandbox` in `config.json`.

## RPG story packs

The optional RPG is a persistent, multiplayer IRC-friendly MUD. Its rooms, exits, descriptions, encounter tables, monsters, shared discoveries, and map text are defined by JSON story packs in `resources/rpg/stories/`. Copy `crossroads.json`, give the file and its `id` a new matching name, and edit the world without changing JavaScript.

Players share discoverable chests, caches, lockers, and shrines. Use `rpg search` to claim an available find; `rpg look` shows whether another player has used it and how long remains before its JSON-defined cooldown expires. Player locations are also shared through `rpg who`, while combat encounters remain personal to each character.

Discord and IRC identities can be linked without an administrator. Run `claim` with no arguments from Discord to receive a public, ten-minute code, then run `claim <code>` while authenticated to the desired IRC account. The linked identities share permissions, RPG progress, ordinary-chat XP, and Internet Points, with the IRC account serving as the canonical data identity.

Select the initial pack with `rpg.story` in `config.json` or the `MICHIBOT_RPG_STORY` environment variable. While the bot is running, an admin can use `rpg story <id>` to switch packs or `rpg reloadstory` after editing the active JSON. Switching stories sends each player to the new entrance on their next RPG command while preserving character stats, XP, gold, and victories.

When RPG is enabled in a channel, ordinary conversation also grants character XP. By default, a user can receive `0.25` XP once per minute for a non-command message containing at least three visible characters. Private messages and bot commands do not count. Configure this with `rpg.activity` in `config.json`.
