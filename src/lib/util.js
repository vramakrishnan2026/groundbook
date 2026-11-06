// Small helpers shared by every route. No dependencies: only Web APIs available in Workers.

export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code || 'error';
  }
}

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });

export const bad = (msg, code = 'bad_request') => new HttpError(400, msg, code);

export async function readJson(request) {
  const type = request.headers.get('content-type') || '';
  if (!type.includes('application/json')) throw new HttpError(415, 'Expected JSON');
  try {
    return await request.json();
  } catch {
    throw bad('Invalid JSON');
  }
}

// ---------- validation ----------
export function cleanPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
  if (!/^[6-9]\d{9}$/.test(digits)) throw bad('Enter a valid 10-digit mobile number', 'phone');
  return digits;
}

export function cleanName(raw, field = 'name', max = 60) {
  const s = String(raw || '').replace(/\s+/g, ' ').trim();
  if (s.length < 2) throw bad('Please enter a name', field);
  return s.slice(0, max);
}

export function cleanText(raw, max = 200) {
  return String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function cleanUtr(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!/^\d{12}$/.test(digits)) throw bad('The UPI reference number has 12 digits', 'utr');
  return digits;
}

export function isDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));
}

export function int(v, field) {
  const n = Number(v);
  if (!Number.isInteger(n)) throw bad(`Invalid ${field}`);
  return n;
}

// ---------- time (ground local time) ----------
export function localNow(tzOffsetMin, now = Date.now()) {
  const d = new Date(now + tzOffsetMin * 60000);
  return { date: d.toISOString().slice(0, 10), hour: d.getUTCHours(), minute: d.getUTCMinutes() };
}

export function addDays(date, n) {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function dayType(date) {
  const dow = new Date(date + 'T00:00:00Z').getUTCDay();
  return dow === 0 || dow === 6 ? 'weekend' : 'weekday';
}

export function mondayOf(date) {
  const dow = new Date(date + 'T00:00:00Z').getUTCDay(); // 0 = Sunday
  return addDays(date, dow === 0 ? -6 : 1 - dow);
}

export function hourLabel(h) {
  const hh = ((h + 11) % 12) + 1;
  return `${hh} ${h < 12 || h === 24 ? 'AM' : 'PM'}`;
}

// ---------- randomness & crypto ----------
const B32 = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L

export function randomToken(bytes = 24) {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomRef() {
  const a = crypto.getRandomValues(new Uint8Array(5));
  return 'GB-' + Array.from(a, (b) => B32[b % B32.length]).join('');
}

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return b64(buf);
}

const PBKDF2_ITERATIONS = 100000; // Workers cap PBKDF2 at 100k iterations

async function pbkdf2(pin, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
}

export async function hashPin(pin) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(pin, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64(salt)}$${b64(hash)}`;
}

export async function verifyPin(pin, stored) {
  const [scheme, iter, salt, hash] = String(stored).split('$');
  if (scheme !== 'pbkdf2') return false;
  const got = new Uint8Array(await pbkdf2(pin, unb64(salt), Number(iter)));
  const want = unb64(hash);
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ want[i];
  return diff === 0;
}

export function cleanPin(raw) {
  const pin = String(raw || '');
  if (!/^\d{4,6}$/.test(pin)) throw bad('PIN must be 4 to 6 digits', 'pin');
  return pin;
}

export function bitsOf(mask) {
  const out = [];
  for (let b = 0; b < 16; b++) if (mask & (1 << b)) out.push(1 << b);
  return out;
}
