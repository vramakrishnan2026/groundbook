// Browser run-through of every role on a phone-sized screen.
// Run: node tests/e2e.mjs   (needs Playwright + Chrome; saves screenshots to ./e2e-shots)
import fs from 'node:fs';
import { chromium } from 'playwright';
import { makeEnv, createServer } from '../scripts/dev-server.mjs';
import { fakeRazorpay, KEY_ID, KEY_SECRET } from './fake-razorpay.mjs';

const OUT = process.env.SHOTS || 'e2e-shots';
fs.mkdirSync(OUT, { recursive: true });
const env = await makeEnv();
const fake = fakeRazorpay();
env.RZP_FETCH = fake.fetchFn;
env.SECRETS_KEY = 'e2e-secrets-key-0123456789';
const server = createServer(env).listen(0);
const base = `http://localhost:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const problems = [];
let n = 0;

async function phone() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com|api\.qrserver\.com/, (r) => r.abort());
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_FAILED|net::|status of 4\d\d/.test(m.text())) problems.push(`console: ${m.text()}`); });
  return page;
}
const shot = async (page, name, full = false) => page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png`, fullPage: full });
const expectText = async (page, text) => {
  try { await page.getByText(text, { exact: false }).first().waitFor({ timeout: 5000 }); }
  catch { problems.push(`missing text "${text}" on ${page.url()}`); }
};

try {
  // ---------------- customer books and pays
  const c = await phone();
  await c.goto(`${base}/g/demo`);
  await expectText(c, 'Green Field Turf');
  await shot(c, 'customer-ground', true);
  await c.getByRole('button', { name: 'Check free slots' }).click();
  await expectText(c, 'Pick a slot');
  await c.locator('.date').nth(1).click();          // tomorrow
  await c.getByRole('button', { name: /Full ground/ }).click();
  await c.getByRole('button', { name: '9 PM free' }).click();
  await shot(c, 'customer-slots', true);
  await c.getByRole('button', { name: 'Continue' }).click();
  await expectText(c, 'Your details');
  await c.getByRole('button', { name: /Hold slot/ }).click();   // empty form → error
  await expectText(c, 'Please enter a name');
  await c.fill('#name', 'Arjun K');
  await c.fill('#phone', '98470 12345');
  await shot(c, 'customer-details', true);
  await c.getByRole('button', { name: /Hold slot/ }).click();
  await c.waitForURL(/\/b\//);
  await expectText(c, 'Amount to pay');
  await shot(c, 'customer-pay', true);
  const bookingUrl = c.url();
  const img = await c.screenshot({ clip: { x: 0, y: 0, width: 300, height: 400 } });
  await c.setInputFiles('input[type=file]', { name: 'payment.png', mimeType: 'image/png', buffer: img });
  await c.waitForSelector('#upload img');
  await c.fill('#utr', '4128 9932 1170');
  await shot(c, 'customer-pay-filled', true);
  await c.getByRole('button', { name: 'Send for approval' }).click();
  await expectText(c, 'Waiting for the ground');
  await shot(c, 'customer-waiting', true);

  // second customer takes Half A at 7 PM tomorrow so the calendar shows both kinds
  const c2 = await phone();
  await c2.goto(`${base}/g/demo?step=slots`);
  await c2.locator('.date').nth(1).click();
  await c2.getByRole('button', { name: /Half A/ }).click();
  const fullTaken = await c2.getByRole('button', { name: '9 PM booked' }).count();
  if (!fullTaken) problems.push('Half A at 9 PM should show as booked while the full ground is on hold');
  await c2.getByRole('button', { name: '7 PM free' }).click();
  await c2.getByRole('button', { name: 'Continue' }).click();
  await c2.fill('#name', 'Faisal P'); await c2.fill('#phone', '9946011223');
  await c2.getByRole('button', { name: /Hold slot/ }).click();
  await c2.waitForURL(/\/b\//);
  await c2.fill('#utr', '512200334455');
  c2.once('dialog', (d) => d.accept());               // "send without screenshot?"
  await c2.getByRole('button', { name: 'Send for approval' }).click();
  await expectText(c2, 'Waiting for the ground');

  // ---------------- owner logs in, reviews, approves
  const o = await phone();
  await o.goto(`${base}/owner`);
  await o.waitForURL(/\/login/);
  await shot(o, 'login');
  await o.fill('#phone', '9847012345'); await o.fill('#pin', '1234');
  await o.getByRole('button', { name: 'Log in' }).click();
  await o.waitForURL(/\/owner$/);
  await expectText(o, 'Check payment');
  await shot(o, 'owner-today', true);
  await o.locator('.pending').first().click();
  await expectText(o, 'Payment screenshot');
  await shot(o, 'owner-review', true);
  await o.getByRole('button', { name: 'Approve' }).click();
  await expectText(o, 'Tell Arjun K on WhatsApp');
  await shot(o, 'owner-approved');
  await o.getByRole('button', { name: 'Back to Today' }).click();
  await o.locator('.pending').first().click();       // Faisal: reject
  await o.getByRole('button', { name: 'Reject' }).click();
  await shot(o, 'owner-reject-sheet');
  await o.getByRole('button', { name: 'Reject booking' }).click();
  await expectText(o, 'The slot is free again');
  await o.getByRole('button', { name: 'Back to Today' }).click();

  // customer pages update
  await c.goto(bookingUrl);
  await expectText(c, 'Booking confirmed');
  await shot(c, 'customer-confirmed', true);
  await c2.reload();
  await expectText(c2, 'Payment not accepted');
  await shot(c2, 'customer-rejected', true);

  // ---------------- calendar: walk-in + close a slot
  await o.getByRole('link', { name: /Calendar/ }).click();
  await o.locator('.date').filter({ hasText: /\d/ }).nth(4).click(); // 3 days back are listed first → index 4 = tomorrow
  await expectText(o, 'Arjun K · Full ground');
  await o.locator('.cell.free').first().click();
  await o.locator('.sheet [name=name]').fill('Walk-in team');
  await shot(o, 'owner-add-walkin');
  await o.getByRole('button', { name: 'Save' }).click();
  await expectText(o, 'Booking added');
  await o.locator('.cell.free').nth(3).click();
  await o.getByRole('button', { name: 'Close slot' }).click();
  await o.locator('.sheet [name=note]').fill('Maintenance');
  await o.getByRole('button', { name: 'Save' }).click();
  await expectText(o, 'Slot closed');
  await o.waitForTimeout(300);
  await shot(o, 'owner-calendar', true);

  // ---------------- settings: add a helper, change a price
  await o.getByRole('link', { name: /Settings/ }).click();
  await expectText(o, 'Your booking link');
  await o.fill('[name=wd_1]', '1300');
  await o.getByRole('button', { name: 'Save prices' }).click();
  await expectText(o, 'Prices saved');
  await shot(o, 'owner-settings', true);

  // ---------------- helper
  const hp = await phone();
  await hp.goto(`${base}/helper`);
  await hp.fill('#phone', '9946055321'); await hp.fill('#pin', '1111');
  await hp.getByRole('button', { name: 'Log in' }).click();
  await hp.waitForURL(/\/helper$/);
  await expectText(hp, 'Arjun K');
  const helperHtml = await hp.content();
  if (/₹/.test(helperHtml)) problems.push('helper page shows money');
  await shot(hp, 'helper-upcoming', true);
  const ownerFromHelper = await hp.evaluate(async () => (await fetch('/api/owner/today')).status);
  if (ownerFromHelper !== 403) problems.push(`helper reached owner API: ${ownerFromHelper}`);

  // ---------------- Razorpay: owner connects keys, customer pays online
  await o.goto(`${base}/owner/settings`);
  await expectText(o, 'Automatic payments (Razorpay)');
  await o.fill('#rzpKey', KEY_ID); await o.fill('#rzpSecret', 'WrongSecret12345');
  await o.getByRole('button', { name: 'Connect Razorpay' }).click();
  await expectText(o, 'did not accept');
  await o.fill('#rzpSecret', KEY_SECRET);
  await o.getByRole('button', { name: 'Connect Razorpay' }).click();
  await expectText(o, 'On · Test mode');
  await o.locator('#razorpay').scrollIntoViewIfNeeded();
  await o.locator('#razorpay').screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-owner-razorpay-card.png` });

  const r = await phone();
  await r.route('https://checkout.razorpay.com/v1/checkout.js', (route) => route.fulfill({ contentType: 'text/javascript', body: `
    window.Razorpay = function (opts) { this.on = function () {}; this.open = async function () { opts.handler(await window.__fakePay(opts.order_id)); }; };` }));
  await r.exposeFunction('__fakePay', (orderId) => fake.pay(orderId));
  await r.goto(`${base}/g/demo?step=slots`);
  await r.locator('.date').nth(2).click();
  await r.getByRole('button', { name: '8 PM free' }).click();
  await r.getByRole('button', { name: 'Continue' }).click();
  await r.fill('#name', 'Online Payer'); await r.fill('#phone', '9811122233');
  await r.getByRole('button', { name: /Hold slot/ }).click();
  await r.waitForURL(/\/b\//);
  await expectText(r, 'Pay securely online');
  await shot(r, 'customer-pay-razorpay', true);
  await r.getByRole('button', { name: /^Pay ₹/ }).click();
  await expectText(r, 'Booking confirmed');
  await expectText(r, 'Paid online');
  await shot(r, 'customer-confirmed-online', true);

  // price change shows on customer page
  const c3 = await phone();
  await c3.goto(`${base}/g/demo`);
  await expectText(c3, '₹1,300');
} catch (e) {
  problems.push('FAILED: ' + (e.stack || e.message));
} finally {
  await browser.close();
  server.close();
}
console.log(problems.length ? 'PROBLEMS:\n' + problems.join('\n') : `All flows passed. ${n} screenshots in ${OUT}/`);
process.exit(problems.length ? 1 : 0);
