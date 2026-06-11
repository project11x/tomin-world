// Daily Frame — desktop modal wrapper.
//
// The actual game lives at /daily-frame (standalone HTML + JS, also
// mobile-first). On desktop we load it inside an iframe inside a
// floating window with the classic red traffic-light dot, draggable
// header, and Escape-to-close. On mobile we full-navigate instead so
// the standalone page can take over the screen — see iOS journal-app.

import { bringToFront, createWindow } from '../windows.js';

export function openDailyFrameModal() {
  // Mobile: full navigation so the standalone page renders edge-to-edge.
  if (window.innerWidth <= 768) {
    location.href = '/daily-frame';
    return;
  }

  // Avoid stacking duplicates.
  document.getElementById('journal-game-modal')?.remove();

  const modal = document.createElement('div');
  modal.id = 'journal-game-modal';
  // Note: no Tailwind translate classes — we use explicit left/top in px
  // so the drag handler can mutate them without fighting the transforms.
  modal.className =
    'app-window fixed ' +
    'bg-white/95 dark:bg-slate-900/95 glass-panel rounded-xl border ' +
    'border-white/40 dark:border-white/10 ring-1 ring-black/5 shadow-2xl ' +
    'overflow-hidden flex flex-col z-[200]';
  const modalW = Math.min(560, window.innerWidth - 32);
  const modalH = Math.min(760, window.innerHeight - 80);
  modal.style.width = `${modalW}px`;
  modal.style.height = `${modalH}px`;
  modal.style.left = `${(window.innerWidth - modalW) / 2}px`;
  modal.style.top = `${(window.innerHeight - modalH) / 2}px`;

  modal.innerHTML = `
    <div class="draggable-handle h-10 shrink-0 flex items-center px-4
                border-b border-slate-200/20 dark:border-white/5
                bg-slate-100/40 dark:bg-black/20 backdrop-blur-lg
                cursor-default select-none">
      <div id="journal-game-close"
           class="w-3 h-3 relative rounded-full bg-red-500 hover:bg-red-600
                  transition-colors shadow-sm cursor-pointer
                  before:absolute before:-inset-1.5 before:content-['']"
           title="Close"></div>
      <span class="flex-1 text-center text-[12px] font-semibold
                   text-slate-500 dark:text-slate-400 mr-8">Daily Frame</span>
    </div>
    <iframe src="/daily-frame" class="journal-game-frame"
            style="flex:1; width:100%; border:none; background:transparent;"></iframe>
  `;

  document.body.appendChild(modal);

  const closeModal = () => {
    modal.remove();
    window.removeEventListener('keydown', esc);
    window.removeEventListener('message', onMessage);
  };
  modal.querySelector('#journal-game-close')?.addEventListener('click', closeModal);
  const esc = (e) => { if (e.key === 'Escape') closeModal(); };
  window.addEventListener('keydown', esc);

  // Bridge events from the iframe page — close + hand-off to the Finder
  // window when the player taps "Watch <edit>" after solving.
  const onMessage = (e) => {
    if (e.origin !== window.location.origin) return;
    if (!e.data || typeof e.data !== 'object') return;
    if (e.data.type === 'daily-frame:close') closeModal();
    if (e.data.type === 'daily-frame:watch' && typeof e.data.edit === 'string') {
      closeModal();
      requestAnimationFrame(() => createWindow(e.data.edit));
    }
  };
  window.addEventListener('message', onMessage);

  modal.addEventListener('mousedown', () => bringToFront(modal));

  const handle = modal.querySelector('.draggable-handle');
  if (handle) {
    handle.addEventListener('mousedown', (e) => {
      if (e.target.closest('#journal-game-close')) return;
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
}
