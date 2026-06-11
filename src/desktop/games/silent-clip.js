// Silent Clip — guess the edit from a 3-second silent B/W clip.
//
// Endless freeplay. Random clip per round from any approved frame that
// has a clip file. 3 attempts, autocomplete input over all known edits.
// Personal best = highest score (4 - attempts used at win).

import { openGameModal } from './modal.js';
import { gameAssetUrl } from '../../utils/game-asset-url.js';

const STORAGE_KEY = 'journal:silent-clip:best';

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

export function openSilentClip() {
  let pool = [];
  let allEdits = [];
  let current = null;
  let guesses = [];
  let finished = false;
  let won = false;

  let best = 0;
  try { best = parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10) || 0; } catch {}

  openGameModal({
    id: 'journal-game-silent-clip',
    title: 'Silent Clip',
    width: 600,
    height: 720,
    render: async (host) => {
      host.innerHTML = `
        <div class="sc-shell">
          <div class="sc-meta">
            <span class="sc-eyebrow">Silent Clip</span>
            <span class="sc-best">Best <strong data-sc-best>${best}</strong>/3</span>
          </div>
          <div class="sc-video-wrap" data-sc-video-wrap>
            <div class="sc-loading">Loading clip…</div>
          </div>
          <div class="sc-dots" data-sc-dots></div>
          <div class="sc-input-area">
            <div class="sc-input-wrap">
              <input type="text" class="sc-input" data-sc-input
                     placeholder="Which edit?"
                     autocomplete="off" autocapitalize="off" spellcheck="false" />
              <div class="sc-suggestions" data-sc-suggestions></div>
            </div>
            <button class="sc-submit" data-sc-submit disabled>Guess</button>
          </div>
          <div class="sc-history" data-sc-history></div>
          <div class="sc-result" data-sc-result></div>
        </div>
      `;
      pool = await getApprovedPool();
      const withClips = pool.filter((f) => f.clip);
      allEdits = [...new Set(pool.map((f) => f.edit))].sort(
        (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })
      );
      if (!withClips.length) {
        host.querySelector('[data-sc-video-wrap]').innerHTML =
          '<div class="sc-loading">No clips yet. Run <code>npm run extract-clips</code>.</div>';
        return;
      }
      newRound(host, withClips);
    },
  });

  function newRound(host, withClips) {
    current = withClips[Math.floor(Math.random() * withClips.length)];
    guesses = [];
    finished = false;
    won = false;

    host.querySelector('[data-sc-video-wrap]').innerHTML = `
      <video autoplay muted loop playsinline class="sc-video">
        <source src="${escapeAttr(gameAssetUrl(current.clip))}" type="video/mp4">
      </video>
    `;
    paintDots(host);
    host.querySelector('[data-sc-history]').innerHTML = '';
    host.querySelector('[data-sc-result]').innerHTML = '';

    const input = host.querySelector('[data-sc-input]');
    const submit = host.querySelector('[data-sc-submit]');
    const sugg = host.querySelector('[data-sc-suggestions]');
    input.value = '';
    input.disabled = false;
    submit.disabled = true;

    input.oninput = () => {
      paintSuggestions(input, sugg, submit);
    };
    input.onkeydown = (e) => {
      if (e.key === 'Enter' && !submit.disabled) {
        e.preventDefault();
        onGuess(host, input.value, withClips);
      }
    };
    sugg.onclick = null;
    submit.onclick = () => onGuess(host, input.value, withClips);
    input.focus();
  }

  function paintSuggestions(input, sugg, submit) {
    const q = input.value.trim().toLowerCase();
    if (!q) {
      sugg.classList.remove('show');
      submit.disabled = true;
      return;
    }
    const matches = allEdits.filter((e) => e.toLowerCase().includes(q)).slice(0, 6);
    if (!matches.length) {
      sugg.classList.remove('show');
      submit.disabled = !validGuess(input.value);
      return;
    }
    sugg.innerHTML = matches
      .map((m) => `<div class="sc-sugg-item">${escapeHtml(m)}</div>`)
      .join('');
    sugg.classList.add('show');
    sugg.querySelectorAll('.sc-sugg-item').forEach((el) => {
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        input.value = el.textContent || '';
        sugg.classList.remove('show');
        submit.disabled = !validGuess(input.value);
        input.focus();
      });
    });
    submit.disabled = !validGuess(input.value);
  }

  function validGuess(v) {
    return allEdits.some((e) => e.toLowerCase() === v.trim().toLowerCase());
  }

  function onGuess(host, raw, withClips) {
    if (finished) return;
    const canonical = allEdits.find(
      (e) => e.toLowerCase() === raw.trim().toLowerCase()
    ) || raw;
    guesses.push(canonical);

    if (canonical.toLowerCase() === current.edit.toLowerCase()) {
      won = true;
      finished = true;
    } else if (guesses.length >= 3) {
      finished = true;
    }

    paintDots(host);
    paintHistory(host);

    if (!finished) {
      const input = host.querySelector('[data-sc-input]');
      input.value = '';
      host.querySelector('[data-sc-submit]').disabled = true;
      host.querySelector('[data-sc-suggestions]').classList.remove('show');
      input.focus();
      return;
    }

    host.querySelector('[data-sc-input]').disabled = true;
    host.querySelector('[data-sc-submit]').disabled = true;
    const resultEl = host.querySelector('[data-sc-result]');

    if (won) {
      const score = 4 - guesses.length; // 1=3, 2=2, 3=1
      if (score > best) {
        best = score;
        try { localStorage.setItem(STORAGE_KEY, String(best)); } catch {}
        host.querySelector('[data-sc-best]').textContent = String(best);
      }
      resultEl.innerHTML = `
        <div class="sc-msg sc-msg-good">🎬 Solved in ${guesses.length}/3</div>
        <button class="sc-next" data-sc-next>Play again</button>
      `;
    } else {
      resultEl.innerHTML = `
        <div class="sc-msg sc-msg-bad">That was ${escapeHtml(current.edit)}</div>
        <button class="sc-next" data-sc-next>Play again</button>
      `;
    }
    resultEl.querySelector('[data-sc-next]').onclick = () => newRound(host, withClips);
  }

  function paintDots(host) {
    host.querySelector('[data-sc-dots]').innerHTML = Array.from(
      { length: 3 },
      (_, i) => {
        const g = guesses[i];
        if (!g) return '<div class="sc-dot"></div>';
        const right = g.toLowerCase() === current.edit.toLowerCase();
        return `<div class="sc-dot ${right ? 'correct' : 'wrong'}"></div>`;
      }
    ).join('');
  }

  function paintHistory(host) {
    host.querySelector('[data-sc-history]').innerHTML = guesses
      .map((g) => {
        const right = g.toLowerCase() === current.edit.toLowerCase();
        return `<div class="sc-history-item ${right ? 'correct' : 'wrong'}">
          ${escapeHtml(g)} <span style="opacity:0.5">${right ? '✓' : '✗'}</span>
        </div>`;
      })
      .join('');
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
