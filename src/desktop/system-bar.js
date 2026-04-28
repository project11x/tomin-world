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
        batIcon.innerText = 'battery_charging_full';
      } else if (level > 80) {
        batIcon.innerText = 'battery_full';
      } else if (level > 40) {
        batIcon.innerText = 'battery_5_bar';
      } else if (level > 10) {
        batIcon.innerText = 'battery_2_bar';
      } else {
        batIcon.innerText = 'battery_0_bar';
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
  const isGlass = html.classList.contains('theme-glass');
  const isPink = html.classList.contains('theme-pink');

  const marks = {
    'theme-item-light': !isDark,
    'theme-item-dark': isDark,
    'theme-item-default': !isGlass && !isPink,
    'theme-item-glass': isGlass,
    'theme-item-pink': isPink,
  };
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

function setDarkMode(isDark) {
  const html = document.documentElement;
  const themeToggle = document.getElementById('theme-toggle');
  const magThemeToggle = document.getElementById('mag-theme-toggle');

  if (isDark) {
    html.classList.add('dark');
  } else {
    html.classList.remove('dark');
  }

  const icon = isDark ? 'light_mode' : 'dark_mode';
  if (themeToggle) themeToggle.innerText = icon;
  if (magThemeToggle) {
    const iconSpan = magThemeToggle.querySelector('span');
    if (iconSpan) iconSpan.innerText = icon;
  }
  updateThemeCheckmarks();
}

function setTheme(mode) {
  const html = document.documentElement;
  html.classList.remove('theme-glass', 'theme-pink');
  if (mode === 'glass') html.classList.add('theme-glass');
  if (mode === 'pink') html.classList.add('theme-pink');
  updateThemeCheckmarks();
}

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

export { setDarkMode, setTheme };
