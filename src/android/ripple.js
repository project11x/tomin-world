// M3 ripple — radial state-layer expanding from the touch point.
// Delegated pointerdown listener on #android-screen so dynamically rendered
// items get rippled without per-item wiring. Ripple appends a span inside
// the target (which gets position:relative + overflow:hidden enforced) and
// runs an animation that scales out, then removes itself.

(function () {
  const screen = document.getElementById('android-screen');
  if (!screen) return;

  const RIPPLE_SELECTOR = '.md-list-item, .md-card-button, .md-mag-card, .md-fab, .md-bottom-nav-item, [data-android-jump]';
  const READER_RIPPLE_SELECTOR = '.md-mag-icon-btn, .md-list-item';

  // Same ripple, but anchored on the reader overlay since it sits outside #android-screen
  const reader = document.getElementById('android-magazines-reader');
  if (reader) reader.addEventListener('pointerdown', (e) => attachRipple(e, READER_RIPPLE_SELECTOR));

  screen.addEventListener('pointerdown', (e) => attachRipple(e, RIPPLE_SELECTOR));

  function attachRipple(e, selector) {
    const target = e.target.closest(selector);
    if (!target) return;

    // Make sure the host can clip + position the ripple
    const hostStyle = getComputedStyle(target);
    if (hostStyle.position === 'static') target.style.position = 'relative';
    target.style.overflow = 'hidden';

    const rect = target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    // Diameter = farthest corner from click point × 2
    const dx = Math.max(x, rect.width - x);
    const dy = Math.max(y, rect.height - y);
    const radius = Math.sqrt(dx * dx + dy * dy);

    const ripple = document.createElement('span');
    ripple.className = 'md-ripple';
    ripple.style.left = (x - radius) + 'px';
    ripple.style.top = (y - radius) + 'px';
    ripple.style.width = ripple.style.height = (radius * 2) + 'px';
    target.appendChild(ripple);

    // Trigger animation in next frame so transitions take effect
    requestAnimationFrame(() => ripple.classList.add('md-ripple-active'));

    const cleanup = () => {
      ripple.classList.add('md-ripple-fade');
      setTimeout(() => ripple.remove(), 280);
    };
    target.addEventListener('pointerup', cleanup, { once: true });
    target.addEventListener('pointerleave', cleanup, { once: true });
    target.addEventListener('pointercancel', cleanup, { once: true });
  }
})();
