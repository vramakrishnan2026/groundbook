// Booking rules: slots, prices, holds and clash-free booking.
import { HttpError, addDays, bitsOf, dayType, hourLabel, localNow, randomRef, randomToken } from './util.js';

export const ACTIVE = ['HOLD', 'PENDING', 'CONFIRMED'];

export async function groundBySlug(db, slug) {
  const g = await db.prepare('SELECT * FROM grounds WHERE slug = ? AND active = 1').bind(String(slug)).first();
  if (!g) throw new HttpError(404, 'Ground not found', 'not_found');
  return g;
}

export async function groundById(db, id) {
  const g = await db.prepare('SELECT * FROM grounds WHERE id = ?').bind(id).first();
  if (!g) throw new HttpError(404, 'Ground not found', 'not_found');
  return g;
}

export async function unitsWithPrices(db, groundId) {
  const { results } = await db
    .prepare(
      `SELECT u.id, u.code, u.name, u.subtitle, u.mask, u.sort,
              (SELECT amount FROM prices p WHERE p.unit_id = u.id AND p.day_type = 'weekday') AS weekday,
              (SELECT amount FROM prices p WHERE p.unit_id = u.id AND p.day_type = 'weekend') AS weekend
         FROM units u WHERE u.ground_id = ? AND u.active = 1 ORDER BY u.sort, u.id`
    )
    .bind(groundId)
    .all();
  return results.map((u) => ({ ...u, weekday: u.weekday ?? 0, weekend: u.weekend ?? 0 }));
}

export const priceFor = (unit, date) => (dayType(date) === 'weekend' ? unit.weekend : unit.weekday);

// Holds that ran out free their slot. Called before any read or write that depends on availability,
// and every few minutes from the cron trigger.
export async function sweepExpired(db, now = Date.now()) {
  await db.batch([
    db.prepare(`UPDATE bookings SET status = 'EXPIRED' WHERE status = 'HOLD' AND hold_expires_at < ?`).bind(now),
    db.prepare(
      `DELETE FROM slot_locks WHERE booking_token IN
         (SELECT token FROM bookings WHERE status IN ('EXPIRED','REJECTED','CANCELLED'))`
    ),
  ]);
}

// Bookable dates for customers: today .. today + booking_days - 1
export function bookableDates(ground, now = Date.now()) {
  const today = localNow(ground.tz_offset_min, now).date;
  return Array.from({ length: ground.booking_days }, (_, i) => addDays(today, i));
}

export function isPastSlot(ground, date, hour, now = Date.now()) {
  const n = localNow(ground.tz_offset_min, now);
  return date < n.date || (date === n.date && hour <= n.hour);
}

export function hoursOf(ground) {
  const out = [];
  for (let h = ground.open_hour; h < ground.close_hour; h++) out.push(h);
  return out;
}

async function takenCells(db, groundId, date) {
  const { results } = await db
    .prepare('SELECT hour, cell FROM slot_locks WHERE ground_id = ? AND date = ?')
    .bind(groundId, date)
    .all();
  const taken = {};
  for (const r of results) taken[r.hour] = (taken[r.hour] || 0) | r.cell;
  return taken;
}

// Customer view of one day: every hour x unit is free, taken or past.
export async function availability(db, ground, units, date, now = Date.now()) {
  const taken = await takenCells(db, ground.id, date);
  return hoursOf(ground).map((hour) => ({
    hour,
    label: hourLabel(hour),
    units: Object.fromEntries(
      units.map((u) => [
        u.id,
        isPastSlot(ground, date, hour, now) ? 'past' : (taken[hour] || 0) & u.mask ? 'taken' : 'free',
      ])
    ),
  }));
}

// Insert a booking and lock its cells in one transaction. Throws 409 if any cell is taken.
export async function insertBooking(db, b) {
  const token = randomToken();
  const ref = randomRef();
  const stmts = [
    db
      .prepare(
        `INSERT INTO bookings (token, ref, ground_id, unit_id, date, start_hour, mask, kind, status,
            customer_name, phone, amount, note, ip, hold_expires_at, created_at, decided_at, decided_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .bind(
        token, ref, b.groundId, b.unitId, b.date, b.hour, b.mask, b.kind, b.status,
        b.name || '', b.phone || '', b.amount || 0, b.note || '', b.ip || '',
        b.holdExpiresAt ?? null, b.now, b.decidedAt ?? null, b.decidedBy ?? null
      ),
    ...bitsOf(b.mask).map((cell) =>
      db
        .prepare('INSERT INTO slot_locks (ground_id, date, hour, cell, booking_token) VALUES (?,?,?,?,?)')
        .bind(b.groundId, b.date, b.hour, cell, token)
    ),
  ];
  try {
    await db.batch(stmts);
  } catch (e) {
    if (/UNIQUE|constraint/i.test(String(e && e.message))) {
      throw new HttpError(409, 'Sorry, someone just took this slot. Please pick another time.', 'slot_taken');
    }
    throw e;
  }
  return { token, ref };
}

// Move a booking to a final status and free its cells, in one transaction.
// `fromStatuses` guards against double clicks and races (e.g. approving an expired hold).
export async function closeBooking(db, id, toStatus, fromStatuses, extra = {}) {
  const placeholders = fromStatuses.map(() => '?').join(',');
  const res = await db.batch([
    db
      .prepare(
        `UPDATE bookings SET status = ?, decided_at = ?, decided_by = ?, note = COALESCE(?, note)
          WHERE id = ? AND status IN (${placeholders})`
      )
      .bind(toStatus, extra.now ?? Date.now(), extra.by ?? null, extra.note ?? null, id, ...fromStatuses),
    db.prepare(
      `DELETE FROM slot_locks WHERE booking_token = (SELECT token FROM bookings WHERE id = ? AND status = ?)`
    ).bind(id, toStatus),
  ]);
  return (res[0].meta && res[0].meta.changes) || 0;
}

export function publicBooking(b, units) {
  const unit = units.find((u) => u.id === b.unit_id);
  return {
    ref: b.ref,
    status: b.status,
    kind: b.kind,
    date: b.date,
    hour: b.start_hour,
    timeLabel: `${hourLabel(b.start_hour)} – ${hourLabel(b.start_hour + 1)}`,
    unit: unit ? { id: unit.id, name: unit.name, subtitle: unit.subtitle } : null,
    name: b.customer_name,
    phone: b.phone,
    amount: b.amount,
    utr: b.utr,
    holdExpiresAt: b.hold_expires_at,
    note: b.note,
  };
}
