// Browser run-through of Google sign-in, signup and admin approval, with a stand-in
// for Google's sign-in script. Run: node tests/e2e-google.mjs
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeEnv, createServer } from '../scripts/dev-server.mjs';
import { fakeGoogle } from './fake-google.mjs';

const google = await fakeGoogle();
const env = Object.assign(await makeEnv(), { GOOGLE_CLIENT_ID: google.clientId, GOOGLE_FETCH: google.fetch, ADMIN_EMAILS: 'boss@gmail.com', SUPPORT_WHATSAPP: '919886304904', ADMIN_WHATSAPP: '919886304904' });
const server = createServer(env).listen(0);
const base = `http://localhost:${server.address().port}`;
const GSI = `window.google = { accounts: { id: {
  initialize(o) { window.__gcb = o.callback; },
  renderButton(el) { el.innerHTML = '<button type="button" class="btn secondary" id="fake-google">G · Continue with Google</button>';
    el.querySelector('button').onclick = () => window.__gcb({ credential: window.__cred }); },
  prompt() {} } } };`;

fs.mkdirSync('e2e-shots', { recursive: true });
const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.route(/fonts\.|unsplash/, (r) => r.abort());
await ctx.route('https://accounts.google.com/gsi/client', (r) => r.fulfill({ contentType: 'text/javascript', body: GSI }));
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
let n = 0;
const shot = async (name) => { await p.waitForTimeout(300); await p.screenshot({ path: `e2e-shots/g${String(++n).padStart(2, '0')}-${name}.png` }); };
const tapGoogle = async (claims) => { await p.evaluate((c) => { window.__cred = c; }, await google.token(claims)); await p.click('#fake-google'); };

// 1. Not linked yet
await p.goto(base + '/login'); await p.waitForSelector('#fake-google'); await shot('login');
await tapGoogle({ sub: 'rajesh', email: 'rajesh@gmail.com' });
await p.waitForSelector('#gerr:not(.hidden)'); assert.match(await p.textContent('#gerr'), /isn't linked/); await shot('login-not-linked');

// 2. PIN once, link Google in Settings
await p.fill('#phone', '9847012345'); await p.fill('#pin', '1234'); await p.click('button[type=submit]'); await p.waitForURL(/\/owner$/);
await p.goto(base + '/owner/settings'); await p.locator('details[data-sec=google] > summary').click(); await p.waitForSelector('#glink #fake-google');
await p.locator('#glink').scrollIntoViewIfNeeded(); await shot('settings-link');
await tapGoogle({ sub: 'rajesh', email: 'rajesh@gmail.com' });
await p.getByText('Google sign-in is on').waitFor(); await p.getByText('Google sign-in is on').scrollIntoViewIfNeeded(); await shot('settings-linked');

// 3. Log out, back in with one tap
await p.getByRole('button', { name: 'Log out' }).click(); await p.waitForURL(/\/login/);
await p.waitForSelector('#fake-google'); await tapGoogle({ sub: 'rajesh' }); await p.waitForURL(/\/owner$/);

// 4. New owner signs up
await p.evaluate(() => fetch('/api/auth/logout', { method: 'POST' }));
await p.goto(base + '/'); await shot('landing');
await p.getByRole('button', { name: 'List your ground' }).click(); await p.waitForSelector('#fake-google'); await shot('signup');
await tapGoogle({ sub: 'sunil', email: 'sunil@gmail.com', name: 'Sunil Kumar' });
await p.waitForSelector('#groundName'); assert.equal(await p.inputValue('#ownerName'), 'Sunil Kumar');
await p.fill('#groundName', 'Kick Off Arena'); await p.fill('#area', 'Kakkanad, Kochi'); await p.fill('#phone', '9876543210'); await p.fill('#pin', '4321');
await shot('signup-form');
await p.getByRole('button', { name: 'Create my ground' }).click(); await p.waitForURL(/\/owner\/settings$/);
await p.goto(base + '/owner'); await p.getByText('Waiting for GoArena').waitFor(); await shot('owner-waiting');
await p.goto(base + '/kick-off-arena'); await p.getByText('Call to book').waitFor(); await p.evaluate(() => scrollTo(0, 9999)); await shot('customer-not-open');

// 5. Master admin
await p.goto(base + '/admin'); await p.waitForSelector('#fake-google'); await shot('admin-login');
await tapGoogle({ sub: 'boss', email: 'boss@gmail.com' });
await p.locator('.only-mobile').getByText('Kick Off Arena').waitFor(); await shot('admin-overview');
await p.getByRole('button', { name: /^Waiting approval/ }).click(); await p.waitForURL(/f=waiting/);
await p.locator('.only-mobile').getByText('Kick Off Arena').click(); await p.waitForURL(/\/admin\/g\/\d+/); await shot('admin-ground-new');
await p.getByRole('button', { name: 'Approve' }).click(); await p.getByText('Approved. Customers').waitFor();
await p.goto(base + '/kick-off-arena'); await p.getByRole('button', { name: /Check free slots/ }).waitFor();

// pause Green Field, record a payment that switches it back on, reset a PIN
await p.goto(base + '/admin'); await p.locator('.only-mobile').getByText('Green Field Turf').click(); await p.waitForURL(/\/admin\/g\/1$/);
await p.locator('form[data-form=service] label').filter({ hasText: 'Bookings paused' }).click();
await p.fill('form[data-form=service] input[name=note]', 'November invoice of ₹500 is unpaid');
await p.getByRole('button', { name: 'Save service' }).click(); await p.getByText('Service: Bookings paused').waitFor();
await shot('admin-ground-paused');
await p.goto(base + '/demo'); await p.getByText('Call to book').waitFor();
await p.goto(base + '/admin/g/1');
await p.check('.switch input'); await p.getByText('Record a payment').waitFor();
await p.locator('form[data-form=payment]').scrollIntoViewIfNeeded(); await shot('admin-payment');
await p.fill('form[data-form=payment] input[name=note]', 'GPay 4128'); await p.getByRole('button', { name: 'Record payment' }).click();
await p.getByText(/^Paid until/).first().waitFor();
await p.goto(base + '/demo'); await p.getByRole('button', { name: /Check free slots/ }).waitFor();
await p.goto(base + '/admin/g/1');
p.once('dialog', (dlg) => dlg.accept());
await p.locator('[data-act=resetPin]').first().click(); await p.getByText('New PIN for Rajesh').waitFor(); await shot('admin-reset-pin');
const pin = (await p.locator('.sheet .display').textContent()).trim();
await p.getByRole('button', { name: 'Done' }).click();
await p.waitForSelector('.scrim', { state: 'detached' }); await p.getByText('PIN reset').waitFor();
await p.evaluate(() => scrollTo(0, document.body.scrollHeight)); await shot('admin-activity');

// owner logs in with the new PIN and sees the plan in Settings
await p.evaluate(() => fetch('/api/auth/logout', { method: 'POST' }));
await p.goto(base + '/login'); await p.fill('#phone', '9847012345'); await p.fill('#pin', pin); await p.click('button[type=submit]'); await p.waitForURL(/\/owner$/);
await p.goto(base + '/owner/settings'); await p.getByText('GoArena plan').waitFor();

assert.deepEqual(errs, []);
console.log(`Google flows passed. ${n} screenshots in e2e-shots/`);
await b.close(); server.close();
