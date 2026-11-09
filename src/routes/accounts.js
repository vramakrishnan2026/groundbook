// Google sign-in linking, self-signup for new grounds, and the GoArena admin page.
import { startSession } from '../lib/auth.js';
import { googleEnabled, verifyGoogle } from '../lib/google.js';
import { notifyAdmin } from '../lib/notify.js';
import { HttpError, bad, cleanName, cleanPhone, cleanPin, cleanText, hashPin, json, readJson } from '../lib/util.js';

export const RESERVED_SLUGS = ['g', 'b', 'api', 'login', 'owner', 'helper', 'img', 'vendor', 'fonts', 'posters', 'admin', 'www', 'app', 'static', 'signup', 'start', 'terms', 'privacy', 'refunds', 'contact', 'about', 'pricing'];
const MAX_GROUNDS_PER_ACCOUNT = 3;

// The GoArena team's WhatsApp number, shown to owners as "WhatsApp us".
export const supportNumber = (env) => String(env.SUPPORT_WHATSAPP || '').replace(/\D/g, '') || null;

export function config(env) {
  return json({ googleClientId: googleEnabled(env) ? env.GOOGLE_CLIENT_ID : null, supportWhatsapp: supportNumber(env) });
}

// ---------- link / unlink Google on an existing owner or helper
export async function linkGoogle(env, me, request) {
  const who = await verifyGoogle(env, (await readJson(request)).credential);
  await env.DB.prepare('UPDATE staff SET google_sub = ?, google_email = ? WHERE id = ?').bind(who.sub, who.email, me.id).run();
  return json({ ok: true, email: who.email });
}

export async function unlinkGoogle(env, me) {
  await env.DB.prepare('UPDATE staff SET google_sub = NULL, google_email = NULL WHERE id = ?').bind(me.id).run();
  return json({ ok: true });
}

// ---------- self-signup: a new owner creates a ground; it waits for admin approval
function slugify(name) {
  return name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '') || 'ground';
}

export async function freeSlug(db, name) {
  const base = slugify(name);
  for (let i = 1; i < 50; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    if (RESERVED_SLUGS.includes(slug)) continue;
    if (!(await db.prepare('SELECT 1 FROM grounds WHERE slug = ?').bind(slug).first())) return slug;
  }
  throw bad('Could not make a link for that name. Try a slightly different name.', 'groundName');
}

export async function signup(env, request) {
  const db = env.DB;
  const body = await readJson(request);
  const who = await verifyGoogle(env, body.credential);
  const groundName = cleanName(body.groundName, 'groundName', 60);
  const area = cleanText(body.area, 80);
  const ownerName = cleanName(body.ownerName || who.name, 'ownerName', 60);
  const phone = cleanPhone(body.phone);
  const pin = cleanPin(body.pin);
  const split = body.layout !== 'single';

  const mine = await db.prepare(
    `SELECT COUNT(*) AS n, SUM(g.approved = 0) AS waiting FROM staff s JOIN grounds g ON g.id = s.ground_id
      WHERE s.google_sub = ? AND s.role = 'owner' AND g.active = 1`
  ).bind(who.sub).first();
  if (mine.waiting > 0) throw bad('Your ground is already waiting for approval. Log in with Google to finish setting it up.', 'dup');
  if (mine.n >= MAX_GROUNDS_PER_ACCOUNT) throw bad('This Google account already has the maximum number of grounds.', 'dup');

  const slug = await freeSlug(db, groundName);
  const now = Date.now();
  const facilities = JSON.stringify(['Floodlights', 'Parking', 'Drinking water']);
  const r = await db.prepare(
    `INSERT INTO grounds (slug, name, area, whatsapp, facilities, open_hour, close_hour, created_at, approved, signup_email)
     VALUES (?,?,?,?,?,6,23,?,0,?)`
  ).bind(slug, groundName, area, phone, facilities, now, who.email).run();
  const gid = r.meta.last_row_id;
  const units = split
    ? [['FULL', 'Full ground', '8-a-side', 3, 1200, 1500], ['HALF_A', 'Half A', '5-a-side', 1, 700, 900], ['HALF_B', 'Half B', '5-a-side', 2, 700, 900]]
    : [['MAIN', 'Ground', '', 1, 1000, 1200]];
  const stmts = [];
  units.forEach(([code, name, sub, mask], i) =>
    stmts.push(db.prepare('INSERT INTO units (ground_id, code, name, subtitle, mask, sort) VALUES (?,?,?,?,?,?)').bind(gid, code, name, sub, mask, i)));
  units.forEach(([code, , , , wd, we]) => {
    stmts.push(db.prepare(`INSERT INTO prices (unit_id, day_type, amount) SELECT id, 'weekday', ? FROM units WHERE ground_id = ? AND code = ?`).bind(wd, gid, code));
    stmts.push(db.prepare(`INSERT INTO prices (unit_id, day_type, amount) SELECT id, 'weekend', ? FROM units WHERE ground_id = ? AND code = ?`).bind(we, gid, code));
  });
  stmts.push(db.prepare(
    `INSERT INTO staff (ground_id, role, name, phone, pin_hash, created_at, google_sub, google_email) VALUES (?, 'owner', ?, ?, ?, ?, ?, ?)`
  ).bind(gid, ownerName, phone, await hashPin(pin), now, who.sub, who.email));
  await db.batch(stmts);
  const staff = await db.prepare('SELECT id FROM staff WHERE ground_id = ? AND role = ?').bind(gid, 'owner').first();
  const base = (env.PUBLIC_URL || new URL(request.url).origin).replace(/\/+$/, '');
  await notifyAdmin(env, [
    'New ground on GoArena, waiting for your approval',
    `${groundName}${area ? ', ' + area : ''}`,
    `Owner: ${ownerName}, ${phone}`,
    `Google: ${who.email}`,
    `${split ? 'Full ground and two halves' : 'One court'}`,
    `Check and approve: ${base}/admin/g/${gid}`,
  ].join('\n'), { groundId: gid });
  return json({ slug, role: 'owner' }, 201, { 'set-cookie': await startSession(db, request, staff.id) });
}
