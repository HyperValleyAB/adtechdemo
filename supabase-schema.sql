-- Adtech Demo — Supabase schema
-- Paste this into Supabase → SQL Editor → New query → Run.
-- It is idempotent: safe to re-run.

-- ---------------- demos ----------------

create table if not exists public.demos (
  id uuid primary key default gen_random_uuid(),
  title               text not null default '',
  slug                text not null unique,
  client_name         text not null default '',
  description         text not null default '',
  status              text not null default 'draft'   check (status   in ('draft','published')),
  template            text not null default 'news'    check (template in ('news','magazine','landing')),
  custom_css          text not null default '',
  head_html           text not null default '',
  header_ad_html      text not null default '',
  top_ad_html         text not null default '',
  in_article_ad_html  text not null default '',
  mid_article_ad_html text not null default '',
  sidebar_ad_html     text not null default '',
  sticky_ad_html      text not null default '',
  footer_ad_html      text not null default '',
  body_end_html       text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists demos_updated_at_idx on public.demos (updated_at desc);
create index if not exists demos_status_idx     on public.demos (status);

-- ---------------- auth_settings ----------------
-- Single-row table: stores the scrypt hash of the admin password.

create table if not exists public.auth_settings (
  id integer primary key check (id = 1),
  password_hash text not null,
  updated_at timestamptz not null default now()
);

-- ---------------- security ----------------
-- The server uses the service_role key which BYPASSES RLS.
-- Enabling RLS without policies = "deny all" to anon / authenticated /
-- publishable key. This is defence-in-depth: even if the publishable key
-- is leaked, no one can read or write these tables from the browser.

alter table public.demos          enable row level security;
alter table public.auth_settings  enable row level security;
