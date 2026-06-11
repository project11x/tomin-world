// Higher or Lower — endless freeplay game.
//
// Each round: two random portfolio folders + one of three question
// types (photo count / total items / newest date). Player picks the
// one they think ranks higher. Streak compounds on correct; resets on
// wrong. Personal best stored per-device in localStorage.

import { portfolioData } from '../../../data.js';
import { openGameModal } from './modal.js';

const STORAGE_KEY = 'journal:hol:best';

const COMPARISONS = [
  {
    question: 'Which has more photos?',
    valueOf: (folder) =>
      (portfolioData[folder] || []).filter((it) => !it.isVideo && !it.isMagazine).length,
    suffix: 'photos',
    formatHint: 'Photos',
  },
  {
    question: 'Which has more items total?',
    valueOf: (folder) => (portfolioData[folder] || []).length,
    suffix: 'items',
    formatHint: 'Items',
  },
  {
    question: 'Which was uploaded more recently?',
    valueOf: (folder) => {
      let max = 0;
      for (const it of portfolioData[folder] || []) {
        const t = Date.parse(it.date);
        if (Number.isFinite(t) && t > max) max = t;
      }
      return max;
    },
    suffix: '',
    formatHint: 'Most recent',
    format: (n) => n ? new Date(n).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—',
  },
];

function allFolders() {
  // Top-level portfolio folders only. TOMIN INDEX.TXT is the magazine
  // container — skip it (its items are sub-magazines, not photos).
  return Object.keys(portfolioData).filter(
    (k) => !k.includes('/') && k !== 'TOMIN INDEX.TXT'
  );
}

function shuffle(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function pickPair() {
  const [a, b] = shuffle(allFolders());
  return [a, b];
}

function pickComparison(prev) {
  // Avoid repeating the same question twice in a row when possible.
  let pick;
  do {
    pick = COMPARISONS[Math.floor(Math.random() * COMPARISONS.length)];
  } while (COMPARISONS.length > 1 && pick === prev);
  return pick;
}

function coverSrc(folder) {
  const items = portfolioData[folder] || [];
  const photo = items.find((it) => !it.isVideo && !it.isMagazine && it.src);
  if (photo) return photo.src;
  const any = items.find((it) => it.src);
  return any ? any.src : null;
}

export function openHigherOrLower() {
  let streak = 0;
  let best = 0;
  try { best = parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10) || 0; } catch {}

  let lastComparison = null;
  let currentPair = null;
  let currentCmp = null;
  let revealed = false;

  openGameModal({
    id: 'journal-game-higher-or-lower',
    title: 'Higher or Lower',
    width: 640,
    height: 680,
    render: (host) => {
      host.innerHTML = `
        <div class="hol-shell">
          <div class="hol-stats">
            <div><div class="hol-stat-label">Streak</div><div class="hol-stat-value" data-hol-streak>0</div></div>
            <div><div class="hol-stat-label">Best</div><div class="hol-stat-value" data-hol-best>${best}</div></div>
          </div>
          <div class="hol-question" data-hol-question>—</div>
          <div class="hol-pair" data-hol-pair></div>
          <div class="hol-result" data-hol-result></div>
        </div>
      `;
      nextRound(host);
    },
  });

  function nextRound(host) {
    revealed = false;
    currentPair = pickPair();
    currentCmp = pickComparison(lastComparison);
    lastComparison = currentCmp;

    host.querySelector('[data-hol-question]').textContent = currentCmp.question;
    host.querySelector('[data-hol-result]').innerHTML = '';
    const pairHost = host.querySelector('[data-hol-pair]');

    pairHost.innerHTML = currentPair.map((folder, i) => {
      const cover = coverSrc(folder);
      const thumb = cover
        ? `<img src="${escapeAttr(cover)}" alt="" loading="lazy" draggable="false" />`
        : '<div class="hol-thumb-fallback">📁</div>';
      return `
        <button class="hol-card" data-hol-pick="${i}">
          <div class="hol-thumb">${thumb}</div>
          <div class="hol-name">${escapeHtml(folder)}</div>
          <div class="hol-value" data-hol-value="${i}">—</div>
        </button>
      `;
    }).join('');

    pairHost.querySelectorAll('[data-hol-pick]').forEach((btn) => {
      btn.addEventListener('click', () => onPick(host, parseInt(btn.dataset.holPick, 10)));
    });
  }

  function onPick(host, index) {
    if (revealed) return;
    revealed = true;

    const values = currentPair.map((folder) => currentCmp.valueOf(folder));
    // Tie-breaker: if equal, picking either is correct.
    const correctIdx = values[0] === values[1] ? index : (values[0] > values[1] ? 0 : 1);
    const won = index === correctIdx;

    const pairHost = host.querySelector('[data-hol-pair]');
    pairHost.querySelectorAll('.hol-card').forEach((btn, i) => {
      const valEl = btn.querySelector(`[data-hol-value="${i}"]`);
      const display = currentCmp.format
        ? currentCmp.format(values[i])
        : (values[i] + (currentCmp.suffix ? ` ${currentCmp.suffix}` : ''));
      if (valEl) valEl.textContent = display;
      btn.classList.toggle('is-correct', i === correctIdx);
      btn.classList.toggle('is-wrong', i === index && !won);
      btn.disabled = true;
    });

    const resultHost = host.querySelector('[data-hol-result]');
    if (won) {
      streak++;
      host.querySelector('[data-hol-streak]').textContent = String(streak);
      if (streak > best) {
        best = streak;
        host.querySelector('[data-hol-best]').textContent = String(best);
        try { localStorage.setItem(STORAGE_KEY, String(best)); } catch {}
      }
      resultHost.innerHTML = `
        <div class="hol-msg hol-msg-good">✓ Correct</div>
        <button class="hol-next" data-hol-next>Next →</button>
      `;
    } else {
      resultHost.innerHTML = `
        <div class="hol-msg hol-msg-bad">✗ Streak ended at ${streak}</div>
        <button class="hol-next" data-hol-next>Try again</button>
      `;
      streak = 0;
      host.querySelector('[data-hol-streak]').textContent = '0';
    }
    resultHost.querySelector('[data-hol-next]')?.addEventListener('click', () => nextRound(host));
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
