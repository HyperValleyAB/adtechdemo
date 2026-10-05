const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

let client = null;
function getClient() {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
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

async function readStored() {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('auth_settings')
    .select('password_hash')
    .eq('id', 1)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') throw error;
  return data && data.password_hash ? data.password_hash : null;
}

async function hasStoredPassword() {
  return Boolean(await readStored());
}

async function verifyPassword(plain) {
  if (!plain) return false;
  const stored = await readStored();
  if (stored) return verifyHash(plain, stored);
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
  const supabase = getClient();
  const passwordHash = hashPassword(plain);
  const { error } = await supabase
    .from('auth_settings')
    .upsert({ id: 1, password_hash: passwordHash, updated_at: new Date().toISOString() });
  if (error) throw error;
}

async function passwordSource() {
  if (await hasStoredPassword()) return 'stored';
  if (process.env.ADMIN_PASSWORD) return 'env';
  return 'none';
}

// Opaque value that changes whenever the effective password changes.
async function credentialVersion() {
  const stored = await readStored();
  if (stored) return stored;
  return process.env.ADMIN_PASSWORD ? `env:${process.env.ADMIN_PASSWORD}` : 'none';
}

module.exports = { verifyPassword, setPassword, hasStoredPassword, passwordSource, credentialVersion };
