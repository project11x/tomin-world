// Pinch-to-zoom helper for image viewers.
// ─────────────────────────────────────────────────────────────────────────
// Wraps a single <img> with two-finger zoom + one-finger pan + double-tap
// reset. Designed to coexist with horizontal scroll-snap carousels (used
// by the magazine reader and BTS viewer): while the image is zoomed, we
// disable horizontal swipe-to-page so the user can pan the photo without
// accidentally flipping to the next page. Swiping returns once the image
// is reset to scale 1.
//
// Usage:
//   import { attachPinchZoom } from '../utils/pinch-zoom.js';
//   attachPinchZoom(imgEl, { scrollContainer: pagesEl });
//
// Options:
//   scrollContainer  — the parent that owns scroll-snap. We freeze its
//                      horizontal scroll while zoomed by toggling
//                      `overflow-x:hidden` and `touch-action`. Optional.
//   maxScale         — upper zoom limit (default 5)
//   minScale         — lower zoom limit (default 1; below 1 we ease back)
//

export function attachPinchZoom(imgEl, opts = {}) {
  if (!imgEl) return;
  const scrollContainer = opts.scrollContainer || null;
  const MAX = opts.maxScale != null ? opts.maxScale : 5;
  const MIN = opts.minScale != null ? opts.minScale : 1;

  let scale = 1;
  let tx = 0, ty = 0;

  // Pinch state
  let pinching = false;
  let initDist = 0;
  let initScale = 1;

  // Pan state (single-finger drag, only when zoomed)
  let panning = false;
  let panStartX = 0, panStartY = 0;
  let panStartTx = 0, panStartTy = 0;

  // Double-tap state
  let lastTap = 0;

  // Make sure the image transforms from its centre.
  imgEl.style.transformOrigin = 'center center';
  imgEl.style.touchAction = 'none';
  imgEl.style.willChange = 'transform';

  function clampPan(s, x, y) {
    // Allow the image to be dragged up to half its grown-overflow on each axis.
    const hw = (imgEl.offsetWidth * (s - 1)) / 2;
    const hh = (imgEl.offsetHeight * (s - 1)) / 2;
    return {
      x: Math.max(-hw, Math.min(hw, x)),
      y: Math.max(-hh, Math.min(hh, y)),
    };
  }

  function applyTransform(animate) {
    imgEl.style.transition = animate
      ? 'transform 0.28s cubic-bezier(0.2, 0.7, 0.2, 1)'
      : 'none';
    imgEl.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  }

  // While zoomed, freeze the carousel's horizontal scroll-snap so panning
  // doesn't paginate. Restored when scale returns to 1.
  function setCarouselFrozen(frozen) {
    if (!scrollContainer) return;
    if (frozen) {
      if (!scrollContainer.dataset._zoomFrozen) {
        scrollContainer.dataset._zoomFrozen = '1';
        scrollContainer.dataset._origOverflow = scrollContainer.style.overflowX || '';
        scrollContainer.dataset._origTouch = scrollContainer.style.touchAction || '';
        scrollContainer.style.overflowX = 'hidden';
        scrollContainer.style.touchAction = 'pan-y';
      }
    } else {
      if (scrollContainer.dataset._zoomFrozen) {
        scrollContainer.style.overflowX = scrollContainer.dataset._origOverflow;
        scrollContainer.style.touchAction = scrollContainer.dataset._origTouch;
        delete scrollContainer.dataset._zoomFrozen;
        delete scrollContainer.dataset._origOverflow;
        delete scrollContainer.dataset._origTouch;
      }
    }
  }

  function reset(animate) {
    scale = 1; tx = 0; ty = 0;
    applyTransform(animate);
    setCarouselFrozen(false);
  }

  imgEl.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      pinching = true;
      const a = e.touches[0], b = e.touches[1];
      initDist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      initScale = scale;
      e.preventDefault();
    } else if (e.touches.length === 1 && scale > 1) {
      // Pan only when zoomed in — otherwise let the carousel scroll.
      panning = true;
      panStartX = e.touches[0].clientX;
      panStartY = e.touches[0].clientY;
      panStartTx = tx;
      panStartTy = ty;
      e.preventDefault();
    }
  }, { passive: false });

  imgEl.addEventListener('touchmove', (e) => {
    if (pinching && e.touches.length === 2) {
      const a = e.touches[0], b = e.touches[1];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const next = Math.max(MIN * 0.85, Math.min(MAX, initScale * (dist / initDist)));
      scale = next;
      const c = clampPan(scale, tx, ty);
      tx = c.x; ty = c.y;
      applyTransform(false);
      setCarouselFrozen(scale > 1.01);
      e.preventDefault();
    } else if (panning && e.touches.length === 1) {
      const dx = e.touches[0].clientX - panStartX;
      const dy = e.touches[0].clientY - panStartY;
      const c = clampPan(scale, panStartTx + dx, panStartTy + dy);
      tx = c.x; ty = c.y;
      applyTransform(false);
      e.preventDefault();
    }
  }, { passive: false });

  imgEl.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) pinching = false;
    if (e.touches.length === 0) panning = false;

    // Below scale 1: spring back.
    if (scale < 1.05) {
      reset(true);
    }

    // Double-tap to reset / zoom-toggle.
    const now = Date.now();
    if (e.changedTouches.length === 1 && now - lastTap < 280) {
      if (scale > 1.05) {
        reset(true);
      } else {
        scale = 2;
        tx = 0; ty = 0;
        applyTransform(true);
        setCarouselFrozen(true);
      }
      lastTap = 0;
    } else {
      lastTap = now;
    }
  });

  // If the image is removed/replaced, callers can call this to make sure
  // the carousel is unfrozen.
  return {
    reset: () => reset(true),
    cleanup: () => setCarouselFrozen(false),
  };
}
