/* Applies the saved theme before first paint (kept as a file because CSP blocks inline scripts). */
(function () {
  var mq = window.matchMedia('(prefers-color-scheme: dark)');
  function apply() {
    var pref = null;
    try { pref = localStorage.getItem('vault.theme'); } catch (e) {}
    var dark = pref === 'dark' || (pref !== 'light' && mq.matches);
    document.documentElement.setAttribute('data-bs-theme', dark ? 'dark' : 'light');
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', dark ? '#0c1620' : '#0f6f68');
  }
  window.applyTheme = apply;
  apply();
  if (mq.addEventListener) mq.addEventListener('change', apply);
})();
