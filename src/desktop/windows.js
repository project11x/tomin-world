import { EASE_SPRING } from '../utils/motion.js';
// Window manager: macOS-style finder windows, drag, fullscreen, About modal,
// item-click router (delegates to magazine reader / quick look in other modules).

import { portfolioData } from '../../data.js';
import { makeShareButton } from '../utils/share.js';
import { folderToSlug } from '../utils/slugs.js';
import { recentFolders, recentMagazines, isFolderRecent } from '../utils/recency.js';
import { posterForVideo, accentForFolder } from '../utils/edit-posters.js';
import { srcsetAttr } from '../utils/media.js';

let highestZIndex = 50;
export function bringToFront(element) {
  if (!element) return;
  highestZIndex++;
  element.style.zIndex = String(highestZIndex);
  if (element.classList && element.classList.contains('finder-window')) {
    window.dispatchEvent(new CustomEvent('window-changed'));
  }
}

function emitWindowChange() {
  window.dispatchEvent(new CustomEvent('window-changed'));
}

const finderTemplate = document.getElementById('finder-window-template');
let windowCount = 0;

window.openAboutMeModal = function () {
  const aboutModal = document.getElementById('about-me-modal');
  aboutModal.classList.remove('hidden');
  bringToFront(aboutModal);
};

document.getElementById('btn-close-about').onclick = () => {
  document.getElementById('about-me-modal').classList.add('hidden');
};

function withViewTransition(fn) {
  if (typeof document.startViewTransition === 'function') {
    let result;
    const tx = document.startViewTransition(() => { result = fn(); });
    return { result, transition: tx };
  }
  return { result: fn(), transition: null };
}

// FLIP open: the window grows out of the element that spawned it (desktop
// icon on dblclick) so it visibly "comes from somewhere" instead of popping
// into existence. Without a source it falls back to a subtle rise-and-fade.
function animateWindowOpen(win, sourceEl) {
  if (window.innerWidth <= 768) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const winRect = win.getBoundingClientRect();
  if (!winRect.width) return;
  let dx = 0, dy = 24, scale = 0.92;
  if (sourceEl && sourceEl.getBoundingClientRect) {
    const r = sourceEl.getBoundingClientRect();
    if (r.width) {
      dx = (r.left + r.width / 2) - (winRect.left + winRect.width / 2);
      dy = (r.top + r.height / 2) - (winRect.top + winRect.height / 2);
      scale = Math.max(0.08, r.width / winRect.width);
    }
  }
  // Mostly opaque from the first frame — a long fade would hide the small
  // early phase of the morph and the "grows out of the icon" read is lost.
  win.style.transformOrigin = 'center center';
  win.style.transition = 'none';
  win.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
  win.style.opacity = '0.45';
  void win.offsetWidth;
  win.style.transition =
    'transform 380ms ' + EASE_SPRING + ', opacity 120ms ease';
  win.style.transform = 'none';
  win.style.opacity = '1';
  setTimeout(() => {
    win.style.transition = '';
    win.style.transform = 'none';
    win.style.opacity = '';
    win.style.transformOrigin = '';
  }, 420);
}

export function createWindow(folderName, sourceEl = null) {
  if (!folderName || !portfolioData[folderName]) {
    // Fallback to first folder if key not found
    folderName = Object.keys(portfolioData).find(k => !k.includes('/')) || folderName;
  }

  // Reuse a previously-closed window for the same folder so already-decoded
  // <video>/<img> frames don't have to be rebuilt. animateClose hides the
  // window with data-hidden-closed instead of removing it.
  const reusable = [...document.querySelectorAll('.finder-window[data-hidden-closed="1"]')]
    .find(w => w.dataset.folder === folderName);
  if (reusable) {
    delete reusable.dataset.hiddenClosed;
    reusable.classList.remove('closing');
    reusable.style.display = 'flex';
    reusable.style.zIndex = ++highestZIndex;
    animateWindowOpen(reusable, sourceEl);
    emitWindowChange();
    return reusable;
  }

  windowCount++;
  const clone = finderTemplate.content.cloneNode(true);
  const win = clone.querySelector('.app-window');

  const id = `window-${windowCount}`;
  win.id = id;
  // Tag this window so the live R2 sync re-render hook can find it
  // without snagging the Quick Look / About modals (which also use the
  // .app-window class).
  win.classList.add('finder-window');
  win.dataset.folder = folderName;
  win.dataset.viewMode = 'grid';
  win.style.display = 'flex';
  win.style.zIndex = ++highestZIndex;

  // Detect Mobile
  const isMobile = window.innerWidth <= 768;

  if (isMobile) {
    win.style.width = '100%';
    win.style.height = '100%';
    win.style.left = '0';
    win.style.top = '0';
    win.style.borderRadius = '0';
    win.style.margin = '0';
    win.style.transform = 'none';
  } else {
    // Stagger initial position
    const offset = (windowCount % 10) * 30;
    win.style.left = `calc(50% + ${offset}px - 480px)`;
    win.style.top = `calc(50% + ${offset}px - 310px)`;
    win.style.transform = 'none';
    win.classList.remove('left-1/2', 'top-1/2', '-translate-x-1/2', '-translate-y-1/2', 'transform');
  }

  // Initial Focus
  win.addEventListener('mousedown', () => bringToFront(win));

  // Drag Logic
  const handles = win.querySelectorAll('.draggable-handle');
  handles.forEach(handle => {
    handle.onmousedown = (e) => {
      if (isMobile) return; // No dragging on mobile
      if (e.target.closest('.cursor-pointer') || e.target.closest('.btn-close-window') || e.target.closest('.btn-fullscreen-window') || e.target.closest('.favorites-nav') || e.target.closest('button')) return;
      bringToFront(win);
      win.classList.add('dragging-window');
      const rect = win.getBoundingClientRect();
      const offX = e.clientX - rect.left;
      const offY = e.clientY - rect.top;

      const move = (ev) => {
        win.style.left = `${ev.clientX - offX}px`;
        win.style.top = `${ev.clientY - offY}px`;
      };
      const up = () => {
        win.classList.remove('dragging-window');
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    };
  });

  // UI setup
  const animateClose = () => {
    if (win.classList.contains('closing')) return;
    win.classList.add('closing');
    // Hide instead of remove — decoded <video>/<img> frames stay alive so
    // re-opening the same folder is instant. createWindow revives this
    // node if data-hidden-closed is set.
    const done = () => {
      win.style.display = 'none';
      win.classList.remove('closing');
      win.dataset.hiddenClosed = '1';
      emitWindowChange();
    };
    win.addEventListener('animationend', done, { once: true });
    setTimeout(done, 260);
  };
  win.querySelector('.btn-close-window').onclick = animateClose;
  win.querySelector('.btn-minimize-window').onclick = animateClose;
  win.querySelector('.btn-fullscreen-window').onclick = () => toggleFullscreen(win);

  const btnGrid = win.querySelector('#btn-view-grid');
  const btnList = win.querySelector('#btn-view-list');

  const updateViewTabs = () => {
    if (!btnGrid || !btnList) return;
    const isGrid = win.dataset.viewMode === 'grid';
    btnGrid.dataset.active = String(isGrid);
    btnList.dataset.active = String(!isGrid);
  };

  if (btnGrid) btnGrid.onclick = () => {
    win.dataset.viewMode = 'grid';
    updateViewTabs();
    if (win.dataset.folder === '__recent__') renderRecentView(win);
    else renderFolderContent(win, win.dataset.folder);
  };
  if (btnList) btnList.onclick = () => {
    win.dataset.viewMode = 'list';
    updateViewTabs();
    if (win.dataset.folder === '__recent__') renderRecentView(win);
    else renderFolderContent(win, win.dataset.folder);
  };

  // Inject Favorites — extracted so we can re-run it when /api/portfolio
  // surfaces new folders after the live R2 sync.
  injectFavorites(win);

  updateViewTabs();
  renderFolderContent(win, folderName);
  // No view-transition on open: the snapshot pseudo dropped the window's
  // rounded corners and box-shadow, causing a brief square-edge flash and
  // a shadow pop at the end of the animation. Appending directly lets the
  // window appear with its real chrome already in place.
  document.getElementById('desktop-main').appendChild(win);
  animateWindowOpen(win, sourceEl);
  queueMicrotask(() => {
    win.querySelectorAll('video').forEach((v) => {
      if (v.readyState < 1) { try { v.load(); } catch {} }
      else if (v.videoWidth && v.currentTime === 0) { v.currentTime = 0.001; }
    });
  });
  window.umami?.track('folder-open', { folder: folderName });

  // Share button in the title bar (right of view toggles)
  const viewToggleParent = win.querySelector('#btn-view-grid')?.parentElement?.parentElement;
  if (viewToggleParent) {
    const shareBtn = makeShareButton({
      size: 18,
      getUrl: () => `${location.origin}/projects/${folderToSlug(win.dataset.folder)}`,
      getTitle: () => `${win.dataset.folder} — Shouli`,
    });
    shareBtn.style.marginLeft = '8px';
    viewToggleParent.appendChild(shareBtn);
  }

  emitWindowChange();
  return win;
}

function injectFavorites(win) {
  const favNav = win.querySelector('.favorites-nav');
  if (!favNav) return;
  const currentFolder = win.dataset.folder;
  favNav.innerHTML = '';
  Object.keys(portfolioData).forEach(key => {
    if (key.includes('/')) return;
    const a = document.createElement('a');
    a.className = "flex items-center space-x-2 px-2 py-1.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 rounded-md text-[12px] font-medium transition-colors cursor-pointer focus-nav-item select-none";
    a.innerHTML = `<span>${key}</span>`;
    if (key === currentFolder) {
      a.classList.add('bg-primary/15', 'text-primary', 'font-semibold');
      a.classList.remove('text-slate-600', 'dark:text-slate-400');
    }
    a.onclick = (e) => {
      e.stopPropagation();
      win.dataset.folder = key;
      if (win.dataset.folder === '__recent__' && !win.dataset.viewMode) win.dataset.viewMode = 'grid';
      renderFolderContent(win, key);
      injectFavorites(win);
      emitWindowChange();
    };
    favNav.appendChild(a);
  });
  bindNewTag(win);
}

function bindNewTag(win) {
  // Anchor on the pink dot — it's unique in the sidebar, so we don't have
  // to lean on flaky utility-class selectors that can collide with the
  // traffic-light row at the top of the aside.
  const pinkDot = win.querySelector('aside .bg-pink-500');
  const newRow = pinkDot?.parentElement;
  if (!newRow) return;
  // Style the row as an interactive pill instead of a static label.
  // The Tailwind class flags it to the aside's drag handler — without it
  // the drag logic captures mousedown and the click never fires.
  newRow.classList.add('cursor-pointer');
  newRow.style.cursor = 'pointer';
  newRow.style.padding = '6px 8px';
  newRow.style.marginLeft = '-8px';
  newRow.style.borderRadius = '6px';
  newRow.style.transition = 'background-color 120ms';
  newRow.style.userSelect = 'none';
  const setActive = (on) => {
    if (on) {
      newRow.style.background = 'rgba(236,72,153,0.12)';
      newRow.querySelector('span').style.color = 'rgb(236,72,153)';
    } else {
      newRow.style.background = 'transparent';
      newRow.querySelector('span').style.color = '';
    }
  };
  const isRecent = () => win.dataset.folder === '__recent__';
  setActive(isRecent());
  newRow.onmouseenter = () => { if (!isRecent()) newRow.style.background = 'rgba(127,127,127,0.10)'; };
  newRow.onmouseleave = () => { if (!isRecent()) newRow.style.background = 'transparent'; };
  newRow.onclick = (e) => {
    e.stopPropagation();
    win.dataset.folder = '__recent__';
    renderRecentView(win);
    emitWindowChange();
  };
}

function renderRecentView(win) {
  const mainArea = win.querySelector('.finder-main-area');
  const title = win.querySelector('.finder-title');
  if (title) title.innerText = 'NEW — Recent Projects';

  // Clear sidebar selection
  win.querySelectorAll('.favorites-nav a').forEach((a) => {
    a.classList.remove('bg-primary/15', 'text-primary', 'font-semibold');
    a.classList.add('text-slate-600', 'dark:text-slate-400');
  });
  bindNewTag(win); // re-paint active state

  const magazines = recentMagazines();
  // Magazine containers (e.g. "TOMIN INDEX.TXT") only hold magazine
  // entries — surfacing them as a folder tile is redundant since each
  // recent magazine is already shown as its own tile below.
  const magazineHosts = new Set(magazines.map((m) => m.folder));
  const folders = recentFolders().filter((f) => {
    const items = portfolioData[f] || [];
    if (items.length === 0) return false;
    const everyItemIsMagazine = items.every((it) => it.isMagazine);
    return !(everyItemIsMagazine && magazineHosts.has(f));
  });
  if (folders.length === 0 && magazines.length === 0) {
    mainArea.innerHTML = `<div class="flex flex-col items-center justify-center h-full opacity-40 p-8 text-center">
      <span class="material-symbols-rounded text-6xl">new_releases</span>
      <p class="mt-2 text-sm font-medium">Nothing new in the last 30 days</p>
    </div>`;
    return;
  }

  if ((win.dataset.viewMode || 'grid') === 'list') {
    let html = `
      <table class="w-full text-left text-[12px] border-collapse bg-transparent">
        <thead class="sticky top-0 bg-white/50 dark:bg-slate-900/80 backdrop-blur-md text-slate-500 font-medium border-b border-slate-200/20 dark:border-white/5 shadow-sm z-10 transition-colors duration-300">
          <tr>
            <th class="py-3 px-4 font-semibold w-1/2">Name</th>
            <th class="py-3 px-2 font-semibold">Type</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100/10 dark:divide-slate-700/50">
    `;
    folders.forEach((folderName) => {
      const safe = folderName.replace(/'/g, "\\'");
      html += `
        <tr class="group hover:bg-primary/10 dark:hover:bg-white/5 transition-colors cursor-pointer" onclick="(window.__openFolderFromRecent || (()=>{}))('${safe}')">
          <td class="py-2 px-4 flex items-center space-x-2">
            <span class="material-symbols-rounded text-[14px] text-pink-500 bg-pink-500/15 p-0.5 rounded mr-2" style="font-variation-settings:'FILL' 1;">folder</span>
            <span class="text-on-surface dark:text-slate-100 font-semibold group-hover:text-primary dark:group-hover:text-white transition-colors">${folderName}</span>
          </td>
          <td class="py-2 px-2 text-slate-500 dark:text-slate-400">Folder</td>
        </tr>
      `;
    });
    magazines.forEach(({ folder, idx, item }) => {
      const safeFolder = folder.replace(/'/g, "\\'");
      const label = item.name.replace(/\.[^.]+$/, '');
      html += `
        <tr class="group hover:bg-primary/10 dark:hover:bg-white/5 transition-colors cursor-pointer" onclick="window.handleItemClick && window.handleItemClick('${safeFolder}', ${idx})">
          <td class="py-2 px-4 flex items-center space-x-2">
            <span class="material-symbols-rounded text-[14px] text-amber-500 bg-amber-500/15 p-0.5 rounded mr-2">menu_book</span>
            <span class="text-on-surface dark:text-slate-100 font-semibold group-hover:text-primary dark:group-hover:text-white transition-colors">${label}</span>
          </td>
          <td class="py-2 px-2 text-slate-500 dark:text-slate-400">Magazine</td>
        </tr>
      `;
    });
    html += `</tbody></table>`;
    mainArea.innerHTML = html;
    window.__openFolderFromRecent = (folderName) => {
      win.dataset.folder = folderName;
      renderFolderContent(win, folderName);
      injectFavorites(win);
      emitWindowChange();
    };
    return;
  }

  // Shared cell template — renders one tile in the grid. Used for both
  // folders (open the folder in this window) and magazines (open the
  // magazine reader via handleItemClick).
  const cell = ({ thumb, label, onclick }) => `
    <div class="finder-icon-item group cursor-pointer"
         onclick="${onclick}"
         style="display:flex; flex-direction:column; align-items:center; gap:4px; padding:4px 2px; border-radius:8px; position:relative;">
      <div class="finder-icon-thumb"
           style="width:96px; height:96px; border-radius:10px; overflow:hidden;
                  background:rgba(148,163,184,0.12); display:flex; align-items:center; justify-content:center;
                  box-shadow:0 1px 3px rgba(15,23,42,0.08), 0 0 0 1px rgba(15,23,42,0.04);
                  transition:box-shadow 160ms ease, transform 160ms ease; position:relative;">
        ${thumb}
        <span style="position:absolute; top:6px; left:6px; background:rgb(236,72,153); color:#fff; font-size:9px; font-weight:700; letter-spacing:0.04em; padding:2px 6px; border-radius:6px; box-shadow:0 2px 6px rgba(236,72,153,0.4);">NEU</span>
      </div>
      <span class="finder-icon-name"
            style="display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:2; line-clamp:2;
                   overflow:hidden; text-align:center; word-break:break-word; line-height:1.25;
                   font-size:11.5px; font-weight:500; color:var(--finder-name-color, rgb(51,65,85));
                   padding:1.5px 6px; border-radius:5px; max-width:100%;">${label}</span>
    </div>
  `;

  let html = `
    <div class="finder-icon-grid"
         style="display:grid; grid-template-columns:repeat(auto-fill, minmax(108px, 1fr)); gap:18px 6px; padding:18px 14px; align-content:start;">
  `;

  folders.forEach((folderName) => {
    const items = portfolioData[folderName] || [];
    const cover = items.find((it) => !it.isVideo && !it.isMagazine && it.src);
    const thumb = cover
      ? `<img src="${cover.src}"${srcsetAttr(cover.src, '120px')} class="w-full h-full object-cover" loading="lazy" style="pointer-events:none;" />`
      : `<div class="w-full h-full flex items-center justify-center bg-gradient-to-br from-pink-400 to-pink-600">
           <span class="material-symbols-rounded text-white text-3xl" style="font-variation-settings:'FILL' 1;">folder</span>
         </div>`;
    const safe = folderName.replace(/'/g, "\\'");
    html += cell({
      thumb,
      label: folderName,
      onclick: `(window.__openFolderFromRecent || (()=>{}))('${safe}')`,
    });
  });

  // Recent magazines — open straight into the reader. Uses the existing
  // handleItemClick router so the magazine UX is identical to opening
  // from inside its parent folder.
  magazines.forEach(({ folder, idx, item }) => {
    // Magazine items don't carry their own image — the cover is the
    // first picture inside the magazine's sub-folder, stored under
    // `<parent>/<magazine name>` in portfolioData.
    const subKey = `${folder}/${item.name}`;
    const subItems = portfolioData[subKey] || [];
    const coverItem = subItems.find((it) => !it.isVideo && !it.isMagazine && it.src);
    const cover = coverItem?.src || item.cover || item.src;
    const thumb = cover
      ? `<img src="${cover}" class="w-full h-full object-cover" loading="lazy" style="pointer-events:none;" />`
      : `<div class="w-full h-full flex items-center justify-center bg-gradient-to-br from-amber-400 to-amber-600">
           <span class="material-symbols-rounded text-white text-3xl" style="font-variation-settings:'FILL' 1;">menu_book</span>
         </div>`;
    const safeFolder = folder.replace(/'/g, "\\'");
    html += cell({
      thumb,
      label: item.name.replace(/\.[^.]+$/, ''),
      onclick: `window.handleItemClick && window.handleItemClick('${safeFolder}', ${idx})`,
    });
  });

  html += `</div>`;
  mainArea.innerHTML = html;

  // Click handler that opens a folder back in the same window
  window.__openFolderFromRecent = (folderName) => {
    win.dataset.viewMode = 'grid';
    win.dataset.folder = folderName;
    renderFolderContent(win, folderName);
    injectFavorites(win);
    emitWindowChange();
  };
}

// Refresh sidebar + main area on every open finder window when the live
// R2 sync surfaces new folders or files. The per-window thumbnail cache
// must be cleared so the new data is picked up.
window.addEventListener('portfolio-updated', () => {
  document.querySelectorAll('.finder-window').forEach(win => {
    const mainArea = win.querySelector('.finder-main-area');
    if (mainArea) mainArea.innerHTML = '';
    injectFavorites(win);
    if (win.dataset.folder) renderFolderContent(win, win.dataset.folder);
  });
});

// Same refresh once the poster/colour manifests arrive, so a window opened
// before the fetch resolved swaps its <video> tiles for static frames.
window.addEventListener('edit-posters-ready', () => {
  document.querySelectorAll('.finder-window').forEach(win => {
    const mainArea = win.querySelector('.finder-main-area');
    if (!mainArea || !mainArea.childElementCount) return;
    mainArea.innerHTML = '';
    if (win.dataset.folder === '__recent__') renderRecentView(win);
    else if (win.dataset.folder) renderFolderContent(win, win.dataset.folder);
  });
});

function renderFolderContent(win, folderName) {
  if (!win) return;

  const mainArea = win.querySelector('.finder-main-area');
  const title = win.querySelector('.finder-title');
  if (title) title.innerText = folderName;

  const viewMode = win.dataset.viewMode || 'grid';

  // Cache rendered folder views per (folder, viewMode) inside this window.
  // Switching folders or view-modes hides the previous wrapper instead of
  // tearing it down, so <img>/<video> nodes stay alive and decoded — no
  // re-paint flash when revisiting a folder.
  const cacheKey = `${folderName}::${viewMode}`;
  let cached = null;
  mainArea.childNodes.forEach(node => {
    if (node.nodeType !== 1) return;
    if (node.dataset && node.dataset.folderCache === cacheKey) cached = node;
    if (node.style) node.style.display = 'none';
  });
  if (cached) {
    cached.style.display = '';
    return;
  }

  // Update fav selection — Finder-style blue tint with bold blue text so the
  // label stays clearly readable against the light pill (the previous
  // text-white on bg-primary/90 washed out into the panel background).
  const favLinks = win.querySelectorAll('.favorites-nav a');
  favLinks.forEach(a => {
    if (a.innerText.trim() === folderName) {
      a.classList.add('bg-primary/15', 'text-primary', 'font-semibold');
      a.classList.remove('text-slate-600', 'dark:text-slate-400');
    } else {
      a.classList.remove('bg-primary/15', 'text-primary', 'font-semibold');
      a.classList.add('text-slate-600', 'dark:text-slate-400');
    }
  });

  const data = portfolioData[folderName] || [];
  // Sort data
  const sortedData = [...data].sort((a, b) => {
    if (a.isVideo && !b.isVideo) return -1;
    if (!a.isVideo && b.isVideo) return 1;
    return a.name.localeCompare(b.name);
  });

  const wrapper = document.createElement('div');
  wrapper.dataset.folderCache = cacheKey;
  wrapper.style.height = '100%';

  if (sortedData.length === 0) {
    wrapper.innerHTML = `<div class="flex flex-col items-center justify-center h-full opacity-40">
      <span class="material-symbols-rounded text-6xl">folder_open</span>
      <p class="mt-2 text-sm font-medium">This folder is empty</p>
    </div>`;
    mainArea.appendChild(wrapper);
    return;
  }

  if (viewMode === 'list') {
    let html = `
      <table class="w-full text-left text-[12px] border-collapse bg-transparent">
        <thead class="sticky top-0 bg-white/50 dark:bg-slate-900/80 backdrop-blur-md text-slate-500 font-medium border-b border-slate-200/20 dark:border-white/5 shadow-sm z-10 transition-colors duration-300">
          <tr>
            <th class="py-3 px-4 font-semibold w-1/2">Name</th>
            <th class="py-3 px-2 font-semibold">Type</th>
            <th class="py-3 px-2 font-semibold">Size</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100/10 dark:divide-slate-700/50">
    `;
    sortedData.forEach((item, index) => {
      const clickAction = `handleItemClick('${folderName.replace(/'/g, "\\'")}', ${index}, event)`;
      html += `
        <tr class="group hover:bg-primary/10 dark:hover:bg-white/5 transition-colors cursor-pointer" onclick="${clickAction}">
          <td class="py-2 px-4 flex items-center space-x-2">
            <span class="material-symbols-rounded text-[14px] text-sky-500 bg-primary/20 p-0.5 rounded mr-2">${item.isVideo ? 'movie' : 'image'}</span>
            <span class="text-on-surface dark:text-slate-100 font-semibold group-hover:text-primary dark:group-hover:text-white transition-colors">${item.name}</span>
          </td>
          <td class="py-2 px-2 text-slate-500 dark:text-slate-400">${item.type}</td>
          <td class="py-2 px-2 text-slate-500 dark:text-slate-400">${item.size}</td>
        </tr>
      `;
    });
    html += `</tbody></table>`;
    wrapper.innerHTML = html;
    mainArea.appendChild(wrapper);
  } else {
    // macOS-Finder Icon View:
    //  • auto-fill grid that re-flows with the window width
    //  • generously-sized square thumbnails (96px) with subtle rounded shadow
    //  • filename below, allowed to wrap up to two lines with the classic
    //    Finder pill highlight on hover instead of getting truncated mid-word
    // Dominant-colour placeholder: tiles show the folder's palette colour
    // while their jpg decodes instead of a flat grey (premium loading feel).
    const folderAccent = accentForFolder(folderName);
    let html = `
      <div class="finder-icon-grid"
           style="display:grid; grid-template-columns:repeat(auto-fill, minmax(108px, 1fr)); gap:18px 6px; padding:18px 14px; align-content:start;">
    `;
    sortedData.forEach((item, i) => {
      let thumb;
      let tileBg = folderAccent || 'rgba(148,163,184,0.12)';
      if (item.isMagazine) {
        const magKey = folderName + '/' + item.name;
        const pages = portfolioData[magKey] || [];
        const cover = pages.find(p => !p.isVideo && p.src);
        thumb = cover
          ? `<img src="${cover.src}"${srcsetAttr(cover.src, '120px')} class="w-full h-full object-cover" loading="lazy" style="pointer-events:none;" />`
          : `<div class="w-full h-full flex items-center justify-center bg-slate-200 dark:bg-slate-700"><span class="material-symbols-rounded text-slate-400 text-3xl" style="font-variation-settings:'FILL' 1;">auto_stories</span></div>`;
      } else if (item.isVideo) {
        // Static poster frame from the game-asset pipeline where available —
        // no per-tile <video> element means folder opens stop firing one
        // media range-request per video.
        const poster = posterForVideo(item, folderName);
        if (poster) {
          if (poster.color) tileBg = poster.color;
          thumb = `<img src="${poster.src}"${srcsetAttr(poster.src, '120px')} class="w-full h-full object-cover" loading="lazy" style="pointer-events:none;" />
                   <span class="material-symbols-rounded finder-thumb-play" style="font-variation-settings:'FILL' 1;">play_arrow</span>`;
        } else {
          thumb = `<video src="${item.src}" class="w-full h-full object-cover" muted preload="metadata" onloadedmetadata="this.currentTime=0.001" style="pointer-events:none;"></video>`;
        }
      } else {
        thumb = `<img src="${item.src}"${srcsetAttr(item.src, '120px')} class="w-full h-full object-cover" loading="lazy" style="pointer-events:none;" />`;
      }
      html += `
        <div class="finder-icon-item group cursor-pointer"
             onclick="handleItemClick('${folderName.replace(/'/g, "\\'")}', ${i}, event)"
             style="display:flex; flex-direction:column; align-items:center; gap:4px; padding:4px 2px; border-radius:8px;">
          <div class="finder-icon-thumb"
               style="width:96px; height:96px; border-radius:10px; overflow:hidden; position:relative;
                      background:${tileBg}; display:flex; align-items:center; justify-content:center;
                      box-shadow:0 1px 3px rgba(15,23,42,0.08), 0 0 0 1px rgba(15,23,42,0.04);
                      transition:box-shadow 160ms ease, transform 160ms ease;">
            ${thumb}
          </div>
          <span class="finder-icon-name"
                style="display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:2; line-clamp:2;
                       overflow:hidden; text-align:center; word-break:break-word; line-height:1.25;
                       font-size:11.5px; font-weight:500; color:var(--finder-name-color, rgb(51,65,85));
                       padding:1.5px 6px; border-radius:5px; max-width:100%;
                       transition:background-color 120ms ease, color 120ms ease;">${item.name}</span>
        </div>
      `;
    });
    html += `</div>`;
    wrapper.innerHTML = html;
    mainArea.appendChild(wrapper);
  }
}

// Generic Drag Logic for standalone windows (About, QuickLook)
function makeDraggable(el, handleSelector) {
  const handles = el.querySelectorAll(handleSelector);
  if (handles.length === 0) {
    // If no handle selector found, use the element itself
    attachHandler(el, el);
    return;
  }
  handles.forEach(h => attachHandler(el, h));

  function attachHandler(targetEl, handle) {
    handle.onmousedown = (e) => {
      if (e.target.closest('.cursor-pointer') || e.target.closest('button') || e.target.closest('.btn-close-window')) return;
      // In share-mode, the modal must stay locked: no drag, no z-index reset
      // (bringToFront would push it behind the white overlay).
      if (targetEl.dataset.shareMode === 'true') return;
      bringToFront(targetEl);

      const rect = targetEl.getBoundingClientRect();
      targetEl.style.position = 'fixed';
      targetEl.style.left = rect.left + 'px';
      targetEl.style.top = rect.top + 'px';
      targetEl.style.transform = 'none';
      targetEl.style.margin = '0';
      targetEl.classList.remove('left-1/2', 'top-1/2', '-translate-x-1/2', '-translate-y-1/2');

      targetEl.classList.add('dragging-window');
      const offX = e.clientX - rect.left;
      const offY = e.clientY - rect.top;

      const move = (ev) => {
        targetEl.style.left = `${ev.clientX - offX}px`;
        targetEl.style.top = `${ev.clientY - offY}px`;
      };
      const up = () => {
        targetEl.classList.remove('dragging-window');
        window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up);
      };
      window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
    };
  }
}

// Initializing standalone draggables
setTimeout(() => {
  const about = document.getElementById('about-me-modal');
  const ql = document.getElementById('quick-look-modal');
  makeDraggable(about, '.draggable-handle');
  makeDraggable(ql, '.draggable-handle');
}, 500);

window.handleItemClick = function (folder, index, event) {
  const item = portfolioData[folder][index];
  window.umami?.track('item-open', { folder, item: item?.name || String(index) });

  // Handle Magazines/Folders first
  const magKey = folder + "/" + item.name;
  if (portfolioData[magKey]) {
    window.openMagazineReader(folder, index);
    window.dispatchEvent(new CustomEvent('item-opened', { detail: { folder, index } }));
    return;
  }

  // Everything else (Images and Videos) goes to Quick Look as default.
  // The clicked thumbnail is the morph source; folder context enables
  // ←/→ navigation inside the preview.
  const tile = event?.target?.closest?.('.finder-icon-item, tr');
  const thumb = tile?.querySelector?.('.finder-icon-thumb') || tile;
  window.openQuickLook(item, thumb, { folder, index });
  window.dispatchEvent(new CustomEvent('item-opened', { detail: { folder, index } }));
};

// Animate a window's geometry to a target {left,top,width,height} (px numbers)
// with the Web Animations API. Deterministic — unlike a freshly-added CSS
// transition it's never batched away into an instant jump ("instantly big, no
// growing"). Commits the end state inline so drag/restore read real geometry.
// Shared by the finder + journal maximize buttons.
export function animateWindowTo(win, target) {
  // getBoundingClientRect reflects the live animated box, so reading it first
  // lets a rapid re-click hand off smoothly from a still-running animation.
  const rect = win.getBoundingClientRect();
  win.style.transform = 'none';
  const commit = () => {
    win.style.left = `${target.left}px`;
    win.style.top = `${target.top}px`;
    win.style.width = `${target.width}px`;
    win.style.height = `${target.height}px`;
  };
  // Cancel any in-flight animation so its onfinish can't commit a stale target.
  if (win._fsAnim) { try { win._fsAnim.cancel(); } catch { /* noop */ } win._fsAnim = null; }

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || typeof win.animate !== 'function') { commit(); return; }

  const anim = win.animate(
    [
      { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` },
      { left: `${target.left}px`, top: `${target.top}px`, width: `${target.width}px`, height: `${target.height}px` },
    ],
    { duration: 300, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'both' }
  );
  win._fsAnim = anim;
  anim.onfinish = () => {
    commit();
    try { anim.cancel(); } catch { /* noop */ }
    if (win._fsAnim === anim) win._fsAnim = null;
  };
}

function toggleFullscreen(win) {
  const rootH = window.innerHeight;
  const rootW = window.innerWidth;
  const remPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const rect = win.getBoundingClientRect();
  const willMaximize = win.dataset.isMaximized !== 'true';
  let target;
  if (willMaximize) {
    // Remember the pre-maximize box so restore returns to the exact size/spot.
    win.dataset.prevLeftPx = rect.left;
    win.dataset.prevTopPx = rect.top;
    win.dataset.prevWidthPx = rect.width;
    win.dataset.prevHeightPx = rect.height;
    target = { left: 0, top: 2 * remPx, width: rootW, height: rootH - 2 * remPx };
  } else {
    const w = win.dataset.prevWidthPx ? parseFloat(win.dataset.prevWidthPx) : 960;
    const h = win.dataset.prevHeightPx ? parseFloat(win.dataset.prevHeightPx) : 620;
    target = {
      left: win.dataset.prevLeftPx != null ? parseFloat(win.dataset.prevLeftPx) : (rootW - w) / 2,
      top: win.dataset.prevTopPx != null ? parseFloat(win.dataset.prevTopPx) : (rootH - h) / 2,
      width: w,
      height: h,
    };
  }
  win.dataset.isMaximized = willMaximize ? 'true' : 'false';
  animateWindowTo(win, target);
}

// --- Desktop Icons Dragging Logic ---
const desktopIcons = document.querySelectorAll('.desktop-icon');
let draggedIcon = null, iconIsDragging = false, iconOffsetX, iconOffsetY;

const iconsContainer = document.getElementById('desktop-icons-container');

desktopIcons.forEach(icon => {
  icon.addEventListener('mousedown', (e) => {
    iconIsDragging = false;
    draggedIcon = icon;
    const containerRect = iconsContainer.getBoundingClientRect();
    const rect = icon.getBoundingClientRect();
    iconOffsetX = e.clientX - rect.left;
    iconOffsetY = e.clientY - rect.top;
    desktopIcons.forEach(i => i.style.zIndex = '1');
    icon.style.zIndex = '10';

    icon.style.right = 'auto';
    icon.style.bottom = 'auto';
    icon.style.left = `${rect.left - containerRect.left}px`;
    icon.style.top = `${rect.top - containerRect.top}px`;
  });
  icon.addEventListener('click', () => {
    if (!iconIsDragging) {
      desktopIcons.forEach(i => i.classList.remove('selected'));
      icon.classList.add('selected');
    }
  });
  icon.addEventListener('dblclick', () => {
    createWindow(icon.dataset.name, icon);
  });
});

document.addEventListener('mousemove', (e) => {
  if (draggedIcon) {
    iconIsDragging = true;
    const containerRect = iconsContainer.getBoundingClientRect();
    draggedIcon.style.left = `${e.clientX - iconOffsetX - containerRect.left}px`;
    draggedIcon.style.top = `${e.clientY - iconOffsetY - containerRect.top}px`;
  }
});

document.addEventListener('mouseup', () => {
  if (draggedIcon) {
    setTimeout(() => { iconIsDragging = false; draggedIcon = null; }, 50);
  }
});

document.addEventListener('mousedown', (e) => {
  if (!e.target.closest('.desktop-icon')) {
    desktopIcons.forEach(i => i.classList.remove('selected'));
  }
});

