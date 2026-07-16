const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value).sort().map(key => [key, sortJson(value[key])])
  );
}

function canonicalJson(value) {
  return `${JSON.stringify(sortJson(value), null, 2)}\n`;
}

function sha256Buffer(buffer) {
  return `sha256:${crypto.createHash('sha256').update(buffer).digest('hex')}`;
}

function sha256Json(value) {
  return sha256Buffer(Buffer.from(canonicalJson(value)));
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`${filePath}: invalid UTF-8 JSON (${error.message})`);
  }
}

function writeCanonicalJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, canonicalJson(value));
}

module.exports = {
  canonicalJson,
  readJson,
  sha256Buffer,
  sha256Json,
  sortJson,
  writeCanonicalJson,
};
