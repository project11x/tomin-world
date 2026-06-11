// Game assets (frames, clips) live on R2 — same bucket as portfolio
// media, under the `game/` prefix. They never get copied into dist/, so
// every environment (vite dev, wrangler dev, production) loads them
// directly from the R2 public URL.
//
// Manifest paths are bucket-relative (e.g. "game/frames/Lunatic/Lunatic_007.jpg");
// this helper turns them into fully-qualified URLs the browser can fetch.
//
// Single source of truth: when R2 ever moves to a custom domain
// (media.shouli.de), change R2_PUBLIC_BASE here and in app.js +
// src/api/daily-frame.js.

const R2_PUBLIC_BASE = 'https://pub-859f13be44eb4577b0cb23c8d8440a59.r2.dev/';

export function gameAssetUrl(pathOrUrl) {
  if (!pathOrUrl) return '';
  // Already absolute (legacy data, or a backend that resolved it for us).
  if (/^https?:\/\//.test(pathOrUrl)) return pathOrUrl;
  // Strip a single leading slash so we don't end up with "//game/...".
  const clean = pathOrUrl.replace(/^\/+/, '');
  return R2_PUBLIC_BASE + clean;
}
