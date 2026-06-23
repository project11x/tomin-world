// Game assets (frames, clips) live on R2 — same bucket as portfolio
// media, under the `game/` prefix. They never get copied into dist/, so
// every environment (vite dev, wrangler dev, production) loads them
// directly from the R2 public URL.
//
// Manifest paths are bucket-relative (e.g. "game/frames/Lunatic/Lunatic_007.jpg");
// this helper turns them into fully-qualified URLs the browser can fetch.
//
// Single source of truth for the media base lives in ./media.js — flip it
// there to move everything to media.shouli.de.
import { MEDIA_BASE } from './media.js';

export function gameAssetUrl(pathOrUrl) {
  if (!pathOrUrl) return '';
  // Already absolute (legacy data, or a backend that resolved it for us).
  if (/^https?:\/\//.test(pathOrUrl)) return pathOrUrl;
  // Strip a single leading slash so we don't end up with "//game/...".
  const clean = pathOrUrl.replace(/^\/+/, '');
  return MEDIA_BASE + clean;
}
