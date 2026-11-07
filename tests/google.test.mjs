// Sign in with Google, self-signup of new grounds, and admin approval.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv } from '../scripts/dev-server.mjs';
import { handleApi } from '../src/worker.js';
import { addDays, localNow } from '../src/lib/util.js';
import { fakeGoogle } from './fake-google.mjs';

const BASE = 'http://local.test';
const tomorrow = addDays(localNow(330).date, 1);

function client(env) {
  const jar = {};
  const call = async (method, path, body) => {
    const init = { method, headers: { 'cf-connecting-ip': '1.1.1.1' } };
    const cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
    if (cookie) init.headers.cookie = cookie;
    if (body !== undefined) { init.body = JSON.stringify(body); init.headers['content-type'] = 'application/json'; }
    const res = await handleApi(new Request(BASE + path, init), env);
    const sc = res.headers.get('set-cookie');
    if (sc) { const [kv] = sc.split(';'); const i = kv.indexOf('='); jar[kv.slice(0, i)] = kv.slice(i + 1); }
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  return { call };
}

async function setup(vars = {}) {
  const google = await fakeGoogle();
  const env = Object.assign(await makeEnv(), { GOOGLE_CLIENT_ID: google.clientId, GOOGLE_FETCH: google.fetch, ADMIN_EMAILS: 'boss@gmail.com' }, vars);
  return { env, google, c: client(env) };
}

test('Google buttons stay hidden until a client ID is set', async () => {
  const { c } = await setup({ GOOGLE_CLIENT_ID: '' });
  assert.equal((await c.call('GET', '/api/config')).body.googleClientId, null);
  assert.equal((await c.call('POST', '/api/auth/google', { credential: 'x.y.z' })).status, 400);
});

test('owner logs in with PIN once, links Google, then logs in with Google', async () => {
  const { env, google, c } = await setup();
  const cred = await google.token({ sub: 'rajesh-sub', email: 'Rajesh@Gmail.com' });
  const before = await c.call('POST', '/api/auth/google', { credential: cred });
  assert.equal(before.status, 404);
  assert.equal(before.body.code, 'not_linked');

  assert.equal((await c.call('POST', '/api/auth/login', { phone: '9847012345', pin: '1234' })).status, 200);
  const link = await c.call('POST', '/api/staff/google', { credential: cred });
  assert.equal(link.body.email, 'rajesh@gmail.com');
  assert.equal((await c.call('GET', '/api/me')).body.me.googleEmail, 'rajesh@gmail.com');

  const fresh = client(env);
  const r = await fresh.call('POST', '/api/auth/google', { credential: await google.token({ sub: 'rajesh-sub' }) });
  assert.equal(r.status, 200);
  assert.equal(r.body.role, 'owner');
  assert.equal((await fresh.call('GET', '/api/owner/today')).status, 200);

  // unlink → Google no longer works, PIN still does
  await fresh.call('DELETE', '/api/staff/google');
  assert.equal((await client(env).call('POST', '/api/auth/google', { credential: await google.token({ sub: 'rajesh-sub' }) })).status, 404);
  assert.equal((await client(env).call('POST', '/api/auth/login', { phone: '9847012345', pin: '1234' })).status, 200);
});

test('helper can link Google too and lands on helper access only', async () => {
  const { env, google, c } = await setup();
  await c.call('POST', '/api/auth/login', { phone: '9946055321', pin: '1111' });
  await c.call('POST', '/api/staff/google', { credential: await google.token({ sub: 'manoj' }) });
  const h = client(env);
  assert.equal((await h.call('POST', '/api/auth/google', { credential: await google.token({ sub: 'manoj' }) })).body.role, 'helper');
  assert.equal((await h.call('GET', '/api/owner/today')).status, 403);
});

test('bad Google tokens are refused', async () => {
  const { google, c } = await setup();
  for (const cred of [
    await google.token({ forge: true }),
    await google.token({ aud: 'someone-else' }),
    await google.token({ exp: Date.now() / 1000 - 3600 }),
    await google.token({ iss: 'https://evil.example' }),
    'not-a-token',
  ]) {
    const r = await c.call('POST', '/api/auth/google', { credential: cred });
    assert.equal(r.status, 401, cred.slice(0, 20));
  }
});

test('new owner signs up with Google; ground waits for admin approval', async () => {
  const { env, google, c } = await setup();
  const cred = await google.token({ sub: 'new-owner', email: 'sunil@gmail.com', name: 'Sunil' });
  const s = await c.call('POST', '/api/auth/signup', { credential: cred, groundName: 'Kick Off Arena', area: 'Kakkanad', phone: '9876543210', pin: '4321', layout: 'split' });
  assert.equal(s.status, 201);
  assert.equal(s.body.slug, 'kick-off-arena');

  // logged in straight away, sees "waiting"
  const me = (await c.call('GET', '/api/me')).body;
  assert.equal(me.ground.approved, false);
  assert.equal(me.me.googleEmail, 'sunil@gmail.com');

  // customers see the page but cannot book
  const g = (await c.call('GET', '/api/g/kick-off-arena')).body;
  assert.equal(g.ground.open, false);
  assert.equal(g.units.length, 3);
  const hold = await c.call('POST', '/api/g/kick-off-arena/bookings', { unitId: g.units[0].id, date: tomorrow, hour: 20, name: 'Test', phone: '9000000001' });
  assert.equal(hold.status, 403);

  // a second signup while waiting is refused
  assert.equal((await client(env).call('POST', '/api/auth/signup', { credential: cred, groundName: 'Another', phone: '9876543210', pin: '4321' })).status, 400);

  // same name → different link
  const s2 = await client(env).call('POST', '/api/auth/signup', { credential: await google.token({ sub: 'other' }), groundName: 'Kick Off Arena', phone: '9876500000', pin: '1111', layout: 'single' });
  assert.equal(s2.body.slug, 'kick-off-arena-2');
  // reserved words never become a link
  const s3 = await client(env).call('POST', '/api/auth/signup', { credential: await google.token({ sub: 'third' }), groundName: 'Admin', phone: '9876500001', pin: '1111' });
  assert.equal(s3.body.slug, 'admin-2');

  // admin approves
  const admin = client(env);
  assert.equal((await admin.call('GET', '/api/admin/overview')).status, 401);
  assert.equal((await admin.call('POST', '/api/admin/login', { credential: await google.token({ email: 'random@gmail.com' }) })).status, 403);
  assert.equal((await admin.call('POST', '/api/admin/login', { credential: await google.token({ sub: 'boss', email: 'boss@gmail.com' }) })).status, 200);
  const list = (await admin.call('GET', '/api/admin/overview')).body.grounds;
  const kick = list.find((x) => x.slug === 'kick-off-arena');
  assert.equal(kick.approved, false);
  assert.equal(kick.email, 'sunil@gmail.com');
  assert.equal(list.find((x) => x.slug === 'demo').approved, true); // existing grounds stay live
  await admin.call('POST', `/api/admin/grounds/${kick.id}/approve`);
  const ok = await c.call('POST', '/api/g/kick-off-arena/bookings', { unitId: g.units[0].id, date: tomorrow, hour: 20, name: 'Test', phone: '9000000001' });
  assert.equal(ok.status, 201);

  // turning one down removes it and logs its owner out
  const spam = list.find((x) => x.slug === 'admin-2');
  await admin.call('POST', `/api/admin/grounds/${spam.id}/reject`);
  assert.equal((await c.call('GET', '/api/g/admin-2')).status, 404);
});

test('an owner session cannot use admin routes', async () => {
  const { c } = await setup();
  await c.call('POST', '/api/auth/login', { phone: '9847012345', pin: '1234' });
  assert.equal((await c.call('GET', '/api/admin/overview')).status, 401);
});
