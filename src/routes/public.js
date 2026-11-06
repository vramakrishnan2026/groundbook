// Customer-facing API: no login. A booking is reached through its secret token.
import {
  ACTIVE, availability, bookableDates, closeBooking, groundBySlug, hoursOf, insertBooking,
  isPastSlot, priceFor, publicBooking, sweepExpired, unitsWithPrices,
} from '../lib/bookings.js';
import { files, MAX_FILE_BYTES } from '../lib/files.js';
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
  };
}

export async function getGround(env, slug) {
  const g = await groundBySlug(env.DB, slug);
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
  await sweepExpired(env.DB);
  const units = await unitsWithPrices(env.DB, g.id);
  return json({
    date,
    dayType: dayType(date),
    prices: Object.fromEntries(units.map((u) => [u.id, priceFor(u, date)])),
    hours: await availability(env.DB, g, units, date),
  });
}

export async function createHold(env, slug, request) {
  const db = env.DB;
  const g = await groundBySlug(db, slug);
  const body = await readJson(request);
  const name = cleanName(body.name);
  const phone = cleanPhone(body.phone);
  const date = String(body.date || '');
  const hour = int(body.hour, 'hour');
  const unitId = int(body.unitId, 'court');
  if (!bookableDates(g).includes(date)) throw bad('That date is not open for booking');
  if (!hoursOf(g).includes(hour)) throw bad('That time is outside opening hours');
  if (isPastSlot(g, date, hour)) throw bad('That time has already started');
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
    groundId: g.id, unitId: unit.id, date, hour, mask: unit.mask, kind: 'customer', status: 'HOLD',
    name, phone, amount: priceFor(unit, date), ip, holdExpiresAt: now + g.hold_minutes * 60000, now,
  });
  return json({ token }, 201);
}

async function bookingByToken(db, token) {
  const b = await db.prepare('SELECT * FROM bookings WHERE token = ?').bind(String(token)).first();
  if (!b || b.kind !== 'customer') throw new HttpError(404, 'Booking not found', 'not_found');
  return b;
}

export async function getBooking(env, token) {
  const db = env.DB;
  await sweepExpired(db);
  const b = await bookingByToken(db, token);
  const g = await db.prepare('SELECT * FROM grounds WHERE id = ?').bind(b.ground_id).first();
  const units = await unitsWithPrices(db, g.id);
  return json({
    booking: { ...publicBooking(b, units), serverNow: Date.now(), hasProof: !!b.proof_key },
    ground: groundPublic(g),
    payment: {
      upiId: g.upi_id,
      upiName: g.upi_name || g.name,
      qrUrl: g.upi_qr_key ? `/api/files/qr/${g.slug}` : null,
    },
  });
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
