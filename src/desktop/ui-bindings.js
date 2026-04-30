// Centralised UI bindings. Replaces every former inline `onclick="…"`
// in index.html. Each section maps a `data-*` attribute or known id to
// the function that should run on click. New widgets should wire here.

import { setDarkMode, setTheme } from './system-bar.js';

(function bindUIHandlers() {
  const $ = (id) => document.getElementById(id);
  const $$ = (sel) => document.querySelectorAll(sel);
  const on = (el, fn) => el && el.addEventListener('click', fn);

  // Top bar
  on($('top-eddie'), () => location.reload());
  on($('theme-item-light'), () => setDarkMode(false));
  on($('theme-item-dark'), () => setDarkMode(true));
  on($('theme-item-default'), () => setTheme('default'));
  on($('theme-item-glass'), () => setTheme('glass'));
  on($('theme-item-pink'), () => setTheme('pink'));

  // Desktop dock
  $$('[data-dock]').forEach((el) => {
    const target = el.dataset.dock;
    on(el, () => {
      if (target === 'edits') window.openEditsViewer();
      else if (target === 'finder') window.handleFinderClick();
      else if (target === 'contact') window.openAboutMeModal();
    });
  });

  // iOS dock (open apps)
  $$('[data-ios-app]').forEach((el) => {
    on(el, (e) => {
      const app = el.dataset.iosApp;
      const fn = window['iosOpen' + app[0].toUpperCase() + app.slice(1)];
      if (fn) fn(e);
    });
  });

  // iOS app close / back buttons
  const closeMap = {
    magazines: 'iosCloseMagazines',
    reader: 'iosCloseReader',
    edits: 'iosCloseEdits',
    bts: 'iosCloseBts',
    contact: 'iosCloseContact',
    'bts-back': 'iosBtsBackToFolders',
    'bts-viewer': 'iosBtsCloseViewer',
  };
  $$('[data-ios-close]').forEach((el) => {
    on(el, () => {
      const fn = window[closeMap[el.dataset.iosClose]];
      if (fn) fn();
    });
  });

  // iOS theme picker
  $$('[data-ios-theme]').forEach((el) => {
    on(el, () => window.setIosTheme(el.dataset.iosTheme));
  });

  // App icon picker
  $$('[data-app-icon]').forEach((el) => {
    on(el, () => window.setAppIcon(el.dataset.appIcon, el));
  });

})();

