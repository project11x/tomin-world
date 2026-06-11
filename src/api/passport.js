// Cloudflare Worker endpoint — /api/passport
//
// GET  /api/passport?code=ABC-DEF → returns the JSON state stored
//                                   under that code
// PUT  /api/passport               → upserts state for body.code
//   body: { code: "ABC-DEF", state: { ... } }
//
// No auth — the code itself is the secret. 32-char alphabet, 6 chars
// → ~1B possibilities, plenty for a small-audience side. Codes are
// case-normalised and dashes stripped on the way in.

const STATE_MAX_BYTES = 100_000;
// Same alphabet the client uses to generate codes: no 0/O/1/I/l.
const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;

export async function onRequest(ctx) {
  const { request, env } = ctx;
  if (!env.DB) return jsonResponse({ error: 'DB binding missing' }, 503);
  if (request.method === 'GET') return handleGet(request, env);
  if (request.method === 'PUT') return handlePut(request, env);
  return jsonResponse({ error: 'method not allowed' }, 405);
}

async function handleGet(request, env) {
  const url = new URL(request.url);
  const code = normaliseCode(url.searchParams.get('code') || '');
  if (!CODE_RE.test(code)) return jsonResponse({ error: 'invalid code' }, 400);

  let row;
  try {
    row = await env.DB
      .prepare('SELECT state, updated_at FROM passport_code WHERE code = ?')
      .bind(code).first();
  } catch (e) {
    return jsonResponse({ error: 'read failed', detail: String(e) }, 502);
  }
  if (!row) return jsonResponse({ error: 'not found' }, 404);

  let state;
  try { state = JSON.parse(row.state); }
  catch { state = {}; }

  return jsonResponse(
    { code, state, updatedAt: row.updated_at },
    200,
    { 'cache-control': 'no-store' }
  );
}

async function handlePut(request, env) {
  let body;
  try { body = await request.json(); }
  catch { return jsonResponse({ error: 'invalid json' }, 400); }

  const code = normaliseCode(typeof body?.code === 'string' ? body.code : '');
  if (!CODE_RE.test(code)) return jsonResponse({ error: 'invalid code' }, 400);

  if (!body?.state || typeof body.state !== 'object') {
    return jsonResponse({ error: 'state required' }, 400);
  }

  const serialised = JSON.stringify(body.state);
  if (serialised.length > STATE_MAX_BYTES) {
    return jsonResponse({ error: 'state too large' }, 413);
  }

  const now = Date.now();
  try {
    await env.DB.prepare(
      `INSERT INTO passport_code (code, state, created_at, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(code) DO UPDATE SET state = excluded.state,
                                       updated_at = excluded.updated_at`
    ).bind(code, serialised, now, now).run();
  } catch (e) {
    return jsonResponse({ error: 'write failed', detail: String(e) }, 502);
  }
  return jsonResponse({ ok: true, code, updatedAt: now }, 200);
}

function normaliseCode(s) {
  return String(s).toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, '');
}

function jsonResponse(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...extra },
  });
}
