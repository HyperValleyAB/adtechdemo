const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FILE = path.join(__dirname, '..', 'data', 'auth.json');

function ensureDir() {
  const dir = path.dirname(FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readStore() {
  if (!fs.existsSync(FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch (err) {
    console.error('[auth-store] failed to read auth.json:', err.message);
    return null;
  }
}

function writeStore(data) {
  ensureDir();
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, FILE);
}

function hashPassword(plain) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(plain), salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyHash(plain, stored) {
  if (!stored || typeof stored !== 'string' || !stored.startsWith('scrypt$')) return false;
  const parts = stored.split('$');
  if (parts.length !== 3) return false;
  try {
    const salt = Buffer.from(parts[1], 'hex');
    const expected = Buffer.from(parts[2], 'hex');
    const actual = crypto.scryptSync(String(plain), salt, expected.length);
    if (actual.length !== expected.length) return false;
    return crypto.timingSafeEqual(actual, expected);
  } catch (err) {
    return false;
  }
}

async function hasStoredPassword() {
  const store = readStore();
  return Boolean(store && store.passwordHash);
}

async function verifyPassword(plain) {
  if (!plain) return false;
  const store = readStore();
  if (store && store.passwordHash) {
    return verifyHash(plain, store.passwordHash);
  }
  // Bootstrap: fall back to the env var until the admin sets a new password.
  const envPassword = process.env.ADMIN_PASSWORD;
  if (!envPassword) return false;
  const a = Buffer.from(String(plain));
  const b = Buffer.from(String(envPassword));
  if (a.length !== b.length) {
    crypto.timingSafeEqual(a, a);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

async function setPassword(plain) {
  writeStore({
    passwordHash: hashPassword(plain),
    updatedAt: new Date().toISOString(),
  });
}

async function passwordSource() {
  if (await hasStoredPassword()) return 'stored';
  if (process.env.ADMIN_PASSWORD) return 'env';
  return 'none';
}

module.exports = { verifyPassword, setPassword, hasStoredPassword, passwordSource };
