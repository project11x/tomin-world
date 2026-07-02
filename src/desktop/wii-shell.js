// Wii Shell — a pointer-free channel grid for shouli.de, mixing the Wii Menu's
// tile layout with Apple-TV-style focus. Opening a channel flies the chosen
// tile INTO the coverflow's centre card (shared-element transition), so the
// first file you see is exactly the one you zoomed into. Enter pushes that file
// closer into a fullscreen viewer.
// Active under .theme-wii on desktop (≥768px). See wii-detect.js for how
// controller / TV-remote visitors get nudged here.

import { portfolioData } from '../../data.js';
import { transformUrl } from '../utils/media.js';
import { posterUrlForVideo, playStream } from '../utils/stream.js';
import { paletteForFolder } from '../utils/edit-posters.js';

const $ = (id) => document.getElementById(id);

// ── Ambient background ──────────────────────────────────────────
// The grid background glows with the focused project's dominant palette
// (public/edit-colors.json via edit-posters.js), and the focus ring borrows its
// lead colour. Palette loads async → re-applied on `edit-posters-ready`.
const AMB_BASE = [12, 14, 17];                 // mute glows toward this dark base
const AMB_FALLBACK = ['rgb(42,47,54)', 'rgb(32,36,43)', 'rgb(21,24,28)'];

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec((hex || '').trim());
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
}
function mixToward(hex, target, t) {
  const a = hexToRgb(hex);
  if (!a) return null;
  const m = a.map((v, i) => Math.round(v + (target[i] - v) * t));
  return `rgb(${m[0]},${m[1]},${m[2]})`;
}

// The three ambient glow colours for a project (mixed toward the dark base).
function ambColorsFor(name) {
  const pal = paletteForFolder(name) || [];
  return [0, 1, 2].map((k) => (pal[k] ? mixToward(pal[k], AMB_BASE, 0.32) : AMB_FALLBACK[k]));
}

function applyAmbilight(name) {
  const shell = $('wii-shell');
  if (!shell) return;
  const pal = paletteForFolder(name) || [];
  const amb = ambColorsFor(name);
  shell.style.setProperty('--wii-amb-1', amb[0]);
  shell.style.setProperty('--wii-amb-2', amb[1]);
  shell.style.setProperty('--wii-amb-3', amb[2]);
  shell.style.setProperty('--wii-ring-glow', pal[0] ? mixToward(pal[0], [255, 255, 255], 0.22) : 'var(--wii-glow)');
}

// Raw camera dumps (DSC1234.jpg / MOV0001.mp4 …) are NOT edits. An "edit" is a
// video with a descriptive name — matches the m3-shell convention.
const RAW_CAMERA = /^(MOV|DSC|IMG|_DSC)[\d_-]/i;
const isEdit = (i) => i.isVideo && !RAW_CAMERA.test(i.name || '');

// Cloudflare Stream poster — a real cover frame served as a light image, far
// cheaper than decoding a raw <video> for its first frame. null when unmigrated.
function videoThumb(src, height) {
  const p = posterUrlForVideo(src);
  return p ? `${p}?time=0.1s&height=${height}` : null;
}

function isActive() {
  return document.documentElement.classList.contains('theme-wii')
    && window.matchMedia('(min-width: 768px)').matches;
}

// Top-level channels: every project, but collapse sub-paths (e.g. the magazine
// folder "TOMIN INDEX.TXT/032C") into their parent channel tile.
function channels() {
  return Object.keys(portfolioData).filter((n) => !n.includes('/'));
}

// All media for a channel, including any nested sub-folders.
function filesFor(name) {
  let items = [];
  for (const [proj, arr] of Object.entries(portfolioData)) {
    if (!Array.isArray(arr)) continue;
    if (proj === name || proj.startsWith(name + '/')) items = items.concat(arr);
  }
  return items.filter((i) => i && i.src);
}

// What to paint on a channel tile: the first edit's frame when the folder has
// one, else the first photo, else any video's frame, else nothing.
function faceFor(name) {
  const items = filesFor(name);
  const edit = items.find(isEdit);
  if (edit) return { kind: 'video', src: edit.src };
  const img = items.find((i) => !i.isVideo);
  if (img) return { kind: 'image', src: img.src };
  const vid = items.find((i) => i.isVideo);
  if (vid) return { kind: 'video', src: vid.src };
  return { kind: 'empty' };
}

function metaFor(name) {
  const items = filesFor(name);
  const v = items.filter((i) => i.isVideo).length;
  const p = items.length - v;
  return { photos: p, videos: v };
}

// ─── Magazines ─────────────────────────────────────────────────
// The "TOMIN INDEX.TXT" channel hosts magazines as sub-folders, each a page
// sequence. Opening that channel shows the magazines (not their flattened
// pages) in the coverflow; opening a magazine starts the page reader.
const MAGAZINE_PREFIX = 'TOMIN INDEX.TXT';
const isMagazineHost = (name) => name === MAGAZINE_PREFIX;

function magazinesOf(host) {
  return Object.keys(portfolioData)
    .filter((k) => k.startsWith(host + '/'))
    .map((key) => {
      const pages = (portfolioData[key] || []).filter((p) => p && p.src);
      const cover = pages.find((p) => !p.isVideo) || pages[0];
      return { name: key.slice(host.length + 1), key, isMagazine: true, pages, src: cover ? cover.src : '' };
    })
    .filter((m) => m.pages.length);
}

// The magazine channel deserves a face that reads as "magazines" rather than a
// random inner page of the first issue: a fanned stack of the real issue covers
// (up to three), peeled like a coverflow so the tile previews what's inside.
function magStackFace(host) {
  // Newest issues surface on the tile (the placeholder array carries each
  // magazine's publication date), capped at three so the fan stays clean no
  // matter how many issues get added later.
  const dateOf = {};
  for (const m of (portfolioData[host] || [])) dateOf[m.name] = Date.parse(m.date) || 0;
  const mags = magazinesOf(host)
    .filter((m) => m.src)
    .sort((a, b) => (dateOf[b.name] || 0) - (dateOf[a.name] || 0))
    .slice(0, 3);
  if (!mags.length) return '';
  // Offset each card from the stack's centre so 1, 2 or 3 covers all fan out
  // symmetrically; the middle card sits on top.
  const mid = (mags.length - 1) / 2;
  const cards = mags.map((m, i) => {
    const off = i - mid;
    const z = 3 - Math.abs(off);
    return `<span class="wii-mag-card" style="--off:${off};z-index:${z}"><img src="${transformUrl(m.src, 480)}" alt="" draggable="false" /></span>`;
  }).join('');
  return `<span class="wii-mag-stack">${cards}</span>`;
}

// ─── Channel grid ──────────────────────────────────────────────
let rendered = false;

function renderGrid() {
  const grid = $('wii-channels');
  if (!grid) return;
  grid.innerHTML = channels().map((name, i) => {
    const m = metaFor(name);
    const sub = [m.photos && `${m.photos} Fotos`, m.videos && `${m.videos} Videos`]
      .filter(Boolean).join(' · ') || 'Leer';
    const f = faceFor(name);
    let faceCls = 'wii-channel-face';
    let style = '';
    let inner = '';
    const magStack = isMagazineHost(name) ? magStackFace(name) : '';
    if (magStack) {
      faceCls += ' is-mag';
      inner = magStack;
    } else if (f.kind === 'image') {
      style = `style="background-image:url('${transformUrl(f.src, 640)}')"`;
    } else if (f.kind === 'video') {
      const poster = videoThumb(f.src, 640);
      inner = poster
        ? `<img class="wii-face-img" src="${poster}" alt="" draggable="false" />`
        : `<video class="wii-face-video" src="${f.src}#t=0.1" muted playsinline preload="metadata"></video>`;
      inner += '<span class="wii-play">▶</span>';
    } else {
      faceCls += ' is-video';
      inner = '<span class="wii-play">▶</span>';
    }
    return `
      <button type="button" class="wii-channel" role="gridcell" style="--i:${i}"
              data-name="${name}" tabindex="${i === 0 ? 0 : -1}">
        <span class="${faceCls}" ${style}>${inner}</span>
        <span class="wii-channel-label">${name}</span>
        <span class="wii-channel-sub">${sub}</span>
      </button>`;
  }).join('');
  rendered = true;
}

// ─── Roving focus (keyboard, arrow keys + wrap-around) ──────────
function tiles() {
  return [...document.querySelectorAll('#wii-channels .wii-channel')];
}

// Columns are read from the live layout so the grid stays navigable at any
// breakpoint: count tiles sharing the first row's offsetTop. Cached — it only
// changes on resize — so fast navigation doesn't reflow on every move.
let _cols = 0;
function columnCount(list) {
  if (_cols) return _cols;
  if (!list.length) return 1;
  const top = list[0].offsetTop;
  let c = 0;
  for (const t of list) { if (t.offsetTop === top) c++; else break; }
  _cols = c || 1;
  return _cols;
}

// A JS-managed .is-focused class drives the focus visual (rather than :focus)
// so the focused channel stays highlighted even when the window loses OS focus
// — the way a TV/console menu behaves.
let _ambTimer = 0;
function focusTile(list, i) {
  list.forEach((t, idx) => {
    const on = idx === i;
    t.tabIndex = on ? 0 : -1;
    t.classList.toggle('is-focused', on);
  });
  list[i].focus();
  // Debounce the ambient repaint: the focus ring moves instantly, but the
  // full-screen gradient (a 700ms transition) only fires once you settle, so
  // fast gamepad/key scrolling never stacks heavy repaints and stays snappy.
  const name = list[i].dataset.name;
  clearTimeout(_ambTimer);
  _ambTimer = setTimeout(() => applyAmbilight(name), 70);
}

function moveFocus(dir) {
  const list = tiles();
  if (!list.length) return;
  const cols = columnCount(list);
  let i = list.indexOf(document.activeElement);
  if (i < 0) i = 0;
  if (dir === 'left') i = (i - 1 + list.length) % list.length;
  else if (dir === 'right') i = (i + 1) % list.length;
  else if (dir === 'up') i = (i - cols + list.length) % list.length;
  else if (dir === 'down') i = (i + cols) % list.length;
  focusTile(list, i);
}

const GRID_DIRS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };

function onGridKeydown(e) {
  if (overlay) return; // the coverflow handles its own keys while open
  if (GRID_DIRS[e.key]) {
    e.preventDefault();
    moveFocus(GRID_DIRS[e.key]);
  } else if (e.key === 'Enter' || e.key === ' ') {
    const t = document.activeElement;
    if (t && t.classList.contains('wii-channel')) {
      e.preventDefault();
      openChannel(t.dataset.name, t);
    }
  } else if (e.key === 'Escape' || e.key === 'Backspace') {
    // At the grid (nothing open), Back/B leaves the theme — the only exit since
    // the normal menu bar is hidden under .theme-wii.
    e.preventDefault();
    exitTheme();
  }
}

// ─── Theme open / close animation ──────────────────────────────
const INTRO_MS = 1100; // longest tile delay + tile anim + buffer
const OUTRO_MS = 520;
let _wasActive = false;
let _exiting = false;

// Boot the shell in: topbar/footer slide, tiles pop in as a staggered wave.
function playIntro() {
  const shell = $('wii-shell');
  if (!shell) return;
  shell.classList.remove('wii-outro');
  // restart the animation cleanly even if re-entered quickly
  shell.classList.remove('wii-intro');
  void shell.offsetWidth;
  shell.classList.add('wii-intro');
  clearTimeout(shell.__introT);
  shell.__introT = setTimeout(() => shell.classList.remove('wii-intro'), INTRO_MS);
}

// Tiles wave back out + the shell fades, THEN run `done` (the theme switch).
// `.wii-outro` stays ON after the wave — its `forwards` fill keeps the tiles
// hidden while the veil fades in over them. Removing it here made the tiles
// pop back for ~300ms before the veil covered (visible flicker). playIntro
// clears the class on the next entry.
function playOutro(done) {
  const shell = $('wii-shell');
  if (!shell) { done(); return; }
  shell.classList.remove('wii-intro');
  shell.classList.add('wii-outro');
  setTimeout(done, OUTRO_MS);
}

// ─── Theme crossfade veil — ambient "blobs" drift in / recede ──
const FADE_IN_MS = 1320;  // blobs paint in + settle, then swap beneath
const FADE_OUT_MS = 1000; // blobs recede, revealing the desktop
function canFade() {
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    && window.matchMedia('(min-width: 768px)').matches;
}
function makeVeil(name) {
  const v = document.createElement('div');
  v.className = 'wii-fade-veil';
  // Colour the blobs: for ENTER, the project that's about to be focused (so the
  // circles arrive in the colour the shell settles to); for EXIT, the shell's
  // CURRENT ambient. Either way the hand-off is seamless.
  let amb = null;
  if (name) amb = ambColorsFor(name);
  else {
    const shell = $('wii-shell');
    if (shell) amb = ['--wii-amb-1', '--wii-amb-2', '--wii-amb-3'].map((k) => shell.style.getPropertyValue(k));
  }
  if (amb) {
    v.style.setProperty('--wii-amb-1', amb[0]);
    v.style.setProperty('--wii-amb-2', amb[1]);
    v.style.setProperty('--wii-amb-3', amb[2]);
  }
  v.innerHTML = '<div class="wii-veil-base"></div>'
    + '<div class="wii-blob wii-blob-1"></div>'
    + '<div class="wii-blob wii-blob-2"></div>'
    + '<div class="wii-blob wii-blob-3"></div>';
  document.body.appendChild(v);
  return v;
}

// Enter: the ambient blobs drift in and slowly paint over the still-visible
// desktop, then — once fully covered — swap to Wii beneath the veil → seamless.
function enterWiiTheme() {
  if (typeof window.setTheme !== 'function') return;
  if (!canFade() || !$('wii-shell')) { window.setTheme('wii'); return; }
  const name = channels()[0]; // the tile that'll be focused on open
  // Pre-tint the (hidden) shell to that project's colour so when it appears it's
  // ALREADY the right colour — no grey start, and no stale colour left over from
  // whatever tile the previous session closed on.
  applyAmbilight(name);
  const veil = makeVeil(name);
  void veil.offsetWidth;
  veil.classList.add('is-on');
  setTimeout(() => window.setTheme('wii'), FADE_IN_MS);
  // Crossfade the veil OUT over the now-tinted shell (instead of an instant
  // remove) so the blobs → shell-gradient hand-off doesn't visibly jump.
  setTimeout(() => { veil.style.transition = 'opacity 340ms ease'; veil.style.opacity = '0'; }, FADE_IN_MS + 40);
  setTimeout(() => veil.remove(), FADE_IN_MS + 430);
}

// Leave: wave the tiles out, then the blobs recede to reveal the desktop.
function exitTheme() {
  if (_exiting) return;
  _exiting = true;
  const restore = () => {
    let prev = 'default';
    try { prev = localStorage.getItem('palette-prev') || 'default'; } catch (e) { /* ignore */ }
    if (prev === 'wii' || prev === 'tui' || prev === 'pink') prev = 'default';
    return prev;
  };
  playOutro(() => {
    const prev = restore();
    if (!canFade() || typeof window.setTheme !== 'function') {
      _exiting = false;
      if (typeof window.setTheme === 'function') window.setTheme(prev);
      return;
    }
    // Crossfade the veil IN over the shell (same colour, blends the gradient →
    // blobs hand-off), THEN switch to the desktop beneath it, THEN blobs recede.
    const veil = makeVeil(); // copies the shell's current ambient
    veil.classList.add('is-full');
    veil.style.opacity = '0';
    void veil.offsetWidth;
    veil.style.transition = 'opacity 300ms ease';
    veil.style.opacity = '1';
    setTimeout(() => {
      window.setTheme(prev);          // desktop appears beneath the now-opaque veil
      veil.style.transition = '';
    }, 320);
    setTimeout(() => { veil.classList.remove('is-full'); veil.classList.add('is-off'); }, 360);
    setTimeout(() => {
      veil.remove();
      $('wii-shell')?.classList.remove('wii-outro'); // tidy — shell is hidden by now
      _exiting = false;
    }, 360 + FADE_OUT_MS + 200);
  });
}

// ─── Channel open: tile → coverflow → fullscreen viewer ─────────
let overlay = null;
let lastTile = null;
let carItems = [];
let carIndex = 0;
let coverCards = [];
let viewerOpen = false;
let readerOpen = false;
let readerPages = [];
let readerIndex = 0;
let readerPageW = 0;       // measured page width (px) — the transform step
let readerMeasured = false;

function fillCardMedia(card) {
  if (card.dataset.filled) return;
  const item = carItems[+card.dataset.idx];
  let html;
  if (item.isVideo) {
    const poster = videoThumb(item.src, 900);
    html = (poster
      ? `<img src="${poster}" alt="" draggable="false" />`
      : `<video src="${item.src}#t=0.1" muted playsinline preload="metadata"></video>`)
      + '<span class="wii-play">▶</span>';
  } else {
    html = `<img src="${transformUrl(item.src, 900)}" alt="" draggable="false" />`;
  }
  card.querySelector('.wii-cover-media').innerHTML = html;
  card.dataset.filled = '1';
}

// Coverflow: centre card flat & large, neighbours peeled back in 3D, the rest
// faded out to the sides. Same elements move on each step, so it slides.
function layoutCover() {
  coverCards.forEach((card, i) => {
    const rel = i - carIndex;
    if (Math.abs(rel) <= 2) fillCardMedia(card);
    let t, op = 1, z = 1, pe = 'auto';
    if (rel === 0) { t = 'translate(-50%,-50%) scale(1)'; z = 3; }
    else if (rel === -1) { t = 'translate(calc(-50% - 320px),-50%) rotateY(34deg) scale(.82)'; op = 0.92; z = 2; }
    else if (rel === 1) { t = 'translate(calc(-50% + 320px),-50%) rotateY(-34deg) scale(.82)'; op = 0.92; z = 2; }
    else if (rel < -1) { t = 'translate(calc(-50% - 560px),-50%) rotateY(44deg) scale(.6)'; op = 0; pe = 'none'; }
    else { t = 'translate(calc(-50% + 560px),-50%) rotateY(-44deg) scale(.6)'; op = 0; pe = 'none'; }
    card.style.transform = t;
    card.style.opacity = op;
    card.style.zIndex = z;
    card.style.pointerEvents = pe;
    card.classList.toggle('is-current', rel === 0);
  });
  const cap = overlay && overlay.querySelector('.wii-cover-caption');
  if (cap) cap.textContent = `${carIndex + 1} / ${carItems.length}`;
}

function stepCover(delta) {
  const n = carItems.length;
  carIndex = Math.max(0, Math.min(n - 1, carIndex + delta));
  layoutCover();
  if (viewerOpen) refreshViewer();
}

function buildCover() {
  const track = overlay.querySelector('.wii-cover-track');
  track.innerHTML = carItems.map((item, i) => `
    <div class="wii-cover-card" data-idx="${i}">
      <span class="wii-cover-media"></span>
      <span class="wii-cover-name">${item.name || ''}</span>
    </div>`).join('');
  coverCards = [...track.querySelectorAll('.wii-cover-card')];
  coverCards.forEach((card) => {
    card.addEventListener('click', () => {
      const idx = +card.dataset.idx;
      if (idx === carIndex) activateCard();
      else { carIndex = idx; layoutCover(); }
    });
  });
  layoutCover();
}

// Enter / click on the centred card: open a magazine into the page reader, or a
// regular file into the fullscreen viewer.
function activateCard() {
  const item = carItems[carIndex];
  if (item && item.isMagazine) openReader(item);
  else openViewer();
}

// FLIP: animate `el` from `fromRect` (a previous on-screen rect) to its current
// resting position. `baseTransform` is the transform `el` settles at.
function flipFrom(el, fromRect, baseTransform) {
  const to = el.getBoundingClientRect();
  const dx = (fromRect.left + fromRect.width / 2) - (to.left + to.width / 2);
  const dy = (fromRect.top + fromRect.height / 2) - (to.top + to.height / 2);
  const s = Math.max(0.04, fromRect.width / to.width);
  el.style.transition = 'none';
  el.style.transform = baseTransform.includes('-50%')
    ? `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${s})`
    : `translate(${dx}px, ${dy}px) scale(${s})`;
  void el.offsetWidth;
  el.style.transition = '';
  el.style.transform = baseTransform;
  // Safety: if the transition is throttled and never fires, force the element
  // to its resting transform after the animation so it can't stay stuck small.
  clearTimeout(el.__flipT);
  el.__flipT = setTimeout(() => {
    el.style.transition = 'none';
    el.style.transform = baseTransform;
    void el.offsetWidth;
    el.style.transition = '';
  }, 380);
}

function openChannel(name, tile) {
  if (overlay) return; // a channel is already open
  const mag = isMagazineHost(name);
  carItems = mag ? magazinesOf(name) : filesFor(name);
  if (!carItems.length) return;
  if (mag) {
    carIndex = 0;
  } else {
    // Start on the file the tile shows (its edit/lead), so the first card you
    // see is exactly the one the screen zoomed into.
    const leadSrc = faceFor(name).src;
    const li = carItems.findIndex((i) => i.src === leadSrc);
    carIndex = li >= 0 ? li : 0;
  }
  viewerOpen = false;
  readerOpen = false;
  lastTile = tile || document.activeElement;
  const shell = $('wii-shell');
  const grid = $('wii-channels');

  // Zoom origin = the chosen tile's centre (in grid coords), so the screen
  // flies INTO that tile.
  const gr = grid.getBoundingClientRect();
  const tr = lastTile.getBoundingClientRect();
  grid.style.transformOrigin =
    `${tr.left + tr.width / 2 - gr.left + grid.scrollLeft}px ` +
    `${tr.top + tr.height / 2 - gr.top + grid.scrollTop}px`;

  const backdrop = document.createElement('div');
  backdrop.className = 'wii-zoom-backdrop';
  shell.appendChild(backdrop);

  overlay = document.createElement('div');
  overlay.className = 'wii-overlay';
  overlay.tabIndex = -1;
  overlay.innerHTML = `
    <button type="button" class="wii-close wii-cover-close" aria-label="Zurück">×</button>
    <div class="wii-cover" role="dialog" aria-label="${name}">
      <button type="button" class="wii-nav wii-nav-prev" aria-label="Zurück">‹</button>
      <div class="wii-cover-track"></div>
      <button type="button" class="wii-nav wii-nav-next" aria-label="Weiter">›</button>
    </div>
    <div class="wii-cover-caption"></div>
    <div class="wii-cover-hint">Enter zum Öffnen</div>
    <div class="wii-viewer"></div>
    <div class="wii-reader"></div>`;
  shell.appendChild(overlay);
  overlay.__backdrop = backdrop;

  buildCover();
  overlay.querySelector('.wii-nav-prev').addEventListener('click', () => stepCover(-1));
  overlay.querySelector('.wii-nav-next').addEventListener('click', () => stepCover(1));
  overlay.querySelector('.wii-cover-close').addEventListener('click', closeChannel);
  overlay.addEventListener('keydown', onOverlayKeydown);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeChannel(); });

  // The screen zooms into the tile and the room blacks out; then the coverflow
  // — centred on that same file — fades in over the black. Forced reflow, not
  // rAF (rAF throttles in background tabs).
  void grid.offsetWidth;
  shell.classList.add('is-opening');
  grid.classList.add('is-zoomed');
  backdrop.classList.add('is-on');
  setTimeout(() => {
    if (!overlay) return;
    overlay.classList.add('is-open');
    overlay.focus();
  }, 300);
}

function onOverlayKeydown(e) {
  if (readerOpen) {
    const reader = overlay.querySelector('.wii-reader');
    if (e.key === 'Escape' || e.key === 'Backspace') { e.preventDefault(); closeReader(); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); readerGoTo(reader, readerIndex + 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); readerGoTo(reader, readerIndex - 1); }
    else if (e.key === 'Home') { e.preventDefault(); readerGoTo(reader, 0); }
    else if (e.key === 'End') { e.preventDefault(); readerGoTo(reader, readerPages.length - 1); }
    return;
  }
  if (viewerOpen) {
    const stage = overlay.querySelector('.wii-viewer .wii-stage');
    const video = stage && stage.querySelector('video.wii-media');
    const seekable = video && video.duration;
    if (stage && stage.__wiiShowControls) stage.__wiiShowControls();
    if (e.key === 'Escape' || e.key === 'Backspace') {
      e.preventDefault();
      // Back un-maximizes first, then closes the viewer.
      if (stage && stage.classList.contains('is-max')) toggleMax(stage);
      else closeViewer();
    }
    else if ((e.key === ' ' || e.key === 'k' || e.key === 'Enter') && video) { e.preventDefault(); togglePlay(video); }
    else if (e.key === 'm' && video) { toggleMute(video); }
    else if (e.key === 'f' && stage) { toggleMax(stage); }
    // Left/right seek the timeline for video; for images they page files.
    else if (e.key === 'ArrowRight') { e.preventDefault(); if (seekable) video.currentTime = Math.min(video.duration, video.currentTime + 5); else stepCover(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); if (seekable) video.currentTime = Math.max(0, video.currentTime - 5); else stepCover(-1); }
    // Up/down always page to the previous / next file.
    else if (e.key === 'ArrowUp') { e.preventDefault(); stepCover(-1); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); stepCover(1); }
    return;
  }
  if (e.key === 'Escape' || e.key === 'Backspace') { e.preventDefault(); closeChannel(); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); stepCover(1); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); stepCover(-1); }
  else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activateCard(); }
}

function closeChannel() {
  if (!overlay) return;
  const el = overlay;
  const backdrop = el.__backdrop;
  overlay = null;
  viewerOpen = false;
  readerOpen = false;
  const shell = $('wii-shell');
  const grid = $('wii-channels');
  // Reverse: coverflow fades out, the grid un-zooms back out of the tile.
  el.classList.remove('is-open');
  if (backdrop) backdrop.classList.remove('is-on');
  grid.classList.remove('is-zoomed');
  shell.classList.remove('is-opening');
  const restore = lastTile;
  setTimeout(() => {
    el.remove();
    if (backdrop) backdrop.remove();
    grid.style.transformOrigin = '';
    if (restore) restore.focus();
  }, 460);
}

// ─── Fullscreen viewer (Enter on the centred file) ─────────────
// The stage shows the already-cached coverflow thumbnail (blurred) + a spinner
// while the full-res file streams in, so it never sits on plain black.
// Videos get custom Wii-styled controls (no native chrome).
const ICON = {
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>',
  volOn: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 9v6h4l5 5V4L8 9H4z"/><path d="M16 8.6a4 4 0 010 6.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  volOff: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 9v6h4l5 5V4L8 9H4z"/><path d="M22 9.5l-5 5M17 9.5l5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  fs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  fsExit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5v4H5M15 5v4h4M9 19v-4H5M15 19v-4h4"/></svg>',
};

// Play that survives the autoplay policy: only a genuine autoplay block
// (NotAllowedError — no user activation, e.g. a gamepad) falls back to muted.
// Transient AbortErrors (a play/pause race) must NOT mute the video.
function playWithFallback(video) {
  video.play().catch((err) => {
    if (err && err.name === 'NotAllowedError') {
      video.muted = true;
      video.play().catch(() => {});
    }
  });
}
function togglePlay(video) {
  if (video.paused) playWithFallback(video);
  else video.pause();
}
// Unmuting keeps the video playing; if the browser pauses unmuted playback
// without a gesture, fall back to muted so it never stops.
function toggleMute(video) {
  if (video.muted) { video.muted = false; playWithFallback(video); }
  else video.muted = true;
}
// "Fullscreen" via CSS (fills the viewport) — works from a gamepad, unlike
// native fullscreen which needs a real user gesture and can get stuck.
function toggleMax(stage) {
  const on = stage.classList.toggle('is-max');
  const btn = stage.querySelector('.wii-pc-fs');
  if (btn) btn.innerHTML = on ? ICON.fsExit : ICON.fs;
}

function fmtTime(s) {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60).toString().padStart(2, '0');
  return `${m}:${r}`;
}

function viewerStageHTML(item, placeholder) {
  const ph = placeholder ? `<img class="wii-ph" src="${placeholder}" alt="" aria-hidden="true" />` : '';
  const loader = '<div class="wii-loader" aria-hidden="true"></div>';
  if (!item.isVideo) {
    return `${ph}${loader}<img class="wii-media" src="${transformUrl(item.src, 1800)}" alt="${item.name || ''}" />`;
  }
  // No src — playStream() attaches the adaptive Stream rendition (or raw mp4).
  return `${ph}${loader}
    <video class="wii-media" autoplay playsinline></video>
    <button type="button" class="wii-play-overlay" aria-label="Abspielen / Pause"><span class="wii-play-fab"></span></button>
    <div class="wii-controls">
      <button type="button" class="wii-pc-btn wii-pc-play" aria-label="Abspielen / Pause"></button>
      <span class="wii-pc-time" data-t="cur">0:00</span>
      <div class="wii-pc-scrub">
        <div class="wii-pc-track"></div>
        <div class="wii-pc-buf"></div>
        <div class="wii-pc-fill"></div>
        <div class="wii-pc-thumb"></div>
        <input class="wii-pc-input" type="range" min="0" max="1000" value="0" aria-label="Suchen" />
      </div>
      <span class="wii-pc-time" data-t="dur">0:00</span>
      <button type="button" class="wii-pc-btn wii-pc-mute" aria-label="Stummschalten"></button>
      <button type="button" class="wii-pc-btn wii-pc-fs" aria-label="Vollbild"></button>
    </div>`;
}

// Wire the custom controls to the stage's <video>. Mirrors the m3-shell player,
// styled for Wii and tinted by the project accent (--wii-ring-glow).
function wireWiiPlayer(stage) {
  const video = stage.querySelector('video.wii-media');
  if (!video) return;
  const playBtn = stage.querySelector('.wii-pc-play');
  const fab = stage.querySelector('.wii-play-fab');
  const overlay = stage.querySelector('.wii-play-overlay');
  const tCur = stage.querySelector('[data-t="cur"]');
  const tDur = stage.querySelector('[data-t="dur"]');
  const input = stage.querySelector('.wii-pc-input');
  const fill = stage.querySelector('.wii-pc-fill');
  const buf = stage.querySelector('.wii-pc-buf');
  const thumb = stage.querySelector('.wii-pc-thumb');
  const muteBtn = stage.querySelector('.wii-pc-mute');
  const fsBtn = stage.querySelector('.wii-pc-fs');

  playBtn.innerHTML = ICON.play;
  fab.innerHTML = ICON.play;
  muteBtn.innerHTML = ICON.volOn;
  fsBtn.innerHTML = ICON.fs;

  const toggle = () => togglePlay(video);
  const onProgress = () => {
    if (!video.duration) return;
    const pct = (video.currentTime / video.duration) * 100;
    fill.style.width = `${pct}%`;
    thumb.style.left = `${pct}%`;
    input.value = String(Math.round(pct * 10));
    tCur.textContent = fmtTime(video.currentTime);
  };
  const onBuffer = () => {
    if (!video.duration || !video.buffered.length) return;
    buf.style.width = `${(video.buffered.end(video.buffered.length - 1) / video.duration) * 100}%`;
  };

  let hideTimer = 0;
  const scheduleHide = () => {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { if (!video.paused) stage.classList.add('controls-hidden'); }, 2600);
  };
  const showControls = () => {
    stage.classList.remove('controls-hidden');
    clearTimeout(hideTimer);
    if (!video.paused) scheduleHide();
  };
  stage.__wiiShowControls = showControls;

  playBtn.addEventListener('click', toggle);
  overlay.addEventListener('click', toggle);
  video.addEventListener('click', toggle);
  video.addEventListener('play', () => { stage.dataset.playing = '1'; playBtn.innerHTML = ICON.pause; scheduleHide(); });
  video.addEventListener('pause', () => { stage.removeAttribute('data-playing'); playBtn.innerHTML = ICON.play; showControls(); });
  video.addEventListener('ended', () => { stage.removeAttribute('data-playing'); playBtn.innerHTML = ICON.play; showControls(); });
  video.addEventListener('loadedmetadata', () => { tDur.textContent = fmtTime(video.duration); });
  video.addEventListener('timeupdate', onProgress);
  video.addEventListener('progress', onBuffer);
  video.addEventListener('volumechange', () => {
    muteBtn.innerHTML = (video.muted || video.volume === 0) ? ICON.volOff : ICON.volOn;
  });
  input.addEventListener('input', () => {
    if (!video.duration) return;
    video.currentTime = (Number(input.value) / 1000) * video.duration;
    onProgress();
    showControls();
  });
  muteBtn.addEventListener('click', () => toggleMute(video));
  fsBtn.addEventListener('click', () => toggleMax(stage));
  stage.addEventListener('pointermove', showControls);
  showControls();
}

function placeholderFor() {
  const img = coverCards[carIndex] && coverCards[carIndex].querySelector('img');
  return img ? img.src : '';
}

function mountViewerVideo() {
  const v = overlay && overlay.querySelector('.wii-viewer video');
  if (!v) return;
  playStream(v, carItems[carIndex].src);
  // Make sure it actually starts: unmuted autoplay is blocked without a user
  // gesture, so play() (mute-fallback) once it can, and again as a safety net.
  v.addEventListener('canplay', () => playWithFallback(v), { once: true });
  setTimeout(() => { if (v.paused && !v.ended) playWithFallback(v); }, 600);
}

// Drop the loading veil once the media can actually show something.
function bindStageLoading(stage) {
  const media = stage.querySelector('.wii-media');
  if (!media) { stage.classList.remove('is-loading'); return; }
  const done = () => stage.classList.remove('is-loading');
  if (media.tagName === 'IMG') {
    if (media.complete && media.naturalWidth) done();
    else { media.addEventListener('load', done, { once: true }); media.addEventListener('error', done, { once: true }); }
  } else {
    media.addEventListener('loadeddata', done, { once: true });
    media.addEventListener('playing', done, { once: true });
    setTimeout(done, 5000); // safety net for a stalled stream
  }
}

function fillStage(stage) {
  stage.classList.add('is-loading');
  stage.removeAttribute('data-playing');
  const item = carItems[carIndex];
  stage.innerHTML = viewerStageHTML(item, placeholderFor());
  if (item.isVideo) wireWiiPlayer(stage);
  mountViewerVideo();
  bindStageLoading(stage);
}

function refreshViewer() {
  const stage = overlay && overlay.querySelector('.wii-viewer .wii-stage');
  if (stage) fillStage(stage);
}

function openViewer() {
  if (!overlay || viewerOpen) return;
  viewerOpen = true;
  const fromRect = coverCards[carIndex].querySelector('.wii-cover-media').getBoundingClientRect();
  const viewer = overlay.querySelector('.wii-viewer');
  viewer.innerHTML = `
    <button type="button" class="wii-close" aria-label="Schließen">×</button>
    <div class="wii-stage is-loading"></div>`;
  viewer.querySelector('.wii-close').addEventListener('click', closeViewer);
  viewer.addEventListener('click', (e) => { if (e.target === viewer) closeViewer(); });
  const stage = viewer.querySelector('.wii-stage');
  fillStage(stage);
  overlay.classList.add('viewer-open');
  void viewer.offsetWidth;
  viewer.classList.add('is-open');
  // Push the file closer: grow it from the coverflow card up to fullscreen.
  flipFrom(stage, fromRect, 'scale(1)');
}

function closeViewer() {
  if (!overlay) return;
  viewerOpen = false;
  const viewer = overlay.querySelector('.wii-viewer');
  overlay.classList.remove('viewer-open');
  viewer.classList.remove('is-open');
  setTimeout(() => { if (!viewerOpen && overlay) viewer.innerHTML = ''; }, 240);
}

// ─── Magazine page reader (continuous strip, transform-based) ──
// Pages sit edge-to-edge with no gap/rounding, so an image that bleeds across
// two pages stays continuous. Paging slides a transform track (not scroll —
// transforms animate deterministically, unlike scrollLeft in some engines).
// Windowed loading: only pages within ±2 of the current get their media.
function fillReaderPage(reader, page) {
  if (page.dataset.filled) return;
  const p = readerPages[+page.dataset.idx];
  if (p.isVideo) {
    page.innerHTML = `<video src="${p.src}#t=0.1" muted loop playsinline preload="metadata"></video>`;
    const v = page.querySelector('video');
    v.addEventListener('loadedmetadata', () => measurePage(reader, v.videoWidth / v.videoHeight), { once: true });
  } else {
    const img = document.createElement('img');
    img.draggable = false;
    img.addEventListener('load', () => measurePage(reader, img.naturalWidth / img.naturalHeight), { once: true });
    img.src = transformUrl(p.src, 1600);
    page.appendChild(img);
  }
  page.dataset.filled = '1';
}

// Lock the per-page width from the first decoded page's aspect (pages are
// uniform scans), so the strip is gap-free and the transform step is exact.
function measurePage(reader, aspect) {
  if (readerMeasured || !isFinite(aspect) || aspect <= 0) return;
  readerMeasured = true;
  const vp = reader.querySelector('.wii-reader-viewport');
  const stage = reader.querySelector('.wii-reader-stage');
  readerPageW = Math.round((vp.clientHeight || 1) * aspect);
  stage.style.setProperty('--wii-page-w', `${readerPageW}px`); // stage owns it (nav reads it too)
  applyReaderTransform(reader);
}

// Centre the current page in the wide viewport, so the previous and next pages
// peek on either side as one continuous strip.
function applyReaderTransform(reader) {
  const vp = reader.querySelector('.wii-reader-viewport');
  const track = reader.querySelector('.wii-reader-track');
  if (!track || !vp) return;
  const offset = (vp.clientWidth - readerPageW) / 2;
  track.style.transform = `translateX(${offset - readerIndex * readerPageW}px)`;
}

function updateReader(reader, idx) {
  readerIndex = idx;
  const track = reader.querySelector('.wii-reader-track');
  [...track.children].forEach((pg, i) => { if (Math.abs(i - idx) <= 2) fillReaderPage(reader, pg); });
  reader.querySelector('.wii-reader-counter').textContent = `${idx + 1} / ${readerPages.length}`;
  const fill = reader.querySelector('.wii-reader-progress-fill');
  fill.style.width = readerPages.length > 1 ? `${(idx / (readerPages.length - 1)) * 100}%` : '100%';
  reader.querySelector('.wii-reader-prev').disabled = idx <= 0;
  reader.querySelector('.wii-reader-next').disabled = idx >= readerPages.length - 1;
  // Only the visible page's video plays.
  track.querySelectorAll('video').forEach((v) => {
    const pageIdx = +v.closest('.wii-reader-page').dataset.idx;
    if (pageIdx === idx) v.play().catch(() => {}); else v.pause();
  });
}

function readerGoTo(reader, idx) {
  const clamped = Math.max(0, Math.min(readerPages.length - 1, idx));
  readerIndex = clamped;
  applyReaderTransform(reader);
  updateReader(reader, clamped);
}

function wireReader(reader) {
  const vp = reader.querySelector('.wii-reader-viewport');
  const track = reader.querySelector('.wii-reader-track');
  reader.querySelector('.wii-reader-prev').addEventListener('click', () => readerGoTo(reader, readerIndex - 1));
  reader.querySelector('.wii-reader-next').addEventListener('click', () => readerGoTo(reader, readerIndex + 1));
  reader.querySelector('.wii-reader-close').addEventListener('click', closeReader);
  reader.addEventListener('click', (e) => { if (e.target === reader) closeReader(); });

  // Pointer-drag the track; snap to the nearest page on release.
  let dragging = false, startX = 0, lastX = 0, pid = null;
  vp.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    dragging = true; pid = e.pointerId; startX = lastX = e.clientX;
    track.style.transition = 'none'; vp.classList.add('is-dragging'); vp.setPointerCapture(e.pointerId);
  });
  vp.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    lastX = e.clientX;
    const offset = (vp.clientWidth - readerPageW) / 2;
    track.style.transform = `translateX(${offset - readerIndex * readerPageW + (e.clientX - startX)}px)`;
  });
  const endDrag = () => {
    if (!dragging) return;
    dragging = false; vp.classList.remove('is-dragging');
    try { vp.releasePointerCapture(pid); } catch (_) { /* noop */ }
    track.style.transition = '';
    const delta = lastX - startX, thr = Math.min(90, readerPageW * 0.15);
    let target = readerIndex;
    if (delta < -thr) target += 1;
    else if (delta > thr) target -= 1;
    readerGoTo(reader, target);
  };
  vp.addEventListener('pointerup', endDrag);
  vp.addEventListener('pointercancel', endDrag);
  updateReader(reader, 0);
}

function openReader(mag) {
  if (!overlay || readerOpen || viewerOpen) return;
  readerPages = (mag.pages || []).filter((p) => p && p.src);
  if (!readerPages.length) return;
  readerOpen = true;
  readerIndex = 0;
  readerMeasured = false;
  const fromRect = coverCards[carIndex].querySelector('.wii-cover-media').getBoundingClientRect();
  const reader = overlay.querySelector('.wii-reader');
  reader.innerHTML = `
    <button type="button" class="wii-close wii-reader-close" aria-label="Zurück">×</button>
    <div class="wii-reader-title">${mag.name || ''}</div>
    <div class="wii-reader-stage">
      <button type="button" class="wii-nav wii-nav-prev wii-reader-prev" aria-label="Zurück">‹</button>
      <div class="wii-reader-viewport">
        <div class="wii-reader-track">${readerPages.map((p, i) => `<div class="wii-reader-page" data-idx="${i}"></div>`).join('')}</div>
      </div>
      <button type="button" class="wii-nav wii-nav-next wii-reader-next" aria-label="Weiter">›</button>
    </div>
    <div class="wii-reader-foot">
      <div class="wii-reader-progress"><div class="wii-reader-progress-fill"></div></div>
      <div class="wii-reader-counter">1 / ${readerPages.length}</div>
    </div>`;
  // Seed the step from the CSS default page width until the first page measures.
  readerPageW = reader.querySelector('.wii-reader-page')?.offsetWidth || 560;
  wireReader(reader);
  overlay.classList.add('reader-open');
  void reader.offsetWidth;
  reader.classList.add('is-open');
  // Grow the reader out of the magazine card.
  flipFrom(reader.querySelector('.wii-reader-stage'), fromRect, 'scale(1)');
}

function closeReader() {
  if (!overlay) return;
  readerOpen = false;
  const reader = overlay.querySelector('.wii-reader');
  reader.querySelectorAll('video').forEach((v) => v.pause());
  overlay.classList.remove('reader-open');
  reader.classList.remove('is-open');
  setTimeout(() => { if (!readerOpen && overlay) reader.innerHTML = ''; }, 260);
}

// ─── Clock ─────────────────────────────────────────────────────
function updateClock() {
  const el = $('wii-clock');
  if (!el) return;
  el.textContent = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

// ─── Boot ──────────────────────────────────────────────────────
function ensureRendered() {
  if (rendered) return;
  renderGrid();
  const grid = $('wii-channels');
  if (!grid) return;
  grid.addEventListener('keydown', onGridKeydown);
  // Mouse / Wii-hand: clicking a channel opens it (and syncs focus first).
  grid.addEventListener('click', (e) => {
    const tile = e.target.closest('.wii-channel');
    if (!tile) return;
    const list = tiles();
    const i = list.indexOf(tile);
    if (i >= 0) focusTile(list, i);
    openChannel(tile.dataset.name, tile);
  });
}

function init() {
  if (!$('wii-shell')) return;
  updateClock();
  setInterval(updateClock, 30000);
  window.addEventListener('resize', () => { _cols = 0; }); // grid columns may change
  window.enterWiiTheme = enterWiiTheme; // crossfade entry, used by the prompt + menu
  $('wii-exit')?.addEventListener('click', exitTheme);
  const focusFirst = () => { const list = tiles(); if (list.length) focusTile(list, 0); };
  if (isActive()) {
    ensureRendered();
    _wasActive = true;
    playIntro();   // boot animation on first paint
    focusFirst();
  }
  document.addEventListener('theme-change', () => {
    if (!isActive()) { _wasActive = false; return; }
    ensureRendered();
    updateClock();
    if (!_wasActive) playIntro();  // only when entering, not on dark-mode toggles etc.
    _wasActive = true;
    focusFirst();
  });
  // Palette loads async — paint the ambient background for the focused tile once
  // the colours arrive.
  window.addEventListener('edit-posters-ready', () => {
    if (!isActive()) return;
    const f = document.querySelector('#wii-channels .wii-channel.is-focused');
    if (f) applyAmbilight(f.dataset.name);
  });
  // The runtime portfolio sync can merge NEW projects after we've rendered —
  // rebuild the grid so a fresh upload appears without a reload. Focus (and the
  // open channel's return-tile) are re-resolved by name onto the new elements.
  window.addEventListener('portfolio-updated', () => {
    if (!rendered) return; // first render will already include the new data
    const focusedName = document.querySelector('#wii-channels .wii-channel.is-focused')?.dataset.name;
    renderGrid();
    _cols = 0;
    if (lastTile && lastTile.dataset) {
      const again = document.querySelector(`#wii-channels .wii-channel[data-name="${CSS.escape(lastTile.dataset.name || '')}"]`);
      if (again) lastTile = again;
    }
    if (isActive() && !overlay) {
      const list = tiles();
      const idx = Math.max(0, list.findIndex((t) => t.dataset.name === focusedName));
      if (list.length) focusTile(list, idx);
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
