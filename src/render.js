const fs = require('fs');
const path = require('path');
const { escapeHtml, escapeForTextarea, formatDate } = require('./utils');

const VIEW_DIR = path.join(__dirname, '..', 'views');

const cache = new Map();
function loadView(name) {
  if (process.env.NODE_ENV !== 'production' && cache.has(name)) cache.delete(name);
  if (cache.has(name)) return cache.get(name);
  const file = path.join(VIEW_DIR, name);
  const tpl = fs.readFileSync(file, 'utf8');
  cache.set(name, tpl);
  return tpl;
}

// Replace {{key}} (escaped) and {{{key}}} (raw) tokens.
function fillTokens(template, data) {
  return template.replace(/\{\{\{\s*([\w.]+)\s*\}\}\}|\{\{\s*([\w.]+)\s*\}\}/g, (m, rawKey, escKey) => {
    const key = rawKey || escKey;
    const value = lookup(data, key);
    if (value == null) return '';
    return rawKey ? String(value) : escapeHtml(value);
  });
}

function lookup(obj, dotted) {
  return dotted.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
}

function renderAdSlot(html, label, { ctaClass = '', stripWhenEmpty = false, noWrapper = false } = {}) {
  const filled = html && String(html).trim();
  if (!filled) {
    if (stripWhenEmpty) return '';
    return `<div class="ad-slot ad-slot--empty ${ctaClass}" data-slot="${escapeHtml(label)}"><span class="ad-slot__hint">Ad placement · ${escapeHtml(label)}</span></div>`;
  }
  if (noWrapper) return html;
  return `<div class="ad-slot ${ctaClass}" data-slot="${escapeHtml(label)}">${html}</div>`;
}

function buildArticleBody(demo) {
  // Empty template: just emit the two in-article ads (if any), no copy, no wrappers.
  if (demo.template === 'empty') {
    return (
      renderAdSlot(demo.inArticleAdHtml, 'In-article', { stripWhenEmpty: true, noWrapper: true }) +
      renderAdSlot(demo.midArticleAdHtml, 'Mid-article', { stripWhenEmpty: true, noWrapper: true })
    );
  }
  // Split intrinsic article copy around the mid-article ad slot. The landing
  // hero is its own token so the top banner can sit directly under it.
  const intro = demo.template === 'landing' ? '' : articleIntro(demo);
  const beforeMid = articleBodyTop(demo);
  const afterMid = articleBodyBottom(demo);
  return `${intro}${renderAdSlot(demo.inArticleAdHtml, 'In-article')}${beforeMid}${renderAdSlot(demo.midArticleAdHtml, 'Mid-article')}${afterMid}`;
}

function articleIntro(demo) {
  const client = escapeHtml(demo.clientName || 'the client');
  return `
    <p class="lede">A live preview environment for <strong>${client}</strong>. This demo article exists so adtech and ad-ops teams can validate creatives, scripts and placements end-to-end before going live with a publisher.</p>
    <p>The body copy below is intentionally generic — the focus is on how the surrounding ad inventory behaves on a real publisher-style page. Scroll the page on desktop and mobile to verify viewability, sticky behaviour and responsive layouts.</p>
  `;
}

function articleBodyTop() {
  return `
    <h2>What this demo proves</h2>
    <p>Each placement on this page mirrors what a Nordic publisher partner would surface in production: above-the-fold banner, in-article slots, sidebar inventory and a sticky bottom ad. Drop in the creative — whether that's a Google Ad Manager tag, a Prebid wrapper, an in-house ad-server snippet or a vendor's preview script — and reload to see it render here.</p>
    <p>Because this is an internal tool we render snippets exactly as they are saved. That means third-party JavaScript runs, iframes load, and creative styles apply directly. Use it to walk a client through a campaign before launch.</p>
  `;
}

function articleBodyBottom() {
  return `
    <h2>Workflow</h2>
    <ol>
      <li>Pick a template that matches the publisher context.</li>
      <li>Paste the ad snippets into the relevant placement fields.</li>
      <li>Preview while drafting, then publish to share a clean URL.</li>
    </ol>
    <p>Need a different layout, a custom slot or a co-branded look? Note it in the internal description field and the team can iterate without losing the existing demo.</p>
    <blockquote>“The fastest way to align with a client on a creative is to show them the placement in context.” — Adops team</blockquote>
    <p>This block exists to push the sticky and footer ad slots far enough down the viewport that scroll behaviour is realistic. Real article copy would continue here with reporting, quotes and supporting media.</p>
  `;
}

function landingIntro(demo) {
  const client = escapeHtml(demo.clientName || 'your brand');
  const headline = escapeHtml(demo.title || 'A focused campaign experience');
  return `
    <section class="hero hero--landing">
      <span class="eyebrow">Campaign preview</span>
      <h1>${headline}</h1>
      <p class="hero__lede">Built for ${client}. A single-page demo environment for testing landing-page ad units, hero takeovers, and rich media without the friction of staging a real campaign.</p>
      <div class="hero__cta-row">
        <a class="btn-primary" href="#cta">Primary action</a>
        <a class="btn-ghost" href="#features">Secondary</a>
      </div>
    </section>
  `;
}

function templateFile(template) {
  switch (template) {
    case 'magazine': return 'template-magazine.html';
    case 'landing':  return 'template-landing.html';
    case 'empty':    return 'template-empty.html';
    case 'news':
    default:         return 'template-news.html';
  }
}

function renderStickyAd(html, { stripWhenEmpty = false, noWrapper = false } = {}) {
  const filled = html && String(html).trim();
  if (!filled) {
    if (stripWhenEmpty) return '';
    return `<div class="sticky-ad sticky-ad--empty" data-slot="Sticky"><span class="ad-slot__hint">Ad placement · Sticky bottom</span><button type="button" class="sticky-ad__close" aria-label="Close">×</button></div>`;
  }
  if (noWrapper) return html;
  return `<div class="sticky-ad" data-slot="Sticky">${html}<button type="button" class="sticky-ad__close" aria-label="Close">×</button></div>`;
}

function renderDemoPage(demo, { isPreview = false } = {}) {
  const tpl = loadView(templateFile(demo.template));
  const isEmpty = demo.template === 'empty';
  // On the empty template: drop the dashed "Ad placement" placeholders and the
  // .ad-slot wrappers, so the page is truly blank apart from the pasted scripts.
  const slotOpts = { stripWhenEmpty: isEmpty, noWrapper: isEmpty };
  const data = {
    title: demo.title || 'Untitled demo',
    clientName: demo.clientName || '',
    slug: demo.slug || '',
    template: demo.template || 'news',
    updatedAtHuman: formatDate(demo.updatedAt),
    customCss: demo.customCss || '',
    headHtml: demo.headHtml || '',
    bodyEndHtml: demo.bodyEndHtml || '',
    headerAd: renderAdSlot(demo.headerAdHtml, 'Header', slotOpts),
    topAd: renderAdSlot(demo.topAdHtml, 'Top banner', slotOpts),
    sidebarAd: renderAdSlot(demo.sidebarAdHtml, 'Sidebar', slotOpts),
    stickyAd: renderStickyAd(demo.stickyAdHtml, slotOpts),
    footerAd: renderAdSlot(demo.footerAdHtml, 'Footer', slotOpts),
    hero: demo.template === 'landing' ? landingIntro(demo) : '',
    articleBody: buildArticleBody(demo),
    previewBadge: isPreview ? '<div class="preview-badge">Preview · not published</div>' : '',
  };
  return fillTokens(tpl, data);
}

function renderView(name, data = {}) {
  const tpl = loadView(name);
  return fillTokens(tpl, data);
}

module.exports = { renderDemoPage, renderView, escapeHtml, escapeForTextarea };
