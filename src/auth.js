const authStore = require('./auth-store');
const session = require('./session');

function isLoggedIn(req) {
  return Boolean(req.session && req.session.isAdmin);
}

function requireAuth(req, res, next) {
  if (isLoggedIn(req)) return next();
  if (req.method === 'GET') {
    const target = encodeURIComponent(req.originalUrl || '/admin');
    return res.redirect(`/login?next=${target}`);
  }
  return res.status(401).send('Unauthorized');
}

async function login(req, res, password) {
  if (!(await authStore.verifyPassword(password || ''))) return false;
  session.signIn(res);
  return true;
}

function logout(req, res) {
  session.signOut(res);
}

async function changePassword(currentPassword, newPassword) {
  if (!(await authStore.verifyPassword(currentPassword || ''))) {
    return { ok: false, error: 'Current password is incorrect.' };
  }
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    return { ok: false, error: 'New password must be at least 8 characters.' };
  }
  await authStore.setPassword(newPassword);
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
  sessionMiddleware: session.middleware,
};
