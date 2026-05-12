# Deploy: Vercel + Supabase

## 1. Supabase setup (5 min)

1. **Run the schema.** Open Supabase → SQL Editor → New query → paste the
   contents of [`supabase-schema.sql`](./supabase-schema.sql) → Run.
   This creates `demos` and `auth_settings` tables with RLS enabled.

2. **Grab the service-role key.** Supabase → Project Settings → API →
   "Project API keys" → copy the **`service_role`** key (NOT `anon` /
   publishable). This key bypasses RLS — it must stay server-side only.

3. **Verify the project URL.** Same page, top — it looks like
   `https://<project-ref>.supabase.co`.

## 2. Push the repo to GitHub

```bash
cd adtech-demo
git init
git add .
git commit -m "Initial commit"
gh repo create --private --source=. --push    # or push manually
```

## 3. Vercel setup (5 min)

1. Vercel dashboard → **Add New → Project** → import the GitHub repo.
2. **Framework Preset:** "Other" (Vercel auto-detects `vercel.json`).
3. **Build Command:** leave empty (no build step).
4. **Output Directory:** leave empty.
5. **Environment Variables:**

   | Name | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `SESSION_SECRET` | `openssl rand -hex 32` and paste the result |
   | `ADMIN_PASSWORD` | Strong bootstrap password — you'll change it in Settings after first login |
   | `SUPABASE_URL` | `https://everqtbtzawqkpnxdapk.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | The service-role key from step 1.2 |

6. Click **Deploy**. Wait ~30 seconds.

## 4. Custom domain (5 min)

1. Vercel → your project → **Settings → Domains** → add
   `demo.leeadsadprofit.com`.
2. Vercel will show you a CNAME target (looks like `cname.vercel-dns.com`).
3. At your DNS provider for `leeadsadprofit.com`, add:

   ```
   Type:  CNAME
   Name:  demo
   Value: cname.vercel-dns.com.
   ```

4. Wait 1-5 min for propagation. Vercel auto-issues a Let's Encrypt cert.

## 5. First sign-in (1 min)

1. Visit `https://demo.leeadsadprofit.com/login`.
2. Use the `ADMIN_PASSWORD` you set above.
3. Go to **Settings → Change password** and set the real password.
4. After that you can delete `ADMIN_PASSWORD` from Vercel's env vars (or keep
   it — it's ignored once a stored hash exists).

## 6. Verify

- Create a demo, paste an ad snippet, **publish**.
- Open `https://demo.leeadsadprofit.com/demo/<slug>` in incognito → loads
  without login.
- `/admin` in incognito → redirects to `/login`.

---

## Architecture notes

- **Storage:** demo rows live in Supabase Postgres (`demos` table). Local dev
  with no Supabase env vars falls back to `data/demos.json`.
- **Auth:** stateless. Signed cookie (`adtech.auth`, HMAC-SHA256) carries
  `{isAdmin, loginAt}`. Survives Vercel cold starts because nothing is in
  memory.
- **CSRF:** double-submit cookie (`adtech.csrf`). Every form POST sends the
  token both as a cookie and as a hidden field — they must match.
- **Password storage:** scrypt hash + salt in `auth_settings` (single row).
  `ADMIN_PASSWORD` env var is only the bootstrap.

## Troubleshooting

**"SESSION_SECRET is required" at startup.**
Add the env var in Vercel → Settings → Environment Variables.

**Login works locally but not in Vercel.**
Check that `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set. Without
them, the app tries the JSON fallback — which has no persistent disk on
Vercel.

**"Cannot connect to Supabase".**
Verify the project URL ends with `.supabase.co` (no trailing slash) and the
service-role key starts with `sb_secret_` or `eyJ` (JWT).

**Cookies don't persist on `demo.leeadsadprofit.com`.**
Make sure `NODE_ENV=production` is set so the cookie flag `secure: true` is
applied. Browsers reject secure cookies over HTTP.

## Cost on Pro accounts

- **Vercel Pro** ($20/seat/mo, already paid): function execution + bandwidth
  for this app are negligible.
- **Supabase Pro** ($25/project/mo, already paid): tens of bytes per demo —
  you can store millions of demos before noticing.

**Incremental cost of this project: $0.**
