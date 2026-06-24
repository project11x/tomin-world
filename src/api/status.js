// Cloudflare Pages Function — admin status proxy.
// Path: /api/status (PUT)
//
// Auth: validates the CF_Authorization JWT cookie issued by Cloudflare Access
// directly against the team's JWKS. We do NOT trust the
// Cf-Access-Authenticated-User-Email header — any client that can reach the
// Worker outside Access (e.g. the workers.dev preview URL, or a path Access
// doesn't cover) could spoof it and impersonate any allowlisted email.
//
// Required Pages env vars:
//   GH_TOKEN              GitHub fine-grained PAT with contents:write
//   GH_REPO               e.g. "project11x/tomin-world"
//   ADMIN_EMAILS          comma-separated allowlist
//   CF_ACCESS_TEAM_DOMAIN e.g. "shouli-admin.cloudflareaccess.com"
//   CF_ACCESS_AUD         the Access application AUD tag

import { authenticate, isAdmin } from './access.js';

export async function onRequestPut(context) {
  const { request, env } = context;

  const email = await authenticate(request, env);
  if (!email) return json({ error: 'unauthenticated' }, 401);
  if (!isAdmin(email, env)) return json({ error: 'forbidden', email }, 403);

  if (!env.GH_TOKEN) return json({ error: 'GH_TOKEN not configured' }, 500);
  if (!env.GH_REPO) return json({ error: 'GH_REPO not configured' }, 500);

  let newStatus;
  try {
    newStatus = await request.json();
  } catch {
    return json({ error: 'invalid JSON body' }, 400);
  }
  const required = ['rightNow', 'vibe', 'workingOn', 'availableDoing', 'availableVibes'];
  for (const k of required) {
    if (!(k in newStatus)) return json({ error: `missing field: ${k}` }, 400);
  }

  const fileUrl = `https://api.github.com/repos/${env.GH_REPO}/contents/public/status.json`;
  const ghHeaders = {
    Authorization: `token ${env.GH_TOKEN}`,
    'User-Agent': 'tomin-world-admin-proxy',
    Accept: 'application/vnd.github+json',
  };

  const getResp = await fetch(fileUrl, { headers: ghHeaders });
  if (!getResp.ok) {
    return json({ error: 'GitHub GET failed', status: getResp.status }, 502);
  }
  const fileData = await getResp.json();

  const body = {
    // Don't leak the admin's email into the public commit history.
    message: 'chore(status): update via admin panel',
    content: btoa(unescape(encodeURIComponent(JSON.stringify(newStatus, null, 2)))),
    sha: fileData.sha,
  };
  const putResp = await fetch(fileUrl, {
    method: 'PUT',
    headers: { ...ghHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!putResp.ok) {
    const err = await putResp.json().catch(() => ({}));
    return json({ error: 'GitHub PUT failed', detail: err }, 502);
  }

  return json({ ok: true });
}

export async function onRequest(context) {
  if (context.request.method === 'PUT') return onRequestPut(context);
  return json({ error: 'method not allowed' }, 405);
}

// Auth (Cloudflare Access JWT verification + admin allowlist) lives in
// ./access.js — shared with /api/pin and /api/vote so all admin gates use
// the same verified path.

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
