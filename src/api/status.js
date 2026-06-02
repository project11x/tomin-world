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

export async function onRequestPut(context) {
  const { request, env } = context;

  const email = await authenticate(request, env);
  if (!email) return json({ error: 'unauthenticated' }, 401);

  const allow = (env.ADMIN_EMAILS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!allow.includes(email)) return json({ error: 'forbidden', email }, 403);

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

// ─────────────────────────────────────────────────────────────────────────
// Auth helpers — verify the Cloudflare Access JWT directly.
// ─────────────────────────────────────────────────────────────────────────

async function authenticate(request, env) {
  // Always verify the JWT cookie directly against the team's JWKS. The
  // Cf-Access-Authenticated-User-Email header is intentionally ignored —
  // any client that bypasses Access can forge it.
  if (!env.CF_ACCESS_TEAM_DOMAIN || !env.CF_ACCESS_AUD) return null;

  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/CF_Authorization=([^;]+)/);
  if (!match) return null;
  const token = match[1];

  try {
    const payload = await verifyJwt(token, env.CF_ACCESS_TEAM_DOMAIN, env.CF_ACCESS_AUD);
    return payload?.email || null;
  } catch {
    return null;
  }
}

async function verifyJwt(token, teamDomain, expectedAud) {
  const [headerB64, payloadB64, sigB64] = token.split('.');
  if (!headerB64 || !payloadB64 || !sigB64) throw new Error('malformed jwt');

  const header = JSON.parse(b64urlDecodeToString(headerB64));
  const payload = JSON.parse(b64urlDecodeToString(payloadB64));

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && now >= payload.exp) throw new Error('expired');
  if (payload.nbf && now < payload.nbf) throw new Error('not yet valid');
  if (payload.iss !== `https://${teamDomain}`) throw new Error('bad issuer');
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!auds.includes(expectedAud)) throw new Error('bad audience');

  const jwks = await fetchJwks(teamDomain);
  const jwk = jwks.keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('unknown kid');

  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = b64urlDecodeToBytes(sigB64);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, data);
  if (!ok) throw new Error('bad signature');

  return payload;
}

let jwksCache = { domain: '', expires: 0, value: null };
async function fetchJwks(teamDomain) {
  const now = Date.now();
  if (jwksCache.value && jwksCache.domain === teamDomain && jwksCache.expires > now) {
    return jwksCache.value;
  }
  const resp = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!resp.ok) throw new Error('jwks fetch failed');
  const value = await resp.json();
  jwksCache = { domain: teamDomain, expires: now + 10 * 60 * 1000, value };
  return value;
}

function b64urlDecodeToString(s) {
  return new TextDecoder().decode(b64urlDecodeToBytes(s));
}
function b64urlDecodeToBytes(s) {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
