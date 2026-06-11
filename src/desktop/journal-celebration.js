// ─────────────────────────────────────────────────────────────────────
// Stamp celebration toasts.
//
// The stamps system awards silently into localStorage — the moment of
// earning had zero feedback. This module renders the missing peak: a
// bottom-center glass toast where the stamp SVG slams in like a real
// rubber stamp (overshoot scale + slight tilt + ink flash), queued one
// after another when several land at once. Tapping the toast opens the
// Journal's Passport section on either platform.
//
// Called directly by journal-stamps.js with full stamp objects (no
// import cycle: stamps → celebration → stamp-svg).
// ─────────────────────────────────────────────────────────────────────

import { stampSVG } from './journal-stamp-svg.js';

const SHOW_MS = 3400;     // per-toast dwell time
const GAP_MS = 260;       // breather between queued toasts
const SUMMARY_THRESHOLD = 4; // ≥ this many at once → one summary toast

const queue = [];
let showing = false;
let styleInjected = false;

function injectStyle() {
  if (styleInjected) return;
  styleInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .stamp-toast {
      position: fixed;
      left: 50%;
      bottom: calc(96px + env(safe-area-inset-bottom, 0px));
      transform: translateX(-50%) translateY(14px);
      z-index: 10400;
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 12px 18px 12px 12px;
      border-radius: 18px;
      background: rgba(252, 252, 253, 0.86);
      backdrop-filter: blur(28px) saturate(180%);
      -webkit-backdrop-filter: blur(28px) saturate(180%);
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.22), 0 2px 8px rgba(0, 0, 0, 0.10),
                  0 0 0 0.5px rgba(0, 0, 0, 0.08);
      cursor: pointer;
      opacity: 0;
      transition: opacity 220ms ease, transform 320ms var(--ease-spring);
      max-width: min(86vw, 380px);
      -webkit-tap-highlight-color: transparent;
    }
    .dark .stamp-toast, .ios-dark .stamp-toast {
      background: rgba(38, 38, 42, 0.88);
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5), 0 0 0 0.5px rgba(255, 255, 255, 0.10);
    }
    .stamp-toast.is-in {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
    .stamp-toast.is-out {
      opacity: 0;
      transform: translateX(-50%) translateY(10px) scale(0.97);
      transition: opacity 200ms ease, transform 240ms ease;
    }
    .stamp-toast-art {
      width: 62px;
      height: 62px;
      flex-shrink: 0;
      position: relative;
    }
    .stamp-toast-art > .stamp-ink {
      position: absolute;
      inset: -8px;
      border-radius: 50%;
      pointer-events: none;
      opacity: 0;
    }
    .stamp-toast-eyebrow {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: rgba(0, 0, 0, 0.45);
      margin: 0 0 2px;
    }
    .dark .stamp-toast-eyebrow, .ios-dark .stamp-toast-eyebrow { color: rgba(255,255,255,0.5); }
    .stamp-toast-label {
      font-size: 15px;
      font-weight: 700;
      letter-spacing: -0.01em;
      color: #1d1d1f;
      margin: 0;
      line-height: 1.2;
    }
    .dark .stamp-toast-label, .ios-dark .stamp-toast-label { color: #f5f5f7; }
    .stamp-toast-sub {
      font-size: 12px;
      color: rgba(0, 0, 0, 0.5);
      margin: 1px 0 0;
    }
    .dark .stamp-toast-sub, .ios-dark .stamp-toast-sub { color: rgba(255,255,255,0.55); }

    @keyframes stamp-slam {
      0%   { transform: scale(2.1) rotate(-16deg); opacity: 0; }
      55%  { transform: scale(0.92) rotate(-5deg); opacity: 1; }
      75%  { transform: scale(1.06) rotate(-7deg); }
      100% { transform: scale(1) rotate(-6deg); opacity: 1; }
    }
    @keyframes stamp-ink {
      0%   { opacity: 0; transform: scale(0.6); }
      30%  { opacity: 0.55; transform: scale(1); }
      100% { opacity: 0; transform: scale(1.45); }
    }
    .stamp-toast-art > svg, .stamp-toast-art > .stamp-art-inner {
      animation: stamp-slam 480ms var(--ease-bounce) both;
    }
    .stamp-toast-art > .stamp-ink {
      animation: stamp-ink 700ms ease-out 180ms both;
    }
    @media (prefers-reduced-motion: reduce) {
      .stamp-toast { transition: opacity 180ms linear; transform: translateX(-50%); }
      .stamp-toast.is-in { transform: translateX(-50%); }
      .stamp-toast-art > svg, .stamp-toast-art > .stamp-art-inner,
      .stamp-toast-art > .stamp-ink { animation: none; }
    }
  `;
  document.head.appendChild(style);
}

const KIND_GLOW = {
  travel: 'rgba(139, 21, 56, 0.55)',
  skill:  'rgba(30, 58, 138, 0.55)',
  secret: 'rgba(161, 98, 7, 0.6)',
};

function openPassport() {
  if (typeof window.openJournalApp !== 'function') return;
  window.openJournalApp();
  // Land directly on the Passport section once the app is mounted.
  setTimeout(() => {
    const target = window.innerWidth <= 768
      ? document.querySelector('#ios-journal-app [data-ios-jsection="passport"]')
      : document.querySelector('[data-jsection="passport"]');
    target?.click();
  }, 380);
}

function buildToast({ artHtml, eyebrow, label, sub, glow }) {
  const el = document.createElement('div');
  el.className = 'stamp-toast';
  el.setAttribute('role', 'status');
  el.innerHTML = `
    <div class="stamp-toast-art">
      <div class="stamp-ink" style="background: radial-gradient(circle, ${glow} 0%, transparent 70%);"></div>
      <div class="stamp-art-inner" style="width:100%; height:100%;">${artHtml}</div>
    </div>
    <div>
      <p class="stamp-toast-eyebrow">${eyebrow}</p>
      <p class="stamp-toast-label">${label}</p>
      <p class="stamp-toast-sub">${sub}</p>
    </div>
  `;
  el.addEventListener('click', () => {
    dismiss(el);
    openPassport();
  });
  return el;
}

function dismiss(el) {
  if (el.dataset.gone) return;
  el.dataset.gone = '1';
  el.classList.remove('is-in');
  el.classList.add('is-out');
  setTimeout(() => el.remove(), 280);
}

function showNext() {
  if (showing) return;
  const entry = queue.shift();
  if (!entry) return;
  showing = true;
  injectStyle();

  const el = buildToast(entry);
  document.body.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-in')));
  try { navigator.vibrate?.(30); } catch {}

  setTimeout(() => {
    dismiss(el);
    setTimeout(() => {
      showing = false;
      showNext();
    }, GAP_MS);
  }, SHOW_MS);
}

// Public entry — called by journal-stamps.evaluate() with the freshly
// earned stamp objects ({ id, kind, label, icon, sub }).
export function celebrateStamps(stamps) {
  if (!Array.isArray(stamps) || stamps.length === 0) return;
  if (!document.body) return;

  if (stamps.length >= SUMMARY_THRESHOLD) {
    // A pile at once (e.g. state migration) — one summary instead of a parade.
    queue.push({
      artHtml: stampSVG({ label: 'Passport', icon: '📔', kind: 'travel', earned: true }),
      eyebrow: 'Passport',
      label: `${stamps.length} new stamps`,
      sub: 'Tap to open your passport',
      glow: KIND_GLOW.travel,
    });
  } else {
    for (const s of stamps) {
      queue.push({
        artHtml: stampSVG({ label: s.label, icon: s.icon, kind: s.kind, earned: true }),
        eyebrow: 'Stamp earned',
        label: s.label,
        sub: s.sub || 'Added to your passport',
        glow: KIND_GLOW[s.kind] || KIND_GLOW.travel,
      });
    }
  }
  showNext();
}
