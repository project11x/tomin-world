// Cloudflare Pages Function — lightweight click tracker.
// Path: /api/track  (POST to record, GET to read counts)
//
// Why this exists:
//   Cloudflare Web Analytics only counts initial page loads — it does
//   not see SPA route changes. So we beacon every folder / item open
//   ourselves and aggregate the counts in a KV namespace.
//
// Required Pages binding (Settings → Functions → KV namespace bindings):
//   TRACK_KV → a KV namespace dedicated to click counts.
//
// Storage shape:
//   key:   "folder:<slug>"  or  "item:<folder-slug>/<item-slug>"
//   value: JSON { count: number, last: ISO-8601 timestamp }
//
// Endpoints:
//   POST /api/track    body { kind: "folder"|"item", folder: string, item?: string }
//                      → { ok: true } (always 200; we never block the SPA)
//
//   GET  /api/track    → { folders: { slug: { count, last } }, items: { ... } }
//                        plain JSON, cached 30s on the edge so the admin
//                        dashboard stays snappy without hammering KV.
//
// Notes:
//   • Read-modify-write isn't atomic in KV; a thundering herd would
//     undercount. For a portfolio site that's fine.
//   • Slugs come from the client (already URL-safe). We sanity-strip
//     anything that's not a-z0-9 plus "-" and "/" defensively.

const SAFE = /[^a-z0-9/_-]/g;
const sanitize = (s) => String(s || '').toLowerCase().replace(SAFE, '').slice(0, 120);

async function bumpCounter(kv, key) {
  const raw = await kv.get(key);
  let entry = { count: 0, last: null };
  if (raw) {
    try { entry = JSON.parse(raw) || entry; } catch (_) {}
  }
  entry.count = (entry.count | 0) + 1;
  entry.last = new Date().toISOString();
  // KV write is fire-and-forget for the response — caller doesn't await.
  return kv.put(key, JSON.stringify(entry));
}

export async function onRequestPost({ request, env }) {
  const kv = env.TRACK_KV;
  if (!kv) return new Response(JSON.stringify({ ok: false, error: 'no-kv' }), { status: 200, headers: { 'content-type': 'application/json' } });

  let body = {};
  try { body = await request.json(); } catch (_) {}

  const kind = body.kind === 'item' ? 'item' : 'folder';
  const folder = sanitize(body.folder);
  if (!folder) return new Response(JSON.stringify({ ok: false }), { status: 200, headers: { 'content-type': 'application/json' } });

  const key = kind === 'item' && body.item
    ? `item:${folder}/${sanitize(body.item)}`
    : `folder:${folder}`;

  // Don't await — return immediately so the beacon is non-blocking.
  // Pages keeps the request alive long enough for the put to land via
  // the Promise still being referenced.
  bumpCounter(kv, key).catch(() => {});

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

export async function onRequestGet({ env }) {
  const kv = env.TRACK_KV;
  if (!kv) return new Response(JSON.stringify({ folders: {}, items: {} }), { headers: { 'content-type': 'application/json' } });

  const out = { folders: {}, items: {} };
  let cursor;
  // Single page is enough for any realistic portfolio. Walk anyway for
  // safety — KV list returns up to 1000 keys per call.
  do {
    const res = await kv.list({ cursor, limit: 1000 });
    for (const k of res.keys) {
      const raw = await kv.get(k.name);
      if (!raw) continue;
      let entry; try { entry = JSON.parse(raw); } catch (_) { continue; }
      if (k.name.startsWith('folder:')) out.folders[k.name.slice(7)] = entry;
      else if (k.name.startsWith('item:')) out.items[k.name.slice(5)] = entry;
    }
    cursor = res.list_complete ? null : res.cursor;
  } while (cursor);

  return new Response(JSON.stringify(out), {
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, max-age=30, s-maxage=30',
    },
  });
}
