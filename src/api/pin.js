// Cloudflare Worker endpoint — /api/pin
//
// POST → create a pin
//   body: { folder, name, sticker?, visitorId? }
//
// PUT  → admin hide / unhide (Cloudflare Access-protected, same gate as
//   /api/status)
//   body: { id, hidden }
//
// All validation is server-side. The client cannot pin arbitrary URLs —
// the polaroid src is looked up server-side from portfolioData. Sticker
// must be in the preset list. Rate limit: one pin per IP per 24h.

import { portfolioData } from '../../data.js';

// Preset stickers — must mirror the list shown in the pin-creation UI.
const STICKERS = ['✨', '🌙', '🔥', '✂️', '🎬', '📸', '🎵', '🍷', '🌅', '⚡', '🥀', '💎'];

// One pin per IP per 24h — generous enough that legit users won't hit it,
// strict enough that nobody can flood the board from one connection.
const RATE_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function onRequest(ctx) {
  const { request } = ctx;
  if (request.method === 'POST') return createPin(ctx);
  if (request.method === 'PUT') return adminUpdate(ctx);
  return jsonResponse({ error: 'method not allowed' }, 405);
}

// ── POST: create a pin ─────────────────────────────────────────────

async function createPin({ request, env }) {
  if (!env.DB) {
    return jsonResponse({ error: 'DB binding missing' }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'invalid json' }, 400);
  }

  const folder = typeof body?.folder === 'string' ? body.folder : '';
  const name = typeof body?.name === 'string' ? body.name : '';
  const sticker = body?.sticker == null ? null : String(body.sticker);
  const visitorId = typeof body?.visitorId === 'string' ? body.visitorId : '';

  // ── validate polaroid against the static portfolio ──
  // Trusting portfolioData here (the baked one) is OK: even though it can
  // lag behind R2 uploads, pinned photos that aren't in the manifest yet
  // would just need to wait for the next deploy. Better than letting
  // visitors pin arbitrary URLs.
  if (!folder || !portfolioData[folder]) {
    return jsonResponse({ error: 'unknown folder' }, 400);
  }
  const items = portfolioData[folder];
  if (!Array.isArray(items)) {
    return jsonResponse({ error: 'unknown folder' }, 400);
  }
  const item = items.find((i) => i?.name === name);
  if (!item) {
    return jsonResponse({ error: 'unknown item' }, 400);
  }
  if (item.isVideo || item.isMagazine) {
    return jsonResponse({ error: 'only photos can be pinned' }, 400);
  }

  // ── sticker validation ──
  if (sticker != null && !STICKERS.includes(sticker)) {
    return jsonResponse({ error: 'invalid sticker' }, 400);
  }

  // ── visitor id ──
  // Frontend generates this UUID on first visit; we accept any 8-64 char
  // string. If absent or malformed, synthesize one so we always have a
  // value to record (used for "my pin" highlighting later).
  const vid =
    visitorId.length >= 8 && visitorId.length <= 64 && /^[A-Za-z0-9_-]+$/.test(visitorId)
      ? visitorId
      : crypto.randomUUID();

  // ── IP hash for rate-limit ──
  const ip =
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    '0.0.0.0';
  const ipHash = await sha256(ip);

  // ── rate-limit check ──
  const since = Date.now() - RATE_WINDOW_MS;
  try {
    const recent = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM pin WHERE ip_hash = ? AND created_at > ?'
    ).bind(ipHash, since).first();
    if (recent && recent.n > 0) {
      return jsonResponse(
        { error: 'rate-limit', message: 'You already pinned today.' },
        429
      );
    }
  } catch (e) {
    return jsonResponse({ error: 'rate check failed', detail: String(e) }, 502);
  }

  // ── geo from Cloudflare (best-effort) ──
  const city = request.cf?.city || null;
  const country = request.cf?.country || null;

  // ── insert ──
  const now = Date.now();
  try {
    await env.DB.prepare(
      `INSERT INTO pin (visitor_id, ip_hash, polaroid_folder, polaroid_name,
                        polaroid_src, sticker, city, country, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(vid, ipHash, folder, item.name, item.src, sticker || null, city, country, now)
      .run();
  } catch (e) {
    return jsonResponse({ error: 'insert failed', detail: String(e) }, 502);
  }

  return jsonResponse(
    {
      ok: true,
      pin: {
        folder,
        name: item.name,
        src: item.src,
        sticker: sticker || null,
        city,
        country,
        createdAt: now,
        visitorId: vid,
      },
    },
    201
  );
}

// ── PUT: admin update (hide / unhide) ──────────────────────────────
//
// Same gating pattern as /api/status: the route is reachable only when
// Cloudflare Access has minted a JWT for the caller, so we trust the
// presence of the cf-access-jwt-assertion header.

async function adminUpdate({ request, env }) {
  if (!env.DB) {
    return jsonResponse({ error: 'DB binding missing' }, 503);
  }
  const jwt = request.headers.get('cf-access-jwt-assertion');
  if (!jwt) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'invalid json' }, 400);
  }

  const id = parseInt(body?.id, 10);
  const hidden = body?.hidden === true ? 1 : 0;
  if (!Number.isInteger(id) || id <= 0) {
    return jsonResponse({ error: 'invalid id' }, 400);
  }

  try {
    await env.DB.prepare('UPDATE pin SET hidden = ? WHERE id = ?')
      .bind(hidden, id)
      .run();
  } catch (e) {
    return jsonResponse({ error: 'update failed', detail: String(e) }, 502);
  }
  return jsonResponse({ ok: true, id, hidden: !!hidden });
}

// ── helpers ────────────────────────────────────────────────────────

async function sha256(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function jsonResponse(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...extra },
  });
}
