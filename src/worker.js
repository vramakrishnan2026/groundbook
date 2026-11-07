// GoArena — Cloudflare Worker entry point.
// Static files (the app) are served by Workers Assets; everything under /api comes here.
import { adminLogin, login, loginWithGoogle, logout, requireAdmin, requireStaff } from './lib/auth.js';
import { sweepExpired } from './lib/bookings.js';
import { reconcileRecent } from './lib/razorpay.js';
import { groundIdForPath, logError, pruneLogs } from './lib/tracking.js';
import { HttpError, json, readJson } from './lib/util.js';
import * as pub from './routes/public.js';
import * as st from './routes/staff.js';
import * as acc from './routes/accounts.js';
import * as adm from './routes/admin.js';

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
  ['GET', '/api/config', async (env) => acc.config(env)],
  // Browser errors from any page (customer or owner), for remote debugging.
  ['POST', '/api/client-error', async (env, req) => {
    const b = await readJson(req).catch(() => ({}));
    const first = String(b.page || '').split(/[?#]/)[0].split('/')[1] || '';
    const slug = ['b', 'owner', 'helper', 'login', 'admin', 'signup'].includes(first) ? '' : first;
    const g = slug ? await env.DB.prepare('SELECT id FROM grounds WHERE slug = ?').bind(slug).first() : null;
    await logError(env.DB, { groundId: g ? g.id : null, source: 'browser', path: String(b.page || '').slice(0, 200), message: `${b.message || ''}${b.ua ? ` · ${b.ua}` : ''}` });
    return json({ ok: true });
  }],
  ['POST', '/api/auth/google', async (env, req) => {
    const { staff, setCookie } = await loginWithGoogle(env, req, await readJson(req));
    return json({ role: staff.role, ground: staff.ground_name }, 200, { 'set-cookie': setCookie });
  }],
  ['POST', '/api/auth/signup', (env, req) => acc.signup(env, req)],
  ['POST', '/api/staff/google', staff(['owner', 'helper'], (env, me, req) => acc.linkGoogle(env, me, req))],
  ['DELETE', '/api/staff/google', staff(['owner', 'helper'], (env, me) => acc.unlinkGoogle(env, me))],

  // GoArena admin
  ['POST', '/api/admin/login', async (env, req) => json({ ok: true }, 200, { 'set-cookie': await adminLogin(env, req, await readJson(req)) })],
  ...[
    ['GET', '/api/admin/overview', (env, req, email) => adm.overview(env, email)],
    ['GET', '/api/admin/grounds/:id', (env, req, email, p) => adm.detail(env, p.id)],
    ['POST', '/api/admin/grounds/:id/approve', (env, req, email, p) => adm.decide(env, email, p.id, true)],
    ['POST', '/api/admin/grounds/:id/reject', (env, req, email, p) => adm.decide(env, email, p.id, false)],
    ['PUT', '/api/admin/grounds/:id/service', (env, req, email, p) => adm.setService(env, email, p.id, req)],
    ['PUT', '/api/admin/grounds/:id/plan', (env, req, email, p) => adm.setPlan(env, email, p.id, req)],
    ['PUT', '/api/admin/grounds/:id/profile', (env, req, email, p) => adm.setProfile(env, email, p.id, req)],
    ['POST', '/api/admin/grounds/:id/razorpay/test', (env, req, email, p) => adm.rzpTest(env, email, p.id)],
    ['GET', '/api/admin/grounds/:id/razorpay/payments', (env, req, email, p) => adm.rzpPayments(env, p.id)],
    ['POST', '/api/admin/grounds/:id/razorpay/recheck', (env, req, email, p) => adm.rzpRecheck(env, email, p.id, req)],
    ['DELETE', '/api/admin/grounds/:id/razorpay', (env, req, email, p) => adm.rzpDisconnect(env, email, p.id)],
    ['GET', '/api/admin/errors', (env) => adm.errors(env)],
    ['POST', '/api/admin/grounds/:id/duplicate-demo', (env, req, email, p) => adm.duplicateAsDemo(env, email, p.id, req)],
    ['PUT', '/api/admin/grounds/:id/plan-enabled', (env, req, email, p) => adm.togglePlan(env, email, p.id, req)],
    ['POST', '/api/admin/grounds/:id/payments', (env, req, email, p) => adm.addPayment(env, email, p.id, req)],
    ['POST', '/api/admin/grounds/:id/logout-all', (env, req, email, p) => adm.logoutAll(env, email, p.id)],
    ['POST', '/api/admin/grounds/:id/open-as-owner', (env, req, email, p) => adm.openAsOwner(env, email, p.id, req)],
    ['POST', '/api/admin/staff/:id/reset-pin', (env, req, email, p) => adm.resetPin(env, email, p.id)],
    ['POST', '/api/admin/staff/:id/unlink-google', (env, req, email, p) => adm.unlinkGoogle(env, email, p.id)],
    ['PUT', '/api/admin/staff/:id/phone', (env, req, email, p) => adm.setPhone(env, email, p.id, req)],
  ].map(([m, path, fn]) => [m, path, async (env, req, url, p) => fn(env, req, await requireAdmin(env, req), p)]),
  ['POST', '/api/auth/logout', async (env, req) => json({ ok: true }, 200, { 'set-cookie': await logout(env.DB, req) })],
  ['GET', '/api/me', staff(['owner', 'helper'], (env, me) => st.me(env, me))],

  // owner
  ['GET', '/api/owner/today', staff(['owner'], (env, me) => st.today(env, me))],
  ['GET', '/api/owner/bookings', staff(['owner'], (env, me, req, url) => st.listBookings(env, me, url))],
  ['GET', '/api/owner/bookings/:id', staff(['owner'], (env, me, req, url, p) => st.getOne(env, me, p.id))],
  ['GET', '/api/owner/bookings/:id/proof', staff(['owner'], (env, me, req, url, p) => st.proof(env, me, p.id))],
  ['POST', '/api/owner/bookings/:id/approve', staff(['owner'], (env, me, req, url, p) => st.approve(env, me, p.id))],
  ['POST', '/api/owner/bookings/:id/reject', staff(['owner'], (env, me, req, url, p) => st.reject(env, me, p.id, req))],
  ['POST', '/api/owner/bookings/:id/refund-status', staff(['owner'], (env, me, req, url, p) => st.refundStatus(env, me, p.id))],
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
    if (e instanceof HttpError) {
      // Keep server-side failures and Razorpay problems for the admin page.
      if (e.status >= 500 || String(e.code).startsWith('rzp_')) {
        await logError(env.DB, { groundId: await groundIdForPath(env.DB, url.pathname), source: String(e.code).startsWith('rzp_') ? 'razorpay' : 'server', path: `${request.method} ${url.pathname}`, status: e.status, code: e.code, message: e.message });
      }
      return json({ error: e.message, code: e.code }, e.status);
    }
    console.error('Unhandled error', e && e.stack ? e.stack : e);
    await logError(env.DB, { groundId: await groundIdForPath(env.DB, url.pathname), path: `${request.method} ${url.pathname}`, status: 500, code: 'server', message: (e && e.stack) || String(e) });
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
    ctx.waitUntil(reconcileRecent(env).catch((e) => console.error(e)).then(() => sweepExpired(env.DB)).then(() => pruneLogs(env.DB)));
  },
};
