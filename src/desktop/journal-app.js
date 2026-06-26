// ─────────────────────────────────────────────────────────────────────
// Journal — desktop app
//
// The Journal is the single home for the engagement layer (rings,
// games, board, passport, insights). It owns one floating macOS-style
// window cloned from #journal-window-template.
//
// Section layout:
//   • Today      — rings + Daily Frame card + weekly Vote card
//   • Play       — all mini-games (placeholder for now)
//   • Board      — constrained pinboard (placeholder)
//   • Passport   — stamp collection (placeholder)
//   • Insights   — activity calendar + stats (placeholder)
//
// Behaviour mirrors finder windows (windows.js): shared z-index
// management, the same app-window.closing close animation, and a
// hide-instead-of-remove cycle so reopening jumps straight back to the
// last section without rebuilding the DOM.
// ─────────────────────────────────────────────────────────────────────

import { bringToFront, createWindow, animateWindowTo } from './windows.js';
import { renderBoard as renderBoardSection } from './journal-board.js';
import { openDailyFrameModal } from './games/daily-frame.js';
import { renderPlay } from './games/play-tab.js';
import { renderPassport, renderPassportPreview } from './journal-passport.js';
import { renderVoteCard } from './journal-vote.js';
import { renderInsights } from './journal-insights.js';
import { paintDesktopHeroes } from './journal-hero-cards.js';
// Side-effect imports — boot stamps detection + passport-code sync listeners.
import './journal-stamps.js';
import './journal-passport-code.js';
import {
  RING_DEFS,
  RING_CHANGE_EVENT,
  todayRingIds,
  isClosed as isRingClosed,
  isWon as isRingWon,
  syncFromExternal as syncRings,
} from './journal-rings.js';

const STATE_KEY = 'journal:state';

const SECTIONS = ['today', 'play', 'board', 'passport', 'insights'];

const SECTION_TITLES = {
  today: 'Today',
  play: 'Play',
  board: 'Board',
  passport: 'Passport',
  insights: 'Insights',
};

let currentWindow = null;
let dailyFramePuzzle = null; // cached API response for the day

// ── persisted state ────────────────────────────────────────────────

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STATE_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveState(patch) {
  const next = { ...loadState(), ...patch };
  localStorage.setItem(STATE_KEY, JSON.stringify(next));
}

function selectedSection() {
  const s = loadState().section;
  return SECTIONS.includes(s) ? s : 'today';
}

// ── window create / position / drag / close ───────────────────────

function positionWindow(win) {
  const isMobile = window.innerWidth <= 768;
  if (isMobile) {
    win.style.width = '100%';
    win.style.height = '100%';
    win.style.left = '0';
    win.style.top = '0';
    win.style.borderRadius = '0';
    return;
  }
  // Centered with a slight downward bias so dock stays visible.
  win.style.left = `calc(50% - 430px)`;
  win.style.top = `calc(50% - 280px)`;
  win.style.transform = 'none';
}

function attachDrag(win) {
  if (window.innerWidth <= 768) return;
  win.querySelectorAll('.draggable-handle').forEach((handle) => {
    handle.addEventListener('mousedown', (e) => {
      // Don't drag when clicking buttons / interactive sidebar items.
      if (e.target.closest('.btn-close-window')) return;
      if (e.target.closest('.btn-minimize-window')) return;
      if (e.target.closest('.btn-fullscreen-window')) return;
      if (e.target.closest('.journal-item')) return;
      if (e.target.closest('.journal-hero')) return;
      if (e.target.closest('button')) return;

      bringToFront(win);
      win.classList.add('dragging-window');
      const rect = win.getBoundingClientRect();
      const offX = e.clientX - rect.left;
      const offY = e.clientY - rect.top;
      const move = (ev) => {
        win.style.left = `${ev.clientX - offX}px`;
        win.style.top = `${ev.clientY - offY}px`;
      };
      const up = () => {
        win.classList.remove('dragging-window');
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    });
  });
}

function attachWindowChrome(win) {
  // Animated close — matches finder windows. Mark with `closing`, wait for
  // the shrink-fade animation, then hide (instead of remove) so the next
  // openJournalApp() can pop it back instantly without re-fetching data.
  const animateClose = () => {
    if (win.classList.contains('closing')) return;
    win.classList.add('closing');
    const done = () => {
      win.style.display = 'none';
      win.classList.remove('closing');
      win.dataset.hiddenClosed = '1';
    };
    win.addEventListener('animationend', done, { once: true });
    // Safety net in case animationend doesn't fire (e.g. reduced motion).
    setTimeout(done, 260);
  };
  win.querySelector('.btn-close-window')?.addEventListener('click', animateClose);
  win.querySelector('.btn-minimize-window')?.addEventListener('click', animateClose);

  // Fullscreen toggle — shares the finder's WAAPI window animation so the grow
  // is deterministic (the old fs-animating CSS path was removed).
  win.querySelector('.btn-fullscreen-window')?.addEventListener('click', () => {
    const isMax = win.dataset.isMaximized === 'true';
    const rootW = window.innerWidth, rootH = window.innerHeight;
    const remPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    let target;
    if (isMax) {
      const w = 860, h = 600;
      target = { left: (rootW - w) / 2, top: (rootH - h) / 2, width: w, height: h };
      win.dataset.isMaximized = 'false';
    } else {
      target = { left: 0, top: 2 * remPx, width: rootW, height: rootH - 2 * remPx };
      win.dataset.isMaximized = 'true';
    }
    animateWindowTo(win, target);
  });
}

// ── sidebar wiring ────────────────────────────────────────────────

function attachSidebar(win) {
  // Section items
  win.querySelectorAll('[data-jsection]').forEach((item) => {
    item.addEventListener('click', () => {
      const name = item.dataset.jsection;
      if (!SECTIONS.includes(name)) return;
      saveState({ section: name });
      activateSection(win, name);
    });
  });

  // Hero cards — both jump to Today and (for the Today hero) try to open
  // the Daily Frame straight away.
  win.querySelectorAll('[data-jhero]').forEach((hero) => {
    hero.addEventListener('click', () => {
      saveState({ section: 'today' });
      activateSection(win, 'today');
      if (hero.dataset.jhero === 'today') {
        openDailyFrameModal();
      }
    });
  });
}

function activateSection(win, name) {
  // Highlight active sidebar item
  win.querySelectorAll('[data-jsection]').forEach((item) => {
    item.classList.toggle('is-active', item.dataset.jsection === name);
  });
  // Update title
  const title = win.querySelector('[data-jmain-title]');
  if (title) title.textContent = SECTION_TITLES[name] || name;
  // Render
  const content = win.querySelector('[data-jmain-content]');
  if (!content) return;
  content.innerHTML = '';
  switch (name) {
    case 'today':    renderToday(content); break;
    case 'play':     renderPlay(content); break;
    case 'board':    renderBoardSection(content); break;
    case 'passport': renderPassport(content); break;
    case 'insights': renderInsights(content); break;
  }
}

// ── section renderers ─────────────────────────────────────────────

function renderEmpty(host, icon, title, sub) {
  host.innerHTML = `
    <div class="journal-empty">
      <div class="journal-empty-icon">${icon}</div>
      <div class="journal-empty-title">${title}</div>
      <div class="journal-empty-sub">${sub}</div>
    </div>
  `;
}

function renderToday(host) {
  // Pull today's actual rings (Solve + 2 from the rotating pool) from the
  // rings module so the picks stay in sync with the sidebar Today list
  // and re-render on state change.
  const ringsHtml = `
    <div class="journal-card">
      <div class="journal-rings-row" data-jrings-main>
        ${renderRingsMainHtml()}
      </div>
    </div>
  `;

  // Daily Frame card — lazy-fill once API responds
  const dailyFrameHtml = `
    <div class="journal-card is-clickable" data-jcard="daily-frame">
      <div class="journal-card-row">
        <div class="journal-card-thumb" data-df-thumb>
          <div style="width:100%; height:100%; background:rgba(0,0,0,0.08);"></div>
        </div>
        <div style="flex:1; min-width:0;">
          <div class="journal-card-eyebrow">Daily Frame</div>
          <h3 class="journal-card-title" data-df-title>Loading today's puzzle…</h3>
          <p class="journal-card-sub" data-df-sub>Tap to play</p>
        </div>
        <div style="font-size:18px; opacity:0.4;">›</div>
      </div>
    </div>
  `;

  // Vote card — populated async by renderVoteCard after host renders.
  const voteHtml = `<div class="journal-card journal-card--vote" data-jvote></div>`;

  // Passport preview at the bottom of Today — quick glance at progress,
  // tap to jump into the Passport section.
  const passportHtml = `<div data-jpassport-preview></div>`;

  host.innerHTML = ringsHtml + dailyFrameHtml + voteHtml + passportHtml;

  // Wire Daily Frame click + fill content async
  const card = host.querySelector('[data-jcard="daily-frame"]');
  if (card) card.addEventListener('click', openDailyFrameModal);
  fillDailyFrameCard(host);

  // Weekly Vote — fetch + paint asynchronously into the dedicated host.
  const voteHost = host.querySelector('[data-jvote]');
  if (voteHost) renderVoteCard(voteHost, { variant: 'desktop' });

  // Passport preview wires its own change listener internally.
  const passportPrevHost = host.querySelector('[data-jpassport-preview]');
  if (passportPrevHost) {
    renderPassportPreview(passportPrevHost, () => {
      saveState({ section: 'passport' });
      if (currentWindow) activateSection(currentWindow, 'passport');
    });
  }

  // Repaint the rings row when any ring closes (or any other state
  // change) — avoids rebuilding the whole Today section which would
  // flash the Daily Frame thumbnail.
  const onRingsChange = () => {
    const row = host.querySelector('[data-jrings-main]');
    if (row) row.innerHTML = renderRingsMainHtml();
    // Sidebar mirror — re-render its rings list too.
    if (currentWindow) renderSidebarRings(currentWindow);
  };
  window.removeEventListener(RING_CHANGE_EVENT, host.__ringsHandler);
  host.__ringsHandler = onRingsChange;
  window.addEventListener(RING_CHANGE_EVENT, onRingsChange);
}

function renderRingsMainHtml() {
  const ids = todayRingIds();
  return ids
    .map((id) => {
      const def = RING_DEFS[id] || { icon: '◯', label: id, desc: '' };
      const closed = isRingClosed(id);
      const won = isRingWon(id);
      // For Solve: closed + !won = "played but didn't solve" → grey ring.
      // For everything else, closed implies won (single outcome).
      const cls = closed
        ? (won ? 'is-closed is-won' : 'is-closed')
        : '';
      // Closed → confirmation. Open → tell the visitor what to do.
      const sub = closed
        ? (won ? 'Done' : 'Played')
        : (def.desc || '0 / 1');
      // Tooltip mirrors the sub-text so it stays truthful when closed.
      const tip = closed
        ? (won ? `${def.label} — done` : `${def.label} — attempted`)
        : (def.desc || def.label);
      return `
        <div class="journal-ring" title="${escapeAttr(tip)}">
          <div class="journal-ring-circle ${cls}">${def.icon}</div>
          <div class="journal-ring-label">${def.label}</div>
          <div class="journal-ring-sublabel">${sub}</div>
        </div>
      `;
    })
    .join('');
}

function escapeAttr(s) {
  return String(s).replace(/[&"']/g, (c) => ({
    '&': '&amp;', '"': '&quot;', "'": '&#39;'
  }[c] || c));
}

async function fillDailyFrameCard(host) {
  try {
    if (!dailyFramePuzzle) {
      const res = await fetch('/api/daily-frame');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      dailyFramePuzzle = await res.json();
    }
  } catch (e) {
    const sub = host.querySelector('[data-df-sub]');
    if (sub) sub.textContent = "Couldn't reach today's puzzle";
    return;
  }

  const title = host.querySelector('[data-df-title]');
  const sub = host.querySelector('[data-df-sub]');
  const thumb = host.querySelector('[data-df-thumb]');
  if (title) title.textContent = `#${dailyFramePuzzle.day} · ${formatHumanDate(dailyFramePuzzle.date)}`;
  if (sub) sub.textContent = 'Tap to play';
  if (thumb) {
    // Show the thumbnail as a no-spoil teaser. The earlier "scale(3) +
    // blur(6px)" combo was extremely expensive in Safari: it forces a
    // 9× pixel texture allocation plus a Gaussian-blur composite layer
    // and was the dominant memory contributor when Safari fired the
    // "reloaded because it was using significant memory" warning even
    // with only the Journal app open. A CSS `background-image` with
    // strong blur via a sibling layer is cheaper because the browser
    // can downscale before blurring; we use a static blur on a small
    // visible <img> and let the browser pick a low-res decode.
    thumb.innerHTML = `
      <div style="width:100%; height:100%; overflow:hidden; position:relative;">
        <img src="${dailyFramePuzzle.thumb}"
             decoding="async" loading="lazy"
             style="width:100%; height:100%; object-fit:cover; filter:blur(14px) brightness(0.92); transform:scale(1.08);"
             alt="" draggable="false" />
      </div>
    `;
  }

  // Also paint the Today hero on the sidebar with the day number.
  const todayHero = currentWindow?.querySelector('[data-jhero="today"] [data-jhero-big]');
  if (todayHero) todayHero.textContent = `#${dailyFramePuzzle.day}`;
}

function formatHumanDate(yyyymmdd) {
  const [y, m, d] = yyyymmdd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC', month: 'short', day: 'numeric',
  }).format(dt);
}

// ── Today rings list in sidebar ──────────────────────────────────

function renderSidebarRings(win) {
  const host = win.querySelector('[data-jrings]');
  if (!host) return;
  const ids = todayRingIds();
  host.innerHTML = ids
    .map((id) => {
      const def = RING_DEFS[id] || { icon: '◯', label: id };
      const closed = isRingClosed(id);
      const won = isRingWon(id);
      const cls = closed
        ? (won ? 'is-closed is-won' : 'is-closed')
        : '';
      return `
        <div class="journal-item" data-jring="${id}">
          <span class="journal-ring-dot ${cls}"></span>
          <span class="journal-item-label">${def.icon} ${def.label}</span>
        </div>
      `;
    })
    .join('');
}

// ── Daily Frame modal ─────────────────────────────────────────────

// openDailyFrameModal lives in src/desktop/games/daily-frame.js so both
// the Today card and the Play tab can open it without a circular import.

// ── entry point ───────────────────────────────────────────────────

function openJournalApp() {
  // Mobile gets the iOS Journal screen, not the desktop window.
  // iosOpenJournal is defined in src/ios/journal-app.js and runs only when
  // the iOS shell is mounted; falls through harmlessly on Android etc.
  if (window.innerWidth <= 768 && typeof window.iosOpenJournal === 'function') {
    window.iosOpenJournal();
    return;
  }

  // Revive a previously-closed window so reopening is instant and we don't
  // have to re-fetch the Daily Frame or rebuild the section the user left on.
  if (currentWindow && currentWindow.dataset.hiddenClosed === '1') {
    delete currentWindow.dataset.hiddenClosed;
    currentWindow.classList.remove('closing');
    currentWindow.style.display = 'flex';
    bringToFront(currentWindow);
    return;
  }

  // Already open and visible — just focus it.
  if (currentWindow && document.body.contains(currentWindow)) {
    bringToFront(currentWindow);
    return;
  }

  const template = /** @type {HTMLTemplateElement|null} */ (
    document.getElementById('journal-window-template')
  );
  if (!template) {
    console.error('journal-window-template missing');
    return;
  }

  const clone = template.content.cloneNode(true);
  const win = /** @type {HTMLElement} */ (clone.querySelector('.app-window'));
  if (!win) return;

  win.classList.add('journal-window');
  positionWindow(win);
  attachWindowChrome(win);
  attachDrag(win);
  attachSidebar(win);

  // Focus on click — matches finder behaviour.
  win.addEventListener('mousedown', () => bringToFront(win));

  // Insert into the desktop. Falls back to body if desktop-main isn't here.
  const host = document.getElementById('desktop-main') || document.body;
  host.appendChild(win);
  currentWindow = win;
  bringToFront(win);

  // Initial render — sync ring state from external sources first so the
  // first paint reflects any Daily Frame plays / pins that happened since
  // we last had focus.
  syncRings();
  renderSidebarRings(win);
  paintDesktopHeroes(win);
  activateSection(win, selectedSection());

  // Keep the sidebar Today list in sync when rings change while the app
  // is open. The Today main view installs its own listener in renderToday.
  const onRingsChange = () => renderSidebarRings(win);
  window.removeEventListener(RING_CHANGE_EVENT, win.__ringsHandler);
  win.__ringsHandler = onRingsChange;
  window.addEventListener(RING_CHANGE_EVENT, onRingsChange);
}

window.openJournalApp = openJournalApp;
