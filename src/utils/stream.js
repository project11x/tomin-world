// Cloudflare Stream lookup + adaptive playback. Resolves a portfolio video src
// to its HLS manifest + poster from the migration output (public/stream-map.json)
// and plays it adaptively: native HLS on Safari/iOS, hls.js everywhere else.
//
// Returns null / falls back to the raw `<video src>` for any video not in the
// map, so this is safe even if some videos aren't migrated.
import streamMap from '../../public/stream-map.js';

// Map keys are bucket-relative, URL-encoded, no query (e.g.
// "5am%20in%20munich/clip_web.mp4"). item.src may arrive absolute
// (https://media.shouli.de/…?v=…) in prod or relative in dev — normalize both.
function keyOf(src) {
  return String(src || '')
    .split('?')[0]
    .replace(/^https?:\/\/[^/]+\//, '')
    .replace(/^\/+/, '');
}

export function streamFor(src) {
  if (!src) return null;
  return streamMap[keyOf(src)] || null;
}

export function hasStream(src) {
  return streamFor(src) != null;
}

function canPlayHlsNatively(videoEl) {
  return !!(videoEl && videoEl.canPlayType && videoEl.canPlayType('application/vnd.apple.mpegurl'));
}

// Lazy-load hls.js from CDN only when a non-Safari browser actually needs it.
let hlsPromise = null;
function loadHls() {
  if (window.Hls) return Promise.resolve(window.Hls);
  if (!hlsPromise) {
    hlsPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.5/dist/hls.min.js';
      s.async = true;
      s.onload = () => resolve(window.Hls);
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  return hlsPromise;
}

// Tear down any hls.js instance + clear the element (use in place of `el.src = ''`).
export function stopStream(videoEl) {
  if (!videoEl) return;
  if (videoEl._hls) { try { videoEl._hls.destroy(); } catch { /* noop */ } videoEl._hls = null; }
  videoEl.removeAttribute('src');
  try { videoEl.load(); } catch { /* noop */ }
}

// Swap any raw-mp4 <video> inside `root` that has a Stream entry to adaptive
// HLS + poster. Use right after innerHTML renders a full-screen video player.
export function upgradeVideos(root) {
  (root || document).querySelectorAll('video[src]').forEach((v) => {
    const raw = v.getAttribute('src');
    if (streamFor(raw)) { v.removeAttribute('src'); playStream(v, raw); }
  });
}

// Point a <video> at the adaptive Stream rendition (or the raw mp4 fallback).
// Drop-in for `videoEl.src = src`.
export function playStream(videoEl, src) {
  if (!videoEl) return;
  const entry = streamFor(src);
  if (!entry) { videoEl.src = src; return; } // not migrated → raw fallback
  if (entry.poster && !videoEl.getAttribute('poster')) videoEl.poster = entry.poster;
  if (canPlayHlsNatively(videoEl)) {
    if (videoEl._hls) stopStream(videoEl);
    videoEl.src = entry.hls;
    return;
  }
  loadHls().then((Hls) => {
    if (Hls && Hls.isSupported()) {
      if (videoEl._hls) { try { videoEl._hls.destroy(); } catch { /* noop */ } }
      const hls = new Hls({ capLevelToPlayerSize: true });
      hls.loadSource(entry.hls);
      hls.attachMedia(videoEl);
      // Source attaches async, after any caller-side .play() already ran —
      // kick playback once the manifest is ready (no-op if caller paused it).
      hls.on(Hls.Events.MANIFEST_PARSED, () => { videoEl.play().catch(() => { /* needs gesture */ }); });
      videoEl._hls = hls;
    } else {
      videoEl.src = src; // ultimate fallback
    }
  }).catch(() => { videoEl.src = src; });
}
