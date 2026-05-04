// Right-click contextual menu for desktop folder icons and finder items.

import { portfolioData } from '../../data.js';
import { folderToSlug, itemToSlug } from '../utils/slugs.js';
import { shareLink } from '../utils/share.js';
import { createWindow } from './windows.js';

let menuEl = null;
let infoEl = null;

function buildMenu() {
  if (menuEl) return menuEl;
  menuEl = document.createElement('div');
  menuEl.id = 'ctx-menu';
  menuEl.style.cssText = `
    position:fixed; z-index:99999; min-width:200px; padding:5px 0;
    background:rgba(245,245,247,0.92); backdrop-filter:blur(28px);
    border:1px solid rgba(0,0,0,0.08); border-radius:9px;
    box-shadow:0 14px 40px rgba(0,0,0,0.22); display:none;
    font-size:13px; color:#111; user-select:none;
  `;
  document.body.appendChild(menuEl);
  document.documentElement.classList.contains('dark') && applyDark();
  return menuEl;
}

function applyDark() {
  if (!menuEl) return;
  const isDark = document.documentElement.classList.contains('dark');
  menuEl.style.background = isDark ? 'rgba(36,36,38,0.92)' : 'rgba(245,245,247,0.92)';
  menuEl.style.color = isDark ? '#f5f5f7' : '#111';
  menuEl.style.borderColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
}

function renderMenu(items, x, y) {
  buildMenu();
  applyDark();
  menuEl.innerHTML = '';
  items.forEach((it) => {
    if (it === '-') {
      const sep = document.createElement('div');
      sep.style.cssText = 'height:1px; background:rgba(127,127,127,0.22); margin:4px 8px;';
      menuEl.appendChild(sep);
      return;
    }
    const row = document.createElement('div');
    row.textContent = it.label;
    row.style.cssText = 'padding:5px 14px; cursor:pointer; transition:background-color 80ms;';
    row.addEventListener('mouseenter', () => { row.style.background = 'rgba(0,122,255,0.85)'; row.style.color = '#fff'; });
    row.addEventListener('mouseleave', () => {
      row.style.background = 'transparent';
      row.style.color = document.documentElement.classList.contains('dark') ? '#f5f5f7' : '#111';
    });
    row.addEventListener('click', () => {
      hideMenu();
      try { it.run && it.run(); } catch (e) { console.error(e); }
    });
    menuEl.appendChild(row);
  });
  menuEl.style.display = 'block';
  // clamp to viewport
  const rect = menuEl.getBoundingClientRect();
  const maxX = window.innerWidth - rect.width - 8;
  const maxY = window.innerHeight - rect.height - 8;
  menuEl.style.left = `${Math.min(x, maxX)}px`;
  menuEl.style.top = `${Math.min(y, maxY)}px`;
}

function hideMenu() {
  if (menuEl) menuEl.style.display = 'none';
}

document.addEventListener('mousedown', (e) => {
  if (menuEl && menuEl.style.display === 'block' && !menuEl.contains(e.target)) hideMenu();
});
window.addEventListener('blur', hideMenu);
window.addEventListener('scroll', hideMenu, true);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideMenu(); });

function projectURL(folder, itemIndex) {
  const fs = folderToSlug(folder);
  if (itemIndex == null) return `${location.origin}/projects/${fs}`;
  const is = itemToSlug(folder, itemIndex);
  return `${location.origin}/projects/${fs}${is ? '/' + is : ''}`;
}

function openGetInfoFolder(folder) {
  const items = portfolioData[folder] || [];
  const dates = items.map((i) => Date.parse(i.date)).filter((n) => !isNaN(n));
  const earliest = dates.length ? new Date(Math.min(...dates)) : null;
  const latest = dates.length ? new Date(Math.max(...dates)) : null;
  const videos = items.filter((i) => i.isVideo).length;
  const images = items.filter((i) => !i.isVideo && !i.isMagazine).length;
  const mags = items.filter((i) => i.isMagazine).length;
  const fmt = (d) => d ? d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' }) : '–';
  showInfoModal(folder, [
    ['Kind', 'Folder'],
    ['Items', String(items.length)],
    ['Photos', String(images)],
    ['Videos', String(videos)],
    ...(mags ? [['Magazines', String(mags)]] : []),
    ['Created', fmt(earliest)],
    ['Modified', fmt(latest)],
    ['Where', `tomin.world/projects/${folderToSlug(folder)}`],
  ]);
}

function openGetInfoItem(folder, item) {
  showInfoModal(item.name, [
    ['Kind', item.isMagazine ? 'Magazine' : (item.type || (item.isVideo ? 'Video' : 'Image'))],
    ['Size', item.size || '–'],
    ['Date', item.date || '–'],
    ['Folder', folder],
  ]);
}

function showInfoModal(title, rows) {
  if (!infoEl) {
    infoEl = document.createElement('div');
    infoEl.id = 'get-info-modal';
    infoEl.style.cssText = `
      position:fixed; z-index:99998; left:50%; top:50%;
      transform:translate(-50%,-50%);
      width:300px; padding:18px 20px 16px;
      background:rgba(245,245,247,0.94); backdrop-filter:blur(28px);
      border:1px solid rgba(0,0,0,0.08); border-radius:14px;
      box-shadow:0 24px 60px rgba(0,0,0,0.28);
      font-size:13px; color:#111; display:none;
    `;
    document.body.appendChild(infoEl);
  }
  const isDark = document.documentElement.classList.contains('dark');
  infoEl.style.background = isDark ? 'rgba(36,36,38,0.94)' : 'rgba(245,245,247,0.94)';
  infoEl.style.color = isDark ? '#f5f5f7' : '#111';
  infoEl.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
      <div style="font-weight:600; font-size:13px; max-width:230px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${title} — Info</div>
      <button id="gi-close" style="border:none; background:transparent; color:inherit; cursor:pointer; font-size:18px; line-height:1; padding:0 4px;">×</button>
    </div>
    ${rows.map(([k, v]) => `
      <div style="display:flex; justify-content:space-between; gap:14px; padding:4px 0; border-top:1px solid rgba(127,127,127,0.18);">
        <span style="opacity:0.65;">${k}</span>
        <span style="font-weight:500; text-align:right; max-width:60%; overflow-wrap:anywhere;">${v}</span>
      </div>
    `).join('')}
  `;
  infoEl.style.display = 'block';
  infoEl.querySelector('#gi-close').onclick = () => { infoEl.style.display = 'none'; };
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && infoEl) infoEl.style.display = 'none';
});

// --- Bind to desktop icons ---
function bindFolderIcon(icon) {
  icon.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const folder = icon.dataset.name;
    if (!folder) return;
    const url = projectURL(folder);
    const items = [
      { label: 'Open', run: () => createWindow(folder) },
      { label: 'Open in New Window', run: () => createWindow(folder) },
      '-',
      { label: 'Get Info', run: () => openGetInfoFolder(folder) },
      { label: 'Copy Link', run: () => navigator.clipboard.writeText(url).then(() => {}) },
    ];
    if (navigator.share) items.push({ label: 'Share…', run: () => shareLink({ url, title: `${folder} — Shouli` }) });
    renderMenu(items, e.clientX, e.clientY);
  });
}

document.querySelectorAll('.desktop-icon').forEach(bindFolderIcon);

// --- Bind to finder window items via delegation ---
document.addEventListener('contextmenu', (e) => {
  const iconItem = e.target.closest('.finder-icon-item');
  const tableRow = e.target.closest('tr[onclick]');
  const target = iconItem || tableRow;
  if (!target) return;
  const win = e.target.closest('.finder-window');
  if (!win) return;
  e.preventDefault();
  const folder = win.dataset.folder;
  // Recover item index by walking children
  const onclick = target.getAttribute('onclick') || '';
  const m = onclick.match(/handleItemClick\(\s*'([^']*)'\s*,\s*(\d+)/);
  if (!m) return;
  const idx = Number(m[2]);
  const item = (portfolioData[folder] || [])[idx];
  if (!item) return;
  const url = projectURL(folder, idx);
  const isMag = !!portfolioData[`${folder}/${item.name}`];
  const items = [
    { label: isMag ? 'Open Magazine' : 'Quick Look', run: () => window.handleItemClick(folder, idx) },
    ...(item.src && !isMag ? [{ label: 'Open in New Tab', run: () => window.open(item.src, '_blank') }] : []),
    '-',
    { label: 'Get Info', run: () => openGetInfoItem(folder, item) },
    { label: 'Copy Link', run: () => navigator.clipboard.writeText(url).then(() => {}) },
  ];
  if (item.src && !isMag) items.push({ label: 'Copy Image Address', run: () => navigator.clipboard.writeText(item.src).then(() => {}) });
  if (navigator.share) items.push({ label: 'Share…', run: () => shareLink({ url, title: `${item.name} — Shouli` }) });
  renderMenu(items, e.clientX, e.clientY);
});
