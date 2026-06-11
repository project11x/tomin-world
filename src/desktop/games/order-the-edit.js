// Order the Edit — 5 frames from a single video, shuffled.
// Player taps two cards to swap them until they're in chronological order.
// Personal best (correct positions out of 5) saved per device.

import { openGameModal } from './modal.js';
import { gameAssetUrl } from '../../utils/game-asset-url.js';

const STORAGE_KEY = 'journal:order:best';

// Shared fetch + cache of the approved frame pool, used by every game
// that needs frames.
async function getApprovedPool() {
  if (window.__journalFramePool) return window.__journalFramePool;
  try {
    const res = await fetch('/frames-pool.json');
    const data = await res.json();
    window.__journalFramePool = (data.frames || []).filter((f) => f.state === 'approved');
  } catch {
    window.__journalFramePool = [];
  }
  return window.__journalFramePool;
}

function groupByEdit(frames) {
  const map = {};
  for (const f of frames) {
    (map[f.edit] = map[f.edit] || []).push(f);
  }
  return map;
}

function shuffle(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function pickRound(byEdit) {
  const eligible = Object.keys(byEdit).filter((e) => byEdit[e].length >= 5);
  if (!eligible.length) return null;
  const edit = eligible[Math.floor(Math.random() * eligible.length)];
  const pool = shuffle(byEdit[edit]).slice(0, 5);
  // Correct order = chronological by timestamp inside the video.
  const correct = [...pool].sort((a, b) => a.timestamp - b.timestamp);
  // Display order = scrambled. Reshuffle until it differs from correct
  // (no point starting the player at the answer).
  let display = shuffle(correct);
  let guard = 0;
  while (display.every((f, i) => f.id === correct[i].id) && guard++ < 5) {
    display = shuffle(correct);
  }
  return { edit, correct, display };
}

export function openOrderTheEdit() {
  let pool = null;
  let byEdit = null;
  let round = null;
  let display = [];
  let selectedIdx = null;
  let revealed = false;

  let best = 0;
  try { best = parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10) || 0; } catch {}

  openGameModal({
    id: 'journal-game-order',
    title: 'Order the Edit',
    width: 780,
    height: 560,
    render: async (host) => {
      host.innerHTML = `
        <div class="oe-shell">
          <div class="oe-meta">
            <span class="oe-eyebrow" data-oe-eyebrow>Loading frames…</span>
            <span class="oe-best">Best <strong data-oe-best>${best}</strong>/5</span>
          </div>
          <div class="oe-prompt" data-oe-prompt>—</div>
          <div class="oe-row" data-oe-row></div>
          <div class="oe-controls">
            <button class="oe-skip" data-oe-skip>New round</button>
            <button class="oe-submit" data-oe-submit disabled>Submit order</button>
          </div>
        </div>
      `;
      pool = await getApprovedPool();
      byEdit = groupByEdit(pool);
      startRound(host);
    },
  });

  function startRound(host) {
    revealed = false;
    selectedIdx = null;
    round = pickRound(byEdit);
    if (!round) {
      host.querySelector('[data-oe-eyebrow]').textContent = 'Not enough approved frames yet';
      host.querySelector('[data-oe-prompt]').textContent = '';
      host.querySelector('[data-oe-row]').innerHTML = '';
      return;
    }
    display = [...round.display];
    host.querySelector('[data-oe-eyebrow]').textContent = `Edit: ${round.edit}`;
    host.querySelector('[data-oe-prompt]').textContent =
      'Tap two cards to swap them — chronological order wins';
    paintRow(host);

    const submit = host.querySelector('[data-oe-submit]');
    submit.disabled = false;
    submit.textContent = 'Submit order';
    submit.onclick = () => submit_order(host);

    host.querySelector('[data-oe-skip]').onclick = () => startRound(host);
  }

  function paintRow(host) {
    const row = host.querySelector('[data-oe-row]');
    row.innerHTML = display
      .map((f, i) => `
        <button class="oe-card ${selectedIdx === i ? 'is-selected' : ''}"
                data-oe-pos="${i}">
          <div class="oe-thumb">
            <img src="${escapeAttr(gameAssetUrl(f.thumb))}" alt="" loading="lazy" draggable="false" />
          </div>
          <div class="oe-pos">${i + 1}</div>
        </button>
      `)
      .join('');
    row.querySelectorAll('[data-oe-pos]').forEach((btn) => {
      btn.addEventListener('click', () => onCardClick(host, parseInt(btn.dataset.oePos, 10)));
    });
  }

  function onCardClick(host, idx) {
    if (revealed) return;
    if (selectedIdx === null) {
      selectedIdx = idx;
    } else if (selectedIdx === idx) {
      selectedIdx = null;
    } else {
      [display[selectedIdx], display[idx]] = [display[idx], display[selectedIdx]];
      selectedIdx = null;
    }
    paintRow(host);
  }

  function submit_order(host) {
    revealed = true;
    const row = host.querySelector('[data-oe-row]');
    let correct = 0;
    row.querySelectorAll('[data-oe-pos]').forEach((btn, i) => {
      btn.disabled = true;
      if (display[i].id === round.correct[i].id) {
        btn.classList.add('is-correct');
        correct++;
      } else {
        btn.classList.add('is-wrong');
      }
    });
    host.querySelector('[data-oe-prompt]').textContent =
      `${correct} of 5 in the right spot`;

    if (correct > best) {
      best = correct;
      try { localStorage.setItem(STORAGE_KEY, String(best)); } catch {}
      host.querySelector('[data-oe-best]').textContent = String(best);
    }

    const submit = host.querySelector('[data-oe-submit]');
    submit.disabled = false;
    submit.textContent = 'Play again';
    submit.onclick = () => startRound(host);
  }
}

function escapeAttr(s) {
  return String(s).replace(/[&"']/g, (c) => ({
    '&': '&amp;', '"': '&quot;', "'": '&#39;'
  }[c] || c));
}
