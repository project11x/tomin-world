// URL <-> open-state sync.
//   /                              desktop, no windows
//   /projects/<folder>             folder open in finder window (focused)
//   /projects/<folder>?also=a,b    background windows behind focused
//   /projects/<folder>/<item>      item open in Quick Look or Magazine reader
//
// Direct entry on /projects/<folder>/<item>  → "share-mode" white overlay
// covers desktop, with a "Schließen für mehr Projekte" button. Once the
// user dismisses the overlay, it never returns in this session.

import { portfolioData } from '../../data.js';
import { folderToSlug, slugToFolder, itemToSlug, slugToItem } from './slugs.js';
import { createWindow } from '../desktop/windows.js';

const baseTitle = () =>
  (window.__appIcons && window.__appIcons[window.__appIconChoice]?.name) || 'Shouli';

let applying = false;
let shareOverlayEl = null;
let shareOverlayActive = false;

function ensureShareOverlay() {
  if (shareOverlayEl) return shareOverlayEl;
  const isDark = document.documentElement.classList.contains('dark');
  shareOverlayEl = document.createElement('div');
  shareOverlayEl.id = 'share-mode-overlay';
  shareOverlayEl.style.cssText = `
    position:fixed; inset:0; z-index:99996;
    background:${isDark ? '#0a0a0a' : '#ffffff'};
    transition:opacity 380ms ease;
    pointer-events:auto;
  `;
  const btn = document.createElement('button');
  btn.id = 'share-mode-close';
  btn.textContent = '← Schließen für mehr Projekte';
  btn.style.cssText = `
    position:fixed; left:50%; bottom:40px; transform:translateX(-50%);
    z-index:99997; padding:12px 22px; border-radius:999px;
    background:${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.85)'};
    color:${isDark ? '#fff' : '#fff'}; border:none; cursor:pointer;
    font-size:13px; font-weight:500; letter-spacing:0.01em;
    box-shadow:0 10px 30px rgba(0,0,0,0.20); backdrop-filter:blur(20px);
    transition:opacity 380ms ease, transform 200ms ease;
  `;
  btn.addEventListener('click', dismissShareOverlay);
  document.body.appendChild(shareOverlayEl);
  document.body.appendChild(btn);
  shareOverlayEl._btn = btn;
  return shareOverlayEl;
}

function showShareOverlay() {
  ensureShareOverlay();
  shareOverlayActive = true;
  document.body.classList.add('share-mode');
  shareOverlayEl.style.display = 'block';
  shareOverlayEl._btn.style.display = 'block';
  // The Quick Look / Magazine modal sits above (z-[100] + bringToFront pushes
  // higher), but our overlay is z 99996 below the modal — perfect.
  // Disable dragging on QuickLook while in share mode.
  const ql = document.getElementById('quick-look-modal');
  if (ql) ql.dataset.shareMode = 'true';
}

export function dismissShareOverlay() {
  if (!shareOverlayActive) return;
  markVisited();
  shareOverlayEl.style.opacity = '0';
  shareOverlayEl._btn.style.opacity = '0';
  setTimeout(() => {
    shareOverlayEl.style.display = 'none';
    shareOverlayEl._btn.style.display = 'none';
    shareOverlayEl.style.opacity = '1';
    shareOverlayEl._btn.style.opacity = '1';
  }, 400);
  shareOverlayActive = false;
  document.body.classList.remove('share-mode');
  const ql = document.getElementById('quick-look-modal');
  if (ql) { delete ql.dataset.shareMode; ql.style.zIndex = ''; }
  const mag = document.getElementById('magazine-reader');
  if (mag) mag.style.zIndex = '';
  // Open the folder behind so closing the item reveals context.
  const m = location.pathname.match(/^\/projects\/([^/]+)\/[^/]+\/?$/);
  if (m) {
    const folder = slugToFolder(m[1]);
    if (folder && !document.querySelector(`.finder-window[data-folder="${CSS.escape(folder)}"]`)) {
      createWindow(folder);
    }
  }
}

function bumpModalAboveOverlay() {
  const ql = document.getElementById('quick-look-modal');
  const mag = document.getElementById('magazine-reader');
  if (ql && !ql.classList.contains('hidden') && ql.style.zIndex !== '99998') ql.style.zIndex = '99998';
  if (mag && Number(mag.style.zIndex || 0) < 99998) mag.style.zIndex = '99998';
}

function openItemForRoute(folder, itemIndex) {
  const item = portfolioData[folder][itemIndex];
  const isMag = !!portfolioData[`${folder}/${item.name}`];
  if (isMag) {
    if (window.openMagazineReader) window.openMagazineReader(folder, itemIndex);
  } else {
    if (window.openQuickLook) window.openQuickLook(item);
  }
}

function syncURL() {
  if (applying) return;
  if (window.innerWidth <= 768) return;

  const wins = Array.from(document.querySelectorAll('.finder-window'))
    .sort((a, b) => Number(a.style.zIndex || 0) - Number(b.style.zIndex || 0));

  let target = '/';
  let title = baseTitle();

  if (wins.length > 0) {
    const focused = wins[wins.length - 1];
    const focusedFolder = focused.dataset.folder || '';
    const focusedSlug = folderToSlug(focusedFolder);
    if (!focusedSlug) return;
    const others = wins.slice(0, -1)
      .map((w) => folderToSlug(w.dataset.folder || ''))
      .filter(Boolean);
    target = `/projects/${focusedSlug}`;
    if (others.length) target += `?also=${others.join(',')}`;
    title = `${focusedFolder} — ${baseTitle()}`;
  }

  const current = location.pathname + location.search;
  if (current !== target) history.pushState({ target }, '', target);
  document.title = title;
  const og = document.querySelector('meta[property="og:title"]');
  if (og) og.setAttribute('content', title);
}

function markVisited() {
  try { sessionStorage.setItem('shouli-visited', '1'); } catch (e) {}
}

let scheduled = false;
window.addEventListener('window-changed', () => {
  markVisited();
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => { scheduled = false; syncURL(); });
});

// Public hook: window.handleItemClick wraps this so URL reflects current item.
export function pushItemRoute(folder, itemIndex) {
  if (window.innerWidth <= 768) return;
  const fs = folderToSlug(folder);
  const is = itemToSlug(folder, itemIndex);
  if (!fs || !is) return;
  const target = `/projects/${fs}/${is}`;
  if (location.pathname + location.search !== target) {
    history.pushState({ target }, '', target);
  }
  const item = portfolioData[folder]?.[itemIndex];
  if (item) document.title = `${item.name} — ${baseTitle()}`;
}

export function popItemRoute() {
  if (window.innerWidth <= 768) return;
  // After closing item, restore folder URL if a finder window is still open.
  const m = location.pathname.match(/^\/projects\/([^/]+)\/[^/]+\/?$/);
  if (!m) return;
  const folder = slugToFolder(m[1]);
  if (!folder) { history.replaceState({}, '', '/'); return; }
  history.replaceState({}, '', `/projects/${folderToSlug(folder)}`);
  document.title = `${folder} — ${baseTitle()}`;
}

function applyURL() {
  const isMobile = window.innerWidth <= 768;

  // Item route: /projects/<folder>/<item>
  const itemMatch = location.pathname.match(/^\/projects\/([^/]+)\/([^/]+)\/?$/);
  // Folder route: /projects/<folder>
  const folderMatch = location.pathname.match(/^\/projects\/([^/]+)\/?$/);

  if (itemMatch) {
    const folder = slugToFolder(itemMatch[1]);
    if (!folder) return;
    const it = slugToItem(folder, itemMatch[2]);
    if (!it) return;

    // Detect a fresh external arrival (shared-link visit) vs an in-session
    // navigation / refresh. Set a session flag once we've shown the site
    // normally — every subsequent route resolution skips the share-mode.
    const fromSelf = !!document.referrer && document.referrer.startsWith(location.origin);
    const visitedThisSession = sessionStorage.getItem('shouli-visited') === '1';
    const isSharedArrival = !fromSelf && !visitedThisSession && !shareOverlayActive;

    if (isMobile) {
      // Wait until the iOS module has registered its dispatcher, then route
      // the deep-link to the right app + item.
      const tryOpen = (n = 40) => {
        if (window.iosOpenItem) { window.iosOpenItem(folder, it.index); return; }
        if (n <= 0) return;
        setTimeout(() => tryOpen(n - 1), 80);
      };
      tryOpen();
      return;
    }

    // Desktop: open the item. If this is a shared-link arrival, drop the
    // white share-mode overlay; otherwise just open it on top of the
    // existing desktop (an own reload should look like the desktop).
    applying = true;
    if (isSharedArrival) {
      document.querySelectorAll('.finder-window').forEach((w) => w.remove());
    } else {
      // Make sure the folder is open behind, like a normal in-app open.
      const open = Array.from(document.querySelectorAll('.finder-window'))
        .some((w) => w.dataset.folder === folder);
      if (!open) createWindow(folder);
    }
    applying = false;

    if (isSharedArrival) {
      showShareOverlay();
      setTimeout(() => {
        openItemForRoute(folder, it.index);
        bumpModalAboveOverlay();
      }, 50);
      let bumps = 0;
      const bumpTimer = setInterval(() => {
        bumpModalAboveOverlay();
        if (++bumps > 12 || !shareOverlayActive) clearInterval(bumpTimer);
      }, 60);
    } else {
      setTimeout(() => openItemForRoute(folder, it.index), 50);
    }
    document.title = `${it.item.name} — ${baseTitle()}`;
    return;
  }

  if (isMobile) {
    if (folderMatch) {
      const folder = slugToFolder(folderMatch[1]);
      if (folder) {
        const tryOpen = (n = 40) => {
          if (window.iosOpenFolder) { window.iosOpenFolder(folder); return; }
          if (n <= 0) return;
          setTimeout(() => tryOpen(n - 1), 80);
        };
        tryOpen();
      }
    }
    return; // mobile handles its own UI for everything else
  }

  if (folderMatch) {
    const folder = slugToFolder(folderMatch[1]);
    if (!folder) return;
    applying = true;
    document.querySelectorAll('.finder-window').forEach((w) => w.remove());
    const params = new URLSearchParams(location.search);
    const also = (params.get('also') || '')
      .split(',').filter(Boolean).map(slugToFolder).filter(Boolean);
    also.forEach((f) => createWindow(f));
    createWindow(folder);
    applying = false;
    document.title = `${folder} — ${baseTitle()}`;
    return;
  }

  // root
  applying = true;
  document.querySelectorAll('.finder-window').forEach((w) => w.remove());
  applying = false;
  document.title = baseTitle();
}

window.addEventListener('item-opened', (e) => {
  if (!e.detail) return;
  pushItemRoute(e.detail.folder, e.detail.index);
});
window.addEventListener('item-closed', () => {
  if (shareOverlayActive) dismissShareOverlay();
  popItemRoute();
});

window.addEventListener('popstate', applyURL);

// Defer to a microtask so any synchronous setup queued after the
// imports in app.js (e.g. the R2_BASE_URL prefix loop on portfolioData)
// completes before applyURL renders. Without this, a reload at
// /projects/<folder> opens the finder window with raw, un-prefixed
// item.src values and every thumbnail shows the broken-image marker.
function bootApplyURL() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyURL, { once: true });
  } else {
    applyURL();
  }
}
queueMicrotask(bootApplyURL);
