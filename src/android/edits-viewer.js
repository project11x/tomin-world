// Material 3 Edits Viewer.
// Full-screen overlay with M3 Top App Bar + video stage + controls.
// Open via window.androidOpenEditsViewer(items, index); items come from the
// Edits-tab list. Reuses Bootstrap Icons for the controls.

import { portfolioData } from '../../data.js';
import { playStream, stopStream } from '../utils/stream.js';

(function () {
  const overlay = document.getElementById('android-edits-viewer');
  if (!overlay) return;

  const video = document.getElementById('android-edits-video');
  const title = document.getElementById('android-edits-title');
  const folder = document.getElementById('android-edits-folder');
  const name = document.getElementById('android-edits-name');
  const playIcon = document.getElementById('android-edits-play-icon');
  const slider = overlay.querySelector('[data-android-edits-slider]');
  const fill = document.getElementById('android-edits-fill');
  const buffered = document.getElementById('android-edits-buffered');
  const thumb = document.getElementById('android-edits-thumb');
  const currentEl = document.getElementById('android-edits-current');
  const durationEl = document.getElementById('android-edits-duration');

  function fmtTime(sec) {
    if (!Number.isFinite(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  function paintSlider() {
    if (!video.duration || !Number.isFinite(video.duration)) return;
    const pct = (video.currentTime / video.duration) * 100;
    fill.style.width = pct + '%';
    thumb.style.left = pct + '%';
    currentEl.textContent = fmtTime(video.currentTime);
    if (video.buffered.length > 0) {
      const end = video.buffered.end(video.buffered.length - 1);
      buffered.style.width = ((end / video.duration) * 100) + '%';
    }
  }

  video.addEventListener('timeupdate', paintSlider);
  video.addEventListener('loadedmetadata', () => {
    durationEl.textContent = fmtTime(video.duration);
    paintSlider();
  });
  video.addEventListener('progress', paintSlider);

  // Slider drag handling — pointer events for touch + mouse
  let dragging = false;
  function setFromPointer(e) {
    if (!video.duration) return;
    const rect = slider.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const clamped = Math.max(0, Math.min(1, x));
    video.currentTime = clamped * video.duration;
    paintSlider();
  }
  slider.addEventListener('pointerdown', (e) => {
    dragging = true;
    slider.classList.add('dragging');
    slider.setPointerCapture(e.pointerId);
    setFromPointer(e);
  });
  slider.addEventListener('pointermove', (e) => {
    if (dragging) setFromPointer(e);
  });
  const endDrag = (e) => {
    dragging = false;
    slider.classList.remove('dragging');
    try { slider.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  };
  slider.addEventListener('pointerup', endDrag);
  slider.addEventListener('pointercancel', endDrag);

  let queue = [];
  let cursor = 0;

  function collectEdits() {
    const out = [];
    Object.keys(portfolioData).forEach(folderKey => {
      if (folderKey.startsWith('TOMIN INDEX.TXT') || folderKey === 'icons') return;
      const items = portfolioData[folderKey];
      if (!Array.isArray(items)) return;
      const seen = new Set();
      items.forEach(item => {
        if (!item.isVideo) return;
        const nameNoExt = item.name.replace(/\.[^/.]+$/, '');
        const digitCount = (nameNoExt.match(/\d/g) || []).length;
        if (digitCount > 3) return;
        const baseName = nameNoExt.replace(/_(web|compressed)$/i, '').trim();
        if (seen.has(baseName)) return;
        seen.add(baseName);
        out.push({ folder: folderKey, baseName, src: item.src });
      });
    });
    return out;
  }

  function load(idx) {
    if (queue.length === 0) queue = collectEdits();
    if (queue.length === 0) return;
    cursor = ((idx % queue.length) + queue.length) % queue.length;
    const e = queue[cursor];
    playStream(video, e.src);
    title.textContent = e.baseName;
    folder.textContent = e.folder;
    name.textContent = e.baseName;
    video.play().catch(() => { /* user-gesture required on some browsers */ });
  }

  function open(idx) {
    queue = collectEdits();
    overlay.classList.add('open');
    load(idx);
  }

  function close() {
    overlay.classList.remove('open');
    video.pause();
    stopStream(video);
  }

  function togglePlay() {
    if (video.paused) video.play(); else video.pause();
  }

  video.addEventListener('play', () => playIcon.className = 'bi bi-pause-fill');
  video.addEventListener('pause', () => playIcon.className = 'bi bi-play-fill');
  video.addEventListener('ended', () => load(cursor + 1));

  overlay.querySelector('[data-android-edits-close]').addEventListener('click', close);
  overlay.querySelector('[data-android-edits-prev]').addEventListener('click', () => load(cursor - 1));
  overlay.querySelector('[data-android-edits-next]').addEventListener('click', () => load(cursor + 1));
  overlay.querySelector('[data-android-edits-play]').addEventListener('click', togglePlay);
  const fsBtn = overlay.querySelector('[data-android-edits-fullscreen]');
  const fsIcon = fsBtn ? fsBtn.querySelector('[data-edits-fs-icon]') : null;
  function paintFsIcon() {
    if (!fsIcon) return;
    fsIcon.className = document.fullscreenElement
      ? 'bi bi-fullscreen-exit'
      : 'bi bi-arrows-fullscreen';
  }
  if (fsBtn) {
    fsBtn.addEventListener('click', async () => {
      try {
        // iOS Safari: only <video> supports fullscreen, via webkitEnterFullscreen.
        if (typeof video.webkitEnterFullscreen === 'function'
            && !overlay.requestFullscreen
            && !overlay.webkitRequestFullscreen) {
          if (video.readyState < 1) {
            await new Promise((res) => {
              video.addEventListener('loadedmetadata', res, { once: true });
              setTimeout(res, 800);
            });
          }
          video.webkitEnterFullscreen();
          return;
        }
        if (document.fullscreenElement || document.webkitFullscreenElement) {
          const exit = document.exitFullscreen || document.webkitExitFullscreen;
          if (exit) await exit.call(document);
        } else {
          const req = overlay.requestFullscreen
            || overlay.webkitRequestFullscreen
            || overlay.msRequestFullscreen;
          if (req) await req.call(overlay);
        }
      } catch (err) {
        console.warn('[edits] fullscreen toggle failed:', err);
      }
    });
  }
  document.addEventListener('fullscreenchange', paintFsIcon);

  // Tap stage to toggle play
  overlay.querySelector('.md-viewer-stage').addEventListener('click', togglePlay);

  window.androidOpenEditsViewer = open;
})();
