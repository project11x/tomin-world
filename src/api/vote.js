// Cloudflare Worker endpoint — /api/vote
//
// GET  → current week's matchup + tallies + your vote (if cast)
// POST → cast a vote
//   body: { edit, visitorId }
// PUT  → admin: set / replace the matchup for a given week (Access-gated)
//   body: { editA, editB, weekKey? (defaults to current) }
//
// Auto-pick: if GET hits a week with no matchup yet, the worker picks
// two random portfolio folders and inserts them. That keeps the card
// alive even when no admin has curated. PUT can overwrite.
//
// Anti-double-vote: one vote per (week, visitor_id) — the primary key.
// The IP is only a soft cap (MAX_VOTES_PER_IP per week) against scripted
// stuffing: one vote per IP would lock out everyone sharing a household
// Wi-Fi or a mobile carrier's CGNAT address, and showed one person's vote
// to the others as "your vote".

import { portfolioData } from '../../data.js';
import { requireAdmin } from './access.js';
import { ipHash as hashIp } from './ip.js';

const MAX_VOTES_PER_IP = 20;

// ── time helpers ─────────────────────────────────────────────────

function currentWeekKey(now = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric', month: '2-digit', day: '2-digit',
    weekday: 'short',
  });
  const parts = fmt.formatToParts(now);
  const y = parts.find((p) => p.type === 'year').value;
  const m = parts.find((p) => p.type === 'month').value;
  const d = parts.find((p) => p.type === 'day').value;
  const wd = parts.find((p) => p.type === 'weekday').value;
  const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dayNum = dayMap[wd] ?? 0;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  date.setUTCDate(date.getUTCDate() - dayNum);
  return date.toISOString().slice(0, 10);
}

function nextWeekKey(weekKey) {
  const [y, m, d] = weekKey.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + 7);
  return date.toISOString().slice(0, 10);
}

// ── helpers ──────────────────────────────────────────────────────

function eligibleFolders() {
  return Object.keys(portfolioData).filter(
    (k) => !k.includes('/') && k !== 'TOMIN INDEX.TXT'
  );
}

function pickRandomPair() {
  const all = eligibleFolders();
  if (all.length < 2) return null;
  const shuffled = [...all].sort(() => Math.random() - 0.5);
  return [shuffled[0], shuffled[1]];
}

function jsonResponse(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...extra },
  });
}

// ── matchup retrieval / auto-pick ────────────────────────────────

async function getOrCreateMatchup(env, weekKey) {
  let row = await env.DB
    .prepare('SELECT week_key, edit_a, edit_b, origin FROM vote_match WHERE week_key = ?')
    .bind(weekKey)
    .first();
  if (row) return row;

  const pair = pickRandomPair();
  if (!pair) return null;
  await env.DB.prepare(
    `INSERT OR IGNORE INTO vote_match (week_key, edit_a, edit_b, created_at, origin)
     VALUES (?, ?, ?, ?, 'auto')`
  ).bind(weekKey, pair[0], pair[1], Date.now()).run();

  row = await env.DB
    .prepare('SELECT week_key, edit_a, edit_b, origin FROM vote_match WHERE week_key = ?')
    .bind(weekKey)
    .first();
  return row;
}

// ── route entry ───────────────────────────────────────────────────

export async function onRequest(ctx) {
  const { request } = ctx;
  if (request.method === 'GET')  return handleGet(ctx);
  if (request.method === 'POST') return handlePost(ctx);
  if (request.method === 'PUT')  return handlePut(ctx);
  return jsonResponse({ error: 'method not allowed' }, 405);
}

// ── GET ──────────────────────────────────────────────────────────

async function handleGet({ request, env }) {
  if (!env.DB) return jsonResponse({ error: 'DB binding missing' }, 503);

  const weekKey = currentWeekKey();
  const matchup = await getOrCreateMatchup(env, weekKey);
  if (!matchup) {
    return jsonResponse({
      weekKey,
      nextWeekKey: nextWeekKey(weekKey),
      matchup: null,
      counts: {},
      myVote: null,
    });
  }

  // Tallies
  const tallyRows = await env.DB
    .prepare(
      'SELECT edit, COUNT(*) AS n FROM vote_cast WHERE week_key = ? GROUP BY edit'
    )
    .bind(weekKey)
    .all();
  const counts = {};
  for (const r of tallyRows.results || []) counts[r.edit] = Number(r.n) || 0;
  counts[matchup.edit_a] = counts[matchup.edit_a] || 0;
  counts[matchup.edit_b] = counts[matchup.edit_b] || 0;

  // myVote: only this visitor's own vote. (No IP fallback — that showed
  // another person on the same network their neighbour's vote.)
  const url = new URL(request.url);
  const visitorId = (url.searchParams.get('visitorId') || '').trim();
  let myVote = null;
  if (visitorId) {
    const row = await env.DB
      .prepare('SELECT edit FROM vote_cast WHERE week_key = ? AND visitor_id = ?')
      .bind(weekKey, visitorId)
      .first();
    if (row) myVote = row.edit;
  }

  return jsonResponse(
    {
      weekKey,
      nextWeekKey: nextWeekKey(weekKey),
      matchup: { editA: matchup.edit_a, editB: matchup.edit_b },
      counts,
      myVote,
      origin: matchup.origin,
    },
    200,
    { 'cache-control': 'public, max-age=5, s-maxage=10, stale-while-revalidate=30' }
  );
}

// ── POST: cast a vote ────────────────────────────────────────────

async function handlePost({ request, env }) {
  if (!env.DB) return jsonResponse({ error: 'DB binding missing' }, 503);

  let body;
  try { body = await request.json(); }
  catch { return jsonResponse({ error: 'invalid json' }, 400); }

  const edit = typeof body?.edit === 'string' ? body.edit : '';
  const visitorIdRaw = typeof body?.visitorId === 'string' ? body.visitorId : '';

  const weekKey = currentWeekKey();
  const matchup = await getOrCreateMatchup(env, weekKey);
  if (!matchup) return jsonResponse({ error: 'no matchup for this week' }, 409);

  if (edit !== matchup.edit_a && edit !== matchup.edit_b) {
    return jsonResponse({ error: 'edit not in this week\'s matchup' }, 400);
  }

  const visitorId =
    visitorIdRaw.length >= 8 && visitorIdRaw.length <= 64 &&
    /^[A-Za-z0-9_-]+$/.test(visitorIdRaw)
      ? visitorIdRaw
      : crypto.randomUUID();

  const ipHash = await hashIp(request, env);

  const alreadyVoted = (row) => jsonResponse(
    { error: 'already voted', message: 'You already voted this week.', myVote: row.edit },
    409
  );

  // One vote per visitor and week — returns the visitor's own earlier vote.
  const existing = await env.DB
    .prepare('SELECT edit FROM vote_cast WHERE week_key = ? AND visitor_id = ?')
    .bind(weekKey, visitorId)
    .first();
  if (existing) return alreadyVoted(existing);

  // Soft per-IP cap against scripted ballot stuffing. Never reveals what
  // the others on this IP voted.
  const fromIp = await env.DB
    .prepare('SELECT COUNT(*) AS n FROM vote_cast WHERE week_key = ? AND ip_hash = ?')
    .bind(weekKey, ipHash)
    .first();
  if ((Number(fromIp?.n) || 0) >= MAX_VOTES_PER_IP) {
    return jsonResponse(
      { error: 'rate-limit', message: 'Too many votes from this network this week.' },
      429
    );
  }

  try {
    await env.DB.prepare(
      `INSERT INTO vote_cast (week_key, visitor_id, ip_hash, edit, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(weekKey, visitorId, ipHash, edit, Date.now()).run();
  } catch {
    // Primary key (week_key, visitor_id): a parallel request from the same
    // visitor won the race. Report that vote instead of a 500.
    const row = await env.DB
      .prepare('SELECT edit FROM vote_cast WHERE week_key = ? AND visitor_id = ?')
      .bind(weekKey, visitorId)
      .first();
    if (row) return alreadyVoted(row);
    return jsonResponse({ error: 'vote failed' }, 502);
  }

  // Return fresh counts
  const tallyRows = await env.DB
    .prepare('SELECT edit, COUNT(*) AS n FROM vote_cast WHERE week_key = ? GROUP BY edit')
    .bind(weekKey).all();
  const counts = {};
  for (const r of tallyRows.results || []) counts[r.edit] = Number(r.n) || 0;
  counts[matchup.edit_a] = counts[matchup.edit_a] || 0;
  counts[matchup.edit_b] = counts[matchup.edit_b] || 0;

  return jsonResponse(
    { ok: true, weekKey, myVote: edit, counts, visitorId },
    201
  );
}

// ── PUT: admin set matchup ───────────────────────────────────────

async function handlePut({ request, env }) {
  if (!env.DB) return jsonResponse({ error: 'DB binding missing' }, 503);
  // Public route → verify the Access cookie JWT, never a forgeable header.
  if (!(await requireAdmin(request, env))) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }

  let body;
  try { body = await request.json(); }
  catch { return jsonResponse({ error: 'invalid json' }, 400); }

  const editA = typeof body?.editA === 'string' ? body.editA : '';
  const editB = typeof body?.editB === 'string' ? body.editB : '';
  const weekKey = (typeof body?.weekKey === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.weekKey))
    ? body.weekKey
    : currentWeekKey();

  const folders = new Set(eligibleFolders());
  if (!folders.has(editA) || !folders.has(editB) || editA === editB) {
    return jsonResponse({ error: 'editA / editB must be two distinct portfolio folders' }, 400);
  }

  await env.DB.prepare(
    `INSERT INTO vote_match (week_key, edit_a, edit_b, created_at, origin)
     VALUES (?, ?, ?, ?, 'admin')
     ON CONFLICT (week_key) DO UPDATE SET edit_a = excluded.edit_a,
                                          edit_b = excluded.edit_b,
                                          origin = 'admin'`
  ).bind(weekKey, editA, editB, Date.now()).run();

  return jsonResponse({ ok: true, weekKey, matchup: { editA, editB }, origin: 'admin' });
}
