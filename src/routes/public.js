// Customer-facing API: no login. A booking is reached through its secret token.
import {
  ACTIVE, MAX_DUR, MIN_DUR, availability, bookableDates, checkSpan, closeBooking, groundById, groundBySlug,
  insertBooking, isPastStart, priceFor, priceForDur, publicBooking, sweepExpired, unitsWithPrices,
} from '../lib/bookings.js';
import { files, MAX_FILE_BYTES } from '../lib/files.js';
import { createOrder, groundKeys, markPaidOnline, paidPayment, reconcile, signatureOk } from '../lib/razorpay.js';
import { countVisit } from '../lib/tracking.js';
import { cancelWithRefund, customerCanCancel } from '../lib/refunds.js';
import { HttpError, bad, cleanName, cleanPhone, cleanUtr, dayType, int, isDate, json, readJson } from '../lib/util.js';

const MAX_HOLDS_PER_PHONE = 2;
const MAX_HOLDS_PER_IP = 4;

export async function photoUrls(db, groundId) {
  const { results } = await db
    .prepare('SELECT id FROM photos WHERE ground_id = ? ORDER BY sort, id')
    .bind(groundId)
    .all();
  return results.map((p) => ({ id: p.id, url: `/api/files/photo/${p.id}` }));
}

export function groundPublic(g) {
  return {
    slug: g.slug,
    name: g.name,
    area: g.area,
    mapsUrl: g.maps_url,
    about: g.about,
    whatsapp: g.whatsapp,
    facilities: JSON.parse(g.facilities || '[]'),
    openHour: g.open_hour,
    closeHour: g.close_hour,
    holdMinutes: g.hold_minutes,
    cancelHours: g.cancel_hours,
    stepMin: g.step_min || 60,
    minDur: MIN_DUR,
    maxDur: MAX_DUR,
    open: !!g.approved && g.service === 'active',
    demo: !!g.is_demo,
    closedNote: g.service === 'active' ? '' : 'Online booking is paused right now.',
  };
}

export async function getGround(env, slug) {
  const g = await groundBySlug(env.DB, slug);
  await countVisit(env.DB, g.id, 'views');
  const units = await unitsWithPrices(env.DB, g.id);
  const dates = bookableDates(g).map((d) => ({ date: d, dayType: dayType(d) }));
  return json({
    ground: groundPublic(g),
    photos: await photoUrls(env.DB, g.id),
    units: units.map(({ id, code, name, subtitle, weekday, weekend }) => ({ id, code, name, subtitle, weekday, weekend })),
    dates,
  });
}

export async function getSlots(env, slug, url) {
  const g = await groundBySlug(env.DB, slug);
  const date = url.searchParams.get('date');
  if (!isDate(date) || !bookableDates(g).includes(date)) throw bad('That date is not open for booking');
  await countVisit(env.DB, g.id, 'slot_views');
  await sweepExpired(env.DB);
  const units = await unitsWithPrices(env.DB, g.id);
  return json({
    date,
    dayType: dayType(date),
    prices: Object.fromEntries(units.map((u) => [u.id, priceFor(u, date)])),
    step: g.step_min || 60,
    minDur: MIN_DUR,
    maxDur: MAX_DUR,
    ...(await availability(env.DB, g, units, date)),
  });
}

export async function createHold(env, slug, request) {
  const db = env.DB;
  const g = await groundBySlug(db, slug);
  if (!g.approved || g.service !== 'active') throw new HttpError(403, "This ground isn't taking online bookings right now. Please call the ground.", 'not_open');
  const body = await readJson(request);
  const name = cleanName(body.name);
  const phone = cleanPhone(body.phone);
  const date = String(body.date || '');
  // `start` and `dur` are minutes; older pages send `hour` for a 1-hour booking.
  const start = body.start !== undefined ? int(body.start, 'time') : int(body.hour, 'hour') * 60;
  const dur = body.dur !== undefined ? int(body.dur, 'length') : MIN_DUR;
  const unitId = int(body.unitId, 'court');
  if (!bookableDates(g).includes(date)) throw bad('That date is not open for booking');
  checkSpan(g, start, dur);
  if (isPastStart(g, date, start)) throw bad('That time has already started');
  const units = await unitsWithPrices(db, g.id);
  const unit = units.find((u) => u.id === unitId);
  if (!unit) throw bad('Please pick a court');

  await sweepExpired(db);
  const ip = request.headers.get('cf-connecting-ip') || '';
  const limits = await db
    .prepare(
      `SELECT SUM(phone = ?) AS by_phone, SUM(ip = ? AND ? <> '') AS by_ip
         FROM bookings WHERE ground_id = ? AND status = 'HOLD'`
    )
    .bind(phone, ip, ip, g.id)
    .first();
  if ((limits.by_phone || 0) >= MAX_HOLDS_PER_PHONE) {
    throw new HttpError(429, 'You already have slots waiting for payment. Finish or cancel those first.', 'too_many_holds');
  }
  if ((limits.by_ip || 0) >= MAX_HOLDS_PER_IP) {
    throw new HttpError(429, 'Too many slots on hold from this phone. Please try again later.', 'too_many_holds');
  }

  const now = Date.now();
  const { token } = await insertBooking(db, {
    groundId: g.id, unitId: unit.id, date, start, dur, mask: unit.mask, kind: 'customer', status: 'HOLD',
    name, phone, amount: priceForDur(priceFor(unit, date), dur), ip, holdExpiresAt: now + g.hold_minutes * 60000, now,
  });
  return json({ token }, 201);
}

async function bookingByToken(db, token) {
  const b = await db.prepare('SELECT * FROM bookings WHERE token = ?').bind(String(token)).first();
  if (!b || b.kind !== 'customer') throw new HttpError(404, 'Booking not found', 'not_found');
  return b;
}

export async function getBooking(env, token, extra = {}) {
  const db = env.DB;
  let b = await bookingByToken(db, token);
  let g = await db.prepare('SELECT * FROM grounds WHERE id = ?').bind(b.ground_id).first();
  // Paid online but the page was closed before we heard back? Ask Razorpay before expiring holds.
  if (b.rzp_order_id && !b.rzp_payment_id && (await reconcile(env, b, g))) b = await bookingByToken(db, token);
  await sweepExpired(db);
  b = await bookingByToken(db, token);
  const units = await unitsWithPrices(db, g.id);
  return json({
    booking: { ...publicBooking(b, units), serverNow: Date.now(), hasProof: !!b.proof_key, canCancel: customerCanCancel(b, g) },
    policy: { cancelHours: g.cancel_hours },
    ground: groundPublic(g),
    payment: {
      upiId: g.upi_id,
      upiName: g.upi_name || g.name,
      qrUrl: g.upi_qr_key ? `/api/files/qr/${g.slug}` : null,
      razorpay: !!(g.rzp_enabled && g.rzp_key_id && g.rzp_key_secret_enc),
    },
    ...extra,
  });
}

// Razorpay step 1: create (or reuse) an order for this booking.
export async function razorpayOrder(env, token) {
  const db = env.DB;
  await sweepExpired(db);
  const b = await bookingByToken(db, token);
  if (b.status !== 'HOLD') throw new HttpError(409, b.status === 'EXPIRED' ? 'Time ran out and the slot was released. Please book again.' : 'This booking is not waiting for payment.', 'not_hold');
  const g = await db.prepare('SELECT * FROM grounds WHERE id = ?').bind(b.ground_id).first();
  const keys = await groundKeys(env, g);
  if (!keys) throw bad('Online payment is not set up for this ground. Please pay by UPI.');
  let orderId = b.rzp_order_id;
  if (!orderId) {
    orderId = (await createOrder(env, keys, b)).id;
    // Give the customer time to finish paying in Razorpay before the hold can run out.
    const holdUntil = Math.max(b.hold_expires_at || 0, Date.now() + 15 * 60000);
    await db.prepare('UPDATE bookings SET rzp_order_id = ?, hold_expires_at = ? WHERE id = ? AND status = ?').bind(orderId, holdUntil, b.id, 'HOLD').run();
  }
  const units = await unitsWithPrices(db, g.id);
  const u = units.find((x) => x.id === b.unit_id);
  return json({
    keyId: keys.keyId,
    orderId,
    amount: b.amount * 100,
    currency: 'INR',
    name: g.name,
    description: `${u ? u.name : 'Booking'} · ${b.date} · ${b.ref}`,
    prefill: { name: b.customer_name, contact: b.phone ? '+91' + b.phone : '' },
  });
}

// Razorpay step 2: the browser hands back the payment; we check the signature AND ask Razorpay.
export async function razorpayVerify(env, token, request) {
  const db = env.DB;
  const body = await readJson(request);
  const b = await bookingByToken(db, token);
  if (!b.rzp_order_id || body.razorpay_order_id !== b.rzp_order_id) throw bad('Payment does not match this booking');
  const g = await db.prepare('SELECT * FROM grounds WHERE id = ?').bind(b.ground_id).first();
  const keys = await groundKeys(env, g);
  if (!keys) throw bad('Online payment is not set up for this ground.');
  if (!(await signatureOk(keys, b.rzp_order_id, body.razorpay_payment_id, body.razorpay_signature))) {
    throw bad('Could not verify this payment. If money was taken, contact the ground.', 'rzp_signature');
  }
  const p = await paidPayment(env, keys, b, body.razorpay_payment_id);
  if (!p) throw new HttpError(409, 'Razorpay has not confirmed this payment yet. Refresh this page in a minute.', 'rzp_not_captured');
  const outcome = await markPaidOnline(db, b, p);
  return getBooking(env, token, { outcome });
}

export async function submitProof(env, token, request) {
  const db = env.DB;
  await sweepExpired(db);
  const b = await bookingByToken(db, token);
  if (b.status === 'EXPIRED') throw new HttpError(409, 'Time ran out and the slot was released. Please book again.', 'expired');
  if (b.status !== 'HOLD') throw new HttpError(409, 'Payment proof was already sent for this booking.', 'not_hold');

  const form = await request.formData().catch(() => {
    throw bad('Could not read the upload');
  });
  const utr = cleanUtr(form.get('utr'));
  const reused = await db
    .prepare(`SELECT 1 FROM bookings WHERE ground_id = ? AND utr = ? AND status IN ('PENDING','CONFIRMED') LIMIT 1`)
    .bind(b.ground_id, utr)
    .first();
  if (reused) throw bad('This UPI reference number was already used for another booking.', 'utr');

  let proofKey = null;
  const file = form.get('screenshot');
  if (file && typeof file === 'object' && file.size > 0) {
    if (!/^image\//.test(file.type || '')) throw bad('Please upload an image of the payment', 'screenshot');
    if (file.size > MAX_FILE_BYTES) throw bad('That image is too large. Please try again.', 'screenshot');
    proofKey = `proofs/${b.ground_id}/${b.token}`;
    await files(env).put(proofKey, await file.arrayBuffer(), { contentType: file.type });
  }
  const res = await db
    .prepare(
      `UPDATE bookings SET status = 'PENDING', utr = ?, proof_key = ?, proof_at = ?
        WHERE id = ? AND status = 'HOLD' AND hold_expires_at >= ?`
    )
    .bind(utr, proofKey, Date.now(), b.id, Date.now())
    .run();
  if (!res.meta.changes) throw new HttpError(409, 'Time ran out and the slot was released. Please book again.', 'expired');
  return getBooking(env, token);
}

export async function cancelByCustomer(env, token) {
  const b = await bookingByToken(env.DB, token);
  if (b.status === 'CONFIRMED') {
    // Paid online and still inside the free-cancellation window → cancel and refund in full, automatically.
    const g = await groundById(env.DB, b.ground_id);
    if (!customerCanCancel(b, g)) {
      throw new HttpError(409, g.cancel_hours && b.paid_via === 'razorpay'
        ? `Free cancellation ends ${g.cancel_hours} hours before the slot. Please contact the ground.`
        : 'Please contact the ground to cancel this booking.', 'cannot_cancel');
    }
    await cancelWithRefund(env, b, g, { refund: 'full', note: 'Cancelled by customer' });
    return getBooking(env, token);
  }
  const changed = await closeBooking(env.DB, b.id, 'CANCELLED', ['HOLD'], { note: 'Cancelled by customer' });
  if (!changed) throw new HttpError(409, 'Only a booking waiting for payment can be cancelled here. Please contact the ground.', 'cannot_cancel');
  return getBooking(env, token);
}

export async function servePhoto(env, id) {
  const p = await env.DB.prepare('SELECT r2_key FROM photos WHERE id = ?').bind(int(id, 'photo')).first();
  if (!p) throw new HttpError(404, 'Not found');
  return serveObject(env, p.r2_key, 'public, max-age=86400');
}

export async function serveQr(env, slug) {
  const g = await groundBySlug(env.DB, slug);
  if (!g.upi_qr_key) throw new HttpError(404, 'Not found');
  return serveObject(env, g.upi_qr_key, 'public, max-age=300');
}

export async function serveObject(env, key, cache) {
  const obj = await files(env).get(key);
  if (!obj) throw new HttpError(404, 'Not found');
  return new Response(obj.body, {
    headers: {
      'content-type': obj.contentType || 'application/octet-stream',
      'cache-control': cache,
      'x-content-type-options': 'nosniff',
    },
  });
}

export { ACTIVE };
