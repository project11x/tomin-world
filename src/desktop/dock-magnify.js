import { EASE_OUT } from '../utils/motion.js';
// macOS-style dock magnification.
//
// Replaces the per-icon Tailwind hover (binary scale-125) with the real
// thing: every icon scales by its distance to the cursor along a cosine
// falloff, so neighbours swell and settle as the mouse sweeps across the
// dock. Transforms only — the pill keeps its width, icons grow upward from
// their baseline (transform-origin bottom).

(function () {
  const dock = document.getElementById('macos-dock');
  if (!dock) return;
  const items = [...dock.querySelectorAll('.dock-item')];
  if (!items.length) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const RADIUS = 110;     // px around the cursor that feels the magnification
  const MAX_BOOST = 0.4;  // peak scale = 1.4 (matches the old hover:scale-125 + lift)
  const MAX_LIFT = 14;    // px upward travel at the peak

  let mouseX = null;
  let pressedItem = null;
  let raf = 0;

  items.forEach((it) => {
    it.style.transformOrigin = 'bottom center';
    // Short transition smooths the per-mousemove jumps into a glide and
    // doubles as the settle animation on mouseleave.
    it.style.transition = 'transform 130ms ' + EASE_OUT + '';
    it.addEventListener('pointerdown', () => { pressedItem = it; schedule(); });
  });
  window.addEventListener('pointerup', () => {
    if (pressedItem) { pressedItem = null; schedule(); }
  }, { passive: true });

  function apply() {
    raf = 0;
    for (const it of items) {
      // transform-origin bottom *center* keeps the horizontal centre stable
      // under scale, so reading it from the live rect is safe mid-animation.
      const r = it.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      let f = 0;
      if (mouseX != null) {
        const d = Math.abs(mouseX - cx);
        if (d < RADIUS) f = (Math.cos((d / RADIUS) * Math.PI) + 1) / 2;
      }
      let scale = 1 + MAX_BOOST * f;
      if (it === pressedItem) scale *= 0.93;
      it.style.transform =
        `translateY(${(-MAX_LIFT * f).toFixed(2)}px) scale(${scale.toFixed(4)})`;
    }
  }

  function schedule() {
    if (!raf) raf = requestAnimationFrame(apply);
  }

  dock.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    schedule();
  }, { passive: true });

  dock.addEventListener('mouseleave', () => {
    mouseX = null;
    pressedItem = null;
    schedule();
  });
})();
