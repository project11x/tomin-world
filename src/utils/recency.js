// "What's new on Shouli" helpers — used by the desktop finder NEW tag,
// the iOS dock badges, and the in-app NEU pills.

import { portfolioData } from '../../data.js';

// 30-day window — anything added within the last month counts as "new".
const RECENT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

function parseItemDate(d) {
  if (!d) return 0;
  const t = Date.parse(d);
  return isNaN(t) ? 0 : t;
}

export function isItemRecent(item, cutoff = Date.now() - RECENT_WINDOW_MS) {
  return parseItemDate(item && item.date) >= cutoff;
}

export function folderLatestTimestamp(folder) {
  const items = portfolioData[folder] || [];
  let latest = 0;
  for (const it of items) {
    const t = parseItemDate(it.date);
    if (t > latest) latest = t;
  }
  return latest;
}

export function isFolderRecent(folder, cutoff = Date.now() - RECENT_WINDOW_MS) {
  return folderLatestTimestamp(folder) >= cutoff;
}

export function recentFolders() {
  const cutoff = Date.now() - RECENT_WINDOW_MS;
  return Object.keys(portfolioData)
    .filter((k) => !k.includes('/'))
    .filter((k) => isFolderRecent(k, cutoff))
    .sort((a, b) => folderLatestTimestamp(b) - folderLatestTimestamp(a));
}

export function recentMagazines() {
  const cutoff = Date.now() - RECENT_WINDOW_MS;
  const out = [];
  Object.keys(portfolioData).forEach((folder) => {
    if (folder.includes('/')) return;
    (portfolioData[folder] || []).forEach((it, idx) => {
      if (it.isMagazine && isItemRecent(it, cutoff)) out.push({ folder, idx, item: it });
    });
  });
  return out;
}

export function recentEdits(collectFn) {
  // collectFn = the iOS module's iosCollectEdits flat list builder.
  // Falls back to scanning every video item with low digit count.
  const cutoff = Date.now() - RECENT_WINDOW_MS;
  if (typeof collectFn === 'function') {
    return collectFn().filter((e) => isItemRecent(e, cutoff));
  }
  const out = [];
  Object.keys(portfolioData).forEach((folder) => {
    if (folder.includes('/')) return;
    (portfolioData[folder] || []).forEach((it) => {
      if (!it.isVideo) return;
      const nameNoExt = it.name.replace(/\.[^/.]+$/, '');
      const digits = (nameNoExt.match(/\d/g) || []).length;
      if (digits > 3) return;
      if (isItemRecent(it, cutoff)) out.push({ ...it, folder });
    });
  });
  return out;
}
