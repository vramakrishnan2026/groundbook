// Runs the real GoArena app locally with a realistic sample ground and saves
// high-resolution screenshots of each screen for the intro slideshow.
import { chromium } from 'playwright';
import fs from 'node:fs';
import { makeEnv, createServer } from '/home/claude/groundbook/scripts/dev-server.mjs';
import { handleApi } from '/home/claude/groundbook/src/worker.js';
import { files } from '/home/claude/groundbook/src/lib/files.js';
import { addDays, localNow } from '/home/claude/groundbook/src/lib/util.js';
import { fakeRazorpay, KEY_ID, KEY_SECRET } from '/home/claude/groundbook/tests/fake-razorpay.mjs';
import { fakeGoogle } from '/home/claude/groundbook/tests/fake-google.mjs';

const OUT = '/home/claude/goarena-intro/shots';
const rzp = fakeRazorpay();
const google = await fakeGoogle();
const env = Object.assign(await makeEnv(), {
  RZP_FETCH: rzp.fetchFn, SECRETS_KEY: 'k'.repeat(32), PUBLIC_URL: 'https://book.goarena.in',
  GOOGLE_CLIENT_ID: google.clientId, GOOGLE_FETCH: google.fetch, ADMIN_EMAILS: 'goarena2026@gmail.com',
});
const db = env.DB;

// ---------- API helper with a cookie jar
function client() {
  const jar = {};
  return async (method, path, body, raw) => {
    const headers = { 'cf-connecting-ip': '10.0.0.' + Math.floor(Math.random() * 250) };
    const c = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
    if (c) headers.cookie = c;
    let b;
    if (raw) b = raw;
    else if (body !== undefined) { b = JSON.stringify(body); headers['content-type'] = 'application/json'; }
    const res = await handleApi(new Request('http://local.test' + path, { method, headers, body: b }), env);
    const sc = res.headers.get('set-cookie');
    if (sc) { const [kv] = sc.split(';'); const i = kv.indexOf('='); jar[kv.slice(0, i)] = kv.slice(i + 1); }
    const j = await res.json().catch(() => ({}));
    if (res.status >= 400) throw new Error(`${method} ${path} ${res.status} ${JSON.stringify(j)}`);
    return j;
  };
}
const owner = client(), cust = client();

// ---------- the sample ground
await owner('POST', '/api/auth/login', { phone: '9847012345', pin: '1234' });
await owner('PUT', '/api/owner/settings', { ground: {
  name: 'Green Field Turf', area: 'Edappally, Kochi', mapsUrl: 'https://maps.google.com/?q=Edappally+Kochi', whatsapp: '9847012345',
  about: 'Floodlit FIFA-grade turf, 5 minutes from Lulu Mall. Full ground for 8-a-side, or split into two 5-a-side halves.',
  facilities: ['Floodlights', 'Parking', 'Drinking water', 'Changing room', 'Washroom', 'First aid'],
  openHour: 6, closeHour: 24, holdMinutes: 30, cancelHours: 24,
} });
for (const f of ['/home/claude/photos/llab-toof-3-ground.jpg', '/home/claude/photos/llab-toof-1-player.jpg', '/home/claude/photos/llab-toof-2-goal.jpg', '/home/claude/groundbook/public/img/stadium.jpg']) {
  const key = `photos/1/${crypto.randomUUID()}`;
  await files(env).put(key, fs.readFileSync(f), { contentType: 'image/jpeg' });
  const n = (await db.prepare('SELECT COUNT(*) AS n FROM photos WHERE ground_id = 1').first()).n;
  await db.prepare('INSERT INTO photos (ground_id, r2_key, sort, created_at) VALUES (1,?,?,?)').bind(key, n, Date.now()).run();
}
await owner('PUT', '/api/owner/razorpay', { keyId: KEY_ID, keySecret: KEY_SECRET });

// ---------- bookings for tomorrow
const g = await cust('GET', '/api/g/demo');
const U = Object.fromEntries(g.units.map((u) => [u.code, u.id]));
const day = localNow(330).date; // today, so the owner's Today screen is busy
const tomorrow = addDays(day, 1);
const day2 = addDays(localNow(330).date, 3);
const hold = (unit, hour, name, phone, date = day) => cust('POST', '/api/g/demo/bookings', { unitId: U[unit], date, hour, name, phone });
const payOnline = async (token) => { const o = await cust('POST', `/api/b/${token}/razorpay-order`); await cust('POST', `/api/b/${token}/razorpay-verify`, rzp.pay(o.orderId, 'captured')); };
const proof = async (token, utr) => {
  const fd = new FormData();
  fd.set('utr', utr);
  fd.set('screenshot', new Blob([fs.readFileSync('/home/claude/goarena-intro/in/sample-upi-receipt.png')], { type: 'image/png' }), 'receipt.png');
  return cust('POST', `/api/b/${token}/proof`, undefined, fd);
};
const idOf = async (token) => (await db.prepare('SELECT id FROM bookings WHERE token = ?').bind(token).first()).id;

await owner('POST', '/api/owner/slots', { unitId: U.HALF_A, date: day, hour: 18, kind: 'walkin', name: 'Faisal', phone: '9946012345' });
await owner('POST', '/api/owner/slots', { unitId: U.HALF_A, date: day, hour: 23, kind: 'block', note: 'Turf maintenance' });
const a = await hold('FULL', 21, 'Arjun K', '9847011111'); await payOnline(a.token);
const n1 = await hold('HALF_B', 22, 'Nikhil Thomas', '9447077810'); await payOnline(n1.token);
const s1 = await hold('HALF_A', 20, 'Sreejith P', '9895012345'); await proof(s1.token, '412899321170');
const r1 = await hold('HALF_B', 19, 'Rahul Menon', '9846054321'); await payOnline(r1.token);
const far = await hold('FULL', 20, 'Vishnu R', '9037012345', day2); await payOnline(far.token);
await hold('HALF_A', 21, 'Deepak S', '9744012345', tomorrow).then((b) => payOnline(b.token));
// show a Live key on screens (payments above were made with the test key)
await db.prepare("UPDATE grounds SET rzp_key_id = 'rzp_live_Nf8kQ2xY7pLm3T' WHERE id = 1").run();
env.RZP_FETCH = (url, init) => rzp.fetchFn(url, { ...init, headers: { ...init.headers, authorization: 'Basic ' + btoa(`${KEY_ID}:${KEY_SECRET}`) } });
const sreejithId = await idOf(s1.token);
const rahulId = await idOf(r1.token);

// ---------- browser
const server = createServer(env).listen(0);
const base = `http://localhost:${server.address().port}`;
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
const GSI = `window.google={accounts:{id:{initialize(o){window.__gcb=o.callback},renderButton(el,o){el.innerHTML='<div style="display:flex;align-items:center;justify-content:center;gap:10px;height:44px;border-radius:999px;background:'+(o.theme==='filled_black'?'#131314':'#fff')+';color:'+(o.theme==='filled_black'?'#e3e3e3':'#1f1f1f')+';border:1px solid #747775;font:500 15px Roboto,Arial,sans-serif;width:100%"><svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.8 6C12.4 13.7 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.5 5.8c4.4-4 6.8-10 6.8-17.2z"/><path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.8-6z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.2-13.5-9.9l-7.8 6C6.6 42.6 14.6 48 24 48z"/></svg>Continue with Google</div>'},prompt(){}}}}`;

async function phone(name) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route(/fonts\.googleapis|fonts\.gstatic/, (r) => r.continue().catch(() => r.abort()));
  await ctx.route(/unsplash/, (r) => r.abort());
  await ctx.route('https://accounts.google.com/gsi/client', (r) => r.fulfill({ contentType: 'text/javascript', body: GSI }));
  await ctx.route('https://checkout.razorpay.com/**', (r) => r.fulfill({ contentType: 'text/javascript', body: 'window.Razorpay=function(){return{open(){},on(){}}}' }));
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log(name, 'pageerror', e.message));
  return p;
}
const shot = async (p, file, opts = {}) => { await p.waitForTimeout(opts.wait ?? 700); await p.screenshot({ path: `${OUT}/${file}.png`, ...opts.clip ? { clip: opts.clip } : {} }); console.log('saved', file); };
const login = async (p, phoneNo, pin) => { await p.goto(base + '/login'); await p.fill('#phone', phoneNo); await p.fill('#pin', pin); await p.click('button[type=submit]'); await p.waitForURL(/\/(owner|helper)$/); };

// Customer screens
let p = await phone('customer');
await p.goto(base + '/demo'); await shot(p, 'c1-ground');
await p.evaluate(() => scrollTo(0, 420)); await shot(p, 'c2-ground-details');
await p.goto(base + '/demo?step=slots');
await p.locator('.date').nth(1).click(); await p.waitForTimeout(400);
const unitBtns = p.locator('[data-act=unit]');
if (await unitBtns.count()) await unitBtns.first().click();
await p.waitForTimeout(300);
await p.locator('.slot:not([disabled])', { hasText: /^5 PM$/ }).first().click();
await shot(p, 'c3-slots');
await p.getByRole('button', { name: 'Continue' }).click(); await p.fill('#name', 'Anil Kumar'); await p.fill('#phone', '9846011223');
await shot(p, 'c4-details');
await p.getByRole('button', { name: /Hold slot/ }).click(); await p.waitForURL(/\/b\//);
await shot(p, 'c5-pay', { wait: 1200 });
await p.locator('summary', { hasText: /UPI ID/ }).click(); await p.waitForTimeout(400);
await p.evaluate(() => { const s = [...document.querySelectorAll('summary')].find((x) => /UPI ID/.test(x.textContent)); s && s.scrollIntoView({ block: 'start' }); scrollBy(0, -80); });
await shot(p, 'c6-pay-upi');
await p.goto(base + '/b/' + far.token); await shot(p, 'c7-confirmed');
await p.evaluate(() => scrollTo(0, 2000)); await shot(p, 'c8-confirmed-cancel');
p.once('dialog', (d) => d.accept());
await p.getByText('Cancel and get a full refund').click(); await p.getByText('has been sent').waitFor();
await p.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
await shot(p, 'c9-refunded');

// Login and signup
p = await phone('login');
await p.goto(base + '/login'); await p.waitForSelector('#gbtn div'); await shot(p, 'l1-login');
await p.goto(base + '/signup'); await p.waitForSelector('#gbtn div'); await shot(p, 'l2-signup');

// Owner screens
p = await phone('owner');
await login(p, '9847012345', '1234');
await shot(p, 'o1-today', { wait: 1000 });
await p.goto(base + `/owner/review/${sreejithId}`); await shot(p, 'o2-review', { wait: 1000 });
await p.goto(base + `/owner/calendar?date=${day}`); await p.waitForTimeout(500); await p.evaluate(() => { const c = [...document.querySelectorAll('.cal div')].find((x) => x.textContent.trim() === '5 PM'); c && c.scrollIntoView({ block: 'start' }); scrollBy(0, -150); }); await shot(p, 'o3-calendar', { wait: 900 });
await p.locator('.cell', { hasText: 'Rahul' }).first().click();
await p.getByRole('button', { name: 'Cancel booking' }).click(); await p.getByText("Cancel Rahul Menon's booking").waitFor();
await p.fill('input[name=reason]', 'Heavy rain'); await shot(p, 'o4-refund-sheet');
await p.keyboard.press('Escape').catch(() => {});
await p.goto(base + '/owner/settings'); await shot(p, 'o5-settings-top', { wait: 1000 });
await p.evaluate(() => { const h = [...document.querySelectorAll('.heading')].find((x) => /price/i.test(x.textContent)); if (h) h.scrollIntoView({ block: 'start' }); scrollBy(0, -70); });
await shot(p, 'o6-settings-prices');
await p.evaluate(() => { const h = [...document.querySelectorAll('.heading')].find((x) => /Razorpay/i.test(x.textContent)); if (h) h.scrollIntoView({ block: 'start' }); scrollBy(0, -70); });
await shot(p, 'o7-settings-razorpay');

// Helper
p = await phone('helper');
await login(p, '9946055321', '1111');
await shot(p, 'h1-helper', { wait: 1000 });

// Admin on a laptop
const lctx = await browser.newContext({ viewport: { width: 1360, height: 820 }, deviceScaleFactor: 2 });
await lctx.route(/unsplash/, (r) => r.abort());
await lctx.route('https://accounts.google.com/gsi/client', (r) => r.fulfill({ contentType: 'text/javascript', body: GSI }));
const lp = await lctx.newPage();
await lp.goto(base + '/admin'); await lp.waitForSelector('#gbtn div');
await lp.evaluate(async (c) => { await fetch('/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ credential: c }) }); }, await google.token({ sub: 'a', email: 'goarena2026@gmail.com' }));
await lp.goto(base + '/admin/g/1'); await shot(lp, 'a1-admin-ground', { wait: 1200 });

await browser.close(); server.close();
console.log('done');
