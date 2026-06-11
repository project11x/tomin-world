// Cloudflare Worker endpoint — /api/pinboard
//
// GET → returns the most recent non-hidden pins from D1, newest first.
// Used by the Board section in the Journal app (desktop + iOS).
//
// We keep the response small (no IP hashes leaked) and cache briefly at
// the edge — a few seconds is enough to take the load off D1 without
// making new pins feel laggy to appear for other visitors.

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'method not allowed' }, 405);
  }

  if (!env.DB) {
    return jsonResponse({ error: 'DB binding missing' }, 503);
  }

  const url = new URL(request.url);
  const rawLimit = parseInt(url.searchParams.get('limit') || '100', 10);
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(rawLimit, 200)) : 100;

  let result;
  try {
    result = await env.DB.prepare(
      `SELECT id, visitor_id, polaroid_folder, polaroid_name, polaroid_src,
              sticker, city, country, created_at
       FROM pin
       WHERE hidden = 0
       ORDER BY created_at DESC
       LIMIT ?`
    ).bind(limit).all();
  } catch (e) {
    return jsonResponse({ error: 'db read failed', detail: String(e) }, 502);
  }

  const pins = (result.results || []).map((row) => ({
    id: row.id,
    visitorId: row.visitor_id,
    folder: row.polaroid_folder,
    name: row.polaroid_name,
    src: row.polaroid_src,
    sticker: row.sticker,
    city: row.city,
    country: row.country,
    createdAt: row.created_at,
  }));

  return jsonResponse({ pins }, 200, {
    'cache-control': 'public, max-age=5, s-maxage=15, stale-while-revalidate=60',
  });
}

function jsonResponse(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...extra },
  });
}
