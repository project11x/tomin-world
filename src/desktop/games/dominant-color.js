// Dominant Color — guess the edit from its 5-colour palette.
//
// Endless freeplay. Palette comes from edit-colors.json (computed by
// extract-colors.cjs). 3 attempts per round, autocomplete input over
// all known edits.

import { openGameModal } from './modal.js';

const STORAGE_KEY = 'journal:dominant-color:best';

async function loadColors() {
  if (window.__journalEditColors) return window.__journalEditColors;
  try {
    const res = await fetch('/edit-colors.json');
    const data = await res.json();
    window.__journalEditColors = data.colors || {};
  } catch {
    window.__journalEditColors = {};
  }
  return window.__journalEditColors;
}

export function openDominantColor() {
  let colorsByEdit = {};
  let allEdits = [];
  let current = null;
  let guesses = [];
  let finished = false;
  let won = false;

  let best = 0;
  try { best = parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10) || 0; } catch {}

  openGameModal({
    id: 'journal-game-dominant-color',
    title: 'Dominant Color',
    width: 600,
    height: 700,
    render: async (host) => {
      host.innerHTML = `
        <div class="dc-shell">
          <div class="dc-meta">
            <span class="dc-eyebrow">Dominant Color</span>
            <span class="dc-best">Best <strong data-dc-best>${best}</strong>/3</span>
          </div>
          <div class="dc-palette" data-dc-palette>
            <div class="dc-loading">Loading palettes…</div>
          </div>
          <div class="dc-dots" data-dc-dots></div>
          <div class="dc-input-area">
            <div class="dc-input-wrap">
              <input type="text" class="dc-input" data-dc-input
                     placeholder="Which edit?"
                     autocomplete="off" autocapitalize="off" spellcheck="false" />
              <div class="dc-suggestions" data-dc-suggestions></div>
            </div>
            <button class="dc-submit" data-dc-submit disabled>Guess</button>
          </div>
          <div class="dc-history" data-dc-history></div>
          <div class="dc-result" data-dc-result></div>
        </div>
      `;
      colorsByEdit = await loadColors();
      allEdits = Object.keys(colorsByEdit).sort(
        (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })
      );
      if (!allEdits.length) {
        host.querySelector('[data-dc-palette]').innerHTML =
          '<div class="dc-loading">No palettes yet. Run <code>npm run extract-colors</code>.</div>';
        return;
      }
      newRound(host);
    },
  });

  function newRound(host) {
    current = allEdits[Math.floor(Math.random() * allEdits.length)];
    guesses = [];
    finished = false;
    won = false;

    paintPalette(host);
    paintDots(host);
    host.querySelector('[data-dc-history]').innerHTML = '';
    host.querySelector('[data-dc-result]').innerHTML = '';

    const input = host.querySelector('[data-dc-input]');
    const submit = host.querySelector('[data-dc-submit]');
    const sugg = host.querySelector('[data-dc-suggestions]');
    input.value = '';
    input.disabled = false;
    submit.disabled = true;

    input.oninput = () => paintSuggestions(input, sugg, submit);
    input.onkeydown = (e) => {
      if (e.key === 'Enter' && !submit.disabled) {
        e.preventDefault();
        onGuess(host, input.value);
      }
    };
    submit.onclick = () => onGuess(host, input.value);
    input.focus();
  }

  function paintPalette(host) {
    const palette = colorsByEdit[current] || [];
    host.querySelector('[data-dc-palette]').innerHTML = palette
      .map((c) => `<div class="dc-swatch" style="background:${escapeAttr(c)}"></div>`)
      .join('');
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
      .map((m) => `<div class="dc-sugg-item">${escapeHtml(m)}</div>`)
      .join('');
    sugg.classList.add('show');
    sugg.querySelectorAll('.dc-sugg-item').forEach((el) => {
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

  function onGuess(host, raw) {
    if (finished) return;
    const canonical = allEdits.find(
      (e) => e.toLowerCase() === raw.trim().toLowerCase()
    ) || raw;
    guesses.push(canonical);

    if (canonical.toLowerCase() === current.toLowerCase()) {
      won = true;
      finished = true;
    } else if (guesses.length >= 3) {
      finished = true;
    }

    paintDots(host);
    paintHistory(host);

    if (!finished) {
      const input = host.querySelector('[data-dc-input]');
      input.value = '';
      host.querySelector('[data-dc-submit]').disabled = true;
      host.querySelector('[data-dc-suggestions]').classList.remove('show');
      input.focus();
      return;
    }

    host.querySelector('[data-dc-input]').disabled = true;
    host.querySelector('[data-dc-submit]').disabled = true;
    const resultEl = host.querySelector('[data-dc-result]');

    if (won) {
      const score = 4 - guesses.length;
      if (score > best) {
        best = score;
        try { localStorage.setItem(STORAGE_KEY, String(best)); } catch {}
        host.querySelector('[data-dc-best]').textContent = String(best);
      }
      resultEl.innerHTML = `
        <div class="dc-msg dc-msg-good">🎨 Solved in ${guesses.length}/3</div>
        <button class="dc-next" data-dc-next>Play again</button>
      `;
    } else {
      resultEl.innerHTML = `
        <div class="dc-msg dc-msg-bad">That was ${escapeHtml(current)}</div>
        <button class="dc-next" data-dc-next>Play again</button>
      `;
    }
    resultEl.querySelector('[data-dc-next]').onclick = () => newRound(host);
  }

  function paintDots(host) {
    host.querySelector('[data-dc-dots]').innerHTML = Array.from(
      { length: 3 },
      (_, i) => {
        const g = guesses[i];
        if (!g) return '<div class="dc-dot"></div>';
        const right = g.toLowerCase() === current.toLowerCase();
        return `<div class="dc-dot ${right ? 'correct' : 'wrong'}"></div>`;
      }
    ).join('');
  }

  function paintHistory(host) {
    host.querySelector('[data-dc-history]').innerHTML = guesses
      .map((g) => {
        const right = g.toLowerCase() === current.toLowerCase();
        return `<div class="dc-history-item ${right ? 'correct' : 'wrong'}">
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
