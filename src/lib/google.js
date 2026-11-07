// Checks a "Sign in with Google" ID token (a JWT signed by Google) without any SDK.
// Google's public keys are fetched from its JWKS endpoint and cached for an hour.
import { HttpError } from './util.js';

const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
let cache = { at: 0, keys: [] };

const b64urlBytes = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const b64urlJson = (s) => JSON.parse(new TextDecoder().decode(b64urlBytes(s)));

async function keys(env, force) {
  if (!force && cache.keys.length && Date.now() - cache.at < 3600_000) return cache.keys;
  const res = await (env.GOOGLE_FETCH || fetch)(JWKS_URL);
  if (!res.ok) throw new HttpError(502, 'Could not reach Google. Try again.', 'google_down');
  cache = { at: Date.now(), keys: (await res.json()).keys || [] };
  return cache.keys;
}

export function googleEnabled(env) {
  return Boolean(env.GOOGLE_CLIENT_ID);
}

// Returns { sub, email, name } or throws 401.
export async function verifyGoogle(env, credential) {
  if (!googleEnabled(env)) throw new HttpError(400, 'Google sign-in is not set up yet', 'google_off');
  const fail = () => new HttpError(401, 'Google sign-in failed. Please try again.', 'google_bad');
  const parts = String(credential || '').split('.');
  if (parts.length !== 3) throw fail();
  let header, claims;
  try {
    header = b64urlJson(parts[0]);
    claims = b64urlJson(parts[1]);
  } catch {
    throw fail();
  }
  if (header.alg !== 'RS256') throw fail();
  let jwk = (await keys(env)).find((k) => k.kid === header.kid);
  if (!jwk) jwk = (await keys(env, true)).find((k) => k.kid === header.kid); // Google rotated its keys
  if (!jwk) throw fail();
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  const now = Date.now() / 1000;
  if (
    !ok ||
    !['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss) ||
    claims.aud !== env.GOOGLE_CLIENT_ID ||
    !(claims.exp > now - 60) ||
    !claims.sub ||
    claims.email_verified === false ||
    claims.email_verified === 'false'
  ) throw fail();
  return { sub: String(claims.sub), email: String(claims.email || '').toLowerCase(), name: String(claims.name || '') };
}

export function isAdminEmail(env, email) {
  const list = String(env.ADMIN_EMAILS || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
  return Boolean(email) && list.includes(String(email).toLowerCase());
}
