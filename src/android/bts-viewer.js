// Material 3 BTS Viewer.
// Full-screen swipeable gallery for BTS images and videos. Reuses the
// magazines-reader chrome (.md-mag-pages scroll-snap, floating bar).
// Open via window.androidOpenBtsViewer(folderName, index).

import { portfolioData } from '../../data.js';

(function () {
  const overlay = document.getElementById('android-bts-viewer');
  if (!overlay) return;

  const pagesEl = document.getElementById('android-bts-pages');
  const counter = document.getElementById('android-bts-counter');
  const titlePill = document.getElementById('android-bts-title-pill');

  let files = [];
  let currentFolder = '';

  function collectBtsFiles(folder) {
    const items = portfolioData[folder] || [];
    return items.filter(item => {
      const nameNoExt = item.name.replace(/\.[^/.]+$/, '');
      const digitCount = (nameNoExt.match(/\d/g) || []).length;
      return digitCount >= 4 && !item.isMagazine;
    });
  }

  function paintCounter() {
    const w = pagesEl.clientWidth || 1;
    const idx = Math.round(pagesEl.scrollLeft / w);
    counter.textContent = `${Math.min(files.length, idx + 1)} / ${files.length}`;
  }

  function open(folder, index) {
    currentFolder = folder;
    files = collectBtsFiles(folder);
    if (files.length === 0) return;
    titlePill.textContent = folder;
    pagesEl.innerHTML = files.map(f => `
      <div class="md-mag-page">
        ${f.isVideo
          ? `<video src="${f.src}" controls playsinline preload="metadata"></video>`
          : `<img src="${f.src}" loading="lazy" />`}
      </div>
    `).join('');
    overlay.classList.add('open');
    requestAnimationFrame(() => {
      pagesEl.scrollTo({ left: pagesEl.clientWidth * (index || 0), behavior: 'instant' in pagesEl.scrollTo ? 'instant' : 'auto' });
      paintCounter();
    });
  }

  function close() {
    overlay.classList.remove('open');
    pagesEl.querySelectorAll('video').forEach(v => { try { v.pause(); } catch (e) { /* ignore */ } });
    setTimeout(() => { pagesEl.innerHTML = ''; }, 50);
  }

  pagesEl.addEventListener('scroll', () => {
    paintCounter();
  }, { passive: true });

  overlay.querySelector('[data-android-bts-close]').addEventListener('click', close);

  const shareBtn = overlay.querySelector('[data-android-bts-share]');
  if (shareBtn) {
    shareBtn.addEventListener('click', async () => {
      const w = pagesEl.clientWidth || 1;
      const idx = Math.max(0, Math.round(pagesEl.scrollLeft / w));
      const f = files[idx];
      if (!f) return;
      try {
        if (navigator.share) {
          await navigator.share({ title: currentFolder, url: location.origin + (f.src.startsWith('/') ? f.src : '/' + f.src) });
        }
      } catch (err) { /* cancelled */ }
    });
  }

  window.androidOpenBtsViewer = open;
})();
