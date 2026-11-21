// Cloudflare Worker endpoint — /api/passport
//
// GET  /api/passport?code=ABC-DEF → returns the JSON state stored
//                                   under that code
// PUT  /api/passport               → upserts state for body.code
//   body: { code: "ABC-DEF", state: { ... }, create?: true }
//   create: true → only creates; 409 if the code is already taken (a fresh
//   random code must never overwrite someone else's passport).
//
// No accounts — the code itself is the secret (32-char alphabet, 6 chars
// → ~1B possibilities). Because that is all that protects a passport and
// the endpoint is public, it is rate-limited per network (keyed IP hash):
//   • failed lookups: MAX_MISSES_PER_HOUR, against guessing codes
//   • new codes: MAX_NEW_CODES_PER_DAY, against filling the D1 database
// and the stored state is limited to the keys the client actually syncs.

import { ipHash as hashIp } from './ip.js';

// Same alphabet the client uses to generate codes: no 0/O/1/I/l.
const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;

const MAX_MISSES_PER_HOUR = 30;
const MAX_NEW_CODES_PER_DAY = 5;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// Must mirror SYNC_KEYS in src/desktop/journal-passport-code.js. Anything
// else in a submitted state is dropped.
const ALLOWED_KEYS = new Set([
  'journal:rings',
  'journal:stats',
  'journal:earned',
  'journal:last-pin-date',
  'journal:last-vote-week',
  'journal:visitor-id',
  'daily-frame:plays',
  'journal:hol:best',
  'journal:order:best',
  'journal:connect:best',
  'journal:silent-clip:best',
  'journal:dominant-color:best',
]);
const VALUE_MAX_CHARS = 8_000;
const STATE_MAX_BYTES = 32_000;

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

  const now = Date.now();
  const ipHash = await hashIp(request, env);

  let row;
  try {
    const misses = await env.DB
      .prepare('SELECT COUNT(*) AS n FROM passport_miss WHERE ip_hash = ? AND created_at > ?')
      .bind(ipHash, now - HOUR_MS).first();
    if ((Number(misses?.n) || 0) >= MAX_MISSES_PER_HOUR) {
      return jsonResponse({ error: 'rate-limit', message: 'Too many attempts. Try again later.' }, 429);
    }
    row = await env.DB
      .prepare('SELECT state, updated_at FROM passport_code WHERE code = ?')
      .bind(code).first();
  } catch {
    return jsonResponse({ error: 'read failed' }, 502);
  }

  if (!row) {
    try {
      await env.DB.batch([
        env.DB.prepare('INSERT INTO passport_miss (ip_hash, created_at) VALUES (?, ?)').bind(ipHash, now),
        env.DB.prepare('DELETE FROM passport_miss WHERE created_at < ?').bind(now - DAY_MS),
      ]);
    } catch {}
    return jsonResponse({ error: 'not found' }, 404);
  }

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

  const state = sanitiseState(body?.state);
  if (!state) return jsonResponse({ error: 'state required' }, 400);

  const serialised = JSON.stringify(state);
  if (serialised.length > STATE_MAX_BYTES) {
    return jsonResponse({ error: 'state too large' }, 413);
  }
  const createOnly = body?.create === true;
  const now = Date.now();

  try {
    const existing = await env.DB
      .prepare('SELECT code FROM passport_code WHERE code = ?')
      .bind(code).first();

    if (existing) {
      if (createOnly) return jsonResponse({ error: 'code taken' }, 409);
      await env.DB
        .prepare('UPDATE passport_code SET state = ?, updated_at = ? WHERE code = ?')
        .bind(serialised, now, code).run();
      return jsonResponse({ ok: true, code, updatedAt: now }, 200);
    }

    // A new code: rate-limited per network so a script can't fill D1.
    const ipHash = await hashIp(request, env);
    const recent = await env.DB
      .prepare('SELECT COUNT(*) AS n FROM passport_code WHERE creator_ip_hash = ? AND created_at > ?')
      .bind(ipHash, now - DAY_MS).first();
    if ((Number(recent?.n) || 0) >= MAX_NEW_CODES_PER_DAY) {
      return jsonResponse({ error: 'rate-limit', message: 'Too many new codes today.' }, 429);
    }

    try {
      await env.DB.prepare(
        `INSERT INTO passport_code (code, state, created_at, updated_at, creator_ip_hash)
         VALUES (?, ?, ?, ?, ?)`
      ).bind(code, serialised, now, now, ipHash).run();
    } catch {
      // Created in parallel by someone else.
      if (createOnly) return jsonResponse({ error: 'code taken' }, 409);
      await env.DB
        .prepare('UPDATE passport_code SET state = ?, updated_at = ? WHERE code = ?')
        .bind(serialised, now, code).run();
    }
  } catch {
    return jsonResponse({ error: 'write failed' }, 502);
  }
  return jsonResponse({ ok: true, code, updatedAt: now }, 200);
}

/** Keeps only the synced localStorage keys, as strings of bounded size. */
function sanitiseState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return null;
  const out = {};
  for (const [key, value] of Object.entries(state)) {
    if (!ALLOWED_KEYS.has(key) || typeof value !== 'string') continue;
    if (value.length > VALUE_MAX_CHARS) continue;
    out[key] = value;
  }
  return out;
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
