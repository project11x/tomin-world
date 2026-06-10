// ─────────────────────────────────────────────────────────────────────
// iOS Journal — mobile shell
//
// Mirrors src/desktop/journal-app.js for the iOS shell. Opens the
// #ios-journal-app overlay with the same scale-up animation pattern as
// the other iOS apps (View Transitions API where available, instant
// fallback elsewhere).
//
// Daily Frame data is fetched once per session and cached — same
// endpoint as the desktop card. Tapping the card hands off to the
// standalone /daily-frame page, which already renders mobile-first.
//
// Sections (Board, Play, Passport, Insights) open as sub-screens that
// slide in from the right. The Board sub-screen renders the same data
// as the desktop Board view; the pin-creation flow is shared with the
// desktop module (centred modal, works on mobile widths too).
// ─────────────────────────────────────────────────────────────────────

import { openPinCreator, getVisitorId } from '../desktop/journal-board.js';
import { portfolioData } from '../../data.js';
import {
  RING_DEFS,
  RING_CHANGE_EVENT,
  todayRingIds,
  isClosed as isRingClosed,
  isWon as isRingWon,
  syncFromExternal as syncRings,
} from '../desktop/journal-rings.js';
import { renderVoteCard } from '../desktop/journal-vote.js';
import { renderPlay } from '../desktop/games/play-tab.js';
import { renderPassport } from '../desktop/journal-passport.js';
import { renderInsights } from '../desktop/journal-insights.js';
import { paintIosHeroes } from '../desktop/journal-hero-cards.js';

(function iosJournalSetup() {
  const app = document.getElementById('ios-journal-app');
  if (!app) return; // nothing to wire — fail silent on non-mobile builds

  let dailyFramePuzzle = null;
  let lastIconEl = null;

  // ── view-transition helpers (copied from src/ios/index.js so this
  //    module stays standalone — both walk the same DOM markers). ───
  function performTransition(appEl, iconEl, isOpen) {
    const screen = document.getElementById('ios-screen');
    // __edgeSwipeClosing: an interactive edge-swipe already slid the overlay
    // off-screen — skip the morph and take the instant-hide path.
    const supportsVT = typeof document.startViewTransition === 'function'
      && !window.__edgeSwipeClosing;
    const clearMarkers = () => {
      document.querySelectorAll('.app-morphing').forEach((el) =>
        el.classList.remove('app-morphing')
      );
    };

    if (isOpen) {
      lastIconEl = iconEl;
      if (supportsVT && iconEl) {
        clearMarkers();
        iconEl.classList.add('app-morphing');
        document.startViewTransition(() => {
          iconEl.classList.remove('app-morphing');
          appEl.classList.add('app-morphing');
          appEl.style.display = 'flex';
          appEl.style.opacity = '1';
          appEl.style.transform = '';
          appEl.style.borderRadius = '0px';
          screen?.classList.add('ios-screen-blurred');
        });
      } else {
        appEl.style.display = 'flex';
        appEl.style.opacity = '1';
        appEl.style.transform = '';
        appEl.style.borderRadius = '0px';
        screen?.classList.add('ios-screen-blurred');
      }
    } else {
      const iconForReturn = lastIconEl;
      if (supportsVT) {
        clearMarkers();
        appEl.classList.add('app-morphing');
        const tx = document.startViewTransition(() => {
          appEl.classList.remove('app-morphing');
          if (iconForReturn) iconForReturn.classList.add('app-morphing');
          appEl.style.display = 'none';
          screen?.classList.remove('ios-screen-blurred');
        });
        tx.finished.finally(() => {
          if (iconForReturn) iconForReturn.classList.remove('app-morphing');
        });
      } else {
        appEl.style.display = 'none';
        screen?.classList.remove('ios-screen-blurred');
      }
    }
  }

  // Apple-style status bar tint flip when entering / leaving an app.
  function setThemeColor(color) {
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => (m.content = color));
  }
  function tintForApp() {
    setThemeColor(window._iosDark ? '#1c1c1e' : '#f2f2f7');
  }
  function tintForScreen() {
    setThemeColor(window._iosDark ? '#000000' : '#ffffff');
  }

  // ── Daily Frame: fetch + paint ─────────────────────────────────
  async function loadDailyFrame() {
    if (dailyFramePuzzle) return dailyFramePuzzle;
    try {
      const res = await fetch('/api/daily-frame');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      dailyFramePuzzle = await res.json();
    } catch (e) {
      dailyFramePuzzle = null;
    }
    return dailyFramePuzzle;
  }

  function formatHumanDate(yyyymmdd) {
    if (!yyyymmdd) return '';
    const [y, m, d] = yyyymmdd.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      month: 'short',
      day: 'numeric',
    }).format(dt);
  }

  async function paintDailyFrameCard() {
    const titleEl = app.querySelector('[data-ios-df-title]');
    const subEl = app.querySelector('[data-ios-df-sub]');
    const thumbEl = app.querySelector('[data-ios-df-thumb]');
    const heroBig = app.querySelector('[data-ios-jhero="today"] .ios-journal-hero-big');

    const data = await loadDailyFrame();
    if (!data) {
      if (subEl) subEl.textContent = "Couldn't reach today's puzzle";
      return;
    }

    if (titleEl) titleEl.textContent = `#${data.day} · ${formatHumanDate(data.date)}`;
    if (subEl) subEl.textContent = 'Tap to play';
    if (heroBig) heroBig.textContent = `#${data.day}`;
    if (thumbEl) {
      // Blurred preview — keeps the puzzle un-spoiled. Uses a single
      // strong CSS blur on the natural-sized image instead of scale(3),
      // which lets the browser decode at the displayed resolution.
      // Saves a lot of memory on iOS Safari (was contributing to memory-
      // pressure reloads on desktop with the same code path).
      thumbEl.innerHTML = `
        <div style="width:100%; height:100%; overflow:hidden;">
          <img src="${data.thumb}"
               decoding="async" loading="lazy"
               style="width:100%; height:100%; object-fit:cover;
                      filter:blur(14px) brightness(0.92); transform:scale(1.08);"
               alt="" draggable="false" />
        </div>
      `;
    }
  }

  // ── card / section wiring ─────────────────────────────────────
  app.querySelector('[data-ios-jcard="daily-frame"]')?.addEventListener('click', () => {
    // Standalone game page — already mobile-first, has its own back link.
    location.href = '/daily-frame';
  });

  app.querySelectorAll('[data-ios-jsection]').forEach((row) => {
    row.addEventListener('click', () => {
      const name = row.dataset.iosJsection;
      if (name === 'board')    return openBoardSubscreen();
      if (name === 'play')     return openPlaySubscreen();
      if (name === 'passport') return openPassportSubscreen();
      if (name === 'insights') return openInsightsSubscreen();
      // Fallback — shake to acknowledge tap.
      row.animate(
        [
          { transform: 'translateX(0)' },
          { transform: 'translateX(-4px)' },
          { transform: 'translateX(4px)' },
          { transform: 'translateX(0)' },
        ],
        { duration: 220, easing: 'ease-out' }
      );
    });
  });

  // ── Play sub-screen ──────────────────────────────────────────
  const playSubscreen = document.getElementById('ios-journal-play');
  const playHost = playSubscreen?.querySelector('[data-ios-jplay-host]');
  let playLoaded = false;
  function openPlaySubscreen() {
    if (!playSubscreen) return;
    playSubscreen.classList.add('is-open');
    if (!playLoaded && playHost) {
      renderPlay(playHost);
      playLoaded = true;
    }
  }
  playSubscreen?.querySelector('[data-ios-journal-play-back]')
    ?.addEventListener('click', () => playSubscreen.classList.remove('is-open'));

  // ── Passport sub-screen ──────────────────────────────────────
  const passportSubscreen = document.getElementById('ios-journal-passport');
  const passportHost = passportSubscreen?.querySelector('[data-ios-jpassport-host]');
  function openPassportSubscreen() {
    if (!passportSubscreen) return;
    passportSubscreen.classList.add('is-open');
    // Always repaint passport on open — earned stamps may have changed.
    if (passportHost) renderPassport(passportHost);
  }
  passportSubscreen?.querySelector('[data-ios-journal-passport-back]')
    ?.addEventListener('click', () => passportSubscreen.classList.remove('is-open'));

  // ── Insights sub-screen ─────────────────────────────────────
  const insightsSubscreen = document.getElementById('ios-journal-insights');
  const insightsHost = insightsSubscreen?.querySelector('[data-ios-jinsights-host]');
  function openInsightsSubscreen() {
    if (!insightsSubscreen) return;
    insightsSubscreen.classList.add('is-open');
    if (insightsHost) renderInsights(insightsHost);
  }
  insightsSubscreen?.querySelector('[data-ios-journal-insights-back]')
    ?.addEventListener('click', () => insightsSubscreen.classList.remove('is-open'));

  // ── Board sub-screen ──────────────────────────────────────────
  const boardSubscreen = document.getElementById('ios-journal-board');
  const boardGrid = boardSubscreen?.querySelector('[data-ios-jboard-grid]');
  let boardLoaded = false;

  function openBoardSubscreen() {
    if (!boardSubscreen) return;
    boardSubscreen.classList.add('is-open');
    if (!boardLoaded) {
      loadAndPaintIosBoard();
      boardLoaded = true;
    }
  }

  function closeBoardSubscreen() {
    if (!boardSubscreen) return;
    boardSubscreen.classList.remove('is-open');
  }

  boardSubscreen?.querySelector('[data-ios-journal-board-back]')
    ?.addEventListener('click', closeBoardSubscreen);
  boardSubscreen?.querySelector('[data-ios-journal-board-pin]')
    ?.addEventListener('click', () => {
      // Pull data back in after a pin is created so the new entry appears
      // without a manual refresh.
      const beforeCount = boardGrid?.querySelectorAll('.ios-journal-pin').length || 0;
      openPinCreator();
      // Poll for a pin count change for ~6s, then stop. Cheap and works
      // without coupling modules via custom events.
      let tries = 0;
      const t = setInterval(() => {
        tries++;
        if (tries > 30) { clearInterval(t); return; }
        if (!document.getElementById('journal-pin-creator')) {
          clearInterval(t);
          loadAndPaintIosBoard();
        }
      }, 200);
    });

  async function loadAndPaintIosBoard() {
    if (!boardGrid) return;
    boardGrid.innerHTML = '<div class="ios-journal-board-loading">Loading…</div>';
    try {
      const res = await fetch('/api/pinboard');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      paintIosBoard(data.pins || []);
    } catch (e) {
      boardGrid.innerHTML = '<div class="ios-journal-board-empty">Couldn\'t load the board.</div>';
    }
  }

  function paintIosBoard(pins) {
    if (!boardGrid) return;
    if (!pins.length) {
      boardGrid.innerHTML = `
        <div class="ios-journal-board-empty">
          <div style="font-size:40px; opacity:0.55;">📌</div>
          <div style="margin-top:6px;">Nothing pinned yet.</div>
          <div style="opacity:0.65; font-size:13px;">Tap + Pin to start the wall.</div>
        </div>
      `;
      return;
    }
    const myId = getVisitorId();
    boardGrid.innerHTML = pins.map((pin) => renderIosPin(pin, pin.visitorId === myId)).join('');
  }

  function renderIosPin(pin, isMine) {
    const rotation = ((Number(pin.id) * 37) % 11) - 5;
    const src = resolvePinSrc(pin.src);
    const sticker = pin.sticker
      ? `<div class="ios-journal-pin-sticker">${pin.sticker}</div>`
      : '';
    const city = pin.city
      ? `<div class="ios-journal-pin-city">from ${escapeHtml(pin.city)}</div>`
      : '';
    const mine = isMine ? `<div class="ios-journal-pin-mine">★</div>` : '';
    return `
      <div class="ios-journal-pin" style="transform: rotate(${rotation}deg);">
        <div class="ios-journal-pin-polaroid">
          <img src="${escapeAttr(src)}" alt="" loading="lazy" draggable="false" />
        </div>
        ${city}
        ${sticker}
        ${mine}
      </div>
    `;
  }

  function resolvePinSrc(rawSrc) {
    if (!rawSrc) return '';
    if (/^https?:\/\//.test(rawSrc)) return rawSrc;
    for (const folder of Object.keys(portfolioData)) {
      const items = portfolioData[folder];
      if (!Array.isArray(items)) continue;
      const hit = items.find((it) => it.src === rawSrc || it.src?.endsWith(rawSrc));
      if (hit) return hit.src;
    }
    return rawSrc.startsWith('/') ? rawSrc : '/' + rawSrc;
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

  // ── Today rings (3 list rows reflecting today's picks + state) ──

  const ringsHost = app.querySelector('[data-ios-jrings]');

  function paintIosRings() {
    if (!ringsHost) return;
    const ids = todayRingIds();
    // Compact 3-ring layout with an inline "Today" eyebrow at the top —
    // matches the Vote / Daily Frame card pattern where the section
    // label belongs INSIDE the card, not floating above it.
    ringsHost.innerHTML = `
      <div class="ios-journal-card-eyebrow">Today</div>
      <div class="ios-journal-rings-row">
        ${ids.map((id) => {
          const def = RING_DEFS[id] || { icon: '◯', label: id, desc: '' };
          const closed = isRingClosed(id);
          const won = isRingWon(id);
          const cls = closed
            ? (won ? 'is-closed is-won' : 'is-closed')
            : '';
          const sub = closed
            ? (won ? 'Done' : 'Played')
            : (def.desc || '');
          return `
            <div class="ios-journal-ring" data-ios-jring="${id}">
              <div class="ios-journal-ring-circle ${cls}">${def.icon}</div>
              <div class="ios-journal-ring-label">${def.label}</div>
              <div class="ios-journal-ring-sublabel">${sub}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  // Repaint when any ring state changes.
  window.addEventListener(RING_CHANGE_EVENT, paintIosRings);
  paintIosRings(); // initial paint at module load

  // Weekly Vote card — iOS variant. Painted into the placeholder div
  // every time the app opens so live counts are fresh.
  const voteHost = app.querySelector('[data-ios-jvote]');

  // ── public open / close ───────────────────────────────────────
  window.iosOpenJournal = function (event) {
    const iconEl = event ? event.currentTarget : null;
    tintForApp();
    app.classList.remove('closing');
    performTransition(app, iconEl, true);
    // Sync ring state in case Daily Frame was played / a pin was made in
    // another tab — then repaint.
    syncRings();
    paintIosRings();
    paintIosHeroes();
    // Fire-and-forget — fills in once the API responds.
    paintDailyFrameCard();
    if (voteHost) renderVoteCard(voteHost, { variant: 'ios' });
  };

  window.iosCloseJournal = function () {
    tintForScreen();
    app.classList.add('closing');
    performTransition(app, null, false);
    setTimeout(() => {
      app.style.display = 'none';
      app.classList.remove('closing');
    }, 300);
  };
})();
