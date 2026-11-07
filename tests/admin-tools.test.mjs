// Admin: traffic counters, error log, owner details, Razorpay debugging.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv } from '../scripts/dev-server.mjs';
import { handleApi } from '../src/worker.js';
import { addDays, localNow } from '../src/lib/util.js';
import { fakeGoogle } from './fake-google.mjs';
import { fakeRazorpay, KEY_ID, KEY_SECRET } from './fake-razorpay.mjs';

const tomorrow = addDays(localNow(330).date, 1);

function client(env) {
  const jar = {};
  return async (method, path, body) => {
    const init = { method, headers: { 'cf-connecting-ip': '1.1.1.1' } };
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
  const google = await fakeGoogle();
  const fake = fakeRazorpay();
  const env = Object.assign(await makeEnv(), { GOOGLE_CLIENT_ID: google.clientId, GOOGLE_FETCH: google.fetch, ADMIN_EMAILS: 'goarena2026@gmail.com', RZP_FETCH: fake.fetchFn, SECRETS_KEY: 'test-secrets-key-0123456789' });
  const admin = client(env), owner = client(env), cust = client(env);
  await admin('POST', '/api/admin/login', { credential: await google.token({ sub: 'a', email: 'goarena2026@gmail.com' }) });
  await owner('POST', '/api/auth/login', { phone: '9847012345', pin: '1234' });
  const g = (await cust('GET', '/api/g/demo')).body;
  return { env, fake, admin, owner, cust, g };
}

test('page views, slot checks and the booking funnel are counted per ground', async () => {
  const { admin, cust, g } = await setup();
  await cust('GET', '/api/g/demo'); await cust('GET', '/api/g/demo');
  await cust('GET', `/api/g/demo/slots?date=${tomorrow}`);
  await cust('POST', '/api/g/demo/bookings', { unitId: g.units[0].id, date: tomorrow, hour: 20, name: 'Anil', phone: '9000000001' });
  const d = (await admin('GET', '/api/admin/grounds/1')).body;
  assert.equal(d.traffic.views30, 3); // setup opened it once too
  assert.equal(d.traffic.slotViews30, 1);
  assert.equal(d.traffic.funnel.holds, 1);
  assert.equal(d.traffic.days.length, 30);
  assert.equal(d.traffic.days.at(-1).views, 3);
  assert.equal(d.traffic.days.at(-1).bookings, 1);
  const o = (await admin('GET', '/api/admin/overview')).body;
  assert.equal(o.grounds[0].views30, 3);
  assert.equal(o.stats.views30, 3);
});

test('owner and business details are saved, checked and shown', async () => {
  const { admin } = await setup();
  assert.equal((await admin('PUT', '/api/admin/grounds/1/profile', { gstin: 'bad' })).status, 400);
  assert.equal((await admin('PUT', '/api/admin/grounds/1/profile', { contactEmail: 'nope' })).status, 400);
  const r = await admin('PUT', '/api/admin/grounds/1/profile', { ownerName: 'Rajesh Menon', businessName: 'Green Field Sports LLP', address: 'NH 66, Edappally, Kochi 682024', gstin: '32abcde1234f1z5', contactEmail: 'Rajesh@Example.com', altPhone: '9847000000' });
  assert.equal(r.status, 200);
  const d = (await admin('GET', '/api/admin/grounds/1')).body;
  assert.equal(d.profile.ownerName, 'Rajesh Menon');
  assert.equal(d.profile.gstin, '32ABCDE1234F1Z5');
  assert.equal(d.profile.contactEmail, 'rajesh@example.com');
  assert.equal(d.setup.units.length, 3);
  assert.equal(d.setup.upiId, 'greenfieldturf@ybl');
  assert.equal(d.log[0].action, 'Owner details updated');
});

test('Razorpay: test keys, list payments with errors, re-check a missed payment, disconnect', async () => {
  const { env, fake, admin, owner, cust, g } = await setup();
  assert.equal((await admin('POST', '/api/admin/grounds/1/razorpay/test')).status, 400); // not connected
  await owner('PUT', '/api/owner/razorpay', { keyId: KEY_ID, keySecret: KEY_SECRET });
  let d = (await admin('GET', '/api/admin/grounds/1')).body;
  assert.equal(d.razorpay.connected, true);
  assert.equal(d.razorpay.mode, 'test');
  assert.ok(d.razorpay.connectedAt > 0);
  assert.equal((await admin('POST', '/api/admin/grounds/1/razorpay/test')).body.ok, true);

  // a customer pays but closes the page before we hear about it
  const held = (await cust('POST', '/api/g/demo/bookings', { unitId: g.units[0].id, date: tomorrow, hour: 21, name: 'Online', phone: '9000000002' })).body;
  held.ref = (await cust('GET', `/api/b/${held.token}`)).body.booking.ref;
  const order = (await cust('POST', `/api/b/${held.token}/razorpay-order`)).body;
  fake.pay(order.orderId, 'failed');
  fake.pay(order.orderId, 'authorized');
  const list = (await admin('GET', '/api/admin/grounds/1/razorpay/payments')).body.payments;
  assert.equal(list.length, 2);
  const failed = list.find((p) => p.status === 'failed');
  assert.match(failed.error, /declined/);
  assert.equal(failed.booking.ref, held.ref);
  d = (await admin('GET', '/api/admin/grounds/1')).body;
  assert.equal(d.razorpay.bookings[0].ref, held.ref);

  const r = (await admin('POST', '/api/admin/grounds/1/razorpay/recheck', { ref: held.ref.toLowerCase() })).body;
  assert.equal(r.after, 'CONFIRMED');
  assert.equal((await admin('POST', '/api/admin/grounds/1/razorpay/recheck', { ref: 'GB-NOPE' })).status, 400);

  // keys stop working → test reports it and it lands in the error log
  env.RZP_FETCH = async () => new Response(JSON.stringify({ error: { description: 'Authentication failed' } }), { status: 401 });
  const bad = (await admin('POST', '/api/admin/grounds/1/razorpay/test')).body;
  assert.equal(bad.ok, false);
  d = (await admin('GET', '/api/admin/grounds/1')).body;
  assert.ok(d.razorpay.checkError);
  assert.equal(d.errors[0].source, 'razorpay');

  await admin('DELETE', '/api/admin/grounds/1/razorpay');
  d = (await admin('GET', '/api/admin/grounds/1')).body;
  assert.equal(d.razorpay.connected, false);
  assert.equal((await cust('GET', '/api/g/demo')).status, 200);
});

test('server and browser errors are logged against the right ground', async () => {
  const { env, admin, cust, g } = await setup();
  // Razorpay unreachable while a customer pays → logged as a razorpay error for demo
  await admin('PUT', '/api/admin/grounds/1/service', { service: 'active' });
  env.SECRETS_KEY = 'test-secrets-key-0123456789';
  const own = client(env); await own('POST', '/api/auth/login', { phone: '9847012345', pin: '1234' });
  await own('PUT', '/api/owner/razorpay', { keyId: KEY_ID, keySecret: KEY_SECRET });
  env.RZP_FETCH = async () => { throw new Error('network down'); };
  const held = (await cust('POST', '/api/g/demo/bookings', { unitId: g.units[0].id, date: tomorrow, hour: 22, name: 'Xavier', phone: '9000000003' })).body;
  assert.equal((await cust('POST', `/api/b/${held.token}/razorpay-order`)).status, 502);
  await cust('POST', '/api/client-error', { page: '/demo?step=slots', message: 'TypeError: x is undefined', ua: 'Android Chrome' });
  const d = (await admin('GET', '/api/admin/grounds/1')).body;
  const sources = d.errors.map((e) => e.source);
  assert.ok(sources.includes('razorpay'));
  assert.ok(sources.includes('browser'));
  const all = (await admin('GET', '/api/admin/errors')).body.errors;
  assert.ok(all.every((e) => e.ground === 'Green Field Turf'));
  const o = (await admin('GET', '/api/admin/overview')).body;
  assert.ok(o.stats.errors24 >= 2);
  assert.ok(o.grounds[0].errors7 >= 2);
});

test('admin tools are closed to owners', async () => {
  const { owner } = await setup();
  for (const [m, p] of [['GET', '/api/admin/errors'], ['GET', '/api/admin/grounds/1/razorpay/payments'], ['PUT', '/api/admin/grounds/1/profile'], ['DELETE', '/api/admin/grounds/1/razorpay']]) {
    assert.equal((await owner(m, p, m === 'GET' ? undefined : {})).status, 401, p);
  }
});
