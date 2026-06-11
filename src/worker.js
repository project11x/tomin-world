// Workers entrypoint. Routes /api/* to per-endpoint modules and falls
// through to the Static Assets binding for everything else.
//
// The /api modules keep the Pages-style `onRequest(context)` signature
// so the source still reads like the original functions/ tree — the
// only translation is here.

import { onRequest as portfolioOnRequest } from './api/portfolio.js';
import { onRequest as statusOnRequest } from './api/status.js';
import { onRequest as commitsOnRequest } from './api/commits.js';
import { onRequest as dailyFrameOnRequest } from './api/daily-frame.js';
import { onRequest as pinboardOnRequest } from './api/pinboard.js';
import { onRequest as pinOnRequest } from './api/pin.js';
import { onRequest as voteOnRequest } from './api/vote.js';
import { onRequest as passportOnRequest } from './api/passport.js';

const ROUTES = {
  '/api/portfolio': portfolioOnRequest,
  '/api/status': statusOnRequest,
  '/api/commits': commitsOnRequest,
  '/api/daily-frame': dailyFrameOnRequest,
  '/api/pinboard': pinboardOnRequest,
  '/api/pin': pinOnRequest,
  '/api/vote': voteOnRequest,
  '/api/passport': passportOnRequest,
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const handler = ROUTES[url.pathname];
    if (handler) {
      // Mimic the Pages Functions `context` object enough for our handlers.
      return handler({
        request,
        env,
        waitUntil: ctx.waitUntil.bind(ctx),
        passThroughOnException: ctx.passThroughOnException.bind(ctx),
      });
    }
    // Static asset (handles SPA fallback per wrangler.toml's
    // not_found_handling = "single-page-application").
    const response = await env.ASSETS.fetch(request);

    // Long-cache media assets. Filenames are versioned via ?v=<mtime> in
    // data.js (see sync.cjs), so replacing a file produces a new URL —
    // safe to mark as immutable. _headers can't pattern-match by
    // extension across nested paths, hence doing it here.
    if (/\.(mp4|webm|mov|jpe?g|png|webp|gif|avif|svg)$/i.test(url.pathname)
        && response.status === 200) {
      const headers = new Headers(response.headers);
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    }
    return response;
  },
};
