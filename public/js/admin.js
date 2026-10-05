(function () {
  // Password reveal toggle. <button class="password-toggle" aria-controls="…">
  document.addEventListener('click', function (e) {
    const btn = e.target.closest('.password-toggle');
    if (!btn) return;
    e.preventDefault();
    const id = btn.getAttribute('aria-controls');
    const input = id && document.getElementById(id);
    if (!input) return;
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    btn.setAttribute('aria-pressed', String(!showing));
    btn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
  });

  // Unsaved-changes tracking for the demo editor.
  const editorForm = document.getElementById('editor-form');
  let dirty = false;
  if (editorForm) {
    editorForm.addEventListener('input', () => { dirty = true; });
    window.addEventListener('beforeunload', (e) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = '';
    });
  }

  // Confirm-before-submit for any form with data-confirm, and for any other
  // form (Duplicate, Sign out) that would throw away unsaved editor changes.
  document.addEventListener('submit', function (e) {
    const form = e.target;
    if (form === editorForm) { dirty = false; return; }
    let message = form && form.dataset && form.dataset.confirm;
    if (!message && dirty) message = 'You have unsaved changes. They will be lost if you continue.';
    if (message && !window.confirm(message)) {
      e.preventDefault();
      return;
    }
    // Already confirmed; don't ask again on the way out.
    dirty = false;
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
})();
