(function () {
  document.addEventListener('click', function (e) {
    const close = e.target.closest('.sticky-ad__close');
    if (!close) return;
    const sticky = close.closest('.sticky-ad');
    if (sticky) sticky.classList.add('is-closed');
  });
})();
