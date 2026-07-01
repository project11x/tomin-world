// Wii-mode auto-detection — nudges controller / TV-remote visitors toward the
// pointer-free Wii theme. It never switches silently: it offers a prompt that is
// itself fully operable by gamepad button (A/B) or keyboard (Enter/Esc), so a
// visitor who only has a controller can opt in without ever touching a mouse.
//
// Mounted globally (NOT gated behind .theme-wii) because it must run *before*
// the theme is chosen. The accept path calls window.setTheme('wii')
// (see system-bar.js).

const DISMISS_KEY = 'wii-prompt-dismissed'; // session-scoped: "don't ask again"

function isDesktop() {
  return window.matchMedia('(min-width: 768px)').matches;
}
function alreadyWii() {
  try { return localStorage.getItem('palette') === 'wii'; } catch (e) { return false; }
}
function dismissed() {
  try { return sessionStorage.getItem(DISMISS_KEY) === '1'; } catch (e) { return false; }
}
function markDismissed() {
  try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch (e) { /* ignore */ }
}

let promptEl = null;
let gamepadRaf = 0;

function closePrompt() {
  if (gamepadRaf) { cancelAnimationFrame(gamepadRaf); gamepadRaf = 0; }
  if (promptEl) { promptEl.remove(); promptEl = null; }
}

function accept() {
  closePrompt();
  if (typeof window.enterWiiTheme === 'function') window.enterWiiTheme();
  else if (typeof window.setTheme === 'function') window.setTheme('wii');
}

function decline() {
  markDismissed();
  closePrompt();
}

function showPrompt() {
  if (promptEl || alreadyWii() || dismissed() || !isDesktop()) return;

  // Gamepad glyph (SVG — no emoji, per HIG use crisp symbols).
  const PAD_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.2 6.5h9.6a4.6 4.6 0 0 1 4.57 5.12l-.42 3.7a2.5 2.5 0 0 1-4.36 1.4L15 15h-6l-1.59 1.72a2.5 2.5 0 0 1-4.36-1.4l-.42-3.7A4.6 4.6 0 0 1 7.2 6.5Z"/><path d="M7 9.6v2.8M5.6 11h2.8"/><circle cx="15.6" cy="10" r=".9" fill="currentColor" stroke="none"/><circle cx="17.9" cy="12" r=".9" fill="currentColor" stroke="none"/></svg>';

  // Centred TV dialog on a dimmed scrim — liquid-glass card, HIG button order
  // (secondary left, preferred action right, verbs not yes/no).
  promptEl = document.createElement('div');
  promptEl.className = 'wii-prompt';
  promptEl.setAttribute('role', 'alertdialog');
  promptEl.setAttribute('aria-label', 'Controller verbunden — Wii-Modus starten?');
  promptEl.tabIndex = -1;
  promptEl.innerHTML = `
    <div class="wii-prompt-card">
      <span class="wii-prompt-icon">${PAD_ICON}</span>
      <h2 class="wii-prompt-title">Controller verbunden</h2>
      <p class="wii-prompt-msg">Diese Seite hat einen Modus, der sich komplett ohne Maus steuern lässt.</p>
      <div class="wii-prompt-actions">
        <button type="button" class="wii-prompt-btn wii-prompt-no" data-act="no">
          <span class="wii-btn-badge">B</span> Nicht jetzt
        </button>
        <button type="button" class="wii-prompt-btn wii-prompt-yes" data-act="yes">
          <span class="wii-btn-badge">A</span> Starten
        </button>
      </div>
      <span class="wii-prompt-foot">Jederzeit über das Theme-Menü erreichbar</span>
    </div>`;
  document.body.appendChild(promptEl);

  promptEl.querySelector('.wii-prompt-yes').addEventListener('click', accept);
  promptEl.querySelector('.wii-prompt-no').addEventListener('click', decline);
  // Clicking the scrim (outside the card) declines gently.
  promptEl.addEventListener('click', (e) => { if (e.target === promptEl) decline(); });

  // Keyboard: Enter/Space = accept, Esc/Backspace = decline. The prompt grabs
  // focus so a TV remote or keyboard can act on it immediately.
  promptEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); accept(); }
    else if (e.key === 'Escape' || e.key === 'Backspace') { e.preventDefault(); decline(); }
  });
  requestAnimationFrame(() => { if (promptEl) promptEl.focus(); });

  // Gamepad: poll A (button 0) = accept, B (button 1) = decline while open.
  startGamepadPoll();
}

function startGamepadPoll() {
  let primed = false;        // ignore buttons already held at open time
  const prev = [false, false];
  const tick = () => {
    if (!promptEl) return;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const pad of pads) {
      if (!pad) continue;
      const a = !!(pad.buttons[0] && pad.buttons[0].pressed);
      const b = !!(pad.buttons[1] && pad.buttons[1].pressed);
      if (primed) {
        if (a && !prev[0]) { accept(); return; }
        if (b && !prev[1]) { decline(); return; }
      }
      prev[0] = a; prev[1] = b;
      primed = true;
      break; // first connected pad wins
    }
    gamepadRaf = requestAnimationFrame(tick);
  };
  gamepadRaf = requestAnimationFrame(tick);
}

// ── Signal 1: a controller connects (strongest signal — this *is* the audience).
window.addEventListener('gamepadconnected', () => {
  if (isDesktop()) showPrompt();
});

// ── Signal 2: a coarse / no-hover device navigated by arrow keys *before* any
// pointer movement. TV remotes don't surface via the Gamepad API, so we infer
// them: keyboard-style D-pad input with zero mouse activity on a coarse screen.
let pointerSeen = false;
const seePointer = () => { pointerSeen = true; };
window.addEventListener('pointermove', seePointer, { once: true, passive: true });
window.addEventListener('mousemove', seePointer, { once: true, passive: true });

function coarseNoHover() {
  return window.matchMedia('(pointer: coarse)').matches
    && window.matchMedia('(hover: none)').matches;
}

const NAV_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter']);
window.addEventListener('keydown', (e) => {
  if (pointerSeen || promptEl) return;
  if (!NAV_KEYS.has(e.key)) return;
  if (!coarseNoHover()) return;
  showPrompt();
}, { passive: true });

// Dev/manual hook: window.__wiiPrompt() forces the prompt for testing without a
// real controller (e.g. in the preview, where no gamepad is attached).
window.__wiiPrompt = showPrompt;
