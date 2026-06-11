// Paint the two sidebar / iOS hero cards based on the visitor's actual
// progress. The CSS reads --hero-progress to mix the burgundy accent
// over the grey base, so this module just computes the numbers and
// stamps them onto the DOM (plus the `is-perfect` flag for Today).

import { STAMPS, getEarnedSet, STAMPS_CHANGED_EVENT } from './journal-stamps.js';
import {
  RING_CHANGE_EVENT,
  todayRingIds,
  isClosed as isRingClosed,
  isWon as isRingWon,
} from './journal-rings.js';

function computeInsights() {
  const earned = getEarnedSet();
  const total = STAMPS.length || 1;
  const got = STAMPS.filter((s) => earned.has(s.id)).length;
  return { got, total, progress: got / total };
}

function computeToday() {
  const ids = todayRingIds();
  const closed = ids.filter((id) => isRingClosed(id)).length;
  const solveWon = ids.includes('solve') && isRingWon('solve');
  const perfect = closed >= 3 && solveWon;
  return { closed, total: ids.length, perfect, progress: closed / Math.max(ids.length, 1) };
}

function paintHero(host, selectorBase) {
  if (!host) return;

  const insightsHero = host.querySelector(`[${selectorBase}="insights"]`);
  if (insightsHero) {
    const { got, total, progress } = computeInsights();
    insightsHero.style.setProperty('--hero-progress', String(progress));
    const big = insightsHero.querySelector(
      '[data-jhero-big], [data-ios-jhero-big-insights]'
    );
    if (big) big.textContent = `${got}`;
    const sub = insightsHero.querySelector(
      '.journal-hero-sub, .ios-journal-hero-sub'
    );
    if (sub) sub.textContent = `of ${total} stamps`;
  }

  const todayHero = host.querySelector(`[${selectorBase}="today"]`);
  if (todayHero) {
    const { perfect, progress } = computeToday();
    todayHero.classList.toggle('is-perfect', perfect);
    todayHero.style.setProperty('--hero-progress', String(progress));
  }
}

// Public — desktop sidebar
export function paintDesktopHeroes(win) {
  paintHero(win, 'data-jhero');
}

// Public — iOS Journal scroll page
export function paintIosHeroes() {
  const app = document.getElementById('ios-journal-app');
  paintHero(app, 'data-ios-jhero');
}

// Auto-repaint on state changes. Listeners are global so a single set
// keeps both UIs in sync; the renderers above are cheap.
function repaintAll() {
  document.querySelectorAll('.journal-window').forEach((win) =>
    paintHero(win, 'data-jhero')
  );
  paintIosHeroes();
}

window.addEventListener(RING_CHANGE_EVENT, repaintAll);
window.addEventListener(STAMPS_CHANGED_EVENT, repaintAll);
