// Play tab — grid of all mini-games inside the Journal app.
//
// Each entry describes a card: icon, title, one-line subtitle, an
// optional `open` function (live) or `soon` flag (placeholder). Live
// games hang off the floating modal helper (or in Daily Frame's case,
// the iframe wrapper). Soon-flagged cards render dimmed and aren't
// clickable until their game module lands.

import { openDailyFrameModal } from './daily-frame.js';
import { openHigherOrLower } from './higher-or-lower.js';
import { openOrderTheEdit } from './order-the-edit.js';
import { openConnect } from './connect.js';
import { openSilentClip } from './silent-clip.js';
import { openDominantColor } from './dominant-color.js';

const GAMES = [
  {
    id: 'daily-frame',
    icon: '🧩',
    title: 'Daily Frame',
    subtitle: 'Guess the edit from one frame',
    open: openDailyFrameModal,
  },
  {
    id: 'connect',
    icon: '🔗',
    title: 'Connect',
    subtitle: 'Group 16 frames into 4 edits',
    open: openConnect,
  },
  {
    id: 'order',
    icon: '📐',
    title: 'Order the Edit',
    subtitle: 'Arrange frames chronologically',
    open: openOrderTheEdit,
  },
  {
    id: 'higher-or-lower',
    icon: '📈',
    title: 'Higher or Lower',
    subtitle: 'Which edit ranks higher?',
    open: openHigherOrLower,
  },
  {
    id: 'silent-clip',
    icon: '🎬',
    title: 'Silent Clip',
    subtitle: 'Mute B/W clip — name the edit',
    open: openSilentClip,
  },
  {
    id: 'color',
    icon: '🎨',
    title: 'Dominant Color',
    subtitle: 'Match a palette to its edit',
    open: openDominantColor,
  },
];

export function renderPlay(host) {
  host.innerHTML = `
    <div class="journal-play-grid">
      ${GAMES.map(renderCardHtml).join('')}
    </div>
  `;
  host.querySelectorAll('[data-jplay-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-jplay-id');
      const game = GAMES.find((g) => g.id === id);
      if (game?.open) game.open();
    });
  });
}

function renderCardHtml(g) {
  const disabled = !!g.soon;
  return `
    <button class="journal-play-card ${disabled ? 'is-soon' : ''}"
            data-jplay-id="${g.id}"
            ${disabled ? 'disabled' : ''}>
      <div class="journal-play-card-icon">${g.icon}</div>
      <div class="journal-play-card-title">${escapeHtml(g.title)}</div>
      <div class="journal-play-card-sub">${escapeHtml(g.subtitle)}</div>
      ${disabled ? '<div class="journal-play-card-soon">Soon</div>' : ''}
    </button>
  `;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c] || c));
}
