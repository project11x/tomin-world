// ── iOS Edge-Swipe Back Gesture (interactive) ─────────────────────────────
// Drag from the left or right edge → the current screen follows the finger
// 1:1, the parent screen parallaxes in behind it (where there is one), and
// on release the gesture commits or springs back based on travel distance
// plus release velocity. This replaces the old fire-at-55px trigger so the
// gesture feels native instead of binary.
//
// Two invisible edge strips with `touch-action:none` capture the pointer —
// without them the browser's own pan/scroll wins the gesture and fires
// pointercancel mid-drag (horizontal scrollers like the magazine pages
// would steal every left-edge swipe). The strips only exist while an iOS
// overlay is open, and plain taps on them are forwarded to the element
// underneath so edge-adjacent buttons keep working.
(function () {
  const byId = (id) => document.getElementById(id);

  // Priority-ordered back hierarchy: innermost screen first.
  // mode controls how a committed swipe leaves the screen:
  //   'push'    — back() itself animates inline transforms (slide-out +
  //               parent return); we restore the inline transition and let
  //               it take over from the dragged position.
  //   'overlay' — full-screen app root that normally closes via a View
  //               Transition morph; we slide it out ourselves and suppress
  //               the VT (window.__edgeSwipeClosing) so back() just hides.
  //   'class'   — sub-screen driven by an `.is-open` class with a CSS
  //               transition; we slide out inline, then drop the class.
  //   'instant' — back() hides with no animation; we slide out first.
  //   'none'    — surface that can't slide horizontally (bottom sheet);
  //               falls back to the old fire-at-threshold behaviour.
  const HIERARCHY = [
    { // BTS photo/video viewer (deepest BTS level)
      match: () => isShown('ios-bts-app') && isShown('ios-bts-viewer'),
      back: () => window.iosBtsCloseViewer && window.iosBtsCloseViewer(),
      screen: () => byId('ios-bts-viewer'),
      mode: 'instant',
    },
    { // BTS file grid
      match: () => isShown('ios-bts-app') && isShown('ios-bts-screen-files'),
      back: () => window.iosBtsBackToFolders && window.iosBtsBackToFolders(),
      screen: () => byId('ios-bts-screen-files'),
      under: () => byId('ios-bts-screen-folders'),
      mode: 'push',
    },
    { // BTS app root
      match: () => isShown('ios-bts-app'),
      back: () => window.iosCloseBts && window.iosCloseBts(),
      screen: () => byId('ios-bts-app'),
      mode: 'overlay',
    },
    { // Magazine reader (inside Magazines app)
      match: () => isShown('ios-magazines-app') && isShown('ios-mag-screen-reader'),
      back: () => window.iosCloseReader && window.iosCloseReader(),
      screen: () => byId('ios-mag-screen-reader'),
      under: () => byId('ios-mag-screen-grid'),
      mode: 'push',
    },
    { // Magazines app root
      match: () => isShown('ios-magazines-app'),
      back: () => window.iosCloseMagazines && window.iosCloseMagazines(),
      screen: () => byId('ios-magazines-app'),
      mode: 'overlay',
    },
    { // Edits app
      match: () => isShown('ios-edits-app'),
      back: () => window.iosCloseEdits && window.iosCloseEdits(),
      screen: () => byId('ios-edits-app'),
      mode: 'overlay',
    },
    { // Contact app
      match: () => isShown('ios-contact-app'),
      back: () => window.iosCloseContact && window.iosCloseContact(),
      screen: () => byId('ios-contact-app'),
      mode: 'overlay',
    },
    { // Pin-creation sheet (deepest — close just the sheet, leave board)
      match: () => {
        const sheet = byId('journal-pin-creator');
        return !!sheet && sheet.classList.contains('ios-pin-sheet') &&
               sheet.classList.contains('is-open');
      },
      back: () => {
        // Delegate to the sheet's own close button so its slide-down
        // animation runs and the journal-board module's `creatorOpen`
        // guard gets reset.
        document.querySelector('#journal-pin-creator [data-jpin-close]')?.click();
      },
      mode: 'none',
    },
    { // Journal Board sub-screen
      match: () => isShown('ios-journal-app') && byId('ios-journal-board')?.classList.contains('is-open'),
      back: () => byId('ios-journal-board')?.classList.remove('is-open'),
      screen: () => byId('ios-journal-board'),
      mode: 'class',
    },
    { // Journal Play sub-screen
      match: () => isShown('ios-journal-app') && byId('ios-journal-play')?.classList.contains('is-open'),
      back: () => byId('ios-journal-play')?.classList.remove('is-open'),
      screen: () => byId('ios-journal-play'),
      mode: 'class',
    },
    { // Journal Passport sub-screen
      match: () => isShown('ios-journal-app') && byId('ios-journal-passport')?.classList.contains('is-open'),
      back: () => byId('ios-journal-passport')?.classList.remove('is-open'),
      screen: () => byId('ios-journal-passport'),
      mode: 'class',
    },
    { // Journal Insights sub-screen
      match: () => isShown('ios-journal-app') && byId('ios-journal-insights')?.classList.contains('is-open'),
      back: () => byId('ios-journal-insights')?.classList.remove('is-open'),
      screen: () => byId('ios-journal-insights'),
      mode: 'class',
    },
    { // Journal app
      match: () => isShown('ios-journal-app'),
      back: () => window.iosCloseJournal && window.iosCloseJournal(),
      screen: () => byId('ios-journal-app'),
      mode: 'overlay',
    },
  ];

  function isShown(id) {
    const el = byId(id);
    if (!el) return false;
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden';
  }

  window.iosGoBack = function () {
    for (const entry of HIERARCHY) {
      if (entry.match()) { entry.back(); return true; }
    }
    return false;
  };

  // ── Tuning ──────────────────────────────────────────────────────────────
  const STRIP_WIDTH = 22;     // px hot zone at each edge
  const LOCK_DX = 6;          // inward px before the drag "locks" horizontal
  const COMMIT_RATIO = 0.32;  // fraction of viewport width → commit
  const FLICK_VELOCITY = 0.45;// px/ms inward at release → commit (flick)
  const FLICK_MIN_PX = 30;    // …but only past this much travel
  const LEGACY_DX = 55;       // threshold for non-draggable surfaces
  const TAP_SLOP = 8;         // max movement for tap forwarding
  const EASE_SPRING = 'cubic-bezier(0.32, 0.72, 0, 1)';
  const EASE_OUT = 'cubic-bezier(0.2, 0.7, 0.3, 1)';

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // ── Edge strips ─────────────────────────────────────────────────────────
  const strips = ['left', 'right'].map((side) => {
    const el = document.createElement('div');
    el.dataset.edge = side;
    el.style.cssText = `position:fixed; top:0; bottom:0; ${side}:0; width:${STRIP_WIDTH}px;` +
      'z-index:10500; touch-action:none; background:transparent; display:none;';
    el.addEventListener('pointerdown', onDown);
    document.body.appendChild(el);
    return el;
  });

  function updateStrips() {
    const active = window.innerWidth <= 768 &&
      !byId('ios-admin-overlay')?.classList.contains('visible') &&
      HIERARCHY.some((h) => h.match());
    strips.forEach((s) => { s.style.display = active ? 'block' : 'none'; });
  }

  // Overlays open/close on taps, so pointerup (plus a delay for the open
  // animation) catches nearly every state change; the slow interval is a
  // safety net for programmatic opens (deep links, forced reloads).
  window.addEventListener('pointerup', () => {
    setTimeout(updateStrips, 80);
    setTimeout(updateStrips, 500);
  }, { passive: true });
  window.addEventListener('resize', updateStrips);
  setInterval(updateStrips, 1200);
  updateStrips();

  // ── Gesture state ───────────────────────────────────────────────────────
  let drag = null;

  function onDown(e) {
    // Rescue a leaked drag (pointerup swallowed by the browser, multi-touch
    // id mismatch, …) so one broken gesture can't kill the feature.
    if (drag && e.timeStamp - drag.t0 > 2000) drag = null;
    if (drag || (!e.isPrimary && e.pointerType === 'touch')) return;
    const entry = HIERARCHY.find((h) => h.match());
    if (!entry) return;

    const edge = e.currentTarget?.dataset?.edge
      || (e.clientX <= STRIP_WIDTH ? 'left'
        : e.clientX >= window.innerWidth - STRIP_WIDTH ? 'right' : null);
    if (!edge) return;
    const screenEl = entry.screen ? entry.screen() : null;
    const interactive = !!screenEl && entry.mode !== 'none' && !reducedMotion.matches;

    drag = {
      entry, edge,
      dir: edge === 'left' ? 1 : -1,
      startX: e.clientX, startY: e.clientY, t0: e.timeStamp,
      pointerId: e.pointerId,
      interactive,
      screenEl,
      underEl: entry.under ? entry.under() : null,
      locked: false, dead: false, fired: false,
      samples: [{ t: e.timeStamp, x: e.clientX }],
      maxMove: 0,
    };
    try { e.currentTarget?.setPointerCapture?.(e.pointerId); } catch {}
  }

  // Window-level fallback: catches edge pointerdowns the strips miss (strip
  // momentarily hidden after a programmatic open, or some surface stacked
  // above them). The strips remain the primary path because their
  // touch-action:none is what stops the browser from stealing the gesture —
  // this fallback can still lose to a native scroller (pointercancel ends
  // the drag with a spring-back), but the swipe is never silently dead.
  window.addEventListener('pointerdown', (e) => {
    if (drag || window.innerWidth > 768) return;
    if (e.target && e.target.dataset && e.target.dataset.edge) return; // strip already handled it
    if (e.clientX > STRIP_WIDTH && e.clientX < window.innerWidth - STRIP_WIDTH) return;
    onDown(e);
  }, { passive: true });

  // Blur values the .ios-screen-blurred class applies — interpolated live
  // while an app overlay is dragged so the home screen "wakes up" under the
  // finger instead of unblurring only after release.
  const BLUR_PX = 12;
  const SWIPE_RADIUS = 38; // Apple-ish display corner radius while dragging

  function blurBase() {
    return document.body.classList.contains('ios-dark') ? 0.7 : 0.9;
  }

  function lockDrag() {
    const d = drag;
    d.locked = true;
    const s = d.screenEl;
    d.prevScreenTransition = s.style.transition;
    d.prevScreenTransform = s.style.transform;
    d.prevScreenRadius = s.style.borderRadius;
    d.prevScreenShadow = s.style.boxShadow;
    d.prevScreenOverflow = s.style.overflow;
    s.style.transition = 'none';
    s.style.willChange = 'transform';
    s.style.overflow = 'hidden';
    if (d.underEl) {
      const u = d.underEl;
      d.prevUnderTransition = u.style.transition;
      d.prevUnderTransform = u.style.transform;
      d.prevUnderOpacity = u.style.opacity;
      u.style.transition = 'none';
      u.style.willChange = 'transform, opacity';
    }
    // App-root overlays sit on the blurred home screen — drive its blur by
    // hand during the drag.
    if (d.entry.mode === 'overlay') {
      const home = byId('ios-screen');
      if (home && home.classList.contains('ios-screen-blurred')) {
        d.homeEl = home;
        d.prevHomeTransition = home.style.transition;
        home.style.transition = 'none';
      }
    }
  }

  function applyDrag(px) {
    const d = drag;
    const p = Math.min(1, px / window.innerWidth);
    const s = d.screenEl;
    s.style.transform = `translateX(${d.dir * px}px)`;
    // Corners + edge shadow grow in with the first few px of travel, so a
    // cancelled flick never leaves a hard radius pop on screen.
    const grow = Math.min(1, px / 48);
    s.style.borderRadius = `${Math.round(SWIPE_RADIUS * grow)}px`;
    s.style.boxShadow = `0 10px 50px rgba(0,0,0,${(0.35 * grow).toFixed(3)})`;
    if (d.underEl) {
      // Parent screens rest at translateX(-30%) / opacity 0.4 (the shared
      // push-transition convention) and return to 0 / 1 as the swipe opens.
      d.underEl.style.transform = `translateX(${-30 * (1 - p)}%)`;
      d.underEl.style.opacity = String(0.4 + 0.6 * p);
    }
    if (d.homeEl) {
      const b0 = blurBase();
      d.homeEl.style.filter =
        `blur(${(BLUR_PX * (1 - p)).toFixed(1)}px) brightness(${(b0 + (1 - b0) * p).toFixed(3)})`;
      d.homeEl.style.transform = `scale(${(0.97 + 0.03 * p).toFixed(4)})`;
    }
  }

  function onMove(e) {
    const d = drag;
    if (!d || d.dead || d.fired || e.pointerId !== d.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = Math.abs(e.clientY - d.startY);
    const inward = d.dir * dx;
    d.maxMove = Math.max(d.maxMove, Math.abs(dx), dy);

    if (!d.interactive) {
      // Legacy behaviour for sheets / reduced motion: fire once past the
      // threshold, no tracking visuals.
      if (dy > 60) { d.dead = true; return; }
      if (inward >= LEGACY_DX) {
        d.fired = true;
        d.entry.back();
      }
      return;
    }

    if (!d.locked) {
      if (dy > 18 && dy > Math.abs(dx) * 1.2) { d.dead = true; return; }
      if (inward >= LOCK_DX && inward >= dy) lockDrag();
      else return;
    }

    d.samples.push({ t: e.timeStamp, x: e.clientX });
    if (d.samples.length > 6) d.samples.shift();
    applyDrag(Math.max(0, inward));
  }

  function releaseVelocity(d, endT, endX) {
    // Inward px/ms measured over the trailing ~100ms of the gesture.
    let ref = d.samples[0];
    for (const s of d.samples) { if (endT - s.t <= 110) { ref = s; break; } }
    const dt = endT - ref.t;
    if (dt <= 0) return 0;
    return (d.dir * (endX - ref.x)) / dt;
  }

  function clearScreenStyles(d) {
    const s = d.screenEl;
    s.style.transition = d.prevScreenTransition || '';
    s.style.willChange = '';
    s.style.borderRadius = d.prevScreenRadius || '';
    s.style.boxShadow = d.prevScreenShadow || '';
    s.style.overflow = d.prevScreenOverflow || '';
  }

  // Hand the home screen back to the .ios-screen-blurred class (or its
  // absence) — inline values left behind would freeze the blur forever.
  function clearHomeStyles(d) {
    if (!d.homeEl) return;
    d.homeEl.style.filter = '';
    d.homeEl.style.transform = '';
    d.homeEl.style.transition = d.prevHomeTransition || '';
  }

  function springBack(d) {
    const s = d.screenEl;
    s.style.transition = `transform 280ms ${EASE_SPRING}, border-radius 280ms ease, box-shadow 280ms ease`;
    void s.offsetWidth;
    s.style.transform = 'translateX(0px)';
    s.style.borderRadius = d.prevScreenRadius || '0px';
    s.style.boxShadow = '0 10px 50px rgba(0,0,0,0)';
    if (d.underEl) {
      const u = d.underEl;
      u.style.transition = `transform 280ms ${EASE_SPRING}, opacity 280ms ease`;
      u.style.transform = d.prevUnderTransform || 'translateX(-30%)';
      u.style.opacity = d.prevUnderOpacity || '0.4';
    }
    if (d.homeEl) {
      // Settle the home screen back into its blurred resting state.
      d.homeEl.style.transition = 'filter 280ms ease, transform 280ms ease';
      d.homeEl.style.filter = `blur(${BLUR_PX}px) brightness(${blurBase()})`;
      d.homeEl.style.transform = 'scale(0.97)';
    }
    setTimeout(() => {
      clearScreenStyles(d);
      // Restore the exact pre-drag inline value — for class-driven screens
      // that's '' (the .is-open class supplies translateX(0)); leaving a
      // hard inline translateX(0px) would override the class on close.
      s.style.transform = d.prevScreenTransform;
      if (d.underEl) {
        d.underEl.style.transition = d.prevUnderTransition || '';
        d.underEl.style.willChange = '';
      }
      clearHomeStyles(d);
    }, 300);
  }

  function commit(d) {
    const s = d.screenEl;

    if (d.entry.mode === 'push') {
      // back() animates the same inline transforms the drag touched — give
      // it back its transition (plus radius/shadow so the corners melt away
      // during the slide instead of popping off) and it continues from the
      // dragged position.
      const restored = d.prevScreenTransition || 'transform 0.35s cubic-bezier(0.25,1,0.5,1)';
      s.style.transition = `${restored}, border-radius 300ms ease, box-shadow 300ms ease`;
      s.style.borderRadius = d.prevScreenRadius || '0px';
      s.style.boxShadow = '0 10px 50px rgba(0,0,0,0)';
      s.style.willChange = '';
      if (d.underEl) {
        d.underEl.style.transition = d.prevUnderTransition || '';
        d.underEl.style.willChange = '';
      }
      d.entry.back();
      setTimeout(() => {
        s.style.transition = d.prevScreenTransition || '';
        s.style.borderRadius = d.prevScreenRadius || '';
        s.style.boxShadow = d.prevScreenShadow || '';
        s.style.overflow = d.prevScreenOverflow || '';
      }, 400);
      return;
    }

    // overlay / class / instant: slide the screen out ourselves (corners
    // stay rounded while it flies off, like iOS), then let back() do its
    // bookkeeping with its own animation suppressed.
    s.style.transition = `transform 240ms ${EASE_OUT}`;
    void s.offsetWidth;
    s.style.transform = `translateX(${d.dir * 102}%)`;
    if (d.homeEl) {
      // Finish waking the home screen up in step with the fly-out.
      d.homeEl.style.transition = 'filter 240ms ease, transform 240ms ease';
      d.homeEl.style.filter = 'blur(0px) brightness(1)';
      d.homeEl.style.transform = 'scale(1)';
    }
    setTimeout(() => {
      if (d.entry.mode === 'overlay') {
        window.__edgeSwipeClosing = true;
        try { d.entry.back(); } finally { window.__edgeSwipeClosing = false; }
      } else {
        d.entry.back();
      }
      clearScreenStyles(d);
      s.style.transform = '';
      clearHomeStyles(d);
    }, 250);
  }

  function forwardTap(d, e) {
    // A tap (not a drag) landed on the strip — pass it through so buttons
    // sitting within the edge zone keep working.
    strips.forEach((s) => { s.style.pointerEvents = 'none'; });
    const target = document.elementFromPoint(e.clientX, e.clientY);
    strips.forEach((s) => { s.style.pointerEvents = ''; });
    if (target) target.click();
  }

  function onUp(e) {
    const d = drag;
    if (!d || e.pointerId !== d.pointerId) return;
    drag = null;
    if (d.fired || d.dead) return;

    if (!d.locked) {
      if (d.maxMove <= TAP_SLOP && e.timeStamp - d.t0 < 400) forwardTap(d, e);
      return;
    }

    const inward = Math.max(0, d.dir * (e.clientX - d.startX));
    const progress = inward / window.innerWidth;
    const v = releaseVelocity(d, e.timeStamp, e.clientX);
    const shouldCommit = progress >= COMMIT_RATIO ||
      (v >= FLICK_VELOCITY && inward > FLICK_MIN_PX);
    if (shouldCommit) commit(d); else springBack(d);
  }

  function onCancel(e) {
    const d = drag;
    if (!d || e.pointerId !== d.pointerId) return;
    drag = null;
    if (d.locked && !d.fired) springBack(d);
  }

  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerup', onUp, { passive: true });
  window.addEventListener('pointercancel', onCancel, { passive: true });
})();
