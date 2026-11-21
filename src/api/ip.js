// Shared client-IP fingerprint for rate limits (pins, votes, passport).
//
// A plain SHA-256 of an IPv4 address is reversible: all ~4.3 billion
// addresses can be hashed in minutes, so the stored value would still be
// the IP (personal data under GDPR). Keyed with a Worker secret (HMAC), the
// hash can't be brute-forced without the key.
//
// Set the key once:  npx wrangler secret put IP_HASH_SECRET
// (any long random string, e.g. `openssl rand -hex 32`). Without it — e.g.
// in `wrangler dev` — this falls back to the unkeyed hash so rate limits
// keep working.

export function clientIp(request) {
  return (
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    '0.0.0.0'
  );
}

export async function ipHash(request, env) {
  const data = new TextEncoder().encode(clientIp(request));
  const secret = env?.IP_HASH_SECRET;
  if (!secret) return toHex(await crypto.subtle.digest('SHA-256', data));
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return toHex(await crypto.subtle.sign('HMAC', key, data));
}

function toHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
