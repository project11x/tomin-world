// Shared Cloudflare Access auth for admin-gated API actions.
//
// Verifies the CF_Authorization JWT cookie that Cloudflare Access issues,
// directly against the team's JWKS (RS256 signature + iss + aud + exp). We
// deliberately ignore the injected `cf-access-jwt-assertion` and
// `Cf-Access-Authenticated-User-Email` headers: any client that reaches the
// Worker outside an Access policy (these API routes are public so visitors
// can read/write the pinboard + votes) can forge those headers. The cookie,
// by contrast, is a signed token we can verify ourselves.
//
// Required env: CF_ACCESS_TEAM_DOMAIN, CF_ACCESS_AUD, ADMIN_EMAILS.

export async function authenticate(request, env) {
  if (!env.CF_ACCESS_TEAM_DOMAIN || !env.CF_ACCESS_AUD) return null;
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/CF_Authorization=([^;]+)/);
  if (!match) return null;
  try {
    const payload = await verifyJwt(match[1], env.CF_ACCESS_TEAM_DOMAIN, env.CF_ACCESS_AUD);
    return payload?.email || null;
  } catch {
    return null;
  }
}

export function isAdmin(email, env) {
  if (!email) return false;
  const allow = (env.ADMIN_EMAILS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return allow.includes(email);
}

// Convenience: returns the admin email, or null if the caller is not an
// authenticated, allowlisted admin.
export async function requireAdmin(request, env) {
  const email = await authenticate(request, env);
  return email && isAdmin(email, env) ? email : null;
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

  // Algorithm is pinned (RS256) rather than read from the header — never trust
  // header.alg, which is how "alg:none" / algorithm-confusion bypasses work.
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
