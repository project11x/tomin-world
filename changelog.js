import { EASE_SPRING } from './src/utils/motion.js';
    // ═════════════════════════════════════════════════════════════════════
    // Shared widget morph helper — FLIP-style expand/collapse
    // ─────────────────────────────────────────────────────────────────────
    // Identical content between compact and expanded layouts (LIVE label,
    // time, badge, temperature, …) glides smoothly between positions while
    // the widget itself resizes. The user perceives a single growing widget
    // instead of "another window opening on top of the small one".
    //
    // Mechanics:
    //  1. Measure each shared `to` element's destination rect at the FINAL
    //     card size, then snap the card back to the compact rect.
    //  2. Lock `contentEl` to absolute positioning at the final dimensions
    //     so layouts inside don't reflow during the grow — destination
    //     rects stay stable and the FLIP math holds.
    //  3. Apply translate+scale on each shared expanded element so it
    //     visually overlaps its compact counterpart (which is hidden under
    //     the opaque card).
    //  4. Animate: the card grows, FLIP transforms ease back to identity,
    //     and non-shared content fades + slides into place a tick later.
    //  5. Close reverses: shared elements morph back to compact rects while
    //     the card shrinks; non-shared content fades out first.
    // ═════════════════════════════════════════════════════════════════════
    const __MORPH_SPRING = EASE_SPRING;
    const __MORPH_DUR = 480; // ms — Apple Springboard widget expand cadence

    function __morphResolve(elOrSel, root) {
      if (!elOrSel) return null;
      if (typeof elOrSel === 'string') return (root || document).querySelector(elOrSel);
      return elOrSel;
    }

    function createWidgetMorph(cfg) {
      const widget = __morphResolve(cfg.widget);
      const expanded = __morphResolve(cfg.expanded);
      const expCard = __morphResolve(cfg.expCard);
      const contentEl = __morphResolve(cfg.contentEl);
      if (!widget || !expanded || !expCard) {
        return { open() { }, close() { }, attachDrag() { }, isOpen: () => false };
      }
      const getTarget = cfg.getTarget;
      const compactRadius = cfg.compactRadius != null ? cfg.compactRadius : 20;
      const onBeforeOpen = cfg.onBeforeOpen;
      const onAfterOpen = cfg.onAfterOpen;
      const onBeforeClose = cfg.onBeforeClose;
      const onAfterClose = cfg.onAfterClose;

      let isOpen = false;
      const stash = {};

      // Backdrop dim — the springboard behind the card darkens + blurs while
      // the widget is expanded (and tap-to-close finally works, as the markup
      // comments always promised).
      // Perf note: the blur is applied only AFTER the open morph settles and
      // removed BEFORE the close morph starts. Animating opacity on an
      // element with an active backdrop-filter forces the GPU to re-blur the
      // whole springboard every frame — that single property was the main
      // source of jank on real iPhones. A plain dim is one cheap composite.
      const backdropEl = cfg.backdrop
        ? __morphResolve(cfg.backdrop)
        : expanded.querySelector(':scope > div[id$="-backdrop"]');
      if (backdropEl && !backdropEl.dataset.morphBound) {
        backdropEl.dataset.morphBound = '1';
        backdropEl.style.background = 'rgba(0, 0, 0, 0.44)';
        backdropEl.style.opacity = '0';
        backdropEl.addEventListener('click', () => close());
      }
      function setBackdropBlur(on) {
        if (!backdropEl) return;
        // Turning ON happens after the morph settles — ease it in (nothing
        // else is animating, so the per-frame cost is affordable for 250ms).
        // Turning OFF must be instant: it runs right before the close morph.
        backdropEl.style.transition = on
          ? 'backdrop-filter 250ms ease, -webkit-backdrop-filter 250ms ease'
          : 'none';
        backdropEl.style.backdropFilter = on ? 'blur(14px)' : '';
        backdropEl.style.webkitBackdropFilter = on ? 'blur(14px)' : '';
      }
      function fadeBackdrop(toVisible, dur) {
        if (!backdropEl) return;
        backdropEl.style.transition = `opacity ${dur || __MORPH_DUR}ms ease`;
        backdropEl.style.opacity = toVisible ? '1' : '0';
      }

      function resolvePairs() {
        const raw = (typeof cfg.getSharedPairs === 'function')
          ? cfg.getSharedPairs()
          : (cfg.sharedPairs || []);
        return raw
          .map(p => ({ from: __morphResolve(p.from), to: __morphResolve(p.to), uniform: !!p.uniform }))
          .filter(p => p.from && p.to);
      }

      function resolveFadeEls() {
        const raw = (typeof cfg.getFadeEls === 'function')
          ? cfg.getFadeEls()
          : (cfg.fadeEls || []);
        return raw.map(el => __morphResolve(el)).filter(Boolean);
      }

      // Lock contentEl to absolute positioning at the final target size so
      // its children don't reflow as the card grows / shrinks. This keeps
      // every shared element's destination rect stable during the morph.
      function lockContent(target) {
        if (!contentEl) return;
        stash.position = contentEl.style.position || '';
        stash.top = contentEl.style.top || '';
        stash.left = contentEl.style.left || '';
        stash.right = contentEl.style.right || '';
        stash.bottom = contentEl.style.bottom || '';
        stash.width = contentEl.style.width || '';
        stash.height = contentEl.style.height || '';
        stash.flex = contentEl.style.flex || '';
        stash.opacity = contentEl.style.opacity || '';
        stash.transition = contentEl.style.transition || '';
        stash.transform = contentEl.style.transform || '';
        contentEl.style.position = 'absolute';
        contentEl.style.top = '0';
        contentEl.style.left = '0';
        contentEl.style.right = 'auto';
        contentEl.style.bottom = 'auto';
        contentEl.style.width = target.width + 'px';
        contentEl.style.height = target.height + 'px';
        contentEl.style.flex = 'none';
        contentEl.style.opacity = '1';
        contentEl.style.transition = 'none';
        contentEl.style.transform = 'none';
      }
      function unlockContent() {
        if (!contentEl) return;
        contentEl.style.position = stash.position;
        contentEl.style.top = stash.top;
        contentEl.style.left = stash.left;
        contentEl.style.right = stash.right;
        contentEl.style.bottom = stash.bottom;
        contentEl.style.width = stash.width;
        contentEl.style.height = stash.height;
        contentEl.style.flex = stash.flex;
        contentEl.style.opacity = stash.opacity;
        contentEl.style.transition = stash.transition;
        contentEl.style.transform = stash.transform;
      }

      function setCardRect(rect, radius, transition) {
        expCard.style.transition = transition || 'none';
        expCard.style.top = rect.top + 'px';
        expCard.style.left = rect.left + 'px';
        expCard.style.width = rect.width + 'px';
        expCard.style.height = rect.height + 'px';
        expCard.style.borderRadius = (radius != null ? radius : compactRadius) + 'px';
        expCard.style.transform = 'translateY(0)';
      }

      // FLIP transform that lands `toEl` on `fromRect` when the card sits at
      // its CURRENT rect (not the rect at which `toRect` was measured).
      //
      // `toRect` was measured while the card was at its FINAL (target) size.
      // `contentEl` is `position:absolute; top:0; left:0` inside the card, so
      // when the card snaps to a different rect the contentEl — and every
      // shared element inside it — moves with it. The naive `from - to`
      // delta would land the element off by exactly that card movement.
      // `cardDx`/`cardDy` is the offset between where the card was when we
      // measured `toRect` and where it is now (or will be at the end of the
      // animation, in close()).
      function flipTransform(toEl, fromRect, toRect, cardDx, cardDy, uniform) {
        const dx = (fromRect.left - toRect.left) + (cardDx || 0);
        const dy = (fromRect.top - toRect.top) + (cardDy || 0);
        let sx = toRect.width ? fromRect.width / toRect.width : 1;
        let sy = toRect.height ? fromRect.height / toRect.height : 1;
        // Text and circular elements squish visibly under non-uniform scale —
        // pairs can opt into a single averaged factor instead.
        if (uniform) { sx = sy = (sx + sy) / 2; }
        toEl.style.transition = 'none';
        toEl.style.transformOrigin = '0 0';
        toEl.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
        toEl.style.willChange = 'transform';
      }
      function clearFlip(el) {
        el.style.transition = '';
        el.style.transform = '';
        el.style.transformOrigin = '';
        el.style.willChange = '';
      }

      // Some pairs show DIFFERENT text in the two states ("Latest commit" →
      // "Latest commits"). A plain FLIP lands the element in the right spot
      // still wearing the wrong words, which then hard-swap on the overlay
      // hide. For those pairs a ghost copy of the compact element travels
      // the same path and the two crossfade mid-flight — the text reads as
      // transforming, never as jumping.
      function pairTextDiffers(p) {
        const a = (p.from.textContent || '').replace(/\s+/g, ' ').trim();
        const b = (p.to.textContent || '').replace(/\s+/g, ' ').trim();
        return a !== '' && b !== '' && a !== b;
      }
      function makeGhost(fromEl, dstRect, srcRect, opacity) {
        const g = fromEl.cloneNode(true);
        // Inherited styles don't survive the move to <body> — copy the ones
        // that shape text rendering from the live compact element.
        const cs = getComputedStyle(fromEl);
        g.style.font = cs.font;
        g.style.color = cs.color;
        g.style.letterSpacing = cs.letterSpacing;
        g.style.textTransform = cs.textTransform;
        g.style.textAlign = cs.textAlign;
        g.style.whiteSpace = cs.whiteSpace;
        g.style.position = 'fixed';
        g.style.margin = '0';
        g.style.boxSizing = 'border-box';
        g.style.left = dstRect.left + 'px';
        g.style.top = dstRect.top + 'px';
        g.style.width = dstRect.width + 'px';
        g.style.height = dstRect.height + 'px';
        g.style.zIndex = '99999';
        g.style.pointerEvents = 'none';
        g.style.transformOrigin = '0 0';
        g.style.transition = 'none';
        const sx = dstRect.width ? srcRect.width / dstRect.width : 1;
        const sy = dstRect.height ? srcRect.height / dstRect.height : 1;
        g.style.transform = `translate(${srcRect.left - dstRect.left}px, ${srcRect.top - dstRect.top}px) scale(${sx}, ${sy})`;
        g.style.opacity = String(opacity);
        g.style.willChange = 'transform, opacity';
        document.body.appendChild(g);
        return g;
      }

      const cardTransProps = `top ${__MORPH_DUR}ms ${__MORPH_SPRING}, ` +
        `left ${__MORPH_DUR}ms ${__MORPH_SPRING}, ` +
        `width ${__MORPH_DUR}ms ${__MORPH_SPRING}, ` +
        `height ${__MORPH_DUR}ms ${__MORPH_SPRING}, ` +
        `border-radius ${__MORPH_DUR}ms ${__MORPH_SPRING}, ` +
        `transform ${__MORPH_DUR}ms ${__MORPH_SPRING}, ` +
        `box-shadow ${__MORPH_DUR}ms ease`;

      function open() {
        if (isOpen) return;
        isOpen = true;
        if (onBeforeOpen) onBeforeOpen();
        expanded.style.display = 'block';

        const target = getTarget();
        // 1. Lock the inner layout to its final size (so destinations stay put).
        lockContent(target);
        // 2. Place the card at its final size to MEASURE shared destinations.
        setCardRect(target, target.radius, 'none');
        void expCard.offsetWidth;
        // The expanded card's big drop shadow, captured for the fade — it
        // grows in with the card and dissolves on close instead of popping.
        const fullShadow = getComputedStyle(expCard).boxShadow;
        const pairs = resolvePairs().map(p => ({
          from: p.from, to: p.to, dst: p.to.getBoundingClientRect()
        }));
        // 3. Snap the card back to the compact widget's rect — instant, no flicker
        //    because the browser hasn't painted yet (still inside the same task).
        const r0 = widget.getBoundingClientRect();
        setCardRect(r0, compactRadius, 'none');
        expCard.style.boxShadow = 'none';

        // 4. Fade-in elements start hidden + slightly offset.
        const fadeEls = resolveFadeEls();
        fadeEls.forEach(el => {
          el.style.transition = 'none';
          el.style.opacity = '0';
          el.style.transform = 'translateY(8px)';
        });

        // 5. FLIP shared expanded elements onto their compact counterparts.
        //    `p.dst` was measured while the card sat at `target` (full size);
        //    we just snapped it back to `r0` (compact rect) so contentEl —
        //    and every child inside it — moved by (target - r0). The FLIP
        //    transform compensates so the element lands exactly on its
        //    compact counterpart.
        const cardDx = target.left - r0.left;
        const cardDy = target.top - r0.top;
        const ghosts = [];
        pairs.forEach(p => {
          const src = p.from.getBoundingClientRect();
          flipTransform(p.to, src, p.dst, cardDx, cardDy, p.uniform);
          // Above any non-shared neighbours.
          if (!p.to.style.zIndex) p.to.style.zIndex = '4';
          if (pairTextDiffers(p)) {
            // Compact text rides along (visible) and dissolves into the
            // expanded text, which starts hidden.
            p.to.style.opacity = '0';
            p.crossfade = true;
            ghosts.push(makeGhost(p.from, p.dst, src, 1));
          }
        });

        // Commit the start states, then write the animated targets in the
        // same task (forced reflow in between). Synchronous on purpose: a
        // requestAnimationFrame here never fires while the tab is being
        // restored from background, leaving the morph stuck at its start.
        void expCard.offsetWidth;

        // 6. Animate.
        const t = getTarget();
        setCardRect(t, t.radius, cardTransProps);
        expCard.style.boxShadow = fullShadow;
        fadeBackdrop(true);

        pairs.forEach(p => {
          p.to.style.transition = p.crossfade
            ? `transform ${__MORPH_DUR}ms ${__MORPH_SPRING}, opacity ${__MORPH_DUR}ms ease`
            : `transform ${__MORPH_DUR}ms ${__MORPH_SPRING}`;
          p.to.style.transform = '';
          if (p.crossfade) p.to.style.opacity = '1';
        });
        ghosts.forEach(g => {
          g.style.transition = `transform ${__MORPH_DUR}ms ${__MORPH_SPRING}, opacity ${__MORPH_DUR}ms ease`;
          g.style.transform = 'none';
          g.style.opacity = '0';
        });

        // Fade in non-shared content slightly later and staggered — the
        // morph anchors the layout, then the details unfold one by one
        // instead of appearing as a single block.
        setTimeout(() => {
          if (!isOpen) return;
          fadeEls.forEach((el, i) => {
            const d = Math.min(i * 45, 320);
            el.style.transition = `opacity 360ms ease ${d}ms, transform 420ms ${__MORPH_SPRING} ${d}ms`;
            el.style.opacity = '1';
            el.style.transform = '';
          });
        }, Math.round(__MORPH_DUR * 0.18));

        // Cleanup once the morph completes. Staggered fades run longer
        // than the card morph — clear their inline transitions only after
        // the last one has finished, or they'd snap mid-flight.
        setTimeout(() => {
          if (!isOpen) return;
          pairs.forEach(p => {
            clearFlip(p.to);
            if (p.crossfade) p.to.style.opacity = '';
            if (p.to.style.zIndex === '4') p.to.style.zIndex = '';
          });
          ghosts.forEach(g => g.remove());
          expCard.style.boxShadow = '';
          // Blur arrives only now that nothing is animating — a single
          // recomposite instead of one per frame.
          setBackdropBlur(true);
          if (onAfterOpen) onAfterOpen();
        }, __MORPH_DUR + 40);
        setTimeout(() => {
          if (!isOpen) return;
          fadeEls.forEach(el => {
            el.style.transition = '';
            el.style.transform = '';
          });
        }, Math.round(__MORPH_DUR * 0.18) + 320 + 420 + 60);
      }

      function close() {
        if (!isOpen) return;
        isOpen = false;
        if (onBeforeClose) onBeforeClose();

        // Blur off BEFORE anything starts moving — otherwise every animation
        // frame re-blurs the springboard (the iPhone jank source).
        setBackdropBlur(false);

        // A drag-to-dismiss fades contentEl towards 0 while the finger pulls
        // down. Without restoring it, the whole card travels home EMPTY and
        // everything pops in on the final swap. Bring it back quickly so the
        // shared elements are visible for their journey.
        if (contentEl) {
          contentEl.style.transition = 'opacity 150ms ease';
          contentEl.style.opacity = '1';
        }

        // Capture current expanded rects + compact destination rects.
        const pairs = resolvePairs().map(p => ({
          from: p.from,
          to: p.to,
          uniform: p.uniform,
          src: p.to.getBoundingClientRect(),     // current expanded position
          dst: p.from.getBoundingClientRect(),   // compact position to land on
        }));

        // Mirror of open: non-shared content folds away staggered, last-in
        // first-out, while the shared elements travel home. The fades span
        // almost the whole shrink — if they finished early the card would
        // travel visibly empty for its last stretch, which reads cheap.
        const fadeEls = resolveFadeEls();
        const n = fadeEls.length;
        fadeEls.forEach((el, i) => {
          const d = Math.min((n - 1 - i) * 20, 100);
          el.style.transition = `opacity ${__MORPH_DUR - 140}ms ease ${d}ms, transform ${__MORPH_DUR - 100}ms ease ${d}ms`;
          el.style.opacity = '0';
          el.style.transform = 'translateY(6px)';
        });

        // Card movement delta — `p.src` was measured while card sat at
        // its current (expanded) rect; by the end of close it'll be at `r`
        // (compact). contentEl follows the card, so the FLIP transform
        // needs to compensate for that movement to actually land on `p.dst`.
        const expandedRectNow = expCard.getBoundingClientRect();

        // Synchronous for the same background-tab reason as open().
        const r = widget.getBoundingClientRect();
        setCardRect(r, compactRadius, cardTransProps);
        // Shadow dissolves with the shrink instead of vanishing on the swap.
        expCard.style.boxShadow = 'none';
        fadeBackdrop(false);
        const cardDx = expandedRectNow.left - r.left;
        const cardDy = expandedRectNow.top - r.top;

        const ghosts = [];
        pairs.forEach(p => {
          const dx = (p.dst.left - p.src.left) + cardDx;
          const dy = (p.dst.top - p.src.top) + cardDy;
          let sx = p.src.width ? p.dst.width / p.src.width : 1;
          let sy = p.src.height ? p.dst.height / p.src.height : 1;
          if (p.uniform) { sx = sy = (sx + sy) / 2; }
          const crossfade = pairTextDiffers(p);
          p.to.style.transition = crossfade
            ? `transform ${__MORPH_DUR}ms ${__MORPH_SPRING}, opacity ${__MORPH_DUR}ms ease`
            : `transform ${__MORPH_DUR}ms ${__MORPH_SPRING}`;
          p.to.style.transformOrigin = '0 0';
          p.to.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
          p.to.style.willChange = 'transform';
          if (!p.to.style.zIndex) p.to.style.zIndex = '4';
          if (crossfade) {
            // The compact text fades in along the same path while the
            // expanded text dissolves — when the overlay hides, the words
            // already match the widget underneath. No more hard text swap.
            p.crossfade = true;
            p.to.style.opacity = '0';
            const g = makeGhost(p.from, p.dst, p.src, 0);
            void g.offsetWidth;
            g.style.transition = `transform ${__MORPH_DUR}ms ${__MORPH_SPRING}, opacity ${__MORPH_DUR}ms ease`;
            g.style.transform = 'none';
            g.style.opacity = '1';
            ghosts.push(g);
          }
        });

        setTimeout(() => {
          if (isOpen) return;
          expanded.style.display = 'none';
          unlockContent();
          pairs.forEach(p => {
            clearFlip(p.to);
            if (p.crossfade) p.to.style.opacity = '';
            if (p.to.style.zIndex === '4') p.to.style.zIndex = '';
          });
          ghosts.forEach(g => g.remove());
          expCard.style.boxShadow = '';
          fadeEls.forEach(el => {
            el.style.transition = '';
            el.style.opacity = '';
            el.style.transform = '';
          });
          // Shared elements morph back into their exact compact positions,
          // so the swap is seamless for them. Compact-ONLY decorations
          // (rails, arcs, live dots) were hidden under the opaque card the
          // whole time — ease them in briefly instead of letting them pop.
          const extras = (cfg.compactExtras || [])
            .map(sel => __morphResolve(sel))
            .filter(Boolean);
          extras.forEach(el => {
            el.style.transition = 'none';
            el.style.opacity = '0';
          });
          if (extras.length) {
            void widget.offsetWidth;
            extras.forEach(el => {
              el.style.transition = 'opacity 220ms ease';
              el.style.opacity = '';
            });
            setTimeout(() => {
              extras.forEach(el => { el.style.transition = ''; });
            }, 280);
          }
          if (onAfterClose) onAfterClose();
        }, __MORPH_DUR + 60);
      }

      // iOS-style drag-down to dismiss. The `excludeContains` predicate lets
      // callers say "if the gesture starts inside this scrollable list, defer
      // to native scroll instead of starting a drag-to-close".
      function attachDrag(opts) {
        opts = opts || {};
        let dragging = false, startY = 0, startT = 0, moved = 0, pendingId = null;
        expCard.addEventListener('pointerdown', (e) => {
          if (!isOpen || (e.pointerType === 'mouse' && e.button !== 0)) return;
          if (opts.excludeContains && opts.excludeContains(e.target)) return;
          pendingId = e.pointerId; startY = e.clientY; startT = Date.now(); moved = 0; dragging = false;
        });
        expCard.addEventListener('pointermove', (e) => {
          if (pendingId !== e.pointerId) return;
          const dy = e.clientY - startY;
          if (!dragging) {
            if (dy > 6) {
              dragging = true;
              try { expCard.setPointerCapture(e.pointerId); } catch (_) { }
              expCard.style.transition = 'none';
            } else if (dy < -6) {
              pendingId = null; return;
            } else return;
          }
          moved = dy;
          expCard.style.transform = 'translateY(' + (dy > 0 ? dy : dy * 0.2) + 'px)';
          if (contentEl) {
            contentEl.style.transition = 'none';
            contentEl.style.opacity = String(Math.max(0, 1 - Math.max(0, dy) / 200));
          }
        });
        const endDrag = (e) => {
          if (pendingId !== e.pointerId) return;
          pendingId = null;
          if (!dragging) return;
          dragging = false;
          try { expCard.releasePointerCapture(e.pointerId); } catch (_) { }
          const velocity = moved / Math.max(1, Date.now() - startT);
          if (moved > 110 || (velocity > 0.6 && moved > 30)) {
            close();
          } else {
            expCard.style.transition = 'transform 0.35s ' + __MORPH_SPRING;
            expCard.style.transform = 'translateY(0)';
            if (contentEl) { contentEl.style.transition = 'opacity 0.2s ease'; contentEl.style.opacity = '1'; }
          }
        };
        expCard.addEventListener('pointerup', endDrag);
        expCard.addEventListener('pointercancel', endDrag);
      }

      return { open, close, attachDrag, isOpen: () => isOpen };
    }

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

      // Hit our own Worker proxy (src/api/commits.js) instead of GitHub
      // directly. The Worker holds a 60 s edge cache, so the upstream
      // GitHub rate limit (60 req/h per IP unauthenticated) is no longer
      // per-visitor — one cache fill serves everyone.
      const API = '/api/commits';
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
          const r = await fetch(API, { headers: { Accept: 'application/json' } });
          if (!r.ok) return;
          const data = await r.json();
          if (!Array.isArray(data) || !data.length) return;
          // The Worker already normalises to { sha, msg, date }.
          commits = data;
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
      // Expanded changelog — uses the shared FLIP morph helper so the LIVE /
      // CHANGELOG eyebrow labels at the top glide into place between the
      // compact and expanded layouts. Non-shared content (the "Latest
      // commits" title and scrollable list) fades in slightly delayed.
      // ───────────────────────────────────────────────────────────────────
      const widget = document.getElementById('ios-system-pulse');
      const expanded = document.getElementById('ios-changelog-expanded');
      const expCard = document.getElementById('ios-changelog-card');
      const contentEl = document.getElementById('ios-changelog-content');
      const listEl = document.getElementById('sys-commits-list');

      // Render the scrollable list of commits inside the expanded card.
      function renderList() {
        if (!listEl) return;
        if (!commits.length) {
          listEl.innerHTML = '<div style="color:rgba(255,255,255,0.5); font-size:13px; padding:20px 6px;">No commits yet.</div>';
          return;
        }
        listEl.innerHTML = commits.map((c, i) => {
          const subj = (c.msg || '').split('\n')[0];
          const sha = (c.sha || '').slice(0, 7);
          const ago = fmtAgo(new Date(c.date));
          // Escape subject — commit messages are untrusted text.
          const esc = subj.replace(/[&<>"']/g, ch => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
          }[ch]));
          // The first entry mirrors what the compact widget shows — its
          // parts carry markers so the morph can pair them and the commit
          // the user was just reading visibly becomes this list item.
          const mark = i === 0 ? ' data-icl-msg0' : '';
          const markSha = i === 0 ? ' data-icl-sha0' : '';
          const markAgo = i === 0 ? ' data-icl-ago0' : '';
          return (
            '<div style="padding:4px 2px;">' +
            '<div' + mark + ' style="background:rgba(255,255,255,0.03); border:1px solid rgba(48,209,88,0.18); border-radius:9px; padding:10px 12px; color:rgba(212,245,225,0.92); font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12.5px; line-height:1.4; font-weight:500;">' +
            esc +
            '</div>' +
            '<div style="display:flex; justify-content:space-between; align-items:center; padding:7px 4px 0;">' +
            '<code' + markSha + ' style="color:#5ac8fa; font-size:11.5px; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-weight:700; letter-spacing:0.02em;">' + sha + '</code>' +
            '<span' + markAgo + ' style="color:rgba(255,255,255,0.44); font-size:11.5px; font-weight:500;">' + ago + '</span>' +
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

      // The header row that holds the LIVE dot + LIVE/CHANGELOG eyebrows.
      // We need its non-shared children (the dot) in fadeEls so it doesn't
      // peek through at the compact rect during the morph.
      const headerLiveDot = expCard
        ? expCard.querySelector('#ios-changelog-content > div:nth-of-type(2) > div > div')
        : null;

      const morph = createWidgetMorph({
        widget, expanded, expCard, contentEl,
        getTarget: getExpandedTarget,
        // Dynamic: renderList() recreates the first list item per open, and
        // the compact widget's commit message / hash / timestamp morph into
        // it — the commit the user was reading becomes the first entry.
        getSharedPairs: () => [
          { from: '#sys-live-label', to: '#icl-live-label' },
          { from: '#sys-eyebrow', to: '#icl-eyebrow' },
          { from: '#sys-headline', to: '#icl-title', uniform: true },
          { from: '#sys-message', to: '[data-icl-msg0]' },
          { from: '#sys-hash', to: '[data-icl-sha0]', uniform: true },
          { from: '#sys-time', to: '[data-icl-ago0]', uniform: true },
        ],
        // Items 2+ of the list fade in staggered; the first item is a morph
        // pair, so its parent list must stay visible from the start.
        getFadeEls: () => [
          '#ios-changelog-grab',
          headerLiveDot,
          ...(listEl ? Array.from(listEl.children).slice(1) : []),
        ],
        // Compact-only decorations that sit under the opaque card during the
        // morph — eased in on close instead of popping.
        compactExtras: ['#sys-live-dot', '#sys-rail'],
        onBeforeOpen: () => {
          renderList();
          requestAnimationFrame(updateScrollFade);
        },
      });

      morph.attachDrag({
        excludeContains: (target) => listEl && listEl.contains(target),
      });

      window.iosChangelogOpen = (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        morph.open();
      };
      window.iosChangelogClose = () => morph.close();

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
      setInterval(() => { if (morph.isOpen()) renderList(); }, 30000);
      // Initial pass so openChangelog has data immediately.
      renderList();
    })();

    // ═════════════════════════════════════════════════════════════════════
    // Portfolio Guide — iOS-style expand/collapse, FLIP-morphed shared bits.
    // ═════════════════════════════════════════════════════════════════════
    (function () {
      const widget = document.getElementById('ios-live-activity');
      const expanded = document.getElementById('ios-portfolio-expanded');
      const expCard = document.getElementById('ios-portfolio-card');
      const contentEl = document.getElementById('ios-portfolio-content');
      const badgeEl = document.getElementById('ios-portfolio-badge');
      const srcBadge = document.getElementById('ila-badge');
      if (!widget || !expanded || !expCard) return;

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
          dot.dataset.ipeDot = String(i + 1);
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

          // Wrapper keeps the translateX(-50%) centering; the inner span is
          // the FLIP target (FLIP owns `transform`, so the centering must
          // live on an element the morph never touches).
          const labelWrap = document.createElement('span');
          labelWrap.style.cssText =
            'position:absolute; top:32px; left:50%; transform:translateX(-50%); white-space:nowrap;';
          const label = document.createElement('span');
          label.dataset.ipeLabel = String(i + 1);
          label.textContent = s.LABELS[section];
          label.style.cssText =
            'display:inline-block; font-size:10.5px; font-weight:700; letter-spacing:0.09em; ' +
            'text-transform:uppercase; color:rgba(255,255,255,' +
            (isCur ? '0.95' : isVis ? '0.7' : '0.38') + ');';
          labelWrap.appendChild(label);
          slot.appendChild(labelWrap);
          row.appendChild(slot);

          // Segment between this slot and the next
          if (i < s.displayOrder.length - 1) {
            const seg = document.createElement('div');
            seg.dataset.ipeSeg = String(i + 1);
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

      // Children of #ios-portfolio-content that are NOT part of any shared
      // pair — they fade/slide in after the morph anchors.
      // Order in DOM: 1=grab, 2=header (badge+eyebrow are shared), 3=title,
      // 4=timeline, 5=tips list.
      // The heading + sub are shared morph pairs (the compact title travels
      // into the big heading), so only the grab bar and tips list fade.
      const titleBlock = expCard.querySelector('#ios-portfolio-content > div:nth-of-type(3) h2');
      const tipsList = expCard.querySelector('#ios-portfolio-content > div:nth-of-type(5)');

      const morph = createWidgetMorph({
        widget, expanded, expCard, contentEl,
        getTarget: getExpandedTarget,
        // Dynamic: the expanded timeline is re-rendered in onBeforeOpen, so
        // dot/segment/label pairs must resolve per open. Every visible piece
        // of the compact widget morphs into its expanded counterpart — the
        // route visibly grows instead of fading out and back in.
        getSharedPairs: () => {
          const pairs = [
            { from: '#ila-badge', to: '#ios-portfolio-badge' },
            { from: '#ila-eyebrow', to: '#ipe-eyebrow', uniform: true },
            { from: '#ila-title', to: titleBlock, uniform: true },
            { from: '#ila-sub', to: '#ios-portfolio-sub', uniform: true },
          ];
          for (let i = 1; i <= 4; i++) {
            pairs.push({
              from: `.ila-slot[data-slot="${i}"] > div`,
              to: `[data-ipe-dot="${i}"]`,
              uniform: true,
            });
            pairs.push({
              from: `.ila-slot[data-slot="${i}"] span`,
              to: `[data-ipe-label="${i}"]`,
              uniform: true,
            });
          }
          for (let i = 1; i <= 3; i++) {
            pairs.push({
              from: `.ila-seg[data-seg="${i}"]`,
              to: `[data-ipe-seg="${i}"]`,
            });
          }
          return pairs;
        },
        fadeEls: [
          '#ios-portfolio-grab',
          tipsList,
        ],
        onBeforeOpen: () => {
          // Sync badge content + colors from the compact widget.
          if (badgeEl && srcBadge) {
            badgeEl.textContent = srcBadge.textContent;
            badgeEl.style.background = srcBadge.style.background || '#e0e0e0';
            badgeEl.style.color = srcBadge.style.color || '#1a1a1a';
          }
          // Render the scaled-up timeline.
          renderExpandedTimeline();
          // Sync the "X of N explored" subtitle.
          const srcSub = document.getElementById('ila-sub');
          const expSub = document.getElementById('ios-portfolio-sub');
          if (srcSub && expSub) expSub.textContent = srcSub.textContent;
        },
        onBeforeClose: () => {
          if (window.ilaResumeAdvance) window.ilaResumeAdvance();
        },
      });

      morph.attachDrag();

      window.iosPortfolioOpen = (e) => { if (e) e.stopPropagation(); morph.open(); };
      window.iosPortfolioClose = () => morph.close();
      window.iosPortfolioIsOpen = () => morph.isOpen();
    })();

    // ═════════════════════════════════════════════════════════════════════
    // Weather / Berlin Status — iOS-style expand/collapse, FLIP-morphed.
    // The time, temperature, icon, wind and city/eyebrow labels glide into
    // their expanded positions; the arc, status cards and detail blocks
    // fade in once the morph anchors.
    // ═════════════════════════════════════════════════════════════════════
    (function () {
      const widget = document.getElementById('ios-weather-widget');
      const expanded = document.getElementById('ios-weather-expanded');
      const expCard = document.getElementById('ios-weather-card');
      const contentEl = document.getElementById('ios-weather-content');
      const scrollEl = document.getElementById('ios-weather-scroll');
      if (!widget || !expanded || !expCard) return;

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
        const dateEl = document.getElementById('iwe-date');
        if (dateEl) {
          const now = new Date();
          dateEl.textContent = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
        }
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

      let liveSyncTimer = null;

      // Non-shared elements that should fade/slide in: grab bar, the big
      // time-and-weather block (only the date + sub-rows are not shared —
      // the time/temp/etc. inside ARE shared and stay visible), the
      // scrollable detail panel, and the decorative SVG arc.
      const grabBar = expCard.querySelector('#ios-weather-grab');
      const detailScroll = expCard.querySelector('#ios-weather-scroll');
      const arcSvg = expCard.querySelector('#iwe-arc-svg');
      const dateLabel = expCard.querySelector('#iwe-date');

      const morph = createWidgetMorph({
        widget, expanded, expCard, contentEl,
        getTarget: getExpandedTarget,
        sharedPairs: [
          { from: '#iww-eyebrow-city', to: '#iwe-trigger-admin' },
          { from: '#iww-eyebrow-label', to: '#iwe-eyebrow-label' },
          { from: '#iww-time', to: '#iwe-time' },
          { from: '#iww-icon', to: '#iwe-icon' },
          { from: '#iww-temp', to: '#iwe-temp' },
          { from: '#iww-wind', to: '#iwe-wind' },
          { from: '#iww-desc', to: '#iwe-desc' },
        ],
        fadeEls: [
          grabBar,
          dateLabel,
          detailScroll,
          arcSvg,
        ],
        // Compact-only decorations that sit under the opaque card during the
        // morph — eased in on close instead of popping.
        compactExtras: [
          '#iww-arc-svg',
          '#iww-sun-glow-html',
          '#iww-sun-dot-html',
          '#iww-moon-html',
          '#iww-live-dot',
          '#iww-status-tag',
        ],
        onBeforeOpen: () => {
          syncFromCompact();
          if (liveSyncTimer) clearInterval(liveSyncTimer);
          liveSyncTimer = setInterval(syncFromCompact, 30000);
        },
        onAfterOpen: () => {
          // Place arc marker AFTER card has fully expanded — getBoundingClientRect()
          // is now accurate.
          requestAnimationFrame(syncFromCompact);
        },
        onBeforeClose: () => {
          if (liveSyncTimer) { clearInterval(liveSyncTimer); liveSyncTimer = null; }
        },
        onAfterClose: () => {
          // Re-place the compact arc marker now that the widget is visible
          // again. Wait one frame so any cleared transforms commit before
          // the SVG geometry is read.
          requestAnimationFrame(() => {
            if (window.iwwRefreshArc) window.iwwRefreshArc();
          });
        },
      });

      morph.attachDrag({
        excludeContains: (target) => scrollEl && scrollEl.contains(target),
      });

      window.iosWeatherOpen = (e) => { if (e) e.stopPropagation(); morph.open(); };
      window.iosWeatherClose = () => morph.close();
      window.iosWeatherIsOpen = () => morph.isOpen();
    })();

    // Smart-stack card click bindings (replaces inline onclick handlers).
    (function () {
      const bind = (id, key) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('click', (e) => {
          const fn = window[key];
          if (fn) fn(e);
        });
      };
      bind('ios-weather-widget', 'iosWeatherOpen');
      bind('ios-live-activity', 'iosPortfolioOpen');
      bind('ios-system-pulse', 'iosChangelogOpen');
    })();

