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
  if (ql) delete ql.dataset.shareMode;
  // Open the folder behind so closing the item reveals context.
  const m = location.pathname.match(/^\/projects\/([^/]+)\/[^/]+\/?$/);
  if (m) {
    const folder = slugToFolder(m[1]);
    if (folder && !document.querySelector(`.finder-window[data-folder="${CSS.escape(folder)}"]`)) {
      createWindow(folder);
    }
  }
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

let scheduled = false;
window.addEventListener('window-changed', () => {
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

    if (isMobile) {
      // Mobile: open the item directly via existing iOS handlers.
      const isMag = !!portfolioData[`${folder}/${it.item.name}`];
      const wait = (cb, n = 30) => {
        if (n === 0) return;
        if (isMag && window.iosTapMagazine) { window.iosTapMagazine(folder, it.index); return; }
        if (!isMag) {
          // Try edits app first if it's a video
          if (it.item.isVideo && window.iosOpenEdits) {
            window.iosOpenEdits();
            // edits app shows list; we won't auto-select to avoid surprise
            return;
          }
          if (window.iosOpenBts) { window.iosOpenBts(); return; }
        }
        setTimeout(() => wait(cb, n - 1), 100);
      };
      wait();
      return;
    }

    // Desktop: open quick look / magazine + show share overlay.
    applying = true;
    document.querySelectorAll('.finder-window').forEach((w) => w.remove());
    applying = false;

    showShareOverlay();
    setTimeout(() => openItemForRoute(folder, it.index), 50);
    document.title = `${it.item.name} — ${baseTitle()}`;
    return;
  }

  if (isMobile) return; // mobile keeps its own UI for /

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

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', applyURL, { once: true });
} else {
  applyURL();
}
