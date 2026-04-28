// Edits Viewer — full-screen reel of all the short videos in the portfolio.
import { portfolioData } from '../../data.js';
import { safePlayVideo, killOtherVideos, attachBeachball } from '../utils/video.js';
import { switchToSpace } from './spaces.js';
import { createWindow } from './windows.js';

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
  const magazineReader = document.getElementById('magazine-reader');
  if (magazineReader && magazineReader.classList.contains('pointer-events-auto')) {
    document.getElementById('btn-close-magazine')?.click();
    return;
  }

  // Otherwise, open Finder (creating a new window if none exist)
  const firstFolder = Object.keys(portfolioData).find(k => !k.includes('/')) || '';
  createWindow(firstFolder);
};

