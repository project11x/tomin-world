// Wii Gamepad — makes the whole shell controller-operable. TV remotes already
// emit keyboard events (arrows / Enter / Back) that the shell's keydown
// handlers catch; game controllers do NOT — they're only readable via the
// Gamepad API. So this polls a connected pad and translates D-pad / left-stick
// / face-buttons into the very keys the shell already handles. No shell logic
// is duplicated: the synthetic keydown bubbles to whichever handler is live
// (grid, coverflow, viewer, reader).
//
// Mapping (standard gamepad):
//   D-pad / left stick → Arrow keys   (navigate / page, with hold-to-repeat)
//   A (0)             → Enter         (open / confirm / play-pause)
//   B (1)             → Escape        (back / exit fullscreen)
//   X (2)             → m             (mute, in the video viewer)
//   Y (3)             → f             (fullscreen, in the video viewer)
//   LB (4) / RB (5)   → ArrowLeft / ArrowRight  (quick paging / seek)
//   Back (8) / Start (9) → Escape

const DEADZONE = 0.4;
const REPEAT_DELAY = 300; // ms a direction is held before it repeats
const REPEAT_RATE = 85;   // ms between repeats while held

// 'm'/'f' only do something in the video viewer; everywhere else the handlers
// ignore them, so these stay safe as global mappings.
const ACTION_KEYS = { 0: 'Enter', 1: 'Escape', 2: 'm', 3: 'f', 4: 'ArrowLeft', 5: 'ArrowRight', 8: 'Escape', 9: 'Escape' };

let raf = 0;
const prevBtn = {};
let lastDir = { x: 0, y: 0 };
let nextRepeat = 0;

function isActive() {
  return document.documentElement.classList.contains('theme-wii')
    && window.matchMedia('(min-width: 768px)').matches;
}

// The element a synthetic keydown should bubble through: the open overlay
// (coverflow / viewer / reader own their keys) else the focused channel tile
// (so the grid handler sees it as document.activeElement).
function navTarget() {
  const overlay = document.querySelector('.wii-overlay');
  if (overlay) return overlay;
  return document.querySelector('#wii-channels .wii-channel.is-focused')
    || document.getElementById('wii-channels')
    || document.body;
}

function sendKey(key) {
  const t = navTarget();
  // The grid handler reads document.activeElement — make sure the focused tile
  // is actually focused before the key lands on it.
  if (t && t.classList && t.classList.contains('wii-channel')) t.focus();
  (t || document.body).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

function readDirection(pad) {
  let x = 0, y = 0;
  const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
  if (Math.abs(ax) > DEADZONE) x = Math.sign(ax);
  if (Math.abs(ay) > DEADZONE) y = Math.sign(ay);
  if (pad.buttons[14] && pad.buttons[14].pressed) x = -1; // d-pad left
  if (pad.buttons[15] && pad.buttons[15].pressed) x = 1;  // d-pad right
  if (pad.buttons[12] && pad.buttons[12].pressed) y = -1; // d-pad up
  if (pad.buttons[13] && pad.buttons[13].pressed) y = 1;  // d-pad down
  return { x, y };
}

function fireDir(d) {
  // One axis at a time — prefer horizontal on a diagonal so the grid/pager
  // never makes a confusing double move.
  if (d.x) sendKey(d.x < 0 ? 'ArrowLeft' : 'ArrowRight');
  else if (d.y) sendKey(d.y < 0 ? 'ArrowUp' : 'ArrowDown');
}

function tick() {
  if (!isActive()) { lastDir = { x: 0, y: 0 }; return; }
  const pad = [...(navigator.getGamepads ? navigator.getGamepads() : [])].find(Boolean);
  if (!pad) return;
  const now = performance.now();

  // Face / shoulder buttons — edge-triggered (one action per press).
  for (const i of Object.keys(ACTION_KEYS)) {
    const pressed = !!(pad.buttons[i] && pad.buttons[i].pressed);
    if (pressed && !prevBtn[i]) sendKey(ACTION_KEYS[i]);
    prevBtn[i] = pressed;
  }

  // Direction — edge fires immediately, then repeats while held.
  const d = readDirection(pad);
  if (d.x !== lastDir.x || d.y !== lastDir.y) {
    lastDir = d;
    if (d.x || d.y) { fireDir(d); nextRepeat = now + REPEAT_DELAY; }
  } else if ((d.x || d.y) && now >= nextRepeat) {
    fireDir(d); nextRepeat = now + REPEAT_RATE;
  }
}

function loop() {
  raf = requestAnimationFrame(loop);
  tick();
}

function start() {
  if (raf) return;
  raf = requestAnimationFrame(loop);
}

window.addEventListener('gamepadconnected', start);
// A pad may already be present (e.g. user reloads with it connected).
if (navigator.getGamepads && [...navigator.getGamepads()].some(Boolean)) start();

// Dev/test hook: run one poll iteration without waiting on rAF (which throttles
// in background/headless tabs).
window.__wiiGamepadTick = tick;
