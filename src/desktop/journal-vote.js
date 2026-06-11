// Weekly Vote — shared card renderer.
//
// Used by Today (desktop + iOS). Renders the current week's matchup,
// lets the visitor cast once, then locks in and shows tallies. Talks
// to /api/vote.
//
// On a successful cast: stamps `journal:last-vote-week` in localStorage
// (the Rings module reads this to close the Vote ring when it's in
// today's slot) and dispatches `journal:vote-cast` so other listeners
// can refresh.

import { portfolioData } from '../../data.js';
import { getVisitorId } from './journal-board.js';
import { gameAssetUrl } from '../utils/game-asset-url.js';

const LAST_VOTE_WEEK_KEY = 'journal:last-vote-week';

// Cache of the approved frame pool — same trick the games use. Keeps
// the cover-image lookup synchronous after the first call.
let _framePool = null;
async function getFramePool() {
  if (_framePool) return _framePool;
  try {
    const res = await fetch('/frames-pool.json');
    const data = await res.json();
    _framePool = (data.frames || []).filter((f) => f.state === 'approved');
  } catch {
    _framePool = [];
  }
  return _framePool;
}

// Small string hash so the chosen frame stays stable within a week but
// shifts between weeks (different week_key → different pick).
function hashKey(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

// ── tiny API client ──────────────────────────────────────────────

export async function fetchVote() {
  const vid = encodeURIComponent(getVisitorId());
  const res = await fetch(`/api/vote?visitorId=${vid}`);
  if (!res.ok) throw new Error(`vote ${res.status}`);
  return res.json();
}

export async function castVote(edit) {
  const res = await fetch('/api/vote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ edit, visitorId: getVisitorId() }),
  });
  return res.json();
}

// ── rendering ────────────────────────────────────────────────────

export async function renderVoteCard(host, { variant = 'desktop' } = {}) {
  host.innerHTML = `<div class="vote-card-skel">Loading the matchup…</div>`;
  let data;
  try {
    data = await fetchVote();
  } catch (e) {
    host.innerHTML = `<div class="vote-card-skel">Vote unavailable right now.</div>`;
    return;
  }
  if (!data.matchup) {
    host.innerHTML = `<div class="vote-card-skel">No matchup this week yet.</div>`;
    return;
  }
  // Pre-load the frame pool so the cover picker is synchronous in paint().
  await getFramePool();
  paint(host, data, variant);
}

function paint(host, data, variant) {
  const { matchup, counts, myVote, weekKey, nextWeekKey } = data;
  const a = matchup.editA, b = matchup.editB;
  const aCount = counts[a] || 0;
  const bCount = counts[b] || 0;
  const total = aCount + bCount;
  const aPct = total ? Math.round((aCount / total) * 100) : 50;
  const bPct = total ? 100 - aPct : 50;
  const voted = !!myVote;

  host.innerHTML = `
    <div class="vote-card ${variant === 'ios' ? 'vote-card--ios' : ''} ${voted ? 'is-voted' : ''}">
      <div class="vote-card-head">
        <span class="vote-card-eyebrow">This Week</span>
        <span class="vote-card-countdown" data-vote-countdown>—</span>
      </div>
      <div class="vote-card-versus">
        ${renderSide(a, aCount, aPct, voted, myVote === a, weekKey)}
        <div class="vote-versus">VS</div>
        ${renderSide(b, bCount, bPct, voted, myVote === b, weekKey)}
      </div>
      <div class="vote-card-meta">
        ${voted
          ? `You voted <strong>${escapeHtml(myVote)}</strong> · ${total} ${total === 1 ? 'vote' : 'votes'}`
          : `${total} ${total === 1 ? 'vote' : 'votes'} so far · tap a side to choose`}
      </div>
    </div>
  `;

  if (!voted) {
    host.querySelectorAll('[data-vote-edit]').forEach((btn) => {
      btn.addEventListener('click', () => onPickSide(host, data, btn.dataset.voteEdit, variant));
    });
  } else {
    // Stamp the local marker so the Vote ring closes even when the user
    // voted from a different tab.
    try { localStorage.setItem(LAST_VOTE_WEEK_KEY, weekKey); } catch {}
  }

  startCountdown(host, nextWeekKey);
}

function renderSide(edit, count, pct, voted, isMine, weekKey) {
  const cover = resolveCoverSrc(edit, weekKey);
  const thumb = cover
    ? `<img src="${escapeAttr(cover)}" alt="" loading="lazy" draggable="false" />`
    : `<div class="vote-side-fallback">📁</div>`;
  return `
    <button class="vote-side ${isMine ? 'is-mine' : ''}"
            data-vote-edit="${escapeAttr(edit)}"
            ${voted ? 'disabled' : ''}>
      <div class="vote-side-thumb">${thumb}</div>
      <div class="vote-side-name">${escapeHtml(edit)}</div>
      ${voted ? `
        <div class="vote-side-bar"><div class="vote-side-bar-fill" style="width:${pct}%"></div></div>
        <div class="vote-side-stat">${pct}% · ${count}</div>
      ` : ''}
    </button>
  `;
}

async function onPickSide(host, data, edit, variant) {
  const buttons = host.querySelectorAll('[data-vote-edit]');
  buttons.forEach((b) => (b.disabled = true));
  let result;
  try {
    result = await castVote(edit);
  } catch {
    buttons.forEach((b) => (b.disabled = false));
    return;
  }
  // Server can respond:
  //   201 ok            { ok, myVote, counts }
  //   409 already voted { myVote }
  // In either case, we have the visitor's effective vote.
  const myVote = result?.myVote || edit;
  try { localStorage.setItem(LAST_VOTE_WEEK_KEY, data.weekKey); } catch {}
  window.dispatchEvent(new CustomEvent('journal:vote-cast'));
  paint(host, {
    ...data,
    counts: result?.counts || data.counts,
    myVote,
  }, variant);
}

// ── helpers ──────────────────────────────────────────────────────

// Pick a game-asset frame for this edit, deterministic per week. Skips
// frame index 0 (avoids always showing the very first frame). Falls
// back to a portfolio photo only if the edit has no approved frames.
function resolveCoverSrc(folder, weekKey) {
  const pool = _framePool || [];
  const editFrames = pool.filter((f) => f.edit === folder);
  if (editFrames.length > 0) {
    if (editFrames.length === 1) {
      // Only one approved frame — use it (can't skip the first if it's the only).
      return gameAssetUrl(editFrames[0].thumb);
    }
    // 1+offset so we never show index 0. Hash by week so the same edit
    // can match up multiple weeks and still get a fresh face.
    const seed = hashKey(`${weekKey || ''}|${folder}`);
    const pick = editFrames[1 + (seed % (editFrames.length - 1))];
    return gameAssetUrl(pick.thumb);
  }
  // Fallback — portfolio data (photo preferred, else any item).
  const items = portfolioData[folder] || [];
  const photo = items.find((it) => !it.isVideo && !it.isMagazine && it.src);
  if (photo) return photo.src;
  const any = items.find((it) => it.src);
  return any ? any.src : null;
}

function startCountdown(host, nextWeekKey) {
  const el = host.querySelector('[data-vote-countdown]');
  if (!el) return;
  function tick() {
    const ms = msUntilBerlinMidnight(nextWeekKey);
    if (ms <= 0) {
      el.textContent = 'Closing…';
      return;
    }
    const dayMs = 24 * 3600 * 1000;
    const d = Math.floor(ms / dayMs);
    const h = Math.floor((ms % dayMs) / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    el.textContent = d > 0 ? `${d}d ${h}h left` : (h > 0 ? `${h}h ${m}m left` : `${m}m left`);
  }
  tick();
  if (host.__voteCountdownTimer) clearInterval(host.__voteCountdownTimer);
  host.__voteCountdownTimer = setInterval(tick, 30 * 1000);
}

// Approximate ms until Berlin midnight on dateStr (YYYY-MM-DD). Uses a
// flat UTC+1 offset — drifts by 1h across DST switches, acceptable
// precision for the countdown display.
function msUntilBerlinMidnight(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const utcTarget = Date.UTC(y, m - 1, d) - 3600 * 1000;
  return utcTarget - Date.now();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c] || c));
}
function escapeAttr(s) {
  return String(s).replace(/[&"']/g, (c) => ({
    '&': '&amp;', '"': '&quot;', "'": '&#39;'
  }[c] || c));
}
