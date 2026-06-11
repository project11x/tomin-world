// ─────────────────────────────────────────────────────────────────────
// Journal — Stamps system
//
// 24 stamps total:
//   • 14 Travel  — auto-generated, one per portfolio folder. Earned by
//                  opening that folder.
//   •  6 Skill   — code-defined thresholds (Frame Master, First Try, …)
//   •  4 Secret  — easter eggs (5am Club, Konami, Terminal, Vollmond)
//
// All detection happens client-side. State (earned + supporting stats)
// lives in localStorage. Listeners fire on existing custom events
// (journal:game-opened, journal:pin-created, journal:connect-perfect)
// and on browser-level events for the secret stamps. Re-evaluation is
// idempotent — calling `evaluate()` extra times can't double-award.
//
// When stamps change, fires `journal:stamps-changed` so the Passport
// view + Today preview repaint without prop drilling.
// ─────────────────────────────────────────────────────────────────────

import { portfolioData } from '../../data.js';
import { slugify } from '../utils/slugs.js';
import { celebrateStamps } from './journal-celebration.js';

const STATS_KEY = 'journal:stats';
const EARNED_KEY = 'journal:earned';
export const STAMPS_CHANGED_EVENT = 'journal:stamps-changed';

// Per-folder icon. Anything not listed falls back to a generic stamp icon.
const TRAVEL_ICONS = {
  '5am in munich':         '🌅',
  'LDN x UKG':             '🌃',
  'Lunatic':               '🌙',
  'bents n glitches':      '⚡',
  'birthday kisses':       '🎂',
  'debut':                 '🎬',
  'ftlotg':                '🌴',
  'hlfatpch':              '💸',
  'lindsay lohan':         '⭐',
  'milano':                '☕',
  'schimmel in schladming':'🎿',
  'stoical':               '🪨',
  'tipsy triad':           '🍷',
  'valueME':               '💎',
};

// Build the 14 travel stamps from the live portfolio so they auto-update
// when Eddie adds / renames a folder.
function buildTravelStamps() {
  const out = [];
  for (const key of Object.keys(portfolioData)) {
    if (key.includes('/')) continue;
    if (key === 'TOMIN INDEX.TXT') continue;
    out.push({
      id: 'travel-' + slugify(key),
      kind: 'travel',
      label: key,
      icon: TRAVEL_ICONS[key] || '📍',
      sub: 'Visited',
      check: (s) => Array.isArray(s.foldersOpened) && s.foldersOpened.includes(key),
    });
  }
  return out;
}

const SKILL_STAMPS = [
  { id: 'frame-master',  kind: 'skill', label: 'Frame Master',  icon: '🎯', sub: '50 frames solved',     check: (s) => (s.framesWon || 0) >= 50 },
  { id: 'first-try',     kind: 'skill', label: 'First Try',     icon: '🥇', sub: '10× in 1 attempt',     check: (s) => (s.framesWonFirst || 0) >= 10 },
  { id: 'connection-pro',kind: 'skill', label: 'Connection Pro',icon: '🔗', sub: 'No-mistake Connect',   check: (s) => (s.connectPerfect || 0) >= 1 },
  { id: 'marathoner',    kind: 'skill', label: 'Marathoner',    icon: '🏃', sub: 'All 6 games in a day', check: (s) => !!s.marathonerEarned },
  { id: 'explorer',      kind: 'skill', label: 'Explorer',      icon: '🧭', sub: 'All edits visited',    check: (s) => {
      const all = Object.keys(portfolioData).filter((k) => !k.includes('/') && k !== 'TOMIN INDEX.TXT');
      const opened = new Set(s.foldersOpened || []);
      return all.length > 0 && all.every((k) => opened.has(k));
    } },
  { id: 'curator',       kind: 'skill', label: 'Curator',       icon: '🖼️', sub: '20 pins on the board', check: (s) => (s.pinsMade || 0) >= 20 },
];

const SECRET_STAMPS = [
  { id: '5am-club',  kind: 'secret', label: '5am Club',  icon: '🌌', sub: 'Visited at 4-6am Berlin',     check: (s) => !!s.fiveAmVisited },
  { id: 'konami',    kind: 'secret', label: 'Konami',    icon: '🎮', sub: 'Found the code',              check: (s) => !!s.konamiTyped },
  { id: 'terminal',  kind: 'secret', label: 'Terminal',  icon: '💻', sub: 'Used the TUI theme',          check: (s) => !!s.tuiUsed },
  { id: 'vollmond',  kind: 'secret', label: 'Vollmond',  icon: '🌕', sub: 'Visited during full moon',    check: (s) => !!s.fullMoonVisited },
];

export const STAMPS = [...buildTravelStamps(), ...SKILL_STAMPS, ...SECRET_STAMPS];

// ── state ─────────────────────────────────────────────────────────

function getStats() {
  try { return JSON.parse(localStorage.getItem(STATS_KEY) || '{}'); }
  catch { return {}; }
}
function setStats(s) {
  try { localStorage.setItem(STATS_KEY, JSON.stringify(s)); } catch {}
}
function bumpStats(updater) {
  const s = getStats();
  const next = updater(s) || s;
  setStats(next);
  evaluate();
}

function getEarnedRaw() {
  try { return JSON.parse(localStorage.getItem(EARNED_KEY) || '[]'); }
  catch { return []; }
}
// Returns the ids that were actually NEW this call (empty array = no change).
function markEarnedLocal(ids) {
  const cur = new Set(getEarnedRaw());
  const added = [];
  for (const id of ids) {
    if (!cur.has(id)) { cur.add(id); added.push(id); }
  }
  if (added.length) {
    try { localStorage.setItem(EARNED_KEY, JSON.stringify([...cur])); } catch {}
  }
  return added;
}

export function getEarnedSet() {
  return new Set(getEarnedRaw());
}

// Idempotent — only fires the changed event when something new lands.
export function evaluate() {
  const stats = getStats();
  const earned = [];
  for (const s of STAMPS) {
    try { if (s.check(stats)) earned.push(s.id); }
    catch {}
  }
  const newIds = markEarnedLocal(earned);
  if (newIds.length) {
    window.dispatchEvent(new CustomEvent(STAMPS_CHANGED_EVENT, { detail: { newIds } }));
    // The earning moment itself — toast with the stamp slamming in.
    celebrateStamps(STAMPS.filter((s) => newIds.includes(s.id)));
  }
}

// ── public trackers (called from other modules) ───────────────────

export function trackFolderOpened(folder) {
  if (!folder || folder === '__recent__') return;
  bumpStats((s) => {
    if (!Array.isArray(s.foldersOpened)) s.foldersOpened = [];
    if (!s.foldersOpened.includes(folder)) s.foldersOpened.push(folder);
    return s;
  });
}

export function trackPinMade() {
  bumpStats((s) => {
    s.pinsMade = (s.pinsMade || 0) + 1;
    return s;
  });
}

export function trackConnectPerfect() {
  bumpStats((s) => {
    s.connectPerfect = (s.connectPerfect || 0) + 1;
    return s;
  });
}

export function trackGameOpened(gameId) {
  const today = todayBerlinDate();
  bumpStats((s) => {
    if (!s.gamesPlayedDay || s.gamesPlayedDay.date !== today) {
      s.gamesPlayedDay = { date: today, games: [] };
    }
    if (!s.gamesPlayedDay.games.includes(gameId)) {
      s.gamesPlayedDay.games.push(gameId);
    }
    // Marathoner is "sticky" — once earned in a day, the next day's reset
    // shouldn't unearn it.
    if (s.gamesPlayedDay.games.length >= 6) s.marathonerEarned = true;
    return s;
  });
}

// ── auto-sync from existing localStorage state ────────────────────

function syncFrameStats() {
  let plays = {};
  try { plays = JSON.parse(localStorage.getItem('daily-frame:plays') || '{}'); } catch {}
  let won = 0, wonFirst = 0;
  for (const day of Object.values(plays)) {
    if (day && day.won) {
      won++;
      if (Array.isArray(day.guesses) && day.guesses.length === 1) wonFirst++;
    }
  }
  bumpStats((s) => {
    s.framesWon = won;
    s.framesWonFirst = wonFirst;
    return s;
  });
}

// ── secret-stamp detection (browser-level) ────────────────────────

function todayBerlinDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function check5amClub() {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Berlin', hour: '2-digit', hour12: false,
  });
  const h = parseInt(fmt.format(new Date()), 10);
  if (h >= 4 && h < 6) {
    bumpStats((s) => { s.fiveAmVisited = true; return s; });
  }
}

function checkTuiTheme() {
  try {
    if (localStorage.getItem('palette') === 'tui') {
      bumpStats((s) => { s.tuiUsed = true; return s; });
    }
  } catch {}
}

// Approximate lunar phase. Reference: a known full moon, plus the synodic
// month length (29.5306 days). Counts the visit as "full moon" if within
// ±1 day of a full moon — captures the visible-full window.
function checkFullMoon() {
  const REF = Date.UTC(2026, 0, 3, 22, 30); // Jan 3 2026 22:30 UTC ≈ full moon
  const CYCLE = 29.5306 * 86400 * 1000;
  const now = Date.now();
  const delta = ((now - REF) % CYCLE + CYCLE) % CYCLE;
  const daysFromFull = Math.min(delta, CYCLE - delta) / 86400 / 1000;
  if (daysFromFull <= 1) {
    bumpStats((s) => { s.fullMoonVisited = true; return s; });
  }
}

const KONAMI = [
  'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
  'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight',
  'b', 'a',
];

function setupKonami() {
  let buf = [];
  document.addEventListener('keydown', (e) => {
    buf.push(e.key);
    if (buf.length > KONAMI.length) buf = buf.slice(-KONAMI.length);
    if (buf.length === KONAMI.length && buf.every((k, i) => k === KONAMI[i] || k.toLowerCase() === KONAMI[i])) {
      bumpStats((s) => { s.konamiTyped = true; return s; });
    }
  });
}

// ── existing-event wiring ─────────────────────────────────────────

function setupListeners() {
  // Finder window open → folder visited (Explorer + Travel)
  window.addEventListener('window-changed', () => {
    document.querySelectorAll('.finder-window:not([data-hidden-closed])').forEach((w) => {
      const folder = w.dataset.folder;
      trackFolderOpened(folder);
    });
  });

  // Daily Frame plays — re-sync when a play lands (from iframe or
  // standalone, via storage event).
  window.addEventListener('storage', (e) => {
    if (e.key === 'daily-frame:plays') syncFrameStats();
    if (e.key === 'palette' && e.newValue === 'tui') {
      bumpStats((s) => { s.tuiUsed = true; return s; });
    }
  });

  // Cross-module signals
  window.addEventListener('journal:game-opened', (e) => {
    const id = e.detail && e.detail.id;
    if (id) trackGameOpened(id);
  });
  window.addEventListener('journal:pin-created', trackPinMade);
  window.addEventListener('journal:connect-perfect', trackConnectPerfect);
}

// ── boot ──────────────────────────────────────────────────────────

setupListeners();
setupKonami();
check5amClub();
checkTuiTheme();
checkFullMoon();
syncFrameStats();
evaluate();
