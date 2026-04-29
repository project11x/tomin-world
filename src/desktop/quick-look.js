// Quick Look modal — preview an image or video pulled from a finder window.
import { safePlayVideo, killOtherVideos, attachBeachball } from '../utils/video.js';
import { bringToFront } from './windows.js';

window.openQuickLook = function (item) {
  const quickLookTitle = document.getElementById('quick-look-title');
  const quickLookContent = document.getElementById('quick-look-content');
  const quickLookModal = document.getElementById('quick-look-modal');
  quickLookTitle.innerText = item.name;

  const qlControls = document.getElementById('quick-look-controls');
  let contentHtml;
  if (item.isVideo) {
    // Default 16:9 size so modal opens at correct dimensions before video loads
    contentHtml = `<video class="object-contain block" src="${item.src}" loop playsinline style="width:min(640px,85vw);aspect-ratio:16/9;max-height:75vh;"></video>`;
    qlControls.style.display = '';
  } else {
    // Lock the image to a constant viewport height so every Quick Look
    // window opens at roughly the same Y size, regardless of whether
    // the photo is portrait, square or landscape — the WIDTH adapts to
    // the photo's aspect ratio (capped at 85vw for very wide shots).
    contentHtml = `<img class="block object-contain"
                        style="height:70vh; width:auto; max-width:85vw; max-height:70vh;"
                        src="${item.src}" />`;
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

document.getElementById('btn-close-quick-look').addEventListener('click', window.closeQuickLook);

document.addEventListener('keydown', (e) => {
  const quickLookModal = document.getElementById('quick-look-modal');
  if (quickLookModal.classList.contains('hidden')) return;
  if (e.key === 'Escape') {
    window.closeQuickLook();
  } else if (e.code === 'Space') {
    e.preventDefault();
    const v = quickLookModal.querySelector('video');
    if (v) { if (v.paused) v.play(); else v.pause(); }
  }
});

// --- Legacy Cleanup Done ---






