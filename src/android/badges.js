// Material 3 notification badges — small red pills on the bottom-nav
// (mobile) and side-rail (desktop) buttons. Counts items added in the
// last 30 days for the Edits and Magazines domains. BTS is intentionally
// excluded — those are extras attached to projects, not standalone work.

import { recentEdits, recentMagazines } from '../utils/recency.js';

function makeBadge(count) {
  const b = document.createElement('span');
  b.className = 'md-nav-badge';
  b.textContent = count > 99 ? '99+' : String(count);
  return b;
}

function paint(el, count) {
  if (!el) return;
  el.querySelector('.md-nav-badge')?.remove();
  if (count <= 0) return;
  el.style.position = el.style.position || 'relative';
  // For the mobile bottom-nav pill, prefer attaching to the icon pill so
  // the badge sits above the icon; on the desktop rail we attach to the
  // button itself.
  const host = el.querySelector('.md-bottom-nav-pill') || el;
  host.style.position = 'relative';
  host.appendChild(makeBadge(count));
}

export function renderAndroidBadges() {
  const editCount = recentEdits().length;
  const magCount = recentMagazines().length;

  // Mobile bottom-nav (Material You phone shell)
  paint(document.querySelector('.md-bottom-nav-item[data-android-tab="edits"]'), editCount);
  paint(document.querySelector('.md-bottom-nav-item[data-android-tab="magazines"]'), magCount);

  // Desktop side rail (Material 3 desktop shell)
  paint(document.querySelector('.m3d-rail-item[data-tab="edits"]'), editCount);
  paint(document.querySelector('.m3d-rail-item[data-tab="magazines"]'), magCount);
}

(function injectBadgeStyles() {
  if (document.getElementById('md-nav-badge-style')) return;
  const s = document.createElement('style');
  s.id = 'md-nav-badge-style';
  s.textContent = `
    .md-nav-badge {
      position: absolute; top: -2px; right: -6px;
      min-width: 18px; height: 18px; padding: 0 5px; box-sizing: border-box;
      background: var(--md-sys-color-error, #b3261e); color: var(--md-sys-color-on-error, #fff);
      font-family: 'Roboto', system-ui, sans-serif;
      font-size: 11px; font-weight: 600; line-height: 1;
      border-radius: 999px;
      display: inline-flex; align-items: center; justify-content: center;
      box-shadow: 0 1px 3px rgba(0,0,0,0.25);
      pointer-events: none; z-index: 2;
      animation: md-nav-badge-pop 240ms cubic-bezier(0.34,1.56,0.64,1);
    }
    .m3d-rail-item .md-nav-badge { top: 2px; right: 6px; }
    @keyframes md-nav-badge-pop {
      0% { transform: scale(0); opacity: 0; }
      60% { transform: scale(1.1); }
      100% { transform: scale(1); opacity: 1; }
    }
  `;
  document.head.appendChild(s);
})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderAndroidBadges, { once: true });
} else {
  renderAndroidBadges();
}
window.addEventListener('portfolio-updated', renderAndroidBadges);
