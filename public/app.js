// GoArena web app — customer, owner and helper screens. Plain JavaScript, no build step.
import qrcode from './vendor/qrcode.js';

// QR code as a PNG data URL, drawn locally (no third-party service sees the data).
function qrPng(text, scale = 8, margin = 4) {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  const n = q.getModuleCount(), size = (n + margin * 2) * scale;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#000';
  for (let r = 0; r < n; r++) for (let col = 0; col < n; col++) if (q.isDark(r, col)) ctx.fillRect((col + margin) * scale, (r + margin) * scale, scale, scale);
  return c.toDataURL('image/png');
}

// ---------------------------------------------------------------- helpers
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
const raw = (s) => new Raw(s);
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);
const fmt = (v) => (v == null || v === false ? '' : v instanceof Raw ? v.s : Array.isArray(v) ? v.map(fmt).join('') : esc(String(v)));
const h = (strs, ...vals) => raw(strs.reduce((o, s, i) => o + s + (i < vals.length ? fmt(vals[i]) : ''), ''));

const ICONS = {
  back: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  pin: '<path d="M20 10c0 5-5.5 10.2-7.4 11.8a1 1 0 0 1-1.2 0C9.5 20.2 4 15 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
  image: '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.7 9a1 1 0 0 1-.6 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.2-2.7a1.2 1.2 0 0 1 1.6 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  home: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .7-1.5l7-6a2 2 0 0 1 2.6 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  settings: '<path d="M20 7h-9M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  qr: '<rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3M21 21v.01M12 7v3a2 2 0 0 1-2 2H7M3 12h.01M12 3h.01M12 16v.01M16 12h1M21 12v.01M12 21v-1"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z"/>',
  user: '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.8 9.8 0 0 1 6.7 2.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.8 9.8 0 0 1-6.7-2.7L3 16"/><path d="M8 16H3v5"/>',
  plus: '<path d="M5 12h14M12 5v14"/>',
  trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
};
const icon = (n, s = 20) => raw(`<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]}</svg>`);

const money = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
const asDate = (d) => new Date(d + 'T00:00:00Z');
const fmtDate = (d) => asDate(d).toLocaleDateString('en-IN', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
const dayShort = (d) => asDate(d).toLocaleDateString('en-IN', { timeZone: 'UTC', weekday: 'short' });
const dayNum = (d) => asDate(d).getUTCDate();
const hourLabel = (hr) => `${((hr + 11) % 12) + 1} ${hr < 12 || hr === 24 ? 'AM' : 'PM'}`;
const addDays = (d, n) => { const x = asDate(d); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const waLink = (phone, text) => `https://wa.me/91${phone}?text=${encodeURIComponent(text)}`;
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

class ApiError extends Error { constructor(msg, status, code) { super(msg); this.status = status; this.code = code; } }
async function api(method, path, body, opts = {}) {
  const init = { method, headers: {}, credentials: 'same-origin' };
  if (body instanceof FormData) init.body = body;
  else if (body instanceof Blob) { init.body = body; init.headers['content-type'] = body.type || 'image/jpeg'; }
  else if (body !== undefined) { init.body = JSON.stringify(body); init.headers['content-type'] = 'application/json'; }
  let res;
  try { res = await fetch(path, init); } catch { throw new ApiError('No internet connection. Please try again.', 0, 'network'); }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !opts.noRedirect && data.code === 'auth') {
    // Several requests can fail at once; only the first one redirects.
    if (location.pathname !== '/login') go('/login?next=' + encodeURIComponent(location.pathname + location.search), true);
    throw new ApiError('Please log in', 401, 'auth');
  }
  if (!res.ok) throw new ApiError(data.error || 'Something went wrong', res.status, data.code);
  return data;
}

let toastTimer;
function toast(msg) {
  document.querySelector('.toast')?.remove();
  const t = document.createElement('div');
  t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
  document.body.appendChild(t);
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.remove(), 3500);
}

function openSheet(content, handlers = {}) {
  closeSheet();
  const s = document.createElement('div');
  s.className = 'scrim';
  s.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${content}</div>`;
  s.addEventListener('click', (e) => { if (e.target === s) closeSheet(); });
  s._handlers = handlers;
  document.body.appendChild(s);
  s.querySelector('input,select,textarea,button')?.focus({ preventScroll: true });
  return s;
}
const closeSheet = () => document.querySelector('.scrim')?.remove();

// Resize on the phone so uploads stay small (the server accepts up to 1.4 MB per image).
async function compressImage(file, max = 1600, quality = 0.82) {
  try {
    const bmp = await createImageBitmap(file);
    for (let attempt = 0; attempt < 4; attempt++) {
      const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', quality));
      if (blob && blob.size <= 1_200_000) return blob;
      max = Math.round(max * 0.75); quality = Math.max(0.5, quality - 0.1);
    }
    return file;
  } catch { return file; }
}

async function copy(text, done = 'Copied') {
  try { await navigator.clipboard.writeText(text); toast(done); }
  catch { prompt('Copy this:', text); }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return window.Razorpay ? resolve() : setTimeout(resolve, 500);
    const el = document.createElement('script');
    el.src = src; el.onload = resolve;
    el.onerror = () => { el.remove(); reject(new Error('Could not open the payment page. Check your internet and try again.')); };
    document.head.appendChild(el);
  });
}

// ---------------------------------------------------------------- error reporting
// Browser errors go to the GoArena admin page (at most 5 per page load) so problems on
// customers' phones can be debugged remotely.
let reported = 0;
function reportError(message) {
  if (reported++ >= 5 || !message) return;
  const body = JSON.stringify({ page: location.pathname + location.search, message: String(message).slice(0, 400), ua: navigator.userAgent.slice(0, 160) });
  try { navigator.sendBeacon ? navigator.sendBeacon('/api/client-error', new Blob([body], { type: 'application/json' })) : fetch('/api/client-error', { method: 'POST', headers: { 'content-type': 'application/json' }, body }); } catch { /* ignore */ }
}
window.addEventListener('error', (e) => reportError(`${e.message} at ${(e.filename || '').split('/').pop()}:${e.lineno}`));
window.addEventListener('unhandledrejection', (e) => { if (!(e.reason instanceof ApiError)) reportError(e.reason && (e.reason.stack || e.reason.message || e.reason)); });

// ---------------------------------------------------------------- Sign in with Google
// The button is drawn by Google's own script. Everything stays hidden until the
// server has a Google client ID configured.
let googleId;
let gsiLoading;
async function googleClientId() {
  if (googleId === undefined) googleId = (await api('GET', '/api/config').catch(() => ({}))).googleClientId || null;
  return googleId;
}
function loadGsi() {
  if (window.google?.accounts?.id) return Promise.resolve(true);
  gsiLoading = gsiLoading || new Promise((resolve) => {
    const el = document.createElement('script');
    el.src = 'https://accounts.google.com/gsi/client'; el.async = true;
    el.onload = () => resolve(true);
    el.onerror = () => { el.remove(); gsiLoading = null; resolve(false); };
    document.head.appendChild(el);
  });
  return gsiLoading;
}
// Draws a Google button into #id. onCredential gets Google's signed token.
async function googleButton(id, onCredential, { text = 'continue_with', dark = false, prompt = false } = {}) {
  const box = document.getElementById(id);
  const clientId = await googleClientId();
  if (!box || !clientId) return false;
  if (!(await loadGsi()) || !document.body.contains(box)) {
    if (document.body.contains(box)) box.innerHTML = '<p class="small muted center">Google sign-in could not load. Check your internet.</p>';
    return false;
  }
  window.google.accounts.id.initialize({ client_id: clientId, ux_mode: 'popup', auto_select: false, cancel_on_tap_outside: true, use_fedcm_for_prompt: true,
    callback: (r) => onCredential(r.credential) });
  box.innerHTML = '';
  window.google.accounts.id.renderButton(box, { theme: dark ? 'filled_black' : 'outline', size: 'large', shape: 'pill', text, logo_alignment: 'center', width: Math.min(Math.max(box.clientWidth, 240), 400) });
  box.closest('[data-google]')?.classList.remove('hidden');
  if (prompt) window.google.accounts.id.prompt();
  return true;
}
const googleName = (cred) => { try { return JSON.parse(decodeURIComponent(escape(atob(cred.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))))).name || ''; } catch { return ''; } };
function showError(id, msg) {
  const el = document.getElementById(id);
  if (el) { el.textContent = msg; el.classList.remove('hidden'); } else toast(msg);
}

// ---------------------------------------------------------------- view plumbing
const $app = document.getElementById('app');
let view = { actions: {}, forms: {}, changes: {}, cleanup: [] };
function render(html, handlers = {}) {
  $app.innerHTML = String(html);
  view.actions = handlers.actions || {};
  view.forms = handlers.forms || {};
  view.changes = handlers.changes || {};
}
// Scroll only the date strip sideways (scrollIntoView would also move the page).
function centerDate() {
  const on = document.querySelector('.date.on'), strip = on && on.parentElement;
  if (strip) strip.scrollLeft = on.offsetLeft - strip.offsetLeft - (strip.clientWidth - on.offsetWidth) / 2;
}
const every = (ms, fn) => { const id = setInterval(fn, ms); view.cleanup.push(() => clearInterval(id)); };

function go(path, replace = false) {
  if (replace) history.replaceState(null, '', path); else history.pushState(null, '', path);
  route();
}
window.addEventListener('popstate', () => { closeSheet(); route(); });

const findHandler = (bag, name) => (document.querySelector('.scrim')?._handlers?.[name]) || bag[name];
document.addEventListener('click', (e) => {
  const nav = e.target.closest('[data-go]');
  if (nav) { e.preventDefault(); closeSheet(); go(nav.dataset.go); return; }
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = findHandler(view.actions, el.dataset.act);
  if (fn) { e.preventDefault(); fn(el, e); }
});
document.addEventListener('submit', async (e) => {
  const f = e.target.closest('form[data-form]');
  if (!f) return;
  e.preventDefault();
  const fn = findHandler(view.forms, f.dataset.form);
  if (!fn) return;
  const btn = f.querySelector('[type=submit]') || document.querySelector(`[form="${f.id}"]`);
  if (btn) btn.disabled = true;
  try { await fn(Object.fromEntries(new FormData(f)), f); }
  catch (err) { if (err.status !== 401) showFormError(f, err); }
  finally { if (btn && document.body.contains(btn)) btn.disabled = false; }
});
document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-change]');
  if (!el) return;
  const fn = findHandler(view.changes, el.dataset.change);
  if (fn) fn(el, e);
});
function showFormError(form, err) {
  const box = form.querySelector('.form-error');
  if (box) { box.textContent = err.message; box.classList.remove('hidden'); box.scrollIntoView({ block: 'nearest' }); }
  else toast(err.message);
}

const ROUTES = [
  [/^\/g\/([\w-]+)\/?$/, (m) => go(`/${m[1]}${location.search}`, true)], // old links keep working
  [/^\/b\/([\w-]+)\/?$/, (m) => bookingPage(m[1])],
  [/^\/login\/?$/, () => loginPage()],
  [/^\/owner\/?$/, () => ownerToday()],
  [/^\/owner\/calendar\/?$/, () => ownerCalendar()],
  [/^\/owner\/settings\/?$/, () => ownerSettings()],
  [/^\/owner\/review\/(\d+)\/?$/, (m) => ownerReview(m[1])],
  [/^\/helper\/?$/, () => helperPage()],
  [/^\/signup\/?$/, () => signupPage()],
  [/^\/admin\/?$/, () => adminPage()],
  [/^\/admin\/g\/(\d+)\/?$/, (m) => adminGround(m[1])],
  [/^\/admin\/errors\/?$/, () => adminErrors()],
  [/^\/?$/, () => landing()],
  [/^\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/, (m) => customer(m[1])], // book.goarena.in/llab-toof
];
// Same screen redrawn (after an upload, picking a time, auto-refresh) keeps its scroll
// position; going to a different screen starts at the top.
let lastScreen = null;
async function route() {
  view.cleanup.forEach((f) => f()); view.cleanup = [];
  const path = location.pathname;
  const screen = path + '|' + (new URLSearchParams(location.search).get('step') || '');
  const keepY = screen === lastScreen ? window.scrollY : 0;
  lastScreen = screen;
  if (!keepY) window.scrollTo(0, 0);
  for (const [re, fn] of ROUTES) {
    const m = path.match(re);
    if (m) {
      try { await fn(m); } catch (err) { if (err.status !== 401) renderError(err); }
      if (keepY) window.scrollTo(0, keepY);
      return;
    }
  }
  renderError(new ApiError('Page not found', 404));
}
function renderError(err) {
  if (!(err instanceof ApiError)) reportError(err && (err.stack || err.message || err)); // a bug, not a normal "not found" etc.
  render(h`<div class="screen"><div class="content" style="justify-content:center;align-items:center;text-align:center">
    <div class="circle big red">${icon('x', 40)}</div>
    <div class="title">${err.status === 404 ? 'Not found' : 'Something went wrong'}</div>
    <p class="muted">${err.message}</p>
    <button class="btn secondary" data-act="reload" style="max-width:240px">Try again</button></div></div>`,
    { actions: { reload: () => route() } });
}

const topbar = (title, backTo) => h`<div class="topbar">${backTo ? h`<button class="iconbtn" aria-label="Back" data-go="${backTo}">${icon('back')}</button>` : ''}<div class="heading">${title}</div></div>`;
// Faint background photo for a screen (see .screen::before in styles.css).
const photoBg = (url) => (url ? raw(`style="--screen-photo:url('${String(url).replace(/['"()\\\s]/g, '')}')"`) : '');
const groundPhoto = (slug) => { const d = groundCache[slug]; return d ? (d.photos[0] ? d.photos[0].url : SAMPLE_PHOTOS[0]) : null; };
const kv = (k, v, cls = '') => h`<div class="kv ${cls}"><span>${k}</span><span>${v}</span></div>`;
const pitchArt = raw(`<svg viewBox="0 0 390 232" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="390" height="232" fill="#1C8A4B"/>${Array.from({ length: 10 }, (_, i) => `<rect x="${i * 39}" width="19.5" height="232" fill="#22985A"/>`).join('')}<g stroke="#fff" stroke-opacity=".85" stroke-width="3" fill="none"><rect x="28" y="34" width="334" height="166" rx="4"/><path d="M195 34v166"/><circle cx="195" cy="117" r="30"/><rect x="28" y="79" width="40" height="76"/><rect x="322" y="79" width="40" height="76"/></g></svg>`);

// ---------------------------------------------------------------- landing
// Football photos from GoArena (Unsplash licence: free to use). Shown only until the owner
// uploads real photos, and always marked "Sample photo" so customers aren't misled.
const SAMPLE_PHOTOS = ['1513609698234-16d36e4b7a65', '1650327987377-90bf6c9789fd', '1520470082789-e347ad8b1944']
  .map((id) => `https://images.unsplash.com/photo-${id}?w=1200&h=800&fit=crop&auto=format&q=75`);

function landing() {
  render(h`<div class="screen">
    <div class="hero big" style="background-image:url(/img/stadium.jpg)"><div class="shade"></div>
      <div class="over"><div class="brand">${icon('calendar', 18)} GoArena</div>
        <h1 class="hero-title">Book your game in a minute.</h1>
        <p class="hero-sub">Scan the ground's QR, pick a slot, pay by UPI. No app, no commission.</p></div></div>
    <div class="content sheet-up">
      <div class="feature-list">
        ${[['qr', 'Scan the QR at the ground', 'Opens the booking page. Nothing to install.'], ['calendar', 'Pick a free slot', 'Full ground or half, any day in the next two weeks.'], ['check', 'Pay and play', 'Pay the ground directly by UPI and get confirmed.']]
          .map(([ic, t, d]) => h`<div class="feature"><div class="circle soft">${icon(ic, 20)}</div><div><div class="strong">${t}</div><div class="small muted">${d}</div></div></div>`)}
      </div>
      <p class="small muted">Got a booking link from a ground? Open it directly. Ground owners and helpers can log in below.</p>
    </div>
    <div class="footer plain"><div class="btn-row"><button class="btn secondary" data-go="/signup">List your ground</button><button class="btn primary" data-go="/login">Log in</button></div></div></div>`);
}

// ---------------------------------------------------------------- customer: ground → slots → details
const groundCache = {};
async function customer(slug) {
  const q = new URLSearchParams(location.search);
  const data = groundCache[slug] || (groundCache[slug] = await api('GET', `/api/g/${slug}`));
  document.title = data.ground.name;
  const step = q.get('step');
  if (step === 'slots') return customerSlots(slug, data, q);
  if (step === 'details') return customerDetails(slug, data, q);
  return customerHome(slug, data);
}

function customerHome(slug, data) {
  const g = data.ground;
  const mine = store.get('gb_bookings', []).filter((b) => b.slug === slug && b.date >= data.dates[0].date);
  const halves = data.units.length > 1;
  const sample = !data.photos.length;
  const photos = sample ? SAMPLE_PHOTOS : data.photos.map((p) => p.url);
  const from = Math.min(...data.units.map((u) => Math.min(u.weekday, u.weekend)));
  render(h`<div class="screen" ${photoBg(photos[0])}>
    <div class="hero big">
      <div class="fallback">${pitchArt}</div>
      <div class="strip" id="strip">${photos.map((src, i) => h`<img src="${src}" alt="${sample ? 'Sample football ground photo' : `${g.name} photo ${i + 1}`}" ${i ? raw('loading="lazy"') : ''} onerror="this.remove()">`)}</div>
      <div class="shade"></div>
      ${sample ? h`<span class="sample">Sample photo</span>` : ''}
      <div class="over">
        <h1 class="hero-title">${g.name}</h1>
        ${g.area ? h`<div class="hero-sub row">${icon('pin', 16)} ${g.area}</div>` : ''}
      </div>
      ${photos.length > 1 ? h`<div class="dots" id="dots">${photos.map((_, i) => h`<i class="${i === 0 ? 'on' : ''}"></i>`)}</div>` : ''}
    </div>
    <div class="content sheet-up">
      ${g.demo ? h`<div class="banner blue small">${icon('info', 18)}<div><span class="strong">Demo ground.</span> Bookings here are for testing and are not real, so please don't pay real money.</div></div>` : ''}
      <div class="row between">
        <div class="col" style="gap:0"><span class="caption muted">FROM</span><span class="price">${money(from)}<span class="small muted" style="font-weight:600"> / hour</span></span></div>
        ${g.mapsUrl ? h`<a class="btn small secondary" href="${g.mapsUrl}" target="_blank" rel="noopener">${icon('pin', 16)} Directions</a>` : ''}
      </div>
      ${g.facilities.length ? h`<div class="chips">${g.facilities.map((f) => h`<span class="chip">${icon('check', 14)} ${f}</span>`)}</div>` : ''}
      <div class="col gap12">
        <div class="section-title">Prices per hour</div>
        <div class="tiles">${data.units.map((u) => h`<div class="tile">
          <div class="strong">${u.name}</div>${u.subtitle ? h`<div class="small muted">${u.subtitle}</div>` : ''}
          <div class="tile-price">${money(u.weekday)}<span> Mon–Fri</span></div>
          <div class="small muted">${money(u.weekend)} Sat–Sun</div></div>`)}</div>
        ${halves ? h`<p class="small muted">Book the full ground for 8-a-side, or one half for 5-a-side. Another team can book the other half.</p>` : ''}
      </div>
      ${g.about ? h`<div class="col gap12"><div class="section-title">About</div><p class="small">${g.about}</p></div>` : ''}
      ${mine.length ? h`<div class="col gap12"><div class="section-title">Your bookings</div>${mine.map((b) => h`
        <a class="brow" href="/b/${b.token}" data-go="/b/${b.token}"><div class="time">${hourLabel(b.hour)}</div>
        <div class="grow"><div class="strong">${fmtDate(b.date)}</div><div class="small muted">${b.unit} · ${b.ref}</div></div>${icon('right', 18)}</a>`)}</div>` : ''}
    </div>
    <div class="footer">${g.open ? h`<button class="btn primary" data-go="/${slug}?step=slots">Check free slots ${icon('right', 18)}</button>`
      : h`<div class="col gap8"><p class="small muted center">Online booking opens soon.</p>${g.whatsapp ? h`<a class="btn primary" href="tel:+91${g.whatsapp}">${icon('phone', 18)} Call to book</a>` : ''}</div>`}</div>
  </div>`);
  const strip = document.getElementById('strip'), dots = document.getElementById('dots');
  if (strip && dots) strip.addEventListener('scroll', () => {
    const i = Math.round(strip.scrollLeft / strip.clientWidth);
    dots.querySelectorAll('i').forEach((d, k) => d.classList.toggle('on', k === i));
  }, { passive: true });
}

async function customerSlots(slug, data, q) {
  const date = data.dates.some((d) => d.date === q.get('date')) ? q.get('date') : data.dates[0].date;
  const unitId = Number(q.get('unit')) || data.units[0].id;
  const unit = data.units.find((u) => u.id === unitId) || data.units[0];
  const hour = q.has('hour') ? Number(q.get('hour')) : null;
  const slots = await api('GET', `/api/g/${slug}/slots?date=${date}`);
  const visible = slots.hours.filter((x) => x.units[unit.id] !== 'past');
  const selected = visible.find((x) => x.hour === hour && x.units[unit.id] === 'free') ? hour : null;
  // Changing date or court clears the chosen time; picking a time keeps date and court.
  const url = (p) => `/${slug}?${new URLSearchParams({ step: 'slots', date, unit: unit.id, ...p })}`;
  const price = slots.prices[unit.id];
  render(h`<div class="screen" ${photoBg(groundPhoto(slug))}>
    ${topbar('Pick a slot', `/${slug}`)}
    <div class="content" style="gap:24px">
      <div class="col gap12"><div class="heading">Date</div>
        <div class="dates" id="dates">${data.dates.map((d) => h`<button class="date ${d.date === date ? 'on' : ''}" data-act="date" data-date="${d.date}" aria-pressed="${d.date === date}"><span class="d">${dayShort(d.date)}</span><span class="n">${dayNum(d.date)}</span></button>`)}</div></div>
      ${data.units.length > 1 ? h`<div class="col gap12"><div class="heading">Court</div>
        <div class="seg">${data.units.map((u) => h`<button class="${u.id === unit.id ? 'on' : ''}" data-act="unit" data-unit="${u.id}" aria-pressed="${u.id === unit.id}"><span class="a">${u.name}</span><span class="b">${u.subtitle}</span></button>`)}</div></div>` : ''}
      <div class="col gap12"><div class="row between"><div class="heading">Time</div><div class="small muted">${money(price)} / hour</div></div>
        ${visible.length ? h`<div class="slots">${visible.map((x) => { const st = x.units[unit.id]; return h`<button class="slot ${x.hour === selected ? 'on' : ''}" ${st !== 'free' ? raw('disabled') : ''} data-act="hour" data-hour="${x.hour}" aria-label="${x.label} ${st === 'free' ? 'free' : 'booked'}">${x.label}</button>`; })}</div>`
          : h`<div class="empty">No more slots today. Pick another date.</div>`}
        <div class="legend"><span><i style="border:1.5px solid var(--border)"></i>Free</span><span><i style="background:var(--primary)"></i>Selected</span><span><i style="background:var(--taken)"></i>Booked</span></div>
      </div>
    </div>
    <div class="footer">
      ${selected !== null ? h`<div class="row between"><div class="col" style="gap:0"><div class="strong">${fmtDate(date)} · ${hourLabel(selected)}</div><div class="small muted">${unit.name} · 1 hour</div></div><div class="price">${money(price)}</div></div>` : h`<div class="small muted center">Pick a free time to continue</div>`}
      <button class="btn primary" ${selected === null ? raw('disabled') : ''} data-act="next">Continue</button>
    </div></div>`, {
    actions: {
      date: (el) => go(url({ date: el.dataset.date }), true),
      unit: (el) => go(url({ unit: el.dataset.unit }), true),
      hour: (el) => go(url({ hour: el.dataset.hour }), true),
      next: () => go(`/${slug}?${new URLSearchParams({ step: 'details', date, unit: unit.id, hour: selected })}`),
    },
  });
  centerDate();
}

function customerDetails(slug, data, q) {
  const date = q.get('date'), hour = Number(q.get('hour'));
  const unit = data.units.find((u) => u.id === Number(q.get('unit')));
  if (!unit || !date || Number.isNaN(hour)) return go(`/${slug}?step=slots`, true);
  const dayInfo = data.dates.find((d) => d.date === date);
  const price = dayInfo && dayInfo.dayType === 'weekend' ? unit.weekend : unit.weekday;
  const me = store.get('gb_me', {});
  render(h`<div class="screen" ${photoBg(groundPhoto(slug))}>
    ${topbar('Your details', `/${slug}?${new URLSearchParams({ step: 'slots', date, unit: unit.id, hour })}`)}
    <form class="content" data-form="hold" id="hold-form" novalidate>
      <div class="banner amber">${icon('clock', 22)}<div><div class="strong">We hold the slot for ${data.ground.holdMinutes} minutes</div><div>Pay by UPI and send the screenshot within that time.</div></div></div>
      <div class="field"><label for="name">Your name</label><input class="input" id="name" name="name" autocomplete="name" value="${me.name || ''}" required></div>
      <div class="field"><label for="phone">Phone number</label><input class="input" id="phone" name="phone" type="tel" inputmode="numeric" autocomplete="tel" maxlength="14" value="${me.phone || ''}" required></div>
      <p class="small muted">The ground may call this number if you're running late. No login or password needed.</p>
      <div class="card" style="gap:10px"><div class="heading">Booking</div>
        ${kv('Date', fmtDate(date))}${kv('Time', `${hourLabel(hour)} – ${hourLabel(hour + 1)}`)}${kv('Court', [unit.name, unit.subtitle].filter(Boolean).join(' · '))}
        <div class="divider"></div>${kv('Total', money(price), 'total')}</div>
      <div class="form-error banner red hidden" role="alert"></div>
    </form>
    <div class="footer"><button class="btn primary" type="submit" form="hold-form">Hold slot & pay ${money(price)}</button></div>
  </div>`, {
    forms: {
      hold: async (f) => {
        store.set('gb_me', { name: f.name, phone: f.phone });
        try {
          const r = await api('POST', `/api/g/${slug}/bookings`, { unitId: unit.id, date, hour, name: f.name, phone: f.phone });
          const list = store.get('gb_bookings', []).filter((b) => b.token !== r.token);
          list.unshift({ token: r.token, slug, date, hour, unit: unit.name, ref: '', at: Date.now() });
          store.set('gb_bookings', list.slice(0, 10));
          go(`/b/${r.token}`);
        } catch (err) {
          if (err.code === 'slot_taken') { toast(err.message); go(`/${slug}?${new URLSearchParams({ step: 'slots', date, unit: unit.id })}`, true); return; }
          throw err;
        }
      },
    },
  });
}

// ---------------------------------------------------------------- customer: booking page (/b/:token)
async function bookingPage(token) {
  const data = await api('GET', `/api/b/${token}`);
  const b = data.booking, g = data.ground;
  document.title = `${g.name} · ${b.ref}`;
  const list = store.get('gb_bookings', []);
  const mine = list.find((x) => x.token === token);
  if (mine && !mine.ref) { mine.ref = b.ref; store.set('gb_bookings', list); }
  const summary = h`<div class="card" style="gap:10px">
    ${kv('Booking ID', b.ref)}${kv('Name', b.name)}${kv('Date', fmtDate(b.date))}${kv('Time', b.timeLabel)}${kv('Court', [b.unit.name, b.unit.subtitle].filter(Boolean).join(' · '))}
    <div class="divider"></div>${kv(b.status === 'CONFIRMED' ? (b.paidVia === 'razorpay' ? 'Paid online' : 'Paid') : 'Amount', money(b.amount), 'total')}</div>`;
  const contact = g.whatsapp ? h`<div class="btn-row">
      <a class="btn secondary" href="${waLink(g.whatsapp, `Hi, about my booking ${b.ref} on ${fmtDate(b.date)} at ${hourLabel(b.hour)}.`)}" target="_blank" rel="noopener">${icon('chat', 18)} WhatsApp</a>
      <a class="btn soft" href="tel:+91${g.whatsapp}">${icon('phone', 18)} Call ground</a></div>` : '';
  const result = (circle, title, text, extra = '', footer = '') => render(h`<div class="screen" ${photoBg(groundPhoto(g.slug))}>
    ${topbar(g.name, `/${g.slug}`)}
    <div class="content" style="align-items:center;text-align:center;gap:24px;padding-top:24px">
      ${circle}<div class="col" style="gap:8px;align-items:center"><h1 class="display">${title}</h1><p class="muted">${text}</p></div>
      <div style="width:100%;text-align:left" class="col gap16">${extra}${summary}</div></div>
    <div class="footer plain">${footer}</div></div>`, { actions: { book: () => go(`/${g.slug}`), copyLink: () => copy(location.href, 'Link copied') } });

  if (b.status === 'HOLD') return payPage(token, data);
  if (b.status === 'PENDING') {
    result(h`<div class="circle big amber">${icon('clock', 40)}</div>`, 'Waiting for the ground',
      `${g.name} will check your payment and confirm. This page updates by itself, so keep the link.`,
      h`<button class="btn secondary" data-act="copyLink">${icon('copy', 18)} Copy link to this page</button>`, contact);
    every(15000, async () => { const d = await api('GET', `/api/b/${token}`).catch(() => null); if (d && d.booking.status !== 'PENDING') route(); });
    return;
  }
  if (b.status === 'CONFIRMED') {
    return result(h`<div class="circle big primary">${icon('check', 44)}</div>`, 'Booking confirmed', 'See you on the ground! Show this screen if the helper asks.', '',
      h`<div class="btn-row">${g.mapsUrl ? h`<a class="btn secondary" href="${g.mapsUrl}" target="_blank" rel="noopener">${icon('pin', 18)} Directions</a>` : ''}${g.whatsapp ? h`<a class="btn soft" href="tel:+91${g.whatsapp}">${icon('phone', 18)} Call ground</a>` : ''}</div>`);
  }
  if (b.status === 'REJECTED') {
    return result(h`<div class="circle big red">${icon('x', 40)}</div>`, 'Payment not accepted', `${g.name} could not confirm this payment${b.note ? `: ${b.note}` : ''}. If you paid, please contact them.`, '',
      h`${contact}<button class="btn primary" data-act="book">Book another slot</button>`);
  }
  if (b.refundNeeded) {
    return result(h`<div class="circle big amber">${icon('rupee' in ICONS ? 'rupee' : 'clock', 40)}</div>`, 'Refund on the way', `Your payment of ${money(b.amount)} went through, but the slot was booked by someone else after your time ran out. ${g.name} will refund you. Contact them if you don't get it within a few days.`, '',
      h`${contact}<button class="btn primary" data-act="book">Book another slot</button>`);
  }
  if (b.status === 'EXPIRED') {
    return result(h`<div class="circle big grey">${icon('clock', 40)}</div>`, 'Time ran out', 'The payment proof was not sent in time, so the slot was released. If you already paid, contact the ground.', '',
      h`${contact}<button class="btn primary" data-act="book">Book again</button>`);
  }
  return result(h`<div class="circle big grey">${icon('x', 40)}</div>`, 'Booking cancelled', b.note || 'This booking was cancelled.', '',
    h`${contact}<button class="btn primary" data-act="book">Book another slot</button>`);
}

function payPage(token, data) {
  const b = data.booking, g = data.ground, p = data.payment;
  const skew = b.serverNow - Date.now();
  const upi = p.upiId ? `upi://pay?pa=${p.upiId}&pn=${encodeURIComponent(p.upiName)}&am=${b.amount}.00&cu=INR&tn=${encodeURIComponent(b.ref)}` : null;
  // The QR holds the same payment details; scanning a QR is always allowed by UPI apps.
  const qrSrc = upi ? qrPng(upi) : null;
  let file = null;
  const manualSteps = h`
      <div class="card">
        <div class="row gap12"><div class="circle soft" style="width:32px;height:32px">1</div><div class="strong">Pay ${money(b.amount)} by UPI</div></div>
        ${p.upiId ? h`
        <div class="upi-box"><div class="col" style="gap:0;min-width:0"><span class="caption muted">UPI ID</span><span class="small strong" style="overflow-wrap:anywhere">${p.upiId}</span><span class="caption muted" style="letter-spacing:0">${p.upiName}</span></div></div>
        <button type="button" class="btn primary" data-act="copyUpi">${icon('copy', 18)} Copy UPI ID</button>
        <ol class="steps small">
          <li>Open Google Pay, PhonePe, Paytm or your bank's UPI app.</li>
          <li>Tap <b>Pay to UPI ID</b> (or <b>Pay anyone</b>) and paste the UPI ID.</li>
          <li>Pay <b>${money(b.amount)}</b>. In the note, you can add <b>${b.ref}</b>.</li>
          <li>Come back to this page for step 2.</li>
        </ol>
        <div class="divider"></div>
        <div class="col" style="align-items:center;gap:8px">
          <div class="small strong">Or scan this QR code</div>
          <img class="qr-img" src="${qrSrc}" alt="UPI QR code to pay ${money(b.amount)} to ${p.upiName}">
          <p class="caption muted center" style="letter-spacing:0">Scan it from another phone. On this phone, save the QR, then in your UPI app tap <b>Scan</b> and choose it from your gallery.</p>
          <a class="btn secondary" href="${qrSrc}" download="pay-${b.ref}.png">Save QR to gallery</a>
        </div>
        <a class="link center" href="${upi}">Try one-tap payment (doesn't work with every UPI ID)</a>`
        : p.qrUrl ? h`<img class="qr-img" src="${p.qrUrl}" alt="UPI QR code"><p class="caption muted center" style="letter-spacing:0">Scan this QR and pay ${money(b.amount)}.</p>`
        : h`<div class="banner grey">The ground hasn't added a UPI ID yet. Please call them to pay.</div>`}
      </div>
      <div class="card">
        <div class="row gap12"><div class="circle soft" style="width:32px;height:32px">2</div><div class="strong">Send proof of payment</div></div>
        <label class="upload" id="upload">${icon('image', 24)}<span class="small strong">Upload payment screenshot</span><span class="caption muted" style="letter-spacing:0">Tap to choose from gallery</span>
          <input type="file" accept="image/*" data-change="file" aria-label="Payment screenshot"></label>
        <div class="field"><label for="utr">UPI reference number (12 digits)</label><input class="input" id="utr" name="utr" inputmode="numeric" autocomplete="off" maxlength="16" placeholder="e.g. 412899321170" required>
          <span class="caption muted" style="letter-spacing:0">Find it in your UPI app under the payment details (UTR / UPI Ref No.).</span></div>
      </div>
`;
  render(h`<div class="screen" ${photoBg(groundPhoto(g.slug))}>
    ${topbar('Payment', `/${g.slug}`)}
    <form class="content tight" data-form="proof" id="proof-form" novalidate>
      <div><span class="pill amber">${icon('clock', 16)} Slot held · <span id="countdown">--:--</span> left</span></div>
      <div class="card" style="align-items:center;gap:4px;padding:20px 16px">
        <div class="small muted">Amount to pay</div><div class="display">${money(b.amount)}</div>
        <div class="small muted">${fmtDate(b.date)} · ${hourLabel(b.hour)} · ${b.unit.name}</div></div>
      ${p.razorpay ? h`
      <div class="card">
        <div class="row gap12"><div class="circle soft">${icon('shield', 22)}</div><div class="grow"><div class="strong">Pay securely online</div><div class="small muted">UPI apps, cards or netbanking. Your slot is confirmed the moment you pay.</div></div></div>
        <div class="chips"><span class="chip">Google Pay</span><span class="chip">PhonePe</span><span class="chip">Paytm</span><span class="chip">Cards</span></div>
      </div>
      <details class="card manual"><summary class="small strong">Pay by UPI ID and send a screenshot instead</summary>
        <div class="col gap16" style="margin-top:12px">${manualSteps}
          <button class="btn secondary" type="submit">Send for approval</button></div></details>` : manualSteps}
      <div class="form-error banner red hidden" role="alert"></div>
      <button type="button" class="link muted" data-act="cancel" style="align-self:center">Cancel this booking</button>
    </form>
    ${p.razorpay
      ? h`<div class="footer"><button class="btn primary" type="button" data-act="rzp">Pay ${money(b.amount)}</button>
          <div class="caption muted center" style="letter-spacing:0">${icon('lock', 12)} Payments handled by Razorpay. Money goes to ${g.name}.</div></div>`
      : h`<div class="footer"><button class="btn primary" type="submit" form="proof-form">Send for approval</button>
          <div class="caption muted center" style="letter-spacing:0">The owner checks the payment and confirms your booking.</div></div>`}
  </div>`, {
    actions: {
      rzp: async (el) => {
        el.disabled = true;
        try {
          const [o] = await Promise.all([api('POST', `/api/b/${token}/razorpay-order`), loadScript('https://checkout.razorpay.com/v1/checkout.js')]);
          const rz = new window.Razorpay({
            key: o.keyId, order_id: o.orderId, amount: o.amount, currency: o.currency, name: o.name, description: o.description,
            prefill: o.prefill, notes: { booking: b.ref }, theme: { color: '#15803d' },
            handler: async (resp) => {
              try {
                const r = await api('POST', `/api/b/${token}/razorpay-verify`, resp);
                if (r.outcome === 'refund_needed') toast('Payment received, but the slot was taken meanwhile. The ground will refund you.');
              } catch (e) { toast(e.message); }
              route();
            },
            modal: { ondismiss: () => route() },
          });
          rz.on('payment.failed', (r) => toast((r && r.error && r.error.description) || 'Payment failed. Please try again.'));
          rz.open();
        } catch (e) { toast(e.message); el.disabled = false; }
      },
      copyUpi: () => copy(p.upiId, 'UPI ID copied. Now open your UPI app and pay to this ID.'),
      cancel: async () => {
        if (!confirm('Cancel this booking and release the slot?')) return;
        await api('POST', `/api/b/${token}/cancel`).catch((e) => toast(e.message));
        route();
      },
    },
    changes: {
      file: async (el) => {
        const f = el.files && el.files[0];
        if (!f) return;
        file = await compressImage(f);
        const box = document.getElementById('upload');
        box.querySelector('img')?.remove();
        const img = document.createElement('img');
        img.src = URL.createObjectURL(file); img.alt = 'Payment screenshot';
        box.prepend(img);
        box.querySelector('.small').textContent = 'Screenshot added · tap to change';
      },
    },
    forms: {
      proof: async (f) => {
        const fd = new FormData();
        fd.set('utr', f.utr || '');
        if (file) fd.set('screenshot', file, 'payment.jpg');
        else if (!confirm('Send without a screenshot? The owner will only have the reference number to check.')) return;
        await api('POST', `/api/b/${token}/proof`, fd);
        route();
      },
    },
  });
  const tick = () => {
    const left = Math.max(0, b.holdExpiresAt - (Date.now() + skew));
    const el = document.getElementById('countdown');
    if (el) el.textContent = `${String(Math.floor(left / 60000)).padStart(2, '0')}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`;
    if (left <= 0) route();
  };
  tick(); every(1000, tick);
}

// ---------------------------------------------------------------- login
function loginPage() {
  const next = new URLSearchParams(location.search).get('next');
  render(h`<div class="screen dark">
    <form class="content" data-form="login" id="login-form" style="justify-content:center" novalidate>
      <div class="glass">
      <div class="row gap12"><div class="circle primary" style="width:52px;height:52px">${icon('lock', 26)}</div><div class="col" style="gap:0"><span class="caption muted">GOARENA</span><h1 class="display">Log in</h1></div></div>
      <p class="muted" style="margin-top:-8px">For ground owners and helpers.</p>
      <div class="col gap12 hidden" data-google><div id="gbtn" class="gbtn"></div>
        <div class="form-error banner red hidden" id="gerr" role="alert"></div>
        <div class="or"><span>or use phone and PIN</span></div></div>
      <div class="field"><label for="phone">Phone number</label><input class="input" id="phone" name="phone" type="tel" inputmode="numeric" autocomplete="username" required></div>
      <div class="field"><label for="pin">PIN</label><input class="input" id="pin" name="pin" type="password" inputmode="numeric" autocomplete="current-password" maxlength="6" required></div>
      <div class="form-error banner red hidden" role="alert"></div>
      <button class="btn primary" type="submit">Log in</button>
      <p class="small muted center">Forgot your PIN? Ask the person who set up your ground.</p>
      </div>
      <p class="small center" style="color:rgba(255,255,255,.75)">Own a ground? <a class="link" href="/signup" data-go="/signup" style="color:#4ade80">List it on GoArena</a></p>
    </form></div>`, {
    forms: {
      login: async (f) => done(await api('POST', '/api/auth/login', f, { noRedirect: true })),
    },
  });
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/login') ? next : null;
  function done(r) { go(r.role === 'owner' ? safeNext || '/owner' : '/helper', true); }
  googleButton('gbtn', async (credential) => {
    try { done(await api('POST', '/api/auth/google', { credential }, { noRedirect: true })); }
    catch (e) { showError('gerr', e.message); }
  }, { dark: true });
}

// ---------------------------------------------------------------- new ground signup
function signupPage() {
  let credential = null;
  const step1 = () => {
    render(h`<div class="screen dark"><div class="content" style="justify-content:center">
      <div class="glass">
        <div class="row gap12"><div class="circle primary" style="width:52px;height:52px">${icon('calendar', 26)}</div><div class="col" style="gap:0"><span class="caption muted">GOARENA</span><h1 class="display">List your ground</h1></div></div>
        <p class="muted" style="margin-top:-8px">Your own booking page. Customers pay you directly by UPI. No commission per booking.</p>
        <div class="feature-list">${[['user', 'Sign in with Google', 'No new password. Your phone already has a Gmail account.'], ['settings', 'Add prices, photos and UPI ID', 'Takes about five minutes.'], ['check', 'We switch on bookings', 'GoArena checks new grounds, usually within a day.']]
          .map(([ic, t, d]) => h`<div class="feature"><div class="circle soft">${icon(ic, 20)}</div><div><div class="strong">${t}</div><div class="small muted">${d}</div></div></div>`)}</div>
        <div data-google class="col gap12"><div id="gbtn" class="gbtn"><p class="small muted center">Loading Google sign-in…</p></div></div>
        <div class="form-error banner red hidden" id="gerr" role="alert"></div>
        <p class="small muted center">Already set up? <a class="link" href="/login" data-go="/login" style="color:#4ade80">Log in</a></p>
      </div></div></div>`);
    googleButton('gbtn', (c) => { credential = c; step2(); }, { text: 'signup_with', dark: true }).then((ok) => {
      if (!ok && document.getElementById('gbtn')) document.getElementById('gbtn').innerHTML = '<p class="small muted center">Sign-up opens soon. Ask GoArena to set up your ground.</p>';
    });
  };
  const step2 = () => {
    render(h`<div class="screen">${topbar('Your ground', '/signup')}
      <form class="content" data-form="signup" novalidate>
        <div class="field"><label for="groundName">Ground name</label><input class="input" id="groundName" name="groundName" placeholder="e.g. Kick Off Arena" required></div>
        <div class="field"><label for="area">Area</label><input class="input" id="area" name="area" placeholder="e.g. Kakkanad, Kochi"></div>
        <div class="field"><label>Courts</label><div class="seg">
          <label><input type="radio" name="layout" value="split" checked><span>Full ground + 2 halves</span></label>
          <label><input type="radio" name="layout" value="single"><span>One ground</span></label></div>
          <p class="small muted">Full + halves means the full ground (8-a-side) or either half (5-a-side) can be booked.</p></div>
        <div class="field"><label for="ownerName">Your name</label><input class="input" id="ownerName" name="ownerName" value="${googleName(credential)}" required></div>
        <div class="field"><label for="phone">Your phone number</label><input class="input" id="phone" name="phone" type="tel" inputmode="numeric" required>
          <p class="small muted">Customers will call or WhatsApp this number.</p></div>
        <div class="field"><label for="pin">Backup PIN (4–6 digits)</label><input class="input" id="pin" name="pin" type="password" inputmode="numeric" maxlength="6" required>
          <p class="small muted">Lets you log in with phone + PIN if Google isn't available.</p></div>
        <div class="form-error banner red hidden" role="alert"></div>
        <button class="btn primary" type="submit">Create my ground</button>
      </form></div>`, {
      forms: {
        signup: async (f) => {
          await api('POST', '/api/auth/signup', { ...f, credential }, { noRedirect: true });
          toast('Ground created. Now add your prices, photos and UPI ID.');
          go('/owner/settings', true);
        },
      },
    });
  };
  step1();
}

// ---------------------------------------------------------------- GoArena master admin
const ago = (ms) => {
  if (!ms) return 'never';
  const m = Math.round((Date.now() - ms) / 60000);
  return m < 60 ? `${Math.max(m, 1)} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};
const shortDate = (d) => (d ? asDate(d).toLocaleDateString('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const SERVICE = {
  active: ['Active', 'green', 'Everything works.'],
  paused: ['Bookings paused', 'amber', 'Customers see "Call to book". Owner and helpers can still log in and see bookings.'],
  locked: ['Locked', 'red', 'Booking page closed and owner/helpers are logged out and can\'t log in. Booking links already sent still open.'],
};
const PLAN = { free: ['Free', ''], none: ['Plan on · no payment yet', 'amber'], paid: ['Paid', 'green'], due: ['Due soon', 'amber'], overdue: ['Overdue', 'red'] };
const statusPills = (g) => h`<div class="chips">
  ${g.demo ? h`<span class="pill blue">Demo</span>` : ''}
  ${g.approved ? '' : h`<span class="pill amber">Waiting approval</span>`}
  ${g.service !== 'active' ? h`<span class="pill ${SERVICE[g.service][1]}">${SERVICE[g.service][0]}</span>` : ''}
  <span class="pill ${PLAN[g.plan][1]}">${g.plan === 'none' || g.plan === 'free' ? PLAN[g.plan][0] : `${PLAN[g.plan][0]} · ${shortDate(g.paidUntil)}`}</span></div>`;

async function adminLogin() {
  render(h`<div class="screen dark"><div class="content" style="justify-content:center"><div class="glass">
    <div class="row gap12"><div class="circle primary" style="width:52px;height:52px">${icon('lock', 26)}</div><div class="col" style="gap:0"><span class="caption muted">GOARENA</span><h1 class="display">Admin</h1></div></div>
    <p class="muted" style="margin-top:-8px">Sign in with the Gmail listed as a GoArena admin.</p>
    <div data-google><div id="gbtn" class="gbtn"><p class="small muted center">Loading Google sign-in…</p></div></div>
    <div class="form-error banner red hidden" id="gerr" role="alert"></div></div></div></div>`);
  googleButton('gbtn', async (credential) => {
    try { await api('POST', '/api/admin/login', { credential }, { noRedirect: true }); route(); }
    catch (err) { showError('gerr', err.message); }
  }, { text: 'signin_with', dark: true });
}
async function adminApi(method, path, body) {
  try { return await api(method, path, body, { noRedirect: true }); }
  catch (e) { if (e.status === 401 && e.code === 'admin_auth') { adminLogin(); return null; } throw e; }
}

const when = (ms) => new Date(ms).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const SOURCE = { server: ['Server', 'red'], browser: ['Browser', 'amber'], razorpay: ['Razorpay', 'red'] };
const errorRow = (e, showGround) => h`<details class="err"><summary><span class="pill ${SOURCE[e.source] ? SOURCE[e.source][1] : ''}">${SOURCE[e.source] ? SOURCE[e.source][0] : e.source}</span>
    <span class="small grow ellipsis1">${showGround && e.ground ? h`<span class="strong">${e.ground}</span> · ` : ''}${e.message.split('\n')[0]}</span><span class="small muted nowrap">${when(e.at)}</span></summary>
  <div class="small muted">${e.path}${e.status ? ` · ${e.status}` : ''}${e.code ? ` · ${e.code}` : ''}</div><pre class="small">${e.message}</pre></details>`;
const CF_DASH = 'https://dash.cloudflare.com/';

const csvCell = (v) => { const t = String(v ?? ''); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
function downloadCsv(name, rows) {
  const blob = new Blob(['﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\n')], { type: 'text/csv' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const monthLabel = (m) => asDate(m + '-01').toLocaleDateString('en-IN', { timeZone: 'UTC', month: 'short' });
const planCell = (g) => g.plan === 'free' ? h`<span class="muted">Free</span>`
  : h`<div>${money(g.planAmount)}/mo</div><div class="small ${g.plan === 'overdue' ? 'red' : g.plan === 'due' ? 'amber' : 'muted'}">${g.paidUntil ? `${g.plan === 'overdue' ? 'Overdue since' : 'Until'} ${shortDate(g.paidUntil)}` : 'No payment yet'}</div>`;

async function adminPage() {
  const d = await adminApi('GET', '/api/admin/overview');
  if (!d) return;
  const q = new URLSearchParams(location.search);
  const f = q.get('f') || 'all', sort = q.get('s') || 'status', desc = q.get('d') !== 'asc';
  const FILTERS = {
    all: ['All', () => true], waiting: ['Waiting approval', (g) => !g.approved], money: ['Overdue / due', (g) => g.plan === 'overdue' || g.plan === 'due'],
    stopped: ['Paused / locked', (g) => g.service !== 'active'], free: ['Free', (g) => g.plan === 'free'],
  };
  const rank = (g) => (!g.approved ? 0 : g.service === 'locked' ? 1 : g.plan === 'overdue' ? 2 : g.service === 'paused' ? 3 : g.plan === 'due' ? 4 : 5);
  const SORTS = {
    status: [(g) => -rank(g)], name: [(g) => g.name.toLowerCase()], plan: [(g) => g.paidUntil || ''], bookings: [(g) => g.bookings30],
    revenue: [(g) => g.revenue30], visits: [(g) => g.views30], login: [(g) => g.lastLogin || 0], created: [(g) => g.createdAt], check: [(g) => g.waitingPayments],
  };
  const key = SORTS[sort] ? SORTS[sort][0] : SORTS.status[0];
  const list = d.grounds.filter(FILTERS[f] ? FILTERS[f][1] : () => true)
    .sort((a, b) => { const x = key(a), y = key(b); return (x < y ? -1 : x > y ? 1 : 0) * (desc ? -1 : 1); });
  const qs = (o) => { const n = new URLSearchParams(location.search); Object.entries(o).forEach(([k, v]) => (v == null ? n.delete(k) : n.set(k, v))); const t = n.toString(); return `/admin${t ? '?' + t : ''}`; };
  const th = (k, label) => h`<th><button class="sort ${sort === k ? 'on' : ''}" data-go="${qs({ s: k, d: sort === k && desc ? 'asc' : null })}">${label}${sort === k ? (desc ? ' ↓' : ' ↑') : ''}</button></th>`;
  const search = (g) => [g.name, g.slug, g.area, g.owner, g.phone, g.email].filter(Boolean).join(' ').toLowerCase();
  const st = d.stats;
  const maxIncome = Math.max(1, ...d.income.map((m) => m.total));
  document.title = 'GoArena admin';
  render(h`<div class="screen wide"><div class="content tight" style="padding-top:20px">
    <div class="row between top wrap gap12"><div class="col"><span class="eyebrow">${d.email}</span><h1 class="display">GoArena</h1></div>
      <div class="row gap8"><input class="input search" type="search" id="adminSearch" placeholder="Search ground, owner, phone, email" aria-label="Search grounds">
        <button class="iconbtn" aria-label="Refresh" data-act="refresh">${icon('refresh', 18)}</button></div></div>
    <p class="small muted">Visits and errors are counted by GoArena per ground. Site-wide traffic, countries and server logs: <a class="link" href="${CF_DASH}" target="_blank" rel="noopener">Cloudflare dashboard ↗</a> (Workers &amp; Pages → groundbook → Metrics / Logs).</p>
    <div class="stats admin-stats">
      <div class="card"><span class="small muted">Grounds</span><span class="title">${st.grounds}</span><span class="small muted">${st.waiting} waiting approval</span></div>
      <div class="card"><span class="small muted">Plan income / month</span><span class="title">${money(st.monthlyPlans)}</span><span class="small muted">${st.onPlan} on a plan · ${st.free} free</span></div>
      <div class="card"><span class="small muted">Money due</span><span class="title ${st.overdue ? 'red' : ''}">${st.overdue} overdue</span><span class="small muted">${st.due} due within 7 days</span></div>
      <div class="card"><span class="small muted">Stopped</span><span class="title">${st.paused + st.locked}</span><span class="small muted">${st.paused} paused · ${st.locked} locked</span></div>
      <div class="card"><span class="small muted">Bookings, 30 days</span><span class="title">${st.bookings30}</span><span class="small muted">across all grounds</span></div>
      <div class="card"><span class="small muted">Booked value, 30 days</span><span class="title">${money(st.revenue30)}</span><span class="small muted">paid to the grounds</span></div>
      <div class="card"><span class="small muted">Page visits, 30 days</span><span class="title">${st.views30.toLocaleString('en-IN')}</span><span class="small muted">${st.views30 ? `${((st.bookings30 / st.views30) * 100).toFixed(st.bookings30 / st.views30 < 0.01 ? 1 : 0)}% became bookings` : 'booking pages opened'}</span></div>
      <a class="card clickable" href="/admin/errors" data-go="/admin/errors"><span class="small muted">Errors, 24 hours</span><span class="title ${st.errors24 ? 'red' : ''}">${st.errors24}</span><span class="small muted">${st.rzpErrors24} from Razorpay · see all</span></a>
    </div>
    <div class="admin-main">
      <div class="col gap12" style="min-width:0">
        <div class="row between wrap gap8"><div class="chips">${Object.entries(FILTERS).map(([k, [label]]) => h`<button class="chip ${k === f ? 'on' : ''}" data-go="${qs({ f: k === 'all' ? null : k })}">${label} <span class="muted">${d.grounds.filter(FILTERS[k][1]).length}</span></button>`)}</div>
          <button class="btn small secondary only-desktop" data-act="csv">${icon('right', 14)} Export CSV</button></div>
        <div class="card table-card only-desktop"><table class="admin-table">
          <thead><tr>${th('name', 'Ground')}<th>Owner</th>${th('status', 'Status')}${th('plan', 'Plan')}${th('visits', 'Visits 30d')}${th('bookings', 'Bookings 30d')}${th('revenue', 'Booked 30d')}${th('check', 'To check')}${th('login', 'Last login')}<th>Set up</th>${th('created', 'Joined')}</tr></thead>
          <tbody>${list.map((g) => h`<tr data-go="/admin/g/${g.id}" data-search="${search(g)}" tabindex="0">
            <td><div class="strong">${g.name}</div><div class="small muted">${g.area || '—'} · /${g.slug}</div></td>
            <td><div>${g.owner || '—'}</div><div class="small muted">${g.phone || ''}</div><div class="small muted ellipsis">${g.email || ''}</div></td>
            <td class="nowrap">${g.demo ? h`<span class="pill blue">Demo</span> ` : ''}${g.errors7 ? h`<span class="pill red" title="Errors in the last 7 days">${g.errors7} errors</span> ` : ''}${g.approved ? '' : h`<span class="pill amber">Waiting</span> `}${g.service !== 'active' ? h`<span class="pill ${SERVICE[g.service][1]}">${SERVICE[g.service][0]}</span>` : g.approved ? h`<span class="pill green">Live</span>` : ''}</td>
            <td class="nowrap">${planCell(g)}</td>
            <td class="num">${g.views30}${g.conversion != null ? h`<div class="small muted">${g.conversion}% booked</div>` : ''}</td>
            <td class="num">${g.bookings30}</td><td class="num">${money(g.revenue30)}</td>
            <td class="num ${g.waitingPayments ? 'amber strong' : 'muted'}">${g.waitingPayments || '—'}</td>
            <td class="small nowrap">${ago(g.lastLogin)}</td>
            <td class="small muted nowrap">${g.photos} photos · ${g.razorpay ? 'Razorpay' : g.hasUpi ? 'UPI' : h`<span class="red">no UPI</span>`} · ${g.helpers} helper${g.helpers === 1 ? '' : 's'}${g.google ? ' · Google' : ''}</td>
            <td class="small muted nowrap">${shortDate(new Date(g.createdAt).toISOString().slice(0, 10))}</td></tr>`)}</tbody></table>
          ${list.length ? '' : h`<div class="empty">Nothing here.</div>`}</div>
        <div class="col gap12 only-mobile">${list.length ? list.map((g) => h`<a class="card clickable" href="/admin/g/${g.id}" data-go="/admin/g/${g.id}" data-search="${search(g)}">
          <div class="row between top"><div class="col" style="gap:2px"><div class="heading">${g.name}</div><div class="small muted">${[g.area, g.owner, g.phone].filter(Boolean).join(' · ')}</div></div>${icon('right', 18)}</div>
          ${statusPills(g)}
          <div class="small muted">${g.bookings30} bookings in 30 days · ${money(g.revenue30)}${g.waitingPayments ? ` · ${g.waitingPayments} payments to check` : ''} · last login ${ago(g.lastLogin)}</div></a>`)
          : h`<div class="empty">Nothing here.</div>`}</div>
      </div>
      <div class="col gap12 admin-side">
        <div class="card"><div class="heading">Plan payments received</div>
          <div class="bars">${d.income.map((m) => h`<div class="bar-col" title="${money(m.total)} from ${m.count} payments"><span class="small strong">${m.total ? money(m.total) : ''}</span>
            <div class="bar" style="height:${Math.round((m.total / maxIncome) * 100)}%"></div><span class="small muted">${monthLabel(m.month)}</span></div>`)}</div></div>
        <div class="card"><div class="heading">Latest payments</div>
          ${d.payments.length ? d.payments.map((p) => h`<a class="row between small plain" href="/admin/g/${p.groundId}" data-go="/admin/g/${p.groundId}"><span>${shortDate(p.paidOn)} · ${p.ground}${p.months > 1 ? ` · ${p.months} mo` : ''}</span><span class="strong">${money(p.amount)}</span></a>`)
            : h`<p class="small muted">No payments recorded yet.</p>`}</div>
        <div class="card"><div class="heading">Recent activity</div>
          ${d.activity.length ? d.activity.map((l) => h`<div class="small"><span class="strong">${l.ground || 'GoArena'}</span>: ${l.action}${l.detail ? ` · ${l.detail}` : ''}
            <div class="muted">${new Date(l.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</div></div>`)
            : h`<p class="small muted">Nothing yet.</p>`}</div>
      </div>
    </div>
  </div></div>`, {
    actions: {
      refresh: () => route(),
      csv: () => downloadCsv(`goarena-grounds-${d.today}.csv`, [
        ['Ground', 'Link', 'Area', 'Owner', 'Phone', 'Email', 'Approved', 'Service', 'Plan', 'Price per month', 'Paid until', 'Visits 30d', 'Bookings 30d', 'Booked 30d', 'Payments to check', 'Last login', 'Photos', 'UPI', 'Razorpay', 'Helpers', 'Joined'],
        ...list.map((g) => [g.name, `https://book.goarena.in/${g.slug}`, g.area, g.owner, g.phone, g.email, g.approved ? 'yes' : 'no', g.service, g.plan, g.planEnabled ? g.planAmount : '', g.paidUntil || '',
          g.views30, g.bookings30, g.revenue30, g.waitingPayments, g.lastLogin ? new Date(g.lastLogin).toISOString() : '', g.photos, g.hasUpi ? 'yes' : 'no', g.razorpay ? 'yes' : 'no', g.helpers, new Date(g.createdAt).toISOString().slice(0, 10)]),
      ]),
    },
  });
  const box = document.getElementById('adminSearch');
  box.value = q.get('q') || '';
  const apply = () => {
    const t = box.value.trim().toLowerCase();
    document.querySelectorAll('[data-search]').forEach((el) => el.classList.toggle('hidden', !!t && !el.dataset.search.includes(t)));
    history.replaceState(null, '', qs({ q: t || null }));
  };
  box.addEventListener('input', apply);
  if (box.value) apply();
  document.querySelectorAll('tr[data-go]').forEach((tr) => tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(tr.dataset.go); }));
}

function trafficCard(d) {
  const t = d.traffic, f = t.funnel;
  const max = Math.max(1, ...t.days.map((x) => x.views));
  const step = (label, n, of) => h`<div class="funnel-row"><span class="small">${label}</span><div class="funnel-bar"><i style="width:${of ? Math.max(2, Math.round((n / of) * 100)) : 0}%"></i></div><span class="small strong num">${n}</span></div>`;
  return h`<div class="card"><div class="row between"><div class="heading">Traffic, 30 days</div><span class="small muted">${t.conversion != null ? `${t.conversion}% of visits booked` : ''}</span></div>
    <div class="spark" aria-label="Page visits per day">${t.days.map((x) => h`<div class="spark-col" title="${shortDate(x.date)}: ${x.views} visits, ${x.bookings} bookings started">
      <div class="spark-bar" style="height:${Math.round((x.views / max) * 100)}%"></div>${x.bookings ? h`<i class="spark-dot"></i>` : ''}</div>`)}</div>
    <div class="row between small muted"><span>${shortDate(t.days[0].date)}</span><span>Bars: page visits · dots: days with bookings</span><span>Today</span></div>
    <div class="col gap8">
      ${step('Page visits', t.views30, t.views30)}
      ${step('Checked free slots', t.slotViews30, t.views30)}
      ${step('Held a slot', f.holds, t.views30)}
      ${step('Paid / sent proof', f.paid, t.views30)}
      ${step('Confirmed', f.confirmed, t.views30)}
    </div>
    <div class="small muted">${f.expired} holds ran out unpaid · ${f.rejected} rejected · ${f.cancelled} cancelled · ${f.online} tried Razorpay · ${money(d.stats.revenue30)} booked</div></div>`;
}

function profileCard(d) {
  const p = d.profile, g = d.ground;
  return h`<form class="card" data-form="profile"><div class="heading">Owner &amp; business</div>
    <div class="small muted">Login phone <span class="strong">${p.ownerPhone || '—'}</span>${p.ownerGoogle ? h` · Google <span class="strong">${p.ownerGoogle}</span>` : ''}${g.email ? ` · signed up with ${g.email}` : ''}</div>
    <div class="grid2"><div class="field"><label>Owner's full name</label><input class="input" name="ownerName" value="${p.ownerName}"></div>
      <div class="field"><label>Business / legal name</label><input class="input" name="businessName" value="${p.businessName}" placeholder="for invoices"></div></div>
    <div class="grid2"><div class="field"><label>Email for invoices</label><input class="input" name="contactEmail" type="email" value="${p.contactEmail}"></div>
      <div class="field"><label>Other phone</label><input class="input" name="altPhone" type="tel" inputmode="numeric" value="${p.altPhone}"></div></div>
    <div class="field"><label>Address</label><textarea class="input" name="address" rows="2">${p.address}</textarea></div>
    <div class="field"><label>GSTIN (if any)</label><input class="input" name="gstin" value="${p.gstin}" maxlength="15" style="text-transform:uppercase"></div>
    <div class="form-error banner red hidden" role="alert"></div><button class="btn secondary" type="submit">Save owner details</button></form>`;
}

function setupCard(d) {
  const s = d.setup;
  const row = (k, v) => h`<div class="row between small gap12"><span class="muted nowrap">${k}</span><span class="strong right">${v}</span></div>`;
  return h`<div class="card"><div class="row between"><div class="heading">Ground setup</div><button class="link" data-act="asOwner">Edit as owner</button></div>
    ${s.photos.length ? h`<div class="thumbs">${s.photos.map((u) => h`<a href="${u}" target="_blank" rel="noopener"><img src="${u}" alt="Ground photo" loading="lazy"></a>`)}</div>` : h`<p class="small red">No photos yet.</p>`}
    <table class="mini"><thead><tr><th>Court</th><th class="num">Mon–Fri</th><th class="num">Sat–Sun</th></tr></thead>
      <tbody>${s.units.map((u) => h`<tr><td>${u.name}${u.subtitle ? h` <span class="muted">${u.subtitle}</span>` : ''}</td><td class="num">${money(u.weekday)}</td><td class="num">${money(u.weekend)}</td></tr>`)}</tbody></table>
    ${row('Open', `${hourLabel(s.openHour)} – ${hourLabel(s.closeHour % 24)}`)}
    ${row('Hold time', `${s.holdMinutes} min`)}
    ${row('Books ahead', `${s.bookingDays} days`)}
    ${row('UPI', s.upiId ? `${s.upiId}${s.upiName ? ` (${s.upiName})` : ''}` : h`<span class="red">not set</span>`)}
    ${row('UPI QR image', s.upiQr ? 'uploaded' : 'none')}
    ${row('Customer phone / WhatsApp', s.whatsapp || '—')}
    ${row('Map', s.mapsUrl ? h`<a class="link" href="${s.mapsUrl}" target="_blank" rel="noopener">open ↗</a>` : '—')}
    ${s.facilities.length ? h`<div class="chips">${s.facilities.map((f) => h`<span class="chip">${f}</span>`)}</div>` : ''}
    ${s.about ? h`<p class="small muted">${s.about}</p>` : ''}</div>`;
}

const RZP_STATUS = { captured: 'green', authorized: 'amber', failed: 'red', refunded: '', created: '' };
function rzpPaymentsTable(list) {
  if (!list.length) return h`<p class="small muted">No payments in this Razorpay account yet.</p>`;
  return h`<div class="table-scroll"><table class="mini"><thead><tr><th>When</th><th class="num">₹</th><th>Status</th><th>Method</th><th>Booking</th><th>Payment / problem</th></tr></thead><tbody>
    ${list.map((p) => h`<tr><td class="nowrap">${when(p.createdAt)}</td><td class="num">${p.amount}</td>
      <td><span class="pill ${RZP_STATUS[p.status] || ''}">${p.status}</span>${p.refundStatus ? h` <span class="pill">refund ${p.refundStatus}</span>` : ''}</td>
      <td class="small">${p.method}${p.vpa ? ` · ${p.vpa}` : ''}</td>
      <td class="small">${p.booking ? h`<span class="strong">${p.booking.ref}</span> <span class="muted">${p.booking.status.toLowerCase()}</span>` : h`<span class="muted">${p.orderId ? 'not a GoArena order' : '—'}</span>`}</td>
      <td class="small"><code>${p.id}</code>${p.error ? h`<div class="red">${p.error}${p.errorReason ? ` (${p.errorReason})` : ''}</div>` : ''}</td></tr>`)}
  </tbody></table></div>`;
}

function razorpayCard(d) {
  const r = d.razorpay;
  if (!r.connected) return h`<div class="card"><div class="heading">Razorpay</div><p class="small muted">Not connected. Customers pay by UPI and send a screenshot. The owner connects Razorpay in their Settings (or use "Open owner view").</p></div>`;
  return h`<div class="card"><div class="row between"><div class="heading">Razorpay</div>
      <div class="row gap8"><span class="pill ${r.mode === 'live' ? 'green' : 'amber'}">${r.mode === 'live' ? 'Live' : 'Test mode'}</span>${r.enabled ? '' : h`<span class="pill">switched off</span>`}</div></div>
    <div class="row between small"><span class="muted">Key ID</span><code>${r.keyId}</code></div>
    <div class="row between small"><span class="muted">Connected</span><span>${r.connectedAt ? when(r.connectedAt) : '—'}</span></div>
    <div class="row between small"><span class="muted">Last key check</span><span class="${r.checkError ? 'red' : ''}">${r.checkedAt ? `${r.checkError ? 'Failed' : 'OK'} · ${when(r.checkedAt)}` : 'never'}</span></div>
    ${r.checkError ? h`<div class="banner red small">${r.checkError}</div>` : ''}
    ${r.mode === 'test' ? h`<div class="banner amber small">Test keys: no real money moves. Switch to Live keys before customers pay.</div>` : ''}
    <div class="chips"><button class="chip" data-act="rzpTest">Test connection</button><button class="chip" data-act="rzpLoad">Load latest payments</button><button class="chip red" data-act="rzpOff">Disconnect</button></div>
    <div id="rzpList"></div>
    <div class="strong small">GoArena bookings paid online</div>
    ${r.bookings.length ? h`<div class="table-scroll"><table class="mini"><thead><tr><th>Booking</th><th>Slot</th><th>Status</th><th>Razorpay</th><th></th></tr></thead><tbody>
      ${r.bookings.map((b) => h`<tr><td class="strong nowrap">${b.ref}</td><td class="nowrap small">${shortDate(b.date)} ${hourLabel(b.hour)}</td>
        <td><span class="pill ${b.status === 'CONFIRMED' ? 'green' : b.status === 'HOLD' ? 'amber' : ''}">${b.status.toLowerCase()}</span>${b.refundNeeded ? h` <span class="pill red">refund due</span>` : ''}</td>
        <td class="small"><code>${b.paymentId || b.orderId}</code></td>
        <td>${b.paymentId ? '' : h`<button class="link" data-act="recheckRef" data-ref="${b.ref}">Re-check</button>`}</td></tr>`)}</tbody></table></div>`
      : h`<p class="small muted">None yet.</p>`}
    <form class="row gap8" data-form="recheck"><input class="input" name="ref" placeholder="Booking code, e.g. GB-7K3QX" style="text-transform:uppercase"><button class="btn small secondary" type="submit">Re-check</button></form>
    <div class="form-error banner red hidden" role="alert"></div>
    <p class="small muted">Re-check asks Razorpay whether the customer actually paid and confirms the booking if so (the same check runs every 5 minutes for the last 6 hours).</p></div>`;
}

async function adminErrors() {
  const d = await adminApi('GET', '/api/admin/errors');
  if (!d) return;
  render(h`<div class="screen wide">${topbar('Errors, last 30 days', '/admin')}<div class="content tight">
    <p class="small muted">Server errors, Razorpay problems and errors on customers' or owners' phones. Tap one for details. Older than 30 days are deleted.</p>
    <div class="card">${d.errors.length ? d.errors.map((e) => errorRow(e, true)) : h`<p class="small muted">No errors. 🎉</p>`}</div>
  </div></div>`);
}

async function adminGround(id) {
  const d = await adminApi('GET', `/api/admin/grounds/${id}`);
  if (!d) return;
  const g = d.ground;
  const svc = SERVICE[g.service];
  const reload = (msg) => { if (msg) toast(msg); route(); };
  document.title = `${g.name} · admin`;
  render(h`<div class="screen wide">${topbar(g.name, '/admin')}
    <div class="content tight">
      <div class="row between wrap gap12"><div class="col gap8"><a class="link" href="/${g.slug}" target="_blank" rel="noopener">book.goarena.in/${g.slug}</a>${statusPills(g)}
        <div class="small muted">Signed up ${shortDate(new Date(g.createdAt).toISOString().slice(0, 10))}${g.email ? ` with ${g.email}` : ''}</div></div>
        <div class="row gap8 only-desktop">${g.demo ? '' : h`<button class="btn small secondary" data-act="demo">Duplicate as demo</button>`}<button class="btn small secondary" data-act="asOwner">Open owner view</button><button class="btn small danger" data-act="logoutAll">Log everyone out</button></div></div>
      ${g.approved ? '' : h`<div class="card"><div class="heading">New ground</div><p class="small muted">Customers can't book until you approve. Check the page, prices and UPI ID first.</p>
        <div class="btn-row" style="max-width:420px"><button class="btn danger" data-act="reject">Turn down</button><button class="btn primary" data-act="approve">Approve</button></div></div>`}
      <div class="admin-grid">
      <div class="col gap16">
      ${trafficCard(d)}

      <form class="card" data-form="service"><div class="heading">Service</div>
        <div class="seg">${Object.entries(SERVICE).map(([k, [label]]) => h`<label><input type="radio" name="service" value="${k}" ${k === g.service ? 'checked' : ''}><span>${label}</span></label>`)}</div>
        <p class="small muted">${svc[2]}</p>
        <div class="field"><label>Message the owner sees when paused or locked</label><input class="input" name="note" value="${g.serviceNote}" placeholder="e.g. November invoice of ₹500 is unpaid"></div>
        <div class="form-error banner red hidden" role="alert"></div><button class="btn secondary" type="submit">Save service</button></form>

      <div class="card"><div class="row between"><div class="heading">Subscription</div>
          <label class="switch"><input type="checkbox" data-change="planToggle" ${g.planEnabled ? 'checked' : ''} aria-label="Charge a subscription"><span></span></label></div>
        ${g.planEnabled ? h`
        <div class="row between"><span class="small muted">Plan</span><span class="strong">${money(g.planAmount)} / month</span></div>
        <div class="row between"><span class="small muted">Paid until</span><span class="strong ${g.plan === 'overdue' ? 'red' : ''}">${g.paidUntil ? shortDate(g.paidUntil) : 'No payment yet'}</span></div>
        <form class="col gap12" data-form="payment" style="border-top:1px solid var(--border);padding-top:12px">
          <div class="strong">Record a payment</div>
          <div class="grid2"><div class="field"><label>Amount ₹</label><input class="input" name="amount" inputmode="numeric" value="${g.planAmount}"></div>
            <div class="field"><label>Months</label><input class="input" name="months" inputmode="numeric" value="1"></div></div>
          <div class="grid2"><div class="field"><label>Paid on</label><input class="input" type="date" name="paidOn" value="${d.today}"></div>
            <div class="field"><label>Note</label><input class="input" name="note" placeholder="UPI ref, cash…"></div></div>
          ${g.service !== 'active' ? h`<label class="row gap8 small"><input type="checkbox" name="reactivate" checked> Switch service back on</label>` : ''}
          <div class="form-error banner red hidden" role="alert"></div><button class="btn primary" type="submit">Record payment</button></form>
        <details><summary class="small strong" style="cursor:pointer">Change price or paid-until date</summary>
          <form class="col gap12" data-form="plan" style="margin-top:12px">
            <div class="grid2"><div class="field"><label>Monthly price ₹</label><input class="input" name="planAmount" inputmode="numeric" value="${g.planAmount}"></div>
              <div class="field"><label>Paid until</label><input class="input" type="date" name="paidUntil" value="${g.paidUntil || ''}"></div></div>
            <div class="form-error banner red hidden" role="alert"></div><button class="btn secondary" type="submit">Save plan</button></form></details>`
        : h`<p class="small muted">Off: this ground is free. No plan reminders for the owner, never overdue, not counted as income. Turn on to start charging.</p>`}
        ${d.payments.length ? h`<div class="col gap8" style="border-top:1px solid var(--border);padding-top:12px"><div class="small strong">Payments</div>${d.payments.map((p) => h`<div class="row between small"><span>${shortDate(p.paidOn)} · ${p.months} mo${p.note ? ` · ${p.note}` : ''}</span><span class="strong">${money(p.amount)}</span></div>`)}</div>` : ''}
      </div>

      ${profileCard(d)}

      <form class="card" data-form="note"><div class="heading">Private notes</div>
        <textarea class="input" name="adminNote" rows="3" placeholder="Only GoArena admins see this">${g.adminNote}</textarea>
        <div class="form-error banner red hidden" role="alert"></div><button class="btn secondary" type="submit">Save notes</button></form>
      </div>

      <div class="col gap16">
      <div class="card"><div class="heading">People</div>
        ${d.staff.map((p) => h`<div class="col gap8" style="border-top:1px solid var(--border);padding-top:12px">
          <div class="row between"><div><div class="strong">${p.name} <span class="small muted">· ${p.role}</span></div>
            <div class="small muted">${p.phone}${p.googleEmail ? ` · ${p.googleEmail}` : ''} · last login ${ago(p.lastLogin)}</div></div>
            <a class="call" href="tel:+91${p.phone}" aria-label="Call ${p.name}">${icon('phone', 20)}</a></div>
          <div class="chips"><button class="chip" data-act="resetPin" data-id="${p.id}" data-name="${p.name}">Reset PIN</button>
            <button class="chip" data-act="phone" data-id="${p.id}" data-name="${p.name}" data-phone="${p.phone}">Change phone</button>
            ${p.googleEmail ? h`<button class="chip" data-act="unlink" data-id="${p.id}" data-name="${p.name}">Remove Google</button>` : ''}</div></div>`)}
      </div>

      ${setupCard(d)}

      ${razorpayCard(d)}

      <div class="card only-mobile"><div class="heading">Remote help</div>
        <p class="small muted">Open the owner's screens in this browser to fix prices, photos or bookings for them. Log out first to come back here as yourself.</p>
        <div class="btn-row"><button class="btn secondary" data-act="asOwner">Open owner view</button><button class="btn danger" data-act="logoutAll">Log everyone out</button></div>
        ${g.demo ? '' : h`<button class="btn secondary" data-act="demo">Duplicate as demo ground</button>`}</div>

      <div class="card"><div class="heading">Latest bookings</div>
        ${d.recent.length ? d.recent.map((b) => h`<div class="row between small"><span>${dayShort(b.date)} ${shortDate(b.date)} ${hourLabel(b.hour)} · ${b.name || 'Walk-in'} · ${b.unit}</span><span class="${b.status === 'CONFIRMED' ? 'strong' : 'muted'}">${b.status === 'CONFIRMED' ? money(b.amount) : b.status.toLowerCase()}</span></div>`)
          : h`<p class="small muted">No bookings yet.</p>`}</div>

      <div class="card"><div class="row between"><div class="heading">Errors</div><span class="small muted">last 30 days</span></div>
        ${d.errors.length ? d.errors.map((e) => errorRow(e)) : h`<p class="small muted">No errors for this ground.</p>`}</div>

      <div class="card"><div class="heading">Activity</div>
        ${d.log.length ? d.log.map((l) => h`<div class="small"><span class="strong">${l.action}</span>${l.detail ? ` · ${l.detail}` : ''}<div class="muted">${new Date(l.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} · ${l.email}</div></div>`)
          : h`<p class="small muted">Nothing yet.</p>`}</div>
      </div>
      </div>
    </div></div>`, {
    actions: {
      approve: async () => { await adminApi('POST', `/api/admin/grounds/${id}/approve`); reload('Approved. Customers can book now.'); },
      demo: async () => {
        const name = prompt(`Make a demo copy of ${g.name} (photos, prices, hours, facilities, a few made-up bookings; no Razorpay keys, no real customers).\n\nName of the demo ground:`, `${g.name} Demo`);
        if (!name) return;
        const r = await adminApi('POST', `/api/admin/grounds/${id}/duplicate-demo`, { name });
        if (!r) return;
        const link = `https://book.goarena.in/${r.slug}`;
        const forReviewer = `Website: ${link}\nCustomers book and pay without logging in.\nOwner test login: https://book.goarena.in/login\nPhone: ${r.phone}\nPIN: ${r.pin}`;
        openSheet(h`<div class="title center">${r.name} is ready</div>
          <div class="card" style="gap:6px"><div class="row between small"><span class="muted">Booking page</span><a class="link" href="/${r.slug}" target="_blank" rel="noopener">/${r.slug}</a></div>
            <div class="row between small"><span class="muted">Owner login phone</span><span class="strong">${r.phone}</span></div>
            <div class="row between small"><span class="muted">PIN</span><span class="strong" style="letter-spacing:3px">${r.pin}</span></div></div>
          <p class="small muted center">The PIN is shown only once. Reset it from the demo ground's page any time, or lock the demo when the review is over.</p>
          <button class="btn primary" data-act="copyDemo">${icon('copy', 18)} Copy details for Razorpay</button>
          <button class="btn secondary" data-act="openDemo">Open demo in admin</button>`, {
          copyDemo: async () => { try { await navigator.clipboard.writeText(forReviewer); toast('Copied'); } catch { prompt('Copy these details:', forReviewer); } },
          openDemo: () => { closeSheet(); go(`/admin/g/${r.id}`); },
        });
      },
      rzpTest: async () => { const r = await adminApi('POST', `/api/admin/grounds/${id}/razorpay/test`); if (r) reload(r.ok ? 'Razorpay keys work' : `Razorpay check failed: ${r.error}`); },
      rzpLoad: async (el) => {
        el.disabled = true; el.textContent = 'Loading from Razorpay…';
        try {
          const r = await adminApi('GET', `/api/admin/grounds/${id}/razorpay/payments`);
          if (r) document.getElementById('rzpList').innerHTML = String(rzpPaymentsTable(r.payments));
        } finally { el.disabled = false; el.textContent = 'Reload latest payments'; }
      },
      rzpOff: async () => { if (!confirm(`Disconnect Razorpay for ${g.name}? Customers will pay by UPI + screenshot. The owner has to enter keys again to reconnect.`)) return; await adminApi('DELETE', `/api/admin/grounds/${id}/razorpay`); reload('Razorpay disconnected'); },
      recheckRef: async (el) => { const r = await adminApi('POST', `/api/admin/grounds/${id}/razorpay/recheck`, { ref: el.dataset.ref }); if (r) reload(`${r.ref}: ${r.result} (${r.before} → ${r.after})`); },
      reject: async () => { if (!confirm(`Turn down ${g.name}? Its page and logins stop working.`)) return; await adminApi('POST', `/api/admin/grounds/${id}/reject`); go('/admin', true); },
      resetPin: async (el) => {
        if (!confirm(`Give ${el.dataset.name} a new PIN? Their old PIN stops working and they are logged out.`)) return;
        const r = await adminApi('POST', `/api/admin/staff/${el.dataset.id}/reset-pin`);
        if (!r) return;
        const msg = `Your new GoArena PIN for ${g.name} is ${r.pin}. Log in at https://book.goarena.in/login with ${r.phone} and change it in Settings.`;
        openSheet(h`<div class="title center">New PIN for ${r.name}</div><div class="display center" style="letter-spacing:6px">${r.pin}</div>
          <p class="small muted center">Shown only once. Send it to them now.</p>
          <a class="btn primary" href="${waLink(r.phone, msg)}" target="_blank" rel="noopener">${icon('chat', 18)} Send on WhatsApp</a>
          <button class="btn secondary" data-act="pinDone">Done</button>`, { pinDone: () => { closeSheet(); reload(); } });
      },
      phone: async (el) => {
        const phone = prompt(`New phone number for ${el.dataset.name}`, el.dataset.phone);
        if (!phone) return;
        await adminApi('PUT', `/api/admin/staff/${el.dataset.id}/phone`, { phone }); reload('Phone changed');
      },
      unlink: async (el) => { if (!confirm(`Remove Google sign-in for ${el.dataset.name}? They can still use phone + PIN.`)) return; await adminApi('POST', `/api/admin/staff/${el.dataset.id}/unlink-google`); reload('Google sign-in removed'); },
      asOwner: async () => { if (!confirm(`Open ${g.name}'s owner screens in this browser?`)) return; if (await adminApi('POST', `/api/admin/grounds/${id}/open-as-owner`)) go('/owner'); },
      logoutAll: async () => { if (!confirm(`Log out the owner and all helpers of ${g.name} on every phone?`)) return; await adminApi('POST', `/api/admin/grounds/${id}/logout-all`); reload('Everyone logged out'); },
    },
    changes: {
      planToggle: async (el) => {
        const on = el.checked;
        if (!on && !confirm(`Make ${g.name} free? Plan reminders stop and it won't count as overdue.`)) { el.checked = true; return; }
        await adminApi('PUT', `/api/admin/grounds/${id}/plan-enabled`, { enabled: on }); reload(on ? 'Subscription on' : 'Subscription off: free ground');
      },
    },
    forms: {
      service: async (f) => {
        if (f.service === 'locked' && !confirm(`Lock ${g.name}? The booking page closes and the owner and helpers are logged out.`)) return;
        await adminApi('PUT', `/api/admin/grounds/${id}/service`, f); reload(`Service: ${SERVICE[f.service][0]}`);
      },
      payment: async (f) => {
        const r = await adminApi('POST', `/api/admin/grounds/${id}/payments`, { amount: Number(f.amount), months: Number(f.months), paidOn: f.paidOn, note: f.note, reactivate: f.reactivate === 'on' });
        if (r) reload(`Paid until ${shortDate(r.paidUntil)}`);
      },
      plan: async (f) => { await adminApi('PUT', `/api/admin/grounds/${id}/plan`, { planAmount: Number(f.planAmount), paidUntil: f.paidUntil || null, adminNote: g.adminNote }); reload('Plan saved'); },
      profile: async (f) => { await adminApi('PUT', `/api/admin/grounds/${id}/profile`, f); reload('Owner details saved'); },
      recheck: async (f) => { const r = await adminApi('POST', `/api/admin/grounds/${id}/razorpay/recheck`, f); if (r) reload(`${r.ref}: ${r.result} (${r.before} → ${r.after})`); },
      note: async (f) => { await adminApi('PUT', `/api/admin/grounds/${id}/plan`, { planAmount: g.planAmount, paidUntil: g.paidUntil, adminNote: f.adminNote }); reload('Notes saved'); },
    },
  });
}

async function logout() {
  await api('POST', '/api/auth/logout').catch(() => {});
  go('/login', true);
}

// ---------------------------------------------------------------- owner
const ownerNav = (active, pending = 0) => h`<nav class="nav">
  <a href="/owner" data-go="/owner" class="${active === 'today' ? 'on' : ''}">${icon('home', 22)}<span>Today ${pending ? h`<span class="badge">${pending}</span>` : ''}</span></a>
  <a href="/owner/calendar" data-go="/owner/calendar" class="${active === 'cal' ? 'on' : ''}">${icon('calendar', 22)}<span>Calendar</span></a>
  <a href="/owner/settings" data-go="/owner/settings" class="${active === 'set' ? 'on' : ''}">${icon('settings', 22)}<span>Settings</span></a></nav>`;

const bookingRow = (b, { showAmount = false, act } = {}) => h`<div class="brow" ${act ? raw(`data-act="${act}" data-id="${b.id}" role="button" tabindex="0" style="cursor:pointer"`) : ''}>
  <div class="time">${hourLabel(b.hour)}</div>
  <div class="grow col" style="gap:2px"><div class="strong">${b.kind === 'block' ? 'Closed' : b.name}</div>
    <div class="small muted">${[b.unit && b.unit.name, b.phone, showAmount && b.amount ? money(b.amount) + (b.paidVia === 'razorpay' ? ' online' : '') : null, b.kind === 'walkin' ? 'Walk-in' : null].filter(Boolean).join(' · ')}</div></div>
  ${b.phone ? h`<a class="call" href="tel:+91${b.phone}" aria-label="Call ${b.name}">${icon('phone', 20)}</a>` : ''}</div>`;

// What the owner sees about their GoArena service and subscription.
function planBanner(g) {
  if (g.service === 'paused') return h`<div class="banner red">${icon('x', 20)}<div><div class="strong">Online bookings are paused by GoArena</div>
    <div>${g.serviceNote || 'Customers can only call you to book.'} Your existing bookings are safe. Contact GoArena to switch bookings back on.</div></div></div>`;
  if (!g.paidUntil || !g.approved) return '';
  const days = Math.round((asDate(g.paidUntil) - asDate(g.today)) / 86400000);
  if (days > 7) return '';
  return h`<div class="banner amber">${icon('clock', 20)}<div><div class="strong">${days < 0 ? 'GoArena plan overdue' : days === 0 ? 'GoArena plan due today' : `GoArena plan due in ${days} day${days > 1 ? 's' : ''}`}</div>
    <div>${money(g.planAmount)} per month, paid until ${fmtDate(g.paidUntil)}. Please pay GoArena to keep online bookings running.</div></div></div>`;
}

async function ownerToday() {
  const [t, me] = await Promise.all([api('GET', '/api/owner/today'), api('GET', '/api/me')]);
  document.title = `${me.ground.name} · Today`;
  render(h`<div class="screen">
    <div class="content" style="padding-top:20px">
      <div class="row between top"><div class="col"><span class="eyebrow">${fmtDate(t.date)} · ${me.ground.name}</span><h1 class="display">Today</h1></div>
        <button class="iconbtn" aria-label="Refresh" data-act="refresh">${icon('refresh', 18)}</button></div>
      <div class="stats">
        <div class="card"><span class="small muted">Bookings today</span><span class="title">${t.bookingsToday}</span></div>
        <div class="card"><span class="small muted">This week</span><span class="title">${money(t.weekTotal)}</span></div></div>
      ${planBanner(me.ground)}
      ${me.ground.approved ? '' : h`<div class="banner amber">${icon('clock', 20)}<div><div class="strong">Waiting for GoArena to switch on bookings</div>
        <div>Customers can see your page but can't book yet. Meanwhile, in <a class="link" href="/owner/settings" data-go="/owner/settings">Settings</a>: ${[me.ground.upiSet ? null : 'add your UPI ID', 'check your prices', 'add photos'].filter(Boolean).join(', ')}.</div></div></div>`}
      ${(t.refunds || []).map((b) => h`<div class="banner red" style="align-items:center">${icon('x', 20)}<div class="grow"><div class="strong">Refund ${money(b.amount)} to ${b.name}</div>
          <div>${b.phone} · paid online after the ${hourLabel(b.hour)} ${dayShort(b.date)} slot was taken. Refund it from your Razorpay dashboard (Payments → ${b.rzpPaymentId}).</div></div>
          <button class="btn small danger" style="background:#fff" data-act="refunded" data-id="${b.id}">Done</button></div>`)}
      ${t.pending.length ? h`<div class="col gap12">${t.pending.map((b) => h`
        <div class="pending" data-go="/owner/review/${b.id}" role="button" tabindex="0">
          <div class="circle" style="background:#fff;color:var(--amber)">${icon('clock', 20)}</div>
          <div class="grow"><div class="strong">Check payment · ${money(b.amount)}</div><div class="small amber">${b.name} · ${dayShort(b.date)} ${dayNum(b.date)} · ${hourLabel(b.hour)} · ${b.unit.name}</div></div>
          <span class="btn small" style="background:var(--amber);color:#fff;min-height:36px">Review</span></div>`)}</div>`
        : h`<div class="banner green">${icon('check', 20)}<div>No payments waiting for you.</div></div>`}
      <div class="col gap12"><div class="row between"><div class="heading">Today's bookings</div><button class="link" data-go="/owner/calendar">See calendar</button></div>
        ${t.today.length ? h`<div class="list">${t.today.map((b) => bookingRow(b, { showAmount: true }))}</div>` : h`<div class="empty">No confirmed bookings today yet.</div>`}</div>
    </div>${ownerNav('today', t.pending.length)}</div>`, {
    actions: {
      refresh: () => route(),
      refunded: async (el) => { if (!confirm('Mark this refund as done?')) return; await api('POST', `/api/owner/bookings/${el.dataset.id}/refunded`); route(); },
    },
  });
  every(30000, async () => { if (!document.querySelector('.scrim')) route(); });
}

async function ownerReview(id) {
  const [{ booking: b }, me] = await Promise.all([api('GET', `/api/owner/bookings/${id}`), api('GET', '/api/me')]);
  const g = me.ground;
  const when = `${fmtDate(b.date)}, ${b.timeLabel}`;
  const done = (title, text, msg) => openSheet(h`<div class="circle big ${title.startsWith('Approved') ? 'primary' : 'red'}" style="margin:0 auto">${icon(title.startsWith('Approved') ? 'check' : 'x', 40)}</div>
    <div class="title center">${title}</div><p class="small muted center">${text}</p>
    ${b.phone ? h`<a class="btn primary" href="${waLink(b.phone, msg)}" target="_blank" rel="noopener">${icon('chat', 18)} Tell ${b.name} on WhatsApp</a>` : ''}
    <button class="btn secondary" data-go="/owner">Back to Today</button>`);
  render(h`<div class="screen">
    ${topbar('Check payment', '/owner')}
    <div class="content tight">
      <div class="card">
        <div class="row gap12"><div class="circle grey">${icon('user', 22)}</div><div class="grow"><div class="strong">${b.name}</div><div class="small muted">${b.phone}</div></div>
          ${b.phone ? h`<a class="call" href="tel:+91${b.phone}" aria-label="Call">${icon('phone', 18)}</a>` : ''}</div>
        <div class="divider"></div>${kv('Booking', `${when} · ${b.unit.name}`)}${kv('Amount', money(b.amount), 'total')}
        ${b.status !== 'PENDING' ? kv('Status', b.status === 'HOLD' ? 'Waiting for customer to pay' : b.status.toLowerCase()) : ''}</div>
      <div class="card"><div class="row between"><div class="heading">Payment screenshot</div>${b.proofUrl ? h`<a class="link" href="${b.proofUrl}" target="_blank" rel="noopener">Open full size</a>` : ''}</div>
        <div class="proof">${b.proofUrl ? h`<img src="${b.proofUrl}" alt="Payment screenshot from ${b.name}">` : h`<span class="small muted">No screenshot sent</span>`}</div>
        ${kv('UPI reference typed by customer', b.utr || '—')}</div>
      ${b.utr ? h`<div class="banner green">${icon('shield', 20)}<div>Open your bank app and look for ${money(b.amount)} with a reference ending <b>${b.utr.slice(-4)}</b>.</div></div>` : ''}
    </div>
    ${['PENDING', 'HOLD'].includes(b.status) ? h`<div class="footer"><div class="btn-row"><button class="btn danger" data-act="reject">Reject</button><button class="btn primary" data-act="approve">Approve</button></div></div>` : ''}
  </div>`, {
    actions: {
      approve: async (el) => {
        el.disabled = true;
        try {
          await api('POST', `/api/owner/bookings/${id}/approve`);
          done('Approved', `${b.name}'s booking is confirmed and the slot is locked.`, `Hi ${b.name}, your booking at ${g.name} is confirmed: ${when}, ${b.unit.name}. Booking ID ${b.ref}. See you!`);
        } catch (e) { toast(e.message); el.disabled = false; }
      },
      reject: () => openSheet(h`<form data-form="reject" class="col gap16"><div class="title">Reject this payment?</div>
        <p class="small muted">The slot opens up again for others.</p>
        ${['Payment not received', 'Wrong amount paid', 'Screenshot not clear'].map((r, i) => h`<label class="radio-row"><input type="radio" name="reason" value="${r}" ${i === 0 ? raw('checked') : ''}><span class="small strong">${r}</span></label>`)}
        <button class="btn danger" type="submit">Reject booking</button><button class="btn secondary" type="button" data-act="close">Keep it</button></form>`, {
        close: closeSheet,
        reject: async (f) => {
          await api('POST', `/api/owner/bookings/${id}/reject`, { reason: f.reason });
          done('Rejected', 'The slot is free again.', `Hi ${b.name}, we couldn't confirm your payment for ${when} at ${g.name} (${f.reason}). If you paid, please send us the screenshot or call us.`);
        },
      }),
    },
  });
}

async function ownerCalendar() {
  const q = new URLSearchParams(location.search);
  const d = await api('GET', `/api/owner/calendar${q.get('date') ? `?date=${q.get('date')}` : ''}`);
  const cols = d.columns, n = cols.length, allMask = cols.reduce((m, c) => m | c.cell, 0);
  const isPast = (hr) => d.date < d.today || (d.date === d.today && hr <= d.nowHour);
  const cellFor = (b, span) => {
    const full = n > 1 && (b.mask & allMask) === allMask;
    const cls = b.kind === 'block' ? 'block' : b.status === 'HOLD' ? 'hold' : b.status === 'PENDING' ? 'pending' : full ? 'full' : 'booked';
    const label = b.kind === 'block' ? `Closed${b.note && b.note !== 'Closed' ? ' · ' + b.note : ''}` : b.name + (full ? ` · ${b.unit.name}` : '');
    const sub = b.status === 'HOLD' ? 'Waiting for payment' : b.status === 'PENDING' ? 'Check payment' : b.kind === 'walkin' ? 'Walk-in' : '';
    return h`<button class="cell ${cls}" style="grid-column:span ${span}" data-act="open" data-id="${b.id}">${label}${sub ? h`<span class="sub">${sub}</span>` : ''}</button>`;
  };
  const rows = d.hours.map(({ hour, label }) => {
    const out = [h`<div class="t">${label}</div>`];
    for (let i = 0; i < n; i++) {
      const b = d.bookings.find((x) => x.hour === hour && x.mask & cols[i].cell);
      if (b) {
        let span = 1;
        while (i + span < n && b.mask & cols[i + span].cell) span++;
        out.push(cellFor(b, span)); i += span - 1;
      } else {
        out.push(h`<button class="cell free ${isPast(hour) ? 'past' : ''}" ${isPast(hour) ? raw('disabled') : ''} data-act="add" data-hour="${hour}" data-cell="${cols[i].cell}">${isPast(hour) ? '' : 'Free'}</button>`);
      }
    }
    return out;
  });
  render(h`<div class="screen">
    <div class="content tight" style="padding-top:20px">
      <div class="row between"><h1 class="display">Calendar</h1><span class="small muted">${fmtDate(d.date)}</span></div>
      <div class="dates">${d.dates.map((x) => h`<button class="date ${x.date === d.date ? 'on' : ''} ${x.date === d.today ? 'today' : ''}" data-act="date" data-date="${x.date}"><span class="d">${x.date === d.today ? 'Today' : dayShort(x.date)}</span><span class="n">${dayNum(x.date)}</span></button>`)}</div>
      <div class="cal" style="grid-template-columns:52px repeat(${n}, 1fr)">
        <div></div>${n > 1 ? cols.map((c) => h`<div class="colh">${c.name}</div>`) : h`<div class="colh">${cols[0].name}</div>`}
        ${rows}
      </div>
      <p class="caption muted" style="letter-spacing:0">Tap a free slot to add a walk-in booking or close it. Tap a booking for details.</p>
    </div>${ownerNav('cal')}</div>`, {
    actions: {
      date: (el) => go(`/owner/calendar?date=${el.dataset.date}`, true),
      open: (el) => openBooking(d.bookings.find((x) => String(x.id) === el.dataset.id)),
      add: (el) => addSheet(Number(el.dataset.hour), Number(el.dataset.cell)),
    },
  });
  centerDate();

  function openBooking(b) {
    const isBlock = b.kind === 'block';
    openSheet(h`<div class="title">${isBlock ? 'Closed slot' : b.name}</div>
      <div class="card" style="gap:10px">${kv('When', `${fmtDate(b.date)}, ${b.timeLabel}`)}${kv('Court', b.unit.name)}
        ${!isBlock ? h`${kv('Phone', b.phone || '—')}${kv('Amount', money(b.amount))}${kv('Status', { HOLD: 'Waiting for payment', PENDING: 'Payment to check', CONFIRMED: b.kind === 'walkin' ? 'Walk-in (paid)' : b.paidVia === 'razorpay' ? 'Paid online' : 'Confirmed (UPI)' }[b.status])}${kv('Booking ID', b.ref)}` : kv('Note', b.note || '—')}</div>
      ${b.phone ? h`<a class="btn soft" href="tel:+91${b.phone}">${icon('phone', 18)} Call ${b.name}</a>` : ''}
      ${b.status === 'PENDING' || b.status === 'HOLD' ? h`<button class="btn primary" data-go="/owner/review/${b.id}">Review payment</button>` : ''}
      ${b.status === 'CONFIRMED' ? h`<button class="btn danger" data-act="cancelB">${isBlock ? 'Open this slot again' : 'Cancel booking'}</button>` : ''}
      <button class="btn secondary" data-act="close">Close</button>`, {
      close: closeSheet,
      cancelB: async () => {
        if (!isBlock && !confirm(`Cancel ${b.name}'s booking? Remember to refund them if they paid.`)) return;
        try { await api('POST', `/api/owner/bookings/${b.id}/cancel`, {}); closeSheet(); toast(isBlock ? 'Slot opened' : 'Booking cancelled'); route(); }
        catch (e) { toast(e.message); }
      },
    });
  }

  function addSheet(hour, cell) {
    const options = d.units.filter((u) => u.mask & cell);
    openSheet(h`<form class="col gap16" data-form="add">
      <div class="col" style="gap:2px"><div class="title">${fmtDate(d.date)}, ${hourLabel(hour)}</div><div class="small muted">Add a walk-in booking or close this slot.</div></div>
      ${options.length > 1 ? h`<div class="col" style="gap:8px">${options.map((u, i) => h`<label class="radio-row"><input type="radio" name="unitId" value="${u.id}" ${i === options.length - 1 ? raw('checked') : ''}><span class="small strong">${u.name}</span><span class="small muted">${u.subtitle}</span></label>`)}</div>` : h`<input type="hidden" name="unitId" value="${options[0].id}">`}
      <div class="seg" role="tablist"><button type="button" class="on" data-act="kind" data-kind="walkin"><span class="a">Walk-in booking</span></button><button type="button" data-act="kind" data-kind="block"><span class="a">Close slot</span></button></div>
      <input type="hidden" name="kind" value="walkin">
      <div id="walkin" class="col gap12">
        <div class="field"><label>Name</label><input class="input" name="name" autocomplete="off"></div>
        <div class="grid2"><div class="field"><label>Phone (optional)</label><input class="input" name="phone" type="tel" inputmode="numeric"></div>
          <div class="field"><label>Amount paid (₹)</label><input class="input" name="amount" inputmode="numeric" placeholder="List price"></div></div></div>
      <div id="block" class="field hidden"><label>Reason (optional)</label><input class="input" name="note" placeholder="e.g. Maintenance"></div>
      <div class="form-error banner red hidden" role="alert"></div>
      <button class="btn primary" type="submit">Save</button></form>`, {
      kind: (el) => {
        const s = document.querySelector('.sheet');
        s.querySelectorAll('[data-kind]').forEach((b) => b.classList.toggle('on', b === el));
        s.querySelector('[name=kind]').value = el.dataset.kind;
        s.querySelector('#walkin').classList.toggle('hidden', el.dataset.kind !== 'walkin');
        s.querySelector('#block').classList.toggle('hidden', el.dataset.kind !== 'block');
      },
      add: async (f) => {
        await api('POST', '/api/owner/slots', { ...f, unitId: Number(f.unitId), date: d.date, hour, amount: f.amount === '' ? undefined : f.amount });
        closeSheet(); toast(f.kind === 'block' ? 'Slot closed' : 'Booking added'); route();
      },
    });
  }
}

// "Sign in with Google" card, shared by owner Settings and the helper page.
const googleCard = (me) => !me.googleClientId ? '' : me.me.googleEmail
  ? h`<div class="card"><div class="row gap12"><div class="circle soft" style="width:40px;height:40px">${icon('check', 20)}</div>
      <div class="grow"><div class="heading">Google sign-in is on</div><div class="small muted" style="overflow-wrap:anywhere">${me.me.googleEmail}</div></div>
      <button class="link red" data-act="googleOff">Remove</button></div>
      <p class="small muted">Your phone and PIN still work as a backup.</p></div>`
  : h`<div class="card"><div class="heading">Log in with Google</div>
      <p class="small muted">Skip the PIN next time. Link the Gmail account on this phone, then just tap "Continue with Google".</p>
      <div id="glink" class="gbtn"></div><div class="form-error banner red hidden" id="gerr" role="alert"></div></div>`;
const googleActions = {
  googleOff: async () => { if (!confirm('Turn off Google sign-in? You will log in with phone and PIN.')) return; await api('DELETE', '/api/staff/google'); toast('Google sign-in removed'); route(); },
};
function mountGoogleLink(me) {
  if (!me.googleClientId || me.me.googleEmail) return;
  googleButton('glink', async (credential) => {
    try { const r = await api('POST', '/api/staff/google', { credential }); toast(`Linked ${r.email}`); route(); }
    catch (e) { showError('gerr', e.message); }
  }, { text: 'continue_with' });
}

async function ownerSettings() {
  const [s, me] = await Promise.all([api('GET', '/api/owner/settings'), api('GET', '/api/me')]);
  const g = s.ground, rz = s.razorpay;
  const link = `${s.publicUrl || location.origin}/${g.slug}`;
  const qrImg = qrPng(link, 12, 4);
  const hours = Array.from({ length: 25 }, (_, i) => i);
  render(h`<div class="screen">
    <div class="content tight" style="padding-top:20px">
      <h1 class="display">Settings</h1>

      <div class="card"><div class="heading">Your booking link</div>
        <img src="${qrImg}" alt="QR code for ${link}" style="width:180px;margin:0 auto" loading="lazy">
        <div class="upi-box"><span class="small strong" style="overflow-wrap:anywhere">${link}</span><button class="link" data-act="copyLink">Copy</button></div>
        <div class="btn-row"><a class="btn secondary" href="${qrImg}" download="${g.slug}-booking-qr.png">Download QR to print</a><a class="btn soft" href="/${g.slug}" target="_blank">View page</a></div></div>

      <form class="card" data-form="prices"><div class="heading">Price per hour</div>
        <div class="price-table"><div></div><div class="caption muted r">MON–FRI</div><div class="caption muted r">SAT–SUN</div>
          ${s.units.map((u) => h`<div class="small strong">${u.name}</div>
            <input class="input" style="height:44px;text-align:right;padding:0 10px" name="wd_${u.id}" inputmode="numeric" value="${u.weekday}" aria-label="${u.name} weekday price">
            <input class="input" style="height:44px;text-align:right;padding:0 10px;margin-left:6px;width:calc(100% - 6px)" name="we_${u.id}" inputmode="numeric" value="${u.weekend}" aria-label="${u.name} weekend price">`)}</div>
        <button class="btn soft" type="submit">Save prices</button></form>

      <form class="card" data-form="payment"><div class="heading">How customers pay</div>
        <div class="field"><label for="upiId">UPI ID</label><input class="input" id="upiId" name="upiId" value="${g.upiId}" placeholder="yourname@ybl" autocomplete="off"></div>
        <div class="field"><label for="upiName">Name shown in UPI apps</label><input class="input" id="upiName" name="upiName" value="${g.upiName}"></div>
        <div class="field"><label>UPI QR code (from your UPI or PhonePe Business app)</label>
          <label class="upload">${g.qrUrl ? h`<img src="${g.qrUrl}" alt="Your UPI QR">` : icon('qr', 24)}<span class="small strong">${g.qrUrl ? 'Change QR image' : 'Upload QR image'}</span><input type="file" accept="image/*" data-change="qr"></label></div>
        <button class="btn soft" type="submit">Save payment details</button></form>

      <div class="card" id="razorpay">
        <div class="row between"><div class="heading">Automatic payments (Razorpay)</div>
          <span class="pill ${rz.enabled ? 'green' : ''}">${!rz.connected ? 'Not connected' : !rz.enabled ? 'Off' : rz.mode === 'test' ? 'On · Test mode' : 'On'}</span></div>
        <p class="small muted">Customers tap <b>Pay</b>, approve in their UPI app, and the booking confirms by itself. No screenshots to check. Money goes straight to your bank. Razorpay charges a small fee on each payment.</p>
        ${rz.connected && rz.mode === 'test' ? h`<div class="banner amber">${icon('clock', 18)}<div>Test mode: payments are not real. Connect your <b>Live</b> keys before customers use it.</div></div>` : ''}
        <details ${rz.connected ? '' : raw('open')}><summary class="small strong green">How to set it up</summary>
          <ol class="steps small" style="margin-top:10px">
            <li>Sign up at <a class="green strong" href="https://dashboard.razorpay.com/signup" target="_blank" rel="noopener">razorpay.com</a> and choose <b>Unregistered / Individual</b> business. Keep ready: your <b>PAN</b>, the <b>mobile number linked to your bank KYC</b> (or your Aadhaar), and a <b>bank account in your name</b>.</li>
            <li>Razorpay verifies your account, often the same day. You can try everything with <b>Test mode</b> keys while you wait.</li>
            <li>In the Razorpay Dashboard, open <b>Account &amp; Settings → Website and app details</b> and add this website:
              <span class="upi-box" style="margin-top:6px;display:flex"><span class="small strong" style="overflow-wrap:anywhere">${s.publicUrl || location.origin}</span><button type="button" class="link" data-act="copyOrigin">Copy</button></span></li>
            <li>Open <b>Account &amp; Settings → API Keys</b> and tap <b>Generate Key</b> (use <b>Live mode</b> for real payments).</li>
            <li>Paste the <b>Key ID</b> and <b>Key Secret</b> below and tap <b>Connect</b>. We check them with Razorpay before saving, and the secret is stored encrypted.</li>
          </ol></details>
        <form class="col gap12" data-form="rzp">
          <div class="field"><label for="rzpKey">Key ID</label><input class="input" id="rzpKey" name="keyId" value="${rz.keyId}" placeholder="rzp_live_..." autocomplete="off" spellcheck="false"></div>
          <div class="field"><label for="rzpSecret">Key Secret</label><input class="input" id="rzpSecret" name="keySecret" type="password" placeholder="${rz.connected ? 'Saved. Paste a new one to change it' : 'Paste the Key Secret'}" autocomplete="off"></div>
          <div class="form-error banner red hidden" role="alert"></div>
          <button class="btn ${rz.connected ? 'secondary' : 'primary'}" type="submit">${rz.connected ? 'Update keys' : 'Connect Razorpay'}</button>
        </form>
        ${rz.connected ? h`<label class="radio-row"><input type="checkbox" data-change="rzpToggle" ${rz.enabled ? raw('checked') : ''}><span class="grow"><span class="small strong">Use Razorpay for new bookings</span><br><span class="caption muted" style="letter-spacing:0">Customers can still choose UPI + screenshot.</span></span></label>
          <button class="link red" style="align-self:flex-start" data-act="rzpDisconnect">Disconnect Razorpay</button>` : ''}
      </div>

      <form class="card" data-form="ground"><div class="heading">Ground page</div>
        <div class="field"><label>Ground name</label><input class="input" name="name" value="${g.name}"></div>
        <div class="field"><label>Area</label><input class="input" name="area" value="${g.area}" placeholder="e.g. Edappally, Kochi"></div>
        <div class="field"><label>Google Maps link</label><input class="input" name="mapsUrl" value="${g.mapsUrl}" placeholder="https://maps.app.goo.gl/..."></div>
        <div class="field"><label>WhatsApp / call number for customers</label><input class="input" name="whatsapp" type="tel" inputmode="numeric" value="${g.whatsapp}"></div>
        <div class="field"><label>Facilities (separate with commas)</label><input class="input" name="facilities" value="${g.facilities.join(', ')}"></div>
        <div class="field"><label>About (optional)</label><textarea class="input" name="about">${g.about}</textarea></div>
        <div class="grid2">
          <div class="field"><label>Opens at</label><select class="input" name="openHour">${hours.slice(0, 24).map((x) => h`<option value="${x}" ${x === g.openHour ? raw('selected') : ''}>${hourLabel(x)}</option>`)}</select></div>
          <div class="field"><label>Last slot ends</label><select class="input" name="closeHour">${hours.slice(1).map((x) => h`<option value="${x}" ${x === g.closeHour ? raw('selected') : ''}>${x === 24 ? 'Midnight' : hourLabel(x)}</option>`)}</select></div></div>
        <div class="field"><label>Hold a slot while customer pays (minutes)</label><input class="input" name="holdMinutes" inputmode="numeric" value="${g.holdMinutes}"></div>
        <div class="form-error banner red hidden" role="alert"></div>
        <button class="btn soft" type="submit">Save ground page</button></form>

      <div class="card"><div class="row between"><div class="heading">Photos</div><span class="small muted">${s.photos.length} / 10</span></div>
        <div class="photos">${s.photos.map((p) => h`<div class="ph"><img src="${p.url}" alt="Ground photo" loading="lazy"><button data-act="delPhoto" data-id="${p.id}" aria-label="Delete photo">${icon('x', 16)}</button></div>`)}
          ${s.photos.length < 10 ? h`<label class="ph add">${icon('plus', 22)}<input type="file" accept="image/*" multiple data-change="photos" aria-label="Add photos"></label>` : ''}</div></div>

      <div class="card"><div class="heading">Helpers</div><p class="small muted">Helpers see upcoming bookings with names and phone numbers. They never see money.</p>
        ${s.helpers.map((x) => h`<div class="row gap12"><div class="circle grey" style="width:36px;height:36px">${icon('user', 18)}</div><div class="grow"><div class="small strong">${x.name}</div><div class="small muted">${x.phone}</div></div><button class="link red" data-act="delHelper" data-id="${x.id}" data-name="${x.name}">Remove</button></div>`)}
        <form class="col gap12" data-form="helper"><div class="grid2"><div class="field"><label>Name</label><input class="input" name="name"></div><div class="field"><label>Phone</label><input class="input" name="phone" type="tel" inputmode="numeric"></div></div>
          <div class="field"><label>PIN for the helper (4–6 digits)</label><input class="input" name="pin" inputmode="numeric" maxlength="6"></div>
          <div class="form-error banner red hidden" role="alert"></div><button class="btn secondary" type="submit">Add helper</button></form></div>

      ${me.ground.paidUntil ? h`<div class="card"><div class="heading">GoArena plan</div>
        <div class="row between"><span class="small muted">Price</span><span class="strong">${money(me.ground.planAmount)} / month</span></div>
        <div class="row between"><span class="small muted">Paid until</span><span class="strong">${fmtDate(me.ground.paidUntil)}</span></div></div>` : ''}

      ${googleCard(me)}

      <form class="card" data-form="pin"><div class="heading">Your PIN</div>
        <div class="grid2"><div class="field"><label>Current PIN</label><input class="input" name="current" type="password" inputmode="numeric" maxlength="6"></div>
          <div class="field"><label>New PIN</label><input class="input" name="pin" type="password" inputmode="numeric" maxlength="6"></div></div>
        <div class="form-error banner red hidden" role="alert"></div><button class="btn secondary" type="submit">Change PIN</button></form>

      <div class="btn-row"><button class="btn secondary" data-go="/helper">Helper view</button><button class="btn danger" data-act="logout">Log out</button></div>
    </div>${ownerNav('set')}</div>`, {
    actions: {
      copyLink: () => copy(link, 'Link copied'),
      copyOrigin: () => copy(s.publicUrl || location.origin, 'Website address copied'),
      rzpDisconnect: async () => { if (!confirm('Disconnect Razorpay? Customers will pay by UPI + screenshot again.')) return; await api('DELETE', '/api/owner/razorpay'); toast('Razorpay disconnected'); route(); },
      logout,
      ...googleActions,
      delPhoto: async (el) => { if (!confirm('Delete this photo?')) return; await api('DELETE', `/api/owner/photos/${el.dataset.id}`); route(); },
      delHelper: async (el) => { if (!confirm(`Remove ${el.dataset.name}? They will be logged out.`)) return; await api('DELETE', `/api/owner/helpers/${el.dataset.id}`); route(); },
    },
    changes: {
      photos: async (el) => {
        const files = [...el.files].slice(0, 10 - s.photos.length);
        toast(`Uploading ${files.length} photo${files.length > 1 ? 's' : ''}…`);
        try { for (const f of files) await api('POST', '/api/owner/photos', await compressImage(f, 1600, 0.8)); toast('Photos added'); }
        catch (e) { toast(e.message); }
        route();
      },
      rzpToggle: async (el) => {
        try { await api('PUT', '/api/owner/razorpay', { enabled: el.checked }); toast(el.checked ? 'Razorpay is on' : 'Razorpay is off'); } catch (e) { toast(e.message); }
        route();
      },
      qr: async (el) => {
        if (!el.files[0]) return;
        try { await api('PUT', '/api/owner/upi-qr', await compressImage(el.files[0], 1000, 0.92)); toast('QR code saved'); } catch (e) { toast(e.message); }
        route();
      },
    },
    forms: {
      rzp: async (f) => {
        await api('PUT', '/api/owner/razorpay', { keyId: f.keyId.trim(), keySecret: f.keySecret.trim() });
        toast('Razorpay connected'); route();
      },
      prices: async (f) => {
        await api('PUT', '/api/owner/settings', { prices: s.units.map((u) => ({ unitId: u.id, weekday: f[`wd_${u.id}`], weekend: f[`we_${u.id}`] })) });
        toast('Prices saved');
      },
      payment: async (f) => { await api('PUT', '/api/owner/settings', { ground: { upiId: f.upiId.trim(), upiName: f.upiName } }); toast('Payment details saved'); },
      ground: async (f) => {
        await api('PUT', '/api/owner/settings', { ground: { name: f.name, area: f.area, mapsUrl: f.mapsUrl, whatsapp: f.whatsapp, about: f.about, facilities: f.facilities.split(',').map((x) => x.trim()).filter(Boolean), openHour: Number(f.openHour), closeHour: Number(f.closeHour), holdMinutes: Number(f.holdMinutes) } });
        toast('Ground page saved');
      },
      helper: async (f) => { await api('POST', '/api/owner/helpers', f); toast(`${f.name} can now log in`); route(); },
      pin: async (f, form) => { await api('POST', '/api/staff/pin', f); form.reset(); toast('PIN changed'); },
    },
  });
  mountGoogleLink(me);
}

// ---------------------------------------------------------------- helper
async function helperPage() {
  const [u, me] = await Promise.all([api('GET', '/api/helper/upcoming'), api('GET', '/api/me')]);
  const groups = {};
  for (const b of u.bookings) (groups[b.date] = groups[b.date] || []).push(b);
  const label = (d) => (d === u.today ? 'Today' : d === addDays(u.today, 1) ? 'Tomorrow' : fmtDate(d));
  render(h`<div class="screen">
    <div class="content tight" style="padding-top:20px">
      <div class="row between top"><div class="col"><span class="eyebrow">Hi ${me.me.name} · ${fmtDate(u.today)}</span><h1 class="display">Upcoming</h1></div>
        <button class="iconbtn" aria-label="Refresh" data-act="refresh">${icon('refresh', 18)}</button></div>
      <div class="banner grey">${icon('lock', 18)}<div>${me.ground.name}. You see names, times and phone numbers only.</div></div>
      ${Object.keys(groups).length ? Object.entries(groups).map(([d, list]) => h`<div class="col gap12"><div class="section-title">${label(d)}</div>
        ${list.map((b) => h`<div class="brow"><div class="time">${hourLabel(b.hour)}</div><div class="grow col" style="gap:2px"><div class="strong">${b.name}</div>
          <div class="small muted">${[b.unit, b.phone, b.walkin ? 'Walk-in' : null].filter(Boolean).join(' · ')}</div></div>
          ${b.phone ? h`<a class="call" href="tel:+91${b.phone}" aria-label="Call ${b.name}">${icon('phone', 20)}</a>` : ''}</div>`)}</div>`)
        : h`<div class="empty">No bookings in the next 7 days yet.</div>`}
      ${me.me.role === 'helper' ? googleCard(me) : ''}
    </div>
    <div class="footer plain">${me.me.role === 'owner' ? h`<button class="btn secondary" data-go="/owner">Back to owner view</button>` : h`<button class="btn secondary" data-act="logout">Log out</button>`}</div>
  </div>`, { actions: { refresh: () => route(), logout, ...googleActions } });
  if (me.me.role === 'helper') mountGoogleLink(me);
  every(60000, () => { if (!document.querySelector('#glink iframe')) route(); });
}

route();
