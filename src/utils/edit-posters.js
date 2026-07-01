// Poster frames + dominant colours for video grid tiles.
//
// The game-asset pipeline (extract-frames.cjs / extract-colors.cjs) already
// produces exactly what a fast Finder grid needs: approved still frames per
// edit video (public/frames-pool.json → R2 jpgs) and a per-edit colour
// palette (public/edit-colors.json). Rendering a static jpg instead of a
// <video preload="metadata"> per tile avoids one media range-request per
// video every time a folder opens, and the palette colour fills the tile
// while the jpg is still loading.
//
// `edit` in the manifest is the portfolio folder name, `video` the exact
// filename the frame was extracted from. Portfolio items and pool entries
// can disagree on the variant suffix ("X.mp4" vs "X_web.mp4"), so matching
// happens on a normalised base name, never on the raw filename.

import { gameAssetUrl } from './game-asset-url.js';

const posterByBase = new Map();  // normalised video base name → R2 thumb key
const editVideos = new Map();    // folder name (lowercase) → Set of base names
const posterByEdit = new Map();  // folder name (lowercase) → R2 thumb key (first frame)
const colorByEdit = new Map();   // folder name (lowercase) → '#rrggbb' (dominant)
const paletteByEdit = new Map(); // folder name (lowercase) → ['#rrggbb', …]
let ready = false;

// "How Life Feels HQ_web.mp4" → "how life feels hq" — strips the extension
// and the _web/_compressed delivery-variant suffix so all variants of one
// edit share a key.
function normalise(name) {
  return (name || '')
    .replace(/\.[^/.]+$/, '')
    .replace(/_(web|compressed)$/i, '')
    .trim()
    .toLowerCase();
}

Promise.allSettled([
  fetch('/frames-pool.json').then((r) => (r.ok ? r.json() : null)),
  fetch('/edit-colors.json').then((r) => (r.ok ? r.json() : null)),
]).then(([pool, colors]) => {
  const frames = (pool.value?.frames || []).filter((f) => f.state === 'approved' && f.thumb);
  for (const f of frames) {
    const base = normalise(f.video);
    const edit = (f.edit || '').toLowerCase();
    if (base && !posterByBase.has(base)) posterByBase.set(base, f.thumb);
    if (edit) {
      if (!editVideos.has(edit)) editVideos.set(edit, new Set());
      editVideos.get(edit).add(base);
      if (!posterByEdit.has(edit)) posterByEdit.set(edit, f.thumb);
    }
  }
  for (const [edit, palette] of Object.entries(colors.value?.colors || {})) {
    if (Array.isArray(palette) && palette.length) {
      colorByEdit.set(edit.toLowerCase(), palette[0]);
      paletteByEdit.set(edit.toLowerCase(), palette);
    }
  }
  if (posterByBase.size || colorByEdit.size) {
    ready = true;
    window.dispatchEvent(new CustomEvent('edit-posters-ready'));
  }
});

// → { src, color } for a video item, or null when no frame is known yet
//   (manifest still loading, video not in the pool, …).
export function posterForVideo(item, folderName) {
  if (!ready || !item) return null;
  const folder = (folderName || '').toLowerCase();
  // Folder fallback only when the pool holds exactly ONE video for this
  // folder — with several edits per folder it would hand every tile the
  // same cover.
  const thumb = posterByBase.get(normalise(item.name))
    || (editVideos.get(folder)?.size === 1 ? posterByEdit.get(folder) : null);
  if (!thumb) return null;
  return { src: gameAssetUrl(thumb), color: colorByEdit.get(folder) || null };
}

// Dominant palette colour for a folder — used as the tile background while
// thumbnails decode. null when the folder has no analysed edit.
export function accentForFolder(folderName) {
  if (!ready) return null;
  return colorByEdit.get((folderName || '').toLowerCase()) || null;
}

// Full dominant palette (up to 5 '#rrggbb') for a folder — for richer effects
// like a multi-colour ambient background. null when the folder isn't analysed.
export function paletteForFolder(folderName) {
  if (!ready) return null;
  return paletteByEdit.get((folderName || '').toLowerCase()) || null;
}
