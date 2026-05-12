// Supabase-backed implementation of the storage interface.
// Exports match src/storage-json.js exactly.

const { createClient } = require('@supabase/supabase-js');
const { slugify } = require('./utils');

const TEMPLATES = ['news', 'magazine', 'landing', 'empty'];
const STATUSES  = ['draft', 'published'];

const SCRIPT_FIELDS = [
  'customCss',
  'headHtml',
  'headerAdHtml',
  'topAdHtml',
  'inArticleAdHtml',
  'midArticleAdHtml',
  'sidebarAdHtml',
  'stickyAdHtml',
  'footerAdHtml',
  'bodyEndHtml',
];

const STRING_FIELDS = ['title', 'slug', 'clientName', 'description', 'status', 'template', ...SCRIPT_FIELDS];

const COLUMN_MAP = {
  id: 'id',
  title: 'title',
  slug: 'slug',
  clientName: 'client_name',
  description: 'description',
  status: 'status',
  template: 'template',
  customCss: 'custom_css',
  headHtml: 'head_html',
  headerAdHtml: 'header_ad_html',
  topAdHtml: 'top_ad_html',
  inArticleAdHtml: 'in_article_ad_html',
  midArticleAdHtml: 'mid_article_ad_html',
  sidebarAdHtml: 'sidebar_ad_html',
  stickyAdHtml: 'sticky_ad_html',
  footerAdHtml: 'footer_ad_html',
  bodyEndHtml: 'body_end_html',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
};

const REVERSE_MAP = Object.fromEntries(Object.entries(COLUMN_MAP).map(([k, v]) => [v, k]));

const SELECT_COLS = Object.values(COLUMN_MAP).join(',');

let client = null;
function getClient() {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

function toDemo(row) {
  if (!row) return null;
  const out = emptyDemo();
  for (const [col, val] of Object.entries(row)) {
    const key = REVERSE_MAP[col];
    if (!key) continue;
    if (key === 'createdAt' || key === 'updatedAt') {
      out[key] = val ? new Date(val).toISOString() : '';
    } else {
      out[key] = val == null ? '' : String(val);
    }
  }
  return out;
}

function toRow(demo, { includeTimestamps = false } = {}) {
  const row = {};
  for (const f of STRING_FIELDS) {
    if (demo[f] != null) row[COLUMN_MAP[f]] = String(demo[f]);
  }
  if (includeTimestamps) {
    if (demo.createdAt) row.created_at = demo.createdAt;
    if (demo.updatedAt) row.updated_at = demo.updatedAt;
  }
  return row;
}

function emptyDemo() {
  const out = { id: '', title: '', slug: '', clientName: '', description: '', status: 'draft', template: 'news' };
  for (const f of SCRIPT_FIELDS) out[f] = '';
  out.createdAt = '';
  out.updatedAt = '';
  return out;
}

function normalize(raw) {
  const demo = emptyDemo();
  for (const f of STRING_FIELDS) {
    if (raw[f] != null) demo[f] = String(raw[f]);
  }
  if (!TEMPLATES.includes(demo.template)) demo.template = 'news';
  if (!STATUSES.includes(demo.status)) demo.status = 'draft';
  return demo;
}

async function uniqueSlug(base, excludeId) {
  const supabase = getClient();
  const baseSlug = slugify(base) || 'demo';
  let candidate = baseSlug;
  let n = 1;
  // Bounded loop so we don't spin if something is wrong.
  for (let i = 0; i < 200; i += 1) {
    const query = supabase.from('demos').select('id').eq('slug', candidate).limit(1);
    const { data, error } = await query;
    if (error) throw error;
    const taken = (data || []).some((row) => row.id !== excludeId);
    if (!taken) return candidate;
    n += 1;
    candidate = `${baseSlug}-${n}`;
  }
  return `${baseSlug}-${Date.now()}`;
}

async function listDemos({ search } = {}) {
  const supabase = getClient();
  let query = supabase.from('demos').select(SELECT_COLS).order('updated_at', { ascending: false });
  if (search && search.trim()) {
    const q = search.trim();
    // Postgres ilike — escape SQL wildcards in the user input.
    const safe = q.replace(/[\\%_]/g, (m) => `\\${m}`);
    const term = `%${safe}%`;
    query = query.or(`title.ilike.${term},slug.ilike.${term},client_name.ilike.${term},description.ilike.${term}`);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(toDemo);
}

async function getById(id) {
  const supabase = getClient();
  const { data, error } = await supabase.from('demos').select(SELECT_COLS).eq('id', id).maybeSingle();
  if (error && error.code !== 'PGRST116') throw error;
  return toDemo(data);
}

async function getBySlug(slug) {
  const supabase = getClient();
  const { data, error } = await supabase.from('demos').select(SELECT_COLS).eq('slug', slug).maybeSingle();
  if (error && error.code !== 'PGRST116') throw error;
  return toDemo(data);
}

async function createDemo(input) {
  const supabase = getClient();
  const demo = normalize(input);
  demo.slug = await uniqueSlug(demo.slug || demo.title || demo.clientName);
  const row = toRow(demo);
  const { data, error } = await supabase.from('demos').insert(row).select(SELECT_COLS).single();
  if (error) throw error;
  return toDemo(data);
}

async function updateDemo(id, input) {
  const supabase = getClient();
  const existing = await getById(id);
  if (!existing) return null;
  const merged = normalize({ ...existing, ...input });
  merged.slug = await uniqueSlug(merged.slug || merged.title || merged.clientName, id);
  const row = toRow(merged);
  row.updated_at = new Date().toISOString();
  const { data, error } = await supabase.from('demos').update(row).eq('id', id).select(SELECT_COLS).single();
  if (error) throw error;
  return toDemo(data);
}

async function deleteDemo(id) {
  const supabase = getClient();
  const { error, count } = await supabase.from('demos').delete({ count: 'exact' }).eq('id', id);
  if (error) throw error;
  return Boolean(count);
}

async function duplicateDemo(id) {
  const src = await getById(id);
  if (!src) return null;
  const copy = { ...src };
  delete copy.id;
  copy.title = `${src.title || 'Untitled demo'} (copy)`;
  copy.slug = `${src.slug || 'demo'}-copy`;
  copy.status = 'draft';
  return createDemo(copy);
}

async function setStatus(id, status) {
  if (!STATUSES.includes(status)) return null;
  return updateDemo(id, { status });
}

module.exports = {
  TEMPLATES,
  STATUSES,
  SCRIPT_FIELDS,
  emptyDemo,
  listDemos,
  getById,
  getBySlug,
  createDemo,
  updateDemo,
  deleteDemo,
  duplicateDemo,
  setStatus,
};
