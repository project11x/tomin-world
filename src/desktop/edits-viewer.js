// Edits Viewer — full-screen reel of all the short videos in the portfolio.
import { portfolioData } from '../../data.js';
import { safePlayVideo, killOtherVideos, attachBeachball } from '../utils/video.js';
import { switchToSpace } from './spaces.js';
import { createWindow } from './windows.js';
import { setIcon } from '../utils/icons.js';
import { playStream, stopStream } from '../utils/stream.js';
import { accentForFolder } from '../utils/edit-posters.js';

const editsViewer = document.getElementById('edits-viewer');
const editsList = document.getElementById('edits-list');
const editsVideo = document.getElementById('edits-video');
const editsEmpty = document.getElementById('edits-empty');
const btnCloseEdits = document.getElementById('btn-close-edits');

// Attach beachball to desktop edits video
const desktopEditsBB = attachBeachball(editsVideo, editsVideo.parentElement);

let editsItems = [];
let selectedEditIndex = -1;

// ── Live ambilight ──────────────────────────────────────────────────────────
// Sample the playing video into a tiny canvas and glow the two ambient pools
// with the average colour of its left/right half, lerped smoothly each frame.
// Cross-origin tainted canvas (Safari native-HLS) throws on getImageData — we
// catch that and fall back to the edit's static dominant colour.
const AMBI_W = 32, AMBI_H = 18, AMBI_SAMPLE_MS = 140, AMBI_LERP = 0.09, AMBI_MAX_TAINT = 30;
const ambiReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let ambiRAF = null, ambiCanvas = null, ambiCtx = null, ambiLast = 0;
// ambiReady: only sample once the CURRENT edit's first frame is decoded, so a
// switch never samples the still-displayed previous edit (no stale colour).
// ambiBlocked: sampling impossible for this edit (tainted canvas) → hold its
// seed colour so the panel never goes blank.
let ambiReady = false, ambiBlocked = false, ambiTaintCount = 0;
let ambiCurL = [40, 40, 46], ambiCurR = [40, 40, 46];
let ambiTgtL = [40, 40, 46], ambiTgtR = [40, 40, 46];

function ensureAmbiCanvas() {
  if (ambiCanvas) return;
  ambiCanvas = document.createElement('canvas');
  ambiCanvas.width = AMBI_W; ambiCanvas.height = AMBI_H;
  ambiCtx = ambiCanvas.getContext('2d', { willReadFrequently: true });
}

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec((hex || '').trim());
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
}
function avgRegion(data, w, h, c0, c1) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = 0; y < h; y++) {
    for (let x = c0; x < c1; x++) {
      const i = (y * w + x) * 4;
      r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
    }
  }
  return n ? [r / n, g / n, b / n] : [0, 0, 0];
}
function lerpRgb(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
// Push a colour away from its own grey (saturation/vibrance boost) so averaged
// frames don't read as muddy beige — the ambilight stays vivid.
function boostSat(rgb, f) {
  const g = (rgb[0] + rgb[1] + rgb[2]) / 3;
  return [
    Math.max(0, Math.min(255, g + (rgb[0] - g) * f)),
    Math.max(0, Math.min(255, g + (rgb[1] - g) * f)),
    Math.max(0, Math.min(255, g + (rgb[2] - g) * f)),
  ];
}
function writeAmbi() {
  editsViewer.style.setProperty('--edits-accent-l',
    `rgb(${Math.round(ambiCurL[0])},${Math.round(ambiCurL[1])},${Math.round(ambiCurL[2])})`);
  editsViewer.style.setProperty('--edits-accent-r',
    `rgb(${Math.round(ambiCurR[0])},${Math.round(ambiCurR[1])},${Math.round(ambiCurR[2])})`);
}
function ambiTick(t) {
  ambiRAF = requestAnimationFrame(ambiTick);
  if (ambiReady && !ambiBlocked && editsVideo.readyState >= 2 && !editsVideo.paused
      && editsVideo.videoWidth && editsVideo.currentTime > 0 && t - ambiLast > AMBI_SAMPLE_MS) {
    ambiLast = t;
    try {
      ambiCtx.drawImage(editsVideo, 0, 0, AMBI_W, AMBI_H);
      const d = ambiCtx.getImageData(0, 0, AMBI_W, AMBI_H).data;
      ambiTgtL = boostSat(avgRegion(d, AMBI_W, AMBI_H, 0, AMBI_W / 2), 1.8);
      ambiTgtR = boostSat(avgRegion(d, AMBI_W, AMBI_H, AMBI_W / 2, AMBI_W), 1.8);
      ambiTaintCount = 0;
    } catch {
      // A tainted canvas stays poisoned — recreate and retry for a few frames;
      // if it keeps failing (e.g. non-CORS source), stop sampling THIS edit and
      // just hold its seed colour. The loop keeps running (never dies), so the
      // panel stays stable and the next edit can sample again.
      ambiCanvas = null; ambiCtx = null; ensureAmbiCanvas();
      if (++ambiTaintCount > AMBI_MAX_TAINT) ambiBlocked = true;
    }
  }
  // Always lerp cur → tgt and write, so the pools crossfade smoothly to the new
  // seed on a switch and to live colours once sampling is active.
  ambiCurL = lerpRgb(ambiCurL, ambiTgtL, AMBI_LERP);
  ambiCurR = lerpRgb(ambiCurR, ambiTgtR, AMBI_LERP);
  writeAmbi();
}
// Snap the backlight to this edit's dominant colour IMMEDIATELY (synchronously,
// no dependence on the rAF loop) so a switch is always stable — never stale,
// never blank. The live sampler then drifts the colour from this seed toward
// the actual frames, but only once THIS edit's first frame is decoded
// (ambiMarkReady), so it can never sample the still-displayed previous edit.
function setEditAmbient(accentRgb) {
  const seed = accentRgb ? boostSat(accentRgb, 1.35) : [40, 40, 46];
  ambiCurL = seed.slice(); ambiCurR = seed.slice();
  ambiTgtL = seed.slice(); ambiTgtR = seed.slice();
  ambiReady = false; ambiBlocked = false; ambiTaintCount = 0; ambiLast = 0;
  writeAmbi();
  if (ambiReducedMotion || typeof requestAnimationFrame !== 'function') return;
  ensureAmbiCanvas();
  if (!ambiRAF) ambiRAF = requestAnimationFrame(ambiTick);
}
// Allow sampling the current edit — called once its first frame is decoded.
function ambiMarkReady() { ambiReady = true; }
function stopAmbilight() {
  if (ambiRAF) cancelAnimationFrame(ambiRAF);
  ambiRAF = null; ambiReady = false;
}

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
    setIcon(editsPlayPause, 'pause_circle');
  } else {
    editsVideo.pause();
    setIcon(editsPlayPause, 'play_circle');
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

editsVideo.addEventListener('play', () => { setIcon(editsPlayPause, 'pause_circle'); });
editsVideo.addEventListener('pause', () => { setIcon(editsPlayPause, 'play_circle'); });

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
  // Tint the ambient backlight: seed with this edit's dominant colour, then run
  // the live frame sampler on top of it.
  const accent = accentForFolder(item.folder);
  editsViewer.style.setProperty('--edits-accent', accent || 'transparent');
  setEditAmbient(hexToRgb(accent));
  const editsRightCard = document.getElementById('edits-right-card');
  // Hide the video INSTANTLY (transition:none, not a 150ms fade-out) and drop
  // the previous edit's poster before swapping the source. The <video> is
  // reused across edits, so a fade-out would briefly show its stale poster —
  // which playStream only sets once, so it was always the first edit (5am).
  editsVideo.style.transition = 'none';
  editsVideo.style.opacity = '0';
  editsVideo.removeAttribute('poster');
  playStream(editsVideo, item.src);
  // Feed the real video ratio to the CSS fit-contain sizing (see #edits-right-card).
  editsVideo.addEventListener('loadedmetadata', function updateAspect() {
    editsVideo.removeEventListener('loadedmetadata', updateAspect);
    if (editsRightCard && editsVideo.videoWidth && editsVideo.videoHeight) {
      editsRightCard.style.setProperty('--r', (editsVideo.videoWidth / editsVideo.videoHeight).toFixed(4));
    }
  });
  editsVideo.addEventListener('loadeddata', function showFrame() {
    editsVideo.removeEventListener('loadeddata', showFrame);
    // Fade in only now that the first real frame of THIS edit is decoded.
    editsVideo.style.transition = 'opacity 0.15s ease';
    editsVideo.style.opacity = '1';
    ambiMarkReady(); // begin live-sampling THIS edit (never the stale previous one)
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
  stopStream(editsVideo);
  if (editsEmpty) editsEmpty.style.display = '';

  switchToSpace('edits');

  // Auto-select first edit directly (no setTimeout = stays in user gesture context)
  selectEdit(0, true);
};

btnCloseEdits.addEventListener('click', () => {
  switchToSpace('desktop');
  editsVideo.pause();
  stopStream(editsVideo);
  stopAmbilight();
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
  const magazineReader = document.getElementById('magazine-reader');
  if (magazineReader && magazineReader.classList.contains('pointer-events-auto')) {
    document.getElementById('btn-close-magazine')?.click();
    return;
  }

  // Otherwise, open Finder (creating a new window if none exist)
  const firstFolder = Object.keys(portfolioData).find(k => !k.includes('/')) || '';
  createWindow(firstFolder);
};

