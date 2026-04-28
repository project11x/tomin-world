// ── iOS Live Activity: Time & Weather Berlin ─────────────────────────────
(function () {
  // Arc bezier control points (documentary): P0=(-5,48) P1=(52,-18) P2=(110,48)
  // viewBox aspect 115:50=2.3:1 ≈ widget 343×148 → uniform scale keeps circles round.

  const WMO = {
    0: ['☀️', 'Clear'], 1: ['🌤️', 'Mostly clear'], 2: ['⛅', 'Partly cloudy'], 3: ['☁️', 'Overcast'],
    45: ['🌫️', 'Foggy'], 48: ['🌫️', 'Icy fog'],
    51: ['🌦️', 'Light drizzle'], 53: ['🌦️', 'Drizzle'], 55: ['🌧️', 'Heavy drizzle'],
    61: ['🌧️', 'Light rain'], 63: ['🌧️', 'Rain'], 65: ['🌧️', 'Heavy rain'],
    71: ['❄️', 'Light snow'], 73: ['❄️', 'Snow'], 75: ['❄️', 'Heavy snow'],
    80: ['🌧️', 'Showers'], 81: ['🌧️', 'Showers'], 82: ['⛈️', 'Heavy showers'],
    95: ['⛈️', 'Thunderstorm'], 96: ['⛈️', 'Thunderstorm'], 99: ['⛈️', 'Thunderstorm'],
  };
  function wmo(code) {
    const c = Object.keys(WMO).map(Number).sort((a, b) => b - a).find(k => code >= k);
    return WMO[c] || ['🌡️', 'Unknown'];
  }

  const timeEl = document.getElementById('iww-time');
  const iconEl = document.getElementById('iww-icon');
  const tempEl = document.getElementById('iww-temp');
  const windEl = document.getElementById('iww-wind');
  const descEl = document.getElementById('iww-desc');
  const arcProg = document.getElementById('iww-arc-prog');
  const sunDotHtml = document.getElementById('iww-sun-dot-html');
  const sunGlowHtml = document.getElementById('iww-sun-glow-html');
  const moonHtml = document.getElementById('iww-moon-html');
  const weatherWgt = document.getElementById('ios-weather-widget');

  // Convert SVG viewBox coords to pixel coords within the weather widget
  // viewBox "-5 0 115 50": x range [-5,110] w=115, y range [0,50] h=50
  function svgToPx(svgX, svgY) {
    // Use fallbacks if dimensions aren't yet available (e.g. initial render)
    const w = (weatherWgt && weatherWgt.offsetWidth) || 343;
    const h = (weatherWgt && weatherWgt.offsetHeight) || 148;
    return { x: (svgX + 5) / 115 * w, y: (svgY + 22) / 72 * h };
  }

  let sunriseMs = null, sunsetMs = null;
  // Gate for the first-reveal intro: the arc stays blank (no sun/moon,
  // no progress line) until the weather card is brought into view. The
  // first time it shows up we run playArcIntro() to trace the path from
  // the left edge to the target position. Everything after is handled
  // by the normal updateArc() instant-path.
  let introPlayed = false;
  let introRAF = null;

  function tickClock() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    if (timeEl) timeEl.textContent = h + ':' + m;
    if (introPlayed) updateArc(now);
  }

  // ── Pure-JS arc math (bypasses SVG API which gives stale values in
  //    Safari after CSS-transform animations) ──────────────────────────
  // Path: M -5,48 Q 52,-18 110,48  (quadratic bezier)
  // dB/dt = (114+2t, -132+264t)
  // Precompute cumulative arc-length table at 200 samples so we can
  // convert parametric-t ↔ arc-length fraction analytically.
  const IWW_N = 200;
  const IWW_LUT = (() => {
    const a = new Float64Array(IWW_N + 1);
    for (let i = 1; i <= IWW_N; i++) {
      const tm = (i - 0.5) / IWW_N;
      const dx = 114 + 2 * tm, dy = -132 + 264 * tm;
      a[i] = a[i - 1] + Math.sqrt(dx * dx + dy * dy) / IWW_N;
    }
    return a;
  })();
  const IWW_TOTAL = IWW_LUT[IWW_N]; // total arc length in viewBox units

  // Bezier point at parametric t in viewBox coords
  function iwwBezier(t) {
    const u = 1 - t;
    return {
      x: u * u * (-5) + 2 * u * t * 52 + t * t * 110,
      y: u * u * 48 + 2 * u * t * (-18) + t * t * 48
    };
  }
  // Arc length (viewBox units) from t=0 to parametric t
  function iwwArcLen(t) {
    const i = Math.min(IWW_N - 1, (t * IWW_N) | 0);
    const f = t * IWW_N - i;
    return IWW_LUT[i] + f * (IWW_LUT[i + 1] - IWW_LUT[i]);
  }

  // Compute the arc target for the current moment.
  // Uses IWW_TOTAL (analytical) so getTotalLength() is never called —
  // that SVG API can return stale values after CSS-transform animations.
  function currentTarget(now) {
    const nowMs = now.getTime();
    const isDay = sunriseMs && sunsetMs && nowMs > sunriseMs && nowMs < sunsetMs;
    const t = isDay
      ? Math.max(0, Math.min(1, (nowMs - sunriseMs) / (sunsetMs - sunriseMs)))
      : 0.5;
    return { isDay, t };
  }

  // Place the sun (day) or moon (night) at parametric t on the arc.
  // Arc-length for stroke-dasharray is also computed analytically so the
  // sun dot always sits exactly on the end of the filled arc line.
  function placeAt(t, isDay) {
    const pt = iwwBezier(t);
    const pos = svgToPx(pt.x, pt.y);
    const len = iwwArcLen(t);
    const CENTER = 'translate(-50%,-50%)';
    if (isDay) {
      if (arcProg) arcProg.setAttribute('stroke-dasharray', len + ' ' + (IWW_TOTAL + 10));
      if (sunDotHtml) { sunDotHtml.style.left = pos.x + 'px'; sunDotHtml.style.top = pos.y + 'px'; sunDotHtml.style.transform = CENTER; sunDotHtml.style.display = ''; }
      if (sunGlowHtml) { sunGlowHtml.style.left = pos.x + 'px'; sunGlowHtml.style.top = pos.y + 'px'; sunGlowHtml.style.transform = CENTER; sunGlowHtml.style.display = ''; }
      if (moonHtml) moonHtml.style.display = 'none';
    } else {
      if (arcProg) arcProg.setAttribute('stroke-dasharray', '0 ' + (IWW_TOTAL + 10));
      if (sunDotHtml) sunDotHtml.style.display = 'none';
      if (sunGlowHtml) sunGlowHtml.style.display = 'none';
      if (moonHtml) { moonHtml.style.left = pos.x + 'px'; moonHtml.style.top = pos.y + 'px'; moonHtml.style.transform = CENTER; moonHtml.style.display = ''; }
    }
  }

  function updateArc(now) {
    const tgt = currentTarget(now);
    if (!tgt) return;
    placeAt(tgt.t, tgt.isDay);
  }

  // Let the expanded weather close handler re-sync the compact arc position.
  window.iwwRefreshArc = () => updateArc(new Date());

  // Ease-out cubic: fast start, gentle stop — lets the sun/moon glide
  // along the arc and settle softly at its final spot.
  function easeOutCubic(x) { return 1 - Math.pow(1 - x, 3); }

  // First-reveal animation. Tweens progLen from 0 → target over ~1.8 s
  // and updates the sun/moon position every frame along the arc.
  function playArcIntro() {
    if (introPlayed) return;
    const tgt = currentTarget(new Date());
    if (!tgt || tgt.t <= 0) {
      // Nothing to animate yet (e.g. sunrise/sunset not fetched) — try
      // again on the next tick/card-reveal.
      return;
    }
    introPlayed = true;
    if (introRAF) cancelAnimationFrame(introRAF);

    const DUR = 1800;
    const start = performance.now();
    const { isDay, t: target } = tgt;

    function frame(ts) {
      const raw = Math.min(1, (ts - start) / DUR);
      const eased = easeOutCubic(raw);
      placeAt(target * eased, isDay);
      if (raw < 1) {
        introRAF = requestAnimationFrame(frame);
      } else {
        introRAF = null;
      }
    }
    introRAF = requestAnimationFrame(frame);
  }

  // Subscribe to card-change events so we can trigger the intro the
  // first time the weather card becomes the front card. The Smart Stack
  // carousel fans events out to window.sstackCardHandlers.
  window.sstackCardHandlers = window.sstackCardHandlers || [];
  window.sstackCardHandlers.push(function (idx) {
    if (idx !== 0 || introPlayed) return;
    // Data might still be in-flight on first reveal — retry briefly.
    if (sunriseMs && sunsetMs) {
      playArcIntro();
    } else {
      let tries = 0;
      const iv = setInterval(() => {
        tries++;
        if (introPlayed || tries > 30) { clearInterval(iv); return; }
        if (sunriseMs && sunsetMs) { clearInterval(iv); playArcIntro(); }
      }, 120);
    }
  });

  async function fetchWeather() {
    try {
      const url = 'https://api.open-meteo.com/v1/forecast?latitude=52.52&longitude=13.41' +
        '&current=temperature_2m,wind_speed_10m,weather_code' +
        '&daily=sunrise,sunset&timezone=Europe%2FBerlin&forecast_days=1';
      const res = await fetch(url);
      const data = await res.json();
      const cur = data.current;
      const daily = data.daily;
      if (iconEl && tempEl && windEl && descEl) {
        const [icon, desc] = wmo(cur.weather_code);
        iconEl.textContent = icon;
        tempEl.textContent = Math.round(cur.temperature_2m) + '°C';
        windEl.textContent = '💨 ' + Math.round(cur.wind_speed_10m) + ' km/h';
        descEl.textContent = desc;
      }
      if (daily && daily.sunrise && daily.sunset) {
        sunriseMs = new Date(daily.sunrise[0]).getTime();
        sunsetMs = new Date(daily.sunset[0]).getTime();
        // Only paint the arc instantly if we've already done the intro.
        // Otherwise hold the blank starting state — the intro will tween
        // to this target the moment the weather card is first revealed.
        if (introPlayed) updateArc(new Date());
      }
    } catch (e) {
      if (descEl) descEl.textContent = 'Berlin';
    }
  }

  // Expose sun times so the expanded weather view can render daylight info.
  window.iwwGetSunTimes = function () {
    return { sunrise: sunriseMs, sunset: sunsetMs };
  };

  // Populate expanded status categories from status.json
  async function populateStatus() {
    try {
      const resp = await fetch('status.json');
      if (!resp.ok) return;
      const data = await resp.json();

      const rn = data.rightNow;
      if (rn) {
        const titleEl = document.getElementById('iwe-status-title');
        const projectEl = document.getElementById('iwe-status-project');
        const noteEl = document.getElementById('iwe-status-note');
        const emojiEl = document.getElementById('iwe-status-emoji');

        // Handle Emoji and Title (split "🎬 Pre-Production" into "🎬" and "Pre-Production")
        const fullTitle = rn.title || '';
        let phaseName = fullTitle;
        let emoji = '✂️';
        
        // Comprehensive emoji regex
        const emojiMatch = fullTitle.match(/^(\ud83c[\udf00-\uffff]|\ud83d[\udf00-\uffff]|\ud83e[\udf00-\uffff]|[\u2700-\u27bf]|[\u2000-\u3299])/);
        if (emojiMatch) {
          emoji = emojiMatch[0];
          phaseName = fullTitle.replace(emoji, '').trim();
        }

        if (emojiEl) emojiEl.textContent = emoji;
        if (titleEl) titleEl.textContent = phaseName;
        if (projectEl) projectEl.textContent = rn.note || '';
        if (noteEl) noteEl.textContent = rn.statusDetail || '';
        
        // NEW: Update compact widget description with the phase
        const compactDescEl = document.getElementById('iww-desc');
        const compactTagEl = document.getElementById('iww-status-tag');
        if (compactDescEl) compactDescEl.textContent = rn.title || '–';
        if (compactTagEl) compactTagEl.textContent = rn.title || '–';
      }

      const vibe = data.vibe;
      if (vibe) {
        const vTitle = document.getElementById('iwe-vibe-title');
        const vNote = document.getElementById('iwe-vibe-note');
        if (vTitle) vTitle.textContent = vibe.title || '';
        if (vNote) {
          const energyMap = {
            'hyperfocus': '⚡ high energy',
            'referencing': '📚 learning',
            'stuck': '🚧 creative block',
            'shipping': '🚀 delivering',
            'flow': '🌊 in the zone',
            'chilling': '☕ low energy'
          };
          vNote.textContent = energyMap[vibe.title?.toLowerCase()] || '✨ vibe check';
        }
      }

      const working = data.workingOn;
      const workingBlock = document.getElementById('iwe-working-block');
      if (workingBlock) {
        if (!working || working.trim() === '') {
          workingBlock.style.visibility = 'hidden';
          workingBlock.style.opacity = '0';
        } else {
          workingBlock.style.visibility = 'visible';
          workingBlock.style.opacity = '1';
          const wTitle = document.getElementById('iwe-working-title');
          const wNote = document.getElementById('iwe-working-note');
          if (wTitle) wTitle.textContent = working;
          if (wNote && typeof globalLatestFileTime !== 'undefined' && globalLatestFileTime > 0) {
            const diffMs = Date.now() - globalLatestFileTime;
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
            let timeStr = "just now";
            if (diffDays > 0) timeStr = diffDays + "d ago";
            else if (diffHours > 0) timeStr = diffHours + "h ago";
            wNote.textContent = "🎬 last: " + timeStr;
          }
        }
      }
    } catch (e) {
      console.log("Status update error:", e);
    }
  }
  // Expose for immediate admin updates
  window.populateStatusManually = (data) => {
    const rn = data.rightNow;
    if (!rn) return;
    const titleEl = document.getElementById('iwe-status-title');
    const projectEl = document.getElementById('iwe-status-project');
    const noteEl = document.getElementById('iwe-status-note');
    const emojiEl = document.getElementById('iwe-status-emoji');
    
    const fullTitle = rn.title || '';
    let phaseName = fullTitle;
    let emoji = '✂️';
    const emojiMatch = fullTitle.match(/^(\ud83c[\udf00-\uffff]|\ud83d[\udf00-\uffff]|\ud83e[\udf00-\uffff]|[\u2700-\u27bf]|[\u2000-\u3299])/);
    if (emojiMatch) {
      emoji = emojiMatch[0];
      phaseName = fullTitle.replace(emoji, '').trim();
    }
    if (emojiEl) emojiEl.textContent = emoji;
    if (titleEl) titleEl.textContent = phaseName;
    if (projectEl) projectEl.textContent = rn.note || '';
    if (noteEl) noteEl.textContent = rn.statusDetail || '';
    
    // NEW: Update compact widget description with the phase
    const compactDescEl = document.getElementById('iww-desc');
    const compactTagEl = document.getElementById('iww-status-tag');
    if (compactDescEl) compactDescEl.textContent = rn.title || '–';
    if (compactTagEl) compactTagEl.textContent = rn.title || '–';
    
    // Also update vibe and working on
    if (data.vibe) {
      const vTitle = document.getElementById('iwe-vibe-title');
      if (vTitle) vTitle.textContent = data.vibe.title || '';
    }
    if (data.workingOn !== undefined) {
      const wTitle = document.getElementById('iwe-working-title');
      if (wTitle) wTitle.textContent = data.workingOn;
    }
  };
  populateStatus();

  tickClock();
  setInterval(tickClock, 30000);
  fetchWeather();
  setInterval(fetchWeather, 10 * 60 * 1000);
})();
