// ── iOS Smart Stack (gesture carousel, infinite loop) ─────────────────────
(function () {
  const frame = document.getElementById('sstack-frame');
  const cards = frame ? Array.from(frame.querySelectorAll('.sstack-card')) : [];
  const dotsWrap = document.getElementById('sstack-dots');
  const dotEls = dotsWrap ? Array.from(dotsWrap.querySelectorAll('.sstack-dot')) : [];
  if (!frame || cards.length < 2) return;

  const N = cards.length;
  const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
  const DUR = 420;            // ms for snap
  const THRESHOLD = 38;             // px to switch card
  let H = frame.offsetHeight || 148;

  let activeIdx = 1;                 // which card is the front one — start with Explore on top
  let dragY = 0;                 // current drag offset in px (front card's translateY)
  let dragDir = -1;                // -1 = advance (up), +1 = go back (down)
  let dragging = false;
  let startY = 0;
  let pointerId = null;
  let hideTimer = null;

  // Slower, gentler snap for programmatic transitions like the auto-advance
  // after "all explored" — the user isn't actively swiping, so we let the
  // card glide up with more drama.
  const SLOW_DUR = 1100;
  const SLOW_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

  // Render all cards at their positions. At rest (dragY=0) only slot 0 is in
  // view; the slot -1 and slot +1 cards sit off-screen above/below the frame
  // and are naturally clipped by overflow:hidden. During drag the front card
  // moves and the neighbour slides in from the opposite side. Transitions
  // handle the snap-home animation automatically when activeIdx changes.
  function render(animated, slow) {
    const dur = slow ? SLOW_DUR : DUR;
    const ease = slow ? SLOW_EASE : EASE;
    cards.forEach((card, i) => {
      const offset = (i - activeIdx + N) % N;
      let slot;
      if (offset === 0) slot = 0;
      else if (N === 2) slot = dragDir < 0 ? +1 : -1;  // only one "other" card
      else if (offset === 1) slot = +1;
      else if (offset === N - 1) slot = -1;
      else slot = null;

      if (slot === null) {
        // This card isn't adjacent — park it off-screen, invisible.
        card.style.transition = 'none';
        card.style.transform = `translateY(${2 * H}px)`;
        card.style.opacity = '0';
        card.style.pointerEvents = 'none';
        return;
      }

      const ty = slot * H + dragY;
      // Gentle scale-down as a card moves away from the center.
      const dist = Math.min(1, Math.abs(ty) / H);
      const scale = 1 - dist * 0.06;

      card.style.transition = animated
        ? `transform ${dur}ms ${ease}, opacity ${dur}ms ${ease}`
        : 'none';
      card.style.transform = `translateY(${ty}px) scale(${scale})`;
      card.style.opacity = '1';
      card.style.zIndex = slot === 0 ? '100' : '99';
      card.style.pointerEvents = slot === 0 ? 'auto' : 'none';
    });

    updateDots();
  }

  function updateDots() {
    if (!dotEls.length) return;
    dotEls.forEach((d, i) => {
      d.classList.toggle('is-active', i === activeIdx);
    });
  }

  function flashDots() {
    if (!dotsWrap) return;
    dotsWrap.style.opacity = '1';
    frame.classList.add('is-dragging');         // outline tracks dots
    if (hideTimer) clearTimeout(hideTimer);
    if (dragging) return;                       // keep both visible while dragging
    hideTimer = setTimeout(() => {
      dotsWrap.style.opacity = '0';
      frame.classList.remove('is-dragging');    // outline fades together with dots
    }, 1500);
  }

  // Pointer handlers
  let captured = false;
  frame.addEventListener('pointerdown', (e) => {
    // Don't hijack clicks on interactive children
    if (e.target.closest('a, button')) return;
    dragging = true;
    startY = e.clientY;
    dragY = 0;
    pointerId = e.pointerId;
    captured = false;
    H = frame.offsetHeight || 148;
    flashDots();
  });

  frame.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    let dy = e.clientY - startY;
    if (!captured && Math.abs(dy) > 4) {
      // Only capture once real drag intent is clear — lets pure taps
      // still reach onclick handlers on child elements.
      captured = true;
      try { frame.setPointerCapture(pointerId); } catch (_) { }
      frame.style.cursor = 'grabbing';
    }
    // Rubber-band a little past the card
    if (Math.abs(dy) > H) dy = Math.sign(dy) * (H + (Math.abs(dy) - H) * 0.35);
    dragY = dy;
    if (Math.abs(dy) > 2) dragDir = Math.sign(dy);
    render(false);
  });

  function endDrag() {
    if (!dragging) return;
    dragging = false;
    if (captured) {
      frame.style.cursor = 'grab';
      try { frame.releasePointerCapture(pointerId); } catch (_) { }
    }
    captured = false;

    // Decide: snap back or advance
    let cardChanged = false;
    if (dragY <= -THRESHOLD) {
      activeIdx = (activeIdx + 1) % N;
      dragY = 0; dragDir = +1; cardChanged = true;
      render(true);
    } else if (dragY >= THRESHOLD) {
      activeIdx = (activeIdx - 1 + N) % N;
      dragY = 0; dragDir = -1; cardChanged = true;
      render(true);
    } else {
      dragY = 0;
      render(true);
    }
    flashDots();
    // Let other components know which card is now in front.
    if (cardChanged) notifyCardChange(activeIdx);
  }

  // Fan-out card-change events to every subscriber. Widget IIFEs push a
  // listener onto window.sstackCardHandlers; the legacy single-handler
  // window.sstackOnCardChange is still supported for back-compat.
  function notifyCardChange(idx) {
    if (Array.isArray(window.sstackCardHandlers)) {
      for (const fn of window.sstackCardHandlers) {
        try { fn(idx); } catch (e) { }
      }
    }
    if (typeof window.sstackOnCardChange === 'function') {
      try { window.sstackOnCardChange(idx); } catch (e) { }
    }
  }

  // Expose current active card for querying (e.g. portfolio IIFE).
  window.sstackGetActiveIdx = () => activeIdx;
  // Programmatic "swipe up" — advance to the next card. Used e.g. to
  // auto-reveal the next widget after the user has finished exploring the
  // whole portfolio route. Uses the slow/gentle easing by default so the
  // unprompted switch reads as a graceful reveal, not a snap.
  window.sstackNext = function (opts) {
    if (N < 2) return;
    const slow = !opts || opts.slow !== false;   // default: slow
    dragDir = -1;           // advance direction
    activeIdx = (activeIdx + 1) % N;
    dragY = 0;
    render(true, slow);
    flashDots();
    notifyCardChange(activeIdx);
  };
  frame.addEventListener('pointerup', endDrag);
  frame.addEventListener('pointercancel', endDrag);
  frame.addEventListener('pointerleave', endDrag);

  // Handle resize (orientation change etc.)
  window.addEventListener('resize', () => {
    H = frame.offsetHeight || 148;
    if (!dragging) render(false);
  });

  // Init — briefly reveal the outline + dots so the user sees it's a stack
  requestAnimationFrame(() => {
    H = frame.offsetHeight || 148;
    render(false);
    // Wait until the iOS intro-blur animation has mostly settled before hinting.
    setTimeout(() => {
      flashDots();  // flashDots fades outline + dots together via the shared timer
    }, 900);
  });
})();
