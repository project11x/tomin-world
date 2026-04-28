// Video utilities: buffered playback, single-active enforcement,
// and a beachball loader overlay attached to a <video>.

// Ensures smooth video playback: waits for enough buffer before playing,
// auto-pauses if buffer runs low, resumes when buffered enough.
export function safePlayVideo(video) {
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

// Kill all other video downloads to free bandwidth for the active video.
export function killOtherVideos(activeVideo) {
  document.querySelectorAll('video').forEach(v => {
    if (v !== activeVideo && v.src && !v.closest('.mag-page-container') && !v.muted) {
      v.pause();
      v.removeAttribute('src');
      v.load(); // releases network connection
    }
  });
}

// Beachball loader: attach to any video element, shows while buffering.
const BEACHBALL_SVG = `<svg width="40" height="40" viewBox="0.5 0.5 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style="animation:beachball-spin 1s linear infinite; will-change:transform; display:block;"><g><path d="M12.046 7.54443C12.8194 7.64041 13.5869 7.88962 14.3043 8.30383C17.1741 9.96068 18.1573 13.6302 16.5005 16.5C14.8436 13.6302 11.1741 12.647 8.3043 14.3038C7.58791 14.7174 6.98908 15.2565 6.51953 15.8772C6.74422 12.2205 8.934 9.09532 12.046 7.54443Z" fill="url(#bb_g0)"/><path d="M6.51908 15.8772C6.98862 15.2565 7.58745 14.7175 8.30385 14.3039C11.1736 12.647 14.8431 13.6303 16.5 16.5C13.1863 16.5 10.5 19.1863 10.5 22.5C10.5 23.3277 10.6676 24.1163 10.9707 24.8336C8.27601 23.0421 6.5 19.9785 6.5 16.5C6.5 16.2909 6.50642 16.0832 6.51908 15.8772Z" fill="url(#bb_g1)"/><path d="M10.9707 24.8336C10.6676 24.1163 10.5 23.3277 10.5 22.5C10.5 19.1863 13.1863 16.5 16.5 16.5C14.8431 19.3698 15.8264 23.0393 18.6962 24.6962C19.4136 25.1104 20.181 25.3596 20.9545 25.4555C19.6131 26.124 18.1005 26.5 16.5 26.5C14.4556 26.5 12.5545 25.8865 10.9707 24.8336Z" fill="url(#bb_g2)"/><path d="M20.9546 25.4555C20.1812 25.3596 19.4137 25.1104 18.6963 24.6962C15.8266 23.0393 14.8433 19.3698 16.5002 16.5C18.157 19.3698 21.8266 20.353 24.6963 18.6962C25.4127 18.2825 26.0115 17.7435 26.4811 17.1228C26.2564 20.7794 24.0666 23.9047 20.9546 25.4555Z" fill="url(#bb_g3)"/><path d="M26.4809 17.1229C26.0114 17.7436 25.4125 18.2826 24.6962 18.6962C21.8264 20.3531 18.1569 19.3698 16.5 16.5001C19.8137 16.5001 22.5 13.8138 22.5 10.5001C22.5 9.67238 22.3324 8.88383 22.0293 8.1665C24.724 9.95801 26.5 13.0216 26.5 16.5001C26.5 16.7092 26.4936 16.9169 26.4809 17.1229Z" fill="url(#bb_g4)"/><path d="M22.0306 8.16642C22.3337 8.88375 22.5013 9.6723 22.5013 10.5C22.5013 13.8137 19.8151 16.5 16.5013 16.5C18.1582 13.6302 17.1749 9.9607 14.3052 8.30385C13.5878 7.88964 12.8203 7.64043 12.0469 7.54445C13.3882 6.87599 14.9009 6.5 16.5013 6.5C18.5457 6.5 20.4469 7.11349 22.0306 8.16642Z" fill="url(#bb_g5)"/></g><defs><linearGradient id="bb_g0" x1="6.52" y1="7.54" x2="6.52" y2="16.5" gradientUnits="userSpaceOnUse"><stop stop-color="#FFD305"/><stop offset="1" stop-color="#FDCF01"/></linearGradient><linearGradient id="bb_g1" x1="6.5" y1="13.5" x2="6.5" y2="24.83" gradientUnits="userSpaceOnUse"><stop stop-color="#52CF30"/><stop offset="1" stop-color="#3BBD1C"/></linearGradient><linearGradient id="bb_g2" x1="10.5" y1="16.5" x2="10.5" y2="26.5" gradientUnits="userSpaceOnUse"><stop stop-color="#14ADF6"/><stop offset="1" stop-color="#1191F4"/></linearGradient><linearGradient id="bb_g3" x1="15.7" y1="16.5" x2="15.7" y2="25.46" gradientUnits="userSpaceOnUse"><stop stop-color="#CA70E1"/><stop offset="1" stop-color="#B452CB"/></linearGradient><linearGradient id="bb_g4" x1="16.5" y1="8.17" x2="16.5" y2="19.5" gradientUnits="userSpaceOnUse"><stop stop-color="#FF645D"/><stop offset="1" stop-color="#FF4332"/></linearGradient><linearGradient id="bb_g5" x1="12.05" y1="6.5" x2="12.05" y2="16.5" gradientUnits="userSpaceOnUse"><stop stop-color="#FBB114"/><stop offset="1" stop-color="#FF9508"/></linearGradient></defs></svg>`;

export function attachBeachball(video, container) {
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
