// Daily Frame — standalone game page.
//
// Fetches /api/daily-frame (deterministic per Berlin day), renders the
// 3-attempt zoom-reveal puzzle, persists per-day state in localStorage
// so reload doesn't reset the run, and offers a Wordle-style shareable
// result.
//
// Phase 1: standalone page at /daily-frame.html. Later embeds in the
// Journal app as a modal; the core logic here is reusable.

const STORAGE_KEY = 'daily-frame:plays';
const MAX_SUGGESTIONS = 6;

/** @typedef {{ id:string, edit:string, thumb:string, day:number, date:string, attempts:number, edits:string[] }} Puzzle */
/** @typedef {{ guesses:string[], won:boolean, finished:boolean }} Play */

let puzzle = /** @type {Puzzle | null} */ (null);
let play = /** @type {Play} */ ({ guesses: [], won: false, finished: false });
let activeSuggestionIdx = -1;

// ── localStorage ──────────────────────────────────────────────────

/** @returns {Record<string, Play>} */
function loadAllPlays() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveTodayPlay(date, p) {
  const all = loadAllPlays();
  all[date] = p;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

function todayPlay(date) {
  return loadAllPlays()[date];
}

// ── utility ──────────────────────────────────────────────────────

function normalize(s) {
  return (s || '').trim().toLowerCase();
}

function eq(a, b) {
  return normalize(a) === normalize(b);
}

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return /** @type {HTMLElement} */ (t.content.firstChild);
}

// ── rendering ────────────────────────────────────────────────────

function render() {
  const shell = document.getElementById('df-shell');
  if (!shell || !puzzle) return;

  shell.innerHTML = '';
  shell.classList.toggle('has-result', play.finished);

  // Header
  shell.appendChild(el(`
    <div class="df-header">
      <span class="df-eyebrow">Shouli</span>
      <h1 class="df-title">Daily Frame</h1>
      <span class="df-sub">#${puzzle.day} · ${formatHumanDate(puzzle.date)}</span>
    </div>
  `));

  // Frame
  const attemptLevel = play.finished ? 'reveal' : String(play.guesses.length + 1);
  const frameWrap = el(`
    <div class="df-frame-wrap">
      <img class="df-frame" src="${puzzle.thumb}" data-attempt="${attemptLevel}" alt="" draggable="false" />
    </div>
  `);
  shell.appendChild(frameWrap);
  // Enable transitions only after the first paint, so the initial
  // scale(5)/blur(10px) state appears instantly rather than animating
  // in from scale(1). Double-rAF guarantees the layout commit happens
  // first. Re-renders (after a guess) get the smooth 600ms reveal.
  const frameImg = frameWrap.querySelector('.df-frame');
  if (frameImg) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => frameImg.classList.add('is-ready'));
    });
  }

  // Dot indicators
  const dotsHtml = Array.from({ length: puzzle.attempts }, (_, i) => {
    const guess = play.guesses[i];
    if (!guess) return `<div class="df-dot"></div>`;
    const correct = eq(guess, puzzle.edit);
    return `<div class="df-dot ${correct ? 'correct' : 'wrong'}"></div>`;
  }).join('');
  shell.appendChild(el(`<div class="df-dots">${dotsHtml}</div>`));

  // Either show input area or result area
  if (play.finished) {
    shell.appendChild(buildResultView());
  } else {
    shell.appendChild(buildInputArea());
    // Show wrong guesses so far
    if (play.guesses.length > 0) {
      const historyHtml = play.guesses
        .map((g) => `<div class="df-history-item">${escapeHtml(g)} <span style="opacity:0.45">✗</span></div>`)
        .join('');
      shell.appendChild(el(`<div class="df-history">${historyHtml}</div>`));
    }
  }
}

function buildInputArea() {
  const wrap = el(`
    <div class="df-input-area" style="display:flex; flex-direction:column; gap:12px;">
      <div class="df-guess-wrap">
        <input
          type="text"
          class="df-guess-input"
          id="df-input"
          placeholder="Which edit?"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
        />
        <div class="df-suggestions" id="df-suggestions"></div>
      </div>
      <button class="df-guess-btn" id="df-submit" disabled>Guess</button>
    </div>
  `);
  // Attach handlers after the node exists in the document tree (done after appendChild)
  queueMicrotask(() => {
    const input = /** @type {HTMLInputElement} */ (document.getElementById('df-input'));
    const submit = /** @type {HTMLButtonElement} */ (document.getElementById('df-submit'));
    const sugg = /** @type {HTMLElement} */ (document.getElementById('df-suggestions'));
    if (!input || !submit || !sugg) return;

    input.addEventListener('input', () => {
      activeSuggestionIdx = -1;
      renderSuggestions(input.value);
      submit.disabled = !validGuess(input.value);
    });
    input.addEventListener('keydown', (e) => {
      const items = sugg.querySelectorAll('.df-suggestion');
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeSuggestionIdx = Math.min(activeSuggestionIdx + 1, items.length - 1);
        updateActiveSuggestion();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeSuggestionIdx = Math.max(activeSuggestionIdx - 1, -1);
        updateActiveSuggestion();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (activeSuggestionIdx >= 0 && items[activeSuggestionIdx]) {
          input.value = /** @type {HTMLElement} */ (items[activeSuggestionIdx]).textContent || '';
          sugg.classList.remove('show');
          activeSuggestionIdx = -1;
          submit.disabled = !validGuess(input.value);
        } else if (!submit.disabled) {
          submitGuess(input.value);
        }
      }
    });
    input.addEventListener('focus', () => renderSuggestions(input.value));
    input.addEventListener('blur', () => {
      // Delay so click on suggestion still registers
      setTimeout(() => sugg.classList.remove('show'), 150);
    });
    submit.addEventListener('click', () => submitGuess(input.value));

    // Render initial suggestions so the player sees the option list immediately.
    input.focus();
    renderSuggestions('');
  });
  return wrap;
}

function renderSuggestions(query) {
  if (!puzzle) return;
  const sugg = document.getElementById('df-suggestions');
  if (!sugg) return;

  const q = normalize(query);
  const filtered = puzzle.edits
    .filter((e) => normalize(e).includes(q))
    .slice(0, MAX_SUGGESTIONS);

  if (!filtered.length) {
    sugg.classList.remove('show');
    return;
  }

  sugg.innerHTML = filtered
    .map((e) => `<div class="df-suggestion">${escapeHtml(e)}</div>`)
    .join('');

  sugg.querySelectorAll('.df-suggestion').forEach((node) => {
    node.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const input = /** @type {HTMLInputElement} */ (document.getElementById('df-input'));
      const submit = /** @type {HTMLButtonElement} */ (document.getElementById('df-submit'));
      if (!input || !submit) return;
      input.value = node.textContent || '';
      sugg.classList.remove('show');
      activeSuggestionIdx = -1;
      submit.disabled = !validGuess(input.value);
      input.focus();
    });
  });

  sugg.classList.add('show');
}

function updateActiveSuggestion() {
  const sugg = document.getElementById('df-suggestions');
  if (!sugg) return;
  sugg.querySelectorAll('.df-suggestion').forEach((node, i) => {
    node.setAttribute('data-active', String(i === activeSuggestionIdx));
  });
}

function validGuess(value) {
  if (!puzzle) return false;
  return puzzle.edits.some((e) => eq(e, value));
}

// ── submit logic ─────────────────────────────────────────────────

function submitGuess(value) {
  if (!puzzle || play.finished) return;
  if (!validGuess(value)) return;

  // Snap to canonical casing from the edits list.
  const canonical = puzzle.edits.find((e) => eq(e, value)) || value;
  play.guesses.push(canonical);

  if (eq(canonical, puzzle.edit)) {
    play.won = true;
    play.finished = true;
  } else if (play.guesses.length >= puzzle.attempts) {
    play.won = false;
    play.finished = true;
  }

  saveTodayPlay(puzzle.date, play);
  render();
}

// ── result view ──────────────────────────────────────────────────

function buildResultView() {
  if (!puzzle) return el('<div></div>');

  const used = play.guesses.length;
  const headline = play.won
    ? `Solved in ${used}/${puzzle.attempts}`
    : `Not today (${puzzle.attempts}/${puzzle.attempts})`;

  const emojis = play.guesses
    .map((g, i) => (i === used - 1 && play.won ? '🟩' : '🟥'))
    .join('');

  const wrap = el(`
    <div class="df-result show">
      <h2 class="df-result-headline">🎞️ ${headline}</h2>
      <div class="df-result-emojis">${emojis}</div>
      <div class="df-result-answer">That was <strong>${escapeHtml(puzzle.edit)}</strong></div>
      <div class="df-result-actions">
        <button class="df-result-btn primary" id="df-share">Share</button>
        <button class="df-result-btn" id="df-watch">Watch ${escapeHtml(puzzle.edit)}</button>
      </div>
      <div class="df-countdown" id="df-countdown">Next puzzle in —:—:—</div>
    </div>
  `);

  queueMicrotask(() => {
    const shareBtn = document.getElementById('df-share');
    const watchBtn = document.getElementById('df-watch');
    if (shareBtn) shareBtn.addEventListener('click', shareResult);
    if (watchBtn) watchBtn.addEventListener('click', openWatch);
    startCountdown();
  });

  return wrap;
}

function openWatch() {
  if (!puzzle) return;
  // Embedded (iframe in the Journal modal) — let the parent close the modal
  // and open the proper Finder window. This keeps the user inside their
  // Journal session instead of full-navigating the iframe.
  if (window.parent !== window) {
    window.parent.postMessage(
      { type: 'daily-frame:watch', edit: puzzle.edit, slug: puzzle.slug },
      window.location.origin
    );
    return;
  }
  // Standalone — prefer the item-level route /projects/<folder>/<item>.
  // The router's mobile iosOpenItem detects video items and routes them to
  // the Edits app (not BTS); using only /projects/<folder> would land in
  // BTS via iosOpenFolder. Falls back to folder-only if we don't have the
  // item slug for some reason.
  if (puzzle.slug && puzzle.itemSlug) {
    window.location.href = `/projects/${puzzle.slug}/${puzzle.itemSlug}`;
  } else if (puzzle.slug) {
    window.location.href = `/projects/${puzzle.slug}`;
  } else {
    window.location.href = '/';
  }
}

function shareResult() {
  if (!puzzle) return;
  const used = play.guesses.length;
  const emojis = play.guesses
    .map((g, i) => (i === used - 1 && play.won ? '🟩' : '🟥'))
    .join('');
  const result = play.won ? `${used}/${puzzle.attempts}` : `X/${puzzle.attempts}`;
  const text = `🎞️ Daily Frame #${puzzle.day}\n${result}  ${emojis}\n\nshouli.de`;

  // Prefer native share where it exists (mobile); fall back to clipboard copy.
  if (navigator.share) {
    navigator.share({ text }).catch(() => copyToClipboard(text));
  } else {
    copyToClipboard(text);
  }
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => showToast('Copied to clipboard'));
}

function showToast(msg) {
  const t = document.getElementById('df-toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 1800);
}

// ── countdown to next puzzle ─────────────────────────────────────

function startCountdown() {
  const el = document.getElementById('df-countdown');
  if (!el) return;

  function tick() {
    const secs = secondsUntilBerlinMidnight();
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    el.textContent = `Next puzzle in ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    if (secs <= 0) {
      // Reload so the new puzzle is fetched fresh.
      location.reload();
    }
  }
  tick();
  setInterval(tick, 1000);
}

function secondsUntilBerlinMidnight() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const h = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
  const m = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);
  const s = parseInt(parts.find((p) => p.type === 'second')?.value || '0', 10);
  return (23 - h) * 3600 + (59 - m) * 60 + (60 - s);
}

// ── helpers ──────────────────────────────────────────────────────

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c] || c));
}

function formatHumanDate(yyyymmdd) {
  // "2026-06-04" → "Jun 4"
  const [y, m, d] = yyyymmdd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
  }).format(dt);
}

// ── bootstrap ────────────────────────────────────────────────────

function wireBackLink() {
  // Two modes:
  //   • Embedded (iframe inside the Journal modal) — hide the back link
  //     entirely; user closes via the modal's red traffic-light dot.
  //   • Standalone — history.back() if possible (preserves the iOS
  //     shell's previous state), otherwise navigate home.
  const back = document.querySelector('.df-back');
  if (!back) return;
  const isEmbedded = window.parent !== window;
  if (isEmbedded) {
    /** @type {HTMLElement} */ (back).style.display = 'none';
    return;
  }
  back.addEventListener('click', (e) => {
    e.preventDefault();
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = '/';
    }
  });
}

async function init() {
  wireBackLink();

  try {
    const res = await fetch('/api/daily-frame');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    puzzle = await res.json();
  } catch (e) {
    const shell = document.getElementById('df-shell');
    if (shell) {
      shell.innerHTML = `<div class="df-error">Couldn't load today's puzzle.<br/><span style="opacity:0.6">${escapeHtml(String(e))}</span></div>`;
    }
    return;
  }

  if (!puzzle) return;

  // Restore today's progress if any.
  const existing = todayPlay(puzzle.date);
  if (existing) play = existing;

  render();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
