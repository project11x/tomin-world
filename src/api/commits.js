// Cached commits proxy — path: /api/commits
//
// Why: the changelog widget used to hit api.github.com directly from every
// browser. GitHub's unauthenticated limit is 60 req/h per IP, which the widget
// burned through fast (polls every 5 min × multiple tabs × shared IPs). When
// the limit hit, the fetch silently failed and the widget froze on its baked
// fallback (weeks-stale data with no visible error).
//
// Now: all browsers hit this Worker instead. The Worker holds one cached
// GitHub response at the edge for 60 s, so GitHub sees ≤ 60 req/h total
// across all visitors. If GH_TOKEN is set as a Worker secret, the proxied
// request uses it (5000 req/h) — but caching alone is enough.

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'GET') {
    return json({ error: 'method not allowed' }, 405);
  }

  const repo = env.GH_REPO || 'project11x/tomin-world';
  const perPage = 30;
  const upstream = `https://api.github.com/repos/${repo}/commits?per_page=${perPage}`;

  // Edge cache key — bound to the upstream URL, ignores client query strings.
  const cacheKey = new Request(upstream, { method: 'GET' });
  const cache = caches.default;

  let cached = await cache.match(cacheKey);
  if (cached) return cached;

  const ghHeaders = {
    'User-Agent': 'tomin-world-commits-proxy',
    Accept: 'application/vnd.github+json',
  };
  if (env.GH_TOKEN) ghHeaders.Authorization = `token ${env.GH_TOKEN}`;

  const ghResp = await fetch(upstream, { headers: ghHeaders });
  if (!ghResp.ok) {
    // Don't cache failures — we want the next request to retry GitHub.
    return json(
      { error: 'github upstream failed', status: ghResp.status },
      502,
    );
  }
  const data = await ghResp.json();

  // Normalise to the shape changelog.js wants. Keeps the response small
  // (full GitHub commit payloads are ~3 KB each, we send ~150 B each).
  const slim = (Array.isArray(data) ? data : []).map((c) => ({
    sha: c.sha,
    msg: (c.commit && c.commit.message) || '',
    date:
      (c.commit && c.commit.author && c.commit.author.date) ||
      (c.commit && c.commit.committer && c.commit.committer.date) ||
      null,
  }));

  const response = new Response(JSON.stringify(slim), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      // 60 s edge cache → at most 60 GitHub requests/hour from this Worker,
      // regardless of how many browsers are polling.
      'Cache-Control': 'public, max-age=60, s-maxage=60',
    },
  });

  context.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
