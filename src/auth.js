const authStore = require('./auth-store');
const session = require('./session');

// Sessions carry a fingerprint of the password they were created with, so a
// password change signs out every other session. The current fingerprint is
// cached briefly per instance to avoid an auth-store read on every request;
// a mismatch always re-reads before rejecting, so new sessions are never
// refused because of a stale cache.
const CREDENTIAL_TTL_MS = 30 * 1000;
let credentialCache = null;

async function currentCredential({ fresh = false } = {}) {
  if (!fresh && credentialCache && Date.now() - credentialCache.at < CREDENTIAL_TTL_MS) {
    return credentialCache.value;
  }
  const value = session.fingerprint(await authStore.credentialVersion());
  credentialCache = { value, at: Date.now() };
  return value;
}

function sessionMiddleware(req, res, next) {
  session.middleware(req, res, () => {
    if (!req.session.isAdmin) return next();
    const claimed = req.session.cred;
    currentCredential()
      .then((cred) => (cred === claimed ? cred : currentCredential({ fresh: true })))
      .then((cred) => {
        if (cred !== claimed) req.session = {};
        next();
      })
      .catch(next);
  });
}

function isLoggedIn(req) {
  return Boolean(req.session && req.session.isAdmin);
}

function requireAuth(req, res, next) {
  if (isLoggedIn(req)) return next();
  if (req.method === 'GET') {
    const target = encodeURIComponent(req.originalUrl || '/admin');
    return res.redirect(`/login?next=${target}`);
  }
  const err = new Error('Unauthorized');
  err.status = 401;
  return next(err);
}

async function login(req, res, password) {
  if (!(await authStore.verifyPassword(password || ''))) return false;
  session.signIn(res, await currentCredential({ fresh: true }));
  return true;
}

function logout(req, res) {
  session.signOut(res);
}

// Keeps the caller signed in; every other session is signed out.
async function changePassword(req, res, currentPassword, newPassword) {
  if (!(await authStore.verifyPassword(currentPassword || ''))) {
    return { ok: false, error: 'Current password is incorrect.' };
  }
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    return { ok: false, error: 'New password must be at least 8 characters.' };
  }
  await authStore.setPassword(newPassword);
  session.signIn(res, await currentCredential({ fresh: true }));
  return { ok: true };
}

module.exports = {
  isLoggedIn,
  requireAuth,
  login,
  logout,
  changePassword,
  passwordSource: authStore.passwordSource,
  ensureCsrfToken: session.ensureCsrfToken,
  verifyCsrf: session.verifyCsrf,
  sessionMiddleware,
};
