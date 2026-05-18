import { setIcon } from '../utils/icons.js';

// --- System Bar Logic ---
function updateClock() {
  const now = new Date();
  const options = { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
  document.getElementById('system-clock').innerText = now.toLocaleDateString('en-US', options).replace(',', '');
}
setInterval(updateClock, 1000);
updateClock();

const batContainer = document.getElementById('system-battery-container');
const batText = document.getElementById('system-battery-text');
const batIcon = document.getElementById('system-battery-icon');
if (navigator.getBattery) {
  navigator.getBattery().then(battery => {
    batContainer.style.display = 'flex';
    function updateBattery() {
      const level = Math.round(battery.level * 100);
      batText.innerText = `${level}%`;
      if (battery.charging) {
        setIcon(batIcon, 'battery_charging_full');
      } else if (level > 80) {
        setIcon(batIcon, 'battery_full');
      } else if (level > 40) {
        setIcon(batIcon, 'battery_5_bar');
      } else if (level > 10) {
        setIcon(batIcon, 'battery_2_bar');
      } else {
        setIcon(batIcon, 'battery_0_bar');
      }
    }
    updateBattery();
    battery.addEventListener('levelchange', updateBattery);
    battery.addEventListener('chargingchange', updateBattery);
  });
}

const themeToggle = document.getElementById('theme-toggle');
const magThemeToggle = document.getElementById('mag-theme-toggle');
function updateThemeCheckmarks() {
  const html = document.documentElement;
  const isDark = html.classList.contains('dark');
  const isPink = html.classList.contains('theme-pink');
  const isMaterial = html.classList.contains('theme-material');
  const isTui = html.classList.contains('theme-tui');
  // What the user *chose* — TUI may be active in storage even while a fallback
  // theme is painted because we're on mobile.
  let storedPalette = 'default';
  try { storedPalette = localStorage.getItem('palette') || 'default'; } catch (e) { /* ignore */ }

  const marks = {
    'theme-item-light': !isDark,
    'theme-item-dark': isDark,
    'theme-item-default': storedPalette === 'default',
    'theme-item-pink': storedPalette === 'pink',
    'theme-item-material': storedPalette === 'material',
    'theme-item-tui': storedPalette === 'tui',
  };
  void isTui;
  Object.entries(marks).forEach(([id, active]) => {
    const el = document.getElementById(id);
    if (!el) return;
    const existing = el.querySelector('.dropdown-checkmark');
    if (active && !existing) {
      const mark = document.createElement('span');
      mark.className = 'dropdown-checkmark';
      mark.textContent = '✓';
      el.prepend(mark);
    } else if (!active && existing) {
      existing.remove();
    }
  });
}

let _themeSwitchTimer = null;
function endThemeSwitchSoon() {
  const html = document.documentElement;
  if (_themeSwitchTimer) clearTimeout(_themeSwitchTimer);
  _themeSwitchTimer = setTimeout(() => {
    html.classList.remove('theme-switching');
    _themeSwitchTimer = null;
  }, 320);
}

function setDarkMode(isDark) {
  const html = document.documentElement;
  const themeToggle = document.getElementById('theme-toggle');
  const magThemeToggle = document.getElementById('mag-theme-toggle');

  html.classList.add('theme-switching');
  // Force a style flush so Safari registers the transition rule before the
  // colour-defining class flips in the same frame.
  void html.offsetWidth;
  if (isDark) html.classList.add('dark');
  else html.classList.remove('dark');
  endThemeSwitchSoon();

  const icon = isDark ? 'light_mode' : 'dark_mode';
  if (themeToggle) setIcon(themeToggle, icon);
  if (magThemeToggle) {
    const iconSpan = magThemeToggle.querySelector('.bi, span');
    if (iconSpan) setIcon(iconSpan, icon);
  }
  updateThemeCheckmarks();
  document.dispatchEvent(new Event('theme-change'));
}

function setTheme(mode) {
  const html = document.documentElement;
  const previous = html.classList.contains('theme-material') ? 'material'
    : html.classList.contains('theme-pink') ? 'pink'
    : html.classList.contains('theme-tui') ? 'tui' : 'default';
  // Remember the non-TUI palette so mobile can fall back to it.
  try {
    if (mode === 'tui' && previous !== 'tui') {
      localStorage.setItem('palette-prev', previous);
    }
  } catch (e) { /* ignore */ }
  html.classList.remove('theme-pink', 'theme-material', 'theme-tui');
  const isMobile = window.matchMedia('(max-width: 767px)').matches;
  let effective = mode;
  if (mode === 'tui' && isMobile) {
    try { effective = localStorage.getItem('palette-prev') || 'default'; } catch (e) { effective = 'default'; }
  }
  if (effective === 'pink') html.classList.add('theme-pink');
  if (effective === 'material') html.classList.add('theme-material');
  if (effective === 'tui') html.classList.add('theme-tui');
  try { localStorage.setItem('palette', mode); } catch (e) { /* ignore */ }
  updateThemeCheckmarks();
  document.dispatchEvent(new Event('theme-change'));
  if (window.updateIosPaletteToggle) window.updateIosPaletteToggle();
  if (window.applyAndroidScreen) window.applyAndroidScreen();
  if (window.androidRenderAll) window.androidRenderAll();
  // Smooth reveal on mobile — replay the relevant entrance animation on
  // whichever screen is now active. First close any open iOS app overlay
  // so the user lands cleanly on the new home, not stuck behind a stale
  // overlay (Contact, Edits, Magazines, BTS) from the previous palette.
  if (window.innerWidth <= 768 && previous !== mode) {
    document.querySelectorAll('.ios-app-overlay').forEach(el => {
      const disp = el.style.display;
      if (disp === 'flex' || disp.startsWith('flex')) el.style.display = 'none';
    });
    document.querySelectorAll('.app-morphing').forEach(el => el.classList.remove('app-morphing'));
    const iosScreen = document.getElementById('ios-screen');
    if (iosScreen) iosScreen.classList.remove('ios-screen-blurred');

    if (mode === 'material' && window.androidPlayEnter) {
      window.androidPlayEnter();
    } else if (mode !== 'material' && window.iosReplayIntro) {
      window.iosReplayIntro();
    }
  }
}

// Restore palette from previous session — survives desktop ↔ mobile switches.
// TUI is desktop-only, so fall back to the user's previous palette on mobile.
try {
  const stored = localStorage.getItem('palette');
  const isMobile = window.matchMedia('(max-width: 767px)').matches;
  let effective = stored;
  if (stored === 'tui' && isMobile) {
    effective = localStorage.getItem('palette-prev') || 'default';
  }
  if (effective === 'pink') document.documentElement.classList.add('theme-pink');
  else if (effective === 'material') document.documentElement.classList.add('theme-material');
  else if (effective === 'tui') document.documentElement.classList.add('theme-tui');
} catch (e) { /* ignore */ }

// Re-apply on viewport changes so resizing the window past the mobile threshold
// swaps TUI ↔ fallback without a reload.
window.addEventListener('resize', () => {
  let stored = 'default';
  try { stored = localStorage.getItem('palette') || 'default'; } catch (e) { /* ignore */ }
  if (stored !== 'tui') return;
  const isMobile = window.matchMedia('(max-width: 767px)').matches;
  const html = document.documentElement;
  const hasTui = html.classList.contains('theme-tui');
  if (isMobile && hasTui) {
    html.classList.remove('theme-tui');
    let prev = 'default';
    try { prev = localStorage.getItem('palette-prev') || 'default'; } catch (e) { /* ignore */ }
    if (prev === 'pink') html.classList.add('theme-pink');
    else if (prev === 'material') html.classList.add('theme-material');
  } else if (!isMobile && !hasTui) {
    html.classList.remove('theme-pink', 'theme-material');
    html.classList.add('theme-tui');
  }
});

updateThemeCheckmarks();

// Dropdown open/close with animation
document.querySelectorAll('.menu-item').forEach(item => {
  const menu = item.querySelector('.dropdown-menu');
  if (!menu) return;
  let closeTimer = null;

  const openMenu = () => {
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    menu.classList.add('open');
  };
  const closeMenu = () => {
    closeTimer = setTimeout(() => menu.classList.remove('open'), 120);
  };

  item.addEventListener('mouseenter', openMenu);
  item.addEventListener('mouseleave', closeMenu);
  menu.addEventListener('mouseenter', () => { if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; } });
  menu.addEventListener('mouseleave', closeMenu);
});

function toggleTheme() {
  const isDark = document.documentElement.classList.contains('dark');
  setDarkMode(!isDark);
}

if (themeToggle) themeToggle.addEventListener('click', toggleTheme);

const menuView = document.getElementById('menu-view');
if (menuView) {
  menuView.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message}`);
      });
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
    }
  });
}

const macosDock = document.getElementById('macos-dock');
const toggleDockBtn = document.getElementById('btn-toggle-dock');

function toggleDock() {
  if (!macosDock) return;
  const isHidden = macosDock.classList.contains('translate-y-full');
  if (isHidden) {
    macosDock.classList.remove('translate-y-full', 'opacity-0');
    toggleDockBtn.querySelector('span').innerText = 'Hide Dock';
  } else {
    macosDock.classList.add('translate-y-full', 'opacity-0');
    toggleDockBtn.querySelector('span').innerText = 'Show Dock';
  }
}

if (toggleDockBtn) toggleDockBtn.addEventListener('click', toggleDock);

// Global click listener to close dropdowns if needed (though hover handles it mostly)
document.addEventListener('click', (e) => {
  if (!e.target.closest('.menu-item')) {
    // Any specific click-to-close logic can go here if needed.
  }
});

if (magThemeToggle) magThemeToggle.addEventListener('click', toggleTheme);

window.setTheme = setTheme;
export { setDarkMode, setTheme };
