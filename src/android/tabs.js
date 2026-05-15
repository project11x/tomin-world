// Material 3 bottom-nav tab switching + per-tab content rendering.
//
// Renders into [data-android-panel] divs that already exist in index.html.
// Reuses portfolioData (the same source the iOS apps consume) so the two
// surfaces stay in sync. Tap-to-play and tap-to-open delegate to the
// existing iosOpen* functions — those overlays sit at z-90, above the
// Android screen, so they work fine when Material is the active palette.

import { portfolioData } from '../../data.js';

(function () {
  const navItems = document.querySelectorAll('#android-screen [data-android-tab]');
  const panels = document.querySelectorAll('#android-screen [data-android-panel]');

  // Per-tab scroll memory — without this, switching tabs leaves the
  // shared #android-content scrolled to the previous tab's y-position.
  const scrollMemory = {};
  let lastTab = null;
  function setActiveTab(name) {
    const scroller = document.getElementById('android-content');
    if (scroller && lastTab) scrollMemory[lastTab] = scroller.scrollTop;
    navItems.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.androidTab === name);
    });
    panels.forEach(p => {
      p.style.display = p.dataset.androidPanel === name ? 'block' : 'none';
    });
    if (scroller) scroller.scrollTop = scrollMemory[name] || 0;
    lastTab = name;
    syncThemeColor();
    // Mirror tab visits into the shared portfolio tracker so the M3 widget
    // (and the iOS Smart Stack) update progress as the user navigates.
    const ilaName = name === 'magazines' ? 'magazin' : name;
    if (typeof window.ilaVisit === 'function' && ['home', 'edits', 'magazin', 'bts'].includes(ilaName)) {
      window.ilaVisit(ilaName);
    }
  }

  navItems.forEach(btn => {
    btn.addEventListener('click', () => setActiveTab(btn.dataset.androidTab));
  });

  // === Theme-color meta sync (status-bar tint on Chrome Android) =======
  let themeColorMeta = document.querySelector('meta[name="theme-color"]');
  if (!themeColorMeta) {
    themeColorMeta = document.createElement('meta');
    themeColorMeta.setAttribute('name', 'theme-color');
    document.head.appendChild(themeColorMeta);
  }
  function syncThemeColor() {
    if (!document.documentElement.classList.contains('theme-material')) return;
    const surface = getComputedStyle(document.documentElement)
      .getPropertyValue('--md-sys-color-surface').trim();
    if (surface) themeColorMeta.setAttribute('content', surface);
  }
  window.androidSyncThemeColor = syncThemeColor;

  // === Render: Home ===================================================
  function renderHome() {
    const panel = document.querySelector('[data-android-panel="home"]');
    if (!panel) return;
    panel.innerHTML = `
      <section class="md-stagger" style="background:var(--md-sys-color-primary-container); color:var(--md-sys-color-on-primary-container); border-radius:var(--md-sys-shape-corner-xl); padding:24px; margin-bottom:16px;">
        <p style="margin:0 0 6px; font-size:14px; font-weight:500; opacity:0.85;">Willkommen</p>
        <h2 style="margin:0 0 12px; font-size:28px; font-weight:500; line-height:1.15;">Shouli's Welt</h2>
        <p style="margin:0; font-size:14px; line-height:1.5;">Magazine, Edits und Behind-the-Scenes — alles an einem Ort.</p>
      </section>
      <div class="md-widgets" data-android-widgets>
        ${weatherWidgetHTML()}
        ${portfolioWidgetHTML()}
        ${changelogWidgetHTML()}
      </div>
    `;
    panel.querySelectorAll('[data-android-jump]').forEach(el => {
      el.addEventListener('click', () => setActiveTab(el.dataset.androidJump));
    });
    if (window.androidMountWidgets) window.androidMountWidgets(panel);
  }

  // === Widget templates (mounted by widgets.js) ======================
  function weatherWidgetHTML() {
    return `
      <article class="md-widget md-widget-weather" data-widget="weather">
        <div class="md-widget-head">
          <span class="md-widget-eyebrow" data-w-city>Berlin</span>
          <span class="md-widget-eyebrow md-widget-eyebrow-dim">Time &amp; Weather</span>
        </div>
        <div class="md-widget-weather-row">
          <div class="md-widget-weather-left">
            <p class="md-widget-time" data-w-time>--:--</p>
            <p class="md-widget-sub" data-w-desc>–</p>
          </div>
          <div class="md-widget-weather-right">
            <div class="md-widget-temp-row">
              <span class="md-widget-icon" data-w-icon>—</span>
              <span class="md-widget-temp" data-w-temp>—°C</span>
            </div>
            <p class="md-widget-meta" data-w-wind>– km/h</p>
            <p class="md-widget-meta md-widget-meta-status">
              <span data-w-status>—</span>
              <span class="md-widget-live-dot"></span>
            </p>
          </div>
        </div>
      </article>
    `;
  }

  function portfolioWidgetHTML() {
    return `
      <article class="md-widget md-widget-portfolio" data-widget="portfolio">
        <div class="md-widget-head">
          <span class="md-widget-badge" data-p-badge>HOME</span>
          <span class="md-widget-eyebrow md-widget-eyebrow-dim">Portfolio</span>
        </div>
        <p class="md-widget-title" data-p-title>Up next: Edits</p>
        <p class="md-widget-sub" data-p-sub>0 of 4 explored</p>
        <div class="md-widget-progress" data-p-progress>
          <span class="md-progress-node" data-p-node="0"></span>
          <span class="md-progress-seg" data-p-seg="0"><span class="md-progress-fill"></span></span>
          <span class="md-progress-node" data-p-node="1"></span>
          <span class="md-progress-seg" data-p-seg="1"><span class="md-progress-fill"></span></span>
          <span class="md-progress-node" data-p-node="2"></span>
          <span class="md-progress-seg" data-p-seg="2"><span class="md-progress-fill"></span></span>
          <span class="md-progress-node" data-p-node="3"></span>
        </div>
      </article>
    `;
  }

  function changelogWidgetHTML() {
    return `
      <article class="md-widget md-widget-changelog" data-widget="changelog">
        <div class="md-widget-head">
          <span class="md-widget-live-tag">
            <span class="md-widget-live-dot md-widget-live-dot-anim"></span>
            <span>LIVE</span>
          </span>
          <span class="md-widget-eyebrow md-widget-eyebrow-dim">Changelog</span>
        </div>
        <p class="md-widget-title" data-c-headline>Latest commit</p>
        <pre class="md-widget-code" data-c-message>Connecting…</pre>
        <div class="md-widget-rail" data-c-rail>
          <span class="md-widget-rail-fill" data-c-rail-fill></span>
        </div>
        <div class="md-widget-foot">
          <code class="md-widget-hash" data-c-hash>—</code>
          <span class="md-widget-meta" data-c-time>—</span>
        </div>
      </article>
    `;
  }

  // === Widget: Latest =================================================
  function collectLatest(limit = 4) {
    const out = [];
    Object.keys(portfolioData).forEach(folderKey => {
      if (folderKey.includes('/')) return;
      if (folderKey.startsWith('TOMIN INDEX.TXT') || folderKey === 'icons') return;
      const items = portfolioData[folderKey];
      if (!Array.isArray(items)) return;
      items.forEach((item, idx) => {
        if (!item.date) return;
        const t = Date.parse(item.date);
        if (Number.isNaN(t)) return;

        if (item.isMagazine) {
          const pages = portfolioData[folderKey + '/' + item.name] || [];
          const cover = pages[0] ? pages[0].src : null;
          out.push({ kind: 'magazine', folder: folderKey, name: item.name, indexInFolder: idx, src: cover, t });
          return;
        }
        if (item.isVideo) {
          const nameNoExt = item.name.replace(/\.[^/.]+$/, '');
          const digits = (nameNoExt.match(/\d/g) || []).length;
          if (digits <= 3) {
            // curated edit
            out.push({ kind: 'edit', folder: folderKey, name: nameNoExt.replace(/_(web|compressed)$/i, '').trim(), src: item.src, t });
            return;
          }
        }
        // Otherwise treat as BTS
        const nameNoExt2 = item.name.replace(/\.[^/.]+$/, '');
        const digits2 = (nameNoExt2.match(/\d/g) || []).length;
        if (digits2 >= 4) {
          out.push({ kind: 'bts', folder: folderKey, name: item.name, src: item.src, isVideo: !!item.isVideo, t });
        }
      });
    });
    out.sort((a, b) => b.t - a.t);
    // Dedupe by src
    const seen = new Set();
    const uniq = [];
    for (const it of out) {
      if (seen.has(it.src)) continue;
      seen.add(it.src);
      uniq.push(it);
      if (uniq.length >= limit) break;
    }
    return uniq;
  }

  function latestKindLabel(kind) {
    return kind === 'edit' ? 'Edit' : kind === 'magazine' ? 'Magazin' : 'BTS';
  }
  function latestKindIcon(kind) {
    return kind === 'edit' ? 'bi-film' : kind === 'magazine' ? 'bi-book' : 'bi-camera-reels-fill';
  }

  function latestWidget() {
    const items = collectLatest(4);
    if (items.length === 0) {
      return `
        <button data-android-jump="edits" class="md-card-button"
          style="background:var(--md-sys-color-surface-container-high); color:var(--md-sys-color-on-surface); border:none; border-radius:var(--md-sys-shape-corner-xl); padding:20px; width:100%; text-align:left; cursor:pointer;">
          <p style="margin:0; font-size:14px; color:var(--md-sys-color-on-surface-variant);">Noch nichts hochgeladen.</p>
        </button>`;
    }
    const hero = items[0];
    const rest = items.slice(1, 4);
    return `
      <article class="md-latest-card">
        <header class="md-latest-head">
          <p class="md-latest-eyebrow">Aktuell</p>
          <h3 class="md-latest-title">Frisch reingekommen</h3>
        </header>

        <button class="md-latest-hero" data-latest-index="0" type="button">
          <div class="md-latest-hero-media">
            ${hero.src
              ? (hero.kind === 'edit' || (hero.kind === 'bts' && hero.isVideo))
                ? `<video src="${hero.src}#t=0.1" muted playsinline preload="metadata"></video>`
                : `<img src="${hero.src}" loading="lazy" />`
              : ''}
            <span class="md-latest-chip">
              <i class="bi ${latestKindIcon(hero.kind)}"></i>
              ${latestKindLabel(hero.kind)}
            </span>
          </div>
          <div class="md-latest-hero-meta">
            <p class="md-latest-name">${hero.name}</p>
            <p class="md-latest-folder">${hero.folder}</p>
          </div>
        </button>

        ${rest.length > 0 ? `
          <div class="md-latest-strip">
            ${rest.map((it, i) => `
              <button class="md-latest-tile" data-latest-index="${i + 1}" type="button">
                ${it.src
                  ? (it.kind === 'edit' || (it.kind === 'bts' && it.isVideo))
                    ? `<video src="${it.src}#t=0.1" muted playsinline preload="metadata"></video>`
                    : `<img src="${it.src}" loading="lazy" />`
                  : ''}
                <span class="md-latest-chip md-latest-chip-sm">
                  <i class="bi ${latestKindIcon(it.kind)}"></i>
                </span>
              </button>
            `).join('')}
          </div>
        ` : ''}
      </article>
    `;
  }

  function openLatest(item) {
    if (!item) return;
    if (item.kind === 'magazine') {
      if (window.androidOpenMagazinesReader) {
        window.androidOpenMagazinesReader({ folder: item.folder, index: item.indexInFolder, name: item.name });
      }
      return;
    }
    if (item.kind === 'edit') {
      const edits = collectEdits();
      const idx = edits.findIndex(e => e.folder === item.folder && e.name === item.name);
      if (window.androidOpenEditsViewer) window.androidOpenEditsViewer(idx >= 0 ? idx : 0);
      return;
    }
    if (item.kind === 'bts') {
      const files = (portfolioData[item.folder] || []).filter(f => {
        const noExt = f.name.replace(/\.[^/.]+$/, '');
        return (noExt.match(/\d/g) || []).length >= 4 && !f.isMagazine;
      });
      const idx = files.findIndex(f => f.name === item.name);
      if (window.androidOpenBtsViewer) window.androidOpenBtsViewer(item.folder, idx >= 0 ? idx : 0);
    }
  }

  function wireLatestWidget(panel) {
    const items = collectLatest(4);
    panel.querySelectorAll('[data-latest-index]').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = parseInt(btn.dataset.latestIndex, 10);
        openLatest(items[i]);
      });
    });
  }

  // === Render: Edits ==================================================
  function collectEdits() {
    const out = [];
    Object.keys(portfolioData).forEach(folderKey => {
      if (folderKey.startsWith('TOMIN INDEX.TXT') || folderKey === 'icons') return;
      const items = portfolioData[folderKey];
      if (!Array.isArray(items)) return;
      // Group videos by base name, prefer _web variant for thumbnail
      const videosByBase = {};
      items.forEach(item => {
        if (!item.isVideo) return;
        const nameNoExt = item.name.replace(/\.[^/.]+$/, '');
        const digitCount = (nameNoExt.match(/\d/g) || []).length;
        if (digitCount > 3) return;
        const baseName = nameNoExt.replace(/_(web|compressed)$/i, '').trim();
        if (!videosByBase[baseName]) videosByBase[baseName] = {};
        if (nameNoExt.endsWith('_web')) videosByBase[baseName].web = item;
        else if (nameNoExt.endsWith('_compressed')) videosByBase[baseName].compressed = item;
        else videosByBase[baseName].original = item;
      });
      Object.entries(videosByBase).forEach(([baseName, versions]) => {
        const v = versions.web || versions.compressed || versions.original;
        out.push({ folder: folderKey, name: baseName, src: v.src, date: v.date });
      });
    });
    return out;
  }
  function renderEdits() {
    const panel = document.querySelector('[data-android-panel="edits"]');
    if (!panel) return;
    const edits = collectEdits();
    panel.innerHTML = `
      <p style="margin:0 0 12px; font-size:14px; color:var(--md-sys-color-on-surface-variant);">${edits.length} Edit${edits.length === 1 ? '' : 's'}</p>
      <ul style="list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:4px;">
        ${edits.map((e, i) => `
          <li>
            <button data-edit-index="${i}" class="md-list-item"
              style="width:100%; display:flex; align-items:center; gap:14px; padding:10px 12px; border:none; border-radius:var(--md-sys-shape-corner-md); background:transparent; cursor:pointer; color:var(--md-sys-color-on-surface); text-align:left;">
              <div style="width:56px; height:56px; border-radius:var(--md-sys-shape-corner-sm); background:var(--md-sys-color-surface-container-highest); overflow:hidden; flex-shrink:0; display:flex; align-items:center; justify-content:center;">
                ${e.src
                  ? `<video src="${e.src}#t=0.1" muted playsinline preload="metadata" style="width:100%; height:100%; object-fit:cover; pointer-events:none;"></video>`
                  : `<i class="bi bi-film" style="font-size:22px; color:var(--md-sys-color-on-surface-variant);"></i>`}
              </div>
              <div style="flex:1; min-width:0;">
                <p style="margin:0 0 2px; font-size:15px; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${e.name}</p>
                <p style="margin:0; font-size:13px; color:var(--md-sys-color-on-surface-variant); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${e.folder}</p>
              </div>
              ${isItemRecent(e) ? `<span class="md-mag-neu" style="position:static;">NEU</span>` : ''}
              <i class="bi bi-play-fill" style="font-size:20px; color:var(--md-sys-color-primary);"></i>
            </button>
          </li>
        `).join('')}
      </ul>
    `;
    panel.querySelectorAll('[data-edit-index]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.editIndex, 10);
        if (window.androidOpenEditsViewer) window.androidOpenEditsViewer(idx);
      });
    });
  }

  // === Render: Magazines ==============================================
  function collectMagazines() {
    const out = [];
    Object.keys(portfolioData).forEach(key => {
      if (key.includes('/')) return;
      const items = portfolioData[key];
      if (!Array.isArray(items)) return;
      items.forEach((item, idx) => {
        if (!item.isMagazine) return;
        const magKey = key + '/' + item.name;
        const pages = portfolioData[magKey] || [];
        const cover = pages[0] ? pages[0].src : null;
        out.push({ folder: key, index: idx, name: item.name, cover });
      });
    });
    return out;
  }
  function isItemRecent(item) {
    if (!item || !item.date) return false;
    const t = Date.parse(item.date);
    if (Number.isNaN(t)) return false;
    return (Date.now() - t) < 1000 * 60 * 60 * 24 * 30; // 30 days
  }

  function renderMagazines() {
    const panel = document.querySelector('[data-android-panel="magazines"]');
    if (!panel) return;
    const mags = collectMagazines();
    if (mags.length === 0) {
      panel.innerHTML = `<p style="text-align:center; color:var(--md-sys-color-on-surface-variant); padding:60px 0;">Noch keine Magazine.</p>`;
      return;
    }
    // Folder list for filter chips
    const folders = Array.from(new Set(mags.map(m => m.folder)));
    panel.innerHTML = `
      <div class="md-chip-row">
        <button class="md-chip active" data-mag-filter="all">Alle</button>
        ${folders.map(f => `<button class="md-chip" data-mag-filter="${f.replace(/"/g, '&quot;')}">${f}</button>`).join('')}
      </div>
      <div class="md-mag-grid" id="md-mag-grid"></div>
    `;
    function paintGrid(filter) {
      const grid = panel.querySelector('#md-mag-grid');
      const list = filter === 'all' ? mags : mags.filter(m => m.folder === filter);
      grid.innerHTML = list.map((m, i) => {
        const items = portfolioData[m.folder] || [];
        const obj = items[m.index];
        const neuPill = isItemRecent(obj) ? `<span class="md-mag-neu">NEU</span>` : '';
        const issue = obj && obj.date ? new Date(obj.date).toLocaleDateString('de-DE', { month: 'short', year: 'numeric' }) : m.folder;
        const cleanName = (m.name || '').replace(/\.[^/.]+$/, '');
        return `
          <button class="md-mag-card" data-mag-index="${mags.indexOf(m)}">
            ${neuPill}
            <div class="md-mag-cover">
              ${m.cover ? `<img src="${m.cover}" loading="lazy" />` : ''}
            </div>
            <div class="md-mag-meta">
              <p class="md-mag-name">${cleanName}</p>
              <p class="md-mag-issue">${issue}</p>
            </div>
          </button>
        `;
      }).join('');
      grid.querySelectorAll('.md-mag-card').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.magIndex, 10);
          if (window.androidOpenMagazinesReader) window.androidOpenMagazinesReader(mags[idx]);
        });
      });
    }
    panel.querySelectorAll('[data-mag-filter]').forEach(chip => {
      chip.addEventListener('click', () => {
        panel.querySelectorAll('[data-mag-filter]').forEach(c => c.classList.toggle('active', c === chip));
        paintGrid(chip.dataset.magFilter);
      });
    });
    paintGrid('all');
  }

  // === Render: BTS ====================================================
  function collectBtsFolders() {
    const folders = [];
    Object.keys(portfolioData).forEach(key => {
      if (key.includes('/')) return;
      if (key.startsWith('TOMIN INDEX.TXT') || key === 'icons') return;
      const items = portfolioData[key];
      if (!Array.isArray(items)) return;
      const btsFiles = items.filter(item => {
        const nameNoExt = item.name.replace(/\.[^/.]+$/, '');
        const digitCount = (nameNoExt.match(/\d/g) || []).length;
        return digitCount >= 4 && !item.isMagazine;
      });
      if (btsFiles.length > 0) {
        const cover = btsFiles.find(f => !f.isVideo) || btsFiles[0];
        folders.push({ name: key, count: btsFiles.length, cover });
      }
    });
    return folders;
  }

  function collectBtsFiles(folderName) {
    const items = portfolioData[folderName] || [];
    return items.filter(item => {
      const nameNoExt = item.name.replace(/\.[^/.]+$/, '');
      const digitCount = (nameNoExt.match(/\d/g) || []).length;
      return digitCount >= 4 && !item.isMagazine;
    });
  }

  function renderBts() {
    const panel = document.querySelector('[data-android-panel="bts"]');
    if (!panel) return;
    const folders = collectBtsFolders();
    if (folders.length === 0) {
      panel.innerHTML = `<p style="text-align:center; color:var(--md-sys-color-on-surface-variant); padding:60px 0;">Keine BTS-Ordner.</p>`;
      return;
    }
    panel.innerHTML = `
      <div data-bts-view="folders">
        <p style="margin:0 0 12px; font-size:14px; color:var(--md-sys-color-on-surface-variant);">${folders.length} Ordner</p>
        <ul style="list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:4px;">
          ${folders.map(f => `
            <li>
              <button class="md-bts-folder-row" data-bts-folder="${f.name.replace(/"/g, '&quot;')}">
                <div class="md-bts-folder-thumb">
                  ${f.cover && f.cover.src && !f.cover.isVideo
                    ? `<img src="${f.cover.src}" loading="lazy" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;" />`
                    : `<i class="bi bi-camera-reels-fill"></i>`}
                </div>
                <div style="flex:1; min-width:0;">
                  <p style="margin:0 0 2px; font-size:15px; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${f.name}</p>
                  <p style="margin:0; font-size:13px; color:var(--md-sys-color-on-surface-variant);">${f.count} Item${f.count === 1 ? '' : 's'}</p>
                </div>
                <i class="bi bi-chevron-right" style="font-size:14px; color:var(--md-sys-color-on-surface-variant);"></i>
              </button>
            </li>
          `).join('')}
        </ul>
      </div>
      <div data-bts-view="files" style="display:none;">
        <div style="display:flex; align-items:center; gap:8px; margin:0 0 12px;">
          <button data-bts-back class="md-icon-button md-list-item" aria-label="Back"
            style="border:none; background:transparent; padding:6px; cursor:pointer; color:var(--md-sys-color-on-surface);">
            <i class="bi bi-arrow-left" style="font-size:20px;"></i>
          </button>
          <h2 data-bts-folder-title style="margin:0; font-size:18px; font-weight:500; color:var(--md-sys-color-on-surface); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"></h2>
        </div>
        <div class="md-bts-grid" data-bts-grid></div>
      </div>
    `;

    const foldersView = panel.querySelector('[data-bts-view="folders"]');
    const filesView = panel.querySelector('[data-bts-view="files"]');
    const titleEl = panel.querySelector('[data-bts-folder-title]');
    const gridEl = panel.querySelector('[data-bts-grid]');

    panel.querySelectorAll('[data-bts-folder]').forEach(btn => {
      btn.addEventListener('click', () => {
        const folder = btn.dataset.btsFolder;
        const files = collectBtsFiles(folder);
        titleEl.textContent = folder;
        gridEl.innerHTML = files.map((f, i) => `
          <div class="md-bts-tile" data-bts-file-index="${i}">
            ${f.isVideo
              ? `<video src="${f.src}#t=0.1" muted playsinline preload="metadata"></video><span class="md-bts-play"><i class="bi bi-play-fill"></i></span>`
              : `<img src="${f.src}" loading="lazy" />`}
          </div>
        `).join('');
        gridEl.querySelectorAll('[data-bts-file-index]').forEach(tile => {
          tile.addEventListener('click', () => {
            const idx = parseInt(tile.dataset.btsFileIndex, 10);
            if (window.androidOpenBtsViewer) window.androidOpenBtsViewer(folder, idx);
          });
        });
        foldersView.style.display = 'none';
        filesView.style.display = 'block';
      });
    });

    panel.querySelector('[data-bts-back]').addEventListener('click', () => {
      filesView.style.display = 'none';
      foldersView.style.display = 'block';
    });
  }

  // === Render: Contact ================================================
  function renderContact() {
    const panel = document.querySelector('[data-android-panel="contact"]');
    if (!panel) return;
    const seed = (() => { try { return localStorage.getItem('material-seed') || 'burgundy'; } catch (e) { return 'burgundy'; } })();
    const isDark = document.documentElement.classList.contains('dark');
    panel.innerHTML = `
      <!-- Hero card: fixed aspect, photo cover-fills the element with face-
           biased crop so the dark bar background up top stays out of frame. -->
      <section class="md-stagger md-hero" style="position:relative; aspect-ratio:1/1.05; border-radius:var(--md-sys-shape-corner-xl); overflow:hidden; margin-bottom:16px;">
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

      <!-- Quick action row: 4 filled-tonal buttons, M3 spec -->
      <section class="md-stagger" style="display:grid; grid-template-columns:repeat(4, 1fr); gap:8px; margin-bottom:16px;">
        ${actionBtn('https://instagram.com/edpz', 'instagram', 'IG')}
        ${actionBtn('mailto:eddie@shouli.de', 'envelope-fill', 'Mail')}
        ${actionBtn('#', 'bookmark-fill', 'Save', 'data-action="save"')}
        ${actionBtn('#', 'share-fill', 'Share', 'data-action="share"')}
      </section>

      <!-- About card — filled card with M3 typography -->
      <section class="md-stagger md-card-button" style="background:var(--md-sys-color-surface-container); border-radius:var(--md-sys-shape-corner-lg); padding:18px 20px; margin-bottom:16px; cursor:default;">
        <p style="margin:0 0 8px; font-size:11px; font-weight:600; letter-spacing:1px; text-transform:uppercase; color:var(--md-sys-color-primary);">About</p>
        <p style="margin:0; font-size:15px; line-height:1.55; color:var(--md-sys-color-on-surface); font-family:'Roboto', system-ui, sans-serif;">Eddie shoots, edits, and prints. Magazine work, music videos, and a steady stream of behind-the-scenes — built up over late nights in Berlin.</p>
      </section>

      <!-- Notifications card -->
      <section class="md-stagger" style="background:var(--md-sys-color-surface-container); border-radius:var(--md-sys-shape-corner-lg); padding:18px 20px; margin-bottom:16px;">
        <p style="margin:0 0 12px; font-size:11px; font-weight:600; letter-spacing:1px; text-transform:uppercase; color:var(--md-sys-color-primary);">Benachrichtigungen</p>
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
          <p style="margin:0; color:var(--md-sys-color-on-surface); font-size:14px; font-weight:500;">Updates direkt aufs Handy.</p>
          <button id="android-push-toggle" role="switch" aria-checked="false"
            class="m3d-push-toggle" data-android-push>
            <span id="android-push-knob" class="m3d-push-knob"></span>
          </button>
        </div>
        <p id="android-push-hint" style="margin:8px 0 0; color:var(--md-sys-color-on-surface-variant); font-size:13px; line-height:1.45;">Updates direkt auf dieses Gerät.</p>
      </section>

      <!-- Settings card -->
      <section class="md-stagger" style="background:var(--md-sys-color-surface-container); border-radius:var(--md-sys-shape-corner-lg); padding:18px 20px; margin-bottom:8px;">
        <p style="margin:0 0 14px; font-size:11px; font-weight:600; letter-spacing:1px; text-transform:uppercase; color:var(--md-sys-color-primary);">Theme</p>

        <p style="margin:0 0 8px; color:var(--md-sys-color-on-surface); font-size:14px; font-weight:500;">Palette</p>
        <div data-md-palette-toggle style="display:flex; gap:0; padding:4px; background:var(--md-sys-color-surface-container-high); border-radius:var(--md-sys-shape-corner-full); margin-bottom:18px;">
          ${paletteBtn('default', 'Aero')}
          ${paletteBtn('material', 'Material')}
        </div>

        <p style="margin:0 0 8px; color:var(--md-sys-color-on-surface); font-size:14px; font-weight:500;">Helligkeit</p>
        <div data-md-mode-toggle style="display:flex; gap:0; padding:4px; background:var(--md-sys-color-surface-container-high); border-radius:var(--md-sys-shape-corner-full); margin-bottom:18px;">
          ${modeBtn('light', 'Light', !isDark)}
          ${modeBtn('dark', 'Dark', isDark)}
        </div>

        <p style="margin:0 0 12px; color:var(--md-sys-color-on-surface); font-size:14px; font-weight:500;">Seed-Farbe</p>
        <div data-md-seed-toggle style="display:flex; gap:12px; flex-wrap:wrap; align-items:center;">
          ${seedSwatch('burgundy', '#984061', seed)}
          ${seedSwatch('green', '#2E7D32', seed)}
          ${seedSwatch('blue', '#0061A4', seed)}
          ${seedSwatch('coral', '#E55934', seed)}
          ${seedSwatch('slate', '#5C6470', seed)}
        </div>
      </section>
    `;

    // Palette buttons
    panel.querySelectorAll('[data-md-palette-toggle] [data-palette]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (window.setTheme) window.setTheme(btn.dataset.palette);
        renderContact();
      });
    });
    // Light/Dark
    panel.querySelectorAll('[data-md-mode-toggle] [data-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (window.setIosTheme) window.setIosTheme(btn.dataset.mode);
        document.documentElement.classList.toggle('dark', btn.dataset.mode === 'dark');
        syncThemeColor();
        renderContact();
      });
    });
    // Seed
    panel.querySelectorAll('[data-md-seed-toggle] [data-seed]').forEach(btn => {
      btn.addEventListener('click', () => {
        const s = btn.dataset.seed;
        try { localStorage.setItem('material-seed', s); } catch (e) { /* ignore */ }
        document.documentElement.setAttribute('data-seed', s);
        // wipe inline custom-seed vars so prebaked palette wins
        document.documentElement.style.cssText = document.documentElement.style.cssText.replace(/--md-ref-[a-z-]+:[^;]+;?/g, '');
        syncThemeColor();
        renderContact();
      });
    });
    // Recent-edit thumb jumps
    panel.querySelectorAll('[data-edit-jump]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.editJump, 10);
        if (window.androidOpenEditsViewer) window.androidOpenEditsViewer(idx);
      });
    });
    // Cross-tab jump links (to Edits etc.)
    panel.querySelectorAll('[data-android-jump]').forEach(el => {
      el.addEventListener('click', () => setActiveTab(el.dataset.androidJump));
    });
    // Push toggle
    const pushBtn = panel.querySelector('#android-push-toggle');
    if (pushBtn) {
      pushBtn.addEventListener('click', () => {
        if (typeof window.togglePushSubscription === 'function') window.togglePushSubscription();
      });
      // Reflect current state once the DOM is mounted.
      setTimeout(() => {
        if (typeof window.refreshPushToggleUI === 'function') window.refreshPushToggleUI();
      }, 0);
    }
    // Action buttons (Save / Share)
    const saveBtn = panel.querySelector('[data-action="save"]');
    if (saveBtn) saveBtn.addEventListener('click', (e) => {
      e.preventDefault();
      // Generate a vCard so the user can save the contact natively
      const vcard = [
        'BEGIN:VCARD', 'VERSION:3.0',
        'FN:Eddie',
        'TEL;TYPE=CELL:',
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
    const shareBtn = panel.querySelector('[data-action="share"]');
    if (shareBtn) shareBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        if (navigator.share) await navigator.share({ title: 'Shouli', url: location.origin });
      } catch (err) { /* cancelled */ }
    });
  }

  function paletteBtn(value, label) {
    const active = (() => { try { return (localStorage.getItem('palette') || 'default') === value; } catch (e) { return value === 'default'; } })();
    return `
      <button data-palette="${value}"
        style="flex:1; border:none; cursor:pointer; padding:8px 0; border-radius:var(--md-sys-shape-corner-full); font-family:inherit; font-size:14px; font-weight:500; transition:background var(--md-sys-motion-duration-medium2) var(--md-sys-motion-easing-emphasized), color var(--md-sys-motion-duration-medium2) var(--md-sys-motion-easing-emphasized); ${active ? 'background:var(--md-sys-color-secondary-container); color:var(--md-sys-color-on-secondary-container);' : 'background:transparent; color:var(--md-sys-color-on-surface-variant);'}">
        ${label}
      </button>
    `;
  }

  function modeBtn(value, label, active) {
    return `
      <button data-mode="${value}"
        style="flex:1; border:none; cursor:pointer; padding:8px 0; border-radius:var(--md-sys-shape-corner-full); font-family:inherit; font-size:14px; font-weight:500; ${active ? 'background:var(--md-sys-color-secondary-container); color:var(--md-sys-color-on-secondary-container);' : 'background:transparent; color:var(--md-sys-color-on-surface-variant);'}">
        ${label}
      </button>
    `;
  }

  function seedSwatch(name, color, current) {
    const isActive = current === name;
    return `
      <button data-seed="${name}"
        style="width:36px; height:36px; border-radius:50%; cursor:pointer; background:${color}; border:2px solid ${isActive ? 'var(--md-sys-color-primary)' : 'transparent'}; -webkit-tap-highlight-color:transparent;"
        aria-label="${name}"></button>
    `;
  }
  function actionBtn(href, icon, label, extra = '') {
    return `
      <a class="md-action-btn md-card-button" href="${href}" ${extra}>
        <i class="bi bi-${icon}"></i>
        <span>${label}</span>
      </a>
    `;
  }

  function listItem(href, icon, value, label) {
    return `
      <li>
        <a href="${href}" target="_blank" rel="noopener"
          style="display:flex; align-items:center; gap:18px; padding:14px 16px; color:var(--md-sys-color-on-surface); text-decoration:none;">
          <i class="bi bi-${icon}" style="font-size:22px; color:var(--md-sys-color-primary); width:28px; text-align:center;"></i>
          <div style="flex:1; min-width:0;">
            <p style="margin:0; font-size:12px; color:var(--md-sys-color-on-surface-variant);">${label}</p>
            <p style="margin:2px 0 0; font-size:15px; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${value}</p>
          </div>
          <i class="bi bi-box-arrow-up-right" style="font-size:16px; color:var(--md-sys-color-on-surface-variant);"></i>
        </a>
      </li>
    `;
  }

  function renderAll() {
    renderHome();
    renderEdits();
    renderMagazines();
    renderBts();
    renderContact();
  }

  // Initial render — and re-render on palette/seed change so colours track
  renderAll();
  syncThemeColor();
  window.androidRenderAll = renderAll;

  // Smooth reveal: jump to Home and re-trigger the stagger animation.
  // The .md-screen-revealing class is removed after the longest animation +
  // delay window so subsequent paints don't loop.
  let revealTimer = null;
  window.androidPlayEnter = () => {
    const screen = document.getElementById('android-screen');
    if (!screen) return;
    setActiveTab('home');
    screen.classList.remove('md-screen-revealing');
    // Force reflow so the animation re-runs
    void screen.offsetWidth;
    screen.classList.add('md-screen-revealing');
    if (revealTimer) clearTimeout(revealTimer);
    // Longest delay 360ms + duration ~500ms → clear at ~900ms
    revealTimer = setTimeout(() => screen.classList.remove('md-screen-revealing'), 900);
  };

  // === Top App Bar scroll-collapse =====================================
  const content = document.getElementById('android-content');
  const topBar = document.querySelector('#android-screen .md-top-app-bar');
  if (content && topBar) {
    content.addEventListener('scroll', () => {
      topBar.classList.toggle('collapsed', content.scrollTop > 4);
    }, { passive: true });
  }
})();
