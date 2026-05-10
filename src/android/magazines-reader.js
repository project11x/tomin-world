// Material 3 Magazines Reader.
// Full-screen overlay. Loads pages from portfolioData[`<folder>/<magname>`],
// renders them in a vertical scroll-snap container, shows a floating page
// indicator that updates on scroll.

import { portfolioData } from '../../data.js';

(function () {
  const overlay = document.getElementById('android-magazines-reader');
  if (!overlay) return;

  const titlePill = document.getElementById('android-mag-title-pill');
  const pagesEl = document.getElementById('android-mag-pages');
  const counterEl = document.getElementById('android-mag-counter');

  let pages = [];

  function open(mag) {
    if (!mag) return;
    const key = mag.folder + '/' + mag.name;
    pages = portfolioData[key] || [];
    if (titlePill) titlePill.textContent = (mag.name || '').replace(/\.[^/.]+$/, '');
    pagesEl.innerHTML = pages.map(p => `
      <div class="md-mag-page">
        <img src="${p.src}" alt="" loading="lazy" />
      </div>
    `).join('');
    counterEl.textContent = `1 / ${pages.length}`;
    overlay.classList.add('open');
    pagesEl.scrollLeft = 0;
  }

  function close() {
    overlay.classList.remove('open');
    pagesEl.innerHTML = '';
    pages = [];
  }

  // Update page counter as the user scrolls horizontally
  pagesEl.addEventListener('scroll', () => {
    if (pages.length === 0) return;
    const w = pagesEl.clientWidth;
    if (w === 0) return;
    const idx = Math.min(Math.round(pagesEl.scrollLeft / w) + 1, pages.length);
    counterEl.textContent = `${idx} / ${pages.length}`;
  }, { passive: true });

  overlay.querySelector('[data-android-mag-close]').addEventListener('click', close);
  const shareBtn = overlay.querySelector('[data-android-mag-share]');
  if (shareBtn) {
    shareBtn.addEventListener('click', async () => {
      const title = titlePill ? titlePill.textContent : 'Magazine';
      try {
        if (navigator.share) await navigator.share({ title, url: location.href });
      } catch (e) { /* user cancelled or unsupported */ }
    });
  }

  window.androidOpenMagazinesReader = open;
})();
