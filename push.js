// @ts-check
// OneSignal Push Notifications
// Wires the iOS Contact app's push toggle to the OneSignal SDK.

/**
 * @typedef {object} OneSignalSDK
 * @property {{ PushSubscription: any, addEventListener?: any }} User
 * @property {{ permission: boolean, addEventListener?: any }} Notifications
 * @property {(opts: any) => Promise<void>} [init]
 */

/** @typedef {Window & typeof globalThis & {
 *   OneSignal?: OneSignalSDK,
 *   OneSignalDeferred?: Array<(s: OneSignalSDK) => void>,
 *   togglePushSubscription?: () => Promise<void>,
 *   refreshPushToggleUI?: () => void
 * }} WindowWithOneSignal */

/** @type {WindowWithOneSignal} */
const W = /** @type {any} */ (window);

(function () {
  /** @type {OneSignalSDK | null} */
  let __osRef = null;

  function rememberedOptIn() {
    try { return localStorage.getItem('pushOptedIn') === '1'; } catch { return false; }
  }
  function setRememberedOptIn(on) {
    try {
      if (on) localStorage.setItem('pushOptedIn', '1');
      else localStorage.removeItem('pushOptedIn');
    } catch { /* ignore */ }
  }

  function isStandalonePwa() {
    return (
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      /** @type {any} */ (window.navigator).standalone === true
    );
  }

  function showPushHint(text, color) {
    const hints = [
      document.getElementById('ios-push-hint'),
      document.getElementById('desktop-push-hint'),
      document.getElementById('android-push-hint'),
      document.getElementById('m3d-push-hint'),
    ].filter((h) => h);
    hints.forEach((hint) => {
      hint.textContent = text;
      hint.style.color = color || 'rgba(255,255,255,0.6)';
    });
  }

  function refreshPushToggleUI() {
    const toggles = [
      document.getElementById('ios-push-toggle'),
      document.getElementById('desktop-push-toggle'),
      document.getElementById('android-push-toggle'),
      document.getElementById('m3d-push-toggle'),
    ].filter((t) => t);
    const knobs = [
      document.getElementById('ios-push-knob'),
      document.getElementById('desktop-push-knob'),
      document.getElementById('android-push-knob'),
      document.getElementById('m3d-push-knob'),
    ].filter((k) => k);

    if (toggles.length === 0) return;

    const isIos =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (isIos && !isStandalonePwa()) {
      toggles.forEach((t) => {
        t.setAttribute('aria-checked', 'false');
        t.style.background = 'rgba(120,120,128,0.32)';
        t.style.opacity = '0.5';
        t.dataset.disabled = 'true';
      });
      knobs.forEach((k) => (k.style.transform = 'translateX(0px)'));
      showPushHint('Füge die Seite zum Home-Bildschirm hinzu, um Benachrichtigungen zu aktivieren.');
      return;
    }

    toggles.forEach((t) => {
      t.style.opacity = '1';
      t.dataset.disabled = 'false';
    });

    if (!__osRef) {
      // SDK not loaded yet (lazy). Reflect the remembered state so the toggle
      // looks right on return visits without pulling in the SDK.
      const remembered = rememberedOptIn();
      toggles.forEach((t) => {
        t.setAttribute('aria-checked', remembered ? 'true' : 'false');
        t.style.background = remembered ? '#34c759' : 'rgba(120,120,128,0.32)';
      });
      knobs.forEach((k) => (k.style.transform = remembered ? 'translateX(20px)' : 'translateX(0px)'));
      showPushHint(remembered ? 'Aktiv. Du bekommst Updates.' : 'Updates direkt auf dieses Gerät.');
      return;
    }

    try {
      const optedIn = !!(
        __osRef.User &&
        __osRef.User.PushSubscription &&
        __osRef.User.PushSubscription.optedIn
      );
      const permission = !!(__osRef.Notifications && __osRef.Notifications.permission);
      const on = optedIn && permission;

      toggles.forEach((t) => {
        t.setAttribute('aria-checked', on ? 'true' : 'false');
        t.style.background = on ? '#34c759' : 'rgba(120,120,128,0.32)';
      });
      knobs.forEach((k) => (k.style.transform = on ? 'translateX(20px)' : 'translateX(0px)'));

      if (
        !permission &&
        typeof Notification !== 'undefined' &&
        Notification.permission === 'denied'
      ) {
        showPushHint(
          'Erlaubnis verweigert. Aktiviere in den System-Einstellungen → Mitteilungen.',
          '#ff453a'
        );
      } else if (on) {
        showPushHint('Aktiv. Du bekommst Updates.');
      } else {
        showPushHint('Updates direkt auf dieses Gerät.');
      }
    } catch (e) {
      console.error('OS Refresh Error:', e);
      showPushHint('UI-Fehler: ' + e.message, '#ff453a');
    }
  }

  async function togglePushSubscription() {
    const iosToggle = document.getElementById('ios-push-toggle');
    const desktopToggle = document.getElementById('desktop-push-toggle');

    if (iosToggle && iosToggle.dataset.disabled === 'true') return;
    if (desktopToggle && desktopToggle.dataset.disabled === 'true' && !iosToggle) return;

    // Lazy-load the SDK the first time someone actually asks for notifications.
    if (!__osRef) {
      showPushHint('Verbinde…');
      await ensureOneSignal();
    }

    if (!__osRef) {
      showPushHint('Push hier nicht verfügbar.', '#ff9f0a');
      return;
    }

    const sub = __osRef.User && __osRef.User.PushSubscription;
    if (!sub) {
      showPushHint('Push-Dienst fehlt', '#ff453a');
      return;
    }

    const nativePerm = typeof Notification !== 'undefined' ? Notification.permission : 'default';
    const optedIn = !!sub.optedIn;

    if (nativePerm !== 'granted') {
      showPushHint('Frage System…');
      try {
        const result = await Notification.requestPermission();
        if (result === 'granted') {
          showPushHint('Erlaubnis erteilt! Lade neu...', '#34c759');
          try {
            sessionStorage.setItem('reopen-contact-app', 'push-grant');
            sessionStorage.setItem('os-autostart', '1');
          } catch (_e) {
            /* ignore */
          }
          setTimeout(() => location.reload(), 1500);
        } else {
          showPushHint('Erlaubnis verweigert', '#ff453a');
        }
      } catch (e) {
        showPushHint('Fehler: ' + e.message, '#ff453a');
      }
      return;
    }

    const allToggles = [iosToggle, desktopToggle].filter((t) => t);
    allToggles.forEach((t) => (t.style.opacity = '0.7'));
    try {
      if (optedIn) {
        showPushHint('Deaktiviere…');
        await sub.optOut();
        setRememberedOptIn(false);
      } else {
        showPushHint('Aktiviere (System-Erlaubnis liegt vor)…', '#ff9f0a');
        const optInTimeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout beim Verbinden.')), 15000)
        );
        await Promise.race([sub.optIn(), optInTimeout]);
        setRememberedOptIn(true);
        showPushHint('Aktiviert!', '#34c759');
      }
    } catch (e) {
      showPushHint('Fehler: ' + e.message, '#ff453a');
    } finally {
      allToggles.forEach((t) => (t.style.opacity = '1'));
      refreshPushToggleUI();
    }
  }
  W.togglePushSubscription = togglePushSubscription;
  W.refreshPushToggleUI = refreshPushToggleUI;

  function bindOneSignal(OneSignal) {
    if (__osRef || !OneSignal || !OneSignal.User) return;
    __osRef = OneSignal;

    try {
      OneSignal.User.PushSubscription.addEventListener('change', refreshPushToggleUI);
      OneSignal.Notifications.addEventListener('permissionChange', refreshPushToggleUI);
    } catch (_e) {
      /* listener may not exist */
    }

    refreshPushToggleUI();

    const nativePerm = typeof Notification !== 'undefined' ? Notification.permission : 'default';
    const optedIn = !!(
      OneSignal.User &&
      OneSignal.User.PushSubscription &&
      OneSignal.User.PushSubscription.optedIn
    );

    if (nativePerm === 'granted' && !optedIn) {
      showPushHint('Auto-Start...', '#ff9f0a');
      const optInTimeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout beim Verbinden.')), 15000)
      );
      Promise.race([OneSignal.User.PushSubscription.optIn(), optInTimeout])
        .then(() => refreshPushToggleUI())
        .catch((e) => {
          showPushHint('Hintergrund-Fehler: ' + e.message, '#ff453a');
        });
    }
  }

  // Lazy-load + init OneSignal — only on the production domain and only when a
  // visitor actually asks for notifications. Memoized: the SDK script + init
  // run at most once, and never on localhost / preview / prerendered pages.
  let __osLoadPromise = null;
  function ensureOneSignal() {
    if (__osRef) return Promise.resolve(__osRef);
    if (__osLoadPromise) return __osLoadPromise;
    const host = location.hostname;
    if (host !== 'shouli.de' && host !== 'www.shouli.de') return Promise.resolve(null);
    __osLoadPromise = new Promise((resolve) => {
      W.OneSignalDeferred = W.OneSignalDeferred || [];
      W.OneSignalDeferred.push(async function (OneSignal) {
        try {
          await OneSignal.init({ appId: '4f713f1a-2daa-4d18-960a-4a98000a3c11' });
          bindOneSignal(OneSignal);
        } catch (e) {
          showPushHint('Push-Dienst nicht erreichbar: ' + e.message, '#ff453a');
        }
        resolve(__osRef);
      });
      const s = document.createElement('script');
      s.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
      s.defer = true;
      s.onerror = () => { showPushHint('Push-SDK konnte nicht laden.', '#ff453a'); resolve(null); };
      document.head.appendChild(s);
    });
    return __osLoadPromise;
  }

  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(refreshPushToggleUI, 800);
    // Finish a subscription interrupted by the permission-grant reload: the
    // user already opted in, so load the SDK now (bindOneSignal auto-opts-in
    // once the OS permission is granted). Lazy for everyone else.
    let autostart = false;
    try {
      autostart = sessionStorage.getItem('os-autostart') === '1';
      sessionStorage.removeItem('os-autostart');
    } catch { /* ignore */ }
    if (autostart) ensureOneSignal();
    if (isStandalonePwa()) {
      const iconSection = document.getElementById('ios-app-icon-section');
      if (iconSection) iconSection.style.display = 'none';
    }
  });

  // Push toggle bindings (replaces inline onclick handlers).
  document.querySelectorAll('#ios-push-toggle, #desktop-push-toggle').forEach((el) => {
    el.addEventListener('click', () => togglePushSubscription());
  });

  // ── Hidden admin entrance: triple-tap the BERLIN label to open /admin.html ──
  // Cloudflare Access protects the page itself; this is just a discovery shortcut.
  const adminTrigger = document.getElementById('iwe-trigger-admin');
  if (adminTrigger) {
    let tapCount = 0;
    let tapTimer = null;
    adminTrigger.addEventListener('click', () => {
      tapCount++;
      clearTimeout(tapTimer);
      if (tapCount >= 3) {
        tapCount = 0;
        window.location.href = '/admin.html';
      } else {
        tapTimer = setTimeout(() => (tapCount = 0), 500);
      }
    });
  }
})();
