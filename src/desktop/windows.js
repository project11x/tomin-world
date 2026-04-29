// Window manager: macOS-style finder windows, drag, fullscreen, About modal,
// item-click router (delegates to magazine reader / quick look in other modules).

import { portfolioData } from '../../data.js';

let highestZIndex = 50;
export function bringToFront(element) {
  if (!element) return;
  highestZIndex++;
  element.style.zIndex = String(highestZIndex);
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

export function createWindow(folderName) {
  if (!folderName || !portfolioData[folderName]) {
    // Fallback to first folder if key not found
    folderName = Object.keys(portfolioData).find(k => !k.includes('/')) || folderName;
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
  win.querySelector('.btn-close-window').onclick = () => win.remove();
  win.querySelector('.btn-minimize-window').onclick = () => win.remove();
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
    renderFolderContent(win, win.dataset.folder);
  };
  if (btnList) btnList.onclick = () => {
    win.dataset.viewMode = 'list';
    updateViewTabs();
    renderFolderContent(win, win.dataset.folder);
  };

  // Inject Favorites — extracted so we can re-run it when /api/portfolio
  // surfaces new folders after the live R2 sync.
  injectFavorites(win);

  document.getElementById('desktop-main').appendChild(win);
  updateViewTabs();
  renderFolderContent(win, folderName);
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
      renderFolderContent(win, key);
    };
    favNav.appendChild(a);
  });
}

// Refresh sidebar + main area on every open finder window when the live
// R2 sync surfaces new folders or files.
window.addEventListener('portfolio-updated', () => {
  document.querySelectorAll('.finder-window').forEach(win => {
    injectFavorites(win);
    if (win.dataset.folder) renderFolderContent(win, win.dataset.folder);
  });
});

function renderFolderContent(win, folderName) {
  if (!win) return;

  const mainArea = win.querySelector('.finder-main-area');
  const title = win.querySelector('.finder-title');
  if (title) title.innerText = folderName;

  const viewMode = win.dataset.viewMode || 'grid';

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

  if (sortedData.length === 0) {
    mainArea.innerHTML = `<div class="flex flex-col items-center justify-center h-full opacity-40">
      <span class="material-symbols-outlined text-6xl">folder_open</span>
      <p class="mt-2 text-sm font-medium">This folder is empty</p>
    </div>`;
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
            <span class="material-symbols-outlined text-[14px] text-sky-500 bg-primary/20 p-0.5 rounded mr-2">${item.isVideo ? 'movie' : 'image'}</span>
            <span class="text-on-surface dark:text-slate-100 font-semibold group-hover:text-primary dark:group-hover:text-white transition-colors">${item.name}</span>
          </td>
          <td class="py-2 px-2 text-slate-500 dark:text-slate-400">${item.type}</td>
          <td class="py-2 px-2 text-slate-500 dark:text-slate-400">${item.size}</td>
        </tr>
      `;
    });
    html += `</tbody></table>`;
    mainArea.innerHTML = html;
  } else {
    // macOS-Finder Icon View:
    //  • auto-fill grid that re-flows with the window width
    //  • generously-sized square thumbnails (96px) with subtle rounded shadow
    //  • filename below, allowed to wrap up to two lines with the classic
    //    Finder pill highlight on hover instead of getting truncated mid-word
    let html = `
      <div class="finder-icon-grid"
           style="display:grid; grid-template-columns:repeat(auto-fill, minmax(108px, 1fr)); gap:18px 6px; padding:18px 14px; align-content:start;">
    `;
    sortedData.forEach((item, i) => {
      let thumb;
      if (item.isMagazine) {
        const magKey = folderName + '/' + item.name;
        const pages = portfolioData[magKey] || [];
        const cover = pages.find(p => !p.isVideo && p.src);
        thumb = cover
          ? `<img src="${cover.src}" class="w-full h-full object-cover" loading="lazy" style="pointer-events:none;" />`
          : `<div class="w-full h-full flex items-center justify-center bg-slate-200 dark:bg-slate-700"><span class="material-symbols-outlined text-slate-400 text-3xl" style="font-variation-settings:'FILL' 1;">auto_stories</span></div>`;
      } else if (item.isVideo) {
        thumb = `<video src="${item.src}" class="w-full h-full object-cover" muted preload="metadata" onloadedmetadata="this.currentTime=0.001" style="pointer-events:none;"></video>`;
      } else {
        thumb = `<img src="${item.src}" class="w-full h-full object-cover" loading="lazy" style="pointer-events:none;" />`;
      }
      html += `
        <div class="finder-icon-item group cursor-pointer"
             onclick="handleItemClick('${folderName.replace(/'/g, "\\'")}', ${i}, event)"
             style="display:flex; flex-direction:column; align-items:center; gap:4px; padding:4px 2px; border-radius:8px;">
          <div class="finder-icon-thumb"
               style="width:96px; height:96px; border-radius:10px; overflow:hidden;
                      background:rgba(148,163,184,0.12); display:flex; align-items:center; justify-content:center;
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
    mainArea.innerHTML = html;
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

window.handleItemClick = function (folder, index) {
  const item = portfolioData[folder][index];

  // Handle Magazines/Folders first
  const magKey = folder + "/" + item.name;
  if (portfolioData[magKey]) {
    window.openMagazineReader(folder, index);
    return;
  }

  // Everything else (Images and Videos) goes to Quick Look as default
  window.openQuickLook(item);
};

function toggleFullscreen(win) {
  if (win.dataset.isMaximized === 'true') {
    win.style.width = '960px';
    win.style.height = '620px';
    win.style.left = win.dataset.prevLeft || '50%';
    win.style.top = win.dataset.prevTop || '50%';
    win.style.transform = win.dataset.prevLeft ? 'none' : 'translate(-50%, -50%)';
    win.dataset.isMaximized = 'false';
  } else {
    win.dataset.prevLeft = win.style.left;
    win.dataset.prevTop = win.style.top;
    win.style.width = '100vw';
    win.style.height = 'calc(100vh - 2rem)';
    win.style.left = '0';
    win.style.top = '2rem';
    win.style.transform = 'none';
    win.dataset.isMaximized = 'true';
  }
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
    createWindow(icon.dataset.name);
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

