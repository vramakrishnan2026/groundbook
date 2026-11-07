// A stand-in for Google: makes its own RSA key, serves it as JWKS, and signs ID tokens.
let n = 0;
const enc = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');

export async function fakeGoogle(clientId = 'test-client.apps.googleusercontent.com') {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const kid = `k${++n}-${Date.now()}`; // unique per instance, like Google's rotating keys
  const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid, alg: 'RS256', use: 'sig' };
  const other = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const token = async ({ sub = 'g-111', email = 'owner@gmail.com', name = 'Rajesh', aud = clientId, exp = Date.now() / 1000 + 3600, iss = 'https://accounts.google.com', forge = false } = {}) => {
    const head = enc({ alg: 'RS256', kid, typ: 'JWT' });
    const body = enc({ iss, aud, sub, email, email_verified: true, name, exp: Math.floor(exp), iat: Math.floor(Date.now() / 1000) });
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', (forge ? other : pair).privateKey, new TextEncoder().encode(`${head}.${body}`));
    return `${head}.${body}.${Buffer.from(sig).toString('base64url')}`;
  };
  const fetch = async () => new Response(JSON.stringify({ keys: [jwk] }), { headers: { 'content-type': 'application/json' } });
  return { clientId, token, fetch };
}
