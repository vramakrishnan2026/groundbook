// Razorpay flow against a fake Razorpay API.  Run: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv } from '../scripts/dev-server.mjs';
import { handleApi } from '../src/worker.js';
import { addDays, localNow } from '../src/lib/util.js';
import { fakeRazorpay, KEY_ID, KEY_SECRET } from './fake-razorpay.mjs';

const tomorrow = addDays(localNow(330).date, 1);

function client(env) {
  let cookie = '';
  return async (method, path, body, ip = '1.1.1.1') => {
    const init = { method, headers: { 'cf-connecting-ip': ip } };
    if (cookie) init.headers.cookie = cookie;
    if (body !== undefined) { init.body = JSON.stringify(body); init.headers['content-type'] = 'application/json'; }
    const res = await handleApi(new Request('http://local.test' + path, init), env);
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    return { status: res.status, body: await res.json() };
  };
}

async function setup({ secretsKey = 'test-secrets-key-0123456789' } = {}) {
  const env = await makeEnv();
  const fake = fakeRazorpay();
  env.RZP_FETCH = fake.fetchFn;
  if (secretsKey) env.SECRETS_KEY = secretsKey;
  const c = client(env), o = client(env);
  await o('POST', '/api/auth/login', { phone: '9847012345', pin: '1234' });
  const g = (await c('GET', '/api/g/demo')).body;
  const id = (code) => g.units.find((u) => u.code === code).id;
  return { env, fake, c, o, FULL: id('FULL'), A: id('HALF_A'), B: id('HALF_B') };
}
const connect = (o) => o('PUT', '/api/owner/razorpay', { keyId: KEY_ID, keySecret: KEY_SECRET });
const hold = (c, unitId, hour, phone = '9000000001', ip) => c('POST', '/api/g/demo/bookings', { unitId, date: tomorrow, hour, name: 'Online Payer', phone }, ip);

test('connecting Razorpay: wrong keys refused, right keys saved encrypted', async () => {
  const { env, o } = await setup();
  assert.equal((await o('PUT', '/api/owner/razorpay', { keyId: 'abc', keySecret: KEY_SECRET })).status, 400);
  const wrong = await o('PUT', '/api/owner/razorpay', { keyId: KEY_ID, keySecret: 'WrongSecret12345' });
  assert.equal(wrong.status, 400);
  assert.match(wrong.body.error, /did not accept/);
  const r = await connect(o);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.razorpay, { connected: true, enabled: true, keyId: KEY_ID, mode: 'test' });
  const row = await env.DB.prepare('SELECT rzp_key_secret_enc FROM grounds WHERE slug = ?').bind('demo').first();
  assert.ok(row.rzp_key_secret_enc.startsWith('v1:'));
  assert.ok(!row.rzp_key_secret_enc.includes(KEY_SECRET));
  const off = await o('PUT', '/api/owner/razorpay', { enabled: false });
  assert.equal(off.body.razorpay.enabled, false);
});

test('without SECRETS_KEY the server explains what is missing', async () => {
  const { o } = await setup({ secretsKey: null });
  const r = await connect(o);
  assert.equal(r.status, 500);
  assert.match(r.body.error, /SECRETS_KEY/);
});

test('pay online: order, bad signature refused, good payment confirms instantly', async () => {
  const { fake, c, o, FULL, A } = await setup();
  await connect(o);
  const t = (await hold(c, FULL, 21)).body.token;
  assert.equal((await c('GET', `/api/b/${t}`)).body.payment.razorpay, true);
  const order = (await c('POST', `/api/b/${t}/razorpay-order`)).body;
  assert.equal(order.keyId, KEY_ID);
  assert.equal(order.amount, (await c('GET', `/api/b/${t}`)).body.booking.amount * 100);
  assert.equal((await c('POST', `/api/b/${t}/razorpay-order`)).body.orderId, order.orderId); // reused
  const paid = fake.pay(order.orderId); // authorised, not yet captured
  const bad = await c('POST', `/api/b/${t}/razorpay-verify`, { ...paid, razorpay_signature: 'f'.repeat(64) });
  assert.equal(bad.status, 400);
  const ok = await c('POST', `/api/b/${t}/razorpay-verify`, paid);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.booking.status, 'CONFIRMED');
  assert.equal(ok.body.booking.paidVia, 'razorpay');
  assert.equal(fake.payments[paid.razorpay_payment_id].status, 'captured');
  const slots = (await c('GET', `/api/g/demo/slots?date=${tomorrow}`)).body;
  assert.equal(slots.hours.find((h) => h.hour === 21).units[A], 'taken');
  // nothing for the owner to approve
  assert.equal((await o('GET', '/api/owner/today')).body.pending.length, 0);
});

test('wrong amount is not accepted as payment', async () => {
  const { fake, c, o, FULL } = await setup();
  await connect(o);
  const t = (await hold(c, FULL, 20)).body.token;
  const order = (await c('POST', `/api/b/${t}/razorpay-order`)).body;
  const r = await c('POST', `/api/b/${t}/razorpay-verify`, fake.pay(order.orderId, 'captured', 100));
  assert.equal(r.status, 409);
  assert.equal((await c('GET', `/api/b/${t}`)).body.booking.status, 'HOLD');
});

test('customer closes the page after paying: booking still confirms', async () => {
  const { fake, c, o, A } = await setup();
  await connect(o);
  const t = (await hold(c, A, 19)).body.token;
  const order = (await c('POST', `/api/b/${t}/razorpay-order`)).body;
  fake.pay(order.orderId, 'captured'); // never calls verify
  const b = (await c('GET', `/api/b/${t}`)).body.booking;
  assert.equal(b.status, 'CONFIRMED');
  assert.equal(b.paidVia, 'razorpay');
});

test('paid after the hold ran out: slot taken back if free, otherwise owner is asked to refund', async () => {
  const { env, fake, c, o, FULL, A } = await setup();
  await connect(o);
  // slot still free → confirmed
  const t1 = (await hold(c, A, 7, '9000000001', '5.5.5.1')).body.token;
  const o1 = (await c('POST', `/api/b/${t1}/razorpay-order`)).body;
  await env.DB.prepare('UPDATE bookings SET hold_expires_at = ? WHERE token = ?').bind(Date.now() - 1000, t1).run();
  await c('GET', `/api/g/demo/slots?date=${tomorrow}`); // sweep → EXPIRED
  const late1 = await c('POST', `/api/b/${t1}/razorpay-verify`, fake.pay(o1.orderId, 'captured'));
  assert.equal(late1.body.booking.status, 'CONFIRMED');

  // slot taken by someone else meanwhile → refund needed
  const t2 = (await hold(c, FULL, 8, '9000000002', '5.5.5.2')).body.token;
  const o2 = (await c('POST', `/api/b/${t2}/razorpay-order`)).body;
  await env.DB.prepare('UPDATE bookings SET hold_expires_at = ? WHERE token = ?').bind(Date.now() - 1000, t2).run();
  assert.equal((await hold(c, A, 8, '9000000003', '5.5.5.3')).status, 201); // grabs half the slot
  const late2 = await c('POST', `/api/b/${t2}/razorpay-verify`, fake.pay(o2.orderId, 'captured'));
  assert.equal(late2.body.outcome, 'refund_needed');
  assert.equal(late2.body.booking.status, 'EXPIRED');
  assert.equal(late2.body.booking.refundNeeded, true);
  const today = (await o('GET', '/api/owner/today')).body;
  assert.equal(today.refunds.length, 1);
  await o('POST', `/api/owner/bookings/${today.refunds[0].id}/refunded`);
  assert.equal((await o('GET', '/api/owner/today')).body.refunds.length, 0);
});

test('when Razorpay is off, customers cannot start an online payment', async () => {
  const { c, FULL } = await setup();
  const t = (await hold(c, FULL, 9)).body.token;
  assert.equal((await c('GET', `/api/b/${t}`)).body.payment.razorpay, false);
  assert.equal((await c('POST', `/api/b/${t}/razorpay-order`)).status, 400);
});
