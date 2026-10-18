// ============================================================
// File:        theme-init.js
// Path:        client/public/theme-init.js
// Project:     Seasonal Entertainment
// Description: Runs before the first paint (a synchronous, external script in index.html's
//              <head>; the strict CSP forbids inline scripts): puts the theme on <html> so the
//              page never flashes the wrong one. Same rule as src/theme/theme.js: a stored
//              choice wins, else the system setting. themeInit.test.js keeps the two in step.
// ============================================================

(function () {
  var theme = null;
  try {
    theme = window.localStorage.getItem('se.theme');
  } catch {
    // Storage blocked: follow the system setting.
  }
  if (theme !== 'light' && theme !== 'dark') {
    var dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    theme = dark ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-theme', theme);
})();
