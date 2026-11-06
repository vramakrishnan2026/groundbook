// Image storage inside D1, so the app needs no R2 bucket.
// Images are resized on the phone before upload (≈200–400 KB), stored as base64 text.
// D1 allows up to 2 MB per value; base64 adds a third, so raw files are capped at 1.4 MB.
import { HttpError } from './util.js';

export const MAX_FILE_BYTES = 1_400_000;

function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function files(env) {
  const db = env.DB;
  return {
    async put(key, buf, { contentType }) {
      if (buf.byteLength > MAX_FILE_BYTES) throw new HttpError(400, 'That image is too large. Please try a smaller one.', 'too_large');
      await db
        .prepare(
          `INSERT INTO files (key, content_type, data, size, created_at) VALUES (?,?,?,?,?)
           ON CONFLICT(key) DO UPDATE SET content_type = excluded.content_type, data = excluded.data, size = excluded.size`
        )
        .bind(key, contentType, toBase64(buf), buf.byteLength, Date.now())
        .run();
    },
    async get(key) {
      const row = await db.prepare('SELECT content_type, data FROM files WHERE key = ?').bind(key).first();
      return row ? { body: fromBase64(row.data), contentType: row.content_type } : null;
    },
    async delete(key) {
      await db.prepare('DELETE FROM files WHERE key = ?').bind(key).run();
    },
  };
}
