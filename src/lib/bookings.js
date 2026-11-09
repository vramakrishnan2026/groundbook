// Booking rules: slots, prices, holds and clash-free booking.
import { HttpError, addDays, bad, bitsOf, dayType, durLabel, hourLabel, localNow, minLabel, randomRef, randomToken } from './util.js';

export const ACTIVE = ['HOLD', 'PENDING', 'CONFIRMED'];

// Booking length rules. Customers book at least an hour, in the ground's step (30 or 60 minutes),
// up to MAX_DUR. Owners can add walk-ins or close the ground in any 30-minute step.
export const MIN_DUR = 60;
export const MAX_DUR = 240;
export const STEPS = [30, 60];

// Start and length of a stored booking, in minutes (older rows only have start_hour).
export const startOf = (b) => (b.start_min ?? b.start_hour * 60);
export const durOf = (b) => b.dur_min || 60;
export const timeLabelOf = (b) => `${minLabel(startOf(b))} – ${minLabel(startOf(b) + durOf(b))}`;

// Price for a booking of `dur` minutes, from the hourly price.
export const priceForDur = (hourly, dur) => Math.round((hourly * dur) / 60);

export async function groundBySlug(db, slug) {
  const g = await db.prepare('SELECT * FROM grounds WHERE slug = ? AND active = 1').bind(String(slug)).first();
  if (!g) throw new HttpError(404, 'Ground not found', 'not_found');
  if (g.service === 'locked') throw new HttpError(410, 'This booking page is closed right now. Please call the ground.', 'closed');
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
  return isPastStart(ground, date, hour * 60, now);
}

// A start time is past once that minute has begun.
export function isPastStart(ground, date, startMin, now = Date.now()) {
  const n = localNow(ground.tz_offset_min, now);
  return date < n.date || (date === n.date && startMin <= n.hour * 60 + n.minute);
}

// Checks a requested start and length against the ground's hours and step.
// customer: true applies the 1-hour minimum, the ground's step and the maximum length.
export function checkSpan(ground, start, dur, { customer = true } = {}) {
  const step = customer ? ground.step_min || 60 : 30;
  if (!Number.isInteger(start) || !Number.isInteger(dur)) throw bad('Pick a time');
  if (start % step || dur % step) throw bad(step === 60 ? 'Bookings are in whole hours here' : 'Times go in 30-minute steps');
  if (dur < (customer ? MIN_DUR : 30)) throw bad(customer ? 'The shortest booking is 1 hour' : 'Too short');
  if (customer && dur > MAX_DUR) throw bad(`The longest booking online is ${MAX_DUR / 60} hours. Call the ground for longer.`);
  if (start < ground.open_hour * 60 || start + dur > ground.close_hour * 60) throw bad('That time is outside opening hours');
}

// Half-hour indexes a booking covers: 6 PM for 90 minutes → 36, 37, 38.
export function halvesOf(start, dur) {
  const out = [];
  for (let m = start; m < start + dur; m += 30) out.push(m / 30);
  return out;
}

// Insert statements for the locks of one booking.
export function lockStmts(db, groundId, date, start, dur, mask, token) {
  const out = [];
  for (const half of halvesOf(start, dur)) {
    for (const cell of bitsOf(mask)) {
      out.push(
        db.prepare('INSERT INTO slot_locks (ground_id, date, half, cell, booking_token) VALUES (?,?,?,?,?)')
          .bind(groundId, date, half, cell, token)
      );
    }
  }
  return out;
}

export function hoursOf(ground) {
  const out = [];
  for (let h = ground.open_hour; h < ground.close_hour; h++) out.push(h);
  return out;
}

async function takenHalves(db, groundId, date) {
  const { results } = await db
    .prepare('SELECT half, cell FROM slot_locks WHERE ground_id = ? AND date = ?')
    .bind(groundId, date)
    .all();
  const taken = {};
  for (const r of results) taken[r.half] = (taken[r.half] || 0) | r.cell;
  return taken;
}

// Customer view of one day.
//   cells: every half hour x unit is free, taken or past (the time bar uses these).
//   hours: the same by whole hour (taken if either half is), for older screens and tests.
export async function availability(db, ground, units, date, now = Date.now()) {
  const taken = await takenHalves(db, ground.id, date);
  const state = (u, half) =>
    isPastStart(ground, date, half * 30, now) ? 'past' : (taken[half] || 0) & u.mask ? 'taken' : 'free';
  const cells = [];
  for (let half = ground.open_hour * 2; half < ground.close_hour * 2; half++) {
    cells.push({ start: half * 30, label: minLabel(half * 30), units: Object.fromEntries(units.map((u) => [u.id, state(u, half)])) });
  }
  const hours = hoursOf(ground).map((hour) => ({
    hour,
    label: hourLabel(hour),
    units: Object.fromEntries(
      units.map((u) => {
        const a = state(u, hour * 2), b = state(u, hour * 2 + 1);
        return [u.id, a === 'past' ? 'past' : a === 'taken' || b === 'taken' ? 'taken' : 'free'];
      })
    ),
  }));
  return { cells, hours };
}

// Insert a booking and lock its cells in one transaction. Throws 409 if any cell is taken.
export async function insertBooking(db, b) {
  const token = randomToken();
  const start = b.start ?? b.hour * 60;
  const dur = b.dur ?? 60;
  const ref = randomRef();
  const stmts = [
    db
      .prepare(
        `INSERT INTO bookings (token, ref, ground_id, unit_id, date, start_hour, start_min, dur_min, mask, kind, status,
            customer_name, phone, amount, note, ip, hold_expires_at, created_at, decided_at, decided_by, paid_via)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .bind(
        token, ref, b.groundId, b.unitId, b.date, Math.floor(start / 60), start, dur, b.mask, b.kind, b.status,
        b.name || '', b.phone || '', b.amount || 0, b.note || '', b.ip || '',
        b.holdExpiresAt ?? null, b.now, b.decidedAt ?? null, b.decidedBy ?? null, b.paidVia ?? null
      ),
    ...lockStmts(db, b.groundId, b.date, start, dur, b.mask, token),
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
    hour: Math.floor(startOf(b) / 60),
    start: startOf(b),
    dur: durOf(b),
    durLabel: durLabel(durOf(b)),
    timeLabel: timeLabelOf(b),
    unit: unit ? { id: unit.id, name: unit.name, subtitle: unit.subtitle } : null,
    name: b.customer_name,
    phone: b.phone,
    amount: b.amount,
    utr: b.utr,
    holdExpiresAt: b.hold_expires_at,
    note: b.note,
    paidVia: b.paid_via || null,
    refundNeeded: !!b.refund_needed,
    refund: b.refund_amount != null ? { amount: b.refund_amount, status: b.refund_status, at: b.refunded_at } : null,
  };
}
