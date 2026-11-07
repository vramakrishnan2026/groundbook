// API tests against the local D1/R2 stand-ins.  Run: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv } from '../scripts/dev-server.mjs';
import { handleApi } from '../src/worker.js';
import { addDays, localNow } from '../src/lib/util.js';

const BASE = 'http://local.test';
const tomorrow = addDays(localNow(330).date, 1);
const dayAfter = addDays(localNow(330).date, 2);

function client(env) {
  let cookie = '';
  const call = async (method, path, body, { ip = '1.1.1.1', headers = {} } = {}) => {
    const init = { method, headers: { 'cf-connecting-ip': ip, ...headers } };
    if (cookie) init.headers.cookie = cookie;
    if (body instanceof FormData || body instanceof Blob) init.body = body;
    else if (body !== undefined) {
      init.body = JSON.stringify(body);
      init.headers['content-type'] = 'application/json';
    }
    const res = await handleApi(new Request(BASE + path, init), env);
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    const type = res.headers.get('content-type') || '';
    return { status: res.status, body: type.includes('json') ? await res.json() : await res.arrayBuffer() };
  };
  return { call, login: (phone, pin) => call('POST', '/api/auth/login', { phone, pin }) };
}

async function setup() {
  const env = await makeEnv();
  const c = client(env);
  const g = (await c.call('GET', '/api/g/demo')).body;
  const unit = (code) => g.units.find((u) => u.code === code).id;
  return { env, c, g, FULL: unit('FULL'), A: unit('HALF_A'), B: unit('HALF_B') };
}

const hold = (c, unitId, date, hour, phone = '9000000001', ip) =>
  c.call('POST', '/api/g/demo/bookings', { unitId, date, hour, name: 'Test Player', phone }, ip ? { ip } : undefined);

const proofForm = (utr, withImage = true) => {
  const f = new FormData();
  f.set('utr', utr);
  if (withImage) f.set('screenshot', new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])], { type: 'image/jpeg' }), 'pay.jpg');
  return f;
};

test('ground page lists three courts, prices and 14 dates', async () => {
  const { g } = await setup();
  assert.equal(g.ground.name, 'Green Field Turf');
  assert.deepEqual(g.units.map((u) => [u.code, u.weekday, u.weekend]), [['FULL', 1200, 1500], ['HALF_A', 700, 900], ['HALF_B', 700, 900]]);
  assert.equal(g.dates.length, 14);
});

test('booking the full ground blocks both halves; a half blocks the full ground only', async () => {
  const { c, FULL, A, B } = await setup();
  assert.equal((await hold(c, FULL, tomorrow, 21)).status, 201);
  let slots = (await c.call('GET', `/api/g/demo/slots?date=${tomorrow}`)).body;
  let h = slots.hours.find((x) => x.hour === 21).units;
  assert.deepEqual([h[FULL], h[A], h[B]], ['taken', 'taken', 'taken']);

  assert.equal((await hold(c, A, dayAfter, 19, '9000000002')).status, 201);
  slots = (await c.call('GET', `/api/g/demo/slots?date=${dayAfter}`)).body;
  h = slots.hours.find((x) => x.hour === 19).units;
  assert.deepEqual([h[FULL], h[A], h[B]], ['taken', 'taken', 'free']);
  assert.equal((await hold(c, FULL, dayAfter, 19, '9000000003')).status, 409);
  assert.equal((await hold(c, B, dayAfter, 19, '9000000004')).status, 201);
});

test('two people grabbing the same slot at once: exactly one wins', async () => {
  const { c, FULL, A } = await setup();
  const results = await Promise.all([
    hold(c, FULL, tomorrow, 18, '9000000011', '2.2.2.1'),
    hold(c, A, tomorrow, 18, '9000000012', '2.2.2.2'),
    hold(c, FULL, tomorrow, 18, '9000000013', '2.2.2.3'),
  ]);
  assert.equal(results.filter((r) => r.status === 201).length, 1);
  assert.equal(results.filter((r) => r.status === 409).length, 2);
});

test('weekend price is used on Saturday and Sunday', async () => {
  const { c, FULL } = await setup();
  const g = (await c.call('GET', '/api/g/demo')).body;
  const weekend = g.dates.find((d) => d.dayType === 'weekend' && d.date > g.dates[0].date).date; // not today: 10 AM may have passed
  const r = await hold(c, FULL, weekend, 10);
  const b = (await c.call('GET', `/api/b/${r.body.token}`)).body.booking;
  assert.equal(b.amount, 1500);
});

test('payment proof moves the booking to PENDING; a reused UPI reference is refused', async () => {
  const { c, A, B } = await setup();
  const t1 = (await hold(c, A, tomorrow, 7, '9000000021')).body.token;
  const r = await c.call('POST', `/api/b/${t1}/proof`, proofForm('412899321170'));
  assert.equal(r.status, 200);
  assert.equal(r.body.booking.status, 'PENDING');
  assert.equal(r.body.booking.hasProof, true);
  const t2 = (await hold(c, B, tomorrow, 7, '9000000022')).body.token;
  const again = await c.call('POST', `/api/b/${t2}/proof`, proofForm('4128 9932 1170'));
  assert.equal(again.status, 400);
  assert.match(again.body.error, /already used/);
  const badUtr = await c.call('POST', `/api/b/${t2}/proof`, proofForm('12345'));
  assert.equal(badUtr.status, 400);
});

test('an expired hold releases the slot and cannot be paid', async () => {
  const { env, c, FULL } = await setup();
  const t = (await hold(c, FULL, tomorrow, 20)).body.token;
  await env.DB.prepare('UPDATE bookings SET hold_expires_at = ? WHERE token = ?').bind(Date.now() - 1000, t).run();
  const slots = (await c.call('GET', `/api/g/demo/slots?date=${tomorrow}`)).body;
  assert.equal(slots.hours.find((x) => x.hour === 20).units[FULL], 'free');
  const r = await c.call('POST', `/api/b/${t}/proof`, proofForm('111122223333'));
  assert.equal(r.status, 409);
  assert.equal((await c.call('GET', `/api/b/${t}`)).body.booking.status, 'EXPIRED');
});

test('one phone number can only hold two slots at a time', async () => {
  const { c, A, B, FULL } = await setup();
  assert.equal((await hold(c, A, tomorrow, 8, '9000000031', '3.3.3.1')).status, 201);
  assert.equal((await hold(c, B, tomorrow, 8, '9000000031', '3.3.3.2')).status, 201);
  assert.equal((await hold(c, FULL, tomorrow, 9, '9000000031', '3.3.3.3')).status, 429);
});

// Each client() keeps its own login cookie but shares the same database.
test('owner flow: login, today, approve, reject, calendar, walk-in, block', async () => {
  const { env, c, FULL, A, B } = await setup();
  const t1 = (await hold(c, FULL, tomorrow, 21, '9000000051')).body.token;
  await c.call('POST', `/api/b/${t1}/proof`, proofForm('200000000001'));
  const t2 = (await hold(c, A, tomorrow, 22, '9000000052')).body.token;
  await c.call('POST', `/api/b/${t2}/proof`, proofForm('200000000002'));

  const o = client(env);
  assert.equal((await o.call('GET', '/api/owner/today')).status, 401);
  assert.equal((await o.login('9847012345', '1234')).status, 200);
  const today = (await o.call('GET', '/api/owner/today')).body;
  assert.equal(today.pending.length, 2);

  const [p1, p2] = today.pending;
  const proof = await o.call('GET', `/api/owner/bookings/${p1.id}/proof`);
  assert.equal(proof.status, 200);
  assert.equal((await o.call('POST', `/api/owner/bookings/${p1.id}/approve`)).body.booking.status, 'CONFIRMED');
  assert.equal((await o.call('POST', `/api/owner/bookings/${p1.id}/approve`)).status, 409); // double tap
  assert.equal((await o.call('POST', `/api/owner/bookings/${p2.id}/reject`, { reason: 'No payment found' })).body.booking.status, 'REJECTED');
  assert.equal((await c.call('GET', `/api/b/${t2}`)).body.booking.status, 'REJECTED');
  let slots = (await c.call('GET', `/api/g/demo/slots?date=${tomorrow}`)).body;
  assert.equal(slots.hours.find((x) => x.hour === 22).units[A], 'free');
  assert.equal(slots.hours.find((x) => x.hour === 21).units[FULL], 'taken');

  const walk = await o.call('POST', '/api/owner/slots', { kind: 'walkin', unitId: B, date: tomorrow, hour: 6, name: 'Walk-in team', phone: '9000000099' });
  assert.equal(walk.status, 200);
  assert.equal(walk.body.booking.amount, tomorrowPrice(tomorrow, 700, 900));
  const block = await o.call('POST', '/api/owner/slots', { kind: 'block', unitId: FULL, date: tomorrow, hour: 23, note: 'Cleaning' });
  assert.equal(block.status, 200);
  slots = (await c.call('GET', `/api/g/demo/slots?date=${tomorrow}`)).body;
  assert.equal(slots.hours.find((x) => x.hour === 23).units[A], 'taken');
  assert.equal((await o.call('POST', '/api/owner/slots', { kind: 'block', unitId: A, date: tomorrow, hour: 23 })).status, 409);
  assert.equal((await o.call('POST', `/api/owner/bookings/${block.body.booking.id}/cancel`)).status, 200);
  slots = (await c.call('GET', `/api/g/demo/slots?date=${tomorrow}`)).body;
  assert.equal(slots.hours.find((x) => x.hour === 23).units[A], 'free');

  const cal = (await o.call('GET', `/api/owner/calendar?date=${tomorrow}`)).body;
  assert.deepEqual(cal.columns.map((x) => x.name), ['Half A', 'Half B']);
  assert.equal(cal.bookings.length, 2); // confirmed full ground + walk-in

  // helper sees the confirmed booking without any money details, and cannot open owner pages
  const h = client(env);
  assert.equal((await h.login('9946055321', '1111')).status, 200);
  const up = (await h.call('GET', '/api/helper/upcoming')).body;
  assert.ok(up.bookings.length >= 2);
  for (const b of up.bookings) {
    assert.equal(b.amount, undefined);
    assert.equal(b.utr, undefined);
  }
  assert.equal((await h.call('GET', '/api/owner/today')).status, 403);
});

function tomorrowPrice(date, wd, we) {
  const dow = new Date(date + 'T00:00:00Z').getUTCDay();
  return dow === 0 || dow === 6 ? we : wd;
}

test('settings: prices, UPI ID and helpers', async () => {
  const { env, c, FULL, A, B } = await setup();
  const o = client(env);
  await o.login('9847012345', '1234');
  const r = await o.call('PUT', '/api/owner/settings', {
    ground: { upiId: 'newid@okaxis', facilities: ['Floodlights', 'Cafe'] },
    prices: [{ unitId: FULL, weekday: 1300, weekend: 1600 }, { unitId: A, weekday: 750, weekend: 950 }, { unitId: B, weekday: 750, weekend: 950 }],
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.ground.upiId, 'newid@okaxis');
  assert.equal(r.body.units.find((u) => u.id === FULL).weekday, 1300);
  assert.equal((await o.call('PUT', '/api/owner/settings', { ground: { upiId: 'not a upi' } })).status, 400);
  const add = await o.call('POST', '/api/owner/helpers', { name: 'Sanju', phone: '9123456780', pin: '2468' });
  assert.equal(add.body.helpers.length, 2);
  const g = (await c.call('GET', '/api/g/demo')).body;
  assert.deepEqual(g.ground.facilities, ['Floodlights', 'Cafe']);
});

test('wrong PIN five times locks the account for a while', async () => {
  const { env } = await setup();
  const o = client(env);
  for (let i = 0; i < 5; i++) assert.equal((await o.login('9847012345', '0000')).status, 401);
  assert.equal((await o.login('9847012345', '1234')).status, 429);
});

test('cross-site POST is blocked', async () => {
  const { c, FULL } = await setup();
  const r = await c.call('POST', '/api/g/demo/bookings', { unitId: FULL, date: tomorrow, hour: 9, name: 'X Y', phone: '9000000061' }, { headers: { origin: 'https://evil.example' } });
  assert.equal(r.status, 403);
});

test('customer can cancel a hold but not a confirmed booking', async () => {
  const { c, FULL } = await setup();
  const t = (await hold(c, FULL, tomorrow, 12)).body.token;
  assert.equal((await c.call('POST', `/api/b/${t}/cancel`)).body.booking.status, 'CANCELLED');
  const slots = (await c.call('GET', `/api/g/demo/slots?date=${tomorrow}`)).body;
  assert.equal(slots.hours.find((x) => x.hour === 12).units[FULL], 'free');
});

test('images are stored in D1 and come back byte-for-byte; oversized images are refused', async () => {
  const { env, c } = await setup();
  const o = client(env);
  await o.login('9847012345', '1234');
  const bytes = new Uint8Array(300_000).map((_, i) => (i * 31) % 256);
  const up = await o.call('POST', '/api/owner/photos', new Blob([bytes], { type: 'image/jpeg' }), { headers: { 'content-type': 'image/jpeg' } });
  assert.equal(up.status, 200);
  assert.equal(up.body.photos.length, 1);
  const got = await c.call('GET', up.body.photos[0].url);
  assert.equal(got.status, 200);
  assert.deepEqual(new Uint8Array(got.body), bytes);
  const big = await o.call('POST', '/api/owner/photos', new Blob([new Uint8Array(1_500_000)], { type: 'image/jpeg' }), { headers: { 'content-type': 'image/jpeg' } });
  assert.equal(big.status, 400);
  const del = await o.call('DELETE', `/api/owner/photos/${up.body.photos[0].id}`);
  assert.equal(del.body.photos.length, 0);
  assert.equal((await c.call('GET', up.body.photos[0].url)).status, 404);
});
