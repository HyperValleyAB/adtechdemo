// Express app factory. Exports a configured app — calling .listen() is the
// caller's responsibility (server.js does it for local dev; api/index.js
// exports it for Vercel's serverless runtime).
//
// All storage I/O is async — callers always await.

const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const storage = require('./storage');
const auth = require('./auth');
const { renderDemoPage, renderView } = require('./render');
const { escapeHtml, formatDate, slugify } = require('./utils');

const IS_PROD = process.env.NODE_ENV === 'production';

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(express.urlencoded({ extended: false, limit: '2mb' }));
  app.use(cookieParser());
  app.use(auth.sessionMiddleware);

  app.use('/public', express.static(path.join(__dirname, '..', 'public'), { maxAge: IS_PROD ? '1d' : 0 }));

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many login attempts. Try again in 15 minutes.',
  });

  // ----- public routes -------------------------------------------------------

  app.get('/', (req, res) => {
    if (auth.isLoggedIn(req)) return res.redirect('/admin');
    res.type('html').send(renderLandingPage());
  });

  app.get('/login', (req, res) => {
    if (auth.isLoggedIn(req)) return res.redirect('/admin');
    const nextUrl = safeLocalPath(req.query.next, '/admin');
    res.type('html').send(
      renderView('login.html', {
        errorBlock: '',
        csrfToken: auth.ensureCsrfToken(req, res),
        nextUrl,
      }),
    );
  });

  app.post('/login', loginLimiter, asyncHandler(async (req, res) => {
    // Inline double-submit CSRF check (so we can render the login form with a
    // friendly error rather than a bare 403 text response).
    const cookieToken = req.cookies && req.cookies['adtech.csrf'];
    const formToken = (req.body && req.body._csrf) || '';
    if (!cookieToken || !formToken || cookieToken !== formToken) {
      return res.status(403).type('html').send(
        renderView('login.html', {
          errorBlock: '<div class="flash flash--danger">Session expired. Please try again.</div>',
          csrfToken: auth.ensureCsrfToken(req, res),
          nextUrl: '/admin',
        }),
      );
    }
    const ok = await auth.login(req, res, (req.body && req.body.password) || '');
    const nextUrl = safeLocalPath(req.body && req.body.next, '/admin');
    if (!ok) {
      return res.status(401).type('html').send(
        renderView('login.html', {
          errorBlock: '<div class="flash flash--danger">Incorrect password.</div>',
          csrfToken: auth.ensureCsrfToken(req, res),
          nextUrl,
        }),
      );
    }
    res.redirect(nextUrl);
  }));

  app.post('/logout', auth.requireAuth, auth.verifyCsrf, (req, res) => {
    auth.logout(req, res);
    res.redirect('/login');
  });

  // ----- admin routes --------------------------------------------------------

  app.get('/admin', auth.requireAuth, asyncHandler(async (req, res) => {
    const search = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const demos = await storage.listDemos({ search });
    const csrfToken = auth.ensureCsrfToken(req, res);
    res.type('html').send(
      renderView('admin-list.html', {
        demoRows: renderDemoRows(demos, csrfToken),
        demoCount: String(demos.length),
        search,
        csrfToken,
        emptyState: demos.length === 0 ? renderEmptyState(search) : '',
      }),
    );
  }));

  app.get('/admin/new', auth.requireAuth, (req, res) => {
    const demo = storage.emptyDemo();
    if (typeof req.query.template === 'string' && storage.TEMPLATES.includes(req.query.template)) {
      demo.template = req.query.template;
    }
    res.type('html').send(renderEditPage(req, res, demo, { mode: 'new' }));
  });

  app.get('/admin/templates', auth.requireAuth, asyncHandler(async (req, res) => {
    const demos = await storage.listDemos();
    const counts = { news: 0, magazine: 0, landing: 0, empty: 0 };
    for (const d of demos) counts[d.template] = (counts[d.template] || 0) + 1;
    res.type('html').send(
      renderView('admin-templates.html', {
        csrfToken: auth.ensureCsrfToken(req, res),
        newsCount: String(counts.news || 0),
        magazineCount: String(counts.magazine || 0),
        landingCount: String(counts.landing || 0),
        emptyCount: String(counts.empty || 0),
      }),
    );
  }));

  app.get('/admin/templates/preview/:template', auth.requireAuth, (req, res) => {
    const t = req.params.template;
    if (!storage.TEMPLATES.includes(t)) return res.status(404).type('html').send(renderNotFound('Template not found.'));
    const demo = storage.emptyDemo();
    demo.template = t;
    demo.title = `${templateLabel(t)} template`;
    demo.clientName = 'Sample client';
    demo.slug = `template-${t}`;
    res.type('html').send(renderDemoPage(demo, { isPreview: true }));
  });

  app.get('/admin/settings', auth.requireAuth, asyncHandler(async (req, res) => {
    res.type('html').send(await renderSettingsPage(req, res, { flash: '' }));
  }));

  app.post('/admin/settings', auth.requireAuth, auth.verifyCsrf, asyncHandler(async (req, res) => {
    const current = (req.body && req.body.currentPassword) || '';
    const next = (req.body && req.body.newPassword) || '';
    const confirm = (req.body && req.body.confirmPassword) || '';

    if (next !== confirm) {
      return res.status(400).type('html').send(
        await renderSettingsPage(req, res, { flash: '<div class="flash flash--danger">New password and confirmation do not match.</div>' }),
      );
    }

    const result = await auth.changePassword(req, res, current, next);
    if (!result.ok) {
      return res.status(400).type('html').send(
        await renderSettingsPage(req, res, { flash: `<div class="flash flash--danger">${escapeHtml(result.error)}</div>` }),
      );
    }
    res.type('html').send(
      await renderSettingsPage(req, res, { flash: '<div class="flash flash--success">Password updated. All other sessions have been signed out.</div>' }),
    );
  }));

  app.post('/admin/new', auth.requireAuth, auth.verifyCsrf, asyncHandler(async (req, res) => {
    const demo = await storage.createDemo(buildDemoFromForm(req.body));
    res.redirect(`/admin/edit/${demo.id}?saved=1`);
  }));

  app.get('/admin/edit/:id', auth.requireAuth, asyncHandler(async (req, res) => {
    const demo = await storage.getById(req.params.id);
    if (!demo) return res.status(404).type('html').send(renderNotFound('Demo not found.'));
    res.type('html').send(renderEditPage(req, res, demo, { mode: 'edit', saved: req.query.saved === '1' }));
  }));

  app.post('/admin/edit/:id', auth.requireAuth, auth.verifyCsrf, asyncHandler(async (req, res) => {
    const input = buildDemoFromForm(req.body);
    // The editor's Publish / Unpublish button submits the whole form, so
    // unsaved edits are saved together with the status change.
    if (storage.STATUSES.includes(req.body.setStatus)) input.status = req.body.setStatus;
    const updated = await storage.updateDemo(req.params.id, input);
    if (!updated) return res.status(404).type('html').send(renderNotFound('Demo not found.'));
    res.redirect(`/admin/edit/${updated.id}?saved=1`);
  }));

  app.post('/admin/delete/:id', auth.requireAuth, auth.verifyCsrf, asyncHandler(async (req, res) => {
    await storage.deleteDemo(req.params.id);
    res.redirect('/admin');
  }));

  app.post('/admin/duplicate/:id', auth.requireAuth, auth.verifyCsrf, asyncHandler(async (req, res) => {
    const copy = await storage.duplicateDemo(req.params.id);
    if (!copy) return res.status(404).type('html').send(renderNotFound('Demo not found.'));
    res.redirect(`/admin/edit/${copy.id}?saved=1`);
  }));

  app.post('/admin/status/:id', auth.requireAuth, auth.verifyCsrf, asyncHandler(async (req, res) => {
    const demo = await storage.getById(req.params.id);
    if (!demo) return res.status(404).type('html').send(renderNotFound('Demo not found.'));
    // Forms send the target status explicitly, so a double-click or a stale tab
    // can't flip it back. Pages rendered before that change still toggle.
    const requested = req.body && req.body.status;
    const next = storage.STATUSES.includes(requested) ? requested : (demo.status === 'published' ? 'draft' : 'published');
    await storage.setStatus(req.params.id, next);
    const back = safeLocalPath(req.body && req.body.back, '/admin');
    res.redirect(back);
  }));

  // ----- demo pages ----------------------------------------------------------

  app.get('/preview/:slug', auth.requireAuth, asyncHandler(async (req, res) => {
    const demo = await storage.getBySlug(req.params.slug);
    if (!demo) return res.status(404).type('html').send(renderNotFound('Preview not found.'));
    res.type('html').send(renderDemoPage(demo, { isPreview: true }));
  }));

  app.get('/demo/:slug', asyncHandler(async (req, res) => {
    const demo = await storage.getBySlug(req.params.slug);
    if (!demo || demo.status !== 'published') {
      return res.status(404).type('html').send(renderNotFound('This demo is not available.'));
    }
    res.type('html').send(renderDemoPage(demo, { isPreview: false }));
  }));

  // ----- 404 / errors --------------------------------------------------------

  app.use((req, res) => {
    res.status(404).type('html').send(renderNotFound('Page not found.'));
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) console.error('[adtech-demo] unhandled error:', err);
    if (res.headersSent) return next(err);
    res.status(status).type('html').send(renderErrorPage(status));
  });

  return app;
}

// ----- helpers ---------------------------------------------------------------

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// Local-path validator that rejects protocol-relative URLs (//host, /\host) so
// we can't be used as an open redirect.
function safeLocalPath(value, fallback) {
  if (typeof value !== 'string') return fallback;
  if (!value.startsWith('/')) return fallback;
  if (value.startsWith('//') || value.startsWith('/\\')) return fallback;
  return value;
}

function buildDemoFromForm(body) {
  const fields = ['title', 'slug', 'clientName', 'description', 'status', 'template', ...storage.SCRIPT_FIELDS];
  const out = {};
  for (const f of fields) {
    if (body[f] != null) out[f] = body[f];
  }
  if (!out.slug && (out.title || out.clientName)) out.slug = slugify(out.title || out.clientName);
  return out;
}

function renderDemoRows(demos, csrfToken) {
  if (!demos.length) return '';
  return demos
    .map((d) => {
      const statusClass = d.status === 'published' ? 'badge badge--success' : 'badge badge--muted';
      const statusToggleLabel = d.status === 'published' ? 'Unpublish' : 'Publish';
      const publicLink = d.status === 'published'
        ? `<a class="row-action" href="/demo/${encodeURIComponent(d.slug)}" target="_blank" rel="noopener">Open</a>`
        : `<span class="row-action row-action--disabled" title="Publish to enable public URL">Open</span>`;
      return `
        <tr>
          <td class="cell-title">
            <a href="/admin/edit/${encodeURIComponent(d.id)}" class="row-title">${escapeHtml(d.title || 'Untitled demo')}</a>
            <div class="row-sub">/${escapeHtml(d.slug)}</div>
          </td>
          <td>${escapeHtml(d.clientName || '—')}</td>
          <td><span class="${statusClass}">${escapeHtml(d.status)}</span></td>
          <td>${escapeHtml(templateLabel(d.template))}</td>
          <td class="cell-meta">${escapeHtml(formatDate(d.updatedAt))}</td>
          <td class="cell-actions">
            <a class="row-action" href="/admin/edit/${encodeURIComponent(d.id)}">Edit</a>
            <a class="row-action" href="/preview/${encodeURIComponent(d.slug)}" target="_blank" rel="noopener">Preview</a>
            ${publicLink}
            <form class="row-form" method="post" action="/admin/status/${encodeURIComponent(d.id)}">
              <input type="hidden" name="_csrf" value="${csrfToken}">
              <input type="hidden" name="status" value="${d.status === 'published' ? 'draft' : 'published'}">
              <input type="hidden" name="back" value="/admin">
              <button type="submit" class="row-action row-action--button">${statusToggleLabel}</button>
            </form>
            <form class="row-form" method="post" action="/admin/duplicate/${encodeURIComponent(d.id)}">
              <input type="hidden" name="_csrf" value="${csrfToken}">
              <button type="submit" class="row-action row-action--button">Duplicate</button>
            </form>
            <form class="row-form" method="post" action="/admin/delete/${encodeURIComponent(d.id)}" data-confirm="Delete this demo? This cannot be undone.">
              <input type="hidden" name="_csrf" value="${csrfToken}">
              <button type="submit" class="row-action row-action--button row-action--danger">Delete</button>
            </form>
          </td>
        </tr>
      `;
    })
    .join('');
}

function renderEmptyState(search) {
  if (search) {
    return `
      <div class="empty-state">
        <h2>No matches</h2>
        <p>No demos match “${escapeHtml(search)}”. Try a different keyword or <a href="/admin">clear the search</a>.</p>
      </div>
    `;
  }
  return `
    <div class="empty-state">
      <h2>Create your first demo</h2>
      <p>Demos let Adops show clients a polished publisher-style page with their creatives in place.</p>
      <a class="btn-primary" href="/admin/new">Create demo</a>
    </div>
  `;
}

function renderEditPage(req, res, demo, { mode, saved = false } = {}) {
  const isNew = mode === 'new';
  const action = isNew ? '/admin/new' : `/admin/edit/${encodeURIComponent(demo.id)}`;
  const csrfToken = auth.ensureCsrfToken(req, res);
  const previewUrl = !isNew && demo.slug ? `/preview/${encodeURIComponent(demo.slug)}` : '';
  const publicUrl = !isNew && demo.slug && demo.status === 'published' ? `/demo/${encodeURIComponent(demo.slug)}` : '';
  const statusBadge = demo.status === 'published'
    ? '<span class="badge badge--success">published</span>'
    : '<span class="badge badge--muted">draft</span>';

  return renderView('admin-edit.html', {
    pageTitle: isNew ? 'Create demo' : `Edit · ${demo.title || 'Untitled demo'}`,
    formAction: action,
    csrfToken,
    isNew: isNew ? '1' : '',
    saved: saved ? '<div class="flash flash--success">Saved.</div>' : '',
    statusBadge,
    // Plain values: {{ }} in the view escapes them. Escaping here as well
    // double-escaped them, so every save corrupted names like "H&M".
    title: demo.title,
    slug: demo.slug,
    clientName: demo.clientName,
    description: demo.description,
    templateOptions: renderTemplateOptions(demo.template),
    statusOptions: renderStatusOptions(demo.status),
    createdAt: formatDate(demo.createdAt) || '—',
    updatedAt: formatDate(demo.updatedAt) || '—',
    previewUrlBlock: previewUrl
      ? `<a class="btn-ghost" href="${previewUrl}" target="_blank" rel="noopener">Preview</a>`
      : '<span class="btn-ghost btn-ghost--disabled" title="Save the demo to preview">Preview</span>',
    publicUrlBlock: publicUrl
      ? `<a class="btn-ghost" href="${publicUrl}" target="_blank" rel="noopener">Open public URL</a>`
      : '<span class="btn-ghost btn-ghost--disabled" title="Publish to enable public URL">Open public URL</span>',
    copyPublicBtn: publicUrl
      ? `<button type="button" class="btn-ghost" data-copy="${escapeHtml(absoluteUrl(req, publicUrl))}">Copy public URL</button>`
      : '',
    copyPreviewBtn: previewUrl
      ? `<button type="button" class="btn-ghost" data-copy="${escapeHtml(absoluteUrl(req, previewUrl))}">Copy preview URL</button>`
      : '',
    // Publish / Unpublish submits the editor itself (saving pending edits).
    // Delete and Duplicate sit inside #editor-form but submit separate forms
    // via the `form` attribute. Those forms must stay outside #editor-form:
    // nested <form> tags are invalid HTML, and the browser would merge their
    // hidden fields into the editor (duplicate _csrf → 403 on every save).
    statusButton: isNew
      ? ''
      : demo.status === 'published'
        ? '<button type="submit" name="setStatus" value="draft" class="btn-ghost">Unpublish</button>'
        : '<button type="submit" name="setStatus" value="published" class="btn-ghost">Save &amp; publish</button>',
    deleteButton: isNew ? '' : '<button type="submit" form="delete-form" class="btn-danger">Delete demo</button>',
    duplicateButton: isNew ? '' : '<button type="submit" form="duplicate-form" class="btn-ghost">Duplicate</button>',
    actionForms: isNew
      ? ''
      : `<form id="delete-form" method="post" action="/admin/delete/${encodeURIComponent(demo.id)}" data-confirm="Delete this demo? This cannot be undone.">
           <input type="hidden" name="_csrf" value="${csrfToken}">
         </form>
         <form id="duplicate-form" method="post" action="/admin/duplicate/${encodeURIComponent(demo.id)}">
           <input type="hidden" name="_csrf" value="${csrfToken}">
         </form>`,
    customCss: demo.customCss,
    headHtml: demo.headHtml,
    headerAdHtml: demo.headerAdHtml,
    topAdHtml: demo.topAdHtml,
    inArticleAdHtml: demo.inArticleAdHtml,
    midArticleAdHtml: demo.midArticleAdHtml,
    sidebarAdHtml: demo.sidebarAdHtml,
    stickyAdHtml: demo.stickyAdHtml,
    footerAdHtml: demo.footerAdHtml,
    bodyEndHtml: demo.bodyEndHtml,
  });
}

function absoluteUrl(req, pathPart) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.get('host');
  return `${proto}://${host}${pathPart}`;
}

function renderTemplateOptions(selected) {
  const items = [
    { value: 'news', label: 'News article' },
    { value: 'magazine', label: 'Magazine / lifestyle' },
    { value: 'landing', label: 'Minimal landing page' },
    { value: 'empty', label: 'Empty (blank canvas)' },
  ];
  return items
    .map((i) => `<option value="${i.value}"${i.value === selected ? ' selected' : ''}>${i.label}</option>`)
    .join('');
}

function renderStatusOptions(selected) {
  return ['draft', 'published']
    .map((s) => `<option value="${s}"${s === selected ? ' selected' : ''}>${s}</option>`)
    .join('');
}

async function renderSettingsPage(req, res, { flash = '' } = {}) {
  const source = await auth.passwordSource();
  let note;
  if (source === 'stored') {
    note = 'Currently using a password set in this admin.';
  } else if (source === 'env') {
    note = 'Currently using the bootstrap <code>ADMIN_PASSWORD</code> env var. The first change here takes over.';
  } else {
    note = '<strong>No password configured.</strong> Set <code>ADMIN_PASSWORD</code> on your hosting platform and restart, then change it here.';
  }
  return renderView('admin-settings.html', {
    csrfToken: auth.ensureCsrfToken(req, res),
    flash,
    sourceNote: note,
  });
}

function templateLabel(t) {
  switch (t) {
    case 'magazine': return 'Magazine';
    case 'landing':  return 'Landing';
    case 'empty':    return 'Empty';
    case 'news':
    default:         return 'News';
  }
}

function renderLandingPage() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Adtech Demo · Leeads Adprofit</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="icon" type="image/svg+xml" href="/public/img/favicon.svg">
<link rel="stylesheet" href="/public/css/admin.css">
</head>
<body class="public-shell">
  <main class="public-card">
    <span class="public-eyebrow">Leeads Adprofit</span>
    <h1>Adtech Demo</h1>
    <p>Internal tool for the Adops team. Build publisher-style demo pages, drop in ad scripts, and share a clean URL with clients.</p>
    <a class="btn-primary" href="/admin">Admin sign in</a>
  </main>
</body>
</html>`;
}

function renderNotFound(message) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Not found · Adtech Demo</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="icon" type="image/svg+xml" href="/public/img/favicon.svg">
<link rel="stylesheet" href="/public/css/admin.css">
</head>
<body class="public-shell">
  <main class="public-card">
    <span class="public-eyebrow">404</span>
    <h1>${escapeHtml(message)}</h1>
    <p>Either the demo isn't published yet, has been removed, or the URL is wrong.</p>
    <a class="btn-primary" href="/">Back to start</a>
  </main>
</body>
</html>`;
}

const ERROR_MESSAGES = {
  400: ['That request could not be read', 'Nothing was saved. Go back and try again.'],
  401: ["You've been signed out", 'Sessions last 12 hours, so nothing was saved. Go back to copy your changes, then sign in again.'],
  403: ['This form has expired', 'Nothing was saved. Go back to copy your changes, then reload the page and save again.'],
  413: ['Too much to save', 'The pasted snippets add up to more than 2 MB, so nothing was saved. Go back to get your changes, and load large scripts from a URL instead of pasting them inline.'],
  500: ['Something went wrong', 'Nothing was saved. Go back and try again. If it keeps happening, check the server logs.'],
};

function renderErrorPage(status) {
  const [title, message] = ERROR_MESSAGES[status] || ERROR_MESSAGES[status >= 500 ? 500 : 400];
  const signIn = status === 401 ? '<a class="btn-ghost" href="/login">Sign in</a>' : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)} · Adtech Demo</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="icon" type="image/svg+xml" href="/public/img/favicon.svg">
<link rel="stylesheet" href="/public/css/admin.css">
</head>
<body class="public-shell">
  <main class="public-card">
    <span class="public-eyebrow">Error ${status}</span>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
    <button type="button" class="btn-primary" onclick="history.back()">Go back</button>
    ${signIn}
  </main>
</body>
</html>`;
}

module.exports = { createApp };
