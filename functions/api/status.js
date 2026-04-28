// Cloudflare Pages Function — admin status proxy.
// Path: /api/status (PUT)
//
// Why this exists:
//   The previous flow shipped a GitHub PAT to the browser via localStorage.
//   Even with Cloudflare Access protecting /admin.html, any future XSS would
//   leak the token. This proxy keeps the PAT server-side as a Pages secret,
//   while the browser only ever sees its Access cookie.
//
// Trust model:
//   Cloudflare Access sits in front of /api/status (configured in the Access
//   dashboard the same way as /admin.html). When a request reaches this
//   function it has already been authenticated. We additionally check the
//   `Cf-Access-Authenticated-User-Email` header against ADMIN_EMAILS so a
//   misconfigured Access policy can't grant unintended write access.
//
// Required Pages env vars (set in dashboard → Settings → Environment variables):
//   GH_TOKEN       GitHub fine-grained PAT with contents:write on the repo
//   GH_REPO        e.g. "project11x/tomin-world"
//   ADMIN_EMAILS   comma-separated allowlist, e.g. "ed.wut@icloud.com"
//
// Methods:
//   PUT /api/status — body is the new status JSON; we commit it to
//                     public/status.json on the configured repo.

export async function onRequestPut(context) {
  const { request, env } = context;

  // 1. Auth: trust Cloudflare Access, but verify the email is in our allowlist.
  const email = request.headers.get('Cf-Access-Authenticated-User-Email');
  if (!email) return json({ error: 'unauthenticated' }, 401);

  const allow = (env.ADMIN_EMAILS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!allow.includes(email)) return json({ error: 'forbidden', email }, 403);

  // 2. Validate config.
  if (!env.GH_TOKEN) return json({ error: 'GH_TOKEN not configured' }, 500);
  if (!env.GH_REPO) return json({ error: 'GH_REPO not configured' }, 500);

  // 3. Validate body shape — minimal, just enough to refuse obvious garbage.
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

  // 4. Read current file SHA from GitHub.
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

  // 5. Commit the update.
  const body = {
    message: `chore(status): update via admin (${email})`,
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

// Reject everything that isn't PUT.
export async function onRequest(context) {
  if (context.request.method === 'PUT') return onRequestPut(context);
  return json({ error: 'method not allowed' }, 405);
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
