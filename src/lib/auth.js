// Owner / helper login with phone + PIN. Sessions live in D1; the browser holds an HttpOnly cookie.
import { HttpError, cleanPhone, randomToken, sha256, verifyPin } from './util.js';
import { isAdminEmail, verifyGoogle } from './google.js';

const COOKIE = 'gb_session';
const SESSION_DAYS = 30;
const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;

function cookieValue(request) {
  const raw = request.headers.get('cookie') || '';
  const m = raw.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return m ? m[1] : null;
}

function cookieHeader(value, maxAgeSec, secure) {
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure ? '; Secure' : ''}`;
}

export async function login(db, request, { phone, pin }) {
  const p = cleanPhone(phone);
  const now = Date.now();
  const attempt = await db.prepare('SELECT * FROM login_attempts WHERE key = ?').bind(p).first();
  if (attempt && attempt.failures >= MAX_FAILURES && now - attempt.window_start < LOCK_MS) {
    throw new HttpError(429, 'Too many wrong PINs. Try again in 15 minutes.', 'locked');
  }
  const { results } = await db
    .prepare(
      `SELECT s.*, g.name AS ground_name, g.slug, g.service, g.service_note FROM staff s JOIN grounds g ON g.id = s.ground_id
        WHERE s.phone = ? AND s.active = 1 AND g.active = 1 ORDER BY s.role = 'owner' DESC, s.id`
    )
    .bind(p)
    .all();
  let staff = null;
  for (const s of results) {
    if (await verifyPin(String(pin || ''), s.pin_hash)) {
      staff = s;
      break;
    }
  }
  if (staff && staff.service === 'locked') throw lockedError(staff);
  if (!staff) {
    const fresh = !attempt || now - attempt.window_start >= LOCK_MS;
    await db
      .prepare(
        `INSERT INTO login_attempts (key, failures, window_start) VALUES (?, 1, ?)
         ON CONFLICT(key) DO UPDATE SET failures = ?, window_start = ?`
      )
      .bind(p, now, fresh ? 1 : attempt.failures + 1, fresh ? now : attempt.window_start)
      .run();
    throw new HttpError(401, 'Wrong phone number or PIN', 'bad_login');
  }
  await db.prepare('DELETE FROM login_attempts WHERE key = ?').bind(p).run();
  return { staff, setCookie: await startSession(db, request, staff.id) };
}

function lockedError(staff) {
  return new HttpError(403, `${staff.ground_name} is locked by GoArena.${staff.service_note ? ` ${staff.service_note}` : ''} Please contact GoArena.`, 'locked');
}

export async function startSession(db, request, staffId) {
  const now = Date.now();
  const token = randomToken(32);
  await db.batch([
    db.prepare('UPDATE staff SET last_login_at = ? WHERE id = ?').bind(now, staffId),
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
    db.prepare('INSERT INTO sessions (token_hash, staff_id, expires_at) VALUES (?,?,?)').bind(await sha256(token), staffId, now + SESSION_DAYS * 86400000),
  ]);
  const secure = new URL(request.url).protocol === 'https:';
  return cookieHeader(token, SESSION_DAYS * 86400, secure);
}

// Log in with a Google account that was linked earlier (Settings → Sign in with Google).
export async function loginWithGoogle(env, request, { credential }) {
  const who = await verifyGoogle(env, credential);
  const staff = await env.DB
    .prepare(
      `SELECT s.*, g.name AS ground_name, g.slug, g.service, g.service_note FROM staff s JOIN grounds g ON g.id = s.ground_id
        WHERE s.google_sub = ? AND s.active = 1 AND g.active = 1 ORDER BY s.role = 'owner' DESC, s.id LIMIT 1`
    )
    .bind(who.sub)
    .first();
  if (!staff) {
    throw new HttpError(404, `${who.email || 'This Google account'} isn't linked to a ground yet. Log in with your phone and PIN once, then turn on Google sign-in in Settings. New ground? Tap "List your ground".`, 'not_linked');
  }
  if (staff.service === 'locked') throw lockedError(staff);
  return { staff, setCookie: await startSession(env.DB, request, staff.id) };
}

export async function logout(db, request) {
  const token = cookieValue(request);
  if (token) await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
  const secure = new URL(request.url).protocol === 'https:';
  return cookieHeader('', 0, secure);
}

// Returns the logged-in staff member (with ground info) or throws 401.
export async function requireStaff(db, request, roles = ['owner', 'helper']) {
  const token = cookieValue(request);
  if (!token) throw new HttpError(401, 'Please log in', 'auth');
  const s = await db
    .prepare(
      `SELECT st.id, st.ground_id, st.role, st.name, st.phone FROM sessions se
         JOIN staff st ON st.id = se.staff_id JOIN grounds g ON g.id = st.ground_id
        WHERE se.token_hash = ? AND se.expires_at > ? AND st.active = 1 AND g.active = 1 AND g.service <> 'locked'`
    )
    .bind(await sha256(token), Date.now())
    .first();
  if (!s) throw new HttpError(401, 'Please log in', 'auth');
  if (!roles.includes(s.role)) throw new HttpError(403, 'Not allowed', 'forbidden');
  return s;
}

// ---------- GoArena admin (approves new grounds). Admins are listed in the ADMIN_EMAILS variable.
const ADMIN_COOKIE = 'gb_admin';

export async function adminLogin(env, request, { credential }) {
  const who = await verifyGoogle(env, credential);
  if (!isAdminEmail(env, who.email)) throw new HttpError(403, `${who.email} is not a GoArena admin`, 'forbidden');
  const token = randomToken(32);
  await env.DB.prepare('INSERT INTO admin_sessions (token_hash, email, expires_at) VALUES (?,?,?)')
    .bind(await sha256(token), who.email, Date.now() + 7 * 86400000).run();
  const secure = new URL(request.url).protocol === 'https:';
  return `${ADMIN_COOKIE}=${token}; Path=/api/admin; HttpOnly; SameSite=Lax; Max-Age=${7 * 86400}${secure ? '; Secure' : ''}`;
}

export async function requireAdmin(env, request) {
  const raw = request.headers.get('cookie') || '';
  const m = raw.match(new RegExp(`(?:^|;\\s*)${ADMIN_COOKIE}=([^;]+)`));
  const row = m && await env.DB.prepare('SELECT email FROM admin_sessions WHERE token_hash = ? AND expires_at > ?').bind(await sha256(m[1]), Date.now()).first();
  if (!row || !isAdminEmail(env, row.email)) throw new HttpError(401, 'Please sign in as admin', 'admin_auth');
  return row.email;
}
