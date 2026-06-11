import { EASE_BOUNCE, EASE_OUT } from '../utils/motion.js';
// ── iOS Live Activity: Portfolio Exploration ──────────────────────────────
// Slot-based, visit-order-aware Smart Stack widget.
//
// Animation rules:
//   • Only the NEWLY filled segment animates (0 → 100%). Pre-existing fills
//     stay at 100% instantly — no redundant replay.
//   • If the portfolio card is NOT currently showing when ilaVisit() fires,
//     we render silently (instant) and set pendingAnim=true. When the user
//     swipes to reveal the card, ALL filled segments animate together once.
(function () {
  const SECTIONS = ['home', 'edits', 'magazin', 'bts'];
  const LABELS = { home: 'Home', edits: 'Edits', magazin: 'Magazin', bts: 'BTS' };
  const COLORS = { home: '#e0e0e0', edits: '#7c3aed', magazin: '#dc2626', bts: '#b91c1c' };
  // Solid empty rail — matches the expanded portfolio view's design.
  const SEG_EMPTY = 'rgba(255,255,255,0.08)';

  const visited = ['home'];      // ordered by first-visit; 'home' always first
  let current = 'home';
  let pendingAnim = false;     // true when visits happened off-screen
  let autoAdvanceDone = false; // only ever auto-switch once, after first full exploration
  let autoAdvanceTimer = null;

  // Schedule an auto-advance to the next Smart Stack widget once the route
  // animation has had time to finish + the user has had a few seconds to
  // admire the completed line. If the user has the portfolio expanded when
  // the timer fires, defer the advance until they collapse it.
  let pendingAdvanceOnClose = false;
  function runAdvance() {
    if (autoAdvanceDone) return;
    if (window.iosPortfolioIsOpen && window.iosPortfolioIsOpen()) {
      pendingAdvanceOnClose = true;
      return;
    }
    if (typeof window.sstackGetActiveIdx === 'function'
      && window.sstackGetActiveIdx() === 1
      && visited.length === SECTIONS.length
      && typeof window.sstackNext === 'function') {
      autoAdvanceDone = true;
      window.sstackNext();
    }
  }
  function scheduleAutoAdvance(afterMs) {
    if (autoAdvanceDone) return;
    if (autoAdvanceTimer) clearTimeout(autoAdvanceTimer);
    autoAdvanceTimer = setTimeout(() => {
      autoAdvanceTimer = null;
      runAdvance();
    }, afterMs);
  }
  // Called by closePortfolio() so a deferred advance can fire once the
  // user has collapsed the widget.
  window.ilaResumeAdvance = function () {
    if (!pendingAdvanceOnClose) return;
    pendingAdvanceOnClose = false;
    setTimeout(runAdvance, 600);
  };

  function displayOrder() {
    const unvisited = SECTIONS.filter(s => !visited.includes(s));
    return [...visited, ...unvisited];
  }

  // Returns boolean[3] — which of the 3 segments are currently filled.
  function getFilledState() {
    const o = displayOrder();
    return [0, 1, 2].map(i => visited.includes(o[i]) && visited.includes(o[i + 1]));
  }

  function textColorForBg(section) {
    return section === 'home' ? '#1a1a1a' : '#ffffff';
  }

  // Track whether this is the very first render pass — we don't want the
  // blur-swap to play on initial paint, only when a value actually changes
  // later (e.g. after a visit).
  let firstRender = true;

  // Restart the blur→sharp swap animation on the element. Used whenever the
  // text (or badge color) actually changes — skipped when nothing changed so
  // we don't re-animate on every render pass.
  function playBlurSwap(el) {
    if (!el || firstRender) return;
    el.classList.remove('ila-blur-swap');
    // Force a reflow so removing + re-adding the class restarts the animation.
    void el.offsetWidth;
    el.classList.add('ila-blur-swap');
  }

  function renderBadge() {
    const badge = document.getElementById('ila-badge');
    if (!badge) return;
    const txt = LABELS[current].toUpperCase();
    const bg = COLORS[current];
    const col = textColorForBg(current);
    const changed = badge.textContent !== txt
      || badge.dataset.bg !== bg
      || badge.dataset.col !== col;
    if (!changed) return;
    badge.textContent = txt;
    badge.style.background = bg;
    badge.style.color = col;
    badge.dataset.bg = bg;
    badge.dataset.col = col;
    playBlurSwap(badge);
  }

  function renderTitle() {
    const title = document.getElementById('ila-title');
    const sub = document.getElementById('ila-sub');
    const order = displayOrder();
    const nextUnvisited = order.find(s => !visited.includes(s));
    if (title) {
      const txt = nextUnvisited
        ? 'Up next: ' + LABELS[nextUnvisited]
        : 'All sections explored';
      if (title.textContent !== txt) {
        title.textContent = txt;
        playBlurSwap(title);
      }
    }
    if (sub) {
      const txt = visited.length + ' of ' + SECTIONS.length + ' explored';
      if (sub.textContent !== txt) {
        sub.textContent = txt;
        playBlurSwap(sub);
      }
    }
  }

  function renderSlots() {
    const order = displayOrder();
    order.forEach((section, i) => {
      const slotEl = document.querySelector('.ila-slot[data-slot="' + (i + 1) + '"]');
      if (!slotEl) return;
      slotEl.innerHTML = '';
      const v = visited.includes(section), c = section === current;
      const col = COLORS[section];
      const dot = document.createElement('div');
      dot.style.borderRadius = '50%';
      dot.style.transition = 'all 0.35s ease';
      if (c) {
        dot.style.width = dot.style.height = '16px';
        dot.style.background = col;
        dot.style.boxShadow = '0 0 0 3px ' + col + '40, 0 0 10px ' + col + '60';
      } else if (v) {
        dot.style.width = dot.style.height = '13px';
        dot.style.background = col;
        dot.style.boxShadow = 'none';
      } else {
        dot.style.width = dot.style.height = '11px';
        dot.style.background = 'transparent';
        dot.style.boxShadow = '0 0 0 2px rgba(255,255,255,0.22)';
      }
      slotEl.appendChild(dot);
      const label = document.createElement('span');
      label.textContent = LABELS[section];
      label.style.cssText =
        'position:absolute; top:22px; left:50%; transform:translateX(-50%);' +
        'white-space:nowrap; font-size:9px; font-weight:600; letter-spacing:0.06em;' +
        'text-transform:uppercase; color:rgba(255,255,255,' +
        (c ? '0.85' : v ? '0.6' : '0.4') + ');';
      slotEl.appendChild(label);
    });
  }

  // ── 4/4 finale ────────────────────────────────────────────────────
  // The completion moment used to be a silent text swap. Once per
  // visitor, the widget now celebrates: the four slot dots pulse in
  // visit order, a shine sweeps across the card, and the title cheers.
  const FINALE_KEY = 'ila:finale-done';
  function finaleDone() {
    try { return localStorage.getItem(FINALE_KEY) === '1'; } catch { return false; }
  }
  function markFinaleDone() {
    try { localStorage.setItem(FINALE_KEY, '1'); } catch {}
  }

  function playFinale() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const title = document.getElementById('ila-title');
    if (title) {
      title.textContent = 'All sections explored 🎉';
      playBlurSwap(title);
    }

    // Slot dots pulse one after another, tracing the route a last time.
    document.querySelectorAll('.ila-slot').forEach((slot, i) => {
      const dot = slot.querySelector('div');
      if (!dot) return;
      setTimeout(() => {
        dot.animate(
          [
            { transform: 'scale(1)' },
            { transform: 'scale(1.55)' },
            { transform: 'scale(1)' },
          ],
          { duration: 420, easing: EASE_BOUNCE }
        );
      }, i * 150);
    });

    // One-time shine sweep across the widget card.
    const card = title ? title.closest('.sstack-card') || title.parentElement?.parentElement : null;
    if (card) {
      const shine = document.createElement('div');
      shine.style.cssText =
        'position:absolute; inset:0; pointer-events:none; z-index:5; overflow:hidden; border-radius:inherit;';
      const beam = document.createElement('div');
      beam.style.cssText =
        'position:absolute; top:-20%; bottom:-20%; width:55%; left:-60%;' +
        'background:linear-gradient(105deg, transparent 0%, rgba(255,255,255,0.28) 50%, transparent 100%);' +
        'transform:skewX(-12deg);';
      shine.appendChild(beam);
      card.appendChild(shine);
      beam.animate(
        [{ left: '-60%' }, { left: '120%' }],
        { duration: 950, delay: 250, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' }
      );
      setTimeout(() => shine.remove(), 1500);
    }
    try { navigator.vibrate?.([25, 60, 25]); } catch {}
  }

  // Fires the finale exactly once, after the segment fill animation has
  // finished drawing (delay passed in by the caller).
  function maybeScheduleFinale(afterMs) {
    if (visited.length !== SECTIONS.length || finaleDone()) return false;
    markFinaleDone();
    setTimeout(playFinale, afterMs);
    return true;
  }

  // Render segments. `animateIdxs` = array of 0-based segment indices to
  // animate (0→100%). All other segments are set to their target instantly.
  function renderSegs(animateIdxs) {
    const order = displayOrder();
    const filled = getFilledState();
    for (let i = 0; i < 3; i++) {
      const segEl = document.querySelector('.ila-seg[data-seg="' + (i + 1) + '"]');
      if (!segEl) continue;
      const fillEl = segEl.querySelector('.ila-seg-fill');
      segEl.style.background = SEG_EMPTY;
      if (!fillEl) continue;
      fillEl.style.background = 'linear-gradient(to right,' + COLORS[order[i]] + ',' + COLORS[order[i + 1]] + ')';
      if (animateIdxs.includes(i)) {
        const target = filled[i] ? '100%' : '0%';
        fillEl.style.transition = 'none';
        fillEl.style.width = '0%';
        // Short timeout lets the browser commit the 0% paint before animating.
        ; (function (el, w) {
          setTimeout(() => {
            el.style.transition = 'width 0.9s ' + EASE_OUT + '';
            el.style.width = w;
          }, 30);
        })(fillEl, target);
      } else {
        fillEl.style.transition = 'none';
        fillEl.style.width = filled[i] ? '100%' : '0%';
      }
    }
  }

  // Full replay: each filled seg animates from 0 → 100 %, ONE AFTER THE OTHER,
  // so the line traces the user's visit order like a route (home → app₁ → app₂ …).
  // Used when the portfolio card is revealed after off-screen visits.
  function replayAllAnim() {
    renderBadge(); renderTitle(); renderSlots();
    const order = displayOrder();
    const filled = getFilledState();
    const fills = [0, 1, 2].map(i =>
      document.querySelector('.ila-seg[data-seg="' + (i + 1) + '"] .ila-seg-fill'));

    const SEG_DUR = 650;  // ms per segment — snappy enough to feel alive
    const GAP = 40;   // small breather between legs

    // Snap all fills to 0 (no transition) …
    fills.forEach((el, i) => {
      if (!el) return;
      el.style.background = 'linear-gradient(to right,' + COLORS[order[i]] + ',' + COLORS[order[i + 1]] + ')';
      el.style.transition = 'none';
      el.style.width = '0%';
    });

    // … then after a short delay (gives browser time to commit the 0% paint),
    // chain each filled segment so they draw the route in order.
    setTimeout(() => {
      let delay = 0;
      for (let i = 0; i < 3; i++) {
        const el = fills[i];
        if (!el) continue;
        if (!filled[i]) {
          el.style.transition = 'none';
          el.style.width = '0%';
          continue;
        }
        ; (function (node, d) {
          setTimeout(() => {
            node.style.transition = 'width ' + SEG_DUR + 'ms ' + EASE_OUT + '';
            node.style.width = '100%';
          }, d);
        })(el, delay);
        delay += SEG_DUR + GAP;
      }
    }, 30);
  }

  // Called when the smart stack switches cards (fired from the carousel IIFE).
  window.sstackOnCardChange = function (idx) {
    if (idx === 1 && pendingAnim) {
      pendingAnim = false;
      replayAllAnim();
      // Route replay takes ~30 + 3*(650+40) = ~2100 ms at most. Give the
      // user ~2.5 s to admire the completed line, then auto-advance.
      if (visited.length === SECTIONS.length) {
        const finale = maybeScheduleFinale(2150);
        scheduleAutoAdvance(2100 + 2500 + (finale ? 1300 : 0));
      }
    }
  };

  // Expose read-only state for the expanded Portfolio view to render its own
  // larger, stylised timeline (cloning the compact widget DOM looks bad).
  window.ilaGetState = function () {
    return { SECTIONS, LABELS, COLORS, visited: visited.slice(), current, displayOrder: displayOrder(), filled: getFilledState() };
  };

  window.ilaVisit = function (section) {
    if (!SECTIONS.includes(section)) return;
    // Capture which segments were filled BEFORE this visit.
    const wasFilledBefore = getFilledState();
    if (!visited.includes(section)) visited.push(section);
    current = section;
    const filledNow = getFilledState();
    // Newly filled = segments that just transitioned to filled state.
    const newlyFilled = [0, 1, 2].filter(i => !wasFilledBefore[i] && filledNow[i]);

    const portfolioVisible = typeof window.sstackGetActiveIdx === 'function'
      && window.sstackGetActiveIdx() === 1;

    renderBadge();
    renderTitle();
    renderSlots();

    if (portfolioVisible) {
      // Widget is visible: animate only the new segment, leave others instant.
      renderSegs(newlyFilled);
      // If this visit just filled the last segment, plan to auto-advance
      // after the segment animation (~930 ms) + ~2.5 s of admire time.
      if (visited.length === SECTIONS.length) {
        // Finale (dot pulses + shine) plays right after the line completes;
        // give it room before the stack auto-advances away.
        const finale = maybeScheduleFinale(950);
        scheduleAutoAdvance(930 + 2500 + (finale ? 1300 : 0));
      }
    } else {
      // Widget hidden: render instantly, queue a full replay for when it appears.
      renderSegs([]);   // all instant, no animation
      if (newlyFilled.length > 0) pendingAnim = true;
      // The auto-advance will be scheduled once the user reveals the card
      // (see sstackOnCardChange above).
    }
  };

  // Initial render — no animation on first paint.
  renderBadge(); renderTitle(); renderSlots(); renderSegs([]);
  firstRender = false;
})();
