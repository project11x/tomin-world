// Material 3 Desktop Shell — Rail + List + Detail layout that replaces
// the macOS-style desktop when html.theme-material is active on desktop.
//
// Tab semantics:
//   edits     → flat list of every video edit, detail = video player
//   shoots    → photo projects (non-magazine), detail = photo grid
//   magazines → TOMIN INDEX.TXT/* subprojects, detail = page grid
//   about     → about-me view, no list

import { portfolioData } from '../../data.js';
import { setIcon } from '../utils/icons.js';

const TAB_LABELS = {
  edits: 'Edits',
  shoots: 'Shoots',
  magazines: 'Magazines',
  about: 'About',
};

const FAB_LABELS = {
  edits: 'New edit',
  shoots: 'New shoot',
  magazines: 'New magazine',
  about: 'Edit profile',
};

const MAGAZINE_PREFIX = 'TOMIN INDEX.TXT';

let activeTab = 'edits';
let activeProject = null;   // project name when list mode = projects
let activeFile = null;      // {project, item} when list mode = files
let searchQuery = '';

const listMode = () => {
  if (activeTab === 'edits') return 'files';
  if (activeTab === 'about') return 'none';
  return 'projects';
};

// Behind-the-scenes filter: matches the iOS BTS app — files whose
// name (sans extension) contains 4+ digits and isn't a magazine page.
function isBtsFile(item) {
  if (item.isMagazine) return false;
  const nameNoExt = item.name.replace(/\.[^/.]+$/, '');
  return (nameNoExt.match(/\d/g) || []).length >= 4;
}

function projectsForTab() {
  const names = Object.keys(portfolioData);
  if (activeTab === 'magazines') return names.filter((n) => n.startsWith(MAGAZINE_PREFIX + '/'));
  if (activeTab === 'shoots') {
    return names.filter((n) => {
      if (n.startsWith(MAGAZINE_PREFIX)) return false;
      return (portfolioData[n] || []).some(isBtsFile);
    });
  }
  return names;
}

function thumbForProject(name) {
  const items = portfolioData[name] || [];
  const preferBts = activeTab === 'shoots';
  const firstImage = items.find((i) => !i.isVideo && i.src && (!preferBts || isBtsFile(i)))
    || items.find((i) => !i.isVideo && i.src);
  return firstImage ? firstImage.src : '';
}

function projectMeta(name) {
  const items = portfolioData[name] || [];
  if (activeTab === 'shoots') {
    const n = items.filter(isBtsFile).length;
    return n ? `${n} photo${n === 1 ? '' : 's'}` : 'Empty';
  }
  const v = items.filter((i) => i.isVideo).length;
  const p = items.length - v;
  const parts = [];
  if (p) parts.push(`${p} photo${p === 1 ? '' : 's'}`);
  if (v) parts.push(`${v} video${v === 1 ? '' : 's'}`);
  return parts.join(' · ') || 'Empty';
}

function flatFiles() {
  const out = [];
  for (const [project, items] of Object.entries(portfolioData)) {
    items.forEach((item) => out.push({ project, item }));
  }
  if (activeTab === 'edits') {
    // Edits = curated videos with descriptive names. Exclude magazine
    // projects (TOMIN INDEX.TXT/*) and raw camera files whose names
    // start with MOV/DSC/IMG followed by a timestamp.
    const rawCamera = /^(MOV|DSC|IMG|_DSC)[\d_-]/i;
    return out.filter(
      (f) =>
        f.item.isVideo &&
        !f.project.startsWith(MAGAZINE_PREFIX) &&
        !rawCamera.test(f.item.name)
    );
  }
  return out;
}

function fileMatchesSearch(f) {
  if (!searchQuery) return true;
  return (
    f.item.name.toLowerCase().includes(searchQuery) ||
    f.project.toLowerCase().includes(searchQuery)
  );
}

function projectMatchesSearch(name) {
  if (!searchQuery) return true;
  return name.toLowerCase().includes(searchQuery);
}

function renderList() {
  const list = document.getElementById('m3d-list');
  if (!list) return;

  const listPane = list.closest('.m3d-pane--list');
  const shell = document.getElementById('m3-desktop');
  if (listMode() === 'none') {
    list.innerHTML = '';
    if (listPane) listPane.style.display = 'none';
    shell?.classList.add('no-list');
    return;
  }
  if (listPane) listPane.style.display = '';
  shell?.classList.remove('no-list');

  if (listMode() === 'projects') {
    const projects = projectsForTab().filter(projectMatchesSearch);
    list.innerHTML = projects
      .map((name) => {
        const thumb = thumbForProject(name);
        const meta = projectMeta(name);
        const cls = name === activeProject ? 'm3d-list-item is-active' : 'm3d-list-item';
        const bg = thumb ? `style="background-image:url('${thumb}')"` : '';
        const displayName = activeTab === 'magazines' && name.startsWith(MAGAZINE_PREFIX + '/')
          ? name.slice(MAGAZINE_PREFIX.length + 1)
          : name;
        return `
          <div class="${cls}" data-project="${encodeURIComponent(name)}">
            <div class="m3d-list-thumb" ${bg}></div>
            <div class="m3d-list-text">
              <span class="m3d-list-title">${displayName}</span>
              <span class="m3d-list-subtitle">${meta}</span>
            </div>
          </div>`;
      })
      .join('');
    list.querySelectorAll('.m3d-list-item').forEach((el) => {
      el.addEventListener('click', () => {
        activeProject = decodeURIComponent(el.dataset.project);
        activeFile = null;
        renderList();
        renderDetail();
      });
    });
  } else {
    const files = flatFiles().filter(fileMatchesSearch);
    list.innerHTML = files
      .map((f, idx) => {
        const isActive =
          activeFile && activeFile.project === f.project && activeFile.item.src === f.item.src;
        const cls = isActive ? 'm3d-list-item is-active' : 'm3d-list-item';
        const poster = f.item.isVideo ? thumbForProject(f.project) : f.item.src;
        const bg = poster ? `style="background-image:url('${poster}')"` : '';
        const icon = f.item.isVideo
          ? '<span class="material-symbols-rounded m3d-thumb-play">play_circle</span>'
          : '';
        return `
          <div class="${cls}" data-idx="${idx}">
            <div class="m3d-list-thumb" ${bg}>${icon}</div>
            <div class="m3d-list-text">
              <span class="m3d-list-title">${f.item.name}</span>
              <span class="m3d-list-subtitle">${f.project} · ${f.item.size || ''}</span>
            </div>
          </div>`;
      })
      .join('');
    list.querySelectorAll('.m3d-list-item').forEach((el) => {
      el.addEventListener('click', () => {
        activeFile = files[parseInt(el.dataset.idx, 10)];
        activeProject = null;
        renderList();
        renderDetail();
      });
    });
  }
}

function renderDetail() {
  const detail = document.getElementById('m3d-detail');
  if (!detail) return;

  if (activeTab === 'about') {
    renderAbout(detail);
    return;
  }

  if (listMode() === 'projects') {
    if (!activeProject) {
      detail.innerHTML = `<div class="m3d-detail-empty">Select an item from ${TAB_LABELS[activeTab]}</div>`;
      return;
    }
    let items = portfolioData[activeProject] || [];

    if (activeTab === 'magazines') {
      const title = activeProject.startsWith(MAGAZINE_PREFIX + '/')
        ? activeProject.slice(MAGAZINE_PREFIX.length + 1)
        : activeProject;
      detail.innerHTML = `
        <div class="m3d-detail-header">
          <h1 class="m3d-detail-title">${title}</h1>
          <span class="m3d-detail-meta">${items.length} page${items.length === 1 ? '' : 's'}</span>
        </div>
        <div class="m3d-mag-reader">
          <div class="m3d-mag-pages">
            ${items.map((p) => `
              <div class="m3d-mag-page">
                <img src="${p.src}" alt="" loading="lazy" draggable="false" />
              </div>
            `).join('')}
          </div>
          <button class="m3d-mag-nav m3d-mag-nav--prev" aria-label="Previous page" disabled>
            <span class="material-symbols-rounded">chevron_left</span>
          </button>
          <button class="m3d-mag-nav m3d-mag-nav--next" aria-label="Next page">
            <span class="material-symbols-rounded">chevron_right</span>
          </button>
          <div class="m3d-mag-indicator">
            <span class="m3d-mag-title">${title}</span>
            <span class="m3d-mag-dot">·</span>
            <span class="m3d-mag-counter">1 / ${items.length}</span>
          </div>
        </div>`;
      wireMagazineReader(detail.querySelector('.m3d-mag-reader'));
      return;
    }

    if (activeTab === 'shoots') items = items.filter(isBtsFile);
    detail.innerHTML = `
      <div class="m3d-detail-header">
        <h1 class="m3d-detail-title">${activeProject}</h1>
        <span class="m3d-detail-meta">${items.length} item${items.length === 1 ? '' : 's'}</span>
      </div>
      <div class="m3d-gallery">
        <div class="m3d-gallery-strip">
          ${items
            .map((it, idx) => {
              const bg = it.isVideo ? '' : `style="background-image:url('${it.src}')"`;
              const icon = it.isVideo
                ? '<span class="material-symbols-rounded m3d-thumb-play">play_circle</span>'
                : '';
              return `<button class="m3d-gallery-thumb${idx === 0 ? ' is-active' : ''}" data-idx="${idx}" ${bg} aria-label="${it.name}">${icon}</button>`;
            })
            .join('')}
        </div>
        <div class="m3d-gallery-stage">
          ${items
            .map((it, idx) => it.isVideo
              ? `<div class="m3d-gallery-frame" data-idx="${idx}" ${idx === 0 ? 'data-active' : ''}>${buildPlayerHTML(it)}</div>`
              : `<img class="m3d-gallery-frame" data-idx="${idx}" ${idx === 0 ? 'data-active' : ''} src="${it.src}" alt="${it.name}" draggable="false" />`)
            .join('')}
        </div>
        <div class="m3d-gallery-caption" data-caption>${items[0]?.name || ''}</div>
      </div>`;
    const frames = detail.querySelectorAll('.m3d-gallery-frame');
    const thumbs = detail.querySelectorAll('.m3d-gallery-thumb');
    const caption = detail.querySelector('[data-caption]');
    const players = detail.querySelectorAll('.m3d-player');
    players.forEach((p) => wirePlayer(p));
    const select = (idx) => {
      frames.forEach((f) => f.toggleAttribute('data-active', parseInt(f.dataset.idx, 10) === idx));
      thumbs.forEach((t) => t.classList.toggle('is-active', parseInt(t.dataset.idx, 10) === idx));
      caption && (caption.textContent = items[idx]?.name || '');
      players.forEach((p) => {
        const v = p.querySelector('video');
        if (!v) return;
        if (parseInt(p.closest('.m3d-gallery-frame').dataset.idx, 10) !== idx) v.pause();
      });
      const activeThumb = thumbs[idx];
      activeThumb?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    };
    thumbs.forEach((t) => t.addEventListener('click', () => select(parseInt(t.dataset.idx, 10))));
  } else {
    if (!activeFile) {
      detail.innerHTML = `<div class="m3d-detail-empty">Select an item from ${TAB_LABELS[activeTab]}</div>`;
      return;
    }
    const { item, project } = activeFile;
    detail.innerHTML = `
      <div class="m3d-detail-header">
        <h1 class="m3d-detail-title">${item.name}</h1>
        <span class="m3d-detail-meta">${project} · ${item.size || ''} · ${item.date || ''}</span>
      </div>
      <div class="m3d-preview">${
        item.isVideo
          ? buildPlayerHTML(item)
          : `<img class="m3d-preview-media" src="${item.src}" alt="${item.name}" />`
      }</div>`;
    if (item.isVideo) wirePlayer(detail.querySelector('.m3d-player'));
  }
}

// === About / Contact view ========================================
// Mirrors the mobile Contact tab so theme + identity live in one place
// across formats. Hero card, action row, about copy, theme settings.

function renderAbout(detail) {
  const seed = (() => {
    try { return localStorage.getItem('material-seed') || 'burgundy'; } catch (e) { return 'burgundy'; }
  })();
  const palette = (() => {
    try { return localStorage.getItem('palette') || 'default'; } catch (e) { return 'default'; }
  })();
  const isDark = document.documentElement.classList.contains('dark');

  const paletteBtn = (value, label) => `
    <button data-palette="${value}"
      style="flex:1; border:none; cursor:pointer; padding:10px 0; border-radius:var(--md-sys-shape-corner-full); font:inherit; font-size:14px; font-weight:500; ${
        palette === value
          ? 'background:var(--md-sys-color-secondary-container); color:var(--md-sys-color-on-secondary-container);'
          : 'background:transparent; color:var(--md-sys-color-on-surface-variant);'
      }">${label}</button>`;

  const modeBtn = (value, label, active) => `
    <button data-mode="${value}"
      style="flex:1; border:none; cursor:pointer; padding:10px 0; border-radius:var(--md-sys-shape-corner-full); font:inherit; font-size:14px; font-weight:500; ${
        active
          ? 'background:var(--md-sys-color-secondary-container); color:var(--md-sys-color-on-secondary-container);'
          : 'background:transparent; color:var(--md-sys-color-on-surface-variant);'
      }">${label}</button>`;

  const seedSwatch = (name, color) => `
    <button data-seed="${name}" aria-label="${name}"
      style="width:40px; height:40px; border-radius:50%; cursor:pointer; background:${color}; border:2px solid ${
        seed === name ? 'var(--md-sys-color-primary)' : 'transparent'
      };"></button>`;

  const actionBtn = (href, icon, label, extra = '') => `
    <a class="md-action-btn" href="${href}" ${extra}>
      <i class="bi bi-${icon}"></i>
      <span>${label}</span>
    </a>`;

  detail.innerHTML = `
    <div class="m3d-about-grid">
      <section class="md-hero m3d-about-hero">
        <img src="icons/profilepicture.png" alt="" />
        <div class="md-hero-scrim"></div>
        <div class="md-hero-meta">
          <p class="md-hero-eyebrow">Creative Direction · Editor</p>
          <h2 class="md-hero-title">Eddie</h2>
          <div class="md-hero-chips">
            <span class="md-loc-chip">Berlin</span>
            <span class="md-loc-chip">Everywhere</span>
          </div>
        </div>
      </section>

      <section class="m3d-about-actions">
        ${actionBtn('https://instagram.com/edpz', 'instagram', 'Instagram', 'target="_blank" rel="noopener"')}
        ${actionBtn('mailto:eddie@shouli.de', 'envelope-fill', 'Mail')}
        ${actionBtn('#', 'bookmark-fill', 'Save', 'data-action="save"')}
        ${actionBtn('#', 'share-fill', 'Share', 'data-action="share"')}
      </section>

      <section class="m3d-about-card">
        <p class="m3d-about-eyebrow">About</p>
        <p class="m3d-about-body">Eddie shoots, edits, and prints. Magazine work, music videos, and a steady stream of behind-the-scenes — built up over late nights in Berlin.</p>
      </section>

      <section class="m3d-about-card">
        <p class="m3d-about-eyebrow">Benachrichtigungen</p>
        <div class="m3d-push-row">
          <p class="m3d-about-body" style="flex:1;">Updates direkt auf den Computer.</p>
          <button id="m3d-push-toggle" role="switch" aria-checked="false" class="m3d-push-toggle">
            <span id="m3d-push-knob" class="m3d-push-knob"></span>
          </button>
        </div>
        <p id="m3d-push-hint" class="m3d-about-hint">Updates direkt auf dieses Gerät.</p>
      </section>

      <section class="m3d-about-card">
        <p class="m3d-about-eyebrow">Theme</p>

        <p class="m3d-about-label">Palette</p>
        <div class="m3d-about-segmented" data-md-palette-toggle>
          ${paletteBtn('default', 'Aero')}
          ${paletteBtn('pink', 'Fiona')}
          ${paletteBtn('material', 'Material')}
          ${paletteBtn('tui', 'Terminal')}
        </div>

        <p class="m3d-about-label">Helligkeit</p>
        <div class="m3d-about-segmented" data-md-mode-toggle>
          ${modeBtn('light', 'Light', !isDark)}
          ${modeBtn('dark', 'Dark', isDark)}
        </div>

        <p class="m3d-about-label">Seed-Farbe</p>
        <div class="m3d-about-seeds" data-md-seed-toggle>
          ${seedSwatch('burgundy', '#984061')}
          ${seedSwatch('green', '#2E7D32')}
          ${seedSwatch('blue', '#0061A4')}
          ${seedSwatch('coral', '#E55934')}
          ${seedSwatch('slate', '#5C6470')}
        </div>
      </section>
    </div>`;

  // Wire palette
  detail.querySelectorAll('[data-md-palette-toggle] [data-palette]').forEach((btn) => {
    btn.addEventListener('click', () => {
      window.setTheme?.(btn.dataset.palette);
      renderAbout(detail);
    });
  });
  // Light/Dark
  detail.querySelectorAll('[data-md-mode-toggle] [data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      window.setIosTheme?.(mode);
      document.documentElement.classList.toggle('dark', mode === 'dark');
      renderAbout(detail);
    });
  });
  // Seed
  detail.querySelectorAll('[data-md-seed-toggle] [data-seed]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const s = btn.dataset.seed;
      try { localStorage.setItem('material-seed', s); } catch (e) { /* ignore */ }
      document.documentElement.setAttribute('data-seed', s);
      document.documentElement.style.cssText = document.documentElement.style.cssText.replace(/--md-ref-[a-z-]+:[^;]+;?/g, '');
      renderAbout(detail);
    });
  });
  // Push toggle
  detail.querySelector('#m3d-push-toggle')?.addEventListener('click', () => {
    window.togglePushSubscription?.();
  });
  // Reflect current state after this DOM mount.
  setTimeout(() => {
    if (typeof window.refreshPushToggleUI === 'function') window.refreshPushToggleUI();
    else document.dispatchEvent(new Event('push-refresh-request'));
  }, 0);

  // Save (vCard)
  detail.querySelector('[data-action="save"]')?.addEventListener('click', (e) => {
    e.preventDefault();
    const vcard = [
      'BEGIN:VCARD', 'VERSION:3.0',
      'FN:Eddie',
      'EMAIL;TYPE=INTERNET:eddie@shouli.de',
      'URL:https://instagram.com/edpz',
      'END:VCARD',
    ].join('\n');
    const blob = new Blob([vcard], { type: 'text/vcard' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'eddie.vcf';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  // Share
  detail.querySelector('[data-action="share"]')?.addEventListener('click', async (e) => {
    e.preventDefault();
    try {
      if (navigator.share) await navigator.share({ title: 'Shouli', url: location.origin });
    } catch (_) { /* cancelled */ }
  });
}

// === Inline Magazine Reader ======================================

function wireMagazineReader(root) {
  if (!root) return;
  const pages = root.querySelector('.m3d-mag-pages');
  const counter = root.querySelector('.m3d-mag-counter');
  const prev = root.querySelector('.m3d-mag-nav--prev');
  const next = root.querySelector('.m3d-mag-nav--next');
  if (!pages || !counter) return;
  const total = pages.children.length;

  function pageStep() {
    const first = pages.firstElementChild;
    if (!first) return pages.clientWidth;
    const styles = getComputedStyle(pages);
    const gap = parseFloat(styles.columnGap || styles.gap || '0') || 0;
    return first.getBoundingClientRect().width + gap;
  }

  function currentIdx() {
    const step = pageStep();
    if (!step) return 0;
    return Math.min(Math.max(0, Math.round(pages.scrollLeft / step)), total - 1);
  }

  function markCurrent(idx) {
    [...pages.children].forEach((el, i) => el.classList.toggle('is-current', i === idx));
  }

  function updateUI() {
    const idx = currentIdx();
    counter.textContent = `${idx + 1} / ${total}`;
    if (prev) prev.disabled = idx <= 0;
    if (next) next.disabled = idx >= total - 1;
    markCurrent(idx);
  }

  function goTo(idx) {
    const step = pageStep();
    const clamped = Math.max(0, Math.min(total - 1, idx));
    pages.scrollTo({ left: clamped * step, behavior: 'smooth' });
  }

  pages.addEventListener('scroll', updateUI, { passive: true });
  prev?.addEventListener('click', () => goTo(currentIdx() - 1));
  next?.addEventListener('click', () => goTo(currentIdx() + 1));

  // Pointer-drag to swipe pages. Uses pointer capture so the drag keeps
  // tracking even if the cursor leaves the reader. Threshold = 12% of
  // page width or 80px (whichever is smaller) to snap to the next page.
  let dragging = false;
  let startX = 0;
  let startScroll = 0;
  let lastMoveX = 0;
  let pointerId = null;

  pages.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    pointerId = e.pointerId;
    startX = e.clientX;
    lastMoveX = e.clientX;
    startScroll = pages.scrollLeft;
    pages.classList.add('is-dragging');
    pages.setPointerCapture(e.pointerId);
  });

  pages.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    lastMoveX = e.clientX;
    pages.scrollLeft = startScroll - (e.clientX - startX);
  });

  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    pages.classList.remove('is-dragging');
    try { pages.releasePointerCapture(pointerId); } catch (_) {}
    const step = pageStep();
    const delta = lastMoveX - startX;
    const threshold = Math.min(80, step * 0.12);
    const startIdx = Math.round(startScroll / step);
    let target = startIdx;
    if (delta < -threshold) target = startIdx + 1;
    else if (delta > threshold) target = startIdx - 1;
    goTo(target);
  }

  pages.addEventListener('pointerup', endDrag);
  pages.addEventListener('pointercancel', endDrag);

  updateUI();
}

// === M3 Video Player =============================================

function buildPlayerHTML(item) {
  return `
    <div class="m3d-player" data-state="paused">
      <div class="m3d-player-stage">
        <video class="m3d-player-video" src="${item.src}" playsinline preload="metadata"></video>
        <button class="m3d-player-overlay" aria-label="Play">
          <span class="m3d-player-overlay-fab">
            <span class="material-symbols-rounded">play_arrow</span>
          </span>
        </button>
      </div>
      <div class="m3d-player-bar">
        <button class="m3d-player-btn m3d-player-play" aria-label="Play/Pause">
          <span class="material-symbols-rounded" data-icon="play">play_arrow</span>
        </button>
        <span class="m3d-player-time" data-time="current">0:00</span>
        <div class="m3d-player-scrub">
          <div class="m3d-player-scrub-track"></div>
          <div class="m3d-player-scrub-buffer"></div>
          <div class="m3d-player-scrub-fill"></div>
          <div class="m3d-player-scrub-thumb"></div>
          <input class="m3d-player-scrub-input" type="range" min="0" max="1000" value="0" aria-label="Seek" />
        </div>
        <span class="m3d-player-time" data-time="duration">0:00</span>
        <button class="m3d-player-btn m3d-player-mute" aria-label="Mute">
          <span class="material-symbols-rounded" data-icon="vol">volume_up</span>
        </button>
        <button class="m3d-player-btn m3d-player-fs" aria-label="Fullscreen">
          <span class="material-symbols-rounded">fullscreen</span>
        </button>
      </div>
    </div>`;
}

function fmtTime(s) {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60).toString().padStart(2, '0');
  return `${m}:${r}`;
}

function wirePlayer(root) {
  if (!root) return;
  const video = root.querySelector('.m3d-player-video');
  const overlay = root.querySelector('.m3d-player-overlay');
  const playBtn = root.querySelector('.m3d-player-play');
  const playIcon = playBtn.querySelector('[data-icon="play"]');
  const tCur = root.querySelector('[data-time="current"]');
  const tDur = root.querySelector('[data-time="duration"]');
  const scrubInput = root.querySelector('.m3d-player-scrub-input');
  const scrubFill = root.querySelector('.m3d-player-scrub-fill');
  const scrubBuf = root.querySelector('.m3d-player-scrub-buffer');
  const scrubThumb = root.querySelector('.m3d-player-scrub-thumb');
  const muteBtn = root.querySelector('.m3d-player-mute');
  const muteIcon = muteBtn.querySelector('[data-icon="vol"]');
  const fsBtn = root.querySelector('.m3d-player-fs');

  const setSym = (el, name) => setIcon(el, name);

  function togglePlay() {
    if (video.paused) video.play();
    else video.pause();
  }

  function updateBuffer() {
    if (!video.duration || !video.buffered.length) return;
    const end = video.buffered.end(video.buffered.length - 1);
    scrubBuf.style.width = `${(end / video.duration) * 100}%`;
  }

  function updateProgress() {
    if (!video.duration) return;
    const pct = (video.currentTime / video.duration) * 100;
    scrubFill.style.width = `${pct}%`;
    scrubThumb.style.left = `${pct}%`;
    scrubInput.value = String(Math.round((video.currentTime / video.duration) * 1000));
    tCur.textContent = fmtTime(video.currentTime);
  }

  overlay.addEventListener('click', togglePlay);
  playBtn.addEventListener('click', togglePlay);
  video.addEventListener('click', togglePlay);

  video.addEventListener('play', () => {
    root.dataset.state = 'playing';
    setSym(playIcon, 'pause');
  });
  video.addEventListener('pause', () => {
    root.dataset.state = 'paused';
    setSym(playIcon, 'play_arrow');
  });
  video.addEventListener('loadedmetadata', () => {
    tDur.textContent = fmtTime(video.duration);
  });
  video.addEventListener('timeupdate', updateProgress);
  video.addEventListener('progress', updateBuffer);
  video.addEventListener('ended', () => {
    root.dataset.state = 'paused';
    setSym(playIcon, 'play_arrow');
  });

  scrubInput.addEventListener('input', () => {
    if (!video.duration) return;
    const t = (Number(scrubInput.value) / 1000) * video.duration;
    video.currentTime = t;
    updateProgress();
  });

  muteBtn.addEventListener('click', () => {
    video.muted = !video.muted;
    setSym(muteIcon, video.muted ? 'volume_off' : 'volume_up');
  });

  fsBtn.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
    else video.requestFullscreen?.();
  });

}

// === Lightbox ====================================================

function openLightbox(items, startIdx) {
  let idx = startIdx;
  const lb = document.getElementById('m3d-lightbox');
  const stage = document.getElementById('m3d-lightbox-stage');
  const caption = document.getElementById('m3d-lightbox-caption');

  function render() {
    const it = items[idx];
    if (it.isVideo) {
      stage.innerHTML = buildPlayerHTML(it);
      const player = stage.querySelector('.m3d-player');
      wirePlayer(player);
      player.querySelector('.m3d-player-video')?.play?.().catch(() => {});
    } else {
      stage.innerHTML = `<img src="${it.src}" alt="${it.name}" />`;
    }
    caption.textContent = `${it.name} — ${idx + 1} / ${items.length}`;
  }
  function close() {
    lb.classList.remove('is-open');
    stage.innerHTML = '';
    document.removeEventListener('keydown', onKey);
  }
  function onKey(e) {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight' && idx < items.length - 1) { idx++; render(); }
    else if (e.key === 'ArrowLeft' && idx > 0) { idx--; render(); }
  }

  lb.querySelector('.m3d-lightbox-close').onclick = close;
  lb.querySelector('.m3d-lightbox-prev').onclick = () => { if (idx > 0) { idx--; render(); } };
  lb.querySelector('.m3d-lightbox-next').onclick = () => { if (idx < items.length - 1) { idx++; render(); } };
  lb.onclick = (e) => { if (e.target === lb) close(); };
  document.addEventListener('keydown', onKey);

  render();
  lb.classList.add('is-open');
}

// === Snackbar ====================================================

let snackTimer = null;
function showSnackbar(text) {
  const sb = document.getElementById('m3d-snackbar');
  if (!sb) return;
  sb.textContent = text;
  sb.classList.add('is-open');
  clearTimeout(snackTimer);
  snackTimer = setTimeout(() => sb.classList.remove('is-open'), 2400);
}

// === Drawer (hamburger expansion) ================================

function toggleDrawer() {
  const shell = document.getElementById('m3-desktop');
  if (!shell) return;
  shell.classList.toggle('is-drawer-open');
}

// === Wiring ======================================================

function bindRail() {
  document.querySelector('#m3-desktop .m3d-rail-menu')
    ?.addEventListener('click', toggleDrawer);

  document.querySelectorAll('#m3-desktop .m3d-rail-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      document
        .querySelectorAll('#m3-desktop .m3d-rail-item')
        .forEach((b) => b.classList.toggle('is-active', b === btn));
      activeTab = btn.dataset.tab;
      activeProject = null;
      activeFile = null;
      renderList();
      renderDetail();
    });
  });
}

function bindSearch() {
  const input = document.getElementById('m3d-search-input');
  if (!input) return;
  input.addEventListener('input', () => {
    searchQuery = input.value.trim().toLowerCase();
    renderList();
  });
}

function bindFab() {
  const fab = document.getElementById('m3d-fab');
  if (!fab) return;
  fab.addEventListener('click', () => {
    showSnackbar(`${FAB_LABELS[activeTab]} — coming soon`);
  });
}

function init() {
  if (!document.getElementById('m3-desktop')) return;
  bindRail();
  bindSearch();
  bindFab();
  renderList();
  renderDetail();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
