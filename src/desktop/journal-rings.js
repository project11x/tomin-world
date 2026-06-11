// ─────────────────────────────────────────────────────────────────────
// Journal — Rings (Apple-Watch-style daily completion)
//
// One module owns:
//   • The catalog of all rings + which one is fixed vs. pooled
//   • Deterministic "what are today's rings" computation
//   • Per-day closed state in localStorage
//   • Detection hooks that close rings when the right action happens
//   • A change event so UI renderers refresh without prop drilling
//
// Pool model (per the spec):
//   • Ring 1 — Solve (fixed). Closes when today's Daily Frame is played.
//   • Ring 2 + Ring 3 — picked from a 7-entry pool, deterministic per
//     Berlin date so every visitor sees the same selection.
//
// Detection coverage in this phase (4a):
//   solve   ✓ — reads daily-frame:plays
//   sit     ✓ — global <video> timeupdate >80%
//   pin     ✓ — reads journal:last-pin-date
//   trace   ✗ — needs Daily Frame "find in source" mechanic
//   read    ✗ — needs magazine-reader page-flip tracking
//   vote    ✗ — needs Weekly Vote (Phase 7)
//   pair    ✗ — needs cross-media session tracking
//   loop    ✗ — needs rewatch detection
//
// Rings whose detection isn't implemented stay open. That's honest:
// "you haven't done this thing today" is a better signal than auto-
// closing on attendance.
// ─────────────────────────────────────────────────────────────────────

import { portfolioData } from '../../data.js';

const STATE_KEY = 'journal:rings';
// Per-folder watch log. Structure (v2):
//   { folder: { lastDate: 'YYYY-MM-DD', todayCount: 1 } }
// `todayCount` is reset whenever `lastDate` changes — i.e. it's always
// the count of ≥80% watches for the folder ON THAT DATE. Loop closes
// when todayCount reaches 2.
// (v1 was { folder: 'YYYY-MM-DD' } — values are still readable; the
// read helper migrates the shape on the fly.)
const VIDEOS_WATCHED_KEY = 'journal:videos-watched';
// Session-only state for Pair detection — folders where a video AND a
// photo have been viewed in the same browsing session.
const PAIR_SESSION_KEY = 'journal:pair-session';
// Session-only count of distinct magazine spreads viewed — drives Read.
const READ_SESSION_KEY = 'journal:read-session-spreads';

export const RING_CHANGE_EVENT = 'journal:rings-changed';

// All eight rings. `pool: false` = fixed slot; `pool: true` = eligible
// for Ring 2 / Ring 3 rotation.
// `desc` = the one-line "how do I close this" hint surfaced under each
// ring in the Today card and the iOS rings list, so visitors don't have
// to guess what a label like "Pair" means.
export const RING_DEFS = {
  solve: { icon: '🧩', label: 'Solve', pool: false,
    desc: "Solve today's Daily Frame" },
  sit: { icon: '🎬', label: 'Sit', pool: true,
    desc: 'Watch any edit to the end' },
  pin: { icon: '📌', label: 'Pin', pool: true,
    desc: 'Pin something to the Board' },
  trace: { icon: '🔍', label: 'Trace', pool: true,
    desc: "Find today's frame in its edit" },
  read: { icon: '📖', label: 'Read', pool: true,
    desc: 'Flip through any magazine' },
  vote: { icon: '🗳️', label: 'Vote', pool: true,
    desc: "Cast this week's vote" },
  pair: { icon: '✨', label: 'Pair', pool: true,
    desc: 'See a video + a photo from one project' },
  loop: { icon: '🔁', label: 'Loop', pool: true,
    desc: 'Watch the same edit twice today' },
};

const POOL_IDS = Object.keys(RING_DEFS).filter((id) => RING_DEFS[id].pool);

// ── date helpers ──────────────────────────────────────────────────

// YYYY-MM-DD in the Berlin timezone. Same logic as the Daily Frame API
// so the day boundary lines up — if it's still Sunday in Berlin, today's
// rings reflect that, regardless of the visitor's local clock.
export function todayDateBerlin() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function hashDate(date) {
  let h = 0;
  for (let i = 0; i < date.length; i++) {
    h = (h * 31 + date.charCodeAt(i)) >>> 0;
  }
  return h;
}

// ── today's three rings (deterministic per date) ──────────────────

// Solve is always Ring 1. The other two are picked from POOL_IDS by
// hashing the date. Distinct rings guaranteed by adjusting the second
// pick when it collides with the first.
export function todayRingIds(date = todayDateBerlin()) {
  const seed = hashDate(date);
  const a = POOL_IDS[seed % POOL_IDS.length];
  let b = POOL_IDS[(seed * 13 + 7) % POOL_IDS.length];
  if (b === a) {
    b = POOL_IDS[(POOL_IDS.indexOf(b) + 1) % POOL_IDS.length];
  }
  return ['solve', a, b];
}

// ── state ─────────────────────────────────────────────────────────

function loadAll() {
  try { return JSON.parse(localStorage.getItem(STATE_KEY) || '{}'); }
  catch { return {}; }
}

function saveAll(state) {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch {}
}

// Prune entries older than 90 days so the localStorage blob stays small
// even after years of use. Called lazily on every save.
function prune(state) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  for (const date of Object.keys(state)) {
    if (date < cutoffStr) delete state[date];
  }
  return state;
}

export function getDayState(date = todayDateBerlin()) {
  const all = loadAll();
  return all[date] || { closed: {} };
}

export function isClosed(ringId, date = todayDateBerlin()) {
  return !!getDayState(date).closed[ringId];
}

// Mark a ring closed for today.
//
// `opts.won` tracks whether the closure represents a *competence* outcome
// (green ring) or merely *attendance* (grey ring). Defaults to `true`
// because most rings only have one kind of close: you did the action.
// Solve passes `won: false` when the player finished the puzzle without
// guessing it correctly — the ring still closes (so the day shows
// engagement) but in the passive colour.
//
// Idempotent on full state — repeat calls with the same outcome are
// no-ops. Calling with a *better* outcome (won: true after a previous
// won: false, which can't happen organically but is safe) upgrades it.
export function markClosed(ringId, date = todayDateBerlin(), opts = {}) {
  const won = opts.won === undefined ? true : opts.won === true;
  const all = loadAll();
  if (!all[date]) all[date] = { closed: {}, won: {} };
  if (!all[date].won) all[date].won = {};

  const alreadyClosed = !!all[date].closed[ringId];
  const alreadyWon = !!all[date].won[ringId];
  if (alreadyClosed && alreadyWon === won) return; // nothing changed

  all[date].closed[ringId] = true;
  all[date].won[ringId] = won;
  saveAll(prune(all));
  window.dispatchEvent(new CustomEvent(RING_CHANGE_EVENT, {
    detail: { date, ringId, won },
  }));
}

export function isWon(ringId, date = todayDateBerlin()) {
  const s = getDayState(date);
  return !!(s.won && s.won[ringId]);
}

// ── sync from external state (Daily Frame plays, last-pin date) ───
// Idempotent. Safe to call as often as you like — it only fires
// `markClosed` for rings that aren't already closed.

export function syncFromExternal() {
  const date = todayDateBerlin();
  const ids = todayRingIds(date);

  // Solve — closes when the Daily Frame for `date` is *finished* (won or
  // ran out of attempts). The `won` flag determines green vs. grey ring;
  // we also re-mark it if a previously-grey close needs to upgrade after
  // a state change.
  if (ids.includes('solve')) {
    try {
      const plays = JSON.parse(localStorage.getItem('daily-frame:plays') || '{}');
      const play = plays[date];
      if (play && play.finished) {
        const wonNow = !!play.won;
        const alreadyClosed = isClosed('solve', date);
        const alreadyWon = isWon('solve', date);
        // Skip the call when nothing would change.
        if (!alreadyClosed || alreadyWon !== wonNow) {
          markClosed('solve', date, { won: wonNow });
        }
      }
    } catch {}
  }

  // Pin — closes (always green) if the visitor pinned to the Board today.
  if (ids.includes('pin') && !isClosed('pin', date)) {
    try {
      if (localStorage.getItem('journal:last-pin-date') === date) {
        markClosed('pin', date);
      }
    } catch {}
  }

  // Vote — closes (green) if the visitor cast a vote for the current
  // week's matchup. `last-vote-week` is the YYYY-MM-DD of the week's
  // Sunday, stamped by journal-vote.js after a successful cast.
  if (ids.includes('vote') && !isClosed('vote', date)) {
    try {
      const lastWeek = localStorage.getItem('journal:last-vote-week');
      if (lastWeek && lastWeek === currentWeekKey()) {
        markClosed('vote', date);
      }
    } catch {}
  }
}

// Berlin-week key — duplicated from src/api/vote.js so the rings module
// can sync without an extra fetch. YYYY-MM-DD of this week's Sunday.
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

// ── cross-window sync ─────────────────────────────────────────────
// When the Daily Frame iframe (or any other window on this origin)
// writes to localStorage, fire syncFromExternal so rings catch up
// without waiting for the user to navigate away and back.

window.addEventListener('storage', (e) => {
  if (
    e.key === 'daily-frame:plays' ||
    e.key === 'journal:last-pin-date' ||
    e.key === 'journal:last-vote-week'
  ) {
    syncFromExternal();
  }
});
// Same-window cast — the journal-vote module fires this immediately
// after a successful POST so the ring (if Vote is in today's slot)
// closes without waiting for a page reload.
window.addEventListener('journal:vote-cast', () => syncFromExternal());

// pageshow covers iOS Safari's back-forward cache: after a user plays the
// standalone /daily-frame and taps "back to site", iOS often restores the
// home page from bfcache without re-running scripts. pageshow fires in
// that case (with event.persisted === true) so we can sync state then.
window.addEventListener('pageshow', () => syncFromExternal());

// focus covers the user switching tabs/apps and coming back. Cheap to
// call repeatedly because syncFromExternal is idempotent.
window.addEventListener('focus', () => syncFromExternal());

// visibilitychange — same idea, more reliable on mobile where focus
// doesn't always fire as expected.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) syncFromExternal();
});

// ── Video detection: drives Sit + Loop + Trace + Pair (video side) ──
//
// Hooked from one place because all four rings care about the same
// global "user is watching a <video>" signal. Folder is derived from
// the src; magazine sub-keys are excluded.

function folderFromSrc(src) {
  if (!src) return null;
  // src can be relative ("Lunatic/x.mp4?v=…") or absolute (R2 URL).
  // Strip the origin + leading slash + decode, take the first segment.
  try {
    const u = new URL(src, 'https://x');
    const parts = decodeURIComponent(u.pathname.replace(/^\//, '')).split('/');
    if (parts.length < 2) return null;
    const folder = parts[0];
    if (folder === 'TOMIN INDEX.TXT') return parts[1] || null;
    return folder;
  } catch {
    return null;
  }
}

// Cached fetch of today's Daily Frame for Trace detection.
let _todaysFrame = null;
async function getTodaysFrame() {
  if (_todaysFrame) return _todaysFrame;
  try {
    const res = await fetch('/api/daily-frame');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    _todaysFrame = await res.json();
  } catch {
    _todaysFrame = null;
  }
  return _todaysFrame;
}

(function setupVideoDetection() {
  const watched = new WeakSet();

  function watch(v) {
    if (watched.has(v)) return;
    watched.add(v);

    v.addEventListener('play', () => {
      const folder = folderFromSrc(v.currentSrc || v.src);
      if (folder) markPairSession(folder, 'video');
    });

    // Per-element guard: prevent the ≥80% threshold from firing more
    // than once per playthrough. Reset when the user scrubs back below
    // 80% or restarts playback, so a genuine second viewing re-arms it.
    let creditedThisPlay = false;
    v.addEventListener('play', () => {
      if (v.currentTime / (v.duration || Infinity) < 0.8) creditedThisPlay = false;
    });
    v.addEventListener('ended', () => { creditedThisPlay = false; });
    v.addEventListener('seeking', () => {
      if (v.currentTime / (v.duration || Infinity) < 0.8) creditedThisPlay = false;
    });

    v.addEventListener('timeupdate', async () => {
      const ids = todayRingIds();
      const folder = folderFromSrc(v.currentSrc || v.src);
      if (!v.duration || !Number.isFinite(v.duration)) return;

      // Trace — within ±2s of today's Daily Frame's timestamp on the
      // matching edit's video. Closes the moment the play head crosses
      // (or pauses on) the right frame.
      if (folder && ids.includes('trace') && !isClosed('trace')) {
        const df = await getTodaysFrame();
        if (df && df.edit &&
            folder.toLowerCase() === String(df.edit).toLowerCase() &&
            Math.abs(v.currentTime - df.timestamp) <= 2) {
          markClosed('trace');
        }
      }

      // 80% threshold — drives Sit + Loop + Pair (video side).
      if (v.currentTime / v.duration < 0.8) return;
      if (creditedThisPlay) return;
      creditedThisPlay = true;

      if (ids.includes('sit') && !isClosed('sit')) markClosed('sit');

      if (folder) {
        // Loop — counts today's ≥80% watches per folder. Closes when the
        // same folder reaches 2 watches in one Berlin day. Day-1 friendly:
        // no cross-day prerequisite, the visitor just has to vibe with
        // one edit enough to play it twice.
        const today = todayDateBerlin();
        let log = {};
        try { log = JSON.parse(localStorage.getItem(VIDEOS_WATCHED_KEY) || '{}'); } catch {}
        // Migrate v1 entries on the fly (string → { lastDate, todayCount }).
        const raw = log[folder];
        let entry;
        if (raw && typeof raw === 'object') {
          entry = { lastDate: raw.lastDate || '', todayCount: raw.todayCount || 0 };
        } else if (typeof raw === 'string') {
          entry = { lastDate: raw, todayCount: 0 };
        } else {
          entry = { lastDate: '', todayCount: 0 };
        }
        if (entry.lastDate !== today) {
          entry.lastDate = today;
          entry.todayCount = 1;
        } else {
          entry.todayCount += 1;
        }
        log[folder] = entry;
        try { localStorage.setItem(VIDEOS_WATCHED_KEY, JSON.stringify(log)); } catch {}

        if (entry.todayCount >= 2 &&
            ids.includes('loop') && !isClosed('loop')) {
          markClosed('loop');
        }
        markPairSession(folder, 'video');
      }
    });
  }

  document.querySelectorAll('video').forEach(watch);
  const obs = new MutationObserver((muts) => {
    for (const m of muts) {
      m.addedNodes.forEach((n) => {
        if (n.nodeType !== 1) return;
        if (n.tagName === 'VIDEO') watch(n);
        n.querySelectorAll?.('video').forEach(watch);
      });
    }
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });
})();

// ── Pair session helper ─────────────────────────────────────────

function markPairSession(folder, kind /* 'video' | 'photo' */) {
  if (!folder) return;
  let data = {};
  try { data = JSON.parse(sessionStorage.getItem(PAIR_SESSION_KEY) || '{}'); } catch {}
  if (!data[folder]) data[folder] = {};
  if (data[folder][kind]) return; // already recorded — no further work
  data[folder][kind] = true;
  try { sessionStorage.setItem(PAIR_SESSION_KEY, JSON.stringify(data)); } catch {}
  const ids = todayRingIds();
  if (ids.includes('pair') && !isClosed('pair') &&
      data[folder].video && data[folder].photo) {
    markClosed('pair');
  }
}

// Photo side — listen for the global item-opened event the Finder /
// Quick Look pipeline dispatches. Items that aren't videos or magazines
// count as "photo" for Pair purposes.
window.addEventListener('item-opened', (e) => {
  const folder = e.detail?.folder;
  if (!folder || folder === '__recent__') return;
  const items = portfolioData[folder] || [];
  const item = items[e.detail.index];
  if (!item || item.isMagazine) return;
  if (item.isVideo) markPairSession(folder, 'video');
  else markPairSession(folder, 'photo');
});

// ── Read detection — magazine page-flip tracking ────────────────
//
// Counts distinct spreads scrolled this session in the iOS magazine
// reader. After 3 spreads have been seen, the Read ring closes (when
// it's in today's slot). Desktop magazine reader could be hooked the
// same way later — it lives in its own iframe-ish container.

(function setupReadDetection() {
  let lastSpread = -1;
  function onScroll() {
    const ids = todayRingIds();
    if (!ids.includes('read') || isClosed('read')) return;
    const pages = document.getElementById('ios-mag-reader-pages')
      || document.getElementById('android-mag-pages');
    if (!pages || !pages.clientWidth) return;
    const idx = Math.round(pages.scrollLeft / pages.clientWidth);
    if (idx === lastSpread) return;
    lastSpread = idx;
    let seen = 0;
    try { seen = parseInt(sessionStorage.getItem(READ_SESSION_KEY) || '0', 10) || 0; } catch {}
    seen++;
    try { sessionStorage.setItem(READ_SESSION_KEY, String(seen)); } catch {}
    if (seen >= 3) markClosed('read');
  }

  function attach() {
    const ios = document.getElementById('ios-mag-reader-pages');
    const android = document.getElementById('android-mag-pages');
    [ios, android].forEach((el) => {
      if (el && !el.__readHooked) {
        el.__readHooked = true;
        el.addEventListener('scroll', onScroll, { passive: true });
      }
    });
  }
  attach();
  // Re-attach when DOM changes (in case readers are dynamically inserted)
  new MutationObserver(attach).observe(document.documentElement, {
    childList: true, subtree: true,
  });
})();

// Initial sync on module load — picks up anything that happened in a
// previous tab / yesterday before we got loaded.
syncFromExternal();
