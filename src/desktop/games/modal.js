// Shared modal helper for the Journal's mini-games.
//
// Desktop: floating window with the red traffic-light dot, drag handle,
// Escape to close — same chrome as the Daily Frame modal.
// Mobile (≤768px): full-screen sheet that slides up from the bottom,
// matching the iOS Pin sheet pattern.
//
// Each game module calls openGameModal({ id, title, render }) and gets
// back a host node it can paint anything into, plus a close() callback.

import { bringToFront } from '../windows.js';

/**
 * @param {{
 *   id: string,
 *   title: string,
 *   width?: number,
 *   height?: number,
 *   onClose?: () => void,
 *   render: (host: HTMLElement, close: () => void) => void,
 * }} opts
 */
export function openGameModal(opts) {
  // Broadcast for the stamps system — Marathoner counts every game
  // opened today, regardless of which shell rendered it.
  if (opts && opts.id) {
    window.dispatchEvent(new CustomEvent('journal:game-opened', {
      detail: { id: opts.id },
    }));
  }
  if (window.innerWidth <= 768) return openIosSheet(opts);
  return openDesktopModal(opts);
}

// ── Desktop floating window ────────────────────────────────────────

function openDesktopModal({ id, title, width = 560, height = 720, onClose, render }) {
  // Replace any existing modal of the same id so games don't stack.
  document.getElementById(id)?.remove();

  const modal = document.createElement('div');
  modal.id = id;
  modal.className =
    'app-window fixed ' +
    'bg-white/95 dark:bg-slate-900/95 glass-panel rounded-xl border ' +
    'border-white/40 dark:border-white/10 ring-1 ring-black/5 shadow-2xl ' +
    'overflow-hidden flex flex-col z-[200]';
  const w = Math.min(width, window.innerWidth - 32);
  const h = Math.min(height, window.innerHeight - 80);
  modal.style.width = `${w}px`;
  modal.style.height = `${h}px`;
  modal.style.left = `${(window.innerWidth - w) / 2}px`;
  modal.style.top = `${(window.innerHeight - h) / 2}px`;

  modal.innerHTML = `
    <div class="draggable-handle h-10 shrink-0 flex items-center px-4
                border-b border-slate-200/20 dark:border-white/5
                bg-slate-100/40 dark:bg-black/20 backdrop-blur-lg
                cursor-default select-none">
      <div data-close
           class="w-3 h-3 relative rounded-full bg-red-500 hover:bg-red-600
                  transition-colors shadow-sm cursor-pointer
                  before:absolute before:-inset-1.5 before:content-['']"
           title="Close"></div>
      <span class="flex-1 text-center text-[12px] font-semibold
                   text-slate-500 dark:text-slate-400 mr-8">${escapeHtml(title)}</span>
    </div>
    <div class="journal-game-body" data-body></div>
  `;

  document.body.appendChild(modal);

  const close = () => {
    modal.remove();
    window.removeEventListener('keydown', onEsc);
    if (typeof onClose === 'function') onClose();
  };
  modal.querySelector('[data-close]')?.addEventListener('click', close);
  const onEsc = (e) => { if (e.key === 'Escape') close(); };
  window.addEventListener('keydown', onEsc);

  // Focus on mousedown
  modal.addEventListener('mousedown', () => bringToFront(modal));

  // Drag from title bar
  const handle = modal.querySelector('.draggable-handle');
  if (handle) {
    handle.addEventListener('mousedown', (e) => {
      if (e.target.closest('[data-close]')) return;
      const rect = modal.getBoundingClientRect();
      const offX = e.clientX - rect.left;
      const offY = e.clientY - rect.top;
      modal.classList.add('dragging-window');
      const move = (ev) => {
        modal.style.left = `${ev.clientX - offX}px`;
        modal.style.top = `${ev.clientY - offY}px`;
      };
      const up = () => {
        modal.classList.remove('dragging-window');
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    });
  }

  bringToFront(modal);

  const body = modal.querySelector('[data-body]');
  render(body, close);

  return { modal, body, close };
}

// ── Mobile bottom sheet ────────────────────────────────────────────

function openIosSheet({ id, title, onClose, render }) {
  document.getElementById(id)?.remove();

  const sheet = document.createElement('div');
  sheet.id = id;
  sheet.className = 'ios-pin-sheet'; // reuses the slide-up animation
  sheet.innerHTML = `
    <div class="ios-pin-sheet-header">
      <button class="ios-pin-sheet-close" data-close aria-label="Close">
        <span class="material-symbols-rounded" style="font-size:22px;">close</span>
      </button>
      <div class="ios-pin-sheet-title">${escapeHtml(title)}</div>
      <div style="width:36px;"></div>
    </div>
    <div class="ios-pin-sheet-body" data-body></div>
  `;
  document.body.appendChild(sheet);
  requestAnimationFrame(() => sheet.classList.add('is-open'));

  const close = () => {
    sheet.classList.remove('is-open');
    setTimeout(() => {
      sheet.remove();
      if (typeof onClose === 'function') onClose();
    }, 320);
  };
  sheet.querySelector('[data-close]')?.addEventListener('click', close);

  const body = sheet.querySelector('[data-body]');
  render(body, close);

  return { modal: sheet, body, close };
}

// ── helpers ────────────────────────────────────────────────────────

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c] || c));
}
