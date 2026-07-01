// Entry module — runs in the browser via <script type="module" src="app.js">.
// All real logic lives under ./src; this file just orchestrates load order.
//
// Load order matters because some modules attach `window.*` globals that
// later modules reference. The pattern: utilities first, then per-screen
// modules, then the central UI bindings that wire markup to handlers.

import { portfolioData } from './data.js';
import { MEDIA_BASE } from './src/utils/media.js';
import { bootstrapPortfolioSync } from './src/utils/portfolio-sync.js';
import './src/utils/icons.js';
import './src/utils/video.js';
import './src/desktop/system-bar.js';
import './src/desktop/desktop-icons.js'; // must come BEFORE windows.js — renders icons that windows.js then wires up
import './src/desktop/windows.js';
import './src/desktop/journal-app.js';
import './src/desktop/quick-look.js';
import './src/desktop/spaces.js';
import './src/desktop/edits-viewer.js';
import './src/desktop/m3-shell.js';
import './src/desktop/tui-shell.js';
import './src/desktop/wii-shell.js';
import './src/desktop/wii-detect.js';
import './src/desktop/wii-gamepad.js';
import './src/ios/index.js';
import './src/ios/journal-app.js';
import './src/android/index.js';
import './src/android/widgets.js';
import './src/android/tabs.js';
import './src/android/ripple.js';
import './src/android/edits-viewer.js';
import './src/android/magazines-reader.js';
import './src/android/bts-viewer.js';
import './src/ios/edge-swipe.js';
import './src/ios/rotation-lock.js';
import './src/ios/badges.js';
import './src/android/badges.js';
import './src/widgets/weather.js';
import './src/widgets/smart-stack.js';
import './src/widgets/portfolio-timeline.js';
import './src/desktop/dock-magnify.js';
import './src/desktop/intro.js'; // after desktop-icons.js — icons must exist to cascade in
import './src/desktop/ui-bindings.js';
import './src/desktop/context-menu.js';
import './src/utils/admin-chooser.js';
import './src/utils/router.js';

// Prepend R2 base URL to all src values everywhere except `vite dev` (which
// serves the project root and therefore has the media folders locally).
// Wrangler dev only serves dist/ — the media folders aren't bundled there,
// so we still need the R2 prefix to actually load thumbnails / videos.
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const isViteDev = isLocal && window.location.port === '5173';
const R2_BASE_URL = isViteDev ? '' : MEDIA_BASE;

if (R2_BASE_URL) {
  Object.keys(portfolioData).forEach((key) => {
    portfolioData[key].forEach((item) => {
      if (item.src && !item.src.startsWith(R2_BASE_URL)) item.src = R2_BASE_URL + item.src;
    });
  });
}

// The Android shell's tabs.js renders at module-load (before this prefix
// runs in production), so its initial markup bakes in un-prefixed src
// values and thumbs 404 on R2-hosted deploys. Re-render now that paths
// are correct.
if (typeof window !== 'undefined' && typeof window.androidRenderAll === 'function') {
  window.androidRenderAll();
}

// Kick off the live portfolio sync — picks up R2 uploads without rebuild.
// Fails silently if /api/portfolio isn't reachable (e.g. local dev or the
// R2 binding isn't configured yet); baked data.js stays as fallback.
bootstrapPortfolioSync(R2_BASE_URL);
