// @ts-check
// OneSignal Push Notifications
// Wires the iOS Contact app's push toggle to the OneSignal SDK.

/**
 * @typedef {object} OneSignalSDK
 * @property {{ PushSubscription: any, addEventListener?: any }} User
 * @property {{ permission: boolean, addEventListener?: any }} Notifications
 */

/** @typedef {Window & typeof globalThis & {
 *   OneSignal?: OneSignalSDK,
 *   OneSignalDeferred?: Array<(s: OneSignalSDK) => void>,
 *   togglePushSubscription?: () => Promise<void>
 * }} WindowWithOneSignal */

/** @type {WindowWithOneSignal} */
const W = /** @type {any} */ (window);

(function () {
  /** @type {OneSignalSDK | null} */
  let __osRef = null;

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
    ].filter((t) => t);
    const knobs = [
      document.getElementById('ios-push-knob'),
      document.getElementById('desktop-push-knob'),
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
      toggles.forEach((t) => {
        t.setAttribute('aria-checked', 'false');
        t.style.background = 'rgba(120,120,128,0.32)';
      });
      knobs.forEach((k) => (k.style.transform = 'translateX(0px)'));
      showPushHint('Initialisiere…');
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

    if (!__osRef && W.OneSignal && W.OneSignal.User) {
      __osRef = W.OneSignal;
    }

    if (!__osRef) {
      showPushHint('SDK nicht bereit', '#ff9f0a');
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
      } else {
        showPushHint('Aktiviere (System-Erlaubnis liegt vor)…', '#ff9f0a');
        const optInTimeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout beim Verbinden.')), 15000)
        );
        await Promise.race([sub.optIn(), optInTimeout]);
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

  W.OneSignalDeferred = W.OneSignalDeferred || [];
  W.OneSignalDeferred.push(bindOneSignal);

  let __osPolls = 0;
  const __osInterval = setInterval(() => {
    __osPolls++;
    if (__osRef) {
      clearInterval(__osInterval);
      return;
    }
    if (W.OneSignal && W.OneSignal.User) {
      bindOneSignal(W.OneSignal);
      clearInterval(__osInterval);
    }
    if (__osPolls > 60) clearInterval(__osInterval);
  }, 500);

  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(refreshPushToggleUI, 800);
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
