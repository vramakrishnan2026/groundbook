import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
await p.goto('file://' + process.cwd() + '/status.html'); await p.waitForFunction(() => document.title === 'done'); await p.waitForTimeout(400);
await p.locator('#p').screenshot({ path: 'goarena-whatsapp-status.png' }); await b.close();
