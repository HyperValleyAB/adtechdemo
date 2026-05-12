(function () {
  // Confirm-before-submit for any form with data-confirm.
  document.addEventListener('submit', function (e) {
    const form = e.target;
    if (form && form.dataset && form.dataset.confirm) {
      if (!window.confirm(form.dataset.confirm)) {
        e.preventDefault();
      }
    }
  });

  // Copy-to-clipboard buttons (data-copy="value").
  document.addEventListener('click', function (e) {
    const btn = e.target.closest('[data-copy]');
    if (!btn) return;
    e.preventDefault();
    const text = btn.getAttribute('data-copy');
    const original = btn.textContent;
    const restore = () => { btn.textContent = original; };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        btn.textContent = 'Copied!';
        setTimeout(restore, 1400);
      });
    } else {
      // Fallback for non-secure contexts.
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); btn.textContent = 'Copied!'; } catch (err) { btn.textContent = 'Copy failed'; }
      document.body.removeChild(ta);
      setTimeout(restore, 1400);
    }
  });

  // Auto-slug from title when the slug field is still empty.
  const titleEl = document.getElementById('title');
  const slugEl = document.getElementById('slug');
  if (titleEl && slugEl) {
    let touched = slugEl.value.trim().length > 0;
    slugEl.addEventListener('input', () => { touched = true; });
    titleEl.addEventListener('input', () => {
      if (touched) return;
      slugEl.value = titleEl.value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
    });
  }

  // Warn before navigating away with unsaved changes.
  const editorForm = document.getElementById('editor-form');
  if (editorForm) {
    let dirty = false;
    editorForm.addEventListener('input', () => { dirty = true; });
    editorForm.addEventListener('submit', () => { dirty = false; });
    window.addEventListener('beforeunload', (e) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = '';
    });
  }
})();
