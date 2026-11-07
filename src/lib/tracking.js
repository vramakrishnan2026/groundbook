// Small counters and an error log, so GoArena can see how each ground is doing and debug remotely.
import { localNow } from './util.js';

export async function countVisit(db, groundId, field) {
  if (!['views', 'slot_views'].includes(field)) return;
  await db.prepare(
    `INSERT INTO ground_daily (ground_id, date, ${field}) VALUES (?, ?, 1)
     ON CONFLICT(ground_id, date) DO UPDATE SET ${field} = ${field} + 1`
  ).bind(groundId, localNow(330).date).run().catch(() => {});
}

const MAX_PER_DAY = 2000; // stops a broken page (or abuse) from filling the table

export async function logError(db, { groundId = null, source = 'server', path = '', status = null, code = '', message = '' }) {
  try {
    const since = Date.now() - 86400000;
    const n = await db.prepare('SELECT COUNT(*) AS n FROM error_log WHERE at > ?').bind(since).first();
    if (n && n.n >= MAX_PER_DAY) return;
    await db.prepare('INSERT INTO error_log (ground_id, source, path, status, code, message, at) VALUES (?,?,?,?,?,?,?)')
      .bind(groundId, source, String(path).slice(0, 200), status, String(code || '').slice(0, 40), String(message || '').slice(0, 500), Date.now()).run();
  } catch { /* logging must never break a request */ }
}

// Which ground does an API path belong to? (Cheap lookups only.)
export async function groundIdForPath(db, path) {
  let m;
  try {
    if ((m = path.match(/^\/api\/g\/([\w-]+)/))) return (await db.prepare('SELECT id FROM grounds WHERE slug = ?').bind(m[1]).first())?.id ?? null;
    if ((m = path.match(/^\/api\/b\/([\w-]+)/))) return (await db.prepare('SELECT ground_id FROM bookings WHERE token = ?').bind(m[1]).first())?.ground_id ?? null;
  } catch { /* ignore */ }
  return null;
}

export async function pruneLogs(db) {
  await db.prepare('DELETE FROM error_log WHERE at < ?').bind(Date.now() - 30 * 86400000).run();
}
