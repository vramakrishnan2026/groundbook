// GoArena master admin: every ground, its numbers, its subscription, and remote controls.
// Every change is written to admin_log.
import { startSession } from '../lib/auth.js';
import { insertBooking, unitsWithPrices } from '../lib/bookings.js';
import { freeSlug } from './accounts.js';
import { checkKeys, groundKeys, keyMode, listPayments, reconcile } from '../lib/razorpay.js';
import { logError } from '../lib/tracking.js';
import { photoUrls } from './public.js';
import { HttpError, addDays, bad, cleanPhone, cleanText, hashPin, isDate, json, localNow, readJson } from '../lib/util.js';

const pct = (n, of) => { const v = (n / of) * 100; return v > 0 && v < 1 ? Math.round(v * 10) / 10 : Math.round(v); };
const SERVICES = ['active', 'paused', 'locked'];
const today = () => localNow(330).date;

async function log(db, email, groundId, action, detail = '') {
  await db.prepare('INSERT INTO admin_log (ground_id, email, action, detail, at) VALUES (?,?,?,?,?)')
    .bind(groundId, email, action, String(detail).slice(0, 300), Date.now()).run();
}

async function ground(db, id) {
  const g = await db.prepare('SELECT * FROM grounds WHERE id = ? AND active = 1').bind(Number(id)).first();
  if (!g) throw new HttpError(404, 'Ground not found', 'not_found');
  return g;
}

export function addMonths(date, months) {
  const [y, m, d] = date.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

const planState = (g, t) =>
  !g.plan_enabled ? 'free' : !g.paid_until ? 'none' : g.paid_until < t ? 'overdue' : addDays(t, 7) >= g.paid_until ? 'due' : 'paid';

function summary(g, t) {
  return {
    id: g.id, slug: g.slug, name: g.name, area: g.area, approved: !!g.approved,
    service: g.service, serviceNote: g.service_note, planAmount: g.plan_amount, paidUntil: g.paid_until,
    plan: planState(g, t), planEnabled: !!g.plan_enabled, owner: g.owner, phone: g.phone, email: g.signup_email || g.owner_google || null,
    lastLogin: g.last_login, bookings30: g.bookings30 || 0, revenue30: g.revenue30 || 0, waitingPayments: g.waiting || 0,
    createdAt: g.created_at, photos: g.photos || 0, hasUpi: !!g.upi_id, razorpay: !!g.rzp_enabled,
    demo: !!g.is_demo, helpers: g.helpers || 0, google: !!g.owner_google, views30: g.views30 || 0, errors7: g.errors7 || 0,
    conversion: g.views30 ? pct(g.bookings30 || 0, g.views30) : null,
  };
}

export async function overview(env, email) {
  const db = env.DB, t = today(), from = addDays(t, -30);
  const { results } = await db.prepare(
    `SELECT g.*, o.name AS owner, o.phone, o.google_email AS owner_google,
            (SELECT MAX(last_login_at) FROM staff s WHERE s.ground_id = g.id) AS last_login,
            (SELECT COUNT(*) FROM bookings b WHERE b.ground_id = g.id AND b.status = 'CONFIRMED' AND b.kind <> 'block' AND b.date >= ?) AS bookings30,
            (SELECT COALESCE(SUM(amount),0) FROM bookings b WHERE b.ground_id = g.id AND b.status = 'CONFIRMED' AND b.kind <> 'block' AND b.date >= ?) AS revenue30,
            (SELECT COUNT(*) FROM bookings b WHERE b.ground_id = g.id AND b.status = 'PENDING') AS waiting,
            (SELECT COUNT(*) FROM photos ph WHERE ph.ground_id = g.id) AS photos,
            (SELECT COUNT(*) FROM staff h WHERE h.ground_id = g.id AND h.role = 'helper' AND h.active = 1) AS helpers,
            (SELECT COALESCE(SUM(views),0) FROM ground_daily v WHERE v.ground_id = g.id AND v.date >= ?) AS views30,
            (SELECT COUNT(*) FROM error_log e WHERE e.ground_id = g.id AND e.at > ?) AS errors7
       FROM grounds g LEFT JOIN staff o ON o.id = (SELECT id FROM staff WHERE ground_id = g.id AND role = 'owner' ORDER BY id LIMIT 1)
      WHERE g.active = 1 ORDER BY g.approved, g.created_at DESC LIMIT 500`
  ).bind(from, from, from, Date.now() - 7 * 86400000).all();
  const all = results.map((g) => summary(g, t));
  const grounds = all.filter((g) => !g.demo); // totals count real grounds only
  const n = (f) => grounds.filter(f).length;
  const sixMonthsAgo = addMonths(t, -5).slice(0, 7) + '-01';
  const [income, payments, activity, errs] = await Promise.all([
    db.prepare(`SELECT substr(paid_on, 1, 7) AS month, SUM(amount) AS total, COUNT(*) AS n FROM sub_payments WHERE paid_on >= ? GROUP BY month ORDER BY month`).bind(sixMonthsAgo).all(),
    db.prepare(`SELECT p.*, g.name AS ground FROM sub_payments p JOIN grounds g ON g.id = p.ground_id ORDER BY p.id DESC LIMIT 12`).all(),
    db.prepare(`SELECT l.*, g.name AS ground FROM admin_log l LEFT JOIN grounds g ON g.id = l.ground_id ORDER BY l.id DESC LIMIT 15`).all(),
    db.prepare(`SELECT COUNT(*) AS n, SUM(source = 'razorpay') AS rzp FROM error_log WHERE at > ?`).bind(Date.now() - 86400000).first(),
  ]);
  const months = Array.from({ length: 6 }, (_, i) => addMonths(sixMonthsAgo, i).slice(0, 7));
  return json({
    email, today: t, grounds: all,
    income: months.map((m) => { const r = income.results.find((x) => x.month === m); return { month: m, total: r ? r.total : 0, count: r ? r.n : 0 }; }),
    payments: payments.results.map((p) => ({ groundId: p.ground_id, ground: p.ground, amount: p.amount, months: p.months, paidOn: p.paid_on, note: p.note })),
    activity: activity.results.map((l) => ({ groundId: l.ground_id, ground: l.ground, action: l.action, detail: l.detail, email: l.email, at: l.at })),
    stats: {
      grounds: grounds.length, waiting: n((g) => !g.approved), paused: n((g) => g.service === 'paused'), locked: n((g) => g.service === 'locked'),
      overdue: n((g) => g.plan === 'overdue'), due: n((g) => g.plan === 'due'),
      monthlyPlans: grounds.filter((g) => g.approved && g.planEnabled && g.service !== 'locked').reduce((a, g) => a + g.planAmount, 0),
      onPlan: n((g) => g.planEnabled), free: n((g) => !g.planEnabled),
      bookings30: grounds.reduce((a, g) => a + g.bookings30, 0), revenue30: grounds.reduce((a, g) => a + g.revenue30, 0),
      views30: grounds.reduce((a, g) => a + g.views30, 0), errors24: errs.n || 0, rzpErrors24: errs.rzp || 0,
    },
  });
}

export async function detail(env, id) {
  const db = env.DB, t = today(), g = await ground(db, id);
  const [staff, payments, logRows, recent, stats] = await Promise.all([
    db.prepare(`SELECT id, role, name, phone, google_email, last_login_at, active FROM staff WHERE ground_id = ? AND active = 1 ORDER BY role = 'owner' DESC, id`).bind(g.id).all(),
    db.prepare('SELECT * FROM sub_payments WHERE ground_id = ? ORDER BY id DESC LIMIT 24').bind(g.id).all(),
    db.prepare('SELECT * FROM admin_log WHERE ground_id = ? ORDER BY id DESC LIMIT 30').bind(g.id).all(),
    db.prepare(`SELECT b.ref, b.date, b.start_hour, b.status, b.kind, b.customer_name, b.amount, b.paid_via, u.name AS unit
                  FROM bookings b JOIN units u ON u.id = b.unit_id WHERE b.ground_id = ? AND b.kind <> 'block' ORDER BY b.id DESC LIMIT 15`).bind(g.id).all(),
    db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(amount),0) AS total FROM bookings WHERE ground_id = ? AND status = 'CONFIRMED' AND kind <> 'block' AND date >= ?`).bind(g.id, addDays(t, -30)).first(),
  ]);
  const from = addDays(t, -29);
  const [daily, funnel, errs, rzpBookings, units, photoList] = await Promise.all([
    db.prepare('SELECT date, views, slot_views FROM ground_daily WHERE ground_id = ? AND date >= ? ORDER BY date').bind(g.id, from).all(),
    db.prepare(`SELECT COUNT(*) AS holds,
                       SUM(proof_key IS NOT NULL OR rzp_payment_id IS NOT NULL) AS paid,
                       SUM(status = 'CONFIRMED') AS confirmed, SUM(status = 'EXPIRED') AS expired,
                       SUM(status = 'REJECTED') AS rejected, SUM(status = 'CANCELLED') AS cancelled,
                       SUM(rzp_order_id IS NOT NULL) AS online
                  FROM bookings WHERE ground_id = ? AND kind = 'customer' AND created_at >= ?`).bind(g.id, Date.now() - 30 * 86400000).first(),
    db.prepare('SELECT * FROM error_log WHERE ground_id = ? ORDER BY id DESC LIMIT 25').bind(g.id).all(),
    db.prepare(`SELECT ref, date, start_hour, status, amount, rzp_order_id, rzp_payment_id, refund_needed, refund_amount, refund_status, created_at FROM bookings
                 WHERE ground_id = ? AND rzp_order_id IS NOT NULL ORDER BY id DESC LIMIT 15`).bind(g.id).all(),
    unitsWithPrices(db, g.id),
    photoUrls(db, g.id),
  ]);
  const days = Array.from({ length: 30 }, (_, i) => addDays(from, i));
  const confirmedByDay = await db.prepare(`SELECT date(created_at / 1000, 'unixepoch', '+330 minutes') AS d, COUNT(*) AS n FROM bookings
      WHERE ground_id = ? AND kind = 'customer' AND created_at >= ? GROUP BY d`).bind(g.id, Date.now() - 31 * 86400000).all();
  const owner = staff.results.find((s) => s.role === 'owner');
  const views30 = daily.results.reduce((a, r) => a + r.views, 0);
  return json({
    traffic: {
      views30, slotViews30: daily.results.reduce((a, r) => a + r.slot_views, 0),
      days: days.map((d) => { const r = daily.results.find((x) => x.date === d); const b = confirmedByDay.results.find((x) => x.d === d); return { date: d, views: r ? r.views : 0, bookings: b ? b.n : 0 }; }),
      funnel: { holds: funnel.holds || 0, paid: funnel.paid || 0, confirmed: funnel.confirmed || 0, expired: funnel.expired || 0, rejected: funnel.rejected || 0, cancelled: funnel.cancelled || 0, online: funnel.online || 0 },
      conversion: views30 ? pct(funnel.confirmed || 0, views30) : null,
    },
    profile: {
      ownerName: owner ? owner.name : '', ownerPhone: owner ? owner.phone : '', ownerGoogle: owner ? owner.google_email : null,
      businessName: g.business_name, address: g.address, gstin: g.gstin, contactEmail: g.contact_email, altPhone: g.alt_phone,
    },
    setup: {
      openHour: g.open_hour, closeHour: g.close_hour, holdMinutes: g.hold_minutes, bookingDays: g.booking_days, mapsUrl: g.maps_url, about: g.about,
      facilities: JSON.parse(g.facilities || '[]'), upiId: g.upi_id, upiName: g.upi_name, upiQr: !!g.upi_qr_key, whatsapp: g.whatsapp,
      units: units.map((u) => ({ name: u.name, subtitle: u.subtitle, weekday: u.weekday, weekend: u.weekend })),
      photos: photoList.map((p) => p.url),
    },
    razorpay: {
      connected: !!(g.rzp_key_id && g.rzp_key_secret_enc), enabled: !!g.rzp_enabled, keyId: g.rzp_key_id, mode: g.rzp_key_id ? keyMode(g.rzp_key_id) : null,
      connectedAt: g.rzp_connected_at, checkedAt: g.rzp_checked_at, checkError: g.rzp_check_error,
      bookings: rzpBookings.results.map((b) => ({ ref: b.ref, date: b.date, hour: b.start_hour, status: b.status, amount: b.amount, orderId: b.rzp_order_id, paymentId: b.rzp_payment_id, refundNeeded: !!b.refund_needed, refund: b.refund_amount != null ? { amount: b.refund_amount, status: b.refund_status } : null, createdAt: b.created_at })),
    },
    errors: errs.results.map((e) => ({ source: e.source, path: e.path, status: e.status, code: e.code, message: e.message, at: e.at })),
    today: t,
    ground: {
      id: g.id, slug: g.slug, name: g.name, area: g.area, approved: !!g.approved, email: g.signup_email, demo: !!g.is_demo,
      service: g.service, serviceNote: g.service_note, planAmount: g.plan_amount, paidUntil: g.paid_until, plan: planState(g, t), planEnabled: !!g.plan_enabled,
      adminNote: g.admin_note, autoPauseDays: g.auto_pause_days, createdAt: g.created_at,
      upiId: g.upi_id, razorpay: !!g.rzp_enabled, photos: photoList.length, whatsapp: g.whatsapp,
    },
    stats: { bookings30: stats.n, revenue30: stats.total },
    staff: staff.results.map((s) => ({ id: s.id, role: s.role, name: s.name, phone: s.phone, googleEmail: s.google_email, lastLogin: s.last_login_at })),
    payments: payments.results.map((p) => ({ id: p.id, amount: p.amount, months: p.months, paidOn: p.paid_on, coversTo: p.covers_to, note: p.note, by: p.by_email })),
    log: logRows.results.map((l) => ({ email: l.email, action: l.action, detail: l.detail, at: l.at })),
    recent: recent.results.map((b) => ({ ref: b.ref, date: b.date, hour: b.start_hour, status: b.status, kind: b.kind, name: b.customer_name, amount: b.amount, unit: b.unit, paidVia: b.paid_via })),
  });
}

export async function decide(env, email, id, approve) {
  const db = env.DB, g = await ground(db, id);
  if (approve) await db.prepare('UPDATE grounds SET approved = 1 WHERE id = ?').bind(g.id).run();
  else await db.batch([
    db.prepare('UPDATE grounds SET active = 0 WHERE id = ?').bind(g.id),
    db.prepare('DELETE FROM sessions WHERE staff_id IN (SELECT id FROM staff WHERE ground_id = ?)').bind(g.id),
  ]);
  await log(db, email, g.id, approve ? 'Approved' : 'Turned down');
  return json({ ok: true });
}

export async function setService(env, email, id, request) {
  const db = env.DB, g = await ground(db, id), body = await readJson(request);
  const service = String(body.service || '');
  if (!SERVICES.includes(service)) throw bad('Pick Active, Bookings paused or Locked', 'service');
  const note = cleanText(body.note, 160);
  const stmts = [db.prepare('UPDATE grounds SET service = ?, service_note = ? WHERE id = ?').bind(service, service === 'active' ? '' : note, g.id)];
  if (service === 'locked') stmts.push(db.prepare('DELETE FROM sessions WHERE staff_id IN (SELECT id FROM staff WHERE ground_id = ?)').bind(g.id));
  await db.batch(stmts);
  await log(db, email, g.id, { active: 'Service on', paused: 'Bookings paused', locked: 'Locked' }[service], note);
  return json({ ok: true });
}

export async function setPlan(env, email, id, request) {
  const db = env.DB, g = await ground(db, id), body = await readJson(request);
  const amount = Number(body.planAmount);
  if (!Number.isInteger(amount) || amount < 0 || amount > 100000) throw bad('Monthly price must be a whole number of rupees', 'planAmount');
  const paidUntil = body.paidUntil ? String(body.paidUntil) : null;
  if (paidUntil && !isDate(paidUntil)) throw bad('Paid-until must be a date', 'paidUntil');
  const note = String(body.adminNote ?? g.admin_note).slice(0, 1000);
  await db.prepare('UPDATE grounds SET plan_amount = ?, paid_until = ?, admin_note = ? WHERE id = ?').bind(amount, paidUntil, note, g.id).run();
  const changes = [amount !== g.plan_amount && `₹${amount}/month`, paidUntil !== g.paid_until && `paid until ${paidUntil || 'none'}`].filter(Boolean);
  if (changes.length) await log(db, email, g.id, 'Plan changed', changes.join(', '));
  return json({ ok: true });
}

export async function togglePlan(env, email, id, request) {
  const db = env.DB, g = await ground(db, id), on = !!(await readJson(request)).enabled;
  await db.prepare('UPDATE grounds SET plan_enabled = ? WHERE id = ?').bind(on ? 1 : 0, g.id).run();
  await log(db, email, g.id, on ? 'Subscription on' : 'Subscription off (free)');
  return json({ ok: true });
}

export async function addPayment(env, email, id, request) {
  const db = env.DB, g = await ground(db, id), body = await readJson(request), t = today();
  const amount = Number(body.amount), months = Number(body.months || 1);
  if (!Number.isInteger(amount) || amount <= 0) throw bad('Enter the amount received', 'amount');
  if (!Number.isInteger(months) || months < 1 || months > 24) throw bad('Months must be 1 to 24', 'months');
  const paidOn = body.paidOn && isDate(String(body.paidOn)) ? String(body.paidOn) : t;
  const from = g.paid_until && g.paid_until > t ? g.paid_until : t;
  const coversTo = addMonths(from, months);
  const stmts = [
    db.prepare('INSERT INTO sub_payments (ground_id, amount, months, paid_on, covers_to, note, by_email, created_at) VALUES (?,?,?,?,?,?,?,?)')
      .bind(g.id, amount, months, paidOn, coversTo, cleanText(body.note, 160), email, Date.now()),
    db.prepare('UPDATE grounds SET paid_until = ?, plan_enabled = 1 WHERE id = ?').bind(coversTo, g.id),
  ];
  const reactivate = body.reactivate !== false && g.service !== 'active';
  if (reactivate) stmts.push(db.prepare(`UPDATE grounds SET service = 'active', service_note = '' WHERE id = ?`).bind(g.id));
  await db.batch(stmts);
  await log(db, email, g.id, 'Payment recorded', `₹${amount} for ${months} month${months > 1 ? 's' : ''}, paid until ${coversTo}${reactivate ? ', service switched on' : ''}`);
  return json({ ok: true, paidUntil: coversTo });
}

async function staffOf(db, id) {
  const s = await db.prepare('SELECT * FROM staff WHERE id = ? AND active = 1').bind(Number(id)).first();
  if (!s) throw new HttpError(404, 'Person not found', 'not_found');
  return s;
}

export async function resetPin(env, email, staffId) {
  const db = env.DB, s = await staffOf(db, staffId);
  const pin = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
  await db.batch([
    db.prepare('UPDATE staff SET pin_hash = ? WHERE id = ?').bind(await hashPin(pin), s.id),
    db.prepare('DELETE FROM sessions WHERE staff_id = ?').bind(s.id),
    db.prepare('DELETE FROM login_attempts WHERE key = ?').bind(s.phone),
  ]);
  await log(db, email, s.ground_id, 'PIN reset', `${s.name} (${s.role})`);
  return json({ ok: true, pin, name: s.name, phone: s.phone });
}

export async function unlinkGoogle(env, email, staffId) {
  const db = env.DB, s = await staffOf(db, staffId);
  await db.prepare('UPDATE staff SET google_sub = NULL, google_email = NULL WHERE id = ?').bind(s.id).run();
  await log(db, email, s.ground_id, 'Google sign-in removed', `${s.name} (${s.google_email || ''})`);
  return json({ ok: true });
}

export async function setPhone(env, email, staffId, request) {
  const db = env.DB, s = await staffOf(db, staffId), phone = cleanPhone((await readJson(request)).phone);
  const clash = await db.prepare('SELECT 1 FROM staff WHERE ground_id = ? AND phone = ? AND id <> ? AND active = 1').bind(s.ground_id, phone, s.id).first();
  if (clash) throw bad('Someone at this ground already uses that number', 'phone');
  await db.prepare('UPDATE staff SET phone = ? WHERE id = ?').bind(phone, s.id).run();
  await log(db, email, s.ground_id, 'Phone changed', `${s.name}: ${s.phone} → ${phone}`);
  return json({ ok: true });
}

export async function logoutAll(env, email, id) {
  const db = env.DB, g = await ground(db, id);
  await db.prepare('DELETE FROM sessions WHERE staff_id IN (SELECT id FROM staff WHERE ground_id = ?)').bind(g.id).run();
  await log(db, email, g.id, 'Logged everyone out');
  return json({ ok: true });
}

// Opens the owner's screens in this browser, to help an owner remotely.
export async function openAsOwner(env, email, id, request) {
  const db = env.DB, g = await ground(db, id);
  if (g.service === 'locked') throw bad('Unlock the ground first; locked grounds have no logins', 'locked');
  const owner = await db.prepare(`SELECT id FROM staff WHERE ground_id = ? AND role = 'owner' AND active = 1 ORDER BY id LIMIT 1`).bind(g.id).first();
  if (!owner) throw bad('This ground has no owner login', 'owner');
  await log(db, email, g.id, 'Opened owner view');
  return json({ ok: true }, 200, { 'set-cookie': await startSession(db, request, owner.id) });
}


// ---------- owner / business details
export async function setProfile(env, email, id, request) {
  const db = env.DB, g = await ground(db, id), b = await readJson(request);
  const alt = b.altPhone ? cleanPhone(b.altPhone) : '';
  const gstin = String(b.gstin || '').toUpperCase().replace(/\s/g, '');
  if (gstin && !/^\d{2}[A-Z0-9]{13}$/.test(gstin)) throw bad('GSTIN has 15 characters, e.g. 32ABCDE1234F1Z5', 'gstin');
  const mail = cleanText(b.contactEmail, 120).toLowerCase();
  if (mail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) throw bad('That email address looks wrong', 'contactEmail');
  const stmts = [db.prepare('UPDATE grounds SET business_name = ?, address = ?, gstin = ?, contact_email = ?, alt_phone = ? WHERE id = ?')
    .bind(cleanText(b.businessName, 120), cleanText(b.address, 300), gstin, mail, alt, g.id)];
  if (b.ownerName) stmts.push(db.prepare(`UPDATE staff SET name = ? WHERE ground_id = ? AND role = 'owner'`).bind(cleanText(b.ownerName, 60), g.id));
  await db.batch(stmts);
  await log(db, email, g.id, 'Owner details updated');
  return json({ ok: true });
}

// ---------- Razorpay, for debugging remotely
async function keysOf(env, g) {
  if (!g.rzp_key_id || !g.rzp_key_secret_enc) throw bad('This ground has not connected Razorpay', 'rzp_off');
  return groundKeys(env, { ...g, rzp_enabled: 1 });
}

export async function rzpTest(env, email, id) {
  const db = env.DB, g = await ground(db, id);
  const keys = await keysOf(env, g);
  let error = null;
  try { await checkKeys(env, keys.keyId, keys.keySecret); } catch (e) { error = e.message || 'Failed'; }
  await db.prepare('UPDATE grounds SET rzp_checked_at = ?, rzp_check_error = ? WHERE id = ?').bind(Date.now(), error, g.id).run();
  if (error) await logError(db, { groundId: g.id, source: 'razorpay', path: 'admin connection test', code: 'rzp_check', message: error });
  await log(db, email, g.id, 'Razorpay tested', error ? `failed: ${error}` : 'keys work');
  return json({ ok: !error, error });
}

export async function rzpPayments(env, id) {
  const db = env.DB, g = await ground(db, id);
  const items = await listPayments(env, await keysOf(env, g), 25);
  const orders = [...new Set(items.map((p) => p.order_id).filter(Boolean))];
  const refs = {};
  for (const o of orders) {
    const b = await db.prepare('SELECT ref, status FROM bookings WHERE ground_id = ? AND rzp_order_id = ?').bind(g.id, o).first();
    if (b) refs[o] = b;
  }
  return json({
    payments: items.map((p) => ({
      id: p.id, orderId: p.order_id || null, amount: Math.round((p.amount || 0) / 100), status: p.status, method: p.method || '',
      captured: !!p.captured, refundStatus: p.refund_status || null, errorCode: p.error_code || null, error: p.error_description || null,
      errorReason: p.error_reason || null, contact: p.contact || '', email: p.email || '', vpa: p.vpa || '', createdAt: (p.created_at || 0) * 1000,
      booking: p.order_id && refs[p.order_id] ? refs[p.order_id] : null,
    })),
  });
}

export async function rzpRecheck(env, email, id, request) {
  const db = env.DB, g = await ground(db, id);
  const ref = String((await readJson(request)).ref || '').trim().toUpperCase();
  const b = await db.prepare('SELECT * FROM bookings WHERE ground_id = ? AND ref = ?').bind(g.id, ref).first();
  if (!b) throw bad(`No booking ${ref} at this ground`, 'ref');
  if (!b.rzp_order_id) throw bad(`${ref} was not paid online`, 'ref');
  const before = b.status;
  const result = b.rzp_payment_id ? 'already paid' : (await reconcile(env, b, g)) || 'no successful payment found at Razorpay';
  const after = (await db.prepare('SELECT status, refund_needed FROM bookings WHERE id = ?').bind(b.id).first());
  await log(db, email, g.id, 'Razorpay re-check', `${ref}: ${result}`);
  return json({ ref, before, after: after.status, refundNeeded: !!after.refund_needed, result });
}

export async function rzpDisconnect(env, email, id) {
  const db = env.DB, g = await ground(db, id);
  await db.prepare('UPDATE grounds SET rzp_key_id = NULL, rzp_key_secret_enc = NULL, rzp_enabled = 0, rzp_check_error = NULL WHERE id = ?').bind(g.id).run();
  await log(db, email, g.id, 'Razorpay disconnected', 'customers pay by UPI + screenshot again');
  return json({ ok: true });
}

// ---------- recent errors across all grounds
export async function errors(env) {
  const { results } = await env.DB.prepare(
    `SELECT e.*, g.name AS ground FROM error_log e LEFT JOIN grounds g ON g.id = e.ground_id ORDER BY e.id DESC LIMIT 100`
  ).all();
  return json({ errors: results.map((e) => ({ groundId: e.ground_id, ground: e.ground, source: e.source, path: e.path, status: e.status, code: e.code, message: e.message, at: e.at })) });
}

// ---------- demo ground: a copy of a real ground (photos, prices, hours, facilities) with a
// separate owner login and a few made-up bookings. No Razorpay keys and no real customers are copied.
const DEMO_PEOPLE = [['Arjun Nair', '9000011001'], ['Fahad Ali', '9000011002'], ['Sreejith P', '9000011003'], ['Rahul Menon', '9000011004'], ['Vishnu R', '9000011005']];

export async function duplicateAsDemo(env, email, id, request) {
  const db = env.DB, src = await ground(db, id), body = await readJson(request).catch(() => ({}));
  const name = cleanText(body.name, 60) || `${src.name} Demo`;
  const slug = await freeSlug(db, name);
  const now = Date.now(), t = today();
  let phone = '';
  for (let i = 0; i < 20 && !phone; i++) {
    const p = '9' + String(100000000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000000)).slice(0, 9);
    if (!(await db.prepare('SELECT 1 FROM staff WHERE phone = ?').bind(p).first())) phone = p;
  }
  const pin = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
  const copyFile = async (oldKey, newKey) =>
    db.prepare('INSERT INTO files (key, content_type, data, size, created_at) SELECT ?, content_type, data, size, ? FROM files WHERE key = ?').bind(newKey, now, oldKey);

  const r = await db.prepare(
    `INSERT INTO grounds (slug, name, area, maps_url, about, whatsapp, upi_id, upi_name, facilities, open_hour, close_hour, hold_minutes,
                          booking_days, tz_offset_min, created_at, approved, signup_email, is_demo, admin_note)
     SELECT ?, ?, area, maps_url, about, ?, upi_id, upi_name, facilities, open_hour, close_hour, hold_minutes,
            booking_days, tz_offset_min, ?, 1, ?, 1, ? FROM grounds WHERE id = ?`
  ).bind(slug, name, phone, now, email, `Demo copy of ${src.name} for reviewers. Owner login ${phone}.`, src.id).run();
  const gid = r.meta.last_row_id;

  const stmts = [
    db.prepare('INSERT INTO units (ground_id, code, name, subtitle, mask, sort, active) SELECT ?, code, name, subtitle, mask, sort, active FROM units WHERE ground_id = ?').bind(gid, src.id),
    db.prepare(`INSERT INTO prices (unit_id, day_type, amount) SELECT nu.id, p.day_type, p.amount FROM prices p
                  JOIN units ou ON ou.id = p.unit_id AND ou.ground_id = ? JOIN units nu ON nu.ground_id = ? AND nu.code = ou.code`).bind(src.id, gid),
    db.prepare(`INSERT INTO staff (ground_id, role, name, phone, pin_hash, created_at) VALUES (?, 'owner', 'Demo Owner', ?, ?, ?)`).bind(gid, phone, await hashPin(pin), now),
  ];
  const { results: photos } = await db.prepare('SELECT r2_key, sort FROM photos WHERE ground_id = ? ORDER BY sort, id').bind(src.id).all();
  for (const ph of photos) {
    const key = `photos/${gid}/${crypto.randomUUID()}`;
    stmts.push(await copyFile(ph.r2_key, key));
    stmts.push(db.prepare('INSERT INTO photos (ground_id, r2_key, sort, created_at) VALUES (?,?,?,?)').bind(gid, key, ph.sort, now));
  }
  if (src.upi_qr_key) {
    const key = `qr/${gid}/${crypto.randomUUID()}`;
    stmts.push(await copyFile(src.upi_qr_key, key));
    stmts.push(db.prepare('UPDATE grounds SET upi_qr_key = ? WHERE id = ?').bind(key, gid));
  }
  await db.batch(stmts);

  // A few made-up bookings over the next days so the owner and helper screens aren't empty.
  const units = await unitsWithPrices(db, gid);
  if (units.length) {
    const close = Math.min(src.close_hour, 24), plan = [[1, close - 3, 0], [1, close - 2, 1], [2, close - 4, 2], [2, close - 2, 3], [3, close - 3, 4]];
    for (const [dayOffset, hour, who] of plan) {
      const unit = units[who % units.length], date = addDays(t, dayOffset);
      if (hour < src.open_hour) continue;
      const amount = (await db.prepare(`SELECT amount FROM prices WHERE unit_id = ? AND day_type = ?`).bind(unit.id, [0, 6].includes(new Date(date + 'T00:00:00Z').getUTCDay()) ? 'weekend' : 'weekday').first())?.amount || 0;
      await insertBooking(db, {
        groundId: gid, unitId: unit.id, date, hour, mask: unit.mask, kind: 'customer', status: 'CONFIRMED',
        name: DEMO_PEOPLE[who][0], phone: DEMO_PEOPLE[who][1], amount, now, decidedAt: now, paidVia: 'upi',
      }).catch(() => {});
    }
  }
  await log(db, email, gid, 'Demo ground created', `copy of ${src.name}`);
  await log(db, email, src.id, 'Duplicated as demo', `${name} (/${slug})`);
  return json({ id: gid, slug, name, phone, pin }, 201);
}
