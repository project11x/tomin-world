// ─────────────────────────────────────────────────────────────────────
// Journal — Board section (constrained pinboard)
//
// Renders the cork-board view used by the Board tab in the Journal app
// and the iOS Journal scroll page. Visitors pin one polaroid (chosen
// from Eddie's photos) per 24h, optionally with a vibe sticker + their
// city stamp. No free text input → no moderation.
//
// API: /api/pinboard (GET) + /api/pin (POST) + /api/pin (PUT, admin).
// ─────────────────────────────────────────────────────────────────────

import { portfolioData } from '../../data.js';
import { syncFromExternal as syncRings } from './journal-rings.js';

// ── visitor id (persists across sessions for "my pin" highlighting) ──
const VISITOR_ID_KEY = 'journal:visitor-id';
export function getVisitorId() {
  let id = '';
  try {
    id = localStorage.getItem(VISITOR_ID_KEY) || '';
  } catch {}
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
    try { localStorage.setItem(VISITOR_ID_KEY, id); } catch {}
  }
  return id;
}

// Sticker preset — must mirror src/api/pin.js's STICKERS list.
export const STICKERS = ['✨', '🌙', '🔥', '✂️', '🎬', '📸', '🎵', '🍷', '🌅', '⚡', '🥀', '💎'];

// ── photo collection from portfolioData ─────────────────────────────
export function collectPinablePhotos() {
  const photos = [];
  for (const [folder, items] of Object.entries(portfolioData)) {
    if (folder.includes('/')) continue; // skip magazine sub-keys
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (item.isVideo || item.isMagazine) continue;
      if (!item.src) continue;
      photos.push({ folder, name: item.name, src: item.src });
    }
  }
  return photos;
}

// ── rendering ────────────────────────────────────────────────────────

export function renderBoard(host) {
  host.innerHTML = `
    <div class="journal-board">
      <div class="journal-board-header">
        <div class="journal-board-title">Eddie's Board</div>
        <button class="journal-board-pin-btn" data-jboard="pin">+ Pin yours</button>
      </div>
      <div class="journal-board-cork" data-jboard-grid>
        <div class="journal-board-loading">Loading…</div>
      </div>
    </div>
  `;
  host.querySelector('[data-jboard="pin"]')?.addEventListener('click', openPinCreator);
  loadAndPaintPins(host.querySelector('[data-jboard-grid]'));
}

async function loadAndPaintPins(grid) {
  if (!grid) return;
  try {
    const res = await fetch('/api/pinboard');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const pins = data.pins || [];
    paintPins(grid, pins);
  } catch (e) {
    grid.innerHTML = `<div class="journal-board-empty">Couldn't load the board right now.</div>`;
  }
}

function paintPins(grid, pins) {
  if (!pins.length) {
    grid.innerHTML = `
      <div class="journal-board-empty">
        <div style="font-size:42px; opacity:0.55;">📌</div>
        <div style="margin-top:8px;">Nothing pinned yet.</div>
        <div style="opacity:0.65; font-size:13px;">Be the first to pin a polaroid.</div>
      </div>
    `;
    return;
  }
  const myId = getVisitorId();
  grid.innerHTML = pins.map((pin) => renderPinHTML(pin, pin.visitorId === myId)).join('');
}

function renderPinHTML(pin, isMine) {
  // Deterministic-but-random rotation so every render of the same pin
  // stays put (no jitter on refresh).
  const rotation = ((Number(pin.id) * 37) % 11) - 5; // −5° … +5°
  const src = resolveSrc(pin.src);
  const stickerHtml = pin.sticker
    ? `<div class="journal-pin-sticker" title="vibe">${pin.sticker}</div>`
    : '';
  const cityHtml = pin.city
    ? `<div class="journal-pin-city">from ${escapeHtml(pin.city)}</div>`
    : '';
  const mineHtml = isMine ? `<div class="journal-pin-mine" title="your pin">★</div>` : '';
  return `
    <div class="journal-pin ${isMine ? 'is-mine' : ''}" style="transform: rotate(${rotation}deg);">
      <div class="journal-pin-polaroid">
        <img src="${escapeAttr(src)}" alt="" loading="lazy" draggable="false" />
      </div>
      ${cityHtml}
      ${stickerHtml}
      ${mineHtml}
    </div>
  `;
}

// The DB stores the raw relative src (no R2 prefix). In production, the
// main app prepends an R2 base URL to portfolioData entries at boot —
// reuse that logic via the live patched srcs from portfolioData. Falls
// back to a plain leading slash when the photo isn't in the manifest
// anymore (or we're running on localhost).
function resolveSrc(rawSrc) {
  if (!rawSrc) return '';
  if (/^https?:\/\//.test(rawSrc)) return rawSrc;
  // Try to find the matching entry in portfolioData and use its (possibly
  // R2-prefixed) src so the photo loads on every environment.
  for (const folder of Object.keys(portfolioData)) {
    const items = portfolioData[folder];
    if (!Array.isArray(items)) continue;
    const hit = items.find((it) => it.src === rawSrc || it.src?.endsWith(rawSrc));
    if (hit) return hit.src;
  }
  return rawSrc.startsWith('/') ? rawSrc : '/' + rawSrc;
}

// ── pin-creation modal ──────────────────────────────────────────────

let creatorOpen = false;

export function openPinCreator() {
  if (creatorOpen) return;
  creatorOpen = true;

  // Mobile gets a full-screen iOS-style sheet; desktop keeps the floating
  // window with the red traffic-light dot.
  if (window.innerWidth <= 768) {
    openPinCreatorIos();
    return;
  }

  const photos = collectPinablePhotos();

  const modal = document.createElement('div');
  modal.id = 'journal-pin-creator';
  modal.className =
    'app-window fixed bg-white/95 dark:bg-slate-900/95 glass-panel ' +
    'rounded-xl border border-white/40 dark:border-white/10 ring-1 ring-black/5 ' +
    'shadow-2xl overflow-hidden flex flex-col z-[210]';
  const w = Math.min(640, window.innerWidth - 32);
  const h = Math.min(720, window.innerHeight - 80);
  modal.style.width = `${w}px`;
  modal.style.height = `${h}px`;
  modal.style.left = `${(window.innerWidth - w) / 2}px`;
  modal.style.top = `${(window.innerHeight - h) / 2}px`;

  modal.innerHTML = `
    <div class="draggable-handle h-10 shrink-0 flex items-center px-4
                border-b border-slate-200/20 dark:border-white/5
                bg-slate-100/40 dark:bg-black/20 backdrop-blur-lg
                cursor-default select-none">
      <div id="journal-pin-close"
           class="w-3 h-3 relative rounded-full bg-red-500 hover:bg-red-600
                  transition-colors shadow-sm cursor-pointer
                  before:absolute before:-inset-1.5 before:content-['']"
           title="Close"></div>
      <span class="flex-1 text-center text-[12px] font-semibold
                   text-slate-500 dark:text-slate-400 mr-8">Pin a polaroid</span>
    </div>
    <div class="journal-pin-creator-body">
      <div class="journal-pin-step">
        <div class="journal-pin-step-label">1 — Pick a polaroid</div>
        <div class="journal-pin-photo-grid" data-jpin-photos></div>
      </div>
      <div class="journal-pin-step">
        <div class="journal-pin-step-label">2 — Pick a vibe (optional)</div>
        <div class="journal-pin-sticker-row" data-jpin-stickers></div>
      </div>
      <div class="journal-pin-actions">
        <div class="journal-pin-preview" data-jpin-preview>
          <span style="opacity:0.5;">Preview appears here</span>
        </div>
        <button class="journal-pin-submit" data-jpin-submit disabled>Pin it</button>
      </div>
      <div class="journal-pin-status" data-jpin-status></div>
    </div>
  `;
  document.body.appendChild(modal);

  // ── interactions ──
  const state = { photo: null, sticker: null };
  const photoHost = modal.querySelector('[data-jpin-photos]');
  const stickerHost = modal.querySelector('[data-jpin-stickers]');
  const previewHost = modal.querySelector('[data-jpin-preview]');
  const submitBtn = modal.querySelector('[data-jpin-submit]');
  const statusEl = modal.querySelector('[data-jpin-status]');

  // photo grid
  photoHost.innerHTML = photos
    .map(
      (p, i) => `
        <button class="journal-pin-photo" data-jpin-photo-i="${i}">
          <img src="${escapeAttr(p.src)}" alt="" loading="lazy" draggable="false" />
        </button>
      `
    )
    .join('');
  photoHost.querySelectorAll('[data-jpin-photo-i]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const i = Number(btn.getAttribute('data-jpin-photo-i'));
      state.photo = photos[i];
      photoHost.querySelectorAll('[data-jpin-photo-i]').forEach((b) =>
        b.classList.toggle('is-selected', b === btn)
      );
      updatePreview();
    });
  });

  // sticker row
  stickerHost.innerHTML = STICKERS.map(
    (s, i) => `<button class="journal-pin-sticker-btn" data-jpin-sticker-i="${i}">${s}</button>`
  ).join('');
  stickerHost.querySelectorAll('[data-jpin-sticker-i]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const i = Number(btn.getAttribute('data-jpin-sticker-i'));
      const value = STICKERS[i];
      // Tap again to deselect.
      if (state.sticker === value) {
        state.sticker = null;
        btn.classList.remove('is-selected');
      } else {
        state.sticker = value;
        stickerHost.querySelectorAll('[data-jpin-sticker-i]').forEach((b) =>
          b.classList.toggle('is-selected', b === btn)
        );
      }
      updatePreview();
    });
  });

  function updatePreview() {
    if (!state.photo) {
      previewHost.innerHTML = `<span style="opacity:0.5;">Preview appears here</span>`;
      submitBtn.disabled = true;
      return;
    }
    submitBtn.disabled = false;
    previewHost.innerHTML = `
      <div class="journal-pin" style="transform: rotate(-3deg);">
        <div class="journal-pin-polaroid">
          <img src="${escapeAttr(state.photo.src)}" alt="" draggable="false" />
        </div>
        ${state.sticker ? `<div class="journal-pin-sticker">${state.sticker}</div>` : ''}
      </div>
    `;
  }

  // submit
  submitBtn.addEventListener('click', async () => {
    if (!state.photo || submitBtn.disabled) return;
    submitBtn.disabled = true;
    statusEl.textContent = 'Pinning…';
    statusEl.style.color = '';
    try {
      const res = await fetch('/api/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folder: state.photo.folder,
          name: state.photo.name,
          sticker: state.sticker,
          visitorId: getVisitorId(),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        statusEl.textContent = body.message || body.error || `Failed (${res.status})`;
        statusEl.style.color = '#ef4444';
        submitBtn.disabled = false;
        return;
      }
      // Stamp today so the Pin ring closes; syncRings picks it up and
      // dispatches the rings-changed event so the Today view repaints.
      try {
        const today = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
        }).format(new Date());
        localStorage.setItem('journal:last-pin-date', today);
      } catch {}
      syncRings();
      // Stamps: bumps the lifetime pin counter (Curator stamp).
      window.dispatchEvent(new CustomEvent('journal:pin-created'));

      statusEl.textContent = '✓ Pinned';
      statusEl.style.color = '#22c55e';
      // Refresh the underlying board if it's currently rendered, then close.
      const grid = document.querySelector('[data-jboard-grid]');
      if (grid) loadAndPaintPins(grid);
      setTimeout(close, 600);
    } catch (e) {
      statusEl.textContent = 'Network error';
      statusEl.style.color = '#ef4444';
      submitBtn.disabled = false;
    }
  });

  // close
  function close() {
    modal.remove();
    creatorOpen = false;
    window.removeEventListener('keydown', onEsc);
  }
  const onEsc = (e) => { if (e.key === 'Escape') close(); };
  window.addEventListener('keydown', onEsc);
  modal.querySelector('#journal-pin-close')?.addEventListener('click', close);

  // simple drag on titlebar (same pattern as Daily Frame modal)
  const handle = modal.querySelector('.draggable-handle');
  handle?.addEventListener('mousedown', (e) => {
    if (e.target.closest('#journal-pin-close')) return;
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

// ── pin-creation sheet (iOS) ────────────────────────────────────────
//
// Full-screen sheet that slides up from the bottom. No traffic-light
// chrome, no dragging — same shape as the BTS / Edits app overlays.
// Reuses the photo / sticker pickers via shared classes so the desktop
// styles still apply, but the chrome is iOS-native.

function openPinCreatorIos() {
  const photos = collectPinablePhotos();

  const sheet = document.createElement('div');
  sheet.id = 'journal-pin-creator';
  sheet.className = 'ios-pin-sheet';
  sheet.innerHTML = `
    <div class="ios-pin-sheet-header">
      <button class="ios-pin-sheet-close" data-jpin-close aria-label="Close">
        <span class="material-symbols-rounded" style="font-size:22px;">close</span>
      </button>
      <div class="ios-pin-sheet-title">Pin a polaroid</div>
      <div style="width:36px;"></div>
    </div>
    <div class="ios-pin-sheet-body">
      <div class="journal-pin-step">
        <div class="journal-pin-step-label">1 — Pick a polaroid</div>
        <div class="journal-pin-photo-grid" data-jpin-photos></div>
      </div>
      <div class="journal-pin-step">
        <div class="journal-pin-step-label">2 — Pick a vibe (optional)</div>
        <div class="journal-pin-sticker-row" data-jpin-stickers></div>
      </div>
      <div class="ios-pin-sheet-preview" data-jpin-preview>
        <span style="opacity:0.5;">Preview appears here</span>
      </div>
      <div class="ios-pin-sheet-status" data-jpin-status></div>
    </div>
    <div class="ios-pin-sheet-footer">
      <button class="ios-pin-sheet-submit" data-jpin-submit disabled>Pin it</button>
    </div>
  `;
  document.body.appendChild(sheet);
  // Trigger slide-up on the next frame so the transition kicks in.
  requestAnimationFrame(() => sheet.classList.add('is-open'));

  const photoHost = sheet.querySelector('[data-jpin-photos]');
  const stickerHost = sheet.querySelector('[data-jpin-stickers]');
  const previewHost = sheet.querySelector('[data-jpin-preview]');
  const submitBtn = sheet.querySelector('[data-jpin-submit]');
  const statusEl = sheet.querySelector('[data-jpin-status]');
  const state = { photo: null, sticker: null };

  // ── photo picker ──
  photoHost.innerHTML = photos
    .map(
      (p, i) => `
        <button class="journal-pin-photo" data-jpin-photo-i="${i}">
          <img src="${escapeAttr(p.src)}" alt="" loading="lazy" draggable="false" />
        </button>
      `
    )
    .join('');
  photoHost.querySelectorAll('[data-jpin-photo-i]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const i = Number(btn.getAttribute('data-jpin-photo-i'));
      state.photo = photos[i];
      photoHost.querySelectorAll('[data-jpin-photo-i]').forEach((b) =>
        b.classList.toggle('is-selected', b === btn)
      );
      updatePreview();
    });
  });

  // ── sticker picker ──
  stickerHost.innerHTML = STICKERS.map(
    (s, i) => `<button class="journal-pin-sticker-btn" data-jpin-sticker-i="${i}">${s}</button>`
  ).join('');
  stickerHost.querySelectorAll('[data-jpin-sticker-i]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const i = Number(btn.getAttribute('data-jpin-sticker-i'));
      const v = STICKERS[i];
      if (state.sticker === v) {
        state.sticker = null;
        btn.classList.remove('is-selected');
      } else {
        state.sticker = v;
        stickerHost.querySelectorAll('[data-jpin-sticker-i]').forEach((b) =>
          b.classList.toggle('is-selected', b === btn)
        );
      }
      updatePreview();
    });
  });

  function updatePreview() {
    if (!state.photo) {
      previewHost.innerHTML = `<span style="opacity:0.5;">Preview appears here</span>`;
      submitBtn.disabled = true;
      return;
    }
    submitBtn.disabled = false;
    previewHost.innerHTML = `
      <div class="journal-pin" style="transform: rotate(-3deg); width:90px; padding:6px 6px 22px;">
        <div class="journal-pin-polaroid">
          <img src="${escapeAttr(state.photo.src)}" alt="" draggable="false" />
        </div>
        ${state.sticker ? `<div class="journal-pin-sticker" style="font-size:18px; width:26px; height:26px;">${state.sticker}</div>` : ''}
      </div>
    `;
  }

  // ── submit ──
  submitBtn.addEventListener('click', async () => {
    if (!state.photo || submitBtn.disabled) return;
    submitBtn.disabled = true;
    statusEl.textContent = 'Pinning…';
    statusEl.style.color = '';
    try {
      const res = await fetch('/api/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folder: state.photo.folder,
          name: state.photo.name,
          sticker: state.sticker,
          visitorId: getVisitorId(),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        statusEl.textContent = body.message || body.error || `Failed (${res.status})`;
        statusEl.style.color = '#ef4444';
        submitBtn.disabled = false;
        return;
      }
      // Stamp today so the Pin ring closes; syncRings picks it up and
      // dispatches the rings-changed event so the Today view repaints.
      try {
        const today = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
        }).format(new Date());
        localStorage.setItem('journal:last-pin-date', today);
      } catch {}
      syncRings();
      // Stamps: bumps the lifetime pin counter (Curator stamp).
      window.dispatchEvent(new CustomEvent('journal:pin-created'));

      statusEl.textContent = '✓ Pinned';
      statusEl.style.color = '#22c55e';
      setTimeout(close, 600);
    } catch {
      statusEl.textContent = 'Network error';
      statusEl.style.color = '#ef4444';
      submitBtn.disabled = false;
    }
  });

  // ── close ──
  function close() {
    sheet.classList.remove('is-open');
    setTimeout(() => {
      sheet.remove();
      creatorOpen = false;
    }, 320);
  }
  sheet.querySelector('[data-jpin-close]').addEventListener('click', close);
}

// ── helpers ──────────────────────────────────────────────────────────

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c] || c));
}

function escapeAttr(s) {
  return String(s).replace(/[&"']/g, (c) => ({
    '&': '&amp;', '"': '&quot;', "'": '&#39;'
  }[c] || c));
}
