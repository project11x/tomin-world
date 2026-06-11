// Passport Code — opt-in cross-device sync of all journal state.
//
// The visitor generates a 6-character code on device A. The code maps
// to a JSON blob in D1 containing every relevant localStorage key.
// Entering the same code on device B hydrates that state. Subsequent
// changes auto-sync (debounced 5s) so both devices stay in step.

const CODE_KEY = 'journal:passport-code';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // skips 0/1/I/O/l

// Every localStorage key worth syncing. Game high scores included so
// personal bests follow the visitor across devices. Visitor id is
// included so cross-device pin / vote authorship lines up — the server
// still rate-limits by IP.
const SYNC_KEYS = [
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
];

// ── code helpers ─────────────────────────────────────────────────

export function getStoredCode() {
  try { return localStorage.getItem(CODE_KEY); } catch { return null; }
}
function storeCode(code) {
  try { localStorage.setItem(CODE_KEY, code); } catch {}
}
export function clearStoredCode() {
  try { localStorage.removeItem(CODE_KEY); } catch {}
}

export function generateCode() {
  let s = '';
  for (let i = 0; i < 6; i++) {
    s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return s.slice(0, 3) + '-' + s.slice(3);
}

function normalise(s) {
  return String(s).toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, '');
}

function formatCode(raw) {
  const n = normalise(raw);
  if (n.length !== 6) return n;
  return n.slice(0, 3) + '-' + n.slice(3);
}

// ── state collection / restore ───────────────────────────────────

function gatherState() {
  const out = {};
  for (const k of SYNC_KEYS) {
    try {
      const v = localStorage.getItem(k);
      if (v != null) out[k] = v;
    } catch {}
  }
  return out;
}

function restoreState(state) {
  let restored = 0;
  for (const k of Object.keys(state || {})) {
    if (!SYNC_KEYS.includes(k)) continue;
    try {
      localStorage.setItem(k, state[k]);
      restored++;
    } catch {}
  }
  return restored;
}

// ── server I/O ───────────────────────────────────────────────────

async function putToServer(code) {
  const res = await fetch('/api/passport', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: normalise(code), state: gatherState() }),
  });
  return res.ok;
}

async function getFromServer(code) {
  const res = await fetch(`/api/passport?code=${encodeURIComponent(normalise(code))}`);
  if (!res.ok) return null;
  try { return await res.json(); } catch { return null; }
}

// ── public actions ───────────────────────────────────────────────

export async function createCode() {
  const code = generateCode();
  const ok = await putToServer(code);
  if (!ok) return null;
  storeCode(code);
  return code;
}

export async function restoreCode(raw) {
  const code = formatCode(raw);
  if (normalise(code).length !== 6) return { ok: false, error: 'invalid' };
  const data = await getFromServer(code);
  if (!data) return { ok: false, error: 'not-found' };
  const count = restoreState(data.state || {});
  storeCode(code);
  return { ok: true, code, restored: count };
}

export async function syncNow() {
  const code = getStoredCode();
  if (!code) return false;
  return putToServer(code);
}

// ── auto-sync on state-change events ─────────────────────────────

let timer = null;
function scheduleSync() {
  if (!getStoredCode()) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { syncNow().catch(() => {}); }, 5000);
}

const SYNC_TRIGGER_EVENTS = [
  'journal:rings-changed',
  'journal:stamps-changed',
  'journal:vote-cast',
  'journal:pin-created',
  'journal:connect-perfect',
  'journal:game-opened',
];

for (const ev of SYNC_TRIGGER_EVENTS) {
  window.addEventListener(ev, scheduleSync);
}

// Flush queued sync when the user leaves / hides — best-effort. If the
// browser kills us first we just lose the last ≤5s of state, which is
// fine.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && getStoredCode()) {
    if (timer) clearTimeout(timer);
    syncNow().catch(() => {});
  }
});

// Pull-on-load: if we have a code, grab the latest server state in case
// another device pushed since last time. Fires the standard repaint
// events so existing renderers refresh in place.
(async function pullOnLoad() {
  const code = getStoredCode();
  if (!code) return;
  const data = await getFromServer(code);
  if (!data || !data.state) return;
  restoreState(data.state);
  window.dispatchEvent(new CustomEvent('journal:rings-changed'));
  window.dispatchEvent(new CustomEvent('journal:stamps-changed'));
})();
