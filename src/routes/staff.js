// Owner and helper API. Every handler receives the logged-in staff member `me`.
import {
  closeBooking, groundById, hoursOf, insertBooking, publicBooking, sweepExpired, unitsWithPrices,
} from '../lib/bookings.js';
import {
  HttpError, addDays, bad, cleanName, cleanPhone, cleanPin, cleanText, dayType, hashPin, hourLabel,
  int, isDate, json, localNow, mondayOf, readJson, verifyPin,
} from '../lib/util.js';
import { files, MAX_FILE_BYTES } from '../lib/files.js';
import { checkKeys, encryptSecret, keyMode } from '../lib/razorpay.js';
import { groundPublic, photoUrls, serveObject } from './public.js';


async function bookingFor(db, me, id) {
  const b = await db.prepare('SELECT * FROM bookings WHERE id = ? AND ground_id = ?').bind(int(id, 'booking'), me.ground_id).first();
  if (!b) throw new HttpError(404, 'Booking not found', 'not_found');
  return b;
}

const ownerView = (b, units) => ({ id: b.id, ...publicBooking(b, units), hasProof: !!b.proof_key, createdAt: b.created_at, proofAt: b.proof_at, rzpPaymentId: b.rzp_payment_id || null });

// ---------- shared ----------
export async function me(env, me) {
  const g = await groundById(env.DB, me.ground_id);
  const row = await env.DB.prepare('SELECT google_email FROM staff WHERE id = ?').bind(me.id).first();
  return json({
    me: { name: me.name, role: me.role, phone: me.phone, googleEmail: row.google_email || null },
    ground: {
      ...groundPublic(g), approved: !!g.approved, upiSet: !!g.upi_id,
      service: g.service, serviceNote: g.service_note, planAmount: g.plan_amount, paidUntil: g.paid_until,
      today: localNow(g.tz_offset_min).date,
    },
    googleClientId: env.GOOGLE_CLIENT_ID || null,
  });
}

// ---------- owner: Today ----------
export async function today(env, me) {
  const db = env.DB;
  await sweepExpired(db);
  const g = await groundById(db, me.ground_id);
  const units = await unitsWithPrices(db, g.id);
  const now = localNow(g.tz_offset_min);
  const weekStart = mondayOf(now.date);
  const [todayRows, pending, week, refunds] = await Promise.all([
    db.prepare(
      `SELECT * FROM bookings WHERE ground_id = ? AND date = ? AND status = 'CONFIRMED' AND kind <> 'block' ORDER BY start_hour`
    ).bind(g.id, now.date).all(),
    db.prepare(`SELECT * FROM bookings WHERE ground_id = ? AND status = 'PENDING' ORDER BY proof_at`).bind(g.id).all(),
    db.prepare(
      `SELECT COALESCE(SUM(amount),0) AS total, COUNT(*) AS n FROM bookings
        WHERE ground_id = ? AND status = 'CONFIRMED' AND kind <> 'block' AND date BETWEEN ? AND ?`
    ).bind(g.id, weekStart, addDays(weekStart, 6)).first(),
    db.prepare(`SELECT * FROM bookings WHERE ground_id = ? AND refund_needed = 1 ORDER BY created_at`).bind(g.id).all(),
  ]);
  return json({
    date: now.date,
    nowHour: now.hour,
    bookingsToday: todayRows.results.length,
    weekTotal: week.total,
    weekCount: week.n,
    pending: pending.results.map((b) => ownerView(b, units)),
    refunds: refunds.results.map((b) => ownerView(b, units)),
    today: todayRows.results.map((b) => ownerView(b, units)),
  });
}

export async function listBookings(env, me, url) {
  const db = env.DB;
  await sweepExpired(db);
  const status = url.searchParams.get('status') || 'PENDING';
  const units = await unitsWithPrices(db, me.ground_id);
  const { results } = await db
    .prepare('SELECT * FROM bookings WHERE ground_id = ? AND status = ? ORDER BY date, start_hour LIMIT 200')
    .bind(me.ground_id, status)
    .all();
  return json({ bookings: results.map((b) => ownerView(b, units)) });
}

export async function getOne(env, me, id) {
  const db = env.DB;
  await sweepExpired(db);
  const b = await bookingFor(db, me, id);
  const units = await unitsWithPrices(db, me.ground_id);
  return json({ booking: { ...ownerView(b, units), proofUrl: b.proof_key ? `/api/owner/bookings/${b.id}/proof` : null } });
}

export async function proof(env, me, id) {
  const b = await bookingFor(env.DB, me, id);
  if (!b.proof_key) throw new HttpError(404, 'No screenshot');
  return serveObject(env, b.proof_key, 'private, max-age=300');
}

export async function approve(env, me, id) {
  const db = env.DB;
  await sweepExpired(db);
  const b = await bookingFor(db, me, id);
  const res = await db
    .prepare(`UPDATE bookings SET status = 'CONFIRMED', paid_via = COALESCE(paid_via, 'upi'), decided_at = ?, decided_by = ? WHERE id = ? AND status IN ('PENDING','HOLD')`)
    .bind(Date.now(), me.id, b.id)
    .run();
  if (!res.meta.changes) throw new HttpError(409, statusMessage(b.status), 'not_pending');
  return getOne(env, me, id);
}

export async function reject(env, me, id, request) {
  const body = await readJson(request).catch(() => ({}));
  const b = await bookingFor(env.DB, me, id);
  const note = cleanText(body.reason, 140) || 'Payment not received';
  const changed = await closeBooking(env.DB, b.id, 'REJECTED', ['PENDING', 'HOLD'], { by: me.id, note });
  if (!changed) throw new HttpError(409, statusMessage(b.status), 'not_pending');
  return getOne(env, me, id);
}

export async function cancel(env, me, id, request) {
  const body = await readJson(request).catch(() => ({}));
  const b = await bookingFor(env.DB, me, id);
  const note = cleanText(body.reason, 140) || (b.kind === 'block' ? 'Unblocked' : 'Cancelled by ground');
  const changed = await closeBooking(env.DB, b.id, 'CANCELLED', ['CONFIRMED', 'PENDING', 'HOLD'], { by: me.id, note });
  if (!changed) throw new HttpError(409, statusMessage(b.status), 'cannot_cancel');
  return getOne(env, me, id);
}

function statusMessage(s) {
  return {
    CONFIRMED: 'This booking is already confirmed.',
    REJECTED: 'This booking was already rejected.',
    EXPIRED: 'The customer ran out of time, so the slot was released.',
    CANCELLED: 'This booking was cancelled.',
  }[s] || 'This booking can no longer be changed.';
}

// ---------- owner: Calendar ----------
export async function calendar(env, me, url) {
  const db = env.DB;
  await sweepExpired(db);
  const g = await groundById(db, me.ground_id);
  const units = await unitsWithPrices(db, g.id);
  const nowLocal = localNow(g.tz_offset_min);
  const today = nowLocal.date;
  const date = url.searchParams.get('date') || today;
  if (!isDate(date)) throw bad('Invalid date');
  const { results } = await db
    .prepare(`SELECT * FROM bookings WHERE ground_id = ? AND date = ? AND status IN ('HOLD','PENDING','CONFIRMED')`)
    .bind(g.id, date)
    .all();
  // Columns are the single cells (Half A, Half B). A ground with one pitch has one column.
  const allMask = units.reduce((m, u) => m | u.mask, 0);
  const cells = [];
  for (let b = 0; b < 16; b++) if (allMask & (1 << b)) cells.push(1 << b);
  const columns = cells.map((cell) => {
    const u = units.find((x) => x.mask === cell);
    return { cell, name: u ? u.name : `Pitch ${cells.indexOf(cell) + 1}` };
  });
  const dates = Array.from({ length: 21 }, (_, i) => addDays(today, i - 3));
  return json({
    date,
    today,
    nowHour: nowLocal.hour,
    dates: dates.map((d) => ({ date: d, dayType: dayType(d) })),
    columns,
    units: units.map(({ id, name, subtitle, mask }) => ({ id, name, subtitle, mask })),
    hours: hoursOf(g).map((h) => ({ hour: h, label: hourLabel(h) })),
    bookings: results.map((b) => ({ ...ownerView(b, units), mask: b.mask })),
  });
}

// Owner adds a walk-in (already paid) or blocks a slot.
export async function addSlot(env, me, request) {
  const db = env.DB;
  const body = await readJson(request);
  const g = await groundById(db, me.ground_id);
  const units = await unitsWithPrices(db, g.id);
  const unit = units.find((u) => u.id === int(body.unitId, 'court'));
  if (!unit) throw bad('Pick a court');
  const date = String(body.date || '');
  if (!isDate(date)) throw bad('Invalid date');
  const hour = int(body.hour, 'hour');
  if (!hoursOf(g).includes(hour)) throw bad('That time is outside opening hours');
  const kind = body.kind === 'block' ? 'block' : 'walkin';
  const now = Date.now();
  await sweepExpired(db);
  const b = {
    groundId: g.id, unitId: unit.id, date, hour, mask: unit.mask, kind, status: 'CONFIRMED', now,
    decidedAt: now, decidedBy: me.id,
  };
  if (kind === 'walkin') {
    b.name = cleanName(body.name);
    b.phone = body.phone ? cleanPhone(body.phone) : '';
    const listPrice = dayType(date) === 'weekend' ? unit.weekend : unit.weekday;
    b.amount = body.amount === undefined || body.amount === '' ? listPrice : int(body.amount, 'amount');
    if (b.amount < 0) throw bad('Amount looks wrong');
    b.paidVia = 'cash';
    b.note = cleanText(body.note, 140);
  } else {
    b.note = cleanText(body.note, 140) || 'Closed';
  }
  const { token } = await insertBooking(db, b);
  const row = await db.prepare('SELECT id FROM bookings WHERE token = ?').bind(token).first();
  return getOne(env, me, row.id);
}

// ---------- owner: Settings ----------
export async function getSettings(env, me) {
  const db = env.DB;
  const g = await groundById(db, me.ground_id);
  const units = await unitsWithPrices(db, g.id);
  const { results: helpers } = await db
    .prepare(`SELECT id, name, phone FROM staff WHERE ground_id = ? AND role = 'helper' AND active = 1 ORDER BY id`)
    .bind(g.id)
    .all();
  return json({
    ground: {
      ...groundPublic(g),
      upiId: g.upi_id,
      upiName: g.upi_name,
      qrUrl: g.upi_qr_key ? `/api/files/qr/${g.slug}?v=${g.upi_qr_key.split('/').pop()}` : null,
      bookingDays: g.booking_days,
    },
    units: units.map(({ id, name, subtitle, weekday, weekend }) => ({ id, name, subtitle, weekday, weekend })),
    photos: await photoUrls(db, g.id),
    helpers,
    publicUrl: (env.PUBLIC_URL || '').replace(/\/+$/, ''),
    razorpay: {
      connected: !!(g.rzp_key_id && g.rzp_key_secret_enc),
      enabled: !!g.rzp_enabled,
      keyId: g.rzp_key_id || '',
      mode: g.rzp_key_id ? keyMode(g.rzp_key_id) : null,
    },
  });
}

// Connect, switch on/off, or disconnect Razorpay for this ground.
export async function saveRazorpay(env, me, request) {
  const db = env.DB;
  const body = await readJson(request);
  const g = await groundById(db, me.ground_id);
  const keyId = cleanText(body.keyId, 60);
  const keySecret = String(body.keySecret || '').trim();
  if (keyId || keySecret) {
    if (!/^rzp_(test|live)_[A-Za-z0-9]{6,}$/.test(keyId)) throw bad('The Key ID starts with rzp_live_ or rzp_test_', 'keyId');
    if (!/^[A-Za-z0-9]{10,}$/.test(keySecret)) throw bad('Paste the Key Secret exactly as Razorpay shows it', 'keySecret');
    await checkKeys(env, keyId, keySecret);
    await db
      .prepare('UPDATE grounds SET rzp_key_id = ?, rzp_key_secret_enc = ?, rzp_enabled = ? WHERE id = ?')
      .bind(keyId, await encryptSecret(env, keySecret), body.enabled === false ? 0 : 1, g.id)
      .run();
  } else if (typeof body.enabled === 'boolean') {
    if (body.enabled && !(g.rzp_key_id && g.rzp_key_secret_enc)) throw bad('Connect your Razorpay keys first');
    await db.prepare('UPDATE grounds SET rzp_enabled = ? WHERE id = ?').bind(body.enabled ? 1 : 0, g.id).run();
  }
  return getSettings(env, me);
}

export async function disconnectRazorpay(env, me) {
  await env.DB.prepare('UPDATE grounds SET rzp_key_id = NULL, rzp_key_secret_enc = NULL, rzp_enabled = 0 WHERE id = ?').bind(me.ground_id).run();
  return getSettings(env, me);
}

export async function markRefunded(env, me, id) {
  const b = await bookingFor(env.DB, me, id);
  await env.DB.prepare(`UPDATE bookings SET refund_needed = 0, note = 'Refunded' WHERE id = ?`).bind(b.id).run();
  return getOne(env, me, id);
}

export async function saveSettings(env, me, request) {
  const db = env.DB;
  const body = await readJson(request);
  const g = await groundById(db, me.ground_id);
  const stmts = [];
  if (body.ground) {
    const x = body.ground;
    const open = x.openHour === undefined ? g.open_hour : int(x.openHour, 'opening hour');
    const close = x.closeHour === undefined ? g.close_hour : int(x.closeHour, 'closing hour');
    if (open < 0 || close > 24 || open >= close) throw bad('Opening hours look wrong');
    const hold = x.holdMinutes === undefined ? g.hold_minutes : int(x.holdMinutes, 'hold time');
    if (hold < 10 || hold > 120) throw bad('Hold time must be between 10 and 120 minutes');
    const upi = x.upiId === undefined ? g.upi_id : cleanText(x.upiId, 80);
    if (upi && !/^[\w.\-]{2,}@[a-zA-Z][\w.\-]*$/.test(upi)) throw bad('That UPI ID does not look right', 'upiId');
    const wa = x.whatsapp === undefined ? g.whatsapp : x.whatsapp === '' ? '' : cleanPhone(x.whatsapp);
    const facilities = Array.isArray(x.facilities)
      ? x.facilities.map((f) => cleanText(f, 30)).filter(Boolean).slice(0, 12)
      : JSON.parse(g.facilities || '[]');
    stmts.push(
      db.prepare(
        `UPDATE grounds SET name = ?, area = ?, maps_url = ?, about = ?, whatsapp = ?, upi_id = ?, upi_name = ?,
            facilities = ?, open_hour = ?, close_hour = ?, hold_minutes = ? WHERE id = ?`
      ).bind(
        x.name === undefined ? g.name : cleanName(x.name, 'ground name', 80),
        x.area === undefined ? g.area : cleanText(x.area, 80),
        x.mapsUrl === undefined ? g.maps_url : safeUrl(x.mapsUrl),
        x.about === undefined ? g.about : cleanText(x.about, 400),
        wa, upi,
        x.upiName === undefined ? g.upi_name : cleanText(x.upiName, 60),
        JSON.stringify(facilities), open, close, hold, g.id
      )
    );
  }
  if (Array.isArray(body.prices)) {
    const units = await unitsWithPrices(db, g.id);
    for (const p of body.prices) {
      const u = units.find((x) => x.id === int(p.unitId, 'court'));
      if (!u) throw bad('Unknown court');
      for (const dt of ['weekday', 'weekend']) {
        const amount = int(p[dt], 'price');
        if (amount < 0 || amount > 100000) throw bad('Price looks wrong');
        stmts.push(
          db.prepare(
            `INSERT INTO prices (unit_id, day_type, amount) VALUES (?,?,?)
             ON CONFLICT(unit_id, day_type) DO UPDATE SET amount = excluded.amount`
          ).bind(u.id, dt, amount)
        );
      }
    }
  }
  if (stmts.length) await db.batch(stmts);
  return getSettings(env, me);
}

function safeUrl(raw) {
  const s = cleanText(raw, 300);
  if (!s) return '';
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw 0;
    return u.toString();
  } catch {
    throw bad('Paste the full Google Maps link (starting with https://)', 'mapsUrl');
  }
}

async function readImage(request) {
  const type = request.headers.get('content-type') || '';
  if (!/^image\/(jpeg|png|webp)$/.test(type)) throw bad('Upload a JPG, PNG or WebP image');
  const buf = await request.arrayBuffer();
  if (!buf.byteLength || buf.byteLength > MAX_FILE_BYTES) throw bad('That image is too large');
  return { buf, type };
}

export async function addPhoto(env, me, request) {
  const { buf, type } = await readImage(request);
  const db = env.DB;
  const count = await db.prepare('SELECT COUNT(*) AS n FROM photos WHERE ground_id = ?').bind(me.ground_id).first();
  if (count.n >= 10) throw bad('You can have up to 10 photos. Delete one first.');
  const key = `photos/${me.ground_id}/${crypto.randomUUID()}`;
  await files(env).put(key, buf, { contentType: type });
  await db
    .prepare('INSERT INTO photos (ground_id, r2_key, sort, created_at) VALUES (?,?,?,?)')
    .bind(me.ground_id, key, count.n, Date.now())
    .run();
  return getSettings(env, me);
}

export async function deletePhoto(env, me, id) {
  const db = env.DB;
  const p = await db.prepare('SELECT * FROM photos WHERE id = ? AND ground_id = ?').bind(int(id, 'photo'), me.ground_id).first();
  if (!p) throw new HttpError(404, 'Photo not found');
  await files(env).delete(p.r2_key);
  await db.prepare('DELETE FROM photos WHERE id = ?').bind(p.id).run();
  return getSettings(env, me);
}

export async function setQr(env, me, request) {
  const { buf, type } = await readImage(request);
  const g = await groundById(env.DB, me.ground_id);
  const key = `qr/${g.id}/${crypto.randomUUID()}`;
  await files(env).put(key, buf, { contentType: type });
  if (g.upi_qr_key) await files(env).delete(g.upi_qr_key);
  await env.DB.prepare('UPDATE grounds SET upi_qr_key = ? WHERE id = ?').bind(key, g.id).run();
  return getSettings(env, me);
}

export async function addHelper(env, me, request) {
  const body = await readJson(request);
  const name = cleanName(body.name);
  const phone = cleanPhone(body.phone);
  const pin = cleanPin(body.pin);
  const db = env.DB;
  const existing = await db.prepare('SELECT id, role FROM staff WHERE ground_id = ? AND phone = ?').bind(me.ground_id, phone).first();
  if (existing && existing.role === 'owner') throw bad('That number belongs to the owner');
  const hash = await hashPin(pin);
  if (existing) {
    await db.prepare('UPDATE staff SET name = ?, pin_hash = ?, active = 1 WHERE id = ?').bind(name, hash, existing.id).run();
  } else {
    await db
      .prepare(`INSERT INTO staff (ground_id, role, name, phone, pin_hash, created_at) VALUES (?, 'helper', ?, ?, ?, ?)`)
      .bind(me.ground_id, name, phone, hash, Date.now())
      .run();
  }
  return getSettings(env, me);
}

export async function removeHelper(env, me, id) {
  const db = env.DB;
  const sid = int(id, 'helper');
  await db.batch([
    db.prepare(`UPDATE staff SET active = 0 WHERE id = ? AND ground_id = ? AND role = 'helper'`).bind(sid, me.ground_id),
    db.prepare('DELETE FROM sessions WHERE staff_id = ?').bind(sid),
  ]);
  return getSettings(env, me);
}

export async function changePin(env, me, request) {
  const body = await readJson(request);
  const row = await env.DB.prepare('SELECT pin_hash FROM staff WHERE id = ?').bind(me.id).first();
  if (!(await verifyPin(String(body.current || ''), row.pin_hash))) throw bad('Current PIN is wrong', 'current');
  const pin = cleanPin(body.pin);
  await env.DB.prepare('UPDATE staff SET pin_hash = ? WHERE id = ?').bind(await hashPin(pin), me.id).run();
  return json({ ok: true });
}

// ---------- helper ----------
export async function upcoming(env, me) {
  const db = env.DB;
  const g = await groundById(db, me.ground_id);
  const units = await unitsWithPrices(db, g.id);
  const now = localNow(g.tz_offset_min);
  const { results } = await db
    .prepare(
      `SELECT * FROM bookings WHERE ground_id = ? AND status = 'CONFIRMED' AND kind <> 'block'
          AND date BETWEEN ? AND ? AND (date > ? OR start_hour >= ?)
        ORDER BY date, start_hour LIMIT 100`
    )
    .bind(g.id, now.date, addDays(now.date, 6), now.date, now.hour)
    .all();
  // Helpers never see money: amount, UTR and screenshots are left out on purpose.
  return json({
    today: now.date,
    bookings: results.map((b) => {
      const u = units.find((x) => x.id === b.unit_id);
      return {
        ref: b.ref, date: b.date, hour: b.start_hour,
        timeLabel: `${hourLabel(b.start_hour)} – ${hourLabel(b.start_hour + 1)}`,
        unit: u ? u.name : '', name: b.customer_name, phone: b.phone, walkin: b.kind === 'walkin',
      };
    }),
  });
}
