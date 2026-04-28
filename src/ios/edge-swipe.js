// ── iOS Edge-Swipe Back Gesture ───────────────────────────────────────────
// Drag from the left or right edge toward the center → equivalent to
// pressing the back arrow in the current iOS app / screen.
(function () {
  // Priority-ordered back hierarchy: innermost screen first.
  const HIERARCHY = [
    { // BTS photo/video viewer (deepest BTS level)
      match: () => isShown('ios-bts-app') && isShown('ios-bts-viewer'),
      back: () => window.iosBtsCloseViewer && window.iosBtsCloseViewer(),
    },
    { // BTS file grid
      match: () => isShown('ios-bts-app') && isShown('ios-bts-screen-files'),
      back: () => window.iosBtsBackToFolders && window.iosBtsBackToFolders(),
    },
    { // BTS app root
      match: () => isShown('ios-bts-app'),
      back: () => window.iosCloseBts && window.iosCloseBts(),
    },
    { // Magazine reader (inside Magazines app)
      match: () => isShown('ios-magazines-app') && isShown('ios-mag-screen-reader'),
      back: () => window.iosCloseReader && window.iosCloseReader(),
    },
    { // Magazines app root
      match: () => isShown('ios-magazines-app'),
      back: () => window.iosCloseMagazines && window.iosCloseMagazines(),
    },
    { // Edits app
      match: () => isShown('ios-edits-app'),
      back: () => window.iosCloseEdits && window.iosCloseEdits(),
    },
    { // Contact app
      match: () => isShown('ios-contact-app'),
      back: () => window.iosCloseContact && window.iosCloseContact(),
    },
    { // Mail — message detail view
      match: () => isShown('ios-mail-app') && isShown('ios-mail-screen-detail'),
      back: () => window.iosMailBackToList && window.iosMailBackToList(),
    },
    { // Mail — inbox list
      match: () => isShown('ios-mail-app'),
      back: () => window.iosCloseMail && window.iosCloseMail(),
    },
  ];

  function isShown(id) {
    const el = document.getElementById(id);
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

  // ── Edge-swipe detection ────────────────────────────────────────────────
  const EDGE_ZONE = 24;   // px from edge where a drag must start
  const MIN_DX = 55;   // inward distance to trigger back
  const MAX_DY = 60;   // max vertical deviation before cancelling

  let startX = 0, startY = 0, fromEdge = null, tracking = false, fired = false;

  function onDown(e) {
    if (!e.isPrimary && e.pointerType === 'touch') return;
    // Only activate when some iOS overlay is open (respects back hierarchy)
    if (!HIERARCHY.some(h => h.match())) return;
    const vw = window.innerWidth;
    if (e.clientX <= EDGE_ZONE) fromEdge = 'left';
    else if (e.clientX >= vw - EDGE_ZONE) fromEdge = 'right';
    else { fromEdge = null; return; }
    startX = e.clientX;
    startY = e.clientY;
    tracking = true;
    fired = false;
  }

  function onMove(e) {
    if (!tracking || fired) return;
    const dx = e.clientX - startX;
    const dy = Math.abs(e.clientY - startY);
    if (dy > MAX_DY) { tracking = false; return; }
    const inward = fromEdge === 'left' ? dx : -dx;
    if (inward >= MIN_DX) {
      if (window.iosGoBack()) {
        fired = true;
        tracking = false;
      }
    }
  }

  function onEnd() { tracking = false; fromEdge = null; }

  window.addEventListener('pointerdown', onDown, { passive: true });
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerup', onEnd, { passive: true });
  window.addEventListener('pointercancel', onEnd, { passive: true });
})();
