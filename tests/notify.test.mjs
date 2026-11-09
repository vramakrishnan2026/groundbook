// WhatsApp alerts to the GoArena team on new sign-ups, and the "WhatsApp us" number.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv } from '../scripts/dev-server.mjs';
import { handleApi } from '../src/worker.js';
import { fakeGoogle } from './fake-google.mjs';

const BASE = 'http://local.test';
function client(env) {
  const jar = {};
  return async (method, path, body) => {
    const init = { method, headers: { 'cf-connecting-ip': '1.1.1.1' } };
    const cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
    if (cookie) init.headers.cookie = cookie;
    if (body !== undefined) { init.body = JSON.stringify(body); init.headers['content-type'] = 'application/json'; }
    const res = await handleApi(new Request(BASE + path, init), env);
    const sc = res.headers.get('set-cookie');
    if (sc) { const [kv] = sc.split(';'); const i = kv.indexOf('='); jar[kv.slice(0, i)] = kv.slice(i + 1); }
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
}
async function setup(vars = {}) {
  const google = await fakeGoogle();
  const sent = [];
  const env = Object.assign(await makeEnv(), {
    GOOGLE_CLIENT_ID: google.clientId, GOOGLE_FETCH: google.fetch, ADMIN_EMAILS: 'boss@gmail.com',
    PUBLIC_URL: 'https://book.goarena.in', SUPPORT_WHATSAPP: '919886304904', ADMIN_WHATSAPP: '919886304904', CALLMEBOT_KEY: 'k123',
    NOTIFY_FETCH: async (url) => { sent.push(new URL(url)); return new Response('Message queued. You will receive it in a few seconds.'); },
  }, vars);
  return { env, google, sent };
}

test('a new sign-up sends a WhatsApp alert with the details and the approval link', async () => {
  const { env, google, sent } = await setup();
  const call = client(env);
  const r = await call('POST', '/api/auth/signup', { credential: await google.token({ sub: 's1', email: 'arun@gmail.com' }), groundName: 'Kick Off Arena', area: 'Kakkanad', ownerName: 'Arun', phone: '9876543210', pin: '4321', layout: 'split' });
  assert.equal(r.status, 201);
  assert.equal(sent.length, 1);
  const u = sent[0];
  assert.equal(u.searchParams.get('phone'), '+919886304904');
  assert.equal(u.searchParams.get('apikey'), 'k123');
  const text = u.searchParams.get('text');
  assert.match(text, /Kick Off Arena, Kakkanad/);
  assert.match(text, /Arun, 9876543210/);
  assert.match(text, /arun@gmail.com/);
  assert.match(text, /https:\/\/book\.goarena\.in\/admin\/g\/\d+/);
  const cfg = await call('GET', '/api/config');
  assert.equal(cfg.body.supportWhatsapp, '919886304904');
  const me = await call('GET', '/api/me');
  assert.equal(me.body.supportWhatsapp, '919886304904');
});

test('sign-up still works when the alert fails, and the failure is logged', async () => {
  const { env, google } = await setup({ NOTIFY_FETCH: async () => new Response('APIKey is invalid', { status: 200 }) });
  const r = await client(env)('POST', '/api/auth/signup', { credential: await google.token({ sub: 's2' }), groundName: 'Turf Two', phone: '9876500000', pin: '1111', layout: 'single' });
  assert.equal(r.status, 201);
  const log = await env.DB.prepare(`SELECT * FROM error_log WHERE code = 'notify_failed'`).first();
  assert.ok(log && /invalid/i.test(log.message));
});

test('no key: sign-up sends nothing; the admin page says alerts are off', async () => {
  const { env, google, sent } = await setup({ CALLMEBOT_KEY: '' });
  const r = await client(env)('POST', '/api/auth/signup', { credential: await google.token({ sub: 's3' }), groundName: 'Turf Three', phone: '9876500001', pin: '1111' });
  assert.equal(r.status, 201);
  assert.equal(sent.length, 0);
  const admin = client(env);
  assert.equal((await admin('POST', '/api/admin/login', { credential: await google.token({ sub: 'boss', email: 'boss@gmail.com' }) })).status, 200);
  const ov = await admin('GET', '/api/admin/overview');
  assert.equal(ov.body.alertsReady, false);
  assert.equal((await admin('POST', '/api/admin/notify-test')).status, 400);
});

test('admin test alert', async () => {
  const { env, google, sent } = await setup();
  const admin = client(env);
  await admin('POST', '/api/admin/login', { credential: await google.token({ sub: 'boss', email: 'boss@gmail.com' }) });
  assert.equal((await admin('GET', '/api/admin/overview')).body.alertsReady, true);
  const r = await admin('POST', '/api/admin/notify-test');
  assert.equal(r.status, 200);
  assert.match(sent[0].searchParams.get('text'), /test alert/);
});
