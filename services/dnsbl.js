'use strict';

const dns = require('dns').promises;
const net = require('net');
const { getDb } = require('../libs/db');

function db() {
  const database = getDb();
  database.exec('CREATE TABLE IF NOT EXISTS DNSBLs(url)');
  return database;
}

function normalizeService(service) {
  const value = String(service || '').trim().toLowerCase().replace(/\.+$/, '');
  if (!value || value.length > 253) return '';
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value)) return '';
  return value;
}

function listServices() {
  return db().prepare('SELECT url FROM DNSBLs ORDER BY LOWER(url), url').all()
    .map(row => normalizeService(row.url))
    .filter((value, index, values) => value && values.indexOf(value) === index);
}

function addService(service) {
  const value = normalizeService(service);
  if (!value) throw new Error('Invalid DNSBL service hostname.');
  if (listServices().includes(value)) return false;
  return db().prepare('INSERT INTO DNSBLs(url) VALUES (?)').run(value).changes > 0;
}

function removeService(service) {
  const value = normalizeService(service);
  if (!value) return false;
  return db().prepare('DELETE FROM DNSBLs WHERE LOWER(url) = LOWER(?)').run(value).changes > 0;
}

async function resolveIpv4(address, lookup = dns.lookup) {
  const target = String(address || '').trim();
  if (!target) throw new Error('Address is required.');
  if (net.isIPv4(target)) return target;
  const result = await lookup(target, { family: 4 });
  const value = typeof result === 'string' ? result : result?.address;
  if (!net.isIPv4(value)) throw new Error(`No IPv4 address found for ${target}.`);
  return value;
}

function reverseIpv4(address) {
  if (!net.isIPv4(address)) throw new Error(`Invalid IPv4 address '${address}'.`);
  return address.split('.').reverse().join('.');
}

async function checkAddress(address, services = listServices(), options = {}) {
  const ip = await resolveIpv4(address, options.lookup || dns.lookup);
  const reversed = reverseIpv4(ip);
  const resolver = options.resolve4 || dns.resolve4;
  const checked = Array.isArray(services) ? services.map(normalizeService).filter(Boolean) : [];
  const results = await Promise.all(checked.map(async service => {
    try {
      const answers = await resolver(`${reversed}.${service}`);
      return Array.isArray(answers) && answers.length ? service : null;
    } catch (_) {
      return null;
    }
  }));
  return {
    address: String(address || ''),
    ip,
    listedOn: results.filter(Boolean)
  };
}

module.exports = {
  addService,
  checkAddress,
  ensureSchema: db,
  listServices,
  normalizeService,
  removeService,
  resolveIpv4,
  reverseIpv4
};
