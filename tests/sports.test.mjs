// Multi-sport: box cricket shares the football turf, badminton courts are separate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv } from '../scripts/dev-server.mjs';
import { handleApi } from '../src/worker.js';
import { addDays, localNow } from '../src/lib/util.js';

const BASE = 'http://local.test';
const tomorrow = addDays(localNow(330).date, 1);

function client(env) {
  let cookie = '';
  return async (method, path, body) => {
    const init = { method, headers: { 'cf-connecting-ip': '1.1.1.1' } };
    if (cookie) init.headers.cookie = cookie;
    if (body !== undefined) { init.body = JSON.stringify(body); init.headers['content-type'] = 'application/json'; }
    const res = await handleApi(new Request(BASE + path, init), env);
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    return { status: res.status, body: await res.json() };
  };
}

async function setup({ cricket = true, badminton = 2 } = {}) {
  const env = await makeEnv();
  const owner = client(env), player = client(env);
  assert.equal((await owner('POST', '/api/auth/login', { phone: '9847012345', pin: '1234' })).status, 200);
  const r = await owner('PUT', '/api/owner/sports', { cricket, badmintonCourts: badminton });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const g = (await player('GET', '/api/g/demo')).body;
  const id = (code) => g.units.find((u) => u.code === code).id;
  return { env, owner, player, g, id };
}
const hold = (player, unitId, hour, phone = '9000000001') =>
  player('POST', '/api/g/demo/bookings', { unitId, date: tomorrow, hour, name: 'Test Player', phone });
const at = async (player, hour) => (await player('GET', `/api/g/demo/slots?date=${tomorrow}`)).body.hours.find((x) => x.hour === hour).units;

test('switching sports on lists football, box cricket and badminton with their courts', async () => {
  const { g, owner } = await setup();
  assert.deepEqual(g.sports.map((s) => s.id), ['football', 'cricket', 'badminton']);
  assert.deepEqual(g.units.filter((u) => u.sport === 'cricket').map((u) => [u.code, u.weekday]), [['CR_FULL', 1200], ['CR_HALF_A', 700], ['CR_HALF_B', 700]]);
  assert.deepEqual(g.units.filter((u) => u.sport === 'badminton').map((u) => [u.name, u.weekday, u.weekend]), [['Court 1', 400, 500], ['Court 2', 400, 500]]);
  const s = (await owner('GET', '/api/owner/settings')).body;
  assert.deepEqual([s.sports.cricket, s.sports.badmintonCourts], [true, 2]);
});

test('box cricket on the full turf blocks football; a cricket half leaves the other half free', async () => {
  const { player, id } = await setup();
  assert.equal((await hold(player, id('CR_FULL'), 19)).status, 201);
  let u = await at(player, 19);
  for (const c of ['FULL', 'HALF_A', 'HALF_B', 'CR_HALF_A']) assert.equal(u[id(c)], 'taken', c);
  assert.equal(u[id('BAD_1')], 'free');
  assert.equal((await hold(player, id('HALF_A'), 19, '9000000002')).status, 409);

  assert.equal((await hold(player, id('CR_HALF_A'), 20, '9000000003')).status, 201);
  u = await at(player, 20);
  assert.equal(u[id('HALF_A')], 'taken');
  assert.equal(u[id('FULL')], 'taken');
  assert.equal(u[id('HALF_B')], 'free');
  assert.equal(u[id('CR_HALF_B')], 'free');
  assert.equal((await hold(player, id('HALF_B'), 20, '9000000004')).status, 201);
});

test('badminton courts are independent of the turf and of each other', async () => {
  const { player, id } = await setup();
  assert.equal((await hold(player, id('FULL'), 18)).status, 201);
  assert.equal((await hold(player, id('BAD_1'), 18, '9000000002')).status, 201);
  const u = await at(player, 18);
  assert.equal(u[id('BAD_1')], 'taken');
  assert.equal(u[id('BAD_2')], 'free');
  assert.equal((await hold(player, id('BAD_1'), 18, '9000000003')).status, 409);
});

test('bookings show the sport in the court name for owners', async () => {
  const { player, owner, id } = await setup();
  const r = await hold(player, id('CR_HALF_B'), 17);
  const b = (await player('GET', `/api/b/${r.body.token}`)).body.booking;
  assert.equal(b.unit.name, 'Box cricket · Half B');
  const cal = (await owner('GET', `/api/owner/calendar?date=${tomorrow}`)).body;
  assert.deepEqual(cal.columns.map((c) => c.name), ['Half A', 'Half B', 'Court 1', 'Court 2']);
});

test('a football-only ground keeps plain court names', async () => {
  const env = await makeEnv();
  const g = (await client(env)('GET', '/api/g/demo')).body;
  assert.deepEqual(g.sports.map((s) => s.id), ['football']);
  assert.equal(g.units[0].name, 'Full ground');
});

test('a sport with upcoming bookings cannot be switched off; fewer courts keeps old prices on return', async () => {
  const { player, owner, id } = await setup();
  assert.equal((await hold(player, id('CR_FULL'), 21)).status, 201);
  const off = await owner('PUT', '/api/owner/sports', { cricket: false });
  assert.equal(off.status, 400);
  assert.match(off.body.error, /Box cricket has 1 upcoming booking/);

  const s = (await owner('GET', '/api/owner/settings')).body;
  const c2 = s.units.find((u) => u.sport === 'badminton' && u.name === 'Court 2');
  await owner('PUT', '/api/owner/settings', { prices: [{ unitId: c2.id, weekday: 450, weekend: 550 }] });
  assert.equal((await owner('PUT', '/api/owner/sports', { badmintonCourts: 1 })).body.sports.badmintonCourts, 1);
  const back = (await owner('PUT', '/api/owner/sports', { badmintonCourts: 3 })).body;
  assert.deepEqual(back.units.filter((u) => u.sport === 'badminton').map((u) => [u.name, u.weekday]), [['Court 1', 400], ['Court 2', 450], ['Court 3', 400]]);
});

test('longer bookings: 90 min of box cricket blocks football until it ends, badminton stays free', async () => {
  const { player, owner, id } = await setup();
  assert.equal((await owner('PUT', '/api/owner/settings', { ground: { stepMin: 30 } })).status, 200);
  const book = (unitId, start, dur, phone) =>
    player('POST', '/api/g/demo/bookings', { unitId, date: tomorrow, start, dur, name: 'Test Player', phone });
  assert.equal((await book(id('CR_FULL'), 18 * 60, 90, '9000000001')).status, 201);
  assert.equal((await book(id('HALF_A'), 19 * 60, 60, '9000000002')).status, 409);
  assert.equal((await book(id('HALF_A'), 19 * 60 + 30, 60, '9000000003')).status, 201);
  assert.equal((await book(id('BAD_1'), 18 * 60, 120, '9000000004')).status, 201);
});
