// Longer bookings: 1-hour minimum, then the ground's step (30 or 60 minutes). Run: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv } from '../scripts/dev-server.mjs';
import { handleApi } from '../src/worker.js';
import { addDays, dayType, durLabel, localNow, minLabel } from '../src/lib/util.js';
import { halvesOf, priceForDur } from '../src/lib/bookings.js';
import { slotStartMs } from '../src/lib/refunds.js';

const BASE = 'http://local.test';
const tomorrow = addDays(localNow(330).date, 1);
const fullPrice = dayType(tomorrow) === 'weekend' ? 1500 : 1200;
const halfPrice = dayType(tomorrow) === 'weekend' ? 900 : 700;

function client(env) {
  let cookie = '';
  const call = async (method, path, body) => {
    const init = { method, headers: { 'cf-connecting-ip': '1.1.1.' + Math.floor(Math.random() * 250) } };
    if (cookie) init.headers.cookie = cookie;
    if (body !== undefined) { init.body = JSON.stringify(body); init.headers['content-type'] = 'application/json'; }
    const res = await handleApi(new Request(BASE + path, init), env);
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    return { status: res.status, body: await res.json() };
  };
  return { call };
}

let phoneN = 0;
async function setup(step) {
  const env = await makeEnv();
  const c = client(env), o = client(env);
  const g = (await c.call('GET', '/api/g/demo')).body;
  const unit = (code) => g.units.find((u) => u.code === code).id;
  assert.equal((await o.call('POST', '/api/auth/login', { phone: '9847012345', pin: '1234' })).status, 200);
  if (step) assert.equal((await o.call('PUT', '/api/owner/settings', { ground: { stepMin: step } })).status, 200);
  const hold = (unitId, start, dur) =>
    c.call('POST', '/api/g/demo/bookings', { unitId, date: tomorrow, start, dur, name: 'Test Player', phone: `90000${String(++phoneN).padStart(5, '0')}` });
  const slots = async () => (await c.call('GET', `/api/g/demo/slots?date=${tomorrow}`)).body;
  return { env, c, o, g, hold, slots, FULL: unit('FULL'), A: unit('HALF_A'), B: unit('HALF_B') };
}

test('labels and helpers', () => {
  assert.equal(minLabel(18 * 60), '6 PM');
  assert.equal(minLabel(18 * 60 + 30), '6:30 PM');
  assert.equal(minLabel(24 * 60), '12 AM');
  assert.equal(durLabel(60), '1 hour');
  assert.equal(durLabel(90), '1 h 30 min');
  assert.equal(durLabel(120), '2 hours');
  assert.deepEqual(halvesOf(18 * 60, 90), [36, 37, 38]);
  assert.equal(priceForDur(1200, 90), 1800);
  assert.equal(priceForDur(700, 150), 1750);
  assert.equal(new Date(slotStartMs({ date: '2026-11-08', start_min: 20 * 60 + 30 })).toISOString(), '2026-11-08T15:00:00.000Z');
});

test('grounds book in whole hours by default; owner can switch to 30 minutes', async () => {
  const { g, o, hold, FULL } = await setup();
  assert.equal(g.ground.stepMin, 60);
  assert.equal((await hold(FULL, 18 * 60 + 30, 60)).status, 400); // half-hour start not allowed
  assert.equal((await hold(FULL, 18 * 60, 90)).status, 400);      // 1.5 h not allowed
  assert.equal((await hold(FULL, 18 * 60, 120)).status, 201);
  assert.equal((await o.call('PUT', '/api/owner/settings', { ground: { stepMin: 45 } })).status, 400);
  assert.equal((await o.call('PUT', '/api/owner/settings', { ground: { stepMin: 30 } })).body.ground.stepMin, 30);
});

test('30-minute step: minimum 1 hour, half-hour starts, pro-rata price, max 4 hours', async () => {
  const { c, hold, FULL } = await setup(30);
  assert.equal((await hold(FULL, 18 * 60, 30)).status, 400);        // under 1 hour
  assert.equal((await hold(FULL, 7 * 60, 270)).status, 400);        // over 4 hours
  const r = await hold(FULL, 18 * 60 + 30, 90);
  assert.equal(r.status, 201);
  const b = (await c.call('GET', `/api/b/${r.body.token}`)).body.booking;
  assert.equal(b.amount, fullPrice * 1.5);
  assert.equal(b.timeLabel, '6:30 PM – 8 PM');
  assert.equal(b.durLabel, '1 h 30 min');
  assert.equal(b.start, 18 * 60 + 30);
});

test('bookings cannot overlap by half an hour, but can sit back to back', async () => {
  const { hold, slots, FULL, A, B } = await setup(30);
  assert.equal((await hold(FULL, 18 * 60, 90)).status, 201);          // 6 – 7:30 PM
  assert.equal((await hold(A, 19 * 60, 60)).status, 409);             // 7 – 8 PM clashes 7 – 7:30
  assert.equal((await hold(B, 17 * 60 + 30, 60)).status, 409);        // 5:30 – 6:30 clashes
  assert.equal((await hold(A, 19 * 60 + 30, 60)).status, 201);        // 7:30 – 8:30 back to back
  assert.equal((await hold(B, 16 * 60 + 30, 90)).status, 201);        // 4:30 – 6 back to back
  const s = await slots();
  const cell = (m) => s.cells.find((x) => x.start === m).units;
  assert.equal(cell(19 * 60).FULL, undefined);
  assert.equal(cell(19 * 60)[FULL], 'taken');
  assert.equal(cell(19 * 60 + 30)[B], 'free');
  assert.equal(cell(19 * 60 + 30)[FULL], 'taken');
  assert.equal(s.hours.find((x) => x.hour === 19).units[B], 'taken'); // the hour view counts a taken half
  assert.equal(s.step, 30);
  assert.equal(s.minDur, 60);
});

test('booking past closing time is refused', async () => {
  const { g, hold, FULL } = await setup(30);
  const close = (await hold(FULL, 0, 60)).status; // before opening
  assert.equal(close, 400);
  const s = await (await setup(30)).slots();
  const last = s.cells[s.cells.length - 1].start;
  assert.equal((await hold(FULL, last, 60)).status, 400);       // runs 30 min past closing
  assert.equal((await hold(FULL, last - 30, 60)).status, 201);  // ends exactly at closing
  assert.ok(g);
});

test('owner walk-ins and closures take any 30-minute length; price is pro-rata', async () => {
  const { o, hold, A, FULL } = await setup();   // ground still on whole hours
  const w = await o.call('POST', '/api/owner/slots', { kind: 'walkin', unitId: A, date: tomorrow, start: 9 * 60, dur: 150, name: 'Walk-in team' });
  assert.equal(w.status, 200);
  assert.equal(w.body.booking.amount, Math.round(halfPrice * 2.5));
  assert.equal(w.body.booking.timeLabel, '9 AM – 11:30 AM');
  const blk = await o.call('POST', '/api/owner/slots', { kind: 'block', unitId: FULL, date: tomorrow, start: 12 * 60, dur: 30 });
  assert.equal(blk.status, 200);
  assert.equal((await hold(FULL, 12 * 60, 60)).status, 409);
  assert.equal((await o.call('POST', `/api/owner/bookings/${blk.body.booking.id}/cancel`)).status, 200);
  assert.equal((await hold(FULL, 12 * 60, 60)).status, 201);
  const cal = (await o.call('GET', `/api/owner/calendar?date=${tomorrow}`)).body;
  assert.equal(cal.step, 60);
  assert.ok(cal.bookings.some((b) => b.dur === 150 && b.start === 540));
});

test('old pages that send `hour` still book one hour', async () => {
  const { c, FULL } = await setup(30);
  const r = await c.call('POST', '/api/g/demo/bookings', { unitId: FULL, date: tomorrow, hour: 20, name: 'Old Page', phone: '9111111111' });
  assert.equal(r.status, 201);
  const b = (await c.call('GET', `/api/b/${r.body.token}`)).body.booking;
  assert.equal(b.timeLabel, '8 PM – 9 PM');
  assert.equal(b.hour, 20);
});
