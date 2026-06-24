// Cloudflare Worker endpoint — /api/daily-frame
//
// Returns today's Daily Frame puzzle. Reads the pool from the static
// assets bundle (public/frames-pool.json), filters to approved entries,
// and picks one deterministically by Berlin date — so every visitor
// sees the same puzzle on the same calendar day.
//
// Response shape:
//   {
//     id:        "Lunatic_007",
//     edit:      "Lunatic",
//     thumb:     "/frames/Lunatic/Lunatic_007.jpg",
//     timestamp: 12.4,
//     day:       47,              // sequential puzzle number since launch
//     date:      "2026-06-04",    // Berlin date this puzzle is for
//     attempts:  3,               // how many guesses the game allows
//     edits:     ["5am in munich", "Lunatic", …]  // for autocomplete UI
//   }
//
// The endpoint never reveals which frame is "today's" beyond the
// requesting day — there's no easy way to skip ahead.

// First daily puzzle ran on this Berlin date. Puzzle #1.
// Pinning this lets the "Daily Frame #N" counter stay stable forever.
const LAUNCH_DATE_BERLIN = '2026-06-06';

// R2 public bucket base URL — single source of truth lives in ../utils/media.js.
// Game-asset paths in frames-pool.json (game/frames/...) get this prefix
// before being handed to the client.
import { MEDIA_BASE as R2_PUBLIC_BASE } from '../utils/media.js';

function berlinDateString(now = new Date()) {
  // en-CA gives YYYY-MM-DD in the requested timezone.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function daysBetween(aStr, bStr) {
  // Both strings are YYYY-MM-DD. Parse as UTC midnight to avoid TZ drift.
  const a = Date.parse(aStr + 'T00:00:00Z');
  const b = Date.parse(bStr + 'T00:00:00Z');
  return Math.round((b - a) / 86400000);
}

// Stable hash of a date string → 32-bit int. Doesn't need to be crypto —
// just needs to spread the daily picks across the pool.
// NOTE: kept for legacy callsites; the daily picker no longer uses this
// because consecutive date strings produce consecutive hash values (each
// day only flips one or two characters), which clusters consecutive
// picks together and was the root cause of "debut 6 days in a row".
function hashDate(dateStr) {
  let h = 0;
  for (let i = 0; i < dateStr.length; i++) {
    h = (h * 31 + dateStr.charCodeAt(i)) >>> 0;
  }
  return h;
}

// Seeded RNG (Mulberry32) for deterministic per-cycle edit permutations.
// Same seed → identical sequence everywhere, which is the property we
// need: every visitor must see the same cycle ordering as everyone else.
function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fisher–Yates with a seeded RNG.
function seededShuffle(arr, seed) {
  const out = arr.slice();
  const rand = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// URL-safe slug from a folder name. Mirrors src/utils/slugs.js so the
// "Watch <edit>" button in the Daily Frame result can route into the
// prerendered /projects/<slug> page (or hand the raw folder name back to
// the parent window when running embedded).
function slugify(s) {
  return String(s).toLowerCase().normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function loadPool(env, request) {
  // Read public/frames-pool.json via the Static Assets binding. Build a
  // request to the same origin so the ASSETS handler can resolve it.
  const url = new URL('/frames-pool.json', request.url);
  const res = await env.ASSETS.fetch(new Request(url.toString()));
  if (!res.ok) {
    throw new Error(`frames-pool.json: ${res.status}`);
  }
  return res.json();
}

export async function onRequest({ request, env, waitUntil }) {
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'method not allowed' }, 405);
  }

  // Real edge cache, keyed by BUILD_ID + Berlin date. The puzzle only
  // changes at Berlin midnight (new date) or when a deploy ships a new
  // frames-pool.json (new BUILD_ID). Until then every visitor gets the same
  // cached response without re-reading the pool or recomputing the pick.
  // A Cache-Control header alone wouldn't cache a Worker-built response at
  // the edge, so we store it explicitly — same pattern as portfolio.js.
  const buildId = env.BUILD_ID || 'dev';
  const today = berlinDateString();
  const cache = caches.default;
  const cacheKey = new Request(`https://internal-cache/api/daily-frame?v=${buildId}&d=${today}`);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  let pool;
  try {
    pool = await loadPool(env, request);
  } catch (e) {
    return jsonResponse({ error: 'pool unavailable', detail: String(e) }, 502);
  }

  const approved = (pool.frames || []).filter((f) => f.state === 'approved');
  if (!approved.length) {
    return jsonResponse({ error: 'no approved frames yet' }, 503);
  }

  // Today in Berlin (already computed above for the cache key) →
  // deterministic pick.

  // Sequential puzzle number since launch (#1 on the launch date).
  const day = daysBetween(LAUNCH_DATE_BERLIN, today) + 1;

  // ── Cycle-based picker ──────────────────────────────────────────
  // The naive "hashDate % approved.length" picker clustered consecutive
  // days into the same edit (alphabetical pool + low-entropy hash on
  // near-identical date strings). Replace with a cycle that visits each
  // edit exactly once every N days, where N = number of distinct edits.
  //
  // Per-cycle ordering is a deterministic shuffle seeded by the cycle
  // index, so cycle 0 might be (debut, ftlotg, milano…) and cycle 1
  // could be (Lunatic, debut, stoical…). Same seed → same order for all
  // visitors. Within an edit, the chosen frame rotates with the cycle
  // so day 14 (debut, cycle 0 frame X) and day 28 (debut, cycle 1
  // frame Y) don't show the same image.
  //
  // Stable properties:
  //   • No same-edit on consecutive days, except at the boundary between
  //     two cycles (1/N probability per boundary — acceptable).
  //   • Adding a frame to an existing edit only changes which frame
  //     shows up within that edit's day; the edit calendar is unchanged.
  //   • Adding a new edit grows the cycle length from the NEXT cycle on;
  //     past days remain stable.
  const editsInPool = [...new Set(approved.map((f) => f.edit))].sort(
    (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })
  );
  const cycleLen = editsInPool.length;
  const dayIdx = Math.max(0, day - 1);     // 0-based day since launch
  const cycleIdx = Math.floor(dayIdx / cycleLen);
  const dayInCycle = dayIdx % cycleLen;
  // 0x5BD1E995 = the multiplier from MurmurHash2's mix step. Picked just
  // because it's a non-trivial 32-bit constant — any odd prime works.
  const cycleSeed = (cycleIdx + 1) * 0x5BD1E995;
  const orderedEditsThisCycle = seededShuffle(editsInPool, cycleSeed);
  const editToday = orderedEditsThisCycle[dayInCycle];

  // Within the chosen edit, rotate through that edit's frames so each
  // cycle surfaces a different frame. Offsetting by cycleIdx alone would
  // make cycles 0 and (framesInEdit) collide; multiplying by a prime
  // (7) decorrelates the rotation from the edit ordering.
  const editFrames = approved.filter((f) => f.edit === editToday);
  const frameIdx = (cycleIdx * 7 + dayInCycle) % editFrames.length;
  const pick = editFrames[frameIdx];

  // Distinct list of edit names from the FULL pool (not just approved) so
  // the autocomplete shows every option the player could conceivably guess.
  // Sorted alphabetically for a predictable UI.
  const edits = [...new Set((pool.frames || []).map((f) => f.edit))].sort(
    (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })
  );

  // Item slug for the video itself, used in the "Watch <edit>" deep-link
  // /projects/<folder>/<item>. The frame pool stores the _web variant we
  // extracted from; portfolioData entries use the original name (sync.cjs
  // drops the _web companion), so strip the suffix before slugifying.
  // Matches the slugify-by-basename rule in src/utils/slugs.js.
  const itemBase = (pick.video || '')
    .replace(/\.[^.]+$/, '')           // drop extension
    .replace(/_(web|compressed)$/i, ''); // drop variant suffix

  const body = {
    id: pick.id,
    edit: pick.edit,
    slug: slugify(pick.edit),           // folder slug
    itemSlug: slugify(itemBase),        // item slug within folder
    // pick.thumb is an R2 key like "game/frames/Lunatic/Lunatic_007.jpg".
    // Prefix with the public R2 base so the client can hit it directly.
    thumb: R2_PUBLIC_BASE + pick.thumb,
    timestamp: pick.timestamp,
    day,
    date: today,
    attempts: 3,
    edits,
  };

  const response = jsonResponse(body, 200, {
    // Browser keeps it 5 min; the shared edge copy (cache.put below) lives
    // until the date rolls or a deploy bumps BUILD_ID — either changes the
    // key. s-maxage is the worst-case bound if an entry lingers.
    'cache-control': 'public, max-age=300, s-maxage=86400',
  });
  if (waitUntil) waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...extraHeaders,
    },
  });
}
