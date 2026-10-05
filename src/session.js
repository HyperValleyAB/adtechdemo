// Stateless signed-cookie session, designed for serverless deployments where
// in-memory session stores would be lost between cold starts.
//
// Two cookies:
//   adtech.auth — base64(JSON payload).base64(HMAC-SHA256). Holds
//                 {isAdmin, loginAt, cred}; `cred` is a fingerprint of the
//                 password at sign-in, so changing it ends other sessions.
//   adtech.csrf — random opaque token, double-submitted with every form POST.

const crypto = require('crypto');

const AUTH_COOKIE = 'adtech.auth';
const CSRF_COOKIE = 'adtech.csrf';
const AUTH_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const CSRF_MAX_AGE_MS = 12 * 60 * 60 * 1000;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET is required.');
  return s;
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function sign(payload) {
  const json = JSON.stringify(payload);
  const data = b64url(json);
  const sig = crypto.createHmac('sha256', secret()).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verify(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const idx = token.indexOf('.');
  const data = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  let expected;
  try {
    expected = crypto.createHmac('sha256', secret()).update(data).digest('base64url');
  } catch (err) {
    return null;
  }
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
  } catch (err) {
    return null;
  }
}

function cookieOptions(maxAgeMs) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: maxAgeMs,
  };
}

// Express middleware that populates `req.session` from the auth cookie.
// `req.session` is just a plain object: writes do NOT auto-persist. Call
// signIn() / signOut() explicitly to write or clear the cookie.
function middleware(req, res, next) {
  const token = req.cookies && req.cookies[AUTH_COOKIE];
  const data = token ? verify(token) : null;
  // The cookie's maxAge is only a hint to the browser; enforce expiry here too.
  const age = data ? Date.now() - Date.parse(data.loginAt) : NaN;
  req.session = data && age >= 0 && age < AUTH_MAX_AGE_MS ? data : {};
  next();
}

function signIn(res, cred) {
  const payload = { isAdmin: true, loginAt: new Date().toISOString(), cred };
  res.cookie(AUTH_COOKIE, sign(payload), cookieOptions(AUTH_MAX_AGE_MS));
}

// Keyed so the cookie never carries anything derived from the bare password.
function fingerprint(material) {
  return crypto.createHmac('sha256', secret()).update(String(material)).digest('base64url').slice(0, 22);
}

function signOut(res) {
  res.clearCookie(AUTH_COOKIE, { path: '/' });
  // CSRF token can stay — it's re-generated on the next /login GET.
}

function ensureCsrfToken(req, res) {
  let token = req.cookies && req.cookies[CSRF_COOKIE];
  if (!token || typeof token !== 'string' || token.length < 32) {
    token = crypto.randomBytes(24).toString('hex');
  }
  // Re-set on every page render so the cookie can't expire under an open form.
  res.cookie(CSRF_COOKIE, token, cookieOptions(CSRF_MAX_AGE_MS));
  return token;
}

function csrfError() {
  const err = new Error('Invalid CSRF token.');
  err.status = 403;
  return err;
}

function verifyCsrf(req, res, next) {
  const cookie = req.cookies && req.cookies[CSRF_COOKIE];
  const provided = (req.body && req.body._csrf) || req.get('x-csrf-token');
  if (!cookie || !provided) return next(csrfError());
  const a = Buffer.from(String(cookie));
  const b = Buffer.from(String(provided));
  if (a.length !== b.length) return next(csrfError());
  if (!crypto.timingSafeEqual(a, b)) return next(csrfError());
  return next();
}

module.exports = { middleware, signIn, signOut, fingerprint, ensureCsrfToken, verifyCsrf, AUTH_COOKIE, CSRF_COOKIE };
