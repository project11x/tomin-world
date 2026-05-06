// ====== iOS Homescreen Logic ======
import { portfolioData } from '../../data.js';
import { safePlayVideo, killOtherVideos, attachBeachball } from '../utils/video.js';
import { makeShareButton } from '../utils/share.js';
import { folderToSlug, itemToSlug } from '../utils/slugs.js';
import { isItemRecent } from '../utils/recency.js';
import { setIcon } from '../utils/icons.js';

function formatRelativeDate(raw) {
  if (!raw) return '';
  const t = Date.parse(raw);
  if (isNaN(t)) return raw;
  const diffMs = Date.now() - t;
  const day = 24 * 60 * 60 * 1000;
  if (diffMs < day) return 'Heute';
  if (diffMs < 2 * day) return 'Gestern';
  if (diffMs < 7 * day) return `vor ${Math.floor(diffMs / day)} Tagen`;
  return new Date(t).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
}

function pushItemURL(folder, indexWithinFolder, itemName) {
  // Best-effort push so the share button gets a meaningful URL on mobile.
  // The router's applyURL is mobile-skipped, so this is purely cosmetic.
  let idx = indexWithinFolder;
  if (idx == null && itemName != null) {
    const items = portfolioData[folder] || [];
    idx = items.findIndex((i) => i.name === itemName);
  }
  if (idx == null || idx < 0) return;
  const fs = folderToSlug(folder);
  const is = itemToSlug(folder, idx);
  if (!fs || !is) return;
  const target = `/projects/${fs}/${is}`;
  if (location.pathname !== target) {
    try { history.replaceState({}, '', target); } catch (e) {}
  }
}

function pushFolderURL(folder) {
  const fs = folderToSlug(folder);
  if (!fs) return;
  const target = `/projects/${fs}`;
  if (location.pathname !== target) {
    try { history.replaceState({}, '', target); } catch (e) {}
  }
}

function popURLToRoot() {
  try { history.replaceState({}, '', '/'); } catch (e) {}
}

(function injectIosShareButtons() {
  const injectBeside = (closeBtn) => {
    if (!closeBtn || closeBtn.dataset.shareInjected) return;
    closeBtn.dataset.shareInjected = 'true';
    const share = makeShareButton({ size: 18, getUrl: () => location.href, getTitle: () => document.title });
    share.style.cssText += 'background:var(--ios-card-bg); box-shadow:0 0 0 1px var(--ios-card-border); margin-right:8px; color:var(--ios-text-secondary);';
    share.style.width = '40px';
    share.style.height = '40px';
    // Header is flex justify-between; pushing share to the right keeps the
    // share + close pair tight together on the right edge.
    share.style.marginLeft = 'auto';
    closeBtn.parentElement.insertBefore(share, closeBtn);
  };

  const injectInEditsControls = () => {
    const controls = document.getElementById('ios-edits-controls');
    if (!controls || controls.dataset.shareInjected) return;
    controls.dataset.shareInjected = 'true';
    const share = makeShareButton({ size: 20, getUrl: () => location.href, getTitle: () => document.title });
    share.style.color = '#fff';
    share.style.flexShrink = '0';
    share.style.width = '32px';
    share.style.height = '32px';
    // Insert just before the fullscreen icon so the row reads
    // [play] [scrubber] [time] [share] [fullscreen]
    const fs = document.getElementById('ios-edits-fullscreen');
    if (fs) controls.insertBefore(share, fs); else controls.appendChild(share);
  };

  const tryInject = () => {
    injectBeside(document.querySelector('#ios-mag-screen-reader [data-ios-close="reader"]'));
    injectInEditsControls();
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryInject, { once: true });
  } else {
    tryInject();
  }
})();

(function () {
  const iosScreen = document.getElementById('ios-screen');
  const iosMagazinesApp = document.getElementById('ios-magazines-app');
  const iosMagGrid = document.getElementById('ios-mag-grid');

  function isMobileView() { return window.innerWidth <= 768; }

  function playIosIntro() {
    // Idempotent: adding the class on items that already have it is a no-op,
    // and we want this to run every time the iOS screen becomes visible
    // (e.g. desktop → mobile resize) so items never stay stuck at opacity 0.
    iosScreen.querySelectorAll('.ios-intro-item').forEach(el => el.classList.add('ios-intro-run'));
  }

  function applyScreen() {
    if (isMobileView()) {
      iosScreen.style.display = 'flex';
      setTimeout(playIosIntro, 80);
    } else {
      iosScreen.style.display = 'none';
      iosMagazinesApp.style.display = 'none';
    }
  }
  applyScreen();
  window.addEventListener('resize', applyScreen);

  // iOS clock
  function updateClock() {
    const el = document.getElementById('ios-clock');
    if (!el) return;
    const n = new Date();
    el.textContent = n.getHours().toString().padStart(2, '0') + ':' + n.getMinutes().toString().padStart(2, '0');
  }
  updateClock();
  setInterval(updateClock, 10000);

  // iOS battery
  if (navigator.getBattery) {
    navigator.getBattery().then(bat => {
      const icon = document.getElementById('ios-battery-icon');
      if (!icon) return;
      function upd() {
        const lvl = Math.round(bat.level * 100);
        const name = bat.charging ? 'battery_charging_full'
          : lvl > 80 ? 'battery_full'
            : lvl > 40 ? 'battery_5_bar'
              : lvl > 10 ? 'battery_2_bar' : 'battery_0_bar';
        setIcon(icon, name);
      }
      upd();
      bat.addEventListener('levelchange', upd);
      bat.addEventListener('chargingchange', upd);
    });
  }

  // ---- iOS App Transition Logic ----
  let lastIosAppIcon = null;

  // Shared Element Transition using the native View Transitions API.
  // The same view-transition-name ("app-expansion") is moved between the
  // tapped icon and the full-screen app overlay inside startViewTransition().
  // The browser captures the OLD bounding box (icon) and NEW bounding box
  // (overlay) and morphs position + size + border-radius between them.
  function performIosAppTransition(appEl, iconEl, isOpen) {
    const screen = document.getElementById('ios-screen');
    const supportsVT = typeof document.startViewTransition === 'function';

    // Only one element may carry a given view-transition-name at a time.
    const clearMorphMarkers = () => {
      document.querySelectorAll('.app-morphing').forEach(el => el.classList.remove('app-morphing'));
    };

    if (isOpen) {
      lastIosAppIcon = iconEl;

      // No icon to morph from (programmatic open, e.g. mobile deep-link).
      // Skip the view-transition and just show the app instantly.
      if (supportsVT && iconEl) {
        clearMorphMarkers();
        // Mark the icon as the morph source — captured as OLD state
        iconEl.classList.add('app-morphing');

        document.startViewTransition(() => {
          // Inside the callback we mutate the DOM. The browser snapshots
          // BEFORE this runs (icon) and AFTER (overlay), then animates.
          iconEl.classList.remove('app-morphing');
          appEl.classList.add('app-morphing');
          appEl.style.display = 'flex';
          appEl.style.opacity = '1';
          appEl.style.transform = '';
          appEl.style.borderRadius = '0px';
          screen.classList.add('ios-screen-blurred');
        });
      } else {
        // Fallback: instant show (no morph) for unsupported browsers
        appEl.style.display = 'flex';
        appEl.style.opacity = '1';
        appEl.style.transform = '';
        appEl.style.borderRadius = '0px';
        screen.classList.add('ios-screen-blurred');
      }
    } else {
      const iconForReturn = lastIosAppIcon;

      if (supportsVT) {
        clearMorphMarkers();
        // Overlay is the morph source going OUT
        appEl.classList.add('app-morphing');

        const transition = document.startViewTransition(() => {
          appEl.classList.remove('app-morphing');
          if (iconForReturn) iconForReturn.classList.add('app-morphing');
          appEl.style.display = 'none';
          screen.classList.remove('ios-screen-blurred');
        });

        // Clean up the morph marker on the icon once animation is done
        transition.finished.finally(() => {
          if (iconForReturn) iconForReturn.classList.remove('app-morphing');
        });
      } else {
        // Fallback: instant hide
        appEl.style.display = 'none';
        screen.classList.remove('ios-screen-blurred');
      }
    }
  }

  // Open Magazines app
  window.iosOpenMagazines = function (event) {
    const iconEl = event ? event.currentTarget : null;
    setThemeColorForApp();

    // Build grid from portfolioData
    const magazines = [];
    Object.keys(portfolioData).forEach(key => {
      if (key.includes('/')) return;
      const items = portfolioData[key];
      if (!Array.isArray(items)) return;
      items.forEach((item, idx) => {
        if (!item.isMagazine) return;
        const magKey = key + '/' + item.name;
        const pages = portfolioData[magKey] || [];
        const cover = pages[0] ? pages[0].src : null;
        magazines.push({ folder: key, index: idx, name: item.name, cover });
      });
    });

    iosMagGrid.innerHTML = magazines.length === 0
      ? '<div style="grid-column:1/-1;text-align:center;padding-top:80px;color:var(--ios-text-secondary);font-size:14px;">No magazines found</div>'
      : magazines.map(mag => {
        const items = portfolioData[mag.folder] || [];
        const magObj = items[mag.index];
        const isNew = magObj && isItemRecent(magObj);
        const newPill = isNew
          ? `<span style="position:absolute;top:10px;left:10px;background:rgba(255,69,58,0.95);color:#fff;font-size:10px;font-weight:700;letter-spacing:0.04em;padding:3px 8px;border-radius:999px;backdrop-filter:blur(8px);box-shadow:0 2px 8px rgba(255,69,58,0.4);z-index:1;">NEU</span>`
          : '';
        const dateLabel = formatRelativeDate(magObj && magObj.date);
        return `
          <div onclick="iosTapMagazine('${mag.folder.replace(/'/g, "\\'")}',${mag.index})"
            style="-webkit-tap-highlight-color:transparent;cursor:pointer;height:fit-content;">
            <div style="position:relative;border-radius:14px;overflow:hidden;aspect-ratio:3/4;background:#1e293b;box-shadow:0 4px 16px rgba(0,0,0,0.25);">
              ${newPill}
              ${mag.cover
            ? `<img src="${mag.cover}" style="width:100%;height:100%;object-fit:cover;" />`
            : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:var(--ios-text-secondary);font-size:12px;">${mag.name}</div>`}
            </div>
            <p style="color:var(--ios-text);font-weight:600;font-size:13px;margin-top:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${mag.name}</p>
            <p style="color:var(--ios-text-secondary);font-size:11px;margin-top:1px;">${dateLabel}</p>
          </div>`;
      }).join('');

    iosMagazinesApp.classList.remove('closing');
    performIosAppTransition(iosMagazinesApp, iconEl, true);
  };

  window.iosCloseMagazines = function () {
    setThemeColorForScreen();
    iosMagazinesApp.classList.add('closing');
    performIosAppTransition(iosMagazinesApp, null, false);
    setTimeout(() => {
      iosMagazinesApp.style.display = 'none';
      iosMagazinesApp.classList.remove('closing');
      iosMagScreenReader.style.display = 'none';
      iosMagScreenReader.style.transform = '';
      iosMagScreenGrid.style.transform = '';
      iosMagScreenGrid.style.opacity = '';
      iosMagReaderPages.innerHTML = '';
      // Animate the portfolio route only once the user is actually back on home.
      if (window.ilaVisit) window.ilaVisit('magazin');
    }, 300);
  };

  const iosMagScreenGrid = document.getElementById('ios-mag-screen-grid');
  const iosMagScreenReader = document.getElementById('ios-mag-screen-reader');
  const iosMagReaderTitle = document.getElementById('ios-mag-reader-title');
  const iosMagReaderPages = document.getElementById('ios-mag-reader-pages');
  const iosMagPageLabel = document.getElementById('ios-mag-page-label');
  const iosMagPageProgress = document.getElementById('ios-mag-page-progress');

  function iosMagUpdatePageIndicator() {
    const w = iosMagReaderPages.clientWidth;
    if (!w) return;
    const total = iosMagReaderPages.children.length;
    const current = Math.round(iosMagReaderPages.scrollLeft / w) + 1;
    iosMagPageLabel.textContent = current + ' / ' + total;
    if (total > 1) {
      iosMagPageProgress.style.width = ((current - 1) / (total - 1) * 100) + '%';
    } else {
      iosMagPageProgress.style.width = '100%';
    }
  }

  iosMagReaderPages.addEventListener('scroll', iosMagUpdatePageIndicator);

  window.iosTapMagazine = function (folder, index) {
    const magItem = portfolioData[folder][index];
    const magKey = folder + '/' + magItem.name;
    const pages = portfolioData[magKey] || [];

    pushItemURL(folder, index);
    window.umami?.track('item-open', { folder, item: magItem?.name || String(index) });
    iosMagReaderTitle.textContent = magItem.name;
    const pageStyle = 'flex:0 0 100vw; width:100vw; min-width:100vw; height:100%; scroll-snap-align:start; overflow:hidden; display:flex; align-items:center; justify-content:center; background:transparent;';
    iosMagReaderPages.innerHTML = pages.length === 0
      ? '<div style="flex:0 0 100%;display:flex;align-items:center;justify-content:center;color:var(--ios-text-secondary);font-size:14px;">No pages found.</div>'
      : pages.map(p => p.isVideo
        ? `<div style="${pageStyle}"><video src="${p.src}" style="width:100%;height:100%;object-fit:contain;" autoplay loop muted playsinline preload="auto"></video></div>`
        : `<div style="${pageStyle}"><img src="${p.src}" style="width:100%;height:auto;flex-shrink:0;" /></div>`
      ).join('');

    iosMagReaderPages.scrollLeft = 0;
    setTimeout(iosMagUpdatePageIndicator, 50);

    // Play only visible video, pause others
    const iosMagVideos = iosMagReaderPages.querySelectorAll('video');

    function iosMagPlayVisibleVideo() {
      const w = iosMagReaderPages.clientWidth;
      const currentIndex = Math.round(iosMagReaderPages.scrollLeft / w);
      iosMagVideos.forEach(v => {
        const page = v.closest('div');
        const pageIndex = Array.from(iosMagReaderPages.children).indexOf(page);
        if (pageIndex === currentIndex) {
          v.play().catch(() => { });
        } else {
          v.pause();
        }
      });
    }

    iosMagReaderPages.addEventListener('scroll', iosMagPlayVisibleVideo);
    setTimeout(iosMagPlayVisibleVideo, 100);

    // Push transition: grid slides left, reader slides in from right
    iosMagScreenGrid.style.transition = 'transform 0.35s cubic-bezier(0.25,1,0.5,1), opacity 0.35s ease';
    iosMagScreenReader.style.transition = 'transform 0.35s cubic-bezier(0.25,1,0.5,1)';
    iosMagScreenReader.style.display = 'flex';
    iosMagScreenReader.style.transform = 'translateX(100%)';

    requestAnimationFrame(() => requestAnimationFrame(() => {
      iosMagScreenGrid.style.transform = 'translateX(-30%)';
      iosMagScreenGrid.style.opacity = '0.4';
      iosMagScreenReader.style.transform = 'translateX(0)';
    }));
  };

  window.iosCloseReader = function () {
    iosMagScreenGrid.style.transform = 'translateX(0)';
    iosMagScreenGrid.style.opacity = '1';
    iosMagScreenReader.style.transform = 'translateX(100%)';
    popURLToRoot();
    setTimeout(() => {
      iosMagScreenReader.style.display = 'none';
      iosMagReaderPages.innerHTML = '';
    }, 350);
  };

  // ---- iOS Edits App ----
  const iosEditsApp = document.getElementById('ios-edits-app');
  const iosEditsVideo = document.getElementById('ios-edits-video');
  const iosEditsList = document.getElementById('ios-edits-list');
  const iosEditsPlayPause = document.getElementById('ios-edits-play-pause');
  const iosEditsProgressBg = document.getElementById('ios-edits-progress-bg');
  const iosEditsProgressBar = document.getElementById('ios-edits-progress-bar');
  const iosEditsTime = document.getElementById('ios-edits-time');
  const iosEditsFullscreen = document.getElementById('ios-edits-fullscreen');
  let iosEditsItems = [];

  // Media controls wiring
  iosEditsPlayPause.addEventListener('click', () => {
    if (iosEditsVideo.paused) iosEditsVideo.play(); else iosEditsVideo.pause();
  });
  iosEditsFullscreen.addEventListener('click', () => {
    if (iosEditsVideo.requestFullscreen) iosEditsVideo.requestFullscreen();
    else if (iosEditsVideo.webkitEnterFullscreen) iosEditsVideo.webkitEnterFullscreen();
  });
  iosEditsVideo.addEventListener('play', () => { setIcon(iosEditsPlayPause, 'pause_circle'); });
  iosEditsVideo.addEventListener('pause', () => { setIcon(iosEditsPlayPause, 'play_circle'); });
  iosEditsVideo.addEventListener('timeupdate', () => {
    if (!iosEditsVideo.duration) return;
    const pct = (iosEditsVideo.currentTime / iosEditsVideo.duration) * 100;
    iosEditsProgressBar.style.width = pct + '%';
    const m = Math.floor(iosEditsVideo.currentTime / 60);
    const s = Math.floor(iosEditsVideo.currentTime % 60).toString().padStart(2, '0');
    iosEditsTime.textContent = `${m}:${s}`;
  });

  let iosEditsDragging = false;
  const iosEditsSeek = (clientX) => {
    if (!iosEditsVideo.duration) return;
    const rect = iosEditsProgressBg.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    iosEditsVideo.currentTime = pct * iosEditsVideo.duration;
    iosEditsProgressBar.style.width = (pct * 100) + '%';
  };
  iosEditsProgressBg.addEventListener('mousedown', (e) => { iosEditsDragging = true; iosEditsSeek(e.clientX); });
  iosEditsProgressBg.addEventListener('touchstart', (e) => { iosEditsDragging = true; iosEditsSeek(e.touches[0].clientX); }, { passive: true });
  window.addEventListener('mousemove', (e) => { if (iosEditsDragging) iosEditsSeek(e.clientX); });
  window.addEventListener('touchmove', (e) => { if (iosEditsDragging) iosEditsSeek(e.touches[0].clientX); }, { passive: true });
  window.addEventListener('mouseup', () => { iosEditsDragging = false; });
  window.addEventListener('touchend', () => { iosEditsDragging = false; });

  function iosCollectEdits() {
    const results = [];
    Object.keys(portfolioData).forEach(folderKey => {
      if (folderKey.startsWith('TOMIN INDEX.TXT')) return;
      if (folderKey === 'icons') return;
      const items = portfolioData[folderKey];
      if (!Array.isArray(items)) return;
      
      const videosByBase = {};
      items.forEach(item => {
        if (!item.isVideo) return;
        const nameNoExt = item.name.replace(/\.[^/.]+$/, '');
        const digitCount = (nameNoExt.match(/\d/g) || []).length;
        if (digitCount > 3) return;
        
        const baseName = nameNoExt.replace(/_(web|compressed)$/i, '').trim();
        if (!videosByBase[baseName]) videosByBase[baseName] = {};
        
        if (nameNoExt.endsWith('_web')) {
          videosByBase[baseName].web = { ...item, folder: folderKey };
        } else if (nameNoExt.endsWith('_compressed')) {
          videosByBase[baseName].compressed = { ...item, folder: folderKey };
        } else {
          videosByBase[baseName].original = { ...item, folder: folderKey };
        }
      });
      
      Object.values(videosByBase).forEach(versions => {
        results.push(versions.web || versions.compressed || versions.original);
      });
    });
    return results;
  }

  // Attach beachball to iOS edits video player
  const iosEditsVideoContainer = iosEditsVideo.parentElement;
  const iosEditsBB = attachBeachball(iosEditsVideo, iosEditsVideoContainer);

  function iosSelectEdit(index, autoPlay = true) {
    if (index < 0 || index >= iosEditsItems.length) return;
    const item = iosEditsItems[index];
    pushItemURL(item.folder, null, item.name);
    window.umami?.track('item-open', { folder: item.folder, item: item.name });
    iosEditsVideo.src = item.src;
    iosEditsBB.hide();
    if (autoPlay) {
      iosEditsBB.show();
      killOtherVideos(iosEditsVideo);
      safePlayVideo(iosEditsVideo);
    }

    // Update highlight
    iosEditsList.querySelectorAll('.ios-edit-row').forEach((r, i) => {
      if (i === index) {
        r.style.background = 'var(--ios-list-hover)';
        r.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else {
        r.style.background = 'transparent';
      }
    });
  }

  function iosRenderEditsList() {
    iosEditsList.innerHTML = '';
    iosEditsItems.forEach((item, i) => {
      const nameNoExt = item.name.replace(/\.[^/.]+$/, '');
      const row = document.createElement('div');
      row.className = 'ios-edit-row';
      row.style.cssText = 'padding:14px 20px; cursor:pointer; color:var(--ios-text); font-size:15px; font-weight:400; border-bottom:1px solid var(--ios-list-border); -webkit-tap-highlight-color:transparent; display:flex; align-items:center; gap:10px;';
      const label = document.createElement('span');
      label.textContent = nameNoExt;
      label.style.cssText = 'flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';
      row.appendChild(label);
      if (isItemRecent(item)) {
        const pill = document.createElement('span');
        pill.textContent = 'NEU';
        pill.style.cssText = 'background:rgba(255,69,58,0.95); color:#fff; font-size:9px; font-weight:700; letter-spacing:0.04em; padding:3px 7px; border-radius:999px; flex-shrink:0;';
        row.appendChild(pill);
      }
      row.addEventListener('click', () => iosSelectEdit(i));
      iosEditsList.appendChild(row);
    });
  }

  window.iosOpenEdits = function (event) {
    const iconEl = event ? event.currentTarget : null;
    setThemeColorForApp();
    iosEditsItems = iosCollectEdits();
    iosRenderEditsList();
    iosEditsVideo.src = '';

    iosEditsApp.classList.remove('closing');
    performIosAppTransition(iosEditsApp, iconEl, true);

    // Auto-select first edit directly (no setTimeout = stays in user gesture context)
    iosSelectEdit(0, true);
  };

  window.iosCloseEdits = function () {
    setThemeColorForScreen();
    iosEditsApp.classList.add('closing');
    iosEditsVideo.pause();
    iosEditsVideo.src = '';
    popURLToRoot();
    performIosAppTransition(iosEditsApp, null, false);
    setTimeout(() => {
      iosEditsApp.style.display = 'none';
      iosEditsApp.classList.remove('closing');
      // Animate the portfolio route only once the user is actually back on home.
      if (window.ilaVisit) window.ilaVisit('edits');
    }, 300);
  };

  // ---- iOS Theme ----
  // Update the Safari status bar color
  window._iosDark = false;
  function setThemeColor(color) {
    document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.content = color);
  }
  function setThemeColorForScreen() {
    setThemeColor(window._iosDark ? '#000000' : '#ffffff');
  }
  function setThemeColorForApp() {
    setThemeColor(window._iosDark ? '#1c1c1e' : '#f2f2f7');
  }

  function applyIosTheme(isDark) {
    window._iosDark = isDark;
    const html = document.documentElement;
    
    // Synchronize with Tailwind and other global styles
    if (isDark) {
      html.classList.add('dark');
      html.classList.add('ios-dark');
      html.classList.remove('light');
      document.body.classList.add('ios-dark');
    } else {
      html.classList.remove('dark');
      html.classList.remove('ios-dark');
      html.classList.add('light');
      document.body.classList.remove('ios-dark');
    }

    // Update the manifest dynamically so the splash screen matches on next launch
    // Note: This only affects "Add to Home Screen" or future background updates.
    try {
      const manifestLink = document.getElementById('pwa-manifest');
      if (manifestLink && window.__appIcons) {
        const choice = window.__appIconChoice || 'default';
        const cfg = window.__appIcons[choice];
        const pwaColor = isDark ? '#000000' : '#ffffff';
        const manifest = {
          name: cfg.name, short_name: cfg.name,
          description: "Shouli's creative portfolio",
          start_url: '.', scope: '/', display: 'standalone',
          orientation: 'portrait', 
          background_color: pwaColor, 
          theme_color: pwaColor,
          icons: [
            { src: cfg.src, sizes: '256x256', type: 'image/png', purpose: 'any' },
            { src: cfg.src, sizes: '256x256', type: 'image/png', purpose: 'maskable' }
          ]
        };
        manifestLink.href = 'data:application/json,' + encodeURIComponent(JSON.stringify(manifest));
      }
    } catch(e) {}

    // Also keep #ios-screen in sync for the dock
    const screen = document.getElementById('ios-screen');
    if (screen) {
      screen.style.background = isDark ? '#000000' : '#ffffff';
    }
    // Update status bar color (check if any app is open)
    const anyAppOpen = document.querySelector('.ios-app-overlay[style*="display: flex"], .ios-app-overlay[style*="display:flex"]');
    if (anyAppOpen) { setThemeColorForApp(); } else { setThemeColorForScreen(); }
    // Update theme toggle buttons
    const autoBtn = document.getElementById('ios-theme-auto');
    const lightBtn = document.getElementById('ios-theme-light');
    const darkBtn = document.getElementById('ios-theme-dark');
    if (!autoBtn) return;
    const stored = localStorage.getItem('ios-theme') || 'auto';
    [autoBtn, lightBtn, darkBtn].forEach(btn => {
      btn.style.background = 'transparent';
      btn.style.color = 'var(--ios-segmented-inactive-text)';
      btn.style.borderRadius = '7px';
      btn.style.boxShadow = 'none';
    });
    const activeBtn = stored === 'auto' ? autoBtn : stored === 'light' ? lightBtn : darkBtn;
    activeBtn.style.background = 'var(--ios-segmented-active)';
    activeBtn.style.color = 'var(--ios-segmented-active-text)';
    activeBtn.style.borderRadius = '7px';
    activeBtn.style.boxShadow = isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.12)';
  }

  function getSystemDark() {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  // Fiona palette toggle (mobile equivalent of the desktop View → Theme menu)
  const fionaBtn = document.getElementById('ios-fiona-toggle');
  const fionaKnob = document.getElementById('ios-fiona-knob');
  window.updateIosFionaToggle = function () {
    if (!fionaBtn || !fionaKnob) return;
    const on = document.documentElement.classList.contains('theme-pink');
    fionaBtn.setAttribute('aria-checked', on ? 'true' : 'false');
    fionaBtn.style.background = on ? '#ff3d8b' : 'rgba(120,120,128,0.32)';
    fionaKnob.style.transform = on ? 'translateX(20px)' : 'translateX(0)';
  };
  if (fionaBtn) {
    fionaBtn.addEventListener('click', () => {
      const on = document.documentElement.classList.contains('theme-pink');
      window.setTheme(on ? 'default' : 'pink');
    });
    window.updateIosFionaToggle();
  }

  window.setIosTheme = function (mode) {
    localStorage.setItem('ios-theme', mode);
    if (mode === 'auto') {
      applyIosTheme(getSystemDark());
    } else {
      applyIosTheme(mode === 'dark');
    }
  };

  // Initialize theme
  (function () {
    const stored = localStorage.getItem('ios-theme') || 'auto';
    if (stored === 'auto') {
      applyIosTheme(getSystemDark());
    } else {
      applyIosTheme(stored === 'dark');
    }
    // Listen for system changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      const stored = localStorage.getItem('ios-theme') || 'auto';
      if (stored === 'auto') applyIosTheme(e.matches);
    });
  })();

  // ---- App Icon Picker ----
  // Persist the chosen icon and reload so the inline <head> script can
  // re-render the manifest before Safari parses it. This is the only
  // reliable way to make iOS Safari pick up a new "Add to Home Screen"
  // name — mutating tags after load doesn't work.
  window.setAppIcon = function (src) {
    const srcLower = src.toLowerCase();
    let choice = 'default';
    if (srcLower.includes('mugeddie')) choice = 'eddie';
    else if (srcLower.includes('instagram')) choice = 'instagram';
    try { localStorage.setItem('app-icon-choice', choice); } catch (e) { }
    try { sessionStorage.setItem('reopen-contact-app', 'icon-picker'); } catch (e) { }
    window.location.reload();
  };

  // After a forced reload (icon change, push permission grant), reopen
  // the Contact app and scroll to the relevant section so the user
  // immediately sees the result of their action.
  (function () {
    let target = null;
    try { target = sessionStorage.getItem('reopen-contact-app'); } catch (e) { }
    if (!target) return;
    try { sessionStorage.removeItem('reopen-contact-app'); } catch (e) { }
    const SECTION_BY_TARGET = {
      'icon-picker': 'ios-app-icon-section',
      'push-grant': 'ios-push-toggle'
    };
    const sectionId = SECTION_BY_TARGET[target];
    // Defer until after the rest of app.js has run (iosOpenContact is
    // assigned further down) and the page has fully loaded. Click the dock
    // entry rather than calling iosOpenContact() directly so the icon
    // element is wired up for the view-transition.
    window.addEventListener('load', () => {
      const dockBtn = document.querySelector('.ios-dock-item[data-ios-app="contact"]');
      if (dockBtn) {
        dockBtn.click();
        if (sectionId) {
          setTimeout(() => {
            const section = document.getElementById(sectionId);
            if (section) section.scrollIntoView({ block: 'center' });
          }, 350);
        }
      }
    }, { once: true });
  })();

  // Mark the active icon in the picker on load.
  (function () {
    const choice = window.__appIconChoice || 'default';
    const choiceToSelector = {
      default: '.icon-pick-option:nth-child(1)',
      eddie: '.icon-pick-option:nth-child(2)',
      instagram: '.icon-pick-option:nth-child(3)'
    };
    const apply = () => {
      document.querySelectorAll('.icon-pick-option').forEach(opt => {
        const img = opt.querySelector('img');
        if (img) img.style.border = '3px solid transparent';
        const check = opt.querySelector('.icon-pick-check');
        if (check) check.remove();
      });
      const el = document.querySelector(choiceToSelector[choice]);
      if (!el) return;
      const img = el.querySelector('img');
      if (img) img.style.border = '3px solid #0a84ff';
      if (!el.querySelector('.icon-pick-check')) {
        const check = document.createElement('span');
        check.className = 'icon-pick-check';
        check.style.cssText = 'position:absolute; bottom:-2px; right:-2px; width:20px; height:20px; background:#0a84ff; border-radius:50%; display:flex; align-items:center; justify-content:center;';
        check.innerHTML = '<span class="material-symbols-rounded" style="font-size:14px; color:#fff;">check</span>';
        el.appendChild(check);
      }
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', apply, { once: true });
    } else {
      apply();
    }
  })();

  // ---- iOS Contact App ----
  const iosContactApp = document.getElementById('ios-contact-app');


  // Dominant-color extraction from the contact photo (Apple Music /
  // Spotify Now Playing-style tinted backdrop). Samples pixels, weights
  // by saturation so muddy greys/near-blacks don't dominate. Computed
  // once on first open and cached.
  let iosContactTintCached = null;
  async function iosContactComputeTint() {
    if (iosContactTintCached) return iosContactTintCached;
    const img = document.getElementById('ios-contact-photo');
    if (!img) return null;
    try {
      if (!img.complete) await new Promise(r => { img.onload = r; img.onerror = r; });
      const canvas = document.createElement('canvas');
      canvas.width = 48; canvas.height = 48;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, 48, 48);
      const data = ctx.getImageData(0, 0, 48, 48).data;
      let rT = 0, gT = 0, bT = 0, wT = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
        if (a < 200) continue;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const lum = (max + min) / 2;
        const sat = (max === min) ? 0
          : (lum < 128 ? (max - min) / (max + min) : (max - min) / (510 - max - min));
        // Weight favours saturated + mid-lightness pixels, but with a
        // small baseline so the natural (warm) skin tones still carry
        // weight and the result doesn't swing to whatever small patch
        // happens to be most saturated.
        const w = sat * (1 - Math.abs(lum - 128) / 128) + 0.02;
        rT += r * w; gT += g * w; bT += b * w; wT += w;
      }
      if (wT < 0.001) return null;
      const r = Math.round(rT / wT), g = Math.round(gT / wT), b = Math.round(bT / wT);
      iosContactTintCached = { r, g, b };
      return iosContactTintCached;
    } catch (e) {
      console.warn('Contact tint extraction failed', e);
      return null;
    }
  }

  async function iosContactApplyTint() {
    const tint = await iosContactComputeTint();
    if (!tint) return;
    const { r, g, b } = tint;
    const top = `rgb(${Math.round(r * 0.85)}, ${Math.round(g * 0.85)}, ${Math.round(b * 0.85)})`;
    const mid = `rgb(${Math.round(r * 0.5)}, ${Math.round(g * 0.5)}, ${Math.round(b * 0.5)})`;
    const bot = `rgb(${Math.round(r * 0.22)}, ${Math.round(g * 0.22)}, ${Math.round(b * 0.22)})`;
    iosContactApp.style.background =
      `linear-gradient(180deg, ${top} 0%, ${mid} 55%, ${bot} 100%)`;
  }

  // Precompute on load so first open has the tint already applied.
  iosContactApplyTint();

  window.iosOpenContact = function (event) {
    const iconEl = event ? event.currentTarget : null;
    setThemeColorForApp();
    iosContactApplyTint();
    iosContactApp.classList.remove('closing');
    performIosAppTransition(iosContactApp, iconEl, true);
  };

  window.iosCloseContact = function () {
    setThemeColorForScreen();
    iosContactApp.classList.add('closing');
    performIosAppTransition(iosContactApp, null, false);
    setTimeout(() => {
      iosContactApp.style.display = 'none';
      iosContactApp.classList.remove('closing');
    }, 300);
  };



  // ---- iOS BTS App ----
  const iosBtsApp = document.getElementById('ios-bts-app');
  const iosBtsFolderList = document.getElementById('ios-bts-folder-list');
  const iosBtsScreenFolders = document.getElementById('ios-bts-screen-folders');
  const iosBtsScreenFiles = document.getElementById('ios-bts-screen-files');
  const iosBtsFolderTitle = document.getElementById('ios-bts-folder-title');
  const iosBtsFileGrid = document.getElementById('ios-bts-file-grid');
  const iosBtsViewer = document.getElementById('ios-bts-viewer');
  const iosBtsViewerPages = document.getElementById('ios-bts-viewer-pages');
  const iosBtsViewerCounter = document.getElementById('ios-bts-viewer-counter');
  const iosBtsViewerProgress = document.getElementById('ios-bts-viewer-progress');
  const iosBtsViewerTitle = document.getElementById('ios-bts-viewer-title');

  let iosBtsCurrentFiles = [];

  function iosBtsCollectFolders() {
    const folders = [];
    Object.keys(portfolioData).forEach(key => {
      if (key.includes('/')) return;
      if (key.startsWith('TOMIN INDEX.TXT')) return;
      const items = portfolioData[key];
      if (!Array.isArray(items)) return;
      const btsFiles = items.filter(item => {
        const nameNoExt = item.name.replace(/\.[^/.]+$/, '');
        const digitCount = (nameNoExt.match(/\d/g) || []).length;
        return digitCount >= 4 && !item.isMagazine;
      });
      if (btsFiles.length > 0) {
        folders.push({ name: key, count: btsFiles.length });
      }
    });
    return folders;
  }

  function iosBtsCollectFiles(folderName) {
    const items = portfolioData[folderName] || [];
    return items.filter(item => {
      const nameNoExt = item.name.replace(/\.[^/.]+$/, '');
      const digitCount = (nameNoExt.match(/\d/g) || []).length;
      return digitCount >= 4 && !item.isMagazine;
    });
  }

  window.iosOpenBts = function (event) {
    const iconEl = event ? event.currentTarget : null;
    setThemeColorForApp();
    const folders = iosBtsCollectFolders();
    iosBtsFolderList.innerHTML = folders.length === 0
      ? '<div style="text-align:center;padding-top:80px;color:var(--ios-text-secondary);font-size:14px;">No folders found</div>'
      : folders.map(f => `
        <div onclick="iosBtsTapFolder('${f.name.replace(/'/g, "\\'")}')"
          style="display:flex; align-items:center; padding:12px 0; border-bottom:1px solid var(--ios-list-border); cursor:pointer; -webkit-tap-highlight-color:transparent;">
          <img src="icons/folder.png" style="width:44px; height:44px; object-fit:contain; margin-right:12px; flex-shrink:0;" />
          <div style="flex:1; min-width:0;">
            <p style="color:var(--ios-text); font-size:15px; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${f.name}</p>
            <p style="color:var(--ios-text-secondary); font-size:13px;">${f.count} items</p>
          </div>
          <span class="material-symbols-rounded" style="color:var(--ios-text-secondary); font-size:20px;">chevron_right</span>
        </div>
      `).join('');

    iosBtsScreenFolders.style.display = '';
    iosBtsScreenFiles.style.display = 'none';
    iosBtsViewer.style.display = 'none';

    iosBtsApp.classList.remove('closing');
    performIosAppTransition(iosBtsApp, iconEl, true);
  };

  window.iosCloseBts = function () {
    setThemeColorForScreen();
    iosBtsApp.classList.add('closing');
    performIosAppTransition(iosBtsApp, null, false);
    setTimeout(() => {
      iosBtsApp.style.display = 'none';
      iosBtsApp.classList.remove('closing');
      iosBtsScreenFiles.style.display = 'none';
      iosBtsViewer.style.display = 'none';
      // Animate the portfolio route only once the user is actually back on home.
      if (window.ilaVisit) window.ilaVisit('bts');
    }, 300);
  };

  window.iosBtsTapFolder = function (folderName) {
    pushFolderURL(folderName);
    window.umami?.track('folder-open', { folder: folderName });
    iosBtsCurrentFiles = iosBtsCollectFiles(folderName);
    iosBtsFolderTitle.textContent = folderName;
    if (iosBtsViewerTitle) iosBtsViewerTitle.textContent = folderName;

    iosBtsFileGrid.innerHTML = iosBtsCurrentFiles.map((f, i) =>
      f.isVideo
        ? `<div onclick="iosBtsOpenViewer(${i})" style="aspect-ratio:1;overflow:hidden;cursor:pointer;-webkit-tap-highlight-color:transparent;background:#111;">
            <video src="${f.src}" style="width:100%;height:100%;object-fit:cover;" muted playsinline preload="none"></video>
          </div>`
        : `<div onclick="iosBtsOpenViewer(${i})" style="aspect-ratio:1;overflow:hidden;cursor:pointer;-webkit-tap-highlight-color:transparent;background:#111;">
            <img src="${f.src}" style="width:100%;height:100%;object-fit:cover;" />
          </div>`
    ).join('');

    // Push transition
    iosBtsScreenFiles.style.display = 'flex';
    iosBtsScreenFiles.style.transform = 'translateX(100%)';
    iosBtsScreenFolders.style.transition = 'transform 0.35s cubic-bezier(0.25,1,0.5,1), opacity 0.35s ease';
    iosBtsScreenFiles.style.transition = 'transform 0.35s cubic-bezier(0.25,1,0.5,1)';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      iosBtsScreenFolders.style.transform = 'translateX(-30%)';
      iosBtsScreenFolders.style.opacity = '0.4';
      iosBtsScreenFiles.style.transform = 'translateX(0)';
    }));
  };

  // ---- Mobile deep-link entry: route a shared /projects/<folder>/<item>
  // URL into the right iOS app (magazine / edits / BTS) and navigate to
  // the exact item, so the recipient lands on the content directly. ----
  window.iosOpenItem = function (folder, indexWithinFolder) {
    const items = portfolioData[folder] || [];
    const item = items[indexWithinFolder];
    if (!item) return;

    const isMagazine = !!portfolioData[folder + '/' + item.name];
    if (isMagazine) {
      window.iosOpenMagazines && window.iosOpenMagazines();
      setTimeout(() => window.iosTapMagazine && window.iosTapMagazine(folder, indexWithinFolder), 350);
      return;
    }

    // Try the curated Edits flat list first (videos with low digit count).
    if (item.isVideo) {
      const edits = iosCollectEdits();
      const editIdx = edits.findIndex((e) => e.folder === folder && e.name === item.name);
      if (editIdx >= 0) {
        window.iosOpenEdits && window.iosOpenEdits();
        setTimeout(() => iosSelectEdit(editIdx, true), 400);
        return;
      }
    }

    // Fallback: BTS app — drill into folder + open viewer at the matching tile.
    const btsFiles = iosBtsCollectFiles(folder);
    const btsIdx = btsFiles.findIndex((f) => f.name === item.name);
    if (btsIdx < 0) {
      // Last resort: just open the BTS folder so something happens.
      window.iosOpenBts && window.iosOpenBts();
      setTimeout(() => window.iosBtsTapFolder && window.iosBtsTapFolder(folder), 350);
      return;
    }
    window.iosOpenBts && window.iosOpenBts();
    setTimeout(() => {
      window.iosBtsTapFolder && window.iosBtsTapFolder(folder);
      setTimeout(() => window.iosBtsOpenViewer && window.iosBtsOpenViewer(btsIdx), 380);
    }, 350);
  };

  window.iosOpenFolder = function (folder) {
    if (!portfolioData[folder]) return;
    window.iosOpenBts && window.iosOpenBts();
    setTimeout(() => window.iosBtsTapFolder && window.iosBtsTapFolder(folder), 350);
  };

  window.iosBtsBackToFolders = function () {
    iosBtsScreenFolders.style.transform = 'translateX(0)';
    iosBtsScreenFolders.style.opacity = '1';
    iosBtsScreenFiles.style.transform = 'translateX(100%)';
    popURLToRoot();
    setTimeout(() => { iosBtsScreenFiles.style.display = 'none'; }, 350);
  };

  window.iosBtsOpenViewer = function (index) {
    iosBtsViewer.style.display = 'flex';

    iosBtsViewerPages.innerHTML = iosBtsCurrentFiles.map((f) => {
      const pageStyle = 'flex:0 0 100vw; width:100vw; min-width:100vw; height:100%; scroll-snap-align:start; display:flex; align-items:center; justify-content:center; overflow:hidden; background:transparent;';
      if (f.isVideo) {
        return `<div style="${pageStyle}"><video src="${f.src}" style="width:100%;height:100%;object-fit:contain;" loop playsinline preload="none"></video></div>`;
      } else {
        return `<div style="${pageStyle}"><img src="${f.src}" style="max-width:100%;max-height:100%;object-fit:contain;" /></div>`;
      }
    }).join('');

    // Scroll to selected
    requestAnimationFrame(() => {
      iosBtsViewerPages.scrollLeft = index * iosBtsViewerPages.clientWidth;
      iosBtsUpdateViewerCounter();
    });

    // Seamless video loop + play only visible video (others unloaded)
    const vids = iosBtsViewerPages.querySelectorAll('video');
    const vidSrcs = Array.from(vids).map(v => v.src);
    vids.forEach(v => {
      v.removeAttribute('src');
      v.addEventListener('timeupdate', () => {
        if (v.duration && v.currentTime > v.duration - 0.08) { v.currentTime = 0; v.play(); }
      });
    });
    function playVisible() {
      const w = iosBtsViewerPages.clientWidth;
      const ci = Math.round(iosBtsViewerPages.scrollLeft / w);
      vids.forEach((v, vi) => {
        const pi = Array.from(iosBtsViewerPages.children).indexOf(v.closest('div'));
        if (pi === ci) {
          if (!v.src) { v.src = vidSrcs[vi]; }
          safePlayVideo(v);
        } else {
          v.pause();
          if (v.src) { v.removeAttribute('src'); v.load(); }
        }
      });
    }
    iosBtsViewerPages.addEventListener('scroll', playVisible);
    setTimeout(playVisible, 100);
  };

  function iosBtsUpdateViewerCounter() {
    const w = iosBtsViewerPages.clientWidth;
    if (!w) return;
    const total = iosBtsCurrentFiles.length;
    const current = Math.round(iosBtsViewerPages.scrollLeft / w) + 1;
    iosBtsViewerCounter.textContent = current + ' / ' + total;
    if (iosBtsViewerProgress && total > 1) {
      iosBtsViewerProgress.style.width = ((current - 1) / (total - 1) * 100) + '%';
    }
  }
  iosBtsViewerPages.addEventListener('scroll', iosBtsUpdateViewerCounter);

  window.iosBtsCloseViewer = function () {
    iosBtsViewer.style.display = 'none';
    iosBtsViewerPages.innerHTML = '';
  };


})();
