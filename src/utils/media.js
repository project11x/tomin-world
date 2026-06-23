// Single source of truth for where portfolio + game media is served from,
// plus Cloudflare Image-Transformation helpers.
//
// ── How to switch on faster images ──────────────────────────────────────────
// 1. Cloudflare dashboard: bind the custom domain `media.shouli.de` to the
//    `tomin-media` R2 bucket, and enable Images → Transformations on the
//    shouli.de zone.
// 2. Flip MEDIA_BASE below to the custom domain. That single change makes
//    SUPPORTS_TRANSFORM true, which activates `srcset` + AVIF everywhere the
//    viewers call srcsetAttr(). On the r2.dev dev URL transforms are a no-op,
//    so this module is safe to ship before the dashboard steps are done.

export const MEDIA_BASE = 'https://pub-859f13be44eb4577b0cb23c8d8440a59.r2.dev/';
// export const MEDIA_BASE = 'https://media.shouli.de/'; // ← flip after dashboard steps

// Cloudflare /cdn-cgi/image transformations only work behind a zone we control
// (the custom domain), never on the rate-limited r2.dev dev URL.
export const SUPPORTS_TRANSFORM = /\/\/media\.shouli\.de\//.test(MEDIA_BASE);

// Responsive widths offered to the browser. Cloudflare never upscales past the
// original (fit=scale-down), so listing large widths is harmless.
const SRCSET_WIDTHS = [320, 480, 768, 1024, 1440, 2000];

function bucketPath(absUrl) {
  return typeof absUrl === 'string' && absUrl.startsWith(MEDIA_BASE)
    ? absUrl.slice(MEDIA_BASE.length)
    : null;
}

// One transformed variant. Falls back to the untouched URL when transforms
// aren't available or the URL isn't a media URL we own.
export function transformUrl(absUrl, width, quality = 82) {
  const path = bucketPath(absUrl);
  if (!SUPPORTS_TRANSFORM || path == null) return absUrl;
  const opts = `width=${width},format=auto,quality=${quality},fit=scale-down`;
  return `${MEDIA_BASE}cdn-cgi/image/${opts}/${path}`;
}

export function srcsetFor(absUrl, widths = SRCSET_WIDTHS) {
  if (!SUPPORTS_TRANSFORM || bucketPath(absUrl) == null) return '';
  return widths.map((w) => `${transformUrl(absUrl, w)} ${w}w`).join(', ');
}

// Drop-in attribute string for an <img>. Returns '' until transforms are live,
// so existing `<img src="…">` markup renders byte-identical today.
export function srcsetAttr(absUrl, sizes) {
  const ss = srcsetFor(absUrl);
  return ss ? ` srcset="${ss}" sizes="${sizes}"` : '';
}
