// Browser check of the QR poster maker: every design and size draws, and the
// downloads are a PDF at the exact print size and images at the exact pixel size.
// Run: node tests/e2e-posters.mjs   (needs Playwright + Chrome)
import fs from 'node:fs';
import { chromium } from 'playwright';
import { PDFDocument } from 'pdf-lib';
import { makeEnv, createServer } from '../scripts/dev-server.mjs';

const OUT = process.env.SHOTS || 'e2e-shots';
fs.mkdirSync(OUT, { recursive: true });
const env = await makeEnv();
env.PUBLIC_URL = 'https://book.goarena.in';
const server = createServer(env).listen(0);
const base = `http://localhost:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const problems = [];
const check = (ok, msg) => { if (!ok) problems.push(msg); };

try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const p = await ctx.newPage();
  p.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/net::|status of 4\d\d/.test(m.text())) problems.push(`console: ${m.text()}`); });

  await p.goto(`${base}/login`);
  await p.fill('#phone', '9847012345'); await p.fill('#pin', '1234');
  await p.getByRole('button', { name: 'Log in' }).click();
  await p.waitForURL(/\/owner$/);
  // a ground photo, so the posters have one to use
  if (process.env.PHOTO) {
    const r = await p.request.post(`${base}/api/owner/photos`, { data: fs.readFileSync(process.env.PHOTO), headers: { 'content-type': 'image/jpeg', origin: base } });
    check(r.ok(), `photo upload ${r.status()}`);
  }

  await p.goto(`${base}/owner/settings`);
  await p.getByText('Make a QR poster').click();
  await p.waitForURL(/\/owner\/posters$/);
  await p.locator('#preview img').waitFor({ timeout: 15000 });
  await p.locator('#thumb-matchday img').waitFor({ timeout: 15000 });
  await p.screenshot({ path: `${OUT}/posters-page.png`, fullPage: true });

  for (const tpl of ['splash', 'floodlight', 'matchday']) {
    await p.locator(`.poster-tpl[data-id=${tpl}]`).click();
    for (const fmt of ['a4', 'a3', 'standee', 'rollup', 'story', 'post', 'square']) {
      await p.locator(`.pf[data-id=${fmt}]`).click();
      await p.waitForTimeout(150);
      const ok = await p.locator('#preview img').evaluate((img) => new Promise((res) => img.complete ? res(img.naturalWidth > 0) : (img.onload = () => res(true), img.onerror = () => res(false))));
      check(ok, `preview did not draw: ${tpl} ${fmt}`);
    }
  }

  // PDF for a standee: 610 × 1220 mm
  await p.locator('.poster-tpl[data-id=floodlight]').click();
  await p.locator('.pf[data-id=standee]').click();
  await p.screenshot({ path: `${OUT}/posters-standee.png`, fullPage: true });
  let [dl] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.locator('#dlBtn').click()]);
  check(/\.pdf$/.test(dl.suggestedFilename()), `pdf name ${dl.suggestedFilename()}`);
  const pdfPath = `${OUT}/${dl.suggestedFilename()}`; await dl.saveAs(pdfPath);
  const doc = await PDFDocument.load(fs.readFileSync(pdfPath));
  const { width, height } = doc.getPage(0).getSize();
  check(Math.abs(width / 72 * 25.4 - 610) < 1 && Math.abs(height / 72 * 25.4 - 1220) < 1, `standee pdf is ${width}×${height} pt`);
  console.log('standee pdf', (fs.statSync(pdfPath).size / 1e6).toFixed(1), 'MB');

  // A4 PDF
  await p.locator('.pf[data-id=a4]').click();
  [dl] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.locator('#dlBtn').click()]);
  await dl.saveAs(`${OUT}/${dl.suggestedFilename()}`);
  const a4 = (await PDFDocument.load(fs.readFileSync(`${OUT}/${dl.suggestedFilename()}`))).getPage(0).getSize();
  check(Math.abs(a4.width / 72 * 25.4 - 210) < 1, `a4 width ${a4.width}`);

  // Status image: 1080 × 1920 JPEG
  await p.locator('.poster-tpl[data-id=matchday]').click();
  await p.locator('.pf[data-id=story]').click();
  [dl] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.locator('#dlBtn').click()]);
  const jpgPath = `${OUT}/${dl.suggestedFilename()}`; await dl.saveAs(jpgPath);
  const buf = fs.readFileSync(jpgPath);
  check(buf[0] === 0xff && buf[1] === 0xd8, 'story is not a JPEG');
  const dims = await p.evaluate(async (b64) => { const i = new Image(); i.src = 'data:image/jpeg;base64,' + b64; await i.decode(); return [i.naturalWidth, i.naturalHeight]; }, buf.toString('base64'));
  check(dims[0] === 1080 && dims[1] === 1920, `story is ${dims}`);
  fs.writeFileSync(`${OUT}/story-check.jpg`, buf);
} catch (e) {
  problems.push(String(e.stack || e));
} finally {
  await browser.close(); server.close();
}
if (problems.length) { console.log('PROBLEMS:\n' + problems.join('\n')); process.exit(1); }
console.log('poster maker OK');
