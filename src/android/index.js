// Material 3 / Android view shell.
//
// Visibility rule: #android-screen renders only when palette === 'material'
// AND viewport is mobile. iOS view stays the default for the other palettes.
//
// Seed-color picker: writes data-seed on <html>; tokens.css pre-bakes
// 5 tonal palettes so we don't need material-color-utilities at runtime.

(function () {
  const html = document.documentElement;

  function isMobileView() { return window.innerWidth <= 768; }

  function getPalette() {
    try { return localStorage.getItem('palette') || 'default'; }
    catch (e) { return 'default'; }
  }

  function getSeed() {
    try {
      const s = localStorage.getItem('material-seed') || 'burgundy';
      // Migrate legacy 'custom' values to default seed (custom picker dropped)
      if (s === 'custom') {
        localStorage.setItem('material-seed', 'burgundy');
        localStorage.removeItem('material-custom-seed');
        return 'burgundy';
      }
      return s;
    } catch (e) { return 'burgundy'; }
  }

  // Restore seed from previous session before first paint
  html.setAttribute('data-seed', getSeed());

  function applyAndroidScreen() {
    const android = document.getElementById('android-screen');
    if (!android) return;
    const isMaterial = getPalette() === 'material';
    if (isMaterial && isMobileView()) {
      android.style.display = 'flex';
    } else {
      android.style.display = 'none';
    }
  }
  window.applyAndroidScreen = applyAndroidScreen;
  applyAndroidScreen();
  window.addEventListener('resize', applyAndroidScreen);

  // === iOS settings: 3-way palette segmented + seed picker ============

  const paletteButtons = document.querySelectorAll('#ios-palette-toggle [data-palette]');
  const seedRow = document.getElementById('ios-seed-row');
  const seedButtons = document.querySelectorAll('#ios-seed-toggle [data-seed]');

  function paintActiveState() {
    const palette = getPalette();
    paletteButtons.forEach(btn => {
      const active = btn.dataset.palette === palette;
      btn.style.background = active ? 'var(--ios-segmented-active, #ffffff)' : 'transparent';
      btn.style.color = active ? 'var(--ios-segmented-active-text, #000)' : 'rgba(255,255,255,0.5)';
      btn.style.boxShadow = active ? '0 1px 3px rgba(0,0,0,0.12)' : 'none';
    });
    if (seedRow) seedRow.style.display = palette === 'material' ? 'block' : 'none';
    const seed = getSeed();
    seedButtons.forEach(btn => {
      btn.style.borderColor = btn.dataset.seed === seed ? '#ffffff' : 'transparent';
    });
  }
  window.updateIosPaletteToggle = paintActiveState;

  paletteButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      if (window.setTheme) window.setTheme(btn.dataset.palette);
    });
  });

  seedButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const seed = btn.dataset.seed;
      try { localStorage.setItem('material-seed', seed); } catch (e) { /* ignore */ }
      html.setAttribute('data-seed', seed);
      html.style.cssText = html.style.cssText.replace(/--md-ref-[a-z-]+:[^;]+;?/g, '');
      paintActiveState();
    });
  });

  paintActiveState();
})();
