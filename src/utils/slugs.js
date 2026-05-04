// Stable URL slugs from folder / item names.
// Folder slugs: derived from portfolioData top-level keys.
// Item slugs:   derived from item.name (without extension), unique within folder.

import { portfolioData } from '../../data.js';

export const slugify = (s) =>
  String(s).toLowerCase().normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const folderCache = { map: null };
const itemCache = new Map(); // folder -> { slug -> index }

function rebuildFolders() {
  const map = {};
  Object.keys(portfolioData).forEach((k) => {
    if (k.includes('/')) return;
    map[slugify(k)] = k;
  });
  folderCache.map = map;
}

function rebuildItems(folder) {
  const items = portfolioData[folder] || [];
  const used = {};
  const map = {};
  items.forEach((it, i) => {
    const base = (it.name || '').replace(/\.[^.]+$/, '') || `item-${i}`;
    let s = slugify(base) || `item-${i}`;
    if (used[s] != null) s = `${s}-${i}`;
    used[s] = true;
    map[s] = i;
  });
  itemCache.set(folder, map);
}

export function folderToSlug(folder) {
  return slugify(folder);
}

export function slugToFolder(slug) {
  if (!folderCache.map) rebuildFolders();
  return folderCache.map[slug] || null;
}

export function itemToSlug(folder, index) {
  if (!itemCache.has(folder)) rebuildItems(folder);
  const map = itemCache.get(folder);
  return Object.keys(map).find((k) => map[k] === index) || null;
}

export function slugToItem(folder, slug) {
  if (!itemCache.has(folder)) rebuildItems(folder);
  const map = itemCache.get(folder);
  const idx = map[slug];
  return idx == null ? null : { index: idx, item: portfolioData[folder][idx] };
}

window.addEventListener('portfolio-updated', () => {
  folderCache.map = null;
  itemCache.clear();
});
