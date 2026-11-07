// Master admin: service levels, subscription payments, remote resets, audit log.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv } from '../scripts/dev-server.mjs';
import { handleApi } from '../src/worker.js';
import { addDays, localNow } from '../src/lib/util.js';
import { addMonths } from '../src/routes/admin.js';
import { fakeGoogle } from './fake-google.mjs';

const today = localNow(330).date;
const tomorrow = addDays(today, 1);

function client(env) {
  const jar = {};
  const call = async (method, path, body) => {
    const init = { method, headers: { 'cf-connecting-ip': '1.1.1.1' } };
    const cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
    if (cookie) init.headers.cookie = cookie;
    if (body !== undefined) { init.body = JSON.stringify(body); init.headers['content-type'] = 'application/json'; }
    const res = await handleApi(new Request('http://local.test' + path, init), env);
    const sc = res.headers.get('set-cookie');
    if (sc) { const [kv] = sc.split(';'); const i = kv.indexOf('='); jar[kv.slice(0, i)] = kv.slice(i + 1); }
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  return { call };
}

async function setup() {
  const google = await fakeGoogle();
  const env = Object.assign(await makeEnv(), { GOOGLE_CLIENT_ID: google.clientId, GOOGLE_FETCH: google.fetch, ADMIN_EMAILS: 'goarena2026@gmail.com' });
  const admin = client(env);
  assert.equal((await admin.call('POST', '/api/admin/login', { credential: await google.token({ sub: 'a', email: 'goarena2026@gmail.com' }) })).status, 200);
  const owner = client(env);
  await owner.call('POST', '/api/auth/login', { phone: '9847012345', pin: '1234' });
  const g = (await owner.call('GET', '/api/g/demo')).body;
  return { env, admin, owner, g };
}

const book = (c, g, hour = 20) => c.call('POST', '/api/g/demo/bookings', { unitId: g.units[0].id, date: tomorrow, hour, name: 'Test', phone: '9000000001' });

test('addMonths keeps month ends sensible', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2026-11-07', 1), '2026-12-07');
  assert.equal(addMonths('2026-11-30', 3), '2027-02-28');
});

test('overview lists every ground with numbers', async () => {
  const { admin, owner, g } = await setup();
  await book(owner, g);
  const o = (await admin.call('GET', '/api/admin/overview')).body;
  assert.equal(o.email, 'goarena2026@gmail.com');
  assert.equal(o.stats.grounds, 1);
  const demo = o.grounds[0];
  assert.equal(demo.owner, 'Rajesh');
  assert.equal(demo.plan, 'none');
  assert.equal(demo.service, 'active');
  assert.ok(demo.lastLogin > 0);
});

test('bookings paused: customers cannot book, staff can still log in', async () => {
  const { env, admin, owner, g } = await setup();
  await admin.call('PUT', `/api/admin/grounds/${g.ground.slug === 'demo' ? 1 : 0}/service`, { service: 'paused', note: 'November invoice unpaid' });
  const pub = (await owner.call('GET', '/api/g/demo')).body;
  assert.equal(pub.ground.open, false);
  assert.equal((await book(owner, g)).status, 403);
  assert.equal((await owner.call('GET', '/api/owner/today')).status, 200);
  const me = (await owner.call('GET', '/api/me')).body;
  assert.equal(me.ground.service, 'paused');
  assert.equal(me.ground.serviceNote, 'November invoice unpaid');
  assert.equal((await client(env).call('POST', '/api/auth/login', { phone: '9946055321', pin: '1111' })).status, 200);
});

test('locked: booking page closed, logins refused, existing booking links still open', async () => {
  const { env, admin, owner, g } = await setup();
  const held = (await book(owner, g)).body;
  await admin.call('PUT', '/api/admin/grounds/1/service', { service: 'locked', note: 'Unpaid since October' });
  assert.equal((await owner.call('GET', '/api/g/demo')).status, 410);
  assert.equal((await owner.call('GET', '/api/owner/today')).status, 401); // logged out
  const again = await client(env).call('POST', '/api/auth/login', { phone: '9847012345', pin: '1234' });
  assert.equal(again.status, 403);
  assert.match(again.body.error, /locked by GoArena/);
  assert.equal((await client(env).call('GET', `/api/b/${held.token}`)).status, 200);
  assert.equal((await admin.call('POST', '/api/admin/grounds/1/open-as-owner')).status, 400);
  // unlock
  await admin.call('PUT', '/api/admin/grounds/1/service', { service: 'active' });
  assert.equal((await client(env).call('POST', '/api/auth/login', { phone: '9847012345', pin: '1234' })).status, 200);
});

test('recording a payment extends paid-until and switches service back on', async () => {
  const { admin, owner, g } = await setup();
  await admin.call('PUT', '/api/admin/grounds/1/plan', { planAmount: 600, paidUntil: addDays(today, -3), adminNote: 'Pays by GPay' });
  let d = (await admin.call('GET', '/api/admin/grounds/1')).body;
  assert.equal(d.ground.plan, 'overdue');
  assert.equal(d.ground.planAmount, 600);
  await admin.call('PUT', '/api/admin/grounds/1/service', { service: 'paused', note: 'Unpaid' });
  const pay = await admin.call('POST', '/api/admin/grounds/1/payments', { amount: 1200, months: 2, note: 'GPay ref 123' });
  assert.equal(pay.body.paidUntil, addMonths(today, 2)); // overdue → counts from today
  d = (await admin.call('GET', '/api/admin/grounds/1')).body;
  assert.equal(d.ground.service, 'active');
  assert.equal(d.ground.plan, 'paid');
  assert.equal(d.payments.length, 1);
  assert.equal((await book(owner, g)).status, 201);
  // paying early stacks on the existing date
  const early = await admin.call('POST', '/api/admin/grounds/1/payments', { amount: 600, months: 1 });
  assert.equal(early.body.paidUntil, addMonths(addMonths(today, 2), 1));
  assert.deepEqual(d.log.map((l) => l.action).slice(0, 3), ['Payment recorded', 'Bookings paused', 'Plan changed']);
});

test('remote resets: PIN, Google link, phone, log everyone out, open as owner', async () => {
  const { env, admin, owner } = await setup();
  const d = (await admin.call('GET', '/api/admin/grounds/1')).body;
  const raj = d.staff.find((s) => s.role === 'owner');
  const r = (await admin.call('POST', `/api/admin/staff/${raj.id}/reset-pin`)).body;
  assert.match(r.pin, /^\d{6}$/);
  assert.equal((await owner.call('GET', '/api/owner/today')).status, 401); // old session gone
  assert.equal((await client(env).call('POST', '/api/auth/login', { phone: '9847012345', pin: '1234' })).status, 401);
  assert.equal((await client(env).call('POST', '/api/auth/login', { phone: '9847012345', pin: r.pin })).status, 200);

  await admin.call('PUT', `/api/admin/staff/${raj.id}/phone`, { phone: '9847099999' });
  assert.equal((await client(env).call('POST', '/api/auth/login', { phone: '9847099999', pin: r.pin })).status, 200);
  const manoj = d.staff.find((s) => s.role === 'helper');
  assert.equal((await admin.call('PUT', `/api/admin/staff/${raj.id}/phone`, { phone: manoj.phone })).status, 400);

  const o = await admin.call('POST', '/api/admin/grounds/1/open-as-owner');
  assert.equal(o.status, 200);
  assert.equal((await admin.call('GET', '/api/owner/today')).status, 200);
  await admin.call('POST', '/api/admin/grounds/1/logout-all');
  assert.equal((await admin.call('GET', '/api/owner/today')).status, 401);
  assert.equal((await admin.call('GET', '/api/admin/overview')).status, 200); // admin login unaffected
});

test('owners and helpers can never reach admin routes', async () => {
  const { owner } = await setup();
  for (const [m, p] of [['GET', '/api/admin/overview'], ['GET', '/api/admin/grounds/1'], ['PUT', '/api/admin/grounds/1/service'], ['POST', '/api/admin/staff/1/reset-pin']]) {
    assert.equal((await owner.call(m, p, m === 'GET' ? undefined : {})).status, 401, p);
  }
});
