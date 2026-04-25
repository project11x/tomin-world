    // ═════════════════════════════════════════════════════════════════════
    // Changelog widget — live feed of the repo's recent commits
    // ─────────────────────────────────────────────────────────────────────
    // Primary data source: GitHub REST API (repo is public, 60 req/hr per IP
    // unauthenticated — we use at most 1 on load + 1 every 5 min). The baked
    // <script id="sys-commits-data"> JSON block is a zero-latency fallback
    // for the first paint and for offline / rate-limited visitors.
    //
    // Timestamps re-render every 30 s so "2m ago" rolls forward and the
    // comet drifts leftward as the commit ages — feels alive even between
    // fetches. Text swaps use the blur→sharp animation from the Explore
    // widget, so any refreshed commit visibly pulses in.
    // ═════════════════════════════════════════════════════════════════════
    (function () {
      const headline = document.getElementById('sys-headline');
      const message = document.getElementById('sys-message');
      const hashEl = document.getElementById('sys-hash');
      const timeEl = document.getElementById('sys-time');
      const trail = document.getElementById('sys-comet-trail');
      const cometDot = document.getElementById('sys-comet-dot');
      const scanBox = document.getElementById('sys-scan-bounds');
      const dataEl = document.getElementById('sys-commits-data');
      if (!headline || !message || !hashEl || !timeEl) return;

      const REPO = 'project11x/tomin-world';
      // Fetch more than the compact widget needs so the expanded list has
      // enough to fill the screen without re-fetching on open.
      const API = 'https://api.github.com/repos/' + REPO + '/commits?per_page=30';
      // Shared normalised commit shape: { sha, msg, date }.
      let commits = [];

      // Seed with baked data so the first paint is instant — no spinner, no
      // "Connecting to origin…" flash even on slow networks.
      try {
        if (dataEl) commits = JSON.parse(dataEl.textContent.trim()) || [];
      } catch (e) { commits = []; }
      let firstPaintDone = false;

      // Convert a Date into a short relative-time label.
      function fmtAgo(date) {
        const diff = Math.max(0, Date.now() - date.getTime());
        const m = Math.floor(diff / 60000);
        const h = Math.floor(diff / 3600000);
        const d = Math.floor(diff / 86400000);
        if (diff < 45000) return 'just now';
        if (m < 60) return m + 'm ago';
        if (h < 24) return h + 'h ago';
        if (d < 7) return d + 'd ago';
        return Math.floor(d / 7) + 'w ago';
      }

      // Map time-since-commit to a comet position on the rail: right = fresh,
      // left = stale. Log scale so a 2 min-old commit sits near the right edge
      // and a week-old commit is near the left.
      function cometPct(date) {
        const diffMin = Math.max(0.5, (Date.now() - date.getTime()) / 60000);
        const WEEK_MIN = 10080;
        const v = 1 - Math.min(1, Math.log(diffMin + 1) / Math.log(WEEK_MIN + 1));
        return Math.max(5, Math.min(98, v * 100));   // keep comet on-rail
      }

      function setTextAnim(el, newText) {
        if (!el) return;
        if (el.textContent === newText) return;
        el.textContent = newText;
        if (!firstPaintDone) return;
        el.classList.remove('sys-blur-swap');
        void el.offsetWidth;
        el.classList.add('sys-blur-swap');
      }

      function render() {
        if (!commits.length) {
          setTextAnim(message, 'No recent updates');
          setTextAnim(hashEl, '—');
          setTextAnim(timeEl, '—');
          if (trail) trail.style.left = '50%';
          if (cometDot) cometDot.style.left = '50%';
          if (scanBox) scanBox.style.width = '50%';
          return;
        }
        const c = commits[0];
        const date = new Date(c.date);
        const sha = (c.sha || '').slice(0, 7);
        const subj = (c.msg || '').split('\n')[0];
        setTextAnim(message, subj);
        setTextAnim(hashEl, sha);
        setTextAnim(timeEl, fmtAgo(date));
        const pct = cometPct(date);
        if (trail) trail.style.left = pct + '%';
        if (cometDot) cometDot.style.left = pct + '%';
        // Bound the scanline to the comet position — the bright sweep fills
        // only the "active" section of the rail, right up to the green head.
        if (scanBox) scanBox.style.width = pct + '%';
      }

      // Fetch live commits from the GitHub API. Silent-fail on network error
      // or rate-limit — the baked data stays on screen in that case.
      async function fetchLive() {
        try {
          const r = await fetch(API, { headers: { Accept: 'application/vnd.github+json' } });
          if (!r.ok) return;
          const data = await r.json();
          if (!Array.isArray(data) || !data.length) return;
          commits = data.map(c => ({
            sha: c.sha,
            msg: (c.commit && c.commit.message) || '',
            date: (c.commit && c.commit.author && c.commit.author.date) || c.commit?.committer?.date
          }));
          render();
        } catch (e) { /* offline / blocked — silent */ }
      }

      // Initial paint uses baked data (instant). firstPaintDone flips after
      // so any subsequent change (from fetchLive or a time-tick rollover)
      // plays the blur-swap animation.
      render();
      firstPaintDone = true;

      // Now hit the live API — when it resolves, any text that changed will
      // blur-swap in.
      fetchLive();

      // Tick timestamps & comet every 30 s so time visibly passes.
      setInterval(render, 30000);
      // Re-poll the API every 5 min. 12 req/hr per IP fits the 60/hr limit
      // comfortably.
      setInterval(fetchLive, 5 * 60 * 1000);

      // ───────────────────────────────────────────────────────────────────
      // Expanded changelog — iOS-style "grow from widget" expansion.
      //
      // Open: position the expanded card at the widget's current bounding
      // rect, force a reflow, then transition to the inset-fullscreen
      // target layout. Uses the iOS spring easing.
      // Close: reverse — animate back to the widget's rect and hide.
      // Drag: pointer on the top grab zone; drag down → translate, release
      // past a threshold (or fast flick) closes the sheet.
      // ───────────────────────────────────────────────────────────────────
      const widget = document.getElementById('ios-system-pulse');
      const expanded = document.getElementById('ios-changelog-expanded');
      const expCard = document.getElementById('ios-changelog-card');
      const backdrop = document.getElementById('ios-changelog-backdrop');
      const contentEl = document.getElementById('ios-changelog-content');
      const listEl = document.getElementById('sys-commits-list');
      const grabEl = document.getElementById('ios-changelog-grab');
      // iOS widget expand easing — tuned to match Springboard's feel:
      // a slightly over-damped spring that settles without overshoot.
      const SPRING = 'cubic-bezier(0.32, 0.72, 0, 1)';
      const DUR = 0.48; // seconds — Apple widget expand is ~460–500ms
      const ANIM_PROPS = `top ${DUR}s ${SPRING}, left ${DUR}s ${SPRING}, ` +
        `width ${DUR}s ${SPRING}, height ${DUR}s ${SPRING}, ` +
        `border-radius ${DUR}s ${SPRING}, transform ${DUR}s ${SPRING}`;
      // Content transition — scale + fade move together, ease-out on entry,
      // slightly steeper ease-in on exit so it "pulls back" into the widget.
      const CONTENT_IN = 'opacity 0.32s cubic-bezier(0.2, 0.7, 0.2, 1), transform 0.42s cubic-bezier(0.2, 0.7, 0.2, 1)';
      const CONTENT_OUT = 'opacity 0.22s cubic-bezier(0.6, 0, 0.8, 0.2), transform 0.30s cubic-bezier(0.5, 0, 0.75, 0)';

      // Render the scrollable list of commits inside the expanded card.
      function renderList() {
        if (!listEl) return;
        if (!commits.length) {
          listEl.innerHTML = '<div style="color:rgba(255,255,255,0.5); font-size:13px; padding:20px 6px;">No commits yet.</div>';
          return;
        }
        listEl.innerHTML = commits.map(c => {
          const subj = (c.msg || '').split('\n')[0];
          const sha = (c.sha || '').slice(0, 7);
          const ago = fmtAgo(new Date(c.date));
          // Escape subject — commit messages are untrusted text.
          const esc = subj.replace(/[&<>"']/g, ch => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
          }[ch]));
          return (
            '<div style="padding:4px 2px;">' +
            '<div style="background:rgba(255,255,255,0.03); border:1px solid rgba(48,209,88,0.18); border-radius:9px; padding:10px 12px; color:rgba(212,245,225,0.92); font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12.5px; line-height:1.4; font-weight:500;">' +
            esc +
            '</div>' +
            '<div style="display:flex; justify-content:space-between; align-items:center; padding:7px 4px 0;">' +
            '<code style="color:#5ac8fa; font-size:11.5px; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-weight:700; letter-spacing:0.02em;">' + sha + '</code>' +
            '<span style="color:rgba(255,255,255,0.44); font-size:11.5px; font-weight:500;">' + ago + '</span>' +
            '</div>' +
            '</div>'
          );
        }).join('');
      }

      // Compute target rect for the expanded card: inset from the screen
      // edges, rounded both top and bottom (per the sketch).
      function getExpandedTarget() {
        const screen = document.getElementById('ios-screen');
        const sr = screen ? screen.getBoundingClientRect() : { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight };
        const sideInset = 14;
        const topInset = 32;  // leaves breathing room below the status bar
        const bottomInset = 28;
        return {
          top: sr.top + topInset,
          left: sr.left + sideInset,
          width: sr.width - sideInset * 2,
          height: sr.height - topInset - bottomInset,
          radius: 32,
        };
      }

      // Set the card's absolute frame instantly (no transition).
      function setCardFrame(rect, radius) {
        expCard.style.transition = 'none';
        expCard.style.top = rect.top + 'px';
        expCard.style.left = rect.left + 'px';
        expCard.style.width = rect.width + 'px';
        expCard.style.height = rect.height + 'px';
        expCard.style.borderRadius = (radius != null ? radius : 20) + 'px';
        expCard.style.transform = 'translateY(0)';
      }

      let isOpen = false;

      function openChangelog() {
        if (isOpen) return;
        isOpen = true;
        renderList();
        requestAnimationFrame(updateScrollFade);
        const r = widget.getBoundingClientRect();
        expanded.style.display = 'block';
        // Content starts collapsed toward the widget — small scale + offset so it
        // feels like it's emerging from the card rather than popping on top.
        if (contentEl) {
          contentEl.style.transition = 'none';
          contentEl.style.opacity = '0';
          contentEl.style.transform = 'scale(0.94) translateY(6px)';
          contentEl.style.transformOrigin = '50% 20%';
        }
        setCardFrame({ top: r.top, left: r.left, width: r.width, height: r.height }, 20);
        void expCard.offsetWidth;
        // Card expands; content fades/scales in with overlapping timing so
        // the two motions feel like one continuous morph.
        requestAnimationFrame(() => {
          const t = getExpandedTarget();
          expCard.style.transition = ANIM_PROPS;
          expCard.style.top = t.top + 'px';
          expCard.style.left = t.left + 'px';
          expCard.style.width = t.width + 'px';
          expCard.style.height = t.height + 'px';
          expCard.style.borderRadius = t.radius + 'px';
          // Start content reveal at ~35% through the card animation — the
          // card is already clearly growing, content catches up on the way.
          setTimeout(() => {
            if (!isOpen) return;
            if (contentEl) {
              contentEl.style.transition = CONTENT_IN;
              contentEl.style.opacity = '1';
              contentEl.style.transform = 'scale(1) translateY(0)';
            }
          }, Math.round(DUR * 1000 * 0.18));
        });
      }

      function closeChangelog() {
        if (!isOpen) return;
        isOpen = false;
        // Content retreats — scale + fade together, anchored near the top
        // so it visually collapses toward where the widget will settle.
        if (contentEl) {
          contentEl.style.transition = CONTENT_OUT;
          contentEl.style.opacity = '0';
          contentEl.style.transform = 'scale(0.92) translateY(-4px)';
          contentEl.style.transformOrigin = '50% 20%';
        }
        // Prime the widget's own children: hide them instantly so we can
        // fade them back in while the card is still shrinking. This gives
        // the close a cross-fade feel — user sees the widget text emerging
        // well before the card fully lands.
        const widgetKids = Array.from(widget.children);
        widgetKids.forEach(el => {
          el.style.transition = 'none';
          el.style.opacity = '0';
          el.style.transform = 'translateY(3px) scale(0.985)';
          // Force the hidden style to commit before we set the fade-in.
          void el.offsetWidth;
        });
        // Card begins shrinking almost immediately, and simultaneously
        // fades its own opacity — revealing the widget beneath.
        requestAnimationFrame(() => {
          if (isOpen) return;
          const r = widget.getBoundingClientRect();
          expCard.style.transition = ANIM_PROPS + `, opacity ${DUR * 0.65}s cubic-bezier(0.4, 0, 0.7, 0.2) ${DUR * 0.3}s`;
          expCard.style.top = r.top + 'px';
          expCard.style.left = r.left + 'px';
          expCard.style.width = r.width + 'px';
          expCard.style.height = r.height + 'px';
          expCard.style.borderRadius = '20px';
          expCard.style.transform = 'translateY(0)';
          expCard.style.opacity = '0';
        });
        // At ~30% of the shrink, start the widget's own reveal. The user
        // sees widget text fading up *through* the dissolving card.
        setTimeout(() => {
          if (isOpen) return;
          widgetKids.forEach(el => {
            el.style.transition = 'opacity 0.42s cubic-bezier(0.2, 0.7, 0.2, 1), transform 0.5s cubic-bezier(0.2, 0.7, 0.2, 1)';
            el.style.opacity = '1';
            el.style.transform = 'translateY(0) scale(1)';
          });
        }, Math.round(DUR * 1000 * 0.3));
        // Hide overlay + clean up widget inline styles once everything settles.
        setTimeout(() => {
          if (isOpen) return;
          expanded.style.display = 'none';
          expCard.style.opacity = '1';
          widgetKids.forEach(el => {
            el.style.transition = '';
            el.style.opacity = '';
            el.style.transform = '';
          });
        }, Math.round(DUR * 1000) + 80);
      }

      window.iosChangelogOpen = (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        openChangelog();
      };
      window.iosChangelogClose = closeChangelog;

      // ─── Drag-to-close from outside the scrollable list ───────────────
      // iOS-style sheet: a downward drag on the header/grab bar dismisses
      // the sheet. Inside the commit list we always defer to native
      // scrolling so the user can browse older commits without the sheet
      // collapsing on them.
      if (expCard) {
        let dragging = false;
        let startY = 0;
        let startT = 0;
        let moved = 0;
        let pendingPointerId = null;

        expCard.addEventListener('pointerdown', (e) => {
          if (!isOpen) return;
          if (e.pointerType === 'mouse' && e.button !== 0) return;
          // Inside the list → always scroll, never drag-to-close.
          if (listEl && listEl.contains(e.target)) return;
          pendingPointerId = e.pointerId;
          startY = e.clientY;
          startT = Date.now();
          moved = 0;
          dragging = false; // activate only once movement crosses threshold
        });
        expCard.addEventListener('pointermove', (e) => {
          if (pendingPointerId !== e.pointerId) return;
          const dy = e.clientY - startY;
          if (!dragging) {
            // Threshold: wait for a clear downward intent so normal taps /
            // vertical scroll nudges inside the list still work.
            if (dy > 6) {
              dragging = true;
              try { expCard.setPointerCapture(e.pointerId); } catch (_) { }
              expCard.style.transition = 'none';
            } else if (dy < -6) {
              // Upward motion — abandon drag intent; let scroll take over.
              pendingPointerId = null;
              return;
            } else {
              return;
            }
          }
          moved = dy;
          const y = dy > 0 ? dy : dy * 0.2;
          expCard.style.transform = 'translateY(' + y + 'px)';
          // Fade content out as the card is pulled down
          if (contentEl) {
            const fade = Math.max(0, 1 - Math.max(0, dy) / 200);
            contentEl.style.transition = 'none';
            contentEl.style.opacity = String(fade);
          }
        });
        const endDrag = (e) => {
          if (pendingPointerId !== e.pointerId) return;
          pendingPointerId = null;
          if (!dragging) return;
          dragging = false;
          try { expCard.releasePointerCapture(e.pointerId); } catch (_) { }
          const dt = Date.now() - startT;
          const velocity = moved / Math.max(1, dt);
          if (moved > 110 || (velocity > 0.6 && moved > 30)) {
            closeChangelog();
          } else {
            expCard.style.transition = 'transform 0.35s ' + SPRING;
            expCard.style.transform = 'translateY(0)';
            if (contentEl) { contentEl.style.transition = 'opacity 0.2s ease'; contentEl.style.opacity = '1'; }
          }
        };
        expCard.addEventListener('pointerup', endDrag);
        expCard.addEventListener('pointercancel', endDrag);
      }

      // Dynamic scroll-fade: top edge appears when scrolled, bottom fades when more content below.
      function updateScrollFade() {
        if (!listEl) return;
        const atTop = listEl.scrollTop < 8;
        const atBottom = listEl.scrollTop + listEl.clientHeight >= listEl.scrollHeight - 8;
        const top = atTop ? 'black' : 'transparent';
        const bottom = atBottom ? 'black' : 'transparent';
        const topStop = atTop ? '0%' : '12%';
        const bottomStop = atBottom ? '100%' : '88%';
        const mask = `linear-gradient(to bottom, ${top} 0%, black ${topStop}, black ${bottomStop}, ${bottom} 100%)`;
        listEl.style.maskImage = mask;
        listEl.style.webkitMaskImage = mask;
      }
      if (listEl) listEl.addEventListener('scroll', updateScrollFade, { passive: true });

      // Keep the expanded list fresh: re-render "Xm ago" labels and any
      // new commits the fetch picked up, every 30 s while open.
      setInterval(() => { if (isOpen) renderList(); }, 30000);
      // Initial pass so openChangelog has data immediately.
      renderList();
    })();

    // ═════════════════════════════════════════════════════════════════════
    // Portfolio Guide — iOS-style expand/collapse, same animation as Changelog.
    // ═════════════════════════════════════════════════════════════════════
    (function () {
      const widget = document.getElementById('ios-live-activity');
      const expanded = document.getElementById('ios-portfolio-expanded');
      const expCard = document.getElementById('ios-portfolio-card');
      const contentEl = document.getElementById('ios-portfolio-content');
      const grabEl = document.getElementById('ios-portfolio-grab');
      const badgeEl = document.getElementById('ios-portfolio-badge');
      const srcBadge = document.getElementById('ila-badge');
      if (!widget || !expanded || !expCard) return;

      const SPRING = 'cubic-bezier(0.32, 0.72, 0, 1)';
      const DUR = 0.48;
      const ANIM_PROPS = `top ${DUR}s ${SPRING}, left ${DUR}s ${SPRING}, ` +
        `width ${DUR}s ${SPRING}, height ${DUR}s ${SPRING}, ` +
        `border-radius ${DUR}s ${SPRING}, transform ${DUR}s ${SPRING}`;
      const CONTENT_IN = 'opacity 0.32s cubic-bezier(0.2,0.7,0.2,1), transform 0.42s cubic-bezier(0.2,0.7,0.2,1)';
      const CONTENT_OUT = 'opacity 0.22s cubic-bezier(0.6,0,0.8,0.2), transform 0.30s cubic-bezier(0.5,0,0.75,0)';

      // Build a scaled-up version of the widget's progress timeline inside the
      // expanded card. Pulls live state from window.ilaGetState() so the dots
      // and segments reflect what the user has actually visited.
      function renderExpandedTimeline() {
        const host = document.getElementById('ios-portfolio-timeline');
        if (!host || typeof window.ilaGetState !== 'function') return;
        const s = window.ilaGetState();
        host.innerHTML = '';

        const SIZE_CUR = 22;   // current section dot
        const SIZE_VIS = 18;   // visited dot
        const SIZE_EMP = 16;   // unvisited hollow dot
        const SLOT_W = 24;   // container width so layout stays stable as dot size changes
        const SEG_H = 4;    // segment rail height
        const SEG_EMPTY_BG = 'rgba(255,255,255,0.08)';

        const row = document.createElement('div');
        row.style.cssText = 'display:flex; align-items:center; gap:3px; width:100%;';

        for (let i = 0; i < s.displayOrder.length; i++) {
          const section = s.displayOrder[i];
          const isCur = section === s.current;
          const isVis = s.visited.includes(section);
          const col = s.COLORS[section];

          const slot = document.createElement('div');
          slot.style.cssText = `position:relative; flex-shrink:0; width:${SLOT_W}px; height:${SLOT_W}px;
            display:flex; align-items:center; justify-content:center; z-index:2;`;

          const dot = document.createElement('div');
          dot.style.borderRadius = '50%';
          dot.style.transition = 'all 0.35s ease';
          if (isCur) {
            dot.style.width = dot.style.height = SIZE_CUR + 'px';
            dot.style.background = col;
            dot.style.boxShadow = `0 0 0 4px ${col}40, 0 0 14px ${col}60`;
          } else if (isVis) {
            dot.style.width = dot.style.height = SIZE_VIS + 'px';
            dot.style.background = col;
            dot.style.boxShadow = 'none';
          } else {
            dot.style.width = dot.style.height = SIZE_EMP + 'px';
            dot.style.background = 'transparent';
            dot.style.boxShadow = '0 0 0 2px rgba(255,255,255,0.22)';
          }
          slot.appendChild(dot);

          const label = document.createElement('span');
          label.textContent = s.LABELS[section];
          label.style.cssText =
            'position:absolute; top:32px; left:50%; transform:translateX(-50%); ' +
            'white-space:nowrap; font-size:10.5px; font-weight:700; letter-spacing:0.09em; ' +
            'text-transform:uppercase; color:rgba(255,255,255,' +
            (isCur ? '0.95' : isVis ? '0.7' : '0.38') + ');';
          slot.appendChild(label);
          row.appendChild(slot);

          // Segment between this slot and the next
          if (i < s.displayOrder.length - 1) {
            const seg = document.createElement('div');
            seg.style.cssText = `flex:1; position:relative; height:${SEG_H}px; border-radius:${SEG_H / 2}px;
              background:${SEG_EMPTY_BG}; overflow:hidden;`;
            if (s.filled[i]) {
              const fill = document.createElement('div');
              const nextCol = s.COLORS[s.displayOrder[i + 1]];
              fill.style.cssText = `position:absolute; inset:0; border-radius:inherit;
                background:linear-gradient(to right, ${col}, ${nextCol});`;
              seg.appendChild(fill);
            }
            row.appendChild(seg);
          }
        }

        host.appendChild(row);
      }

      function getExpandedTarget() {
        const screen = document.getElementById('ios-screen');
        const sr = screen ? screen.getBoundingClientRect() : { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight };
        return { top: sr.top + 32, left: sr.left + 14, width: sr.width - 28, height: sr.height - 60, radius: 32 };
      }

      function setCardFrame(rect, radius) {
        expCard.style.transition = 'none';
        expCard.style.top = rect.top + 'px';
        expCard.style.left = rect.left + 'px';
        expCard.style.width = rect.width + 'px';
        expCard.style.height = rect.height + 'px';
        expCard.style.borderRadius = (radius ?? 20) + 'px';
        expCard.style.transform = 'translateY(0)';
      }

      let isOpen = false;

      function openPortfolio() {
        if (isOpen) return;
        isOpen = true;
        // Sync badge from widget
        if (badgeEl && srcBadge) {
          badgeEl.textContent = srcBadge.textContent;
          badgeEl.style.background = srcBadge.style.background || '#e0e0e0';
          badgeEl.style.color = srcBadge.style.color || '#1a1a1a';
        }
        // Render a properly sized timeline for the expanded view — the widget
        // version is too tiny when scaled up, so we build a cleaner one here.
        renderExpandedTimeline();
        // Sync the explored count subtitle
        const srcSub = document.getElementById('ila-sub');
        const expSub = document.getElementById('ios-portfolio-sub');
        if (srcSub && expSub) expSub.textContent = srcSub.textContent;
        const r = widget.getBoundingClientRect();
        expanded.style.display = 'block';
        if (contentEl) {
          contentEl.style.transition = 'none';
          contentEl.style.opacity = '0';
          contentEl.style.transform = 'scale(0.94) translateY(6px)';
          contentEl.style.transformOrigin = '50% 20%';
        }
        setCardFrame({ top: r.top, left: r.left, width: r.width, height: r.height }, 20);
        void expCard.offsetWidth;
        requestAnimationFrame(() => {
          const t = getExpandedTarget();
          expCard.style.transition = ANIM_PROPS;
          expCard.style.top = t.top + 'px';
          expCard.style.left = t.left + 'px';
          expCard.style.width = t.width + 'px';
          expCard.style.height = t.height + 'px';
          expCard.style.borderRadius = t.radius + 'px';
          setTimeout(() => {
            if (!isOpen) return;
            if (contentEl) {
              contentEl.style.transition = CONTENT_IN;
              contentEl.style.opacity = '1';
              contentEl.style.transform = 'scale(1) translateY(0)';
            }
          }, Math.round(DUR * 1000 * 0.18));
        });
      }

      function closePortfolio() {
        if (!isOpen) return;
        isOpen = false;
        if (window.ilaResumeAdvance) window.ilaResumeAdvance();
        if (contentEl) {
          contentEl.style.transition = CONTENT_OUT;
          contentEl.style.opacity = '0';
          contentEl.style.transform = 'scale(0.92) translateY(-4px)';
          contentEl.style.transformOrigin = '50% 20%';
        }
        const widgetKids = Array.from(widget.children);
        widgetKids.forEach(el => {
          el.style.transition = 'none';
          el.style.opacity = '0';
          el.style.transform = 'translateY(3px) scale(0.985)';
          void el.offsetWidth;
        });
        requestAnimationFrame(() => {
          if (isOpen) return;
          const r = widget.getBoundingClientRect();
          expCard.style.transition = ANIM_PROPS + `, opacity ${DUR * 0.65}s cubic-bezier(0.4,0,0.7,0.2) ${DUR * 0.3}s`;
          expCard.style.top = r.top + 'px';
          expCard.style.left = r.left + 'px';
          expCard.style.width = r.width + 'px';
          expCard.style.height = r.height + 'px';
          expCard.style.borderRadius = '20px';
          expCard.style.transform = 'translateY(0)';
          expCard.style.opacity = '0';
        });
        setTimeout(() => {
          if (isOpen) return;
          widgetKids.forEach(el => {
            el.style.transition = 'opacity 0.42s cubic-bezier(0.2,0.7,0.2,1), transform 0.5s cubic-bezier(0.2,0.7,0.2,1)';
            el.style.opacity = '1';
            el.style.transform = 'translateY(0) scale(1)';
          });
        }, Math.round(DUR * 1000 * 0.3));
        setTimeout(() => {
          if (isOpen) return;
          expanded.style.display = 'none';
          expCard.style.opacity = '1';
          widgetKids.forEach(el => { el.style.transition = ''; el.style.opacity = ''; el.style.transform = ''; });
        }, Math.round(DUR * 1000) + 80);
      }

      window.iosPortfolioOpen = (e) => { if (e) e.stopPropagation(); openPortfolio(); };
      window.iosPortfolioClose = closePortfolio;
      window.iosPortfolioIsOpen = () => isOpen;

      // Drag-to-close from anywhere on the card
      if (expCard) {
        let dragging = false, startY = 0, startT = 0, moved = 0, pendingId = null;
        expCard.addEventListener('pointerdown', (e) => {
          if (!isOpen || (e.pointerType === 'mouse' && e.button !== 0)) return;
          pendingId = e.pointerId; startY = e.clientY; startT = Date.now(); moved = 0; dragging = false;
        });
        expCard.addEventListener('pointermove', (e) => {
          if (pendingId !== e.pointerId) return;
          const dy = e.clientY - startY;
          if (!dragging) {
            if (dy > 6) { dragging = true; try { expCard.setPointerCapture(e.pointerId); } catch (_) { } expCard.style.transition = 'none'; }
            else if (dy < -6) { pendingId = null; return; }
            else return;
          }
          moved = dy;
          expCard.style.transform = 'translateY(' + (dy > 0 ? dy : dy * 0.2) + 'px)';
          if (contentEl) { contentEl.style.transition = 'none'; contentEl.style.opacity = String(Math.max(0, 1 - Math.max(0, dy) / 200)); }
        });
        const endDrag = (e) => {
          if (pendingId !== e.pointerId) return;
          pendingId = null;
          if (!dragging) return;
          dragging = false;
          try { expCard.releasePointerCapture(e.pointerId); } catch (_) { }
          const velocity = moved / Math.max(1, Date.now() - startT);
          if (moved > 110 || (velocity > 0.6 && moved > 30)) {
            closePortfolio();
          } else {
            expCard.style.transition = 'transform 0.35s ' + SPRING;
            expCard.style.transform = 'translateY(0)';
            if (contentEl) { contentEl.style.transition = 'opacity 0.2s ease'; contentEl.style.opacity = '1'; }
          }
        };
        expCard.addEventListener('pointerup', endDrag);
        expCard.addEventListener('pointercancel', endDrag);
      }
    })();

    // ═════════════════════════════════════════════════════════════════════
    // Weather / Berlin Status — iOS-style expand/collapse, same animation as Portfolio.
    // ═════════════════════════════════════════════════════════════════════
    (function () {
      const widget = document.getElementById('ios-weather-widget');
      const expanded = document.getElementById('ios-weather-expanded');
      const expCard = document.getElementById('ios-weather-card');
      const contentEl = document.getElementById('ios-weather-content');
      const scrollEl = document.getElementById('ios-weather-scroll');
      if (!widget || !expanded || !expCard) return;

      const SPRING = 'cubic-bezier(0.32, 0.72, 0, 1)';
      const DUR = 0.48;
      const ANIM_PROPS = `top ${DUR}s ${SPRING}, left ${DUR}s ${SPRING}, ` +
        `width ${DUR}s ${SPRING}, height ${DUR}s ${SPRING}, ` +
        `border-radius ${DUR}s ${SPRING}, transform ${DUR}s ${SPRING}`;
      const CONTENT_IN = 'opacity 0.32s cubic-bezier(0.2,0.7,0.2,1), transform 0.42s cubic-bezier(0.2,0.7,0.2,1)';
      const CONTENT_OUT = 'opacity 0.22s cubic-bezier(0.6,0,0.8,0.2), transform 0.30s cubic-bezier(0.5,0,0.75,0)';

      function applyStatus() {
        // Redundant - now handled by populateStatus() from status.json
      }

      // ─── Mirror compact widget data into the expanded view ────────────
      function syncFromCompact() {
        const map = [
          ['iww-time', 'iwe-time'],
          ['iww-icon', 'iwe-icon'],
          ['iww-temp', 'iwe-temp'],
          ['iww-wind', 'iwe-wind'],
          ['iww-desc', 'iwe-desc'],
        ];
        map.forEach(([src, dst]) => {
          const s = document.getElementById(src);
          const d = document.getElementById(dst);
          if (s && d) d.textContent = s.textContent;
        });
        // Date
        const dateEl = document.getElementById('iwe-date');
        if (dateEl) {
          const now = new Date();
          dateEl.textContent = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
        }
        // Sunrise/Sunset (read from open-meteo cache via Date objects rebuilt)
        // We re-fetch the times from the compact widget's exposed state if available.
        if (window.iwwGetSunTimes) {
          const t = window.iwwGetSunTimes();
          if (t && t.sunrise && t.sunset) {
            const fmt = (ms) => {
              const d = new Date(ms);
              return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
            };
            const sunriseEl = document.getElementById('iwe-sunrise');
            const sunsetEl = document.getElementById('iwe-sunset');
            const stateEl = document.getElementById('iwe-daylight-state');
            const cdLabel = document.querySelector('#iwe-daylight-countdown div:first-child');
            const cdVal = document.getElementById('iwe-countdown-val');
            if (sunriseEl) sunriseEl.textContent = fmt(t.sunrise);
            if (sunsetEl) sunsetEl.textContent = fmt(t.sunset);
            const now = Date.now();
            const isDay = now > t.sunrise && now < t.sunset;
            if (stateEl) {
              stateEl.textContent = isDay ? 'Day' : 'Night';
              stateEl.style.color = isDay ? 'rgba(255,215,75,0.85)' : 'rgba(140,180,255,0.85)';
            }
            if (cdLabel && cdVal) {
              const target = isDay ? t.sunset : (now < t.sunrise ? t.sunrise : t.sunrise + 86400000);
              cdLabel.textContent = isDay ? 'Until sunset' : 'Until sunrise';
              const diff = Math.max(0, target - now);
              const h = Math.floor(diff / 3600000);
              const m = Math.floor((diff % 3600000) / 60000);
              cdVal.textContent = h + 'h ' + String(m).padStart(2, '0') + 'm';
            }
            placeArcMarker(t, isDay);
          }
        }
      }

      // Position sun/moon on the arc using native SVG coords — no pixel conversion needed.
      function placeArcMarker(t, isDay) {
        const arcBg = document.getElementById('iwe-arc-bg');
        const arcProg = document.getElementById('iwe-arc-prog');
        const sunGlow = document.getElementById('iwe-svg-sun-glow');
        const sunDot = document.getElementById('iwe-svg-sun-dot');
        const moon = document.getElementById('iwe-svg-moon');
        if (!arcBg || !arcBg.getPointAtLength) return;
        const totalLen = arcBg.getTotalLength();
        const now = Date.now();
        const progT = isDay
          ? Math.max(0, Math.min(1, (now - t.sunrise) / (t.sunset - t.sunrise)))
          : 0.5;
        const progLen = totalLen * progT;
        const pt = arcBg.getPointAtLength(progLen);  // viewBox coords directly
        if (isDay) {
          if (arcProg) arcProg.setAttribute('stroke-dasharray', progLen + ' ' + (totalLen + 10));
          if (sunGlow) { sunGlow.setAttribute('cx', pt.x); sunGlow.setAttribute('cy', pt.y); sunGlow.removeAttribute('display'); }
          if (sunDot) { sunDot.setAttribute('cx', pt.x); sunDot.setAttribute('cy', pt.y); sunDot.removeAttribute('display'); }
          if (moon) moon.setAttribute('display', 'none');
        } else {
          if (arcProg) arcProg.setAttribute('stroke-dasharray', '0 ' + (totalLen + 10));
          if (sunGlow) sunGlow.setAttribute('display', 'none');
          if (sunDot) sunDot.setAttribute('display', 'none');
          if (moon) { moon.setAttribute('x', pt.x); moon.setAttribute('y', pt.y); moon.removeAttribute('display'); }
        }
      }

      function getExpandedTarget() {
        const screen = document.getElementById('ios-screen');
        const sr = screen ? screen.getBoundingClientRect() : { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight };
        return { top: sr.top + 32, left: sr.left + 14, width: sr.width - 28, height: sr.height - 60, radius: 32 };
      }

      function setCardFrame(rect, radius) {
        expCard.style.transition = 'none';
        expCard.style.top = rect.top + 'px';
        expCard.style.left = rect.left + 'px';
        expCard.style.width = rect.width + 'px';
        expCard.style.height = rect.height + 'px';
        expCard.style.borderRadius = (radius ?? 20) + 'px';
        expCard.style.transform = 'translateY(0)';
      }

      let isOpen = false;
      let liveSyncTimer = null;

      function openWeather() {
        if (isOpen) return;
        isOpen = true;
        applyStatus();
        syncFromCompact();
        if (liveSyncTimer) clearInterval(liveSyncTimer);
        liveSyncTimer = setInterval(syncFromCompact, 30000);
        const r = widget.getBoundingClientRect();
        expanded.style.display = 'block';
        if (contentEl) {
          contentEl.style.transition = 'none';
          contentEl.style.opacity = '0';
          contentEl.style.transform = 'scale(0.94) translateY(6px)';
          contentEl.style.transformOrigin = '50% 20%';
        }
        setCardFrame({ top: r.top, left: r.left, width: r.width, height: r.height }, 20);
        void expCard.offsetWidth;
        requestAnimationFrame(() => {
          const t = getExpandedTarget();
          expCard.style.transition = ANIM_PROPS;
          expCard.style.top = t.top + 'px';
          expCard.style.left = t.left + 'px';
          expCard.style.width = t.width + 'px';
          expCard.style.height = t.height + 'px';
          expCard.style.borderRadius = t.radius + 'px';
          setTimeout(() => {
            if (!isOpen) return;
            if (contentEl) {
              contentEl.style.transition = CONTENT_IN;
              contentEl.style.opacity = '1';
              contentEl.style.transform = 'scale(1) translateY(0)';
            }
          }, Math.round(DUR * 1000 * 0.18));
          // Place arc marker AFTER card has fully expanded, so getBoundingClientRect() is accurate.
          setTimeout(() => {
            if (!isOpen) return;
            requestAnimationFrame(syncFromCompact);
          }, Math.round(DUR * 1000) + 40);
        });
      }

      function closeWeather() {
        if (!isOpen) return;
        isOpen = false;
        if (liveSyncTimer) { clearInterval(liveSyncTimer); liveSyncTimer = null; }
        if (contentEl) {
          contentEl.style.transition = CONTENT_OUT;
          contentEl.style.opacity = '0';
          contentEl.style.transform = 'scale(0.92) translateY(-4px)';
          contentEl.style.transformOrigin = '50% 20%';
        }
        // Exclude sun/glow/moon HTML overlays from the close animation —
        // they use transform:translate(-50%,-50%) for centering which would
        // be overwritten, causing them to jump on re-open.
        const excludeIds = new Set(['iww-sun-dot-html', 'iww-sun-glow-html', 'iww-moon-html']);
        const widgetKids = Array.from(widget.children).filter(el => !excludeIds.has(el.id));
        widgetKids.forEach(el => {
          el.style.transition = 'none';
          el.style.opacity = '0';
          el.style.transform = 'translateY(3px) scale(0.985)';
          void el.offsetWidth;
        });
        requestAnimationFrame(() => {
          if (isOpen) return;
          const r = widget.getBoundingClientRect();
          expCard.style.transition = ANIM_PROPS + `, opacity ${DUR * 0.65}s cubic-bezier(0.4,0,0.7,0.2) ${DUR * 0.3}s`;
          expCard.style.top = r.top + 'px';
          expCard.style.left = r.left + 'px';
          expCard.style.width = r.width + 'px';
          expCard.style.height = r.height + 'px';
          expCard.style.borderRadius = '20px';
          expCard.style.transform = 'translateY(0)';
          expCard.style.opacity = '0';
        });
        setTimeout(() => {
          if (isOpen) return;
          widgetKids.forEach(el => {
            el.style.transition = 'opacity 0.42s cubic-bezier(0.2,0.7,0.2,1), transform 0.5s cubic-bezier(0.2,0.7,0.2,1)';
            el.style.opacity = '1';
            el.style.transform = 'translateY(0) scale(1)';
          });
        }, Math.round(DUR * 1000 * 0.3));
        setTimeout(() => {
          if (isOpen) return;
          expanded.style.display = 'none';
          expCard.style.opacity = '1';
          widgetKids.forEach(el => { el.style.transition = ''; el.style.opacity = ''; el.style.transform = ''; });
          // Re-place the compact arc marker now that widget children are restored.
          // Wait one frame so the cleared transforms/transitions are fully committed
          // before placeAt() reads the SVG geometry — otherwise the sun/glow can
          // land at a stale position from the in-progress fade-in animation.
          requestAnimationFrame(() => {
            if (window.iwwRefreshArc) window.iwwRefreshArc();
          });
        }, Math.round(DUR * 1000) + 80);
      }

      window.iosWeatherOpen = (e) => { if (e) e.stopPropagation(); openWeather(); };
      window.iosWeatherClose = closeWeather;
      window.iosWeatherIsOpen = () => isOpen;

      // Drag-to-close — same pattern as fixed changelog: skip when started inside scrollable list.
      if (expCard) {
        let dragging = false, startY = 0, startT = 0, moved = 0, pendingId = null;
        expCard.addEventListener('pointerdown', (e) => {
          if (!isOpen || (e.pointerType === 'mouse' && e.button !== 0)) return;
          if (scrollEl && scrollEl.contains(e.target)) return;
          pendingId = e.pointerId; startY = e.clientY; startT = Date.now(); moved = 0; dragging = false;
        });
        expCard.addEventListener('pointermove', (e) => {
          if (pendingId !== e.pointerId) return;
          const dy = e.clientY - startY;
          if (!dragging) {
            if (dy > 6) { dragging = true; try { expCard.setPointerCapture(e.pointerId); } catch (_) { } expCard.style.transition = 'none'; }
            else if (dy < -6) { pendingId = null; return; }
            else return;
          }
          moved = dy;
          expCard.style.transform = 'translateY(' + (dy > 0 ? dy : dy * 0.2) + 'px)';
          if (contentEl) { contentEl.style.transition = 'none'; contentEl.style.opacity = String(Math.max(0, 1 - Math.max(0, dy) / 200)); }
        });
        const endDrag = (e) => {
          if (pendingId !== e.pointerId) return;
          pendingId = null;
          if (!dragging) return;
          dragging = false;
          try { expCard.releasePointerCapture(e.pointerId); } catch (_) { }
          const velocity = moved / Math.max(1, Date.now() - startT);
          if (moved > 110 || (velocity > 0.6 && moved > 30)) {
            closeWeather();
          } else {
            expCard.style.transition = 'transform 0.35s ' + SPRING;
            expCard.style.transform = 'translateY(0)';
            if (contentEl) { contentEl.style.transition = 'opacity 0.2s ease'; contentEl.style.opacity = '1'; }
          }
        };
        expCard.addEventListener('pointerup', endDrag);
        expCard.addEventListener('pointercancel', endDrag);
      }
    })();

    // ═════════════════════════════════════════════════════════════════════
    // Dynamic Island (prototype) — tap-to-cycle through demo states so we
    // can feel the morph. Content is placeholder; plug real triggers later.
    // ═════════════════════════════════════════════════════════════════════
    (function () {
      const island = document.getElementById('dyn-island');
      if (!island) return;
      const icon = document.getElementById('dyn-icon');
      const title = document.getElementById('dyn-title');
      const sub = document.getElementById('dyn-sub');
      const trail = document.getElementById('dyn-trailing');

      const DEMO = [
        { icon: '●', title: 'eddie pushed', sub: 'Fix beachball wobble', trail: 'now' },
        { icon: '☀', title: 'Good morning', sub: 'Berlin — 14°C, sunny', trail: '↑6:42' },
        { icon: '✓', title: 'Available', sub: 'Open for new projects', trail: '→ mail' },
        { icon: '▶', title: 'Opening', sub: 'Edits — Music Videos', trail: '' },
      ];
      let idx = 0;

      function showExpanded(state) {
        icon.textContent = state.icon;
        title.textContent = state.title;
        sub.textContent = state.sub;
        trail.textContent = state.trail || '';
        trail.style.display = state.trail ? '' : 'none';
        island.classList.add('is-expanded');
      }
      function collapse() {
        island.classList.remove('is-expanded');
      }

      // Tap to cycle: if collapsed, expand to next demo state.
      // If expanded, collapse.
      island.addEventListener('click', () => {
        if (island.classList.contains('is-expanded')) {
          collapse();
        } else {
          showExpanded(DEMO[idx % DEMO.length]);
          idx++;
        }
      });

      // Auto-fire a demo once after the iOS screen shows, so visitors see
      // the morph without needing to tap.
      setTimeout(() => {
        if (document.getElementById('ios-screen').style.display !== 'none') {
          showExpanded(DEMO[0]);
          setTimeout(collapse, 3500);
          idx = 1;
        }
      }, 2200);
    })();

