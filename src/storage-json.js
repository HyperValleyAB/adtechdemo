const fs = require('fs');
const path = require('path');
const { uuid, slugify } = require('./utils');

const DATA_FILE = path.join(__dirname, '..', 'data', 'demos.json');

const TEMPLATES = ['news', 'magazine', 'landing'];
const STATUSES = ['draft', 'published'];

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

let writeQueue = Promise.resolve();

function ensureFile() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]\n', 'utf8');
}

function readAll() {
  ensureFile();
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('[storage] failed to read demos.json:', err.message);
    return [];
  }
}

function writeAll(items) {
  // Serialize writes so two concurrent saves can't clobber each other.
  writeQueue = writeQueue.then(
    () => new Promise((resolve, reject) => {
      const tmp = DATA_FILE + '.tmp';
      fs.writeFile(tmp, JSON.stringify(items, null, 2) + '\n', 'utf8', (err) => {
        if (err) return reject(err);
        fs.rename(tmp, DATA_FILE, (err2) => (err2 ? reject(err2) : resolve()));
      });
    }),
  );
  return writeQueue;
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

function uniqueSlug(base, excludeId) {
  const items = readAll();
  let candidate = slugify(base) || 'demo';
  let n = 1;
  while (items.some((d) => d.slug === candidate && d.id !== excludeId)) {
    n += 1;
    candidate = `${slugify(base) || 'demo'}-${n}`;
  }
  return candidate;
}

async function listDemos({ search } = {}) {
  let items = readAll().slice();
  if (search) {
    const q = search.toLowerCase().trim();
    items = items.filter((d) =>
      [d.title, d.slug, d.clientName, d.description].some((v) => String(v || '').toLowerCase().includes(q)),
    );
  }
  items.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  return items;
}

async function getById(id) {
  return readAll().find((d) => d.id === id) || null;
}

async function getBySlug(slug) {
  return readAll().find((d) => d.slug === slug) || null;
}

async function createDemo(input) {
  const demo = normalize(input);
  demo.id = uuid();
  demo.slug = uniqueSlug(demo.slug || demo.title || demo.clientName);
  const now = new Date().toISOString();
  demo.createdAt = now;
  demo.updatedAt = now;
  const items = readAll();
  items.push(demo);
  await writeAll(items);
  return demo;
}

async function updateDemo(id, input) {
  const items = readAll();
  const idx = items.findIndex((d) => d.id === id);
  if (idx === -1) return null;
  const merged = normalize({ ...items[idx], ...input });
  merged.id = items[idx].id;
  merged.createdAt = items[idx].createdAt;
  merged.slug = uniqueSlug(merged.slug || merged.title || merged.clientName, id);
  merged.updatedAt = new Date().toISOString();
  items[idx] = merged;
  await writeAll(items);
  return merged;
}

async function deleteDemo(id) {
  const items = readAll();
  const next = items.filter((d) => d.id !== id);
  if (next.length === items.length) return false;
  await writeAll(next);
  return true;
}

async function duplicateDemo(id) {
  const src = readAll().find((d) => d.id === id) || null;
  if (!src) return null;
  const copy = { ...src };
  delete copy.id;
  copy.title = `${src.title || 'Untitled demo'} (copy)`;
  copy.slug = uniqueSlug(`${src.slug || 'demo'}-copy`);
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
