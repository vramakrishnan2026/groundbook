import { chromium } from 'playwright';
import { spawn } from 'child_process';
import fs from 'fs';
const FPS = 30;
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
const page = await b.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
await page.goto('file://' + process.cwd() + '/' + (process.env.REEL || 'reel.html'));
await page.evaluate(() => window.ready);
const shot = async (t) => { await page.evaluate((t) => window.frame(t), t); return page.screenshot({ type: 'jpeg', quality: 92 }); };
if (process.argv[2] === 'stills') {
  fs.mkdirSync('stills', { recursive: true });
  for (const t of process.argv.slice(3).map(Number)) fs.writeFileSync(`stills/${t.toFixed(2)}.jpg`, await shot(t));
} else {
  const scenes = process.env.REEL === 'reel25.html' ? [[0, 4.5], [4.5, 9.5], [9.5, 15], [15, 18.5], [18.5, 25]] : [[0, 2.6], [2.6, 5.4], [5.4, 8.6], [8.6, 11.2], [11.2, 13.2], [13.2, 15]];
  const PARTS = process.env.REEL === 'reel25.html' ? 'parts25' : 'parts'; fs.mkdirSync(PARTS, { recursive: true });
  const only = process.argv[2] ? process.argv[2].split(',').map(Number) : scenes.map((_, i) => i);
  for (const i of only) {
    const [a, z] = scenes[i], f0 = Math.round(a * FPS), f1 = Math.round(z * FPS);
    const tmp = `${PARTS}/tmp-${i}.mp4`;
    const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-crf', '18', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-r', String(FPS), tmp]);
    for (let f = f0; f < f1; f++) { const buf = await shot(f / FPS); if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r)); }
    ff.stdin.end();
    const code = await new Promise((r) => ff.on('close', r));
    if (code !== 0) throw new Error('ffmpeg failed on scene ' + i);
    fs.renameSync(tmp, `${PARTS}/scene-${i}.mp4`);
    console.log('scene', i, f1 - f0, 'frames');
  }
}
await b.close();
