// GroundBook — Cloudflare Worker entry point.
// Static files (the app) are served by Workers Assets; everything under /api comes here.
import { login, logout, requireStaff } from './lib/auth.js';
import { sweepExpired } from './lib/bookings.js';
import { reconcileRecent } from './lib/razorpay.js';
import { HttpError, json, readJson } from './lib/util.js';
import * as pub from './routes/public.js';
import * as st from './routes/staff.js';

// [method, pattern, handler(env, request, url, params)]
const routes = [
  ['GET', '/api/health', async () => json({ ok: true })],

  // customer
  ['GET', '/api/g/:slug', (env, req, url, p) => pub.getGround(env, p.slug)],
  ['GET', '/api/g/:slug/slots', (env, req, url, p) => pub.getSlots(env, p.slug, url)],
  ['POST', '/api/g/:slug/bookings', (env, req, url, p) => pub.createHold(env, p.slug, req)],
  ['GET', '/api/b/:token', (env, req, url, p) => pub.getBooking(env, p.token)],
  ['POST', '/api/b/:token/proof', (env, req, url, p) => pub.submitProof(env, p.token, req)],
  ['POST', '/api/b/:token/razorpay-order', (env, req, url, p) => pub.razorpayOrder(env, p.token)],
  ['POST', '/api/b/:token/razorpay-verify', (env, req, url, p) => pub.razorpayVerify(env, p.token, req)],
  ['POST', '/api/b/:token/cancel', (env, req, url, p) => pub.cancelByCustomer(env, p.token)],
  ['GET', '/api/files/photo/:id', (env, req, url, p) => pub.servePhoto(env, p.id)],
  ['GET', '/api/files/qr/:slug', (env, req, url, p) => pub.serveQr(env, p.slug)],

  // login
  ['POST', '/api/auth/login', async (env, req) => {
    const { staff, setCookie } = await login(env.DB, req, await readJson(req));
    return json({ role: staff.role, ground: staff.ground_name }, 200, { 'set-cookie': setCookie });
  }],
  ['POST', '/api/auth/logout', async (env, req) => json({ ok: true }, 200, { 'set-cookie': await logout(env.DB, req) })],
  ['GET', '/api/me', staff(['owner', 'helper'], (env, me) => st.me(env, me))],

  // owner
  ['GET', '/api/owner/today', staff(['owner'], (env, me) => st.today(env, me))],
  ['GET', '/api/owner/bookings', staff(['owner'], (env, me, req, url) => st.listBookings(env, me, url))],
  ['GET', '/api/owner/bookings/:id', staff(['owner'], (env, me, req, url, p) => st.getOne(env, me, p.id))],
  ['GET', '/api/owner/bookings/:id/proof', staff(['owner'], (env, me, req, url, p) => st.proof(env, me, p.id))],
  ['POST', '/api/owner/bookings/:id/approve', staff(['owner'], (env, me, req, url, p) => st.approve(env, me, p.id))],
  ['POST', '/api/owner/bookings/:id/reject', staff(['owner'], (env, me, req, url, p) => st.reject(env, me, p.id, req))],
  ['POST', '/api/owner/bookings/:id/cancel', staff(['owner'], (env, me, req, url, p) => st.cancel(env, me, p.id, req))],
  ['GET', '/api/owner/calendar', staff(['owner'], (env, me, req, url) => st.calendar(env, me, url))],
  ['POST', '/api/owner/slots', staff(['owner'], (env, me, req) => st.addSlot(env, me, req))],
  ['GET', '/api/owner/settings', staff(['owner'], (env, me) => st.getSettings(env, me))],
  ['PUT', '/api/owner/settings', staff(['owner'], (env, me, req) => st.saveSettings(env, me, req))],
  ['POST', '/api/owner/photos', staff(['owner'], (env, me, req) => st.addPhoto(env, me, req))],
  ['DELETE', '/api/owner/photos/:id', staff(['owner'], (env, me, req, url, p) => st.deletePhoto(env, me, p.id))],
  ['PUT', '/api/owner/upi-qr', staff(['owner'], (env, me, req) => st.setQr(env, me, req))],
  ['PUT', '/api/owner/razorpay', staff(['owner'], (env, me, req) => st.saveRazorpay(env, me, req))],
  ['DELETE', '/api/owner/razorpay', staff(['owner'], (env, me) => st.disconnectRazorpay(env, me))],
  ['POST', '/api/owner/bookings/:id/refunded', staff(['owner'], (env, me, req, url, p) => st.markRefunded(env, me, p.id))],
  ['POST', '/api/owner/helpers', staff(['owner'], (env, me, req) => st.addHelper(env, me, req))],
  ['DELETE', '/api/owner/helpers/:id', staff(['owner'], (env, me, req, url, p) => st.removeHelper(env, me, p.id))],
  ['POST', '/api/staff/pin', staff(['owner', 'helper'], (env, me, req) => st.changePin(env, me, req))],

  // helper (owners can open it too)
  ['GET', '/api/helper/upcoming', staff(['helper', 'owner'], (env, me) => st.upcoming(env, me))],
];

function staff(roles, fn) {
  return async (env, req, url, params) => fn(env, await requireStaff(env.DB, req, roles), req, url, params);
}

const compiled = routes.map(([method, pattern, handler]) => {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '/?$');
  return { method, re, keys, handler };
});

function match(method, path) {
  let pathMatched = false;
  for (const r of compiled) {
    const m = path.match(r.re);
    if (!m) continue;
    pathMatched = true;
    if (r.method !== method) continue;
    const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    return { handler: r.handler, params };
  }
  return pathMatched ? 'method' : null;
}

// Reject cross-site writes: browsers always send Origin on POST/PUT/DELETE.
function checkOrigin(request, url) {
  if (request.method === 'GET' || request.method === 'HEAD') return;
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) throw new HttpError(403, 'Cross-site request blocked', 'origin');
}

export async function handleApi(request, env) {
  const url = new URL(request.url);
  try {
    checkOrigin(request, url);
    const m = match(request.method, url.pathname);
    if (!m) throw new HttpError(404, 'Not found', 'not_found');
    if (m === 'method') throw new HttpError(405, 'Method not allowed', 'method');
    return await m.handler(env, request, url, m.params);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message, code: e.code }, e.status);
    console.error('Unhandled error', e && e.stack ? e.stack : e);
    return json({ error: 'Something went wrong. Please try again.', code: 'server' }, 500);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return handleApi(request, env);
    // Anything else is the single-page app (Workers Assets falls back to index.html).
    return env.ASSETS.fetch(request);
  },
  // Cron trigger (see wrangler.toml): first pick up online payments we missed, then
  // release slots whose hold ran out.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(reconcileRecent(env).catch((e) => console.error(e)).then(() => sweepExpired(env.DB)));
  },
};
