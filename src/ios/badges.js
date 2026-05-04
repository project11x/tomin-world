// iOS-style red notification badges on the iOS dock app icons.
// Counts items added in the last 90 days, per app domain.

import { portfolioData } from '../../data.js';
import { isItemRecent, recentMagazines } from '../utils/recency.js';

function makeBadge(count) {
  const b = document.createElement('div');
  b.className = 'ios-app-badge';
  b.textContent = count > 99 ? '99+' : String(count);
  b.style.cssText = `
    position:absolute; top:-4px; right:-4px; min-width:22px; height:22px;
    padding:0 6px; box-sizing:border-box;
    background:rgb(255,69,58); color:#fff;
    font-size:12px; font-weight:700; letter-spacing:-0.01em;
    border-radius:999px; display:flex; align-items:center; justify-content:center;
    box-shadow:0 1px 4px rgba(0,0,0,0.25), 0 0 0 2px var(--ios-dock-bg, rgba(255,255,255,0.5));
    pointer-events:none; z-index:2;
    animation: ios-badge-pop 280ms cubic-bezier(0.34,1.56,0.64,1);
  `;
  return b;
}

function countRecentEdits() {
  let n = 0;
  Object.keys(portfolioData).forEach((folder) => {
    if (folder.includes('/')) return;
    (portfolioData[folder] || []).forEach((it) => {
      if (!it.isVideo) return;
      const nameNoExt = it.name.replace(/\.[^/.]+$/, '');
      const digits = (nameNoExt.match(/\d/g) || []).length;
      if (digits > 3) return;
      if (isItemRecent(it)) n++;
    });
  });
  return n;
}

function countRecentBts() {
  let n = 0;
  Object.keys(portfolioData).forEach((folder) => {
    if (folder.includes('/')) return;
    (portfolioData[folder] || []).forEach((it) => {
      if (it.isMagazine) return;
      const nameNoExt = it.name.replace(/\.[^/.]+$/, '');
      const digits = (nameNoExt.match(/\d/g) || []).length;
      if (digits < 4) return;
      if (isItemRecent(it)) n++;
    });
  });
  return n;
}

export function renderIosBadges() {
  const targets = [
    { app: 'edits', count: countRecentEdits() },
    { app: 'magazines', count: recentMagazines().length },
    { app: 'bts', count: countRecentBts() },
  ];
  targets.forEach(({ app, count }) => {
    const item = document.querySelector(`.ios-dock-item[data-ios-app="${app}"]`);
    if (!item) return;
    item.querySelector('.ios-app-badge')?.remove();
    if (count > 0) {
      item.style.position = 'relative';
      const wrap = item.querySelector('div'); // the icon wrapper
      (wrap || item).style.position = 'relative';
      (wrap || item).appendChild(makeBadge(count));
    }
  });
}

// Inject keyframes once
(function injectBadgeAnim() {
  if (document.getElementById('ios-badge-anim')) return;
  const s = document.createElement('style');
  s.id = 'ios-badge-anim';
  s.textContent = `
    @keyframes ios-badge-pop {
      0%   { transform: scale(0); opacity: 0; }
      60%  { transform: scale(1.1); }
      100% { transform: scale(1); opacity: 1; }
    }
  `;
  document.head.appendChild(s);
})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderIosBadges, { once: true });
} else {
  renderIosBadges();
}
window.addEventListener('portfolio-updated', renderIosBadges);
