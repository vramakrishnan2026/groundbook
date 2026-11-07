// Cancelling paid bookings: Razorpay refunds, customer self-cancel window, UPI fallback.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv } from '../scripts/dev-server.mjs';
import { handleApi } from '../src/worker.js';
import { addDays, localNow } from '../src/lib/util.js';
import { slotStartMs } from '../src/lib/refunds.js';
import { fakeRazorpay, KEY_ID, KEY_SECRET } from './fake-razorpay.mjs';

const today = localNow(330).date;

function client(env) {
  const jar = {};
  return async (method, path, body) => {
    const init = { method, headers: { 'cf-connecting-ip': '1.1.1.' + Math.floor(Math.random() * 250) } };
    const cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
    if (cookie) init.headers.cookie = cookie;
    if (body !== undefined) { init.body = JSON.stringify(body); init.headers['content-type'] = 'application/json'; }
    const res = await handleApi(new Request('http://local.test' + path, init), env);
    const sc = res.headers.get('set-cookie');
    if (sc) { const [kv] = sc.split(';'); const i = kv.indexOf('='); jar[kv.slice(0, i)] = kv.slice(i + 1); }
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
}

async function setup() {
  const fake = fakeRazorpay();
  const env = Object.assign(await makeEnv(), { RZP_FETCH: fake.fetchFn, SECRETS_KEY: 'test-secrets-key-0123456789' });
  const owner = client(env), cust = client(env);
  await owner('POST', '/api/auth/login', { phone: '9847012345', pin: '1234' });
  await owner('PUT', '/api/owner/razorpay', { keyId: KEY_ID, keySecret: KEY_SECRET });
  const g = (await cust('GET', '/api/g/demo')).body;
  // pay online for a slot `days` ahead
  const paidBooking = async (days, hour = 20) => {
    const { token } = (await cust('POST', '/api/g/demo/bookings', { unitId: g.units[0].id, date: addDays(today, days), hour, name: 'Anil Kumar', phone: '9000000001' })).body;
    const o = (await cust('POST', `/api/b/${token}/razorpay-order`)).body;
    await cust('POST', `/api/b/${token}/razorpay-verify`, fake.pay(o.orderId, 'captured'));
    const b = (await cust('GET', `/api/b/${token}`)).body;
    assert.equal(b.booking.status, 'CONFIRMED');
    const id = (await owner('GET', '/api/owner/calendar?date=' + addDays(today, days))).body;
    return { token, b, fake };
  };
  return { env, fake, owner, cust, g, paidBooking };
}

const ownerId = async (owner, token, env) => (await env.DB.prepare('SELECT id FROM bookings WHERE token = ?').bind(token).first()).id;

test('slot start time is worked out in IST', () => {
  assert.equal(new Date(slotStartMs({ date: '2026-11-08', start_hour: 20 })).toISOString(), '2026-11-08T14:30:00.000Z');
});

test('customer cancels 2+ days ahead → automatic full refund through Razorpay', async () => {
  const { cust, fake, paidBooking } = await setup();
  const { token, b } = await paidBooking(3);
  assert.equal(b.booking.canCancel, true);
  assert.equal(b.policy.cancelHours, 24);
  const r = (await cust('POST', `/api/b/${token}/cancel`)).body;
  assert.equal(r.booking.status, 'CANCELLED');
  assert.equal(r.booking.refund.amount, b.booking.amount);
  assert.equal(r.booking.refund.status, 'processed');
  assert.equal(Object.values(fake.refunds)[0].amount, b.booking.amount * 100);
});

test('customer cannot self-cancel inside the window; UPI-paid bookings must call the ground', async () => {
  const { env, cust, owner, g, paidBooking } = await setup();
  const h = localNow(330).hour;
  const { token } = h < 21 ? await paidBooking(0, 22) : await paidBooking(1, 19); // always less than 24 hours away
  const b = (await cust('GET', `/api/b/${token}`)).body;
  assert.equal(b.booking.canCancel, false);
  const r = await cust('POST', `/api/b/${token}/cancel`);
  assert.equal(r.status, 409);
  assert.match(r.body.error, /24 hours/);

  // UPI + screenshot, approved by owner
  const { token: t2 } = (await cust('POST', '/api/g/demo/bookings', { unitId: g.units[1].id, date: addDays(today, 4), hour: 9, name: 'Babu Raj', phone: '9000000002' })).body;
  await owner('POST', `/api/owner/bookings/${await ownerId(owner, t2, env)}/approve`);
  assert.equal((await cust('GET', `/api/b/${t2}`)).body.booking.canCancel, false);
  assert.equal((await cust('POST', `/api/b/${t2}/cancel`)).status, 409);
});

test('owner cancels: full refund by default, partial or none on request', async () => {
  const { env, owner, cust, fake, paidBooking } = await setup();
  const a = await paidBooking(2, 18);
  const full = (await owner('POST', `/api/owner/bookings/${await ownerId(owner, a.token, env)}/cancel`, { reason: 'Rain' })).body;
  assert.equal(full.refund.amount, a.b.booking.amount);
  assert.equal(full.refund.auto, true);
  assert.equal((await cust('GET', `/api/b/${a.token}`)).body.booking.refund.status, 'processed');

  const p = await paidBooking(2, 19);
  const part = (await owner('POST', `/api/owner/bookings/${await ownerId(owner, p.token, env)}/cancel`, { refund: 500 })).body;
  assert.equal(part.refund.amount, 500);

  const n = await paidBooking(2, 21);
  const none = (await owner('POST', `/api/owner/bookings/${await ownerId(owner, n.token, env)}/cancel`, { refund: 'none' })).body;
  assert.equal(none.refund, null);
  assert.equal(Object.keys(fake.refunds).length, 2);

  const big = await paidBooking(3, 18);
  assert.equal((await owner('POST', `/api/owner/bookings/${await ownerId(owner, big.token, env)}/cancel`, { refund: 999999 })).status, 400);
  assert.equal((await cust('GET', `/api/b/${big.token}`)).body.booking.status, 'CONFIRMED'); // nothing changed
});

test('UPI-paid booking cancelled by owner goes on the Refund due list', async () => {
  const { env, owner, cust, g } = await setup();
  const { token } = (await cust('POST', '/api/g/demo/bookings', { unitId: g.units[1].id, date: addDays(today, 3), hour: 9, name: 'Babu Raj', phone: '9000000002' })).body;
  const id = await ownerId(owner, token, env);
  await owner('POST', `/api/owner/bookings/${id}/approve`);
  const r = (await owner('POST', `/api/owner/bookings/${id}/cancel`)).body;
  assert.equal(r.refund.status, 'manual');
  const t = (await owner('GET', '/api/owner/today')).body;
  assert.ok(t.refunds.some((b) => b.ref === r.booking.ref));
});

test('if Razorpay refuses the refund the booking is still cancelled and flagged for the owner', async () => {
  const { env, owner, paidBooking } = await setup();
  const a = await paidBooking(2, 18);
  env.RZP_FETCH = async () => new Response(JSON.stringify({ error: { description: 'Insufficient balance to process refund' } }), { status: 400 });
  const r = (await owner('POST', `/api/owner/bookings/${await ownerId(owner, a.token, env)}/cancel`)).body;
  assert.equal(r.booking.status, 'CANCELLED');
  assert.equal(r.refund.status, 'failed');
  assert.match(r.refund.error, /Insufficient balance/);
  assert.ok((await owner('GET', '/api/owner/today')).body.refunds.length >= 1);
  const err = await env.DB.prepare(`SELECT * FROM error_log WHERE source = 'razorpay' ORDER BY id DESC`).first();
  assert.match(err.message, /Insufficient balance/);
});

test('owner can change the free-cancellation window', async () => {
  const { owner, cust, paidBooking } = await setup();
  await owner('PUT', '/api/owner/settings', { ground: { cancelHours: 96 } });
  const { b } = await paidBooking(2);
  assert.equal(b.booking.canCancel, false);
  assert.equal(b.policy.cancelHours, 96);
  assert.equal((await owner('PUT', '/api/owner/settings', { ground: { cancelHours: 500 } })).status, 400);
  await owner('PUT', '/api/owner/settings', { ground: { cancelHours: 0 } });
  const c = await paidBooking(5);
  assert.equal(c.b.booking.canCancel, false);
});
