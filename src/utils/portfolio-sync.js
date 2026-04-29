// Live portfolio sync — fetches `/api/portfolio` after boot and merges
// any new folders / files into the imported `portfolioData` object.
//
// Why mutate in-place:
//   ES modules export live bindings, but only for top-level identifiers.
//   The objects they reference can still be mutated, and every other
//   module that imported `portfolioData` sees the change immediately.
//   This lets us pick up R2 uploads without redeploying the site, while
//   still shipping a complete baked snapshot in `data.js` so first paint
//   never has to wait on the network.
//
// Failure mode: any error keeps the baked data on screen. The function
//   never throws; it just logs to console at debug level.
//
// Re-render hooks: when the merge changes anything, we dispatch a
//   `portfolio-updated` event on `window` so views that have already
//   rendered can refresh themselves (mag grid, BTS folder list, finder
//   favorites, …). Views that render lazily on user action don't need
//   to subscribe — they'll naturally pick up the new data on next open.

import { portfolioData } from '../../data.js';

export function bootstrapPortfolioSync(baseUrl) {
  // Run after the rest of the boot has settled so we don't compete with
  // first paint for network bandwidth.
  setTimeout(() => fetchAndMerge(baseUrl), 800);
}

async function fetchAndMerge(baseUrl) {
  let remote;
  try {
    const r = await fetch('/api/portfolio', { cache: 'default' });
    if (!r.ok) return;
    remote = await r.json();
    if (!remote || typeof remote !== 'object' || remote.error) return;
  } catch (_e) {
    return;
  }

  // Prepend the R2 base URL the same way the static bootstrap in app.js
  // does for the baked data — keeps src URLs uniformly absolute on prod.
  if (baseUrl) {
    for (const items of Object.values(remote)) {
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        if (item && item.src && !item.src.startsWith(baseUrl)) {
          item.src = baseUrl + item.src;
        }
      }
    }
  }

  let changed = false;

  // Replace each folder if its contents differ from the baked snapshot.
  for (const key of Object.keys(remote)) {
    const remoteList = remote[key];
    if (!Array.isArray(remoteList)) continue;
    const local = portfolioData[key];
    if (!local || !sameItems(local, remoteList)) {
      portfolioData[key] = remoteList;
      changed = true;
    }
  }

  // Drop folders that no longer exist in R2 — keeps the Finder honest if
  // the user deletes something straight from the bucket.
  for (const key of Object.keys(portfolioData)) {
    if (!(key in remote)) {
      delete portfolioData[key];
      changed = true;
    }
  }

  if (changed) {
    window.dispatchEvent(new CustomEvent('portfolio-updated'));
  }
}

// Cheap structural equality: same length, same names in order, same
// sizes. Misses attribute changes but matches the granularity the UI
// actually cares about.
function sameItems(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].name !== b[i].name) return false;
    if (a[i].size !== b[i].size) return false;
  }
  return true;
}
