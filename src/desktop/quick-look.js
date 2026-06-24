import { EASE_SPRING } from '../utils/motion.js';
// Quick Look modal — preview an image or video pulled from a finder window.
import { portfolioData } from '../../data.js';
import { safePlayVideo, killOtherVideos, attachBeachball } from '../utils/video.js';
import { bringToFront } from './windows.js';
import { makeShareButton } from '../utils/share.js';
import { setIcon } from '../utils/icons.js';
import { srcsetAttr } from '../utils/media.js';
import { playStream } from '../utils/stream.js';

// Folder context of the currently shown item — drives ←/→ navigation and
// neighbour preloading. null when Quick Look was opened without context.
let qlCtx = null;

// Items the arrows can land on: plain images/videos, no magazines.
function qlNavigable(folder) {
  const items = portfolioData[folder] || [];
  return items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !item.isMagazine && !portfolioData[folder + '/' + item.name]);
}

function qlStep(dir) {
  if (!qlCtx) return;
  const list = qlNavigable(qlCtx.folder);
  const pos = list.findIndex(({ index }) => index === qlCtx.index);
  if (pos < 0) return;
  const next = list[(pos + dir + list.length) % list.length];
  if (!next || next.index === qlCtx.index) return;
  window.openQuickLook(next.item, null, { folder: qlCtx.folder, index: next.index });
}

// Warm the browser cache for the items next to the current one so an arrow
// press never waits on the network.
function qlPreloadNeighbours() {
  if (!qlCtx) return;
  const list = qlNavigable(qlCtx.folder);
  const pos = list.findIndex(({ index }) => index === qlCtx.index);
  if (pos < 0) return;
  [list[(pos + 1) % list.length], list[(pos - 1 + list.length) % list.length]]
    .forEach((n) => {
      if (n && !n.item.isVideo && n.item.src) { new Image().src = n.item.src; }
    });
}

// FLIP morph from the clicked Finder thumbnail to the modal's final box.
// Composes with the modal's centering transform (Tailwind -translate-1/2)
// by prepending the computed base matrix.
function qlMorphFrom(modal, sourceEl) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const r = sourceEl.getBoundingClientRect();
  const m = modal.getBoundingClientRect();
  if (!r.width || !m.width) return;
  const cs = getComputedStyle(modal).transform;
  const base = cs && cs !== 'none' ? cs + ' ' : '';
  const dx = (r.left + r.width / 2) - (m.left + m.width / 2);
  const dy = (r.top + r.height / 2) - (m.top + m.height / 2);
  const scale = Math.max(0.06, r.width / m.width);
  modal.style.transformOrigin = 'center center';
  modal.style.transition = 'none';
  modal.style.transform = `${base}translate(${dx}px, ${dy}px) scale(${scale})`;
  // Drive opacity inline during the morph — the element's own
  // `transition-opacity duration-300` class would keep the modal nearly
  // invisible through the small early phase where the morph reads best.
  modal.style.opacity = '0.5';
  void modal.offsetWidth;
  modal.style.transition =
    'transform 320ms ' + EASE_SPRING + ', opacity 120ms ease';
  modal.style.transform = base.trim() || '';
  modal.style.opacity = '1';
  setTimeout(() => {
    modal.style.transition = '';
    modal.style.transform = '';
    modal.style.transformOrigin = '';
    modal.style.opacity = '';
  }, 360);
}

(function injectQuickLookShare() {
  const header = document.querySelector('#quick-look-modal .draggable-handle');
  if (!header) return;
  const btn = makeShareButton({ size: 18, getUrl: () => location.href, getTitle: () => document.title });
  btn.style.marginLeft = 'auto';
  header.appendChild(btn);
})();

window.openQuickLook = function (item, sourceEl = null, ctx = null) {
  const quickLookTitle = document.getElementById('quick-look-title');
  const quickLookContent = document.getElementById('quick-look-content');
  const quickLookModal = document.getElementById('quick-look-modal');
  const wasHidden = quickLookModal.classList.contains('hidden');
  qlCtx = ctx;
  quickLookTitle.innerText = item.name;

  const qlControls = document.getElementById('quick-look-controls');
  let contentHtml;
  if (item.isVideo) {
    // Default 16:9 size so modal opens at correct dimensions before video loads
    contentHtml = `<video class="object-contain block" loop playsinline style="width:min(640px,85vw);aspect-ratio:16/9;max-height:75vh;"></video>`;
    qlControls.style.display = '';
  } else {
    // Lock the image to a constant viewport height so every Quick Look
    // window opens at roughly the same Y size, regardless of whether
    // the photo is portrait, square or landscape — the WIDTH adapts to
    // the photo's aspect ratio (capped at 85vw for very wide shots).
    contentHtml = `<img class="block object-contain"
                        style="height:70vh; width:auto; max-width:85vw; max-height:70vh;"
                        src="${item.src}"${srcsetAttr(item.src, '85vw')} />`;
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
    playStream(videoEl, item.src);
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
    videoEl.addEventListener('play', () => { setIcon(newPlay, 'pause_circle'); });
    videoEl.addEventListener('pause', () => { setIcon(newPlay, 'play_circle'); });

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

  // Raise the z-index BEFORE the modal becomes visible, otherwise it
  // flashes behind the Finder window for a frame and then jumps to the
  // front. We also skip View Transitions here — the cross-fade conflicts
  // with our manual z-index and feels heavier than a plain opacity tween.
  bringToFront(quickLookModal);

  const reveal = () => {
    quickLookModal.classList.remove('hidden');
    // Morph only on a fresh open with a known source thumbnail — arrow
    // navigation swaps content in place instead.
    if (wasHidden && sourceEl) {
      requestAnimationFrame(() => qlMorphFrom(quickLookModal, sourceEl));
    }
    requestAnimationFrame(() => {
      quickLookModal.classList.remove('opacity-0');
      quickLookModal.classList.add('opacity-100');
    });
    qlPreloadNeighbours();
  };

  // For images, wait (briefly) for the decode so the morph targets the
  // modal's real size — measuring while the <img> is still 0×0 would morph
  // onto the collapsed min-width box and then visibly re-layout.
  const imgEl = quickLookContent.querySelector('img');
  if (wasHidden && imgEl && !imgEl.complete && imgEl.decode) {
    Promise.race([
      imgEl.decode().catch(() => {}),
      new Promise((r) => setTimeout(r, 350)),
    ]).then(reveal);
  } else {
    reveal();
  }
};

window.closeQuickLook = function () {
  const quickLookModal = document.getElementById('quick-look-modal');
  const quickLookContent = document.getElementById('quick-look-content');
  // Plain opacity fade — View Transitions snapshotted the modal at its
  // current z-index, which made it appear to close BEHIND the Finder
  // window once the snapshot dissolved.
  quickLookModal.classList.remove('opacity-100');
  quickLookModal.classList.add('opacity-0');
  qlCtx = null;
  setTimeout(() => {
    quickLookModal.classList.add('hidden');
    quickLookContent.innerHTML = '';
  }, 300);
  window.dispatchEvent(new CustomEvent('item-closed'));
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
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    qlStep(1);
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    qlStep(-1);
  }
});

// --- Legacy Cleanup Done ---






