(function () {
  const sticky = document.querySelector('.sticky-ad');

  // Pad the page by the sticky ad's height so it never covers the footer ad.
  // The creative loads asynchronously, so keep the padding in sync with it.
  function syncPadding() {
    const open = sticky && !sticky.classList.contains('is-closed');
    document.body.style.paddingBottom = open ? `${sticky.offsetHeight}px` : '';
  }
  if (sticky) {
    syncPadding();
    if (window.ResizeObserver) new ResizeObserver(syncPadding).observe(sticky);
  }

  document.addEventListener('click', function (e) {
    const close = e.target.closest('.sticky-ad__close');
    if (!close) return;
    const target = close.closest('.sticky-ad');
    if (target) target.classList.add('is-closed');
    syncPadding();
  });
})();
