// GoArena master admin: every ground, its numbers, its subscription, and remote controls.
// Every change is written to admin_log.
import { startSession } from '../lib/auth.js';
import { HttpError, addDays, bad, cleanPhone, cleanText, hashPin, isDate, json, localNow, readJson } from '../lib/util.js';

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
    helpers: g.helpers || 0, google: !!g.owner_google,
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
            (SELECT COUNT(*) FROM staff h WHERE h.ground_id = g.id AND h.role = 'helper' AND h.active = 1) AS helpers
       FROM grounds g LEFT JOIN staff o ON o.id = (SELECT id FROM staff WHERE ground_id = g.id AND role = 'owner' ORDER BY id LIMIT 1)
      WHERE g.active = 1 ORDER BY g.approved, g.created_at DESC LIMIT 500`
  ).bind(from, from).all();
  const grounds = results.map((g) => summary(g, t));
  const n = (f) => grounds.filter(f).length;
  const sixMonthsAgo = addMonths(t, -5).slice(0, 7) + '-01';
  const [income, payments, activity] = await Promise.all([
    db.prepare(`SELECT substr(paid_on, 1, 7) AS month, SUM(amount) AS total, COUNT(*) AS n FROM sub_payments WHERE paid_on >= ? GROUP BY month ORDER BY month`).bind(sixMonthsAgo).all(),
    db.prepare(`SELECT p.*, g.name AS ground FROM sub_payments p JOIN grounds g ON g.id = p.ground_id ORDER BY p.id DESC LIMIT 12`).all(),
    db.prepare(`SELECT l.*, g.name AS ground FROM admin_log l LEFT JOIN grounds g ON g.id = l.ground_id ORDER BY l.id DESC LIMIT 15`).all(),
  ]);
  const months = Array.from({ length: 6 }, (_, i) => addMonths(sixMonthsAgo, i).slice(0, 7));
  return json({
    email, today: t, grounds,
    income: months.map((m) => { const r = income.results.find((x) => x.month === m); return { month: m, total: r ? r.total : 0, count: r ? r.n : 0 }; }),
    payments: payments.results.map((p) => ({ groundId: p.ground_id, ground: p.ground, amount: p.amount, months: p.months, paidOn: p.paid_on, note: p.note })),
    activity: activity.results.map((l) => ({ groundId: l.ground_id, ground: l.ground, action: l.action, detail: l.detail, email: l.email, at: l.at })),
    stats: {
      grounds: grounds.length, waiting: n((g) => !g.approved), paused: n((g) => g.service === 'paused'), locked: n((g) => g.service === 'locked'),
      overdue: n((g) => g.plan === 'overdue'), due: n((g) => g.plan === 'due'),
      monthlyPlans: grounds.filter((g) => g.approved && g.planEnabled && g.service !== 'locked').reduce((a, g) => a + g.planAmount, 0),
      onPlan: n((g) => g.planEnabled), free: n((g) => !g.planEnabled),
      bookings30: grounds.reduce((a, g) => a + g.bookings30, 0), revenue30: grounds.reduce((a, g) => a + g.revenue30, 0),
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
  const photos = await db.prepare('SELECT COUNT(*) AS n FROM photos WHERE ground_id = ?').bind(g.id).first();
  return json({
    today: t,
    ground: {
      id: g.id, slug: g.slug, name: g.name, area: g.area, approved: !!g.approved, email: g.signup_email,
      service: g.service, serviceNote: g.service_note, planAmount: g.plan_amount, paidUntil: g.paid_until, plan: planState(g, t), planEnabled: !!g.plan_enabled,
      adminNote: g.admin_note, autoPauseDays: g.auto_pause_days, createdAt: g.created_at,
      upiId: g.upi_id, razorpay: !!g.rzp_enabled, photos: photos.n, whatsapp: g.whatsapp,
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

