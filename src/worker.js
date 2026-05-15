// Workers entrypoint. Routes /api/* to per-endpoint modules and falls
// through to the Static Assets binding for everything else.
//
// The /api modules keep the Pages-style `onRequest(context)` signature
// so the source still reads like the original functions/ tree — the
// only translation is here.

import { onRequest as portfolioOnRequest } from './api/portfolio.js';
import { onRequest as statusOnRequest } from './api/status.js';

const ROUTES = {
  '/api/portfolio': portfolioOnRequest,
  '/api/status': statusOnRequest,
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
    return env.ASSETS.fetch(request);
  },
};
