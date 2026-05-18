// iOS-only: counter-rotate the shell so the PWA looks "locked" to portrait.
// iOS Safari ignores the manifest's orientation field and doesn't expose
// screen.orientation.lock(), so this is the only way to keep the layout
// upright when the user rotates the device. The native <video> fullscreen
// player on iOS lives outside this transformed subtree, so it keeps rotating
// freely — which is exactly what we want for edits.

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

if (isIOS) {
  const root = document.documentElement;
  const style = document.createElement('style');
  style.textContent = `
    html.ios-rotate-lock body {
      transform-origin: 50% 50%;
      position: fixed;
      top: 0;
      left: 0;
      overflow: hidden;
    }
    html.ios-rotate-lock.ios-rot-left body {
      transform: rotate(90deg);
      width: 100vh;
      height: 100vw;
      top: calc((100vh - 100vw) / 2);
      left: calc((100vw - 100vh) / 2);
    }
    html.ios-rotate-lock.ios-rot-right body {
      transform: rotate(-90deg);
      width: 100vh;
      height: 100vw;
      top: calc((100vh - 100vw) / 2);
      left: calc((100vw - 100vh) / 2);
    }
    html.ios-rotate-lock.ios-rot-180 body {
      transform: rotate(180deg);
    }
  `;
  document.head.appendChild(style);
  root.classList.add('ios-rotate-lock');

  let videoFullscreen = false;

  function apply() {
    root.classList.remove('ios-rot-left', 'ios-rot-right', 'ios-rot-180');
    if (videoFullscreen) return;

    // window.orientation: 0 = portrait, 90 = landscape (home left),
    // -90 = landscape (home right), 180 = upside-down.
    const o = typeof window.orientation === 'number'
      ? window.orientation
      : (screen.orientation && /landscape/.test(screen.orientation.type)
          ? (screen.orientation.angle === 90 ? 90 : -90)
          : 0);

    if (o === 90)  root.classList.add('ios-rot-right');
    else if (o === -90) root.classList.add('ios-rot-left');
    else if (o === 180) root.classList.add('ios-rot-180');
  }

  window.addEventListener('orientationchange', apply);
  window.addEventListener('resize', apply);

  // Attach to any <video> that enters native fullscreen so we let iOS rotate
  // the player on its own. Use capture+delegation so future videos are covered.
  document.addEventListener('webkitbeginfullscreen', (e) => {
    if (e.target && e.target.tagName === 'VIDEO') {
      videoFullscreen = true;
      apply();
    }
  }, true);
  document.addEventListener('webkitendfullscreen', (e) => {
    if (e.target && e.target.tagName === 'VIDEO') {
      videoFullscreen = false;
      apply();
    }
  }, true);

  apply();
}
