import { chromium } from 'playwright';
import { spawn } from 'child_process';
import fs from 'fs';
const FPS = 30, DUR = 3.6;
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
const p = await b.newPage({ viewport: { width: 1080, height: 2160 } });
await p.goto('file://' + process.cwd() + '/sting-test.html'); await p.evaluate(() => window.ready); await p.waitForTimeout(300);
for (const [which, y, name] of [['SW', 0, 'goarena-logo-animation.mp4'], ['SB', 1080, 'goarena-badge-animation.mp4']]) {
  const tmp = 'tmp-' + name;
  const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-crf', '18', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', tmp]);
  for (let f = 0; f < DUR * FPS; f++) {
    await p.evaluate(([w, t]) => window[w].frame(t), [which, f / FPS]);
    const buf = await p.screenshot({ type: 'jpeg', quality: 92, clip: { x: 0, y, width: 1080, height: 1080 } });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  }
  ff.stdin.end(); if (await new Promise((r) => ff.on('close', r)) !== 0) throw new Error('ffmpeg ' + name);
  fs.renameSync(tmp, name); console.log(name);
}
await b.close();
