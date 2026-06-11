// Connect — NYT-Connections-style.
//
// 16 thumbnails in a 4×4 grid, drawn from 4 different edits (4 frames each).
// Player taps 4 tiles they think share the same edit. Submit checks the
// group; if all four match, the group locks in green. Wrong groups burn
// one of 4 lives. Solve all 4 groups before running out of lives.

import { openGameModal } from './modal.js';
import { gameAssetUrl } from '../../utils/game-asset-url.js';

const STORAGE_KEY = 'journal:connect:best';
const MAX_MISTAKES = 4;

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

function pickPuzzle(byEdit) {
  const eligible = Object.keys(byEdit).filter((e) => byEdit[e].length >= 4);
  if (eligible.length < 4) return null;
  const edits = shuffle(eligible).slice(0, 4);
  const tiles = [];
  for (const edit of edits) {
    const frames = shuffle(byEdit[edit]).slice(0, 4);
    for (const f of frames) tiles.push({ ...f });
  }
  return { edits, tiles: shuffle(tiles) };
}

export function openConnect() {
  let puzzle = null;
  let pool = null;
  let byEdit = null;
  const selected = new Set();
  const solved = []; // array of solved edits, in order
  let mistakes = 0;
  let finished = false;

  let best = 0;
  try { best = parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10) || 0; } catch {}

  openGameModal({
    id: 'journal-game-connect',
    title: 'Connect',
    width: 720,
    height: 820,
    render: async (host) => {
      host.innerHTML = `
        <div class="cn-shell">
          <div class="cn-meta">
            <span class="cn-eyebrow" data-cn-eyebrow>Loading frames…</span>
            <span class="cn-best">Best <strong data-cn-best>${best}</strong>/4</span>
          </div>
          <div class="cn-prompt" data-cn-prompt>—</div>
          <div class="cn-solved" data-cn-solved></div>
          <div class="cn-grid" data-cn-grid></div>
          <div class="cn-lives">
            <span class="cn-lives-label">Mistakes</span>
            <div class="cn-lives-dots" data-cn-lives></div>
          </div>
          <div class="cn-controls">
            <button class="cn-restart" data-cn-restart>New puzzle</button>
            <button class="cn-submit" data-cn-submit disabled>Submit 4</button>
          </div>
        </div>
      `;
      pool = await getApprovedPool();
      byEdit = groupByEdit(pool);
      startPuzzle(host);
    },
  });

  function startPuzzle(host) {
    selected.clear();
    solved.length = 0;
    mistakes = 0;
    finished = false;

    puzzle = pickPuzzle(byEdit);
    if (!puzzle) {
      host.querySelector('[data-cn-eyebrow]').textContent = 'Not enough frames for Connect yet';
      host.querySelector('[data-cn-prompt]').textContent = '';
      return;
    }

    host.querySelector('[data-cn-eyebrow]').textContent = '16 frames · 4 edits';
    host.querySelector('[data-cn-prompt]').textContent =
      'Pick 4 frames you think share an edit';
    host.querySelector('[data-cn-solved]').innerHTML = '';
    paintLives(host);
    paintGrid(host);

    host.querySelector('[data-cn-submit]').onclick = () => submitGroup(host);
    host.querySelector('[data-cn-restart]').onclick = () => startPuzzle(host);
  }

  function paintGrid(host) {
    const grid = host.querySelector('[data-cn-grid]');
    grid.innerHTML = puzzle.tiles
      .map((t, i) => {
        const isSolved = solved.includes(t.edit);
        const isSelected = selected.has(t.id);
        if (isSolved) return ''; // solved tiles are pulled out into .cn-solved
        return `
          <button class="cn-tile ${isSelected ? 'is-selected' : ''}"
                  data-cn-tile="${i}">
            <img src="${escapeAttr(gameAssetUrl(t.thumb))}" alt="" loading="lazy" draggable="false" />
          </button>
        `;
      })
      .join('');
    grid.querySelectorAll('[data-cn-tile]').forEach((btn) => {
      btn.addEventListener('click', () => onTileClick(host, parseInt(btn.dataset.cnTile, 10)));
    });
    host.querySelector('[data-cn-submit]').disabled = selected.size !== 4 || finished;
  }

  function onTileClick(host, idx) {
    if (finished) return;
    const t = puzzle.tiles[idx];
    if (solved.includes(t.edit)) return;
    if (selected.has(t.id)) {
      selected.delete(t.id);
    } else if (selected.size < 4) {
      selected.add(t.id);
    }
    paintGrid(host);
  }

  function paintLives(host) {
    const host_ = host.querySelector('[data-cn-lives]');
    host_.innerHTML = Array.from({ length: MAX_MISTAKES }, (_, i) =>
      `<div class="cn-life-dot ${i < mistakes ? 'is-used' : ''}"></div>`
    ).join('');
  }

  function submitGroup(host) {
    if (finished || selected.size !== 4) return;
    const picked = puzzle.tiles.filter((t) => selected.has(t.id));
    const edits = new Set(picked.map((t) => t.edit));

    if (edits.size === 1) {
      const edit = [...edits][0];
      solved.push(edit);
      selected.clear();

      // Add a solved row above the grid
      const solvedHost = host.querySelector('[data-cn-solved]');
      const row = document.createElement('div');
      row.className = 'cn-solved-row';
      row.innerHTML = `
        <div class="cn-solved-name">${escapeHtml(edit)}</div>
        <div class="cn-solved-strip">
          ${picked
            .map((t) =>
              `<img src="${escapeAttr(gameAssetUrl(t.thumb))}" alt="" loading="lazy" draggable="false" />`
            )
            .join('')}
        </div>
      `;
      solvedHost.appendChild(row);

      paintGrid(host);

      if (solved.length === 4) {
        finished = true;
        const score = solved.length; // simple — number of groups solved (4 = perfect)
        host.querySelector('[data-cn-prompt]').textContent =
          mistakes === 0
            ? '✓ Solved with no mistakes'
            : `✓ Solved with ${mistakes} mistake${mistakes === 1 ? '' : 's'}`;
        if (score > best) {
          best = score;
          try { localStorage.setItem(STORAGE_KEY, String(best)); } catch {}
          host.querySelector('[data-cn-best]').textContent = String(best);
        }
        // Stamps: zero-mistakes wins unlock Connection Pro.
        if (mistakes === 0) {
          window.dispatchEvent(new CustomEvent('journal:connect-perfect'));
        }
        swapSubmitToRestart(host);
      }
    } else {
      mistakes++;
      paintLives(host);
      // Brief "shake" feedback on selected tiles, then clear selection.
      host.querySelectorAll('.cn-tile.is-selected').forEach((tile) => {
        tile.classList.add('is-shake');
        setTimeout(() => tile.classList.remove('is-shake'), 360);
      });
      setTimeout(() => {
        selected.clear();
        paintGrid(host);
      }, 360);

      if (mistakes >= MAX_MISTAKES) {
        finished = true;
        host.querySelector('[data-cn-prompt]').textContent = '✗ Out of mistakes';
        // Reveal remaining groups in the solved area
        const remaining = puzzle.edits.filter((e) => !solved.includes(e));
        const solvedHost = host.querySelector('[data-cn-solved]');
        for (const edit of remaining) {
          const picks = puzzle.tiles.filter((t) => t.edit === edit);
          const row = document.createElement('div');
          row.className = 'cn-solved-row cn-solved-row--miss';
          row.innerHTML = `
            <div class="cn-solved-name">${escapeHtml(edit)}</div>
            <div class="cn-solved-strip">
              ${picks
                .map((t) =>
                  `<img src="${escapeAttr(gameAssetUrl(t.thumb))}" alt="" loading="lazy" draggable="false" />`
                )
                .join('')}
            </div>
          `;
          solvedHost.appendChild(row);
        }
        swapSubmitToRestart(host);
      }
    }
  }

  function swapSubmitToRestart(host) {
    const submit = host.querySelector('[data-cn-submit]');
    submit.disabled = false;
    submit.textContent = 'New puzzle';
    submit.onclick = () => startPuzzle(host);
  }
}

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
