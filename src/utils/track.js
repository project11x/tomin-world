// Client-side beacon for /api/track. Non-blocking, deduped per session
// so reopening the same item over and over within the same tab visit
// only counts once.

import { folderToSlug, itemToSlug } from './slugs.js';

const seen = new Set();

function send(payload) {
  try {
    const body = JSON.stringify(payload);
    const ok = navigator.sendBeacon
      ? navigator.sendBeacon('/api/track', new Blob([body], { type: 'application/json' }))
      : false;
    if (!ok) {
      // Fallback for browsers that reject sendBeacon with custom mime.
      fetch('/api/track', {
        method: 'POST',
        body,
        headers: { 'content-type': 'application/json' },
        keepalive: true,
      }).catch(() => {});
    }
  } catch (_) {}
}

export function trackFolderOpen(folder) {
  const slug = folderToSlug(folder);
  if (!slug) return;
  const key = `folder:${slug}`;
  if (seen.has(key)) return;
  seen.add(key);
  send({ kind: 'folder', folder: slug });
}

export function trackItemOpen(folder, indexOrName) {
  const fSlug = folderToSlug(folder);
  if (!fSlug) return;
  let iSlug = null;
  if (typeof indexOrName === 'number') {
    iSlug = itemToSlug(folder, indexOrName);
  } else if (typeof indexOrName === 'string') {
    iSlug = String(indexOrName).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  if (!iSlug) return;
  const key = `item:${fSlug}/${iSlug}`;
  if (seen.has(key)) return;
  seen.add(key);
  send({ kind: 'item', folder: fSlug, item: iSlug });
}
