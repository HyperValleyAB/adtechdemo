// Stateless signed-cookie session, designed for serverless deployments where
// in-memory session stores would be lost between cold starts.
//
// Two cookies:
//   adtech.auth — base64(JSON payload).base64(HMAC-SHA256). Holds {isAdmin,loginAt}.
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
  req.session = data || {};
  next();
}

function signIn(res) {
  const payload = { isAdmin: true, loginAt: new Date().toISOString() };
  res.cookie(AUTH_COOKIE, sign(payload), cookieOptions(AUTH_MAX_AGE_MS));
}

function signOut(res) {
  res.clearCookie(AUTH_COOKIE, { path: '/' });
  // CSRF token can stay — it's re-generated on the next /login GET.
}

function ensureCsrfToken(req, res) {
  let token = req.cookies && req.cookies[CSRF_COOKIE];
  if (!token || typeof token !== 'string' || token.length < 32) {
    token = crypto.randomBytes(24).toString('hex');
    res.cookie(CSRF_COOKIE, token, cookieOptions(CSRF_MAX_AGE_MS));
  }
  return token;
}

function verifyCsrf(req, res, next) {
  const cookie = req.cookies && req.cookies[CSRF_COOKIE];
  const provided = (req.body && req.body._csrf) || req.get('x-csrf-token');
  if (!cookie || !provided) return res.status(403).send('Invalid CSRF token. Refresh and try again.');
  const a = Buffer.from(String(cookie));
  const b = Buffer.from(String(provided));
  if (a.length !== b.length) return res.status(403).send('Invalid CSRF token. Refresh and try again.');
  if (!crypto.timingSafeEqual(a, b)) return res.status(403).send('Invalid CSRF token. Refresh and try again.');
  return next();
}

module.exports = { middleware, signIn, signOut, ensureCsrfToken, verifyCsrf, AUTH_COOKIE, CSRF_COOKIE };
