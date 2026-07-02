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

// Poster still for a video src — the Cloudflare Stream thumbnail when the video
// has been migrated, else null. Lets grid tiles show a real cover frame instead
// of the black box a raw <video> paints before it's played.
export function posterUrlForVideo(src) {
  return streamFor(src)?.poster || null;
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
  videoEl._streamToken = (videoEl._streamToken || 0) + 1; // cancel any pending async attach
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

// Below this duration HLS is pure overhead: the manifest + segment round-trips
// cost more than just downloading the whole mp4, which also starts faster and
// loops seamlessly. Covers the sub-second magazine page clips.
const MIN_HLS_SECONDS = 5;

// Native HLS only where MSE is missing or the platform mandates it (iOS —
// including iPadOS, which masquerades as macOS but is touch). Desktop Safari
// goes through hls.js like everyone else: the native player exposes no ABR
// control, so it blur-starts at whatever rung it likes and we can't stop it.
function mustUseNativeHls(videoEl) {
  if (!canPlayHlsNatively(videoEl)) return false;
  const hasMse = typeof window.MediaSource !== 'undefined' || typeof window.ManagedMediaSource !== 'undefined';
  const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent));
  return !hasMse || isIos;
}

// Point a <video> at the adaptive Stream rendition (or the raw mp4 fallback).
// Drop-in for `videoEl.src = src`.
export function playStream(videoEl, src) {
  if (!videoEl) return;
  // Invalidate any hls.js attach still in flight from a previous source — its
  // .then() would otherwise land after a newer (sync) raw/native assignment
  // and play the wrong video (rapid arrow-key navigation in the edits viewer).
  const token = (videoEl._streamToken = (videoEl._streamToken || 0) + 1);
  const entry = streamFor(src);
  if (entry?.poster && !videoEl.getAttribute('poster')) videoEl.poster = entry.poster;
  if (!entry || (entry.duration && entry.duration < MIN_HLS_SECONDS)) {
    if (videoEl._hls) stopStream(videoEl);
    // Raw R2 media has no CORS headers — a crossOrigin attr would block the
    // load, so make sure it's cleared before the raw fallback.
    videoEl.removeAttribute('crossorigin');
    videoEl.src = src;
    return;
  }
  // Cloudflare Stream serves ACAO:* → mark the load CORS-clean so a <canvas>
  // can read its frames untainted (the edits ambilight), incl. the native-HLS
  // path where the element loads the cross-origin manifest directly.
  videoEl.crossOrigin = 'anonymous';
  if (mustUseNativeHls(videoEl)) {
    if (videoEl._hls) stopStream(videoEl);
    videoEl.src = entry.hls;
    return;
  }
  const rawFallback = () => {
    videoEl.removeAttribute('crossorigin');
    videoEl.src = src;
  };
  loadHls().then((Hls) => {
    if (videoEl._streamToken !== token) return; // superseded by a newer source
    if (Hls && Hls.isSupported()) {
      if (videoEl._hls) { try { videoEl._hls.destroy(); } catch { /* noop */ } }
      const hls = new Hls({
        // hls.js defaults to a ~500 kbps bandwidth estimate, so the first
        // seconds play the bottom rung — a visible blur-in the old progressive
        // mp4s never had. Assume a fat pipe and let ABR step DOWN if the
        // connection disagrees; portfolio = quality first, no player-size cap.
        abrEwmaDefaultEstimate: 5_000_000,
      });
      hls.loadSource(entry.hls);
      hls.attachMedia(videoEl);
      // Source attaches async, after any caller-side .play() already ran —
      // kick playback once the manifest is ready (no-op if caller paused it).
      hls.on(Hls.Events.MANIFEST_PARSED, () => { videoEl.play().catch(() => { /* needs gesture */ }); });
      // Stream outage / fatal decode error → drop to the raw mp4 instead of a
      // black stage.
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (data?.fatal && videoEl._hls === hls) { stopStream(videoEl); rawFallback(); }
      });
      videoEl._hls = hls;
    } else if (canPlayHlsNatively(videoEl)) {
      videoEl.src = entry.hls;
    } else {
      rawFallback(); // ultimate fallback
    }
  }).catch(() => { if (videoEl._streamToken === token) rawFallback(); });
}
