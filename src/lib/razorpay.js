// Razorpay, per ground. Each owner connects their own Razorpay account, so money goes
// straight to them. We create an order, open Razorpay Checkout in the browser, then
// confirm the booking only after checking the payment with Razorpay's API.
import { HttpError, bitsOf } from './util.js';

const API = 'https://api.razorpay.com/v1';

// ---------- secret encryption (AES-GCM, key = SHA-256 of the SECRETS_KEY Worker secret) ----------
async function aesKey(env) {
  if (!env.SECRETS_KEY || String(env.SECRETS_KEY).length < 16) {
    throw new HttpError(500, 'Razorpay can\'t be connected yet: the SECRETS_KEY setting is missing on the server. See the README, "Razorpay setup".', 'no_secrets_key');
  }
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(env.SECRETS_KEY)));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
const b64 = (u8) => btoa(String.fromCharCode(...new Uint8Array(u8)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function encryptSecret(env, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(env), new TextEncoder().encode(text));
  return `v1:${b64(iv)}:${b64(ct)}`;
}

export async function decryptSecret(env, stored) {
  const [v, iv, ct] = String(stored || '').split(':');
  if (v !== 'v1') throw new HttpError(500, 'Razorpay keys are damaged. Please connect Razorpay again in Settings.', 'bad_secret');
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await aesKey(env), unb64(ct));
    return new TextDecoder().decode(pt);
  } catch {
    throw new HttpError(500, 'Razorpay keys can\'t be read (was SECRETS_KEY changed?). Please connect Razorpay again in Settings.', 'bad_secret');
  }
}

// ---------- API ----------
async function call(env, keyId, keySecret, method, path, body) {
  const doFetch = env.RZP_FETCH || fetch; // tests inject a fake Razorpay here
  let res;
  try {
    res = await doFetch(API + path, {
      method,
      headers: {
        authorization: 'Basic ' + btoa(`${keyId}:${keySecret}`),
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new HttpError(502, 'Could not reach Razorpay. Please try again.', 'rzp_network');
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw new HttpError(400, 'Razorpay did not accept these keys. Check the Key ID and Key Secret.', 'rzp_auth');
  if (!res.ok) {
    const msg = (data.error && data.error.description) || `Razorpay error (${res.status})`;
    throw new HttpError(502, msg, 'rzp_error');
  }
  return data;
}

export const keyMode = (keyId) => (String(keyId).startsWith('rzp_live_') ? 'live' : String(keyId).startsWith('rzp_test_') ? 'test' : null);

// Used when the owner saves keys: a cheap authenticated call proves the pair works.
export async function checkKeys(env, keyId, keySecret) {
  await call(env, keyId, keySecret, 'GET', '/payments?count=1');
}

export async function groundKeys(env, ground) {
  if (!ground.rzp_enabled || !ground.rzp_key_id || !ground.rzp_key_secret_enc) return null;
  return { keyId: ground.rzp_key_id, keySecret: await decryptSecret(env, ground.rzp_key_secret_enc) };
}

export async function createOrder(env, keys, booking) {
  return call(env, keys.keyId, keys.keySecret, 'POST', '/orders', {
    amount: booking.amount * 100,
    currency: 'INR',
    receipt: booking.ref,
    notes: { booking: booking.ref },
  });
}

async function hmacHex(secret, text) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export async function signatureOk(keys, orderId, paymentId, signature) {
  const want = await hmacHex(keys.keySecret, `${orderId}|${paymentId}`);
  const got = String(signature || '');
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}

// Returns a captured payment for this order with the right amount, or null.
// Authorised-but-not-captured payments are captured here (otherwise Razorpay refunds them).
export async function paidPayment(env, keys, booking, paymentId) {
  const items = paymentId
    ? [await call(env, keys.keyId, keys.keySecret, 'GET', `/payments/${encodeURIComponent(paymentId)}`)]
    : (await call(env, keys.keyId, keys.keySecret, 'GET', `/orders/${encodeURIComponent(booking.rzp_order_id)}/payments`)).items || [];
  for (let p of items) {
    if (p.order_id !== booking.rzp_order_id || p.amount !== booking.amount * 100 || p.currency !== 'INR') continue;
    if (p.status === 'authorized') {
      p = await call(env, keys.keyId, keys.keySecret, 'POST', `/payments/${encodeURIComponent(p.id)}/capture`, { amount: p.amount, currency: 'INR' });
    }
    if (p.status === 'captured') return p;
  }
  return null;
}

// Mark a booking paid online. If its hold had already run out, try to take the slot back;
// if someone else has it now, flag the booking so the owner refunds the customer.
export async function markPaidOnline(db, booking, payment) {
  const now = Date.now();
  if (booking.status === 'CONFIRMED' && booking.rzp_payment_id) return 'confirmed';
  if (['HOLD', 'PENDING', 'CONFIRMED'].includes(booking.status)) {
    await db
      .prepare(`UPDATE bookings SET status = 'CONFIRMED', paid_via = 'razorpay', rzp_payment_id = ?, decided_at = ? WHERE id = ?`)
      .bind(payment.id, now, booking.id)
      .run();
    return 'confirmed';
  }
  // EXPIRED / CANCELLED: re-lock the cells and confirm in one transaction.
  try {
    await db.batch([
      ...bitsOf(booking.mask).map((cell) =>
        db.prepare('INSERT INTO slot_locks (ground_id, date, hour, cell, booking_token) VALUES (?,?,?,?,?)')
          .bind(booking.ground_id, booking.date, booking.start_hour, cell, booking.token)
      ),
      db.prepare(`UPDATE bookings SET status = 'CONFIRMED', paid_via = 'razorpay', rzp_payment_id = ?, decided_at = ? WHERE id = ?`)
        .bind(payment.id, now, booking.id),
    ]);
    return 'confirmed';
  } catch (e) {
    if (!/UNIQUE|constraint/i.test(String(e && e.message))) throw e;
    await db
      .prepare(`UPDATE bookings SET paid_via = 'razorpay', rzp_payment_id = ?, refund_needed = 1, note = 'Paid after the slot was released — refund needed' WHERE id = ?`)
      .bind(payment.id, booking.id)
      .run();
    return 'refund_needed';
  }
}

// Check Razorpay for a booking that has an order but no recorded payment (customer closed
// the page after paying, or the network dropped). Safe to call repeatedly.
export async function reconcile(env, booking, ground) {
  if (!booking.rzp_order_id || booking.rzp_payment_id) return null;
  const keys = await groundKeys(env, ground).catch(() => null);
  if (!keys) return null;
  const p = await paidPayment(env, keys, booking).catch(() => null);
  return p ? markPaidOnline(env.DB, booking, p) : null;
}

// Cron: reconcile recent unpaid online orders, before holds are expired.
export async function reconcileRecent(env) {
  const { results } = await env.DB
    .prepare(
      `SELECT b.*, g.rzp_enabled, g.rzp_key_id, g.rzp_key_secret_enc FROM bookings b JOIN grounds g ON g.id = b.ground_id
        WHERE b.rzp_order_id IS NOT NULL AND b.rzp_payment_id IS NULL AND b.status IN ('HOLD','EXPIRED','CANCELLED')
          AND b.created_at > ? LIMIT 50`
    )
    .bind(Date.now() - 6 * 3600 * 1000)
    .all();
  for (const row of results) {
    await reconcile(env, row, row).catch((e) => console.error('reconcile', row.ref, e && e.message));
  }
}

// For the GoArena admin page: the owner's latest Razorpay payments, straight from Razorpay.
export async function listPayments(env, keys, count = 25) {
  const data = await call(env, keys.keyId, keys.keySecret, 'GET', `/payments?count=${Math.min(Math.max(count, 1), 100)}`);
  return data.items || [];
}
