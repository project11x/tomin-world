      // Prepend R2 base URL to all src values when running in production
      (function () {
        const BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
          ? ''
          : 'https://pub-859f13be44eb4577b0cb23c8d8440a59.r2.dev/';
        if (BASE_URL) {
          Object.keys(portfolioData).forEach(key => {
            portfolioData[key].forEach(item => {
              if (item.src) item.src = BASE_URL + item.src;
            });
          });
        }
      })();

    // --- Pinch-to-Zoom for image viewers ---
    function addPinchZoom(imgEl) {
      let scale = 1, tx = 0, ty = 0;
      let initDist = 0, initScale = 1;
      let initX = 0, initY = 0, initTx = 0, initTy = 0;
      let pinching = false;
      let lastTap = 0;

      function clamp(s, x, y) {
        const hw = imgEl.offsetWidth * (s - 1) / 2;
        const hh = imgEl.offsetHeight * (s - 1) / 2;
        return { x: Math.max(-hw, Math.min(hw, x)), y: Math.max(-hh, Math.min(hh, y)) };
      }

      function applyTransform(anim) {
        imgEl.style.transition = anim ? 'transform 0.25s ease' : 'none';
        imgEl.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
      }

      function resetZoom(anim) {
        scale = 1; tx = 0; ty = 0;
        applyTransform(anim);
      }

      imgEl.addEventListener('touchstart', e => {
        if (e.touches.length === 2) {
          pinching = true;
          initDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
          initScale = scale;
          e.preventDefault();
        } else if (e.touches.length === 1 && scale > 1) {
          initX = e.touches[0].clientX; initY = e.touches[0].clientY;
          initTx = tx; initTy = ty;
          e.preventDefault();
        }
      }, { passive: false });

      imgEl.addEventListener('touchmove', e => {
        if (e.touches.length === 2 && pinching) {
          const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
          scale = Math.min(5, Math.max(1, initScale * dist / initDist));
          const c = clamp(scale, tx, ty);
          tx = c.x; ty = c.y;
          applyTransform(false);
          e.preventDefault();
        } else if (e.touches.length === 1 && scale > 1) {
          const c = clamp(scale, initTx + (e.touches[0].clientX - initX), initTy + (e.touches[0].clientY - initY));
          tx = c.x; ty = c.y;
          applyTransform(false);
          e.preventDefault();
        }
      }, { passive: false });

      imgEl.addEventListener('touchend', e => {
        if (e.touches.length < 2) pinching = false;
        if (scale < 1.05) resetZoom(true);
        const now = Date.now();
        if (now - lastTap < 300) resetZoom(true);
        lastTap = now;
      });
    }

    // --- Video Playback Buffer Manager ---
    // Ensures smooth video playback: waits for enough buffer before playing,
    // auto-pauses if buffer runs low, resumes when buffered enough.
    function safePlayVideo(video) {
      if (!video || !video.src) return;
      // Remove any previous listeners from this system
      if (video._bufferCleanup) video._bufferCleanup();

      let waitingTimer = null;
      const BUFFER_RESUME = 3; // seconds of buffer needed to resume

      function getBufferAhead() {
        for (let i = 0; i < video.buffered.length; i++) {
          if (video.buffered.start(i) <= video.currentTime && video.buffered.end(i) > video.currentTime) {
            return video.buffered.end(i) - video.currentTime;
          }
        }
        return 0;
      }

      function onWaiting() {
        // Video stalled — wait for enough buffer then resume
        if (waitingTimer) return;
        waitingTimer = setInterval(() => {
          if (getBufferAhead() >= BUFFER_RESUME) {
            clearInterval(waitingTimer);
            waitingTimer = null;
            video.play().catch(() => { });
          }
        }, 300);
      }

      function onCanPlayThrough() {
        if (waitingTimer) {
          clearInterval(waitingTimer);
          waitingTimer = null;
        }
      }

      video.addEventListener('waiting', onWaiting);
      video.addEventListener('canplaythrough', onCanPlayThrough);

      video._bufferCleanup = () => {
        video.removeEventListener('waiting', onWaiting);
        video.removeEventListener('canplaythrough', onCanPlayThrough);
        if (waitingTimer) { clearInterval(waitingTimer); waitingTimer = null; }
      };

      // Ensure loading has started (needed when preload="none" and src was set without load())
      if (video.networkState === 0 || video.networkState === 1) {
        video.load();
      }
      // Start playing
      video.play().catch(() => { });
    }

    // Kill all other video downloads to free bandwidth for the active video
    function killOtherVideos(activeVideo) {
      document.querySelectorAll('video').forEach(v => {
        if (v !== activeVideo && v.src && !v.closest('.mag-page-container') && !v.muted) {
          v.pause();
          v.removeAttribute('src');
          v.load(); // releases network connection
        }
      });
    }

    // Beachball loader: attach to any video element, shows while buffering
    const BEACHBALL_SVG = `<svg width="40" height="40" viewBox="0.5 0.5 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style="animation:beachball-spin 1s linear infinite; will-change:transform; display:block;"><g><path d="M12.046 7.54443C12.8194 7.64041 13.5869 7.88962 14.3043 8.30383C17.1741 9.96068 18.1573 13.6302 16.5005 16.5C14.8436 13.6302 11.1741 12.647 8.3043 14.3038C7.58791 14.7174 6.98908 15.2565 6.51953 15.8772C6.74422 12.2205 8.934 9.09532 12.046 7.54443Z" fill="url(#bb_g0)"/><path d="M6.51908 15.8772C6.98862 15.2565 7.58745 14.7175 8.30385 14.3039C11.1736 12.647 14.8431 13.6303 16.5 16.5C13.1863 16.5 10.5 19.1863 10.5 22.5C10.5 23.3277 10.6676 24.1163 10.9707 24.8336C8.27601 23.0421 6.5 19.9785 6.5 16.5C6.5 16.2909 6.50642 16.0832 6.51908 15.8772Z" fill="url(#bb_g1)"/><path d="M10.9707 24.8336C10.6676 24.1163 10.5 23.3277 10.5 22.5C10.5 19.1863 13.1863 16.5 16.5 16.5C14.8431 19.3698 15.8264 23.0393 18.6962 24.6962C19.4136 25.1104 20.181 25.3596 20.9545 25.4555C19.6131 26.124 18.1005 26.5 16.5 26.5C14.4556 26.5 12.5545 25.8865 10.9707 24.8336Z" fill="url(#bb_g2)"/><path d="M20.9546 25.4555C20.1812 25.3596 19.4137 25.1104 18.6963 24.6962C15.8266 23.0393 14.8433 19.3698 16.5002 16.5C18.157 19.3698 21.8266 20.353 24.6963 18.6962C25.4127 18.2825 26.0115 17.7435 26.4811 17.1228C26.2564 20.7794 24.0666 23.9047 20.9546 25.4555Z" fill="url(#bb_g3)"/><path d="M26.4809 17.1229C26.0114 17.7436 25.4125 18.2826 24.6962 18.6962C21.8264 20.3531 18.1569 19.3698 16.5 16.5001C19.8137 16.5001 22.5 13.8138 22.5 10.5001C22.5 9.67238 22.3324 8.88383 22.0293 8.1665C24.724 9.95801 26.5 13.0216 26.5 16.5001C26.5 16.7092 26.4936 16.9169 26.4809 17.1229Z" fill="url(#bb_g4)"/><path d="M22.0306 8.16642C22.3337 8.88375 22.5013 9.6723 22.5013 10.5C22.5013 13.8137 19.8151 16.5 16.5013 16.5C18.1582 13.6302 17.1749 9.9607 14.3052 8.30385C13.5878 7.88964 12.8203 7.64043 12.0469 7.54445C13.3882 6.87599 14.9009 6.5 16.5013 6.5C18.5457 6.5 20.4469 7.11349 22.0306 8.16642Z" fill="url(#bb_g5)"/></g><defs><linearGradient id="bb_g0" x1="6.52" y1="7.54" x2="6.52" y2="16.5" gradientUnits="userSpaceOnUse"><stop stop-color="#FFD305"/><stop offset="1" stop-color="#FDCF01"/></linearGradient><linearGradient id="bb_g1" x1="6.5" y1="13.5" x2="6.5" y2="24.83" gradientUnits="userSpaceOnUse"><stop stop-color="#52CF30"/><stop offset="1" stop-color="#3BBD1C"/></linearGradient><linearGradient id="bb_g2" x1="10.5" y1="16.5" x2="10.5" y2="26.5" gradientUnits="userSpaceOnUse"><stop stop-color="#14ADF6"/><stop offset="1" stop-color="#1191F4"/></linearGradient><linearGradient id="bb_g3" x1="15.7" y1="16.5" x2="15.7" y2="25.46" gradientUnits="userSpaceOnUse"><stop stop-color="#CA70E1"/><stop offset="1" stop-color="#B452CB"/></linearGradient><linearGradient id="bb_g4" x1="16.5" y1="8.17" x2="16.5" y2="19.5" gradientUnits="userSpaceOnUse"><stop stop-color="#FF645D"/><stop offset="1" stop-color="#FF4332"/></linearGradient><linearGradient id="bb_g5" x1="12.05" y1="6.5" x2="12.05" y2="16.5" gradientUnits="userSpaceOnUse"><stop stop-color="#FBB114"/><stop offset="1" stop-color="#FF9508"/></linearGradient></defs></svg>`;

    function attachBeachball(video, container) {
      // Remove existing
      const existing = container.querySelector('.beachball-overlay');
      if (existing) existing.remove();
      const overlay = document.createElement('div');
      overlay.className = 'beachball-overlay';
      overlay.style.cssText = 'display:none; position:absolute; inset:0; align-items:center; justify-content:center; pointer-events:none; z-index:5;';
      overlay.innerHTML = BEACHBALL_SVG;
      container.style.position = 'relative';
      container.appendChild(overlay);
      const show = () => { overlay.style.display = 'flex'; };
      const hide = () => { overlay.style.display = 'none'; };
      video.addEventListener('waiting', show);
      video.addEventListener('playing', hide);
      video.addEventListener('canplay', hide);
      video.addEventListener('pause', hide);
      // Clean up old listeners on next call
      video._bbCleanup && video._bbCleanup();
      video._bbCleanup = () => {
        video.removeEventListener('waiting', show);
        video.removeEventListener('playing', hide);
        video.removeEventListener('canplay', hide);
        video.removeEventListener('pause', hide);
      };
      return { show, hide };
    }

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
          let level = Math.round(battery.level * 100);
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

    function checkOrientation() {
      const guard = document.querySelector('.ios-only-portrait-guard');
      if (!guard) return;
      // Show guard only on smaller screens (mobile/tablet) in landscape
      const isLandscape = window.innerWidth > window.innerHeight && window.innerWidth < 1024;
      if (isLandscape) {
        guard.classList.remove('hidden');
        guard.classList.add('flex');
      } else {
        guard.classList.add('hidden');
        guard.classList.remove('flex');
      }
    }
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);
    checkOrientation();

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

    // Handle Edit menu explicitly if needed (currently hover)
    const editMenu = document.querySelector('.menu-item');
    if (editMenu) {
      editMenu.addEventListener('click', (e) => {
        // Allow clicking the text itself to toggle on mobile if needed.
      });
    }
    if (magThemeToggle) magThemeToggle.addEventListener('click', toggleTheme);

    // Dock toggle unified above

    window.openAboutMeModal = function () {
      const aboutModal = document.getElementById('about-me-modal');
      aboutModal.classList.remove('hidden');
      bringToFront(aboutModal);
    };

    document.getElementById('btn-close-about').onclick = () => {
      document.getElementById('about-me-modal').classList.add('hidden');
    };
    // --- Window Dragging Logic ---
    let highestZIndex = 50;
    function bringToFront(element) {
      if (!element) return;
      highestZIndex++;
      element.style.zIndex = highestZIndex;
    }
    const aboutModal = document.getElementById('about-me-modal');
    const quickLookModal = document.getElementById('quick-look-modal');
    const finderTemplate = document.getElementById('finder-window-template');
    let windowCount = 0;

    function createWindow(folderName) {
      if (!folderName || !portfolioData[folderName]) {
        // Fallback to first folder if key not found
        folderName = Object.keys(portfolioData).find(k => !k.includes('/')) || folderName;
      }

      windowCount++;
      const clone = finderTemplate.content.cloneNode(true);
      const win = clone.querySelector('.app-window');

      const id = `window-${windowCount}`;
      win.id = id;
      win.dataset.folder = folderName;
      win.dataset.viewMode = 'grid';
      win.style.display = 'flex';
      win.style.zIndex = ++highestZIndex;

      // Detect Mobile
      const isMobile = window.innerWidth <= 768;

      if (isMobile) {
        win.style.width = '100%';
        win.style.height = '100%';
        win.style.left = '0';
        win.style.top = '0';
        win.style.borderRadius = '0';
        win.style.margin = '0';
        win.style.transform = 'none';
      } else {
        // Stagger initial position
        const offset = (windowCount % 10) * 30;
        win.style.left = `calc(50% + ${offset}px - 480px)`;
        win.style.top = `calc(50% + ${offset}px - 310px)`;
        win.style.transform = 'none';
        win.classList.remove('left-1/2', 'top-1/2', '-translate-x-1/2', '-translate-y-1/2', 'transform');
      }

      // Initial Focus
      win.addEventListener('mousedown', () => bringToFront(win));

      // Drag Logic
      const handles = win.querySelectorAll('.draggable-handle');
      handles.forEach(handle => {
        handle.onmousedown = (e) => {
          if (isMobile) return; // No dragging on mobile
          if (e.target.closest('.cursor-pointer') || e.target.closest('.btn-close-window') || e.target.closest('.btn-fullscreen-window') || e.target.closest('.favorites-nav') || e.target.closest('button')) return;
          bringToFront(win);
          win.classList.add('dragging-window');
          const rect = win.getBoundingClientRect();
          const offX = e.clientX - rect.left;
          const offY = e.clientY - rect.top;

          const move = (ev) => {
            win.style.left = `${ev.clientX - offX}px`;
            win.style.top = `${ev.clientY - offY}px`;
          };
          const up = () => {
            win.classList.remove('dragging-window');
            window.removeEventListener('mousemove', move);
            window.removeEventListener('mouseup', up);
          };
          window.addEventListener('mousemove', move);
          window.addEventListener('mouseup', up);
        };
      });

      // UI setup
      win.querySelector('.btn-close-window').onclick = () => win.remove();
      win.querySelector('.btn-minimize-window').onclick = () => win.remove();
      win.querySelector('.btn-fullscreen-window').onclick = () => toggleFullscreen(win);

      const btnGrid = win.querySelector('#btn-view-grid');
      const btnList = win.querySelector('#btn-view-list');

      const updateViewTabs = () => {
        if (!btnGrid || !btnList) return;
        if (win.dataset.viewMode === 'grid') {
          btnGrid.classList.add('bg-white', 'dark:bg-slate-600', 'shadow-sm', 'text-primary', 'dark:text-white', 'rounded-md');
          btnGrid.classList.remove('text-slate-400', 'dark:text-slate-500');
          btnList.classList.remove('bg-white', 'dark:bg-slate-600', 'shadow-sm', 'text-primary', 'dark:text-white', 'rounded-md');
          btnList.classList.add('text-slate-400', 'dark:text-slate-500');
        } else {
          btnList.classList.add('bg-white', 'dark:bg-slate-600', 'shadow-sm', 'text-primary', 'dark:text-white', 'rounded-md');
          btnList.classList.remove('text-slate-400', 'dark:text-slate-500');
          btnGrid.classList.remove('bg-white', 'dark:bg-slate-600', 'shadow-sm', 'text-primary', 'dark:text-white', 'rounded-md');
          btnGrid.classList.add('text-slate-400', 'dark:text-slate-500');
        }
      };

      if (btnGrid) btnGrid.onclick = () => {
        win.dataset.viewMode = 'grid';
        updateViewTabs();
        renderFolderContent(win, win.dataset.folder);
      };
      if (btnList) btnList.onclick = () => {
        win.dataset.viewMode = 'list';
        updateViewTabs();
        renderFolderContent(win, win.dataset.folder);
      };

      // Inject Favorites
      const favNav = win.querySelector('.favorites-nav');
      Object.keys(portfolioData).forEach(key => {
        if (key.includes('/')) return;
        const a = document.createElement('a');
        a.className = "flex items-center space-x-2 px-2 py-1.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 rounded-md text-[12px] font-medium transition-colors cursor-pointer focus-nav-item select-none";
        a.innerHTML = `<span>${key}</span>`;
        if (key === folderName) a.classList.add('bg-primary/90', 'text-white');
        a.onclick = (e) => {
          e.stopPropagation();
          win.dataset.folder = key;
          renderFolderContent(win, key);
        };
        favNav.appendChild(a);
      });

      document.getElementById('desktop-main').appendChild(win);
      updateViewTabs();
      renderFolderContent(win, folderName);
      return win;
    }

    function renderFolderContent(win, folderName) {
      if (!win) return;

      const mainArea = win.querySelector('.finder-main-area');
      const title = win.querySelector('.finder-title');
      if (title) title.innerText = folderName;

      const viewMode = win.dataset.viewMode || 'grid';

      // Update fav selection 
      const favLinks = win.querySelectorAll('.favorites-nav a');
      favLinks.forEach(a => {
        if (a.innerText.trim() === folderName) {
          a.classList.add('bg-primary/90', 'text-white');
          a.classList.remove('text-slate-600', 'dark:text-slate-400');
        } else {
          a.classList.remove('bg-primary/90', 'text-white');
          a.classList.add('text-slate-600', 'dark:text-slate-400');
        }
      });

      const data = portfolioData[folderName] || [];
      // Sort data
      const sortedData = [...data].sort((a, b) => {
        if (a.isVideo && !b.isVideo) return -1;
        if (!a.isVideo && b.isVideo) return 1;
        return a.name.localeCompare(b.name);
      });

      if (sortedData.length === 0) {
        mainArea.innerHTML = `<div class="flex flex-col items-center justify-center h-full opacity-40">
          <span class="material-symbols-outlined text-6xl">folder_open</span>
          <p class="mt-2 text-sm font-medium">This folder is empty</p>
        </div>`;
        return;
      }

      if (viewMode === 'list') {
        let html = `
          <table class="w-full text-left text-[12px] border-collapse bg-transparent">
            <thead class="sticky top-0 bg-white/50 dark:bg-slate-900/80 backdrop-blur-md text-slate-500 font-medium border-b border-slate-200/20 dark:border-white/5 shadow-sm z-10 transition-colors duration-300">
              <tr>
                <th class="py-3 px-4 font-semibold w-1/2">Name</th>
                <th class="py-3 px-2 font-semibold">Type</th>
                <th class="py-3 px-2 font-semibold">Size</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100/10 dark:divide-slate-700/50">
        `;
        sortedData.forEach((item, index) => {
          let icon = 'image';
          if (item.isVideo) icon = 'movie';
          const clickAction = `handleItemClick('${folderName.replace(/'/g, "\\'")}', ${index}, event)`;
          html += `
            <tr class="group hover:bg-primary/10 dark:hover:bg-white/5 transition-colors cursor-pointer" onclick="${clickAction}">
              <td class="py-2 px-4 flex items-center space-x-2">
                <span class="material-symbols-outlined text-[14px] text-sky-500 bg-primary/20 p-0.5 rounded mr-2">${item.isVideo ? 'movie' : 'image'}</span>
                <span class="text-on-surface dark:text-slate-100 font-semibold group-hover:text-primary dark:group-hover:text-white transition-colors">${item.name}</span>
              </td>
              <td class="py-2 px-2 text-slate-500 dark:text-slate-400">${item.type}</td>
              <td class="py-2 px-2 text-slate-500 dark:text-slate-400">${item.size}</td>
            </tr>
          `;
        });
        html += `</tbody></table>`;
        mainArea.innerHTML = html;
      } else {
        let html = `<div class="p-6 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">`;
        sortedData.forEach((item, i) => {
          let thumb;
          if (item.isMagazine) {
            const magKey = folderName + '/' + item.name;
            const pages = portfolioData[magKey] || [];
            const cover = pages.find(p => !p.isVideo && p.src);
            thumb = cover
              ? `<img src="${cover.src}" class="w-full h-full object-cover" loading="lazy" style="pointer-events:none;" />`
              : `<div class="w-full h-full flex items-center justify-center bg-slate-200 dark:bg-slate-700"><span class="material-symbols-outlined text-slate-400 text-3xl" style="font-variation-settings:'FILL' 1;">auto_stories</span></div>`;
          } else if (item.isVideo) {
            thumb = `<video src="${item.src}" class="w-full h-full object-cover" muted preload="metadata" onloadedmetadata="this.currentTime=0.001" style="pointer-events:none;"></video>`;
          } else {
            thumb = `<img src="${item.src}" class="w-full h-full object-cover" loading="lazy" style="pointer-events:none;" />`;
          }
          html += `
            <div class="flex flex-col items-center group cursor-pointer" onclick="handleItemClick('${folderName.replace(/'/g, "\\'")}', ${i}, event)">
              <div class="w-20 h-20 mb-2 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 transition-all duration-200 group-hover:scale-105 group-hover:shadow-lg ring-2 ring-transparent group-hover:ring-primary/40">
                ${thumb}
              </div>
              <span class="text-[10px] text-center text-slate-700 dark:text-slate-300 font-medium break-all px-1 rounded group-hover:bg-primary group-hover:text-white transition-colors max-w-[80px] truncate">${item.name}</span>
            </div>
          `;
        });
        html += `</div>`;
        mainArea.innerHTML = html;
      }
    }

    // Generic Drag Logic for standalone windows (About, QuickLook)
    function makeDraggable(el, handleSelector) {
      const handles = el.querySelectorAll(handleSelector);
      if (handles.length === 0) {
        // If no handle selector found, use the element itself
        attachHandler(el, el);
        return;
      }
      handles.forEach(h => attachHandler(el, h));

      function attachHandler(targetEl, handle) {
        handle.onmousedown = (e) => {
          if (e.target.closest('.cursor-pointer') || e.target.closest('button') || e.target.closest('.btn-close-window')) return;
          bringToFront(targetEl);

          const rect = targetEl.getBoundingClientRect();
          targetEl.style.position = 'fixed';
          targetEl.style.left = rect.left + 'px';
          targetEl.style.top = rect.top + 'px';
          targetEl.style.transform = 'none';
          targetEl.style.margin = '0';
          targetEl.classList.remove('left-1/2', 'top-1/2', '-translate-x-1/2', '-translate-y-1/2');

          targetEl.classList.add('dragging-window');
          const offX = e.clientX - rect.left;
          const offY = e.clientY - rect.top;

          const move = (ev) => {
            targetEl.style.left = `${ev.clientX - offX}px`;
            targetEl.style.top = `${ev.clientY - offY}px`;
          };
          const up = () => {
            targetEl.classList.remove('dragging-window');
            window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up);
          };
          window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
        };
      }
    }

    // Initializing standalone draggables
    setTimeout(() => {
      const about = document.getElementById('about-me-modal');
      const ql = document.getElementById('quick-look-modal');
      makeDraggable(about, '.draggable-handle');
      makeDraggable(ql, '.draggable-handle');
    }, 500);

    window.handleItemClick = function (folder, index, event) {
      const item = portfolioData[folder][index];

      // Handle Magazines/Folders first
      const magKey = folder + "/" + item.name;
      if (portfolioData[magKey]) {
        openMagazineReader(folder, index);
        return;
      }

      // Everything else (Images and Videos) goes to Quick Look as default
      openQuickLook(item);
    };

    function toggleFullscreen(win) {
      if (win.dataset.isMaximized === 'true') {
        win.style.width = '960px';
        win.style.height = '620px';
        win.style.left = win.dataset.prevLeft || '50%';
        win.style.top = win.dataset.prevTop || '50%';
        win.style.transform = win.dataset.prevLeft ? 'none' : 'translate(-50%, -50%)';
        win.dataset.isMaximized = 'false';
      } else {
        win.dataset.prevLeft = win.style.left;
        win.dataset.prevTop = win.style.top;
        win.style.width = '100vw';
        win.style.height = 'calc(100vh - 2rem)';
        win.style.left = '0';
        win.style.top = '2rem';
        win.style.transform = 'none';
        win.dataset.isMaximized = 'true';
      }
    }

    function openFinderFor(folderName) {
      createWindow(folderName);
    }

    // --- Desktop Icons Dragging Logic ---
    const desktopIcons = document.querySelectorAll('.desktop-icon');
    let draggedIcon = null, iconIsDragging = false, iconOffsetX, iconOffsetY;

    const iconsContainer = document.getElementById('desktop-icons-container');

    desktopIcons.forEach(icon => {
      icon.addEventListener('mousedown', (e) => {
        iconIsDragging = false;
        draggedIcon = icon;
        const containerRect = iconsContainer.getBoundingClientRect();
        const rect = icon.getBoundingClientRect();
        iconOffsetX = e.clientX - rect.left;
        iconOffsetY = e.clientY - rect.top;
        desktopIcons.forEach(i => i.style.zIndex = '1');
        icon.style.zIndex = '10';

        icon.style.right = 'auto';
        icon.style.bottom = 'auto';
        icon.style.left = `${rect.left - containerRect.left}px`;
        icon.style.top = `${rect.top - containerRect.top}px`;
      });
      icon.addEventListener('click', (e) => {
        if (!iconIsDragging) {
          desktopIcons.forEach(i => i.classList.remove('selected'));
          icon.classList.add('selected');
        }
      });
      icon.addEventListener('dblclick', (e) => {
        createWindow(icon.dataset.name);
      });
    });

    document.addEventListener('mousemove', (e) => {
      if (draggedIcon) {
        iconIsDragging = true;
        const containerRect = iconsContainer.getBoundingClientRect();
        draggedIcon.style.left = `${e.clientX - iconOffsetX - containerRect.left}px`;
        draggedIcon.style.top = `${e.clientY - iconOffsetY - containerRect.top}px`;
      }
    });

    document.addEventListener('mouseup', () => {
      if (draggedIcon) {
        setTimeout(() => { iconIsDragging = false; draggedIcon = null; }, 50);
      }
    });

    document.addEventListener('mousedown', (e) => {
      if (!e.target.closest('.desktop-icon')) {
        desktopIcons.forEach(i => i.classList.remove('selected'));
      }
    });

    // --- Finder View Logic ---
    // Legacy singleton variables removed. Logic moved into createWindow and renderFolderContent.

    // --- Quick Look Logic ---
    window.openQuickLook = function (item) {
      const quickLookTitle = document.getElementById('quick-look-title');
      const quickLookContent = document.getElementById('quick-look-content');
      const quickLookModal = document.getElementById('quick-look-modal');
      quickLookTitle.innerText = item.name;

      const qlControls = document.getElementById('quick-look-controls');
      let contentHtml = '';
      if (item.isVideo) {
        // Default 16:9 size so modal opens at correct dimensions before video loads
        contentHtml = `<video class="object-contain block" src="${item.src}" loop playsinline style="width:min(640px,85vw);aspect-ratio:16/9;max-height:75vh;"></video>`;
        qlControls.style.display = '';
      } else {
        contentHtml = `<img class="max-w-[85vw] max-h-[75vh] object-contain block" src="${item.src}" />`;
        qlControls.style.display = 'none';
      }
      quickLookContent.innerHTML = contentHtml;

      // Setup custom media controls
      const videoEl = quickLookContent.querySelector('video');
      const playPauseBtn = document.getElementById('ql-play-pause');
      const progressBar = document.getElementById('ql-progress-bar');
      const progressBg = document.getElementById('ql-progress-bg');
      const timeSpan = document.getElementById('ql-time');
      const fullscreenBtn = document.getElementById('ql-fullscreen');

      // Reset controls state
      if (progressBar) progressBar.style.width = '0%';
      if (timeSpan) timeSpan.textContent = '0:00';
      if (playPauseBtn) playPauseBtn.textContent = 'pause_circle';

      if (videoEl) {
        // Attach beachball to QuickLook video
        const qlVideoContainer = videoEl.parentElement;
        attachBeachball(videoEl, qlVideoContainer);
        // Fix aspect ratio once real dimensions are known
        videoEl.addEventListener('loadedmetadata', () => {
          if (videoEl.videoWidth && videoEl.videoHeight) {
            videoEl.style.aspectRatio = `${videoEl.videoWidth} / ${videoEl.videoHeight}`;
          }
        }, { once: true });
        killOtherVideos(videoEl);
        safePlayVideo(videoEl);
        // Clone elements first to remove stale listeners, then get fresh references
        const newPlay = playPauseBtn.cloneNode(true);
        playPauseBtn.parentNode.replaceChild(newPlay, playPauseBtn);

        const newProgress = progressBg.cloneNode(true);
        progressBg.parentNode.replaceChild(newProgress, progressBg);
        const newProgressBar = newProgress.querySelector('#ql-progress-bar');

        const newFs = fullscreenBtn.cloneNode(true);
        fullscreenBtn.parentNode.replaceChild(newFs, fullscreenBtn);

        // Wire up listeners using fresh references
        videoEl.addEventListener('timeupdate', () => {
          if (videoEl.duration) {
            const pct = (videoEl.currentTime / videoEl.duration) * 100;
            if (newProgressBar) newProgressBar.style.width = pct + '%';
            const m = Math.floor(videoEl.currentTime / 60);
            const s = Math.floor(videoEl.currentTime % 60).toString().padStart(2, '0');
            timeSpan.textContent = `${m}:${s}`;
          }
        });
        videoEl.addEventListener('play', () => { newPlay.textContent = 'pause_circle'; });
        videoEl.addEventListener('pause', () => { newPlay.textContent = 'play_circle'; });

        newPlay.addEventListener('click', () => { if (videoEl.paused) videoEl.play(); else videoEl.pause(); });

        let qlDragging = false;
        const qlSeek = (clientX) => {
          const rect = newProgress.getBoundingClientRect();
          const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
          videoEl.currentTime = pct * videoEl.duration;
          if (newProgressBar) newProgressBar.style.width = (pct * 100) + '%';
        };
        newProgress.addEventListener('mousedown', (e) => { qlDragging = true; qlSeek(e.clientX); });
        newProgress.addEventListener('touchstart', (e) => { qlDragging = true; qlSeek(e.touches[0].clientX); }, { passive: true });
        window.addEventListener('mousemove', (e) => { if (qlDragging) qlSeek(e.clientX); });
        window.addEventListener('touchmove', (e) => { if (qlDragging) qlSeek(e.touches[0].clientX); }, { passive: true });
        window.addEventListener('mouseup', () => { qlDragging = false; });
        window.addEventListener('touchend', () => { qlDragging = false; });

        newFs.addEventListener('click', () => {
          if (videoEl.requestFullscreen) videoEl.requestFullscreen();
          else if (videoEl.webkitRequestFullscreen) videoEl.webkitRequestFullscreen();
        });
      }

      quickLookModal.classList.remove('hidden');
      setTimeout(() => {
        quickLookModal.classList.remove('opacity-0');
        quickLookModal.classList.add('opacity-100');
      }, 10);
      bringToFront(quickLookModal);
    };

    window.closeQuickLook = function () {
      const quickLookModal = document.getElementById('quick-look-modal');
      const quickLookContent = document.getElementById('quick-look-content');
      quickLookModal.classList.remove('opacity-100');
      quickLookModal.classList.add('opacity-0');
      setTimeout(() => {
        quickLookModal.classList.add('hidden');
        quickLookContent.innerHTML = '';
      }, 300);
    };

    document.getElementById('btn-close-quick-look').addEventListener('click', closeQuickLook);

    document.addEventListener('keydown', (e) => {
      const quickLookModal = document.getElementById('quick-look-modal');
      if (quickLookModal.classList.contains('hidden')) return;
      if (e.key === 'Escape') {
        closeQuickLook();
      } else if (e.code === 'Space') {
        e.preventDefault();
        const v = quickLookModal.querySelector('video');
        if (v) { if (v.paused) v.play(); else v.pause(); }
      }
    });

    // --- Legacy Cleanup Done ---






    // --- Edits Viewer Logic ---
    const editsViewer = document.getElementById('edits-viewer');
    const editsList = document.getElementById('edits-list');
    const editsVideo = document.getElementById('edits-video');
    const editsEmpty = document.getElementById('edits-empty');
    const btnCloseEdits = document.getElementById('btn-close-edits');

    // Attach beachball to desktop edits video
    const desktopEditsBB = attachBeachball(editsVideo, editsVideo.parentElement);

    let editsItems = [];
    let selectedEditIndex = -1;

    // Collect all videos with 3 or fewer digit characters in the name
    // Prefer _web versions, skip _compressed and originals when _web exists
    const collectEdits = () => {
      const results = [];
      Object.keys(portfolioData).forEach(folderKey => {
        if (folderKey.startsWith('TOMIN INDEX.TXT')) return;
        if (folderKey === 'icons') return;
        const items = portfolioData[folderKey];
        if (!Array.isArray(items)) return;
        
        // Group videos by base name (without _web, _compressed suffixes)
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
        
        // Pick best version: _web > _compressed > original
        Object.values(videosByBase).forEach(versions => {
          results.push(versions.web || versions.compressed || versions.original);
        });
      });
      return results;
    };

    const editsPlayPause = document.getElementById('edits-play-pause');
    const editsProgressBar = document.getElementById('edits-progress-bar');
    const editsProgressBg = document.getElementById('edits-progress-bg');
    const editsTimeEl = document.getElementById('edits-time');

    // Wire up media controls
    editsPlayPause.addEventListener('click', () => {
      if (editsVideo.paused) {
        editsVideo.play();
        editsPlayPause.innerText = 'pause_circle';
      } else {
        editsVideo.pause();
        editsPlayPause.innerText = 'play_circle';
      }
    });

    editsVideo.addEventListener('timeupdate', () => {
      if (!editsVideo.duration) return;
      const pct = (editsVideo.currentTime / editsVideo.duration) * 100;
      editsProgressBar.style.width = pct + '%';
      const m = Math.floor(editsVideo.currentTime / 60);
      const s = Math.floor(editsVideo.currentTime % 60).toString().padStart(2, '0');
      editsTimeEl.innerText = `${m}:${s}`;
    });

    editsVideo.addEventListener('play', () => { editsPlayPause.innerText = 'pause_circle'; });
    editsVideo.addEventListener('pause', () => { editsPlayPause.innerText = 'play_circle'; });

    editsProgressBg.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (!editsVideo.duration) return;
      const scrub = (ev) => {
        const rect = editsProgressBg.getBoundingClientRect();
        const pos = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
        editsVideo.currentTime = pos * editsVideo.duration;
        editsProgressBar.style.width = (pos * 100) + '%';
      };
      scrub(e);
      const onMove = ev => scrub(ev);
      const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });

    const selectEdit = (index, autoPlay = true) => {
      if (index < 0 || index >= editsItems.length) return;
      selectedEditIndex = index;

      // Update list highlight
      const rows = editsList.querySelectorAll('.edit-row');
      rows.forEach((r, i) => {
        if (i === index) {
          r.classList.add('edit-selected');
          r.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        } else {
          r.classList.remove('edit-selected');
        }
      });

      // Play video, reset controls
      const item = editsItems[index];
      const editsRightCard = document.getElementById('edits-right-card');
      // Hide video until first frame is ready (prevents stretch flash)
      editsVideo.style.opacity = '0';
      editsVideo.style.transition = 'opacity 0.15s ease';
      editsVideo.src = item.src;
      // Update aspect-ratio on metadata, show on first frame
      editsVideo.addEventListener('loadedmetadata', function updateAspect() {
        editsVideo.removeEventListener('loadedmetadata', updateAspect);
        if (editsRightCard && editsVideo.videoWidth && editsVideo.videoHeight) {
          const ratio = editsVideo.videoWidth / editsVideo.videoHeight;
          editsRightCard.style.aspectRatio = ratio.toFixed(4);
        }
      });
      editsVideo.addEventListener('loadeddata', function showFrame() {
        editsVideo.removeEventListener('loadeddata', showFrame);
        editsVideo.style.opacity = '1';
      });
      desktopEditsBB.hide();
      if (autoPlay) {
        desktopEditsBB.show();
        killOtherVideos(editsVideo);
        safePlayVideo(editsVideo);
      }
      editsProgressBar.style.width = '0%';
      editsTimeEl.innerText = '0:00';
      if (editsEmpty) editsEmpty.style.display = 'none';
    };

    const renderEditsList = () => {
      editsList.innerHTML = '';
      editsItems.forEach((item, i) => {
        const nameNoExt = item.name.replace(/\.[^/.]+$/, '');
        const row = document.createElement('div');
        row.className = 'edit-row';
        row.innerText = nameNoExt;
        row.addEventListener('click', () => selectEdit(i));
        editsList.appendChild(row);
      });
    };

    window.openEditsViewer = function () {
      // Pause Quick Look video if playing
      const qlVideo = document.querySelector('#quick-look-modal video');
      if (qlVideo) qlVideo.pause();

      editsItems = collectEdits();
      renderEditsList();
      selectedEditIndex = -1;
      editsVideo.src = '';
      if (editsEmpty) editsEmpty.style.display = '';

      switchToSpace('edits');

      // Auto-select first edit directly (no setTimeout = stays in user gesture context)
      selectEdit(0, true);
    };

    btnCloseEdits.addEventListener('click', () => {
      switchToSpace('desktop');
      editsVideo.pause();
      editsVideo.src = '';
    });

    // Arrow key & Space navigation in edits viewer
    document.addEventListener('keydown', (e) => {
      if (editsViewer.classList.contains('pointer-events-none')) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectEdit(selectedEditIndex + 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectEdit(selectedEditIndex - 1);
      } else if (e.code === 'Space') {
        e.preventDefault();
        if (editsVideo.paused) editsVideo.play();
        else editsVideo.pause();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        btnCloseEdits.click();
      }
    });

    window.handleFinderClick = function () {
      // Check if Edits Viewer is open
      if (editsViewer && editsViewer.classList.contains('pointer-events-auto')) {
        btnCloseEdits.click();
        return;
      }

      // Check if Magazine Reader is open
      if (magazineReader && magazineReader.classList.contains('pointer-events-auto')) {
        btnCloseMagazine.click();
        return;
      }

      // Otherwise, open Finder (creating a new window if none exist)
      const firstFolder = Object.keys(portfolioData).find(k => !k.includes('/')) || '';
      createWindow(firstFolder);
    };

    const desktopMain = document.getElementById('desktop-main');

    const magazineReader = document.getElementById('magazine-reader');
    const btnCloseMagazine = document.getElementById('btn-close-magazine');
    const magazineScroller = document.getElementById('magazine-scroller');
    const magazineTitle = document.getElementById('magazine-title');
    const magazineProgress = document.getElementById('magazine-progress');
    const magazineCurrentPage = document.getElementById('magazine-current-page');
    const magazineTotalPages = document.getElementById('magazine-total-pages');

    // --- 3-Space tape model ---
    // Spaces: edits (offset -1) | desktop (0) | magazine (+1)
    // All three panels slide simultaneously so direct Edits↔Magazine
    // travel passes through the desktop (200% distance).
    function switchToSpace(target) {
      const offsets = { edits: -1, desktop: 0, magazine: 1 };
      const o = offsets[target];
      editsViewer.style.transform = `translateX(${(-1 - o) * 100}%)`;
      desktopMain.style.transform = `translateX(${(0 - o) * 100}%)`;
      magazineReader.style.transform = `translateX(${(1 - o) * 100}%)`;
      editsViewer.classList.toggle('pointer-events-auto', target === 'edits');
      editsViewer.classList.toggle('pointer-events-none', target !== 'edits');
      magazineReader.classList.toggle('pointer-events-auto', target === 'magazine');
      magazineReader.classList.toggle('pointer-events-none', target !== 'magazine');
    }

    let isDraggingSlider = false;
    magazineProgress.addEventListener('mousedown', () => isDraggingSlider = true);
    magazineProgress.addEventListener('touchstart', () => isDraggingSlider = true, { passive: true });
    window.addEventListener('mouseup', () => isDraggingSlider = false);
    window.addEventListener('touchend', () => isDraggingSlider = false);

    window.openMagazineReader = function (folder, index) {
      const magItem = portfolioData[folder][index];
      const magKey = folder + "/" + magItem.name;
      const images = portfolioData[magKey] || [];

      // magazine reader is full-screen overlay, no bringToFront needed
      magazineTitle.innerText = magItem.name;
      magazineScroller.innerHTML = "";

      if (images.length === 0) {
        magazineScroller.innerHTML = `<div class="w-full h-full flex items-center justify-center text-slate-500 dark:text-white/50">No pages found in this magazine.</div>`;
        magazineProgress.max = 1;
        magazineTotalPages.innerText = "0";
      } else {
        magazineScroller.style.scrollSnapType = 'none';
        magazineScroller.style.scrollBehavior = 'auto'; // allow pure scroll sync dragging

        // Dynamic spacers that will be adjusted once image/video widths are known
        let htmlSnippet = `<div id="mag-spacer-start" class="shrink-0 h-full pointer-events-none bg-transparent" style="width: 50vw;"></div>`;
        images.forEach((img, i) => {
          if (img.isVideo) {
            htmlSnippet += `
              <video data-src="${img.src}" class="mag-page h-full w-auto object-contain shrink-0 block mx-0 pointer-events-none"
                data-index="${i}" style="max-height: 100vh;" loop muted playsinline preload="none"></video>
            `;
          } else {
            htmlSnippet += `
              <img src="${img.src}" class="mag-page h-full w-auto object-contain shrink-0 block mx-0 pointer-events-none" 
                data-index="${i}" style="max-height: 100vh;">
            `;
          }
        });
        htmlSnippet += `<div id="mag-spacer-end" class="shrink-0 h-full pointer-events-none bg-transparent" style="width: 50vw;"></div>`;
        magazineScroller.innerHTML = htmlSnippet;

        // Seamless video loop + lazy load only visible videos
        const magVids = magazineScroller.querySelectorAll('video');
        magVids.forEach(v => {
          v.addEventListener('timeupdate', () => {
            if (v.duration && v.currentTime > v.duration - 0.08) {
              v.currentTime = 0;
              v.play();
            }
          });
        });
        const magVidObserver = new IntersectionObserver((entries) => {
          entries.forEach(e => {
            const v = e.target;
            if (e.isIntersecting) {
              if (!v.src && v.dataset.src) { v.src = v.dataset.src; }
              v.play().catch(() => { });
            } else {
              v.pause();
            }
          });
        }, { root: magazineScroller, threshold: 0.3 });
        magVids.forEach(v => magVidObserver.observe(v));

        // The slider tracks "Views" for navigation, but the total text shows actual pages
        const viewsCount = images.length + (images.length > 1 ? 1 : 0);
        magazineProgress.max = 10000;
        magazineProgress.value = 0;
        magazineTotalPages.innerText = images.length;
        magazineCurrentPage.innerText = 1;

        let cachedViews = [];
        const updateCachedViews = () => {
          cachedViews = getMagazineViews();
        };

        const getViewIndex = () => {
          const current = magazineScroller.scrollLeft;
          // Fallback if cache isn't ready yet
          const activeViews = (cachedViews && cachedViews.length > 0) ? cachedViews : getMagazineViews();
          let closestIndex = 0;
          let minDiff = Infinity;
          for (let i = 0; i < activeViews.length; i++) {
            const diff = Math.abs(current - activeViews[i]);
            if (diff < minDiff) {
              minDiff = diff;
              closestIndex = i;
            }
          }
          return closestIndex;
        };

        const updatePageIndicator = (viewIndex) => {
          const activeViews = (cachedViews && cachedViews.length > 0) ? cachedViews : getMagazineViews();
          if (activeViews.length === 0) return;

          if (viewIndex === 0) {
            magazineCurrentPage.innerText = "1";
          } else if (viewIndex === activeViews.length - 1 && images.length > 1) {
            magazineCurrentPage.innerText = images.length;
          } else {
            magazineCurrentPage.innerText = `${viewIndex}-${viewIndex + 1}`;
          }
        };

        const snapToView = () => {
          updateCachedViews(); // Ensure we have latest layout
          const current = magazineScroller.scrollLeft;
          if (cachedViews.length === 0) return;
          let closest = cachedViews[0];
          let minDiff = Infinity;
          cachedViews.forEach(v => {
            const diff = Math.abs(current - v);
            if (diff < minDiff) {
              minDiff = diff;
              closest = v;
            }
          });
          magazineScroller.scrollTo({ left: closest, behavior: 'smooth' });
        };

        magazineScroller.onscroll = () => {
          if (isDraggingSlider || isPanning) {
            updatePageIndicator(getViewIndex());
            return;
          }
          const maxScroll = magazineScroller.scrollWidth - magazineScroller.clientWidth;
          if (maxScroll > 0) {
            const progress = (magazineScroller.scrollLeft / maxScroll) * 10000;
            magazineProgress.value = progress;
          }
          updatePageIndicator(getViewIndex());
        };

        magazineProgress.oninput = (e) => {
          const val = parseInt(e.target.value);
          const maxScroll = magazineScroller.scrollWidth - magazineScroller.clientWidth;
          const targetScroll = (val / 10000) * maxScroll;
          magazineScroller.scrollTo({ left: targetScroll, behavior: 'auto' });
          updatePageIndicator(getViewIndex());
        };

        magazineProgress.onchange = () => {
          snapToView();
        };

        // Setup custom drag to pan
        let isPanning = false;
        let startX;
        let scrollLeft;
        magazineScroller.hasDragged = false;

        magazineScroller.onpointerdown = (e) => {
          isPanning = true;
          magazineScroller.style.cursor = 'grabbing';
          magazineScroller.style.scrollBehavior = 'auto'; // Immediate response
          // Cancel any ongoing smooth scroll
          magazineScroller.scrollTo({ left: magazineScroller.scrollLeft, behavior: 'instant' });

          startX = e.clientX;
          scrollLeft = magazineScroller.scrollLeft;
          magazineScroller.hasDragged = false;
        };

        magazineScroller.onpointerleave = () => {
          if (isPanning) {
            isPanning = false;
            magazineScroller.style.cursor = 'auto';
            snapToView();
          }
        };

        magazineScroller.onpointerup = () => {
          if (isPanning) {
            isPanning = false;
            magazineScroller.style.cursor = 'auto';
            snapToView();
          }
        };

        magazineScroller.onpointermove = (e) => {
          if (!isPanning) return;
          e.preventDefault();
          const walk = (e.clientX - startX);
          if (Math.abs(walk) > 10) {
            magazineScroller.hasDragged = true;
          }
          magazineScroller.scrollLeft = scrollLeft - walk;
        };

        // Setup click navigation right on the scroller bounds
        magazineScroller.onclick = (e) => {
          if (magazineScroller.hasDragged) {
            magazineScroller.hasDragged = false;
            return;
          }
          const rect = magazineScroller.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const views = getMagazineViews();
          const current = magazineScroller.scrollLeft;

          if (x < rect.width * 0.25) {
            const prev = [...views].reverse().find(v => v < current - 10);
            if (prev !== undefined) {
              magazineScroller.scrollTo({ left: prev, behavior: 'smooth' });
            } else {
              magazineScroller.scrollTo({ left: 0, behavior: 'smooth' });
            }
          } else if (x > rect.width * 0.75) {
            const next = views.find(v => v > current + 10);
            if (next !== undefined) {
              magazineScroller.scrollTo({ left: next, behavior: 'smooth' });
            } else {
              magazineScroller.scrollTo({ left: magazineScroller.scrollWidth, behavior: 'smooth' });
            }
          }
        };
      }

      switchToSpace('magazine');

      // Auto-align spacers so the cover centers at scrollLeft = 0
      const firstImg = magazineScroller.querySelector('.mag-page');
      const lastImg = Array.from(magazineScroller.querySelectorAll('.mag-page')).pop();
      const startSpacer = document.getElementById('mag-spacer-start');
      const endSpacer = document.getElementById('mag-spacer-end');

      let scrollAttempts = 0;
      const alignSpacersAndScroll = () => {
        const half = magazineScroller.clientWidth / 2;
        const firstImgWidth = firstImg ? firstImg.offsetWidth : 0;
        const lastImgWidth = lastImg ? lastImg.offsetWidth : 0;

        // If image width isn't ready, wait
        if (firstImgWidth === 0 && scrollAttempts < 25) {
          scrollAttempts++;
          requestAnimationFrame(alignSpacersAndScroll);
          return;
        }

        // Adjust spacers so cover center is at 0 and back center is at maxScroll
        if (startSpacer && firstImgWidth > 0) {
          startSpacer.style.width = (half - firstImgWidth / 2) + "px";
        }
        if (endSpacer && lastImgWidth > 0) {
          endSpacer.style.width = (half - lastImgWidth / 2) + "px";
        }

        updateCachedViews();
        magazineScroller.scrollTo({ left: 0, behavior: 'instant' });
      };

      if (firstImg) {
        if (firstImg.tagName === 'VIDEO') {
          firstImg.onloadedmetadata = alignSpacersAndScroll;
        } else {
          if (firstImg.complete) {
            alignSpacersAndScroll();
          } else {
            firstImg.onload = alignSpacersAndScroll;
          }
        }
      }
      setTimeout(alignSpacersAndScroll, 100);
      setTimeout(alignSpacersAndScroll, 500);
    };

    const magFullscreenToggle = document.getElementById('mag-fullscreen-toggle');
    if (magFullscreenToggle) {
      magFullscreenToggle.addEventListener('click', () => {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen();
        } else {
          document.exitFullscreen();
        }
      });
    }

    btnCloseMagazine.addEventListener('click', () => {
      switchToSpace('desktop');

      setTimeout(() => {
        magazineScroller.innerHTML = "";
      }, 500); // clear after animation
    });

    const getMagazineViews = () => {
      const views = [];
      const imgs = magazineScroller.querySelectorAll('.mag-page');
      const halfScreen = magazineScroller.clientWidth / 2;
      const maxScroll = Math.max(0, magazineScroller.scrollWidth - magazineScroller.clientWidth);

      if (imgs.length > 0) {
        // View 1: Center of first image (Cover)
        const v0 = imgs[0].offsetLeft + (imgs[0].offsetWidth / 2) - halfScreen;
        views.push(Math.max(0, Math.min(v0, maxScroll)));

        // Views 2 to N: Center of all seams between images (Spreads)
        for (let i = 1; i < imgs.length; i++) {
          const vi = imgs[i].offsetLeft - halfScreen;
          views.push(Math.max(0, Math.min(vi, maxScroll)));
        }

        // Last View: Center of last image (Back Cover)
        if (imgs.length > 1) {
          const vLast = imgs[imgs.length - 1].offsetLeft + (imgs[imgs.length - 1].offsetWidth / 2) - halfScreen;
          views.push(Math.max(0, Math.min(vLast, maxScroll)));
        }
      }
      return views;
    };

    document.addEventListener('keydown', (e) => {
      // Only process keys if magazine reader is fully open (translate-x-0)
      if (magazineReader.classList.contains('pointer-events-auto')) {
        const views = getMagazineViews();
        const current = magazineScroller.scrollLeft;

        if (e.key === 'ArrowRight') {
          e.preventDefault();
          const next = views.find(v => v > current + 10);
          if (next !== undefined) {
            magazineScroller.scrollTo({ left: next, behavior: 'smooth' });
          }
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          const prev = [...views].reverse().find(v => v < current - 10);
          if (prev !== undefined) {
            magazineScroller.scrollTo({ left: prev, behavior: 'smooth' });
          }
        } else if (e.key === 'Escape') {
          e.preventDefault();
          btnCloseMagazine.click();
        }
      }
    });

    // ====== iOS Homescreen Logic ======
    (function () {
      const iosScreen = document.getElementById('ios-screen');
      const iosMagazinesApp = document.getElementById('ios-magazines-app');
      const iosMagGrid = document.getElementById('ios-mag-grid');

      function isMobileView() { return window.innerWidth <= 768; }

      let iosIntroPlayed = false;
      function playIosIntro() {
        if (iosIntroPlayed) return;
        iosIntroPlayed = true;
        const items = iosScreen.querySelectorAll('.ios-intro-item');
        items.forEach(el => el.classList.add('ios-intro-run'));
      }

      function applyScreen() {
        if (isMobileView()) {
          iosScreen.style.display = 'flex';
          // Small delay so the screen is painted before animation starts
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
          function upd() {
            const lvl = Math.round(bat.level * 100);
            icon.textContent = bat.charging ? 'battery_charging_full'
              : lvl > 80 ? 'battery_full'
                : lvl > 40 ? 'battery_5_bar'
                  : lvl > 10 ? 'battery_2_bar' : 'battery_0_bar';
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

          if (supportsVT) {
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
          : magazines.map(mag => `
              <div onclick="iosTapMagazine('${mag.folder.replace(/'/g, "\\'")}',${mag.index})"
                style="-webkit-tap-highlight-color:transparent;cursor:pointer;height:fit-content;">
                <div style="border-radius:14px;overflow:hidden;aspect-ratio:3/4;background:#1e293b;box-shadow:0 4px 16px rgba(0,0,0,0.25);">
                  ${mag.cover
              ? `<img src="${mag.cover}" style="width:100%;height:100%;object-fit:cover;" />`
              : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:var(--ios-text-secondary);font-size:12px;">${mag.name}</div>`}
                </div>
                <p style="color:var(--ios-text);font-weight:600;font-size:13px;margin-top:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${mag.name}</p>
                <p style="color:var(--ios-text-secondary);font-size:11px;margin-top:1px;">Today</p>
              </div>`).join('');

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
      let iosSelectedEdit = -1;

      // Media controls wiring
      iosEditsPlayPause.addEventListener('click', () => {
        if (iosEditsVideo.paused) iosEditsVideo.play(); else iosEditsVideo.pause();
      });
      iosEditsFullscreen.addEventListener('click', () => {
        if (iosEditsVideo.requestFullscreen) iosEditsVideo.requestFullscreen();
        else if (iosEditsVideo.webkitEnterFullscreen) iosEditsVideo.webkitEnterFullscreen();
      });
      iosEditsVideo.addEventListener('play', () => { iosEditsPlayPause.textContent = 'pause_circle'; });
      iosEditsVideo.addEventListener('pause', () => { iosEditsPlayPause.textContent = 'play_circle'; });
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
      let iosEditsBB = attachBeachball(iosEditsVideo, iosEditsVideoContainer);

      function iosSelectEdit(index, autoPlay = true) {
        if (index < 0 || index >= iosEditsItems.length) return;
        iosSelectedEdit = index;
        const item = iosEditsItems[index];
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
          row.style.cssText = 'padding:14px 20px; cursor:pointer; color:var(--ios-text); font-size:15px; font-weight:400; border-bottom:1px solid var(--ios-list-border); -webkit-tap-highlight-color:transparent;';
          row.textContent = nameNoExt;
          row.addEventListener('click', () => iosSelectEdit(i));
          iosEditsList.appendChild(row);
        });
      }

      window.iosOpenEdits = function (event) {
        const iconEl = event ? event.currentTarget : null;
        setThemeColorForApp();
        iosEditsItems = iosCollectEdits();
        iosRenderEditsList();
        iosSelectedEdit = -1;
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
          const dockBtn = document.querySelector('.ios-dock-item[onclick*="iosOpenContact"]');
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
            check.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px; color:#fff;">check</span>';
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

      function rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const l = (max + min) / 2;
        let h = 0, s = 0;
        if (max !== min) {
          const d = max - min;
          s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
          if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
          else if (max === g) h = (b - r) / d + 2;
          else h = (r - g) / d + 4;
          h /= 6;
        }
        return { h, s, l };
      }
      function hslToRgb(h, s, l) {
        let r, g, b;
        if (s === 0) { r = g = b = l; }
        else {
          const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
          };
          const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
          const p = 2 * l - q;
          r = hue2rgb(p, q, h + 1 / 3);
          g = hue2rgb(p, q, h);
          b = hue2rgb(p, q, h - 1 / 3);
        }
        return { r: r * 255, g: g * 255, b: b * 255 };
      }

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

      // ---- iOS Mail App ----
      const iosMailApp = document.getElementById('ios-mail-app');
      const iosMailScreenList = document.getElementById('ios-mail-screen-list');
      const iosMailScreenDet = document.getElementById('ios-mail-screen-detail');

      window.iosOpenMail = function (event) {
        const iconEl = event ? event.currentTarget : null;
        setThemeColorForApp();
        // always open on the inbox list
        iosMailScreenList.style.display = 'flex';
        iosMailScreenDet.style.display = 'none';
        iosMailApp.classList.remove('closing');
        performIosAppTransition(iosMailApp, iconEl, true);
      };

      window.iosCloseMail = function () {
        setThemeColorForScreen();
        iosMailApp.classList.add('closing');
        performIosAppTransition(iosMailApp, null, false);
        setTimeout(() => {
          iosMailApp.style.display = 'none';
          iosMailApp.classList.remove('closing');
        }, 300);
      };

      window.iosMailOpenMessage = function () {
        iosMailScreenDet.style.display = 'flex';
        iosMailScreenList.style.display = 'none';
      };

      window.iosMailBackToList = function () {
        iosMailScreenList.style.display = 'flex';
        iosMailScreenDet.style.display = 'none';
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
              <span class="material-symbols-outlined" style="color:var(--ios-text-secondary); font-size:20px;">chevron_right</span>
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

      window.iosBtsBackToFolders = function () {
        iosBtsScreenFolders.style.transform = 'translateX(0)';
        iosBtsScreenFolders.style.opacity = '1';
        iosBtsScreenFiles.style.transform = 'translateX(100%)';
        setTimeout(() => { iosBtsScreenFiles.style.display = 'none'; }, 350);
      };

      window.iosBtsOpenViewer = function (index) {
        iosBtsViewer.style.display = 'flex';

        iosBtsViewerPages.innerHTML = iosBtsCurrentFiles.map((f, i) => {
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

    // ── iOS Live Activity: Time & Weather Berlin ─────────────────────────────
    (function () {
      // Arc bezier: P0=(-5,48) P1=(52,-18) P2=(110,48) in viewBox "-5 0 115 50"
      // viewBox aspect 115:50=2.3:1 ≈ widget 343×148 → uniform scale → circles stay round
      const P0 = { x: -5, y: 48 }, P1 = { x: 52, y: -18 }, P2 = { x: 110, y: 48 };

      const WMO = {
        0: ['☀️', 'Clear'], 1: ['🌤️', 'Mostly clear'], 2: ['⛅', 'Partly cloudy'], 3: ['☁️', 'Overcast'],
        45: ['🌫️', 'Foggy'], 48: ['🌫️', 'Icy fog'],
        51: ['🌦️', 'Light drizzle'], 53: ['🌦️', 'Drizzle'], 55: ['🌧️', 'Heavy drizzle'],
        61: ['🌧️', 'Light rain'], 63: ['🌧️', 'Rain'], 65: ['🌧️', 'Heavy rain'],
        71: ['❄️', 'Light snow'], 73: ['❄️', 'Snow'], 75: ['❄️', 'Heavy snow'],
        80: ['🌧️', 'Showers'], 81: ['🌧️', 'Showers'], 82: ['⛈️', 'Heavy showers'],
        95: ['⛈️', 'Thunderstorm'], 96: ['⛈️', 'Thunderstorm'], 99: ['⛈️', 'Thunderstorm'],
      };
      function wmo(code) {
        const c = Object.keys(WMO).map(Number).sort((a, b) => b - a).find(k => code >= k);
        return WMO[c] || ['🌡️', 'Unknown'];
      }

      const timeEl = document.getElementById('iww-time');
      const iconEl = document.getElementById('iww-icon');
      const tempEl = document.getElementById('iww-temp');
      const windEl = document.getElementById('iww-wind');
      const descEl = document.getElementById('iww-desc');
      const arcProg = document.getElementById('iww-arc-prog');
      const arcBg = document.getElementById('iww-arc-bg');
      const sunDotHtml = document.getElementById('iww-sun-dot-html');
      const sunGlowHtml = document.getElementById('iww-sun-glow-html');
      const moonHtml = document.getElementById('iww-moon-html');
      const weatherWgt = document.getElementById('ios-weather-widget');

      // Convert SVG viewBox coords to pixel coords within the weather widget
      // viewBox "-5 0 115 50": x range [-5,110] w=115, y range [0,50] h=50
      function svgToPx(svgX, svgY) {
        // Use fallbacks if dimensions aren't yet available (e.g. initial render)
        const w = (weatherWgt && weatherWgt.offsetWidth) || 343;
        const h = (weatherWgt && weatherWgt.offsetHeight) || 148;
        return { x: (svgX + 5) / 115 * w, y: (svgY + 22) / 72 * h };
      }

      let sunriseMs = null, sunsetMs = null;
      // Gate for the first-reveal intro: the arc stays blank (no sun/moon,
      // no progress line) until the weather card is brought into view. The
      // first time it shows up we run playArcIntro() to trace the path from
      // the left edge to the target position. Everything after is handled
      // by the normal updateArc() instant-path.
      let introPlayed = false;
      let introRAF = null;

      function tickClock() {
        const now = new Date();
        const h = String(now.getHours()).padStart(2, '0');
        const m = String(now.getMinutes()).padStart(2, '0');
        if (timeEl) timeEl.textContent = h + ':' + m;
        if (introPlayed) updateArc(now);
      }

      // ── Pure-JS arc math (bypasses SVG API which gives stale values in
      //    Safari after CSS-transform animations) ──────────────────────────
      // Path: M -5,48 Q 52,-18 110,48  (quadratic bezier)
      // dB/dt = (114+2t, -132+264t)
      // Precompute cumulative arc-length table at 200 samples so we can
      // convert parametric-t ↔ arc-length fraction analytically.
      const IWW_N = 200;
      const IWW_LUT = (() => {
        const a = new Float64Array(IWW_N + 1);
        for (let i = 1; i <= IWW_N; i++) {
          const tm = (i - 0.5) / IWW_N;
          const dx = 114 + 2 * tm, dy = -132 + 264 * tm;
          a[i] = a[i - 1] + Math.sqrt(dx * dx + dy * dy) / IWW_N;
        }
        return a;
      })();
      const IWW_TOTAL = IWW_LUT[IWW_N]; // total arc length in viewBox units

      // Bezier point at parametric t in viewBox coords
      function iwwBezier(t) {
        const u = 1 - t;
        return {
          x: u * u * (-5) + 2 * u * t * 52 + t * t * 110,
          y: u * u * 48 + 2 * u * t * (-18) + t * t * 48
        };
      }
      // Arc length (viewBox units) from t=0 to parametric t
      function iwwArcLen(t) {
        const i = Math.min(IWW_N - 1, (t * IWW_N) | 0);
        const f = t * IWW_N - i;
        return IWW_LUT[i] + f * (IWW_LUT[i + 1] - IWW_LUT[i]);
      }

      // Compute the arc target for the current moment.
      // Uses IWW_TOTAL (analytical) so getTotalLength() is never called —
      // that SVG API can return stale values after CSS-transform animations.
      function currentTarget(now) {
        const nowMs = now.getTime();
        const isDay = sunriseMs && sunsetMs && nowMs > sunriseMs && nowMs < sunsetMs;
        const t = isDay
          ? Math.max(0, Math.min(1, (nowMs - sunriseMs) / (sunsetMs - sunriseMs)))
          : 0.5;
        return { isDay, t };
      }

      // Place the sun (day) or moon (night) at parametric t on the arc.
      // Arc-length for stroke-dasharray is also computed analytically so the
      // sun dot always sits exactly on the end of the filled arc line.
      function placeAt(t, isDay) {
        const pt = iwwBezier(t);
        const pos = svgToPx(pt.x, pt.y);
        const len = iwwArcLen(t);
        const CENTER = 'translate(-50%,-50%)';
        if (isDay) {
          if (arcProg) arcProg.setAttribute('stroke-dasharray', len + ' ' + (IWW_TOTAL + 10));
          if (sunDotHtml) { sunDotHtml.style.left = pos.x + 'px'; sunDotHtml.style.top = pos.y + 'px'; sunDotHtml.style.transform = CENTER; sunDotHtml.style.display = ''; }
          if (sunGlowHtml) { sunGlowHtml.style.left = pos.x + 'px'; sunGlowHtml.style.top = pos.y + 'px'; sunGlowHtml.style.transform = CENTER; sunGlowHtml.style.display = ''; }
          if (moonHtml) moonHtml.style.display = 'none';
        } else {
          if (arcProg) arcProg.setAttribute('stroke-dasharray', '0 ' + (IWW_TOTAL + 10));
          if (sunDotHtml) sunDotHtml.style.display = 'none';
          if (sunGlowHtml) sunGlowHtml.style.display = 'none';
          if (moonHtml) { moonHtml.style.left = pos.x + 'px'; moonHtml.style.top = pos.y + 'px'; moonHtml.style.transform = CENTER; moonHtml.style.display = ''; }
        }
      }

      function updateArc(now) {
        const tgt = currentTarget(now);
        if (!tgt) return;
        placeAt(tgt.t, tgt.isDay);
      }

      // Ease-out cubic: fast start, gentle stop — lets the sun/moon glide
      // along the arc and settle softly at its final spot.
      function easeOutCubic(x) { return 1 - Math.pow(1 - x, 3); }

      // First-reveal animation. Tweens progLen from 0 → target over ~1.8 s
      // and updates the sun/moon position every frame along the arc.
      function playArcIntro() {
        if (introPlayed) return;
        const tgt = currentTarget(new Date());
        if (!tgt || tgt.t <= 0) {
          // Nothing to animate yet (e.g. sunrise/sunset not fetched) — try
          // again on the next tick/card-reveal.
          return;
        }
        introPlayed = true;
        if (introRAF) cancelAnimationFrame(introRAF);

        const DUR = 1800;
        const start = performance.now();
        const { isDay, t: target } = tgt;

        function frame(ts) {
          const raw = Math.min(1, (ts - start) / DUR);
          const eased = easeOutCubic(raw);
          placeAt(target * eased, isDay);
          if (raw < 1) {
            introRAF = requestAnimationFrame(frame);
          } else {
            introRAF = null;
          }
        }
        introRAF = requestAnimationFrame(frame);
      }

      // Subscribe to card-change events so we can trigger the intro the
      // first time the weather card becomes the front card. The Smart Stack
      // carousel fans events out to window.sstackCardHandlers.
      window.sstackCardHandlers = window.sstackCardHandlers || [];
      window.sstackCardHandlers.push(function (idx) {
        if (idx !== 0 || introPlayed) return;
        // Data might still be in-flight on first reveal — retry briefly.
        if (sunriseMs && sunsetMs) {
          playArcIntro();
        } else {
          let tries = 0;
          const iv = setInterval(() => {
            tries++;
            if (introPlayed || tries > 30) { clearInterval(iv); return; }
            if (sunriseMs && sunsetMs) { clearInterval(iv); playArcIntro(); }
          }, 120);
        }
      });

      async function fetchWeather() {
        try {
          const url = 'https://api.open-meteo.com/v1/forecast?latitude=52.52&longitude=13.41' +
            '&current=temperature_2m,wind_speed_10m,weather_code' +
            '&daily=sunrise,sunset&timezone=Europe%2FBerlin&forecast_days=1';
          const res = await fetch(url);
          const data = await res.json();
          const cur = data.current;
          const daily = data.daily;
          if (iconEl && tempEl && windEl && descEl) {
            const [icon, desc] = wmo(cur.weather_code);
            iconEl.textContent = icon;
            tempEl.textContent = Math.round(cur.temperature_2m) + '°C';
            windEl.textContent = '💨 ' + Math.round(cur.wind_speed_10m) + ' km/h';
            descEl.textContent = desc;
          }
          if (daily && daily.sunrise && daily.sunset) {
            sunriseMs = new Date(daily.sunrise[0]).getTime();
            sunsetMs = new Date(daily.sunset[0]).getTime();
            // Only paint the arc instantly if we've already done the intro.
            // Otherwise hold the blank starting state — the intro will tween
            // to this target the moment the weather card is first revealed.
            if (introPlayed) updateArc(new Date());
          }
        } catch (e) {
          if (descEl) descEl.textContent = 'Berlin';
        }
      }

      // Expose sun times so the expanded weather view can render daylight info.
      window.iwwGetSunTimes = function () {
        return { sunrise: sunriseMs, sunset: sunsetMs };
      };

      // Populate expanded status categories from status.json
      async function populateStatus() {
        try {
          const resp = await fetch('status.json');
          if (!resp.ok) return;
          const data = await resp.json();

          const rn = data.rightNow;
          if (rn) {
            const titleEl = document.getElementById('iwe-status-title');
            const projectEl = document.getElementById('iwe-status-project');
            const noteEl = document.getElementById('iwe-status-note');
            const emojiEl = document.getElementById('iwe-status-emoji');

            // Handle Emoji and Title (split "🎬 Pre-Production" into "🎬" and "Pre-Production")
            let fullTitle = rn.title || '';
            let phaseName = fullTitle;
            let emoji = '✂️';
            
            // Comprehensive emoji regex
            const emojiMatch = fullTitle.match(/^(\ud83c[\udf00-\uffff]|\ud83d[\udf00-\uffff]|\ud83e[\udf00-\uffff]|[\u2700-\u27bf]|[\u2000-\u3299])/);
            if (emojiMatch) {
              emoji = emojiMatch[0];
              phaseName = fullTitle.replace(emoji, '').trim();
            }

            if (emojiEl) emojiEl.textContent = emoji;
            if (titleEl) titleEl.textContent = phaseName;
            if (projectEl) projectEl.textContent = rn.note || '';
            if (noteEl) noteEl.textContent = rn.statusDetail || '';
            
            // NEW: Update compact widget description with the phase
            const compactDescEl = document.getElementById('iww-desc');
            const compactTagEl = document.getElementById('iww-status-tag');
            if (compactDescEl) compactDescEl.textContent = rn.title || '–';
            if (compactTagEl) compactTagEl.textContent = rn.title || '–';
          }

          const vibe = data.vibe;
          if (vibe) {
            const vTitle = document.getElementById('iwe-vibe-title');
            const vNote = document.getElementById('iwe-vibe-note');
            if (vTitle) vTitle.textContent = vibe.title || '';
            if (vNote) {
              const energyMap = {
                'hyperfocus': '⚡ high energy',
                'referencing': '📚 learning',
                'stuck': '🚧 creative block',
                'shipping': '🚀 delivering',
                'flow': '🌊 in the zone',
                'chilling': '☕ low energy'
              };
              vNote.textContent = energyMap[vibe.title?.toLowerCase()] || '✨ vibe check';
            }
          }

          const working = data.workingOn;
          const workingBlock = document.getElementById('iwe-working-block');
          if (workingBlock) {
            if (!working || working.trim() === '') {
              workingBlock.style.visibility = 'hidden';
              workingBlock.style.opacity = '0';
            } else {
              workingBlock.style.visibility = 'visible';
              workingBlock.style.opacity = '1';
              const wTitle = document.getElementById('iwe-working-title');
              const wNote = document.getElementById('iwe-working-note');
              if (wTitle) wTitle.textContent = working;
              if (wNote && typeof globalLatestFileTime !== 'undefined' && globalLatestFileTime > 0) {
                const diffMs = Date.now() - globalLatestFileTime;
                const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
                let timeStr = "just now";
                if (diffDays > 0) timeStr = diffDays + "d ago";
                else if (diffHours > 0) timeStr = diffHours + "h ago";
                wNote.textContent = "🎬 last: " + timeStr;
              }
            }
          }
        } catch (e) {
          console.log("Status update error:", e);
        }
      }
      // Expose for immediate admin updates
      window.populateStatusManually = (data) => {
        const rn = data.rightNow;
        if (!rn) return;
        const titleEl = document.getElementById('iwe-status-title');
        const projectEl = document.getElementById('iwe-status-project');
        const noteEl = document.getElementById('iwe-status-note');
        const emojiEl = document.getElementById('iwe-status-emoji');
        
        let fullTitle = rn.title || '';
        let phaseName = fullTitle;
        let emoji = '✂️';
        const emojiMatch = fullTitle.match(/^(\ud83c[\udf00-\uffff]|\ud83d[\udf00-\uffff]|\ud83e[\udf00-\uffff]|[\u2700-\u27bf]|[\u2000-\u3299])/);
        if (emojiMatch) {
          emoji = emojiMatch[0];
          phaseName = fullTitle.replace(emoji, '').trim();
        }
        if (emojiEl) emojiEl.textContent = emoji;
        if (titleEl) titleEl.textContent = phaseName;
        if (projectEl) projectEl.textContent = rn.note || '';
        if (noteEl) noteEl.textContent = rn.statusDetail || '';
        
        // NEW: Update compact widget description with the phase
        const compactDescEl = document.getElementById('iww-desc');
        const compactTagEl = document.getElementById('iww-status-tag');
        if (compactDescEl) compactDescEl.textContent = rn.title || '–';
        if (compactTagEl) compactTagEl.textContent = rn.title || '–';
        
        // Also update vibe and working on
        if (data.vibe) {
          const vTitle = document.getElementById('iwe-vibe-title');
          if (vTitle) vTitle.textContent = data.vibe.title || '';
        }
        if (data.workingOn !== undefined) {
          const wTitle = document.getElementById('iwe-working-title');
          if (wTitle) wTitle.textContent = data.workingOn;
        }
      };
      populateStatus();

      tickClock();
      setInterval(tickClock, 30000);
      fetchWeather();
      setInterval(fetchWeather, 10 * 60 * 1000);
    })();

    // ── iOS Smart Stack (gesture carousel, infinite loop) ─────────────────────
    (function () {
      const frame = document.getElementById('sstack-frame');
      const cards = frame ? Array.from(frame.querySelectorAll('.sstack-card')) : [];
      const dotsWrap = document.getElementById('sstack-dots');
      const dotEls = dotsWrap ? Array.from(dotsWrap.querySelectorAll('.sstack-dot')) : [];
      if (!frame || cards.length < 2) return;

      const N = cards.length;
      const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
      const DUR = 420;            // ms for snap
      const THRESHOLD = 38;             // px to switch card
      let H = frame.offsetHeight || 148;

      let activeIdx = 1;                 // which card is the front one — start with Explore on top
      let dragY = 0;                 // current drag offset in px (front card's translateY)
      let dragDir = -1;                // -1 = advance (up), +1 = go back (down)
      let dragging = false;
      let startY = 0;
      let pointerId = null;
      let hideTimer = null;

      // Slower, gentler snap for programmatic transitions like the auto-advance
      // after "all explored" — the user isn't actively swiping, so we let the
      // card glide up with more drama.
      const SLOW_DUR = 1100;
      const SLOW_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

      // Render all cards at their positions. At rest (dragY=0) only slot 0 is in
      // view; the slot -1 and slot +1 cards sit off-screen above/below the frame
      // and are naturally clipped by overflow:hidden. During drag the front card
      // moves and the neighbour slides in from the opposite side. Transitions
      // handle the snap-home animation automatically when activeIdx changes.
      function render(animated, slow) {
        const dur = slow ? SLOW_DUR : DUR;
        const ease = slow ? SLOW_EASE : EASE;
        cards.forEach((card, i) => {
          const offset = (i - activeIdx + N) % N;
          let slot;
          if (offset === 0) slot = 0;
          else if (N === 2) slot = dragDir < 0 ? +1 : -1;  // only one "other" card
          else if (offset === 1) slot = +1;
          else if (offset === N - 1) slot = -1;
          else slot = null;

          if (slot === null) {
            // This card isn't adjacent — park it off-screen, invisible.
            card.style.transition = 'none';
            card.style.transform = `translateY(${2 * H}px)`;
            card.style.opacity = '0';
            card.style.pointerEvents = 'none';
            return;
          }

          const ty = slot * H + dragY;
          // Gentle scale-down as a card moves away from the center.
          const dist = Math.min(1, Math.abs(ty) / H);
          const scale = 1 - dist * 0.06;

          card.style.transition = animated
            ? `transform ${dur}ms ${ease}, opacity ${dur}ms ${ease}`
            : 'none';
          card.style.transform = `translateY(${ty}px) scale(${scale})`;
          card.style.opacity = '1';
          card.style.zIndex = slot === 0 ? '100' : '99';
          card.style.pointerEvents = slot === 0 ? 'auto' : 'none';
        });

        updateDots();
      }

      function updateDots() {
        if (!dotEls.length) return;
        dotEls.forEach((d, i) => {
          d.classList.toggle('is-active', i === activeIdx);
        });
      }

      function flashDots() {
        if (!dotsWrap) return;
        dotsWrap.style.opacity = '1';
        frame.classList.add('is-dragging');         // outline tracks dots
        if (hideTimer) clearTimeout(hideTimer);
        if (dragging) return;                       // keep both visible while dragging
        hideTimer = setTimeout(() => {
          dotsWrap.style.opacity = '0';
          frame.classList.remove('is-dragging');    // outline fades together with dots
        }, 1500);
      }

      // Pointer handlers
      let downTarget = null;
      let captured = false;
      frame.addEventListener('pointerdown', (e) => {
        // Don't hijack clicks on interactive children
        if (e.target.closest('a, button')) return;
        dragging = true;
        startY = e.clientY;
        dragY = 0;
        pointerId = e.pointerId;
        downTarget = e.target;
        captured = false;
        H = frame.offsetHeight || 148;
        flashDots();
      });

      frame.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        let dy = e.clientY - startY;
        if (!captured && Math.abs(dy) > 4) {
          // Only capture once real drag intent is clear — lets pure taps
          // still reach onclick handlers on child elements.
          captured = true;
          try { frame.setPointerCapture(pointerId); } catch (_) { }
          frame.style.cursor = 'grabbing';
        }
        // Rubber-band a little past the card
        if (Math.abs(dy) > H) dy = Math.sign(dy) * (H + (Math.abs(dy) - H) * 0.35);
        dragY = dy;
        if (Math.abs(dy) > 2) dragDir = Math.sign(dy);
        render(false);
      });

      function endDrag(e) {
        if (!dragging) return;
        dragging = false;
        if (captured) {
          frame.style.cursor = 'grab';
          try { frame.releasePointerCapture(pointerId); } catch (_) { }
        }
        captured = false;

        // Decide: snap back or advance
        let cardChanged = false;
        if (dragY <= -THRESHOLD) {
          activeIdx = (activeIdx + 1) % N;
          dragY = 0; dragDir = +1; cardChanged = true;
          render(true);
        } else if (dragY >= THRESHOLD) {
          activeIdx = (activeIdx - 1 + N) % N;
          dragY = 0; dragDir = -1; cardChanged = true;
          render(true);
        } else {
          dragY = 0;
          render(true);
        }
        flashDots();
        // Let other components know which card is now in front.
        if (cardChanged) notifyCardChange(activeIdx);
      }

      // Fan-out card-change events to every subscriber. Widget IIFEs push a
      // listener onto window.sstackCardHandlers; the legacy single-handler
      // window.sstackOnCardChange is still supported for back-compat.
      function notifyCardChange(idx) {
        if (Array.isArray(window.sstackCardHandlers)) {
          for (const fn of window.sstackCardHandlers) {
            try { fn(idx); } catch (e) { }
          }
        }
        if (typeof window.sstackOnCardChange === 'function') {
          try { window.sstackOnCardChange(idx); } catch (e) { }
        }
      }

      // Expose current active card for querying (e.g. portfolio IIFE).
      window.sstackGetActiveIdx = () => activeIdx;
      // Programmatic "swipe up" — advance to the next card. Used e.g. to
      // auto-reveal the next widget after the user has finished exploring the
      // whole portfolio route. Uses the slow/gentle easing by default so the
      // unprompted switch reads as a graceful reveal, not a snap.
      window.sstackNext = function (opts) {
        if (N < 2) return;
        const slow = !opts || opts.slow !== false;   // default: slow
        dragDir = -1;           // advance direction
        activeIdx = (activeIdx + 1) % N;
        dragY = 0;
        render(true, slow);
        flashDots();
        notifyCardChange(activeIdx);
      };
      frame.addEventListener('pointerup', endDrag);
      frame.addEventListener('pointercancel', endDrag);
      frame.addEventListener('pointerleave', endDrag);

      // Handle resize (orientation change etc.)
      window.addEventListener('resize', () => {
        H = frame.offsetHeight || 148;
        if (!dragging) render(false);
      });

      // Init — briefly reveal the outline + dots so the user sees it's a stack
      requestAnimationFrame(() => {
        H = frame.offsetHeight || 148;
        render(false);
        // Wait until the iOS intro-blur animation has mostly settled before hinting.
        setTimeout(() => {
          flashDots();  // flashDots fades outline + dots together via the shared timer
        }, 900);
      });
    })();

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

    // ── iOS Live Activity: Portfolio Exploration ──────────────────────────────
    // Slot-based, visit-order-aware Smart Stack widget.
    //
    // Animation rules:
    //   • Only the NEWLY filled segment animates (0 → 100%). Pre-existing fills
    //     stay at 100% instantly — no redundant replay.
    //   • If the portfolio card is NOT currently showing when ilaVisit() fires,
    //     we render silently (instant) and set pendingAnim=true. When the user
    //     swipes to reveal the card, ALL filled segments animate together once.
    (function () {
      const SECTIONS = ['home', 'edits', 'magazin', 'bts'];
      const LABELS = { home: 'Home', edits: 'Edits', magazin: 'Magazin', bts: 'BTS' };
      const COLORS = { home: '#e0e0e0', edits: '#7c3aed', magazin: '#dc2626', bts: '#b91c1c' };
      // Solid empty rail — matches the expanded portfolio view's design.
      const SEG_EMPTY = 'rgba(255,255,255,0.08)';

      const visited = ['home'];      // ordered by first-visit; 'home' always first
      let current = 'home';
      let pendingAnim = false;     // true when visits happened off-screen
      let autoAdvanceDone = false; // only ever auto-switch once, after first full exploration
      let autoAdvanceTimer = null;

      // Schedule an auto-advance to the next Smart Stack widget once the route
      // animation has had time to finish + the user has had a few seconds to
      // admire the completed line. If the user has the portfolio expanded when
      // the timer fires, defer the advance until they collapse it.
      let pendingAdvanceOnClose = false;
      function runAdvance() {
        if (autoAdvanceDone) return;
        if (window.iosPortfolioIsOpen && window.iosPortfolioIsOpen()) {
          pendingAdvanceOnClose = true;
          return;
        }
        if (typeof window.sstackGetActiveIdx === 'function'
          && window.sstackGetActiveIdx() === 1
          && visited.length === SECTIONS.length
          && typeof window.sstackNext === 'function') {
          autoAdvanceDone = true;
          window.sstackNext();
        }
      }
      function scheduleAutoAdvance(afterMs) {
        if (autoAdvanceDone) return;
        if (autoAdvanceTimer) clearTimeout(autoAdvanceTimer);
        autoAdvanceTimer = setTimeout(() => {
          autoAdvanceTimer = null;
          runAdvance();
        }, afterMs);
      }
      // Called by closePortfolio() so a deferred advance can fire once the
      // user has collapsed the widget.
      window.ilaResumeAdvance = function () {
        if (!pendingAdvanceOnClose) return;
        pendingAdvanceOnClose = false;
        setTimeout(runAdvance, 600);
      };

      function displayOrder() {
        const unvisited = SECTIONS.filter(s => !visited.includes(s));
        return [...visited, ...unvisited];
      }

      // Returns boolean[3] — which of the 3 segments are currently filled.
      function getFilledState() {
        const o = displayOrder();
        return [0, 1, 2].map(i => visited.includes(o[i]) && visited.includes(o[i + 1]));
      }

      function textColorForBg(section) {
        return section === 'home' ? '#1a1a1a' : '#ffffff';
      }

      // Track whether this is the very first render pass — we don't want the
      // blur-swap to play on initial paint, only when a value actually changes
      // later (e.g. after a visit).
      let firstRender = true;

      // Restart the blur→sharp swap animation on the element. Used whenever the
      // text (or badge color) actually changes — skipped when nothing changed so
      // we don't re-animate on every render pass.
      function playBlurSwap(el) {
        if (!el || firstRender) return;
        el.classList.remove('ila-blur-swap');
        // Force a reflow so removing + re-adding the class restarts the animation.
        void el.offsetWidth;
        el.classList.add('ila-blur-swap');
      }

      function renderBadge() {
        const badge = document.getElementById('ila-badge');
        if (!badge) return;
        const txt = LABELS[current].toUpperCase();
        const bg = COLORS[current];
        const col = textColorForBg(current);
        const changed = badge.textContent !== txt
          || badge.dataset.bg !== bg
          || badge.dataset.col !== col;
        if (!changed) return;
        badge.textContent = txt;
        badge.style.background = bg;
        badge.style.color = col;
        badge.dataset.bg = bg;
        badge.dataset.col = col;
        playBlurSwap(badge);
      }

      function renderTitle() {
        const title = document.getElementById('ila-title');
        const sub = document.getElementById('ila-sub');
        const order = displayOrder();
        const nextUnvisited = order.find(s => !visited.includes(s));
        if (title) {
          const txt = nextUnvisited
            ? 'Up next: ' + LABELS[nextUnvisited]
            : 'All sections explored';
          if (title.textContent !== txt) {
            title.textContent = txt;
            playBlurSwap(title);
          }
        }
        if (sub) {
          const txt = visited.length + ' of ' + SECTIONS.length + ' explored';
          if (sub.textContent !== txt) {
            sub.textContent = txt;
            playBlurSwap(sub);
          }
        }
      }

      function renderSlots() {
        const order = displayOrder();
        order.forEach((section, i) => {
          const slotEl = document.querySelector('.ila-slot[data-slot="' + (i + 1) + '"]');
          if (!slotEl) return;
          slotEl.innerHTML = '';
          const v = visited.includes(section), c = section === current;
          const col = COLORS[section];
          const dot = document.createElement('div');
          dot.style.borderRadius = '50%';
          dot.style.transition = 'all 0.35s ease';
          if (c) {
            dot.style.width = dot.style.height = '16px';
            dot.style.background = col;
            dot.style.boxShadow = '0 0 0 3px ' + col + '40, 0 0 10px ' + col + '60';
          } else if (v) {
            dot.style.width = dot.style.height = '13px';
            dot.style.background = col;
            dot.style.boxShadow = 'none';
          } else {
            dot.style.width = dot.style.height = '11px';
            dot.style.background = 'transparent';
            dot.style.boxShadow = '0 0 0 2px rgba(255,255,255,0.22)';
          }
          slotEl.appendChild(dot);
          const label = document.createElement('span');
          label.textContent = LABELS[section];
          label.style.cssText =
            'position:absolute; top:22px; left:50%; transform:translateX(-50%);' +
            'white-space:nowrap; font-size:9px; font-weight:600; letter-spacing:0.06em;' +
            'text-transform:uppercase; color:rgba(255,255,255,' +
            (c ? '0.85' : v ? '0.6' : '0.4') + ');';
          slotEl.appendChild(label);
        });
      }

      // Render segments. `animateIdxs` = array of 0-based segment indices to
      // animate (0→100%). All other segments are set to their target instantly.
      function renderSegs(animateIdxs) {
        const order = displayOrder();
        const filled = getFilledState();
        for (let i = 0; i < 3; i++) {
          const segEl = document.querySelector('.ila-seg[data-seg="' + (i + 1) + '"]');
          if (!segEl) continue;
          const fillEl = segEl.querySelector('.ila-seg-fill');
          segEl.style.background = SEG_EMPTY;
          if (!fillEl) continue;
          fillEl.style.background = 'linear-gradient(to right,' + COLORS[order[i]] + ',' + COLORS[order[i + 1]] + ')';
          if (animateIdxs.includes(i)) {
            const target = filled[i] ? '100%' : '0%';
            fillEl.style.transition = 'none';
            fillEl.style.width = '0%';
            // Short timeout lets the browser commit the 0% paint before animating.
            ; (function (el, w) {
              setTimeout(() => {
                el.style.transition = 'width 0.9s cubic-bezier(0.2,0.7,0.2,1)';
                el.style.width = w;
              }, 30);
            })(fillEl, target);
          } else {
            fillEl.style.transition = 'none';
            fillEl.style.width = filled[i] ? '100%' : '0%';
          }
        }
      }

      // Full replay: each filled seg animates from 0 → 100 %, ONE AFTER THE OTHER,
      // so the line traces the user's visit order like a route (home → app₁ → app₂ …).
      // Used when the portfolio card is revealed after off-screen visits.
      function replayAllAnim() {
        renderBadge(); renderTitle(); renderSlots();
        const order = displayOrder();
        const filled = getFilledState();
        const fills = [0, 1, 2].map(i =>
          document.querySelector('.ila-seg[data-seg="' + (i + 1) + '"] .ila-seg-fill'));

        const SEG_DUR = 650;  // ms per segment — snappy enough to feel alive
        const GAP = 40;   // small breather between legs

        // Snap all fills to 0 (no transition) …
        fills.forEach((el, i) => {
          if (!el) return;
          el.style.background = 'linear-gradient(to right,' + COLORS[order[i]] + ',' + COLORS[order[i + 1]] + ')';
          el.style.transition = 'none';
          el.style.width = '0%';
        });

        // … then after a short delay (gives browser time to commit the 0% paint),
        // chain each filled segment so they draw the route in order.
        setTimeout(() => {
          let delay = 0;
          for (let i = 0; i < 3; i++) {
            const el = fills[i];
            if (!el) continue;
            if (!filled[i]) {
              el.style.transition = 'none';
              el.style.width = '0%';
              continue;
            }
            ; (function (node, d) {
              setTimeout(() => {
                node.style.transition = 'width ' + SEG_DUR + 'ms cubic-bezier(0.2,0.7,0.2,1)';
                node.style.width = '100%';
              }, d);
            })(el, delay);
            delay += SEG_DUR + GAP;
          }
        }, 30);
      }

      // Called when the smart stack switches cards (fired from the carousel IIFE).
      window.sstackOnCardChange = function (idx) {
        if (idx === 1 && pendingAnim) {
          pendingAnim = false;
          replayAllAnim();
          // Route replay takes ~30 + 3*(650+40) = ~2100 ms at most. Give the
          // user ~2.5 s to admire the completed line, then auto-advance.
          if (visited.length === SECTIONS.length) {
            scheduleAutoAdvance(2100 + 2500);
          }
        }
      };

      // Let the expanded weather close handler re-sync the compact arc position.
      window.iwwRefreshArc = () => updateArc(new Date());

      // Expose read-only state for the expanded Portfolio view to render its own
      // larger, stylised timeline (cloning the compact widget DOM looks bad).
      window.ilaGetState = function () {
        return { SECTIONS, LABELS, COLORS, visited: visited.slice(), current, displayOrder: displayOrder(), filled: getFilledState() };
      };

      window.ilaVisit = function (section) {
        if (!SECTIONS.includes(section)) return;
        // Capture which segments were filled BEFORE this visit.
        const wasFilledBefore = getFilledState();
        if (!visited.includes(section)) visited.push(section);
        current = section;
        const filledNow = getFilledState();
        // Newly filled = segments that just transitioned to filled state.
        const newlyFilled = [0, 1, 2].filter(i => !wasFilledBefore[i] && filledNow[i]);

        const portfolioVisible = typeof window.sstackGetActiveIdx === 'function'
          && window.sstackGetActiveIdx() === 1;

        renderBadge();
        renderTitle();
        renderSlots();

        if (portfolioVisible) {
          // Widget is visible: animate only the new segment, leave others instant.
          renderSegs(newlyFilled);
          // If this visit just filled the last segment, plan to auto-advance
          // after the segment animation (~930 ms) + ~2.5 s of admire time.
          if (visited.length === SECTIONS.length) {
            scheduleAutoAdvance(930 + 2500);
          }
        } else {
          // Widget hidden: render instantly, queue a full replay for when it appears.
          renderSegs([]);   // all instant, no animation
          if (newlyFilled.length > 0) pendingAnim = true;
          // The auto-advance will be scheduled once the user reveals the card
          // (see sstackOnCardChange above).
        }
      };

      // Initial render — no animation on first paint.
      renderBadge(); renderTitle(); renderSlots(); renderSegs([]);
      firstRender = false;
    })();

