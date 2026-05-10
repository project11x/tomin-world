// Material 3 home widgets: Time & Weather, Portfolio, Changelog.
//
// Templates live in tabs.js (rendered into [data-android-widgets]). This
// module mounts them: pulls live data from the iOS-side IIFEs (which run
// regardless of which screen is visible) and updates the M3 markup.
//
// Data sources:
//   - Time & Weather: mirrors text from #iww-* nodes (DOM mirror) + own clock.
//   - Portfolio:      window.ilaGetState() + listens to ilaVisit via patch.
//   - Changelog:      mirrors text from #sys-* nodes + reads commit comet pos.

(function () {
  function mount(panel) {
    if (!panel) return;
    const host = panel.querySelector('[data-android-widgets]');
    if (!host) return;
    mountWeather(host);
    mountPortfolio(host);
    mountChangelog(host);
  }

  // ---- Time & Weather ------------------------------------------------
  function mountWeather(host) {
    const card = host.querySelector('[data-widget="weather"]');
    if (!card) return;
    const timeEl = card.querySelector('[data-w-time]');
    const descEl = card.querySelector('[data-w-desc]');
    const tempEl = card.querySelector('[data-w-temp]');
    const iconEl = card.querySelector('[data-w-icon]');
    const windEl = card.querySelector('[data-w-wind]');
    const statusEl = card.querySelector('[data-w-status]');

    function tick() {
      const d = new Date();
      const hh = d.getHours().toString().padStart(2, '0');
      const mm = d.getMinutes().toString().padStart(2, '0');
      timeEl.textContent = `${hh}:${mm}`;
    }
    tick();
    setInterval(tick, 1000);

    function mirrorOnce() {
      const m = (id) => {
        const e = document.getElementById(id);
        return e ? e.textContent.trim() : '';
      };
      const desc = m('iww-desc'); if (desc && desc !== '–') descEl.textContent = desc;
      const temp = m('iww-temp'); if (temp && temp !== '–°C') tempEl.textContent = temp;
      const icon = m('iww-icon'); if (icon && icon !== '–') iconEl.textContent = icon;
      const wind = m('iww-wind'); if (wind) windEl.textContent = wind.replace(/^💨\s*/, '');
      const status = m('iww-status-tag'); if (status) statusEl.textContent = status;
    }
    mirrorOnce();

    // Observe the iOS weather card so values stay in sync as the IIFE refreshes.
    ['iww-desc', 'iww-temp', 'iww-icon', 'iww-wind', 'iww-status-tag'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const obs = new MutationObserver(mirrorOnce);
      obs.observe(el, { childList: true, characterData: true, subtree: true });
    });
  }

  // ---- Portfolio -----------------------------------------------------
  function mountPortfolio(host) {
    const card = host.querySelector('[data-widget="portfolio"]');
    if (!card) return;
    const badge = card.querySelector('[data-p-badge]');
    const titleEl = card.querySelector('[data-p-title]');
    const subEl = card.querySelector('[data-p-sub]');
    const nodes = Array.from(card.querySelectorAll('[data-p-node]'));
    const segs = Array.from(card.querySelectorAll('[data-p-seg]'));

    function paint() {
      if (typeof window.ilaGetState !== 'function') return;
      const s = window.ilaGetState();
      const order = s.displayOrder || s.SECTIONS;
      const labels = s.LABELS || {};
      const visited = s.visited || [];
      const current = s.current || order[0];

      badge.textContent = (labels[current] || current).toUpperCase();
      const nextSection = order.find(x => !visited.includes(x));
      titleEl.textContent = nextSection
        ? `Up next: ${labels[nextSection] || nextSection}`
        : `Alles erkundet`;
      subEl.textContent = `${visited.length} of ${order.length} explored`;

      nodes.forEach((n, i) => {
        const sec = order[i];
        const isVisited = visited.includes(sec);
        const isCurrent = sec === current;
        n.classList.toggle('is-filled', isVisited);
        n.classList.toggle('is-current', isCurrent);
      });
      segs.forEach((seg, i) => {
        const a = order[i], b = order[i + 1];
        const filled = visited.includes(a) && visited.includes(b);
        seg.classList.toggle('is-filled', filled);
      });
    }

    paint();
    // Patch ilaVisit so we re-paint when the iOS portfolio updates state.
    if (typeof window.ilaVisit === 'function' && !window._ilaVisitPatchedForMd) {
      const orig = window.ilaVisit;
      window.ilaVisit = function (section) {
        const r = orig.apply(this, arguments);
        try { paint(); } catch (e) { /* ignore */ }
        return r;
      };
      window._ilaVisitPatchedForMd = true;
    } else {
      // Polling fallback — cheap, only runs while panel is mounted.
      setInterval(paint, 1500);
    }
  }

  // ---- Changelog -----------------------------------------------------
  function mountChangelog(host) {
    const card = host.querySelector('[data-widget="changelog"]');
    if (!card) return;
    const headline = card.querySelector('[data-c-headline]');
    const message = card.querySelector('[data-c-message]');
    const hashEl = card.querySelector('[data-c-hash]');
    const timeEl = card.querySelector('[data-c-time]');
    const railFill = card.querySelector('[data-c-rail-fill]');

    function mirror() {
      const h = document.getElementById('sys-headline');
      const m = document.getElementById('sys-message');
      const ha = document.getElementById('sys-hash');
      const tm = document.getElementById('sys-time');
      const comet = document.getElementById('sys-comet-dot');
      if (h && h.textContent.trim()) headline.textContent = h.textContent.trim();
      if (m && m.textContent.trim()) message.textContent = m.textContent.trim();
      if (ha && ha.textContent.trim()) hashEl.textContent = ha.textContent.trim();
      if (tm && tm.textContent.trim()) timeEl.textContent = tm.textContent.trim();
      if (comet) {
        // Comet's left% → freshness fill on our M3 rail.
        const left = comet.style.left || '0%';
        railFill.style.width = left;
      }
    }
    mirror();
    ['sys-headline', 'sys-message', 'sys-hash', 'sys-time'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const obs = new MutationObserver(mirror);
      obs.observe(el, { childList: true, characterData: true, subtree: true });
    });
    const cometNode = document.getElementById('sys-comet-dot');
    if (cometNode) {
      const obs = new MutationObserver(mirror);
      obs.observe(cometNode, { attributes: true, attributeFilter: ['style'] });
    }
  }

  window.androidMountWidgets = mount;
})();
