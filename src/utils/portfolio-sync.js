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

  // STRICTLY ADDITIVE merge. The earlier version did a full replace +
  // delete-missing, which wiped the baked snapshot the moment the R2
  // listing was incomplete or differently structured. We never touch
  // folders or files that already exist; we only add new ones. The
  // baked data.js stays the source of truth for everything that was
  // shipped with the build.
  for (const folderKey of Object.keys(remote)) {
    const remoteList = remote[folderKey];
    if (!Array.isArray(remoteList)) continue;

    if (!(folderKey in portfolioData)) {
      // Brand-new folder seen on R2 — surface it.
      portfolioData[folderKey] = remoteList.slice();
      changed = true;
      continue;
    }

    // Existing folder: append any names that aren't already in the
    // baked list. Order is preserved for the existing items; new items
    // get sorted in afterwards (videos first, then alphabetical) to
    // match the rest of the UI.
    //
    // Names are normalised to Unicode NFC before comparison — R2 may hand
    // back precomposed characters (`é` U+00E9) while data.js was generated
    // with decomposed ones (`e` + U+0301). Without this, "Numéro Berlin"
    // shows up twice on the magazines grid because the two strings hash
    // differently even though they render identically.
    const norm = (s) => String(s || '').normalize('NFC');
    const existing = portfolioData[folderKey];
    const existingNames = new Set(existing.map((it) => norm(it.name)));
    let folderChanged = false;
    for (const item of remoteList) {
      if (item && item.name && !existingNames.has(norm(item.name))) {
        existing.push(item);
        existingNames.add(norm(item.name));
        folderChanged = true;
      }
    }
    if (folderChanged) {
      existing.sort((a, b) => {
        if (a.isVideo && !b.isVideo) return -1;
        if (!a.isVideo && b.isVideo) return 1;
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      });
      changed = true;
    }
  }

  if (changed) {
    window.dispatchEvent(new CustomEvent('portfolio-updated'));
  }
}
