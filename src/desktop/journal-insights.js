// Insights — Activity calendar + personal stats + game bests.
//
// Pulls from existing localStorage state: journal:rings (per-day closures),
// daily-frame:plays, journal:stats (stamps + folder explore), journal:earned,
// and the per-game high score keys. No new persistence — this is a pure
// reader.

import { portfolioData } from '../../data.js';
import { STAMPS, getEarnedSet } from './journal-stamps.js';
import { RING_DEFS, todayRingIds } from './journal-rings.js';

const RINGS_STATE_KEY = 'journal:rings';
const STATS_KEY = 'journal:stats';
const PLAYS_KEY = 'daily-frame:plays';

const GAME_BESTS = [
  { id: 'higher-or-lower', label: 'Higher or Lower', key: 'journal:hol:best',           suffix: 'streak' },
  { id: 'order',           label: 'Order the Edit',  key: 'journal:order:best',         suffix: '/ 5' },
  { id: 'connect',         label: 'Connect',         key: 'journal:connect:best',       suffix: 'groups' },
  { id: 'silent-clip',     label: 'Silent Clip',     key: 'journal:silent-clip:best',   suffix: '/ 3' },
  { id: 'color',           label: 'Dominant Color',  key: 'journal:dominant-color:best',suffix: '/ 3' },
];

// ── date helpers ─────────────────────────────────────────────────

function todayBerlin() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function shiftDate(dateStr, deltaDays) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().slice(0, 10);
}

// ── state readers ────────────────────────────────────────────────

function loadRingsAll() {
  try { return JSON.parse(localStorage.getItem(RINGS_STATE_KEY) || '{}'); }
  catch { return {}; }
}
function loadStats() {
  try { return JSON.parse(localStorage.getItem(STATS_KEY) || '{}'); }
  catch { return {}; }
}
function loadPlays() {
  try { return JSON.parse(localStorage.getItem(PLAYS_KEY) || '{}'); }
  catch { return {}; }
}
function readBest(key) {
  try { return parseInt(localStorage.getItem(key) || '0', 10) || 0; }
  catch { return 0; }
}

// ── compute ──────────────────────────────────────────────────────

function buildCalendar(days = 35) {
  const ringsAll = loadRingsAll();
  const today = todayBerlin();
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = shiftDate(today, -i);
    const day = ringsAll[date] || { closed: {}, won: {} };
    const closedCount = Object.values(day.closed || {}).filter(Boolean).length;
    const solveWon = !!(day.won && day.won.solve);
    // "Perfect day" = all 3 rings closed AND Solve was actually won
    const perfect = closedCount >= 3 && solveWon;
    out.push({ date, closedCount, solveWon, perfect, anyClosed: closedCount > 0 });
  }
  return out;
}

function thisMonthPerfect(cal) {
  const today = todayBerlin();
  const [, m] = today.split('-');
  return cal.filter((d) => d.date.slice(5, 7) === m && d.perfect).length;
}

function activeDaysCount(cal) {
  return cal.filter((d) => d.anyClosed).length;
}

// ── render ───────────────────────────────────────────────────────

export function renderInsights(host) {
  const cal = buildCalendar(35);
  const earnedStamps = getEarnedSet();
  const stats = loadStats();
  const plays = loadPlays();
  const playsArr = Object.values(plays);
  const framesWon = playsArr.filter((p) => p && p.won).length;
  const framesPlayed = playsArr.length;
  const folderCount = Object.keys(portfolioData).filter(
    (k) => !k.includes('/') && k !== 'TOMIN INDEX.TXT'
  ).length;
  const foldersOpened = (stats.foldersOpened || []).length;
  const pinsMade = stats.pinsMade || 0;
  const stampsEarned = STAMPS.filter((s) => earnedStamps.has(s.id)).length;

  host.innerHTML = `
    <div class="insights">
      ${renderActivityCard(cal)}
      ${renderCalendarCard(cal)}
      ${renderStatsCard({ framesPlayed, framesWon, pinsMade, foldersOpened, folderCount, stampsEarned })}
      ${renderBestsCard()}
    </div>
  `;
}

function renderActivityCard(cal) {
  const thisMonth = thisMonthPerfect(cal);
  const active = activeDaysCount(cal);
  return `
    <div class="insights-row">
      <div class="insights-card insights-stat">
        <div class="insights-stat-label">This month</div>
        <div class="insights-stat-value">${thisMonth}</div>
        <div class="insights-stat-sub">perfect ${thisMonth === 1 ? 'day' : 'days'}</div>
      </div>
      <div class="insights-card insights-stat">
        <div class="insights-stat-label">Last 35 days</div>
        <div class="insights-stat-value">${active}</div>
        <div class="insights-stat-sub">${active === 1 ? 'day' : 'days'} with progress</div>
      </div>
    </div>
  `;
}

function renderCalendarCard(cal) {
  // Render as a 7-wide grid with weekday header. Pad the start with empty
  // cells so the leftmost column is Mon (matching most calendar reads).
  const first = cal[0];
  const [fy, fm, fd] = first.date.split('-').map(Number);
  const firstWeekday = new Date(Date.UTC(fy, fm - 1, fd)).getUTCDay(); // 0=Sun
  // We want Mon..Sun layout. Offset = days from Mon.
  const monOffset = (firstWeekday + 6) % 7;
  const pad = Array.from({ length: monOffset }, () => null);
  const cells = [...pad, ...cal];

  return `
    <div class="insights-card insights-cal">
      <div class="insights-card-head">
        <div class="insights-card-eyebrow">Activity</div>
        <div class="insights-cal-legend">
          <span><span class="insights-cal-dot is-grey"></span>Played</span>
          <span><span class="insights-cal-dot is-green"></span>Perfect</span>
        </div>
      </div>
      <div class="insights-cal-grid">
        ${['M','T','W','T','F','S','S'].map((w) => `<div class="insights-cal-weekday">${w}</div>`).join('')}
        ${cells.map(cellHtml).join('')}
      </div>
    </div>
  `;
}

function cellHtml(d) {
  if (!d) return `<div class="insights-cal-cell is-empty"></div>`;
  const cls = d.perfect ? 'is-perfect' : (d.anyClosed ? 'is-some' : '');
  const day = d.date.slice(8);
  const title = `${d.date} · ${d.closedCount}/3 rings${d.perfect ? ' · perfect' : ''}`;
  return `
    <div class="insights-cal-cell ${cls}" title="${title}">
      <div class="insights-cal-day">${day}</div>
      ${d.anyClosed ? `<div class="insights-cal-progress" style="--p:${(d.closedCount / 3) * 100}%"></div>` : ''}
    </div>
  `;
}

function renderStatsCard({ framesPlayed, framesWon, pinsMade, foldersOpened, folderCount, stampsEarned }) {
  const rows = [
    { label: 'Daily Frame', value: `${framesWon} won / ${framesPlayed} played` },
    { label: 'Folders explored', value: `${foldersOpened} / ${folderCount}` },
    { label: 'Pins contributed', value: String(pinsMade) },
    { label: 'Stamps earned', value: `${stampsEarned} / ${STAMPS.length}` },
  ];
  return `
    <div class="insights-card">
      <div class="insights-card-eyebrow">Stats</div>
      <div class="insights-table">
        ${rows.map((r) => `
          <div class="insights-table-row">
            <div class="insights-table-label">${r.label}</div>
            <div class="insights-table-value">${r.value}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderBestsCard() {
  return `
    <div class="insights-card">
      <div class="insights-card-eyebrow">Personal Bests</div>
      <div class="insights-table">
        ${GAME_BESTS.map((g) => {
          const v = readBest(g.key);
          const display = v ? `${v} ${g.suffix}` : '—';
          return `
            <div class="insights-table-row">
              <div class="insights-table-label">${g.label}</div>
              <div class="insights-table-value">${display}</div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}
