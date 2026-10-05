# Adtech Demo

Internal demo page generator for **Leeads Adprofit**. Adops paste HTML / JavaScript
ad snippets into predefined placements and share polished publisher-style demo
pages with clients.

- Public site: `https://demo.leeadsadprofit.com`
- Admin: `https://demo.leeadsadprofit.com/admin`
- Demo pages: `https://demo.leeadsadprofit.com/demo/:slug`

## Stack

- Node.js (18+)
- Express
- Vanilla HTML / CSS / JS
- File-based JSON storage in `data/demos.json`
- No build step

## Installation

```bash
npm install
cp .env.example .env
# edit .env and set ADMIN_PASSWORD and SESSION_SECRET
npm start
```

The server starts on `http://localhost:3000` by default.

## Environment variables

| Name | Required | Description |
|------|----------|-------------|
| `ADMIN_PASSWORD` | yes (bootstrap) | Initial admin password. After you sign in once and change the password in **Settings**, the stored (hashed) password takes over and this env var is no longer used. |
| `SESSION_SECRET` | yes in production | Random string used to sign the session cookie. |
| `PORT` | no | HTTP port (default `3000`). |
| `NODE_ENV` | no | Set to `production` on the live server. Enables `secure` cookies. |

## Local development

```bash
npm start
```

Visit:

- `http://localhost:3000/login` → sign in with `ADMIN_PASSWORD`.
- `http://localhost:3000/admin` → list, create and edit demos.
- `http://localhost:3000/preview/<slug>` → preview drafts (auth required).
- `http://localhost:3000/demo/<slug>` → public published demo.

## Creating your first demo

1. Sign in at `/login`.
2. Click **Create demo**.
3. Fill in title, client name and pick a template (News, Magazine, Landing).
4. Paste ad snippets into the relevant placement fields (top banner, in-article,
   sticky, etc.). Snippets are saved verbatim — nothing is sanitized.
5. Click **Save**, then **Preview** to view the page without publishing.
6. Toggle **Publish** when ready. The public URL is `/demo/<slug>`.

## Routes

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | Redirects to `/admin` if signed in, otherwise a short landing page. |
| GET | `/login` | Login form. |
| POST | `/login` | Validate password. Rate-limited. |
| POST | `/logout` | End session. |
| GET | `/admin` | List demos. |
| GET | `/admin/new` | Create-demo form. |
| POST | `/admin/new` | Save new demo. |
| GET | `/admin/edit/:id` | Edit demo. |
| POST | `/admin/edit/:id` | Save edits. |
| POST | `/admin/delete/:id` | Delete demo (confirmed in UI). |
| POST | `/admin/duplicate/:id` | Duplicate demo. |
| POST | `/admin/status/:id` | Toggle draft / published. |
| GET | `/preview/:slug` | Render draft, admin-only. |
| GET | `/demo/:slug` | Public demo, 404 if not published. |

## Storage

For the MVP demos are stored in `data/demos.json` as a flat array. Each record
follows the shape in `src/storage.js`. Writes are serialized so concurrent
admin saves can't corrupt the file.

To move to PostgreSQL or Supabase later: replace the functions exported from
`src/storage.js` (`listDemos`, `getById`, `getBySlug`, `createDemo`,
`updateDemo`, `deleteDemo`, `duplicateDemo`, `setStatus`). Nothing else in the
codebase touches the JSON file directly.

## Deployment notes

**Primary target: Vercel + Supabase.** See [DEPLOY.md](./DEPLOY.md) for
step-by-step instructions (SQL schema, env vars, custom domain).

Other targets (Render / Railway / VPS) also work. Things to remember:

- Set `NODE_ENV=production` so session cookies are sent `Secure`.
- Set a strong `SESSION_SECRET`.
- Run behind HTTPS (handled by the platform's load balancer in most cases).
- Ensure the host can write to `data/demos.json` and that the file persists
  across deploys (mount a disk on Render / Railway, or back up the file).
- The login route is rate-limited to 20 attempts per 15 minutes per IP.

### Render / Railway

- Build command: `npm install`
- Start command: `npm start`
- Add a persistent volume mounted at `data/`.

## Security note about script rendering

**This app is intentionally designed to render arbitrary HTML and JavaScript on
demo pages.** That is the point of the product — Adops needs to validate
third-party ad creatives, GAM tags, Prebid wrappers and rich-media units in a
realistic context. The implications:

- Only authenticated admins can save snippets. The admin password is stored as
  a salted scrypt hash in `data/auth.json` once it has been changed in the
  **Settings** page; until then the `ADMIN_PASSWORD` env var is used as the
  bootstrap password. To force a reset, delete `data/auth.json` and the env-var
  password becomes active again on next sign-in.
- Scripts render only on `/demo/:slug` and `/preview/:slug`. They are never
  executed inside the admin UI — script fields are shown as plain text in
  `<textarea>` elements with `&` and `<` escaped.
- Login is rate-limited and CSRF tokens are required on every mutating admin
  POST.
- Session cookies are `httpOnly`, `sameSite=lax`, and `secure` in production.
- Sessions expire after 12 hours (checked server-side, not just by the cookie),
  and changing the password in **Settings** signs out every other session.
- Never expose the admin URL on an unauthenticated public host. Always
  password-protect it via `ADMIN_PASSWORD` (and, if possible, also gate the
  `/admin` path at the load balancer / reverse proxy with an IP allow-list).
- The public site at `/demo/:slug` only renders **published** demos. Drafts
  return 404 to unauthenticated visitors.

## File layout

```
adtech-demo/
  server.js               Express app & route handlers
  package.json
  .env.example
  README.md
  data/
    demos.json            Flat JSON store
  public/
    css/
      admin.css           Admin & login styling
      templates.css       Demo-page styling
    js/
      admin.js            Admin micro-interactions (copy, confirm, slug)
      templates.js        Sticky-ad close button
  views/
    login.html
    admin-list.html
    admin-edit.html
    template-news.html
    template-magazine.html
    template-landing.html
  src/
    storage.js            CRUD + JSON persistence
    auth.js               Session + CSRF + login helpers
    render.js             Tiny mustache-style template engine
    utils.js              uuid, slugify, escape helpers
```

## Future improvements

- Replace JSON storage with PostgreSQL / Supabase.
- Multi-user admin with role-based access.
- Per-template custom field overrides.
- Snapshot / version history per demo.
- Built-in code editor (CodeMirror or Monaco) for the script fields.
- Visual mobile preview toggle in the editor.
- Tag / project grouping for demos.

## Acceptance checklist

- [x] `npm install && npm start` works.
- [x] `/login` accepts `ADMIN_PASSWORD`.
- [x] Admin can create, edit, duplicate, publish, unpublish and delete demos.
- [x] Admin can paste HTML / JavaScript into ad placement fields.
- [x] Preview at `/preview/:slug` requires admin login.
- [x] Public demo at `/demo/:slug` is only available when published.
- [x] Three realistic templates: News, Magazine, Landing.
- [x] Snippets render in the correct placements.
- [x] Clean admin UI with search, status badges and quick actions.
