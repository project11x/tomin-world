    // Admin Logic
    let adminTapCount = 0;
    let adminTapTimer = null;
    const adminTrigger = document.getElementById('iwe-trigger-admin');
    const adminOverlay = document.getElementById('ios-admin-overlay');
    const passcodeView = document.getElementById('admin-passcode-view');
    const panelView = document.getElementById('admin-panel-view');
    let currentPasscode = "";
    const MASTER_PASSCODE = "7777"; // CHANGE THIS

    if (adminTrigger) {
      adminTrigger.addEventListener('click', () => {
        adminTapCount++;
        clearTimeout(adminTapTimer);
        if (adminTapCount >= 3) {
          adminOpen();
          adminTapCount = 0;
        } else {
          adminTapTimer = setTimeout(() => { adminTapCount = 0; }, 500);
        }
      });
    }

    let loadedStatus = null;
    let selectedDoing = "";
    let selectedVibe = "";

    function adminOpen() {
      adminOverlay.style.display = 'flex';
      setTimeout(() => adminOverlay.classList.add('visible'), 10);
      currentPasscode = "";
      updatePasscodeDots();
      passcodeView.style.display = 'block';
      panelView.style.display = 'none';

      // Load stored values
      document.getElementById('adm-gh-token').value = localStorage.getItem('gh_token') || '';
      document.getElementById('adm-gh-repo').value = localStorage.getItem('gh_repo') || 'project11x/tomin-world';
      const keyEl = document.getElementById('adm-onesignal-key');
      if (keyEl) keyEl.value = localStorage.getItem('onesignal_key') || '';

      // EMERGENCY RENDER: Show chips immediately with defaults so they are never empty
      console.log("Admin: Initializing chips with defaults...");
      const defaultDoing = ["🎬 Pre-Production", "🎥 Shooting", "✂️ Post", "✅ Published"];
      const defaultVibes = ["hyperfocus", "referencing", "stuck", "shipping"];
      renderAdminChips('adm-doing-chips', defaultDoing, "", (val) => { selectedDoing = val; });
      renderAdminChips('adm-vibe-chips', defaultVibes, "", (val) => { selectedVibe = val; });

      // Pre-fill fields from current status
      fetch('status.json').then(r => r.json()).then(d => {
        console.log("Admin: Status data loaded successfully", d);
        loadedStatus = d;
        document.getElementById('adm-rn-note').value = d.rightNow?.note || '';
        document.getElementById('adm-rn-detail').value = d.rightNow?.statusDetail || '';
        document.getElementById('adm-working-on').value = d.workingOn || '';

        selectedDoing = d.rightNow?.title || '';
        selectedVibe = d.vibe?.title || '';

        // Update chips with actual data and active states
        renderAdminChips('adm-doing-chips', d.availableDoing || defaultDoing, selectedDoing, (val) => { selectedDoing = val; });
        renderAdminChips('adm-vibe-chips', d.availableVibes || defaultVibes, selectedVibe, (val) => { selectedVibe = val; });
      }).catch(e => {
        console.error("Admin: Failed to load status.json", e);
      });
    }

    function renderAdminChips(containerId, list, activeVal, onSelect) {
      const container = document.getElementById(containerId);
      if (!container) return;

      const safeList = Array.isArray(list) ? list : [];
      let html = safeList.map(item => `
        <div class="admin-chip ${item === activeVal ? 'active' : ''}" 
             onclick="selectAdminChip(this, '${containerId}', '${item}')">${item}</div>
      `).join('');

      html += `<div class="admin-chip-add" onclick="addAdminChip('${containerId}')">+ New</div>`;
      container.innerHTML = html;
      onSelect(activeVal);
    }

    window.selectAdminChip = function (el, containerId, val) {
      el.parentElement.querySelectorAll('.admin-chip').forEach(c => c.classList.remove('active'));
      el.classList.add('active');
      if (containerId === 'adm-doing-chips') selectedDoing = val;
      else selectedVibe = val;
    };

    window.addAdminChip = function (containerId) {
      const val = prompt("Enter new tag name:");
      if (!val) return;

      if (containerId === 'adm-doing-chips') {
        if (!loadedStatus.availableDoing.includes(val)) loadedStatus.availableDoing.push(val);
        selectedDoing = val;
        renderAdminChips(containerId, loadedStatus.availableDoing, selectedDoing, (v) => { selectedDoing = v; });
      } else {
        if (!loadedStatus.availableVibes.includes(val)) loadedStatus.availableVibes.push(val);
        selectedVibe = val;
        renderAdminChips(containerId, loadedStatus.availableVibes, selectedVibe, (v) => { selectedVibe = v; });
      }
    };

    function adminClose() {
      adminOverlay.classList.remove('visible');
      setTimeout(() => { adminOverlay.style.display = 'none'; }, 400);
    }

    function adminType(num) {
      if (currentPasscode.length < 4) {
        currentPasscode += num;
        updatePasscodeDots();
        if (currentPasscode.length === 4) {
          if (currentPasscode === MASTER_PASSCODE) {
            passcodeView.style.display = 'none';
            panelView.style.display = 'block';
          } else {
            // Shake effect or just reset
            currentPasscode = "";
            setTimeout(updatePasscodeDots, 200);
          }
        }
      }
    }

    function updatePasscodeDots() {
      const dots = document.querySelectorAll('.passcode-dot');
      dots.forEach((dot, i) => {
        if (i < currentPasscode.length) dot.classList.add('filled');
        else dot.classList.remove('filled');
      });
    }

    async function adminSave() {
      const btn = document.getElementById('adm-save-btn');
      const status = document.getElementById('adm-status');
      const token = document.getElementById('adm-gh-token').value;
      const repo = document.getElementById('adm-gh-repo').value;

      if (!token || !repo) {
        status.textContent = "Error: Token and Repo required";
        status.style.color = "#ff453a";
        return;
      }

      localStorage.setItem('gh_token', token);
      localStorage.setItem('gh_repo', repo);

      btn.disabled = true;
      btn.textContent = "Pushing...";
      status.textContent = "Connecting to GitHub...";
      status.style.color = "#fff";

      const newStatus = {
        rightNow: {
          title: selectedDoing,
          note: document.getElementById('adm-rn-note').value,
          statusDetail: document.getElementById('adm-rn-detail').value
        },
        vibe: {
          title: selectedVibe
        },
        workingOn: document.getElementById('adm-working-on').value,
        availableDoing: (loadedStatus && loadedStatus.availableDoing) ? loadedStatus.availableDoing : ["🎬 Pre-Production", "🎥 Shooting", "✂️ Post", "✅ Published"],
        availableVibes: (loadedStatus && loadedStatus.availableVibes) ? loadedStatus.availableVibes : ["hyperfocus", "referencing", "stuck", "shipping"]
      };

      try {
        // 1. Get file SHA
        const fileUrl = `https://api.github.com/repos/${repo}/contents/status.json`;
        const getResp = await fetch(fileUrl, {
          headers: { 'Authorization': `token ${token}` }
        });

        if (!getResp.ok) throw new Error("Could not find status.json on GitHub");
        const fileData = await getResp.json();
        const sha = fileData.sha;

        // 2. Update file
        const updateResp = await fetch(fileUrl, {
          method: 'PUT',
          headers: {
            'Authorization': `token ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: "Update status.json via mobile admin",
            content: btoa(unescape(encodeURIComponent(JSON.stringify(newStatus, null, 2)))),
            sha: sha
          })
        });

        if (updateResp.ok) {
          status.textContent = "✅ Success! Site will update in a moment.";
          status.style.color = "#30d158";
          
          // Force immediate UI update on the page so user sees it locally
          if (window.populateStatusManually) {
             window.populateStatusManually(newStatus);
          } else {
             // Fallback if global function not exposed yet
             location.reload();
          }
          setTimeout(() => { adminClose(); }, 1500);
        } else {
          const err = await updateResp.json();
          throw new Error(err.message || "Push failed");
        }
      } catch (e) {
        status.textContent = "Error: " + e.message;
        status.style.color = "#ff453a";
      } finally {
        btn.disabled = false;
        btn.textContent = "Push to Cloud";
      }
    }

    // ==== OneSignal Push Notifications ====
    const ONESIGNAL_APP_ID = "4f713f1a-2daa-4d18-960a-4a98000a3c11";

    function isStandalonePwa() {
      return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
        || window.navigator.standalone === true;
    }

    // Cache the SDK reference once init resolves, so the click handler
    // can call optIn() synchronously and preserve the iOS user-gesture.
    let __osRef = null;

    function showPushHint(text, color) {
      const hint = document.getElementById('ios-push-hint');
      if (!hint) return;
      hint.textContent = text;
      if (color) hint.style.color = color;
      else hint.style.color = 'rgba(255,255,255,0.6)';
    }

    function refreshPushToggleUI() {
      const toggle = document.getElementById('ios-push-toggle');
      const knob = document.getElementById('ios-push-knob');
      const hint = document.getElementById('ios-push-hint');
      if (!toggle || !knob || !hint) return;

      const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
      if (isIos && !isStandalonePwa()) {
        toggle.setAttribute('aria-checked', 'false');
        toggle.style.background = 'rgba(120,120,128,0.32)';
        knob.style.transform = 'translateX(0px)';
        toggle.style.opacity = '0.5';
        toggle.dataset.disabled = 'true';
        showPushHint('Füge die Seite zum Home-Bildschirm hinzu, um Benachrichtigungen zu aktivieren.');
        return;
      }
      toggle.style.opacity = '1';
      toggle.dataset.disabled = 'false';

      if (!__osRef) {
        toggle.setAttribute('aria-checked', 'false');
        toggle.style.background = 'rgba(120,120,128,0.32)';
        knob.style.transform = 'translateX(0px)';
        showPushHint('Lade…');
        return;
      }

      try {
        const optedIn = !!(__osRef.User && __osRef.User.PushSubscription && __osRef.User.PushSubscription.optedIn);
        const permission = !!(__osRef.Notifications && __osRef.Notifications.permission);
        const on = optedIn && permission;
        toggle.setAttribute('aria-checked', on ? 'true' : 'false');
        toggle.style.background = on ? '#34c759' : 'rgba(120,120,128,0.32)';
        knob.style.transform = on ? 'translateX(20px)' : 'translateX(0px)';
        if (!permission && typeof Notification !== 'undefined' && Notification.permission === 'denied') {
          showPushHint('Erlaubnis verweigert. Aktiviere in iOS Einstellungen → Shouli → Mitteilungen.');
        } else if (on) {
          showPushHint('Aktiv. Du bekommst Updates aufs Handy.');
        } else {
          showPushHint('Updates direkt aufs Handy.');
        }
      } catch (e) {
        showPushHint('UI-Fehler: ' + e.message, '#ff453a');
      }
    }

    function togglePushSubscription() {
      const toggle = document.getElementById('ios-push-toggle');
      if (toggle && toggle.dataset.disabled === 'true') return;

      // Last-resort: try to grab the SDK directly if Deferred queue never fired.
      if (!__osRef && window.OneSignal && window.OneSignal.User) {
        __osRef = window.OneSignal;
      }

      if (!__osRef) {
        const scriptStatus = window.__osScriptStatus || 'unknown';
        const initErr = window.__osInitError;
        const has = !!window.OneSignal;
        const hasUser = !!(window.OneSignal && window.OneSignal.User);
        let msg;
        if (scriptStatus === 'error') msg = 'CDN unreachable — Netzwerk blockt OneSignal?';
        else if (scriptStatus === 'pending') msg = 'SDK lädt noch (Netz langsam) — kurz warten.';
        else if (initErr) msg = 'Init-Fehler: ' + initErr;
        else if (has && !hasUser) msg = 'SDK geladen aber Init unfertig.';
        else msg = `SDK nicht bereit (script:${scriptStatus} loaded:${has} user:${hasUser})`;
        showPushHint(msg, '#ff9f0a');
        return;
      }

      try {
        const sub = __osRef.User && __osRef.User.PushSubscription;
        const optedIn = !!(sub && sub.optedIn);
        const permission = !!(__osRef.Notifications && __osRef.Notifications.permission);

        if (optedIn && permission) {
          // Synchronous call — preserves user gesture.
          sub.optOut();
        } else if (!permission) {
          // First-time permission request: must be inline in the user gesture.
          const p = __osRef.Notifications.requestPermission();
          if (p && typeof p.then === 'function') {
            p.then(() => {
              try { sub && sub.optIn(); } catch (e) { showPushHint('OptIn-Fehler: ' + e.message, '#ff453a'); }
              setTimeout(refreshPushToggleUI, 300);
            }).catch((e) => showPushHint('Permission-Fehler: ' + e.message, '#ff453a'));
          } else {
            try { sub && sub.optIn(); } catch (e) { showPushHint('OptIn-Fehler: ' + e.message, '#ff453a'); }
          }
        } else {
          // Permission already granted, just opt in
          sub.optIn();
        }
      } catch (e) {
        showPushHint('Toggle-Fehler: ' + e.message, '#ff453a');
      }
      setTimeout(refreshPushToggleUI, 400);
    }
    window.togglePushSubscription = togglePushSubscription;

    function bindOneSignal(OneSignal) {
      if (__osRef || !OneSignal || !OneSignal.User) return;
      __osRef = OneSignal;
      try {
        OneSignal.User.PushSubscription.addEventListener('change', refreshPushToggleUI);
      } catch (e) { /* listener may not exist */ }
      try {
        OneSignal.Notifications.addEventListener('permissionChange', refreshPushToggleUI);
      } catch (e) { /* listener may not exist */ }
      refreshPushToggleUI();
    }

    // Primary path: deferred queue fires when SDK initializes
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(bindOneSignal);

    // Fallback: poll for window.OneSignal in case init() failed but SDK is loaded
    let __osPolls = 0;
    const __osInterval = setInterval(() => {
      __osPolls++;
      if (__osRef) { clearInterval(__osInterval); return; }
      if (window.OneSignal && window.OneSignal.User) {
        bindOneSignal(window.OneSignal);
        clearInterval(__osInterval);
      }
      if (__osPolls > 60) clearInterval(__osInterval); // give up after ~30s
    }, 500);

    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(refreshPushToggleUI, 800);
      if (isStandalonePwa()) {
        const iconSection = document.getElementById('ios-app-icon-section');
        if (iconSection) iconSection.style.display = 'none';
      }
    });

    // ==== Admin: Send Push ====
    async function adminSendPush() {
      const titleEl = document.getElementById('adm-push-title');
      const msgEl = document.getElementById('adm-push-message');
      const urlEl = document.getElementById('adm-push-url');
      const keyEl = document.getElementById('adm-onesignal-key');
      const btn = document.getElementById('adm-push-btn');
      const status = document.getElementById('adm-push-status');

      const title = titleEl.value.trim();
      const message = msgEl.value.trim();
      const url = urlEl.value.trim();
      const key = keyEl.value.trim();

      if (!message || !key) {
        status.textContent = 'Message und REST API Key sind erforderlich';
        status.style.color = '#ff453a';
        return;
      }

      localStorage.setItem('onesignal_key', key);

      btn.disabled = true;
      btn.textContent = 'Sending…';
      status.textContent = '';

      try {
        const body = {
          app_id: ONESIGNAL_APP_ID,
          contents: { en: message },
          included_segments: ['Subscribed Users'],
        };
        if (title) body.headings = { en: title };
        if (url) body.url = url.startsWith('http') ? url : (location.origin + (url.startsWith('/') ? url : '/' + url));

        const resp = await fetch('https://onesignal.com/api/v1/notifications', {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + key,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body)
        });
        const data = await resp.json();
        if (resp.ok && data.id) {
          const recipients = typeof data.recipients === 'number' ? data.recipients : '?';
          status.textContent = `✅ Sent to ${recipients} subscriber(s).`;
          status.style.color = '#30d158';
          titleEl.value = '';
          msgEl.value = '';
          urlEl.value = '';
        } else {
          throw new Error((data.errors && (Array.isArray(data.errors) ? data.errors[0] : data.errors.invalid_player_ids)) || 'Send failed');
        }
      } catch (e) {
        status.textContent = 'Error: ' + e.message;
        status.style.color = '#ff453a';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Send Push';
      }
    }
    window.adminSendPush = adminSendPush;
