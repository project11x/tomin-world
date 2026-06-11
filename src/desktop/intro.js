// ─────────────────────────────────────────────────────────────────────
// Desktop intro sequence — the macOS "login" moment.
//
// Once per browser session, the Aero desktop choreographs itself in
// instead of just being there: the canvas settles from a slight zoom,
// the menu bar slides down, the dock rises, and the desktop icons
// cascade in with a stagger. ~900ms total, then every inline style is
// cleared so spaces.js / dock-hide / dock-magnify regain full control.
//
// Skipped entirely on mobile (the iOS shell owns that experience), for
// prefers-reduced-motion, for non-Aero palettes (Material / Terminal
// boot their own shells), and when a deep link boots straight into the
// edits / magazine space.
// ─────────────────────────────────────────────────────────────────────

(function () {
  const SESSION_KEY = 'desktop-intro-done';
  const SPRING = 'cubic-bezier(0.32, 0.72, 0, 1)';

  const menuBar = document.getElementById('top-menu-bar');
  const dock = document.getElementById('macos-dock');
  const desktopMain = document.getElementById('desktop-main');
  const iconsContainer = document.getElementById('desktop-icons-container');
  if (!menuBar || !dock || !desktopMain) return;

  function shouldSkip() {
    try { if (sessionStorage.getItem(SESSION_KEY)) return true; } catch (e) { }
    if (window.innerWidth <= 768) return true;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
    let palette = 'default';
    try { palette = localStorage.getItem('palette') || 'default'; } catch (e) { }
    if (palette === 'tui' || palette === 'material') return true;
    // Deep link straight into another space — its own transition is the moment.
    if (/translateX\(-?100/.test(desktopMain.style.transform || '')) return true;
    // Dock hidden by user preference — don't animate it into view.
    if (dock.classList.contains('translate-y-full')) return true;
    return false;
  }

  if (shouldSkip()) return;
  try { sessionStorage.setItem(SESSION_KEY, '1'); } catch (e) { }

  const icons = iconsContainer
    ? Array.from(iconsContainer.querySelectorAll('.desktop-icon'))
    : [];

  // Menu bar, dock and canvas carry their transitions INLINE in the markup
  // (spaces.js and dock-hide rely on them) — stash the originals so cleanup
  // can restore them instead of wiping them.
  const origTransition = {
    menuBar: menuBar.style.transition,
    dock: dock.style.transition,
    desktopMain: desktopMain.style.transition,
  };

  // ── 1. Initial states, applied synchronously so the first paint never
  //       shows the finished desktop before the choreography starts. ──
  menuBar.style.transition = 'none';
  menuBar.style.transform = 'translateY(-110%)';

  dock.style.transition = 'none';
  dock.style.transform = 'translateY(130%)';

  // The whole canvas settles from a slight zoom — reads as the space
  // "arriving". transform-origin is centered for the zoom only; spaces.js
  // never animates while this runs (we bail on deep links above).
  desktopMain.style.transition = 'none';
  desktopMain.style.transformOrigin = '50% 50%';
  desktopMain.style.transform = 'scale(1.045)';

  icons.forEach(icon => {
    icon.style.transition = 'none';
    icon.style.opacity = '0';
    icon.style.transform = 'translateY(14px) scale(0.96)';
  });

  // Commit start states in this task, then animate.
  void desktopMain.offsetWidth;

  // ── 2. Choreography. ──
  desktopMain.style.transition = `transform 900ms ${SPRING}`;
  desktopMain.style.transform = 'scale(1)';

  setTimeout(() => {
    menuBar.style.transition = `transform 600ms ${SPRING}`;
    menuBar.style.transform = 'translateY(0)';
  }, 80);

  setTimeout(() => {
    dock.style.transition = `transform 650ms ${SPRING}`;
    dock.style.transform = 'translateY(0)';
  }, 160);

  icons.forEach((icon, i) => {
    const delay = 240 + i * 40;
    setTimeout(() => {
      icon.style.transition = `opacity 360ms ease, transform 480ms ${SPRING}`;
      icon.style.opacity = '1';
      icon.style.transform = 'translateY(0) scale(1)';
    }, delay);
  });

  // ── 3. Cleanup — hand every element back untouched. Only clear values
  //       we set ourselves, in case something else took over mid-intro. ──
  const total = 240 + Math.max(0, icons.length - 1) * 40 + 480 + 80;
  setTimeout(() => {
    if (menuBar.style.transform === 'translateY(0)' || menuBar.style.transform === 'translateY(0px)') {
      menuBar.style.transition = origTransition.menuBar;
      menuBar.style.transform = '';
    }
    if (dock.style.transform === 'translateY(0)' || dock.style.transform === 'translateY(0px)') {
      dock.style.transition = origTransition.dock;
      dock.style.transform = '';
    }
    if (desktopMain.style.transform === 'scale(1)') {
      desktopMain.style.transition = origTransition.desktopMain;
      desktopMain.style.transform = '';
      desktopMain.style.transformOrigin = '';
    }
    icons.forEach(icon => {
      icon.style.transition = '';
      icon.style.opacity = '';
      icon.style.transform = '';
    });
  }, Math.max(total, 1000));
})();
