'use strict';

const { getDb } = require('../libs/db');
const { IRC_RESET, randInt, pick } = require('../utils/helper');

const MAX_ITEM_NAME_LENGTH = 70;
const FAVOURITE_CHANCE = 0.01;

const REMOVE_OK = 0;
const ERROR_ITEM_IS_FAVOURITE = 1;
const ERROR_INVALID_STATEMENT = 2;
const ERROR_SQL_ERROR = 3;
const ERROR_NO_ROWS_RETURNED = 4;
const ERROR_ID_NOT_SET = 5;
const ERROR_ITEM_IS_PRESERVED = 6;

const ITEM_COLUMNS = [
  'id',
  'item_name',
  'uses_left',
  'is_favourite',
  'added_by',
  'added',
  'owner',
  'cursed'
].join(', ');

const BREAK_STRINGS = [
  '{item} poofs away in a sparkly cloud.',
  '{item} vanishes into a rift in space.',
  '{item} phases out of the dimension.',
  '{item} flickers and pops out of existence.',
  '{item} suddenly ceases to be.',
  '{item} ruptures and deflates.',
  '{item} melts into a puddle of unidentifiable goo.',
  '{item} rides off into the sunset on a horse with no name.',
  '{item} flies up into space and collides with a satellite.',
  '{item} falls into a chasm.',
  '{item} is eaten by a Grue.',
  '{item} sinks into quicksand.',
  '{item} vibrates into the ground.',
  '{item} gets lost in the woods and is never seen again.',
  "{item} flies into space and doesn't come back.",
  '{item} angered a witch and was turned into a toad.',
  '{item} took the red pill and exited the matrix.',
  '{item} took the blue pill and fell asleep.',
  '{item} was taken out by the mafia.',
  '{item} was loaned out to a friend and was never returned.',
  '{item} looked too much like a carrot and was eaten by a near-sighted bunny.',
  '{item} got into a fight with bigfoot and lost.',
  '{item} looked too much like a tooth and was claimed by the tooth-fairy.',
  '{item} looked into the void and was consumed.',
  '{item} fell into a vat of radioactive goo.',
  "{item} returned to it's original reality.",
  '{item} met the Doctor and went on numerous adventures through time and space.',
  '{item} met a Pikachu and was shocked.',
  "{item} was caught by Ash, gotta catch 'em all!",
  "{item} was claimed by a dragon and added to it's hoard.",
  '{item} miscalculated and teleported into space.',
  '{item} suddenly collapses into a singularity.',
  "{item} angered a gnome and didn't get away in time.",
  "{item} angered a gnome and didn't put up enough of a fight.",
  '{item} angered a fairy and was turned into a pie.',
  '{item} angered a dragon and was incinerated.',
  '{item} angered a unicorn and was pierced.',
  '{item} returned a DoesNotExistException.',
  '{item} ran out of memory.',
  '{item} tried to report a bug with no log and mysteriously vanished.',
  '{item} experienced a segfault.',
  '{item} was needed in a different plane of existence.',
  'an adventurer came by and claimed {item} was the artifact they were looking for to save their village.',
  'a bug was found in {item} and it was decommissioned.',
  '{item} was suddenly outlawed and confiscated by the MIB.',
  'it turns out {item} reacts poorly to acid.',
  "evidence of {item}'s poor resistance to corrosive chemicals is abundantly clear.",
  "{item} received a call it had won a million money, it wasn't seen again.",
  '{item} was shiny enough to be claimed by a dragon.',
  "if {item} had been less shiny it might not have attracted the attention of a dragon.",
  "turns out {item}'s weakness was common water all along!",
  "{item} didn't have an immunity to the common cold!",
  '{item} melted in the sun...',
  "right as {item} was at it's prime, reality caught up with it.",
  '{item} suddenly realized it had somewhere else to be!',
  "for all of {item}'s flaws, it's biggest was that it no longer exists.",
  "now you see {item}, now you don't!",
  '{item} ascended to a higher plane.',
  '{item} fell into a well that appeared out of nowhere!',
  "a cryptobro comes by and decides {item}coin is their whole personality, tanking it's value."
];

function db() {
  return getDb();
}

function ensureSchema() {
  const database = db();
  database.exec(`
    CREATE TABLE IF NOT EXISTS Inventory (
      id INTEGER PRIMARY KEY,
      item_name,
      uses_left INTEGER,
      is_favourite BOOLEAN DEFAULT 0,
      added_by VARCHAR(255) DEFAULT '',
      added INT DEFAULT NULL,
      owner VARCHAR(255) DEFAULT NULL,
      cursed BOOLEAN DEFAULT 0
    )
  `);

  const columns = new Set(
    database.prepare('PRAGMA table_info(Inventory)').all().map(row => row.name)
  );
  const migrations = [
    ['is_favourite', 'ALTER TABLE Inventory ADD COLUMN is_favourite BOOLEAN DEFAULT 0'],
    ['added_by', "ALTER TABLE Inventory ADD COLUMN added_by VARCHAR(255) DEFAULT ''"],
    ['added', 'ALTER TABLE Inventory ADD COLUMN added INT DEFAULT NULL'],
    ['owner', 'ALTER TABLE Inventory ADD COLUMN owner VARCHAR(255) DEFAULT NULL'],
    ['cursed', 'ALTER TABLE Inventory ADD COLUMN cursed BOOLEAN DEFAULT 0']
  ];

  for (const [column, sql] of migrations) {
    if (!columns.has(column)) database.exec(sql);
  }
}

function escapeHtml4(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function unescapeHtml4(value) {
  return String(value ?? '')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&gt;/gi, '>')
    .replace(/&lt;/gi, '<')
    .replace(/&amp;/gi, '&');
}

function fixItemName(value, sortOutPrefixes = false, noPrefix = false) {
  let item = String(value ?? '');
  let foundPrefix = false;

  if (sortOutPrefixes) {
    const replaced = item.replace(/^\s*(?:the|an|a)\s+/i, '');
    foundPrefix = replaced !== item;
    item = replaced;
  }

  return `${foundPrefix && !noPrefix ? 'the ' : ''}${unescapeHtml4(item)}`;
}

function getUsesFromName(value) {
  const name = String(value ?? '');
  const lengthPenalty = Math.floor(name.length / 20);
  const actualPenalty = lengthPenalty < 1 ? 5 - Math.floor(lengthPenalty * 5) : -Math.floor(lengthPenalty);
  return Math.max(1, randInt(1, 4) + actualPenalty);
}

function getUsesIndicator(uses) {
  if (uses >= 1 && uses <= 3) return 'This seems rather fragile...';
  if (uses >= 4 && uses <= 7) return 'I could get some good swings in with this.';
  if (uses >= 8 && uses <= 10) return 'This seems very sturdy.';
  return 'Is this indestructible?';
}

function getItemBreakString(item, includeEndPunctuation = false) {
  let sentence = pick(BREAK_STRINGS).replace(/\{item\}/g, String(item ?? ''));
  if (!includeEndPunctuation) sentence = sentence.replace(/[!.?]{1,3}$/, '');
  return sentence;
}

function getInventorySize() {
  ensureSchema();
  return Number(db().prepare('SELECT COUNT(*) AS count FROM Inventory').get().count || 0);
}

class InventoryItem {
  constructor(row = {}) {
    this.id = Number(row.id || 0);
    this.name = row.item_name == null ? null : String(row.item_name);
    this.usesLeft = Number(row.uses_left || 0);
    this.isFavourite = !!row.is_favourite;
    this.addedBy = row.added_by == null ? '' : String(row.added_by);
    this.added = Number(row.added || 0);
    this.owner = row.owner == null ? null : String(row.owner);
    this.cursed = !!row.cursed;
  }

  getName(sortOutPrefixes = false) {
    if (this.name == null) return 'null';
    return fixItemName(this.name, sortOutPrefixes);
  }

  getNameWithoutPrefix() {
    if (this.name == null) return 'null';
    return fixItemName(this.name, true, true);
  }

  getNameRaw() {
    return this.name;
  }

  getUsesLeftVague() {
    return getUsesIndicator(this.usesLeft);
  }

  getDiceSizeFromItemName() {
    return InventoryItem.getDiceSizeFromItemName(this.name || '');
  }

  addUses(uses) {
    this.usesLeft += Number(uses || 0);
    ensureSchema();
    db().prepare('UPDATE Inventory SET uses_left = ? WHERE id = ?').run(this.usesLeft, this.id);
  }

  incrementUses() {
    this.addUses(1);
  }

  damage(amount = 1, includeLeadingComma = true, capitalizeFirstWord = false, includeEndPunctuation = false) {
    if (this.usesLeft === -1) return '';

    this.usesLeft -= Number(amount || 0);
    const inventorySizePenalty = Math.floor(getInventorySize() / 15);
    if ((this.usesLeft - inventorySizePenalty) <= 0) {
      const result = removeItem(this.id);
      if (result === REMOVE_OK) {
        let sentence = getItemBreakString(fixItemName(this.name, true), includeEndPunctuation);
        if (capitalizeFirstWord && sentence) {
          sentence = sentence.charAt(0).toUpperCase() + sentence.slice(1);
        }
        return `${includeLeadingComma ? ', ' : ''}${sentence}`;
      }
    } else {
      db().prepare('UPDATE Inventory SET uses_left = ? WHERE id = ?').run(this.usesLeft, this.id);
    }
    return '';
  }

  decrementUses(includeLeadingComma = true, capitalizeFirstWord = false, includeEndPunctuation = false) {
    return this.damage(1, includeLeadingComma, capitalizeFirstWord, includeEndPunctuation);
  }

  destroy(includeLeadingComma = true, capitalizeFirstWord = false, includeEndPunctuation = true) {
    return this.damage(999, includeLeadingComma, capitalizeFirstWord, includeEndPunctuation);
  }

  remove() {
    return removeItem(this.id);
  }

  static getDiceSizeFromItemName(value) {
    const diceSize = Math.floor((String(value ?? '').length / MAX_ITEM_NAME_LENGTH) * 6) * 2;
    return Math.max(4, diceSize);
  }
}

function itemFromRow(row) {
  return row ? new InventoryItem(row) : null;
}

function createLooseItem(name, botNick = '') {
  return new InventoryItem({
    id: 0,
    item_name: String(name ?? ''),
    uses_left: getUsesFromName(name),
    is_favourite: 0,
    added_by: '',
    added: Date.now(),
    owner: botNick || null,
    cursed: 0
  });
}

function getItemById(id) {
  ensureSchema();
  return itemFromRow(db().prepare(`SELECT ${ITEM_COLUMNS} FROM Inventory WHERE id = ?`).get(Number(id)));
}

function getItemByName(name) {
  ensureSchema();
  return itemFromRow(db().prepare(`SELECT ${ITEM_COLUMNS} FROM Inventory WHERE item_name = ?`).get(String(name ?? '')));
}

function getFavouriteItem() {
  ensureSchema();
  return itemFromRow(db().prepare(`SELECT ${ITEM_COLUMNS} FROM Inventory WHERE is_favourite = 1 LIMIT 1`).get());
}

function getItems() {
  ensureSchema();
  return db().prepare(`SELECT ${ITEM_COLUMNS} FROM Inventory`).all().map(itemFromRow);
}

function getRandomItem(canBeFavourite = true, ownerIsNull = false) {
  ensureSchema();
  const where = [];
  if (!canBeFavourite) where.push('is_favourite IS 0');
  if (ownerIsNull) where.push('owner IS NULL');
  const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
  return itemFromRow(db().prepare(`SELECT ${ITEM_COLUMNS} FROM Inventory${clause} ORDER BY RANDOM() LIMIT 1`).get());
}

function getRandomItems(maxAmount, canBeFavourite = false) {
  ensureSchema();
  const limit = Math.max(0, Math.floor(Number(maxAmount || 0)));
  const where = canBeFavourite ? '' : ' WHERE is_favourite IS 0';
  return db().prepare(`SELECT ${ITEM_COLUMNS} FROM Inventory${where} ORDER BY RANDOM() LIMIT ?`)
    .all(limit)
    .map(itemFromRow);
}

function formatItemNames(items) {
  return items.map((item, index) => {
    if (index === 0) return `${item.getName()}${IRC_RESET}`;
    if (index === items.length - 1) return `, & ${item.getName()}${IRC_RESET}`;
    return `, ${item.getName()}${IRC_RESET}`;
  }).join('');
}

function removeItem(idOrName, overrideFavourite = false, overridePreserved = false) {
  ensureSchema();
  const input = idOrName instanceof InventoryItem ? idOrName.id : idOrName;
  const numeric = /^[-+]?\d+$/.test(String(input ?? '').trim());
  const item = numeric ? getItemById(Number(input)) : getItemByName(String(input ?? ''));

  if (!item) return ERROR_NO_ROWS_RETURNED;
  if (item.isFavourite && !overrideFavourite) return ERROR_ITEM_IS_FAVOURITE;
  if (item.usesLeft === -1 && !overridePreserved) return ERROR_ITEM_IS_PRESERVED;

  const result = db().prepare('DELETE FROM Inventory WHERE id = ?').run(item.id);
  return result.changes > 0 ? REMOVE_OK : ERROR_NO_ROWS_RETURNED;
}

function preserveItem(name) {
  ensureSchema();
  return db().prepare('UPDATE Inventory SET uses_left = -1 WHERE item_name = ?').run(String(name ?? '')).changes;
}

function unpreserveItem(name) {
  ensureSchema();
  return db().prepare('UPDATE Inventory SET uses_left = 5 WHERE item_name = ?').run(String(name ?? '')).changes;
}

function addRawItem(itemOrName, usesLeft, favourite, addedBy, added, owner = null, cursed = false) {
  ensureSchema();
  const source = itemOrName instanceof InventoryItem ? itemOrName : null;
  const name = (source ? source.getNameRaw() : String(itemOrName ?? '')).replace(/ ?\(\*\)/g, '');
  const values = {
    name: escapeHtml4(name),
    uses: source ? source.usesLeft : Number(usesLeft || 0),
    favourite: source ? source.isFavourite : !!favourite,
    addedBy: source ? source.addedBy : String(addedBy ?? ''),
    added: source ? source.added : Number(added || 0),
    owner: source ? source.owner : owner,
    cursed: source ? source.cursed : !!cursed
  };

  const result = db().prepare(`
    INSERT INTO Inventory (item_name, uses_left, is_favourite, added_by, added, owner, cursed)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(values.name, values.uses, values.favourite ? 1 : 0, values.addedBy, values.added,
    values.owner == null ? null : String(values.owner), values.cursed ? 1 : 0);
  return getItemById(result.lastInsertRowid);
}

function convertToOwnedLoot(sourceItem, lootName, owner, cursed = false) {
  if (!(sourceItem instanceof InventoryItem)) throw new TypeError('sourceItem must be an InventoryItem');
  const addedBy = cursed ? `The Curse (${sourceItem.addedBy})` : sourceItem.addedBy;
  const converted = addRawItem(
    lootName,
    sourceItem.usesLeft + 15,
    false,
    addedBy,
    sourceItem.added,
    owner,
    cursed
  );
  sourceItem.destroy();
  return converted;
}

function addItem(itemName, addedBy = null, overrideDuplicateCheck = false, blobInsteadOfDecline = false, options = {}) {
  ensureSchema();
  let item = String(itemName ?? '');
  const botNick = String(options.botNick || '');

  if (botNick && !item.includes(`${botNick}'s`) && item.includes(botNick)) {
    return "I can't put myself in my inventory silly.";
  }

  const duplicate = getItemByName(item);
  if (duplicate && !overrideDuplicateCheck) {
    if (!blobInsteadOfDecline) return 'already has a few of those.';
    if (duplicate.isFavourite || duplicate.usesLeft === -1) return 'watches the summoning fizzle';

    removeItem(duplicate, true, true);
    if (!getItemByName('Massive Blob')) {
      addItem('Massive Blob', addedBy, true, false, options);
    }
    return 'watches the summoning misfire and the two identical items merge into a massive, unidentifiable blob';
  }

  if (item.length > MAX_ITEM_NAME_LENGTH) {
    const compressed = db().prepare(`
      SELECT ${ITEM_COLUMNS}
      FROM Inventory
      WHERE item_name LIKE '%Compressed Sentence%'
      LIMIT 1
    `).get();

    if (compressed) {
      const uses = Number(compressed.uses_left || 0) + 1;
      db().prepare('UPDATE Inventory SET item_name = ?, uses_left = ? WHERE id = ?')
        .run(`${uses}x Compressed Sentences`, uses, compressed.id);
    } else {
      addRawItem('1x Compressed Sentence', 1, false, addedBy, Date.now());
    }
    return 'compresses the sentence into a more manageable format since it was too long.';
  }

  const favourite = randInt(0, 100) < (100 * FAVOURITE_CHANCE);
  const uses = getUsesFromName(item);
  item = item.replace(/ ?\(\*\)/g, '');

  const insert = db().transaction(() => {
    if (favourite) db().prepare('UPDATE Inventory SET is_favourite = 0 WHERE is_favourite = 1').run();
    return db().prepare(`
      INSERT INTO Inventory (item_name, uses_left, is_favourite, added_by, added)
      VALUES (?, ?, ?, ?, ?)
    `).run(escapeHtml4(item), uses, favourite ? 1 : 0, String(addedBy ?? ''), Date.now());
  });
  const result = insert();

  if (!result.changes) return 'Wrong things happened! (1)';
  if (favourite) {
    return `summons '${item}${IRC_RESET}' and adds to their inventory. I love this! This is my new favourite thing!`;
  }
  return `summons '${item}${IRC_RESET}' and adds to their inventory. ${getUsesIndicator(uses)}`;
}

module.exports = {
  MAX_ITEM_NAME_LENGTH,
  FAVOURITE_CHANCE,
  REMOVE_OK,
  ERROR_ITEM_IS_FAVOURITE,
  ERROR_INVALID_STATEMENT,
  ERROR_SQL_ERROR,
  ERROR_NO_ROWS_RETURNED,
  ERROR_ID_NOT_SET,
  ERROR_ITEM_IS_PRESERVED,
  InventoryItem,
  addItem,
  addRawItem,
  convertToOwnedLoot,
  createLooseItem,
  ensureSchema,
  escapeHtml4,
  fixItemName,
  formatItemNames,
  getFavouriteItem,
  getInventorySize,
  getItemBreakString,
  getItemById,
  getItemByName,
  getItems,
  getRandomItem,
  getRandomItems,
  getUsesFromName,
  getUsesIndicator,
  preserveItem,
  removeItem,
  unescapeHtml4,
  unpreserveItem
};
