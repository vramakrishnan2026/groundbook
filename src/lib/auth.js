// Owner / helper login with phone + PIN. Sessions live in D1; the browser holds an HttpOnly cookie.
import { HttpError, cleanPhone, randomToken, sha256, verifyPin } from './util.js';

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
      `SELECT s.*, g.name AS ground_name, g.slug FROM staff s JOIN grounds g ON g.id = s.ground_id
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
  const token = randomToken(32);
  await db.batch([
    db.prepare('DELETE FROM login_attempts WHERE key = ?').bind(p),
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
    db
      .prepare('INSERT INTO sessions (token_hash, staff_id, expires_at) VALUES (?,?,?)')
      .bind(await sha256(token), staff.id, now + SESSION_DAYS * 86400000),
  ]);
  const secure = new URL(request.url).protocol === 'https:';
  return { staff, setCookie: cookieHeader(token, SESSION_DAYS * 86400, secure) };
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
        WHERE se.token_hash = ? AND se.expires_at > ? AND st.active = 1 AND g.active = 1`
    )
    .bind(await sha256(token), Date.now())
    .first();
  if (!s) throw new HttpError(401, 'Please log in', 'auth');
  if (!roles.includes(s.role)) throw new HttpError(403, 'Not allowed', 'forbidden');
  return s;
}
