// Entry module — runs in the browser via <script type="module" src="app.js">.
// All real logic lives under ./src; this file just orchestrates load order.
//
// Load order matters because some modules attach `window.*` globals that
// later modules reference. The pattern: utilities first, then per-screen
// modules, then the central UI bindings that wire markup to handlers.

import { portfolioData } from './data.js';
import { bootstrapPortfolioSync } from './src/utils/portfolio-sync.js';
import './src/utils/video.js';
import './src/desktop/system-bar.js';
import './src/desktop/windows.js';
import './src/desktop/quick-look.js';
import './src/desktop/spaces.js';
import './src/desktop/edits-viewer.js';
import './src/ios/index.js';
import './src/ios/edge-swipe.js';
import './src/widgets/weather.js';
import './src/widgets/smart-stack.js';
import './src/widgets/portfolio-timeline.js';
import './src/desktop/ui-bindings.js';

// Prepend R2 base URL to all src values when running in production.
// Idempotent: skip items that already start with the R2 prefix.
const R2_BASE_URL =
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? ''
    : 'https://pub-859f13be44eb4577b0cb23c8d8440a59.r2.dev/';

if (R2_BASE_URL) {
  Object.keys(portfolioData).forEach((key) => {
    portfolioData[key].forEach((item) => {
      if (item.src && !item.src.startsWith(R2_BASE_URL)) item.src = R2_BASE_URL + item.src;
    });
  });
}

// Kick off the live portfolio sync — picks up R2 uploads without rebuild.
// Fails silently if /api/portfolio isn't reachable (e.g. local dev or the
// R2 binding isn't configured yet); baked data.js stays as fallback.
bootstrapPortfolioSync(R2_BASE_URL);
