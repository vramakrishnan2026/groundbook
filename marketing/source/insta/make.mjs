import { chromium } from 'playwright';
const MARK = (stroke = 4) => `<svg viewBox="0 0 120 120" width="100%" height="100%"><rect width="120" height="120" rx="28" fill="#15803d"/><rect x="14" y="22" width="11.5" height="76" fill="#fff" opacity=".07"/><rect x="37" y="22" width="11.5" height="76" fill="#fff" opacity=".07"/><rect x="60" y="22" width="11.5" height="76" fill="#fff" opacity=".07"/><rect x="83" y="22" width="11.5" height="76" fill="#fff" opacity=".07"/><rect x="14" y="22" width="92" height="76" rx="3" fill="none" stroke="#fff" stroke-width="${stroke}"/><line x1="60" y1="22" x2="60" y2="98" stroke="#fff" stroke-width="${stroke}"/><rect x="14" y="44" width="10" height="32" fill="none" stroke="#fff" stroke-width="3"/><rect x="96" y="44" width="10" height="32" fill="none" stroke="#fff" stroke-width="3"/><circle cx="60" cy="60" r="19" fill="#15803d" stroke="#fff" stroke-width="${stroke}"/><path d="M55 50.5 L70.5 60 L55 69.5 Z" fill="#f6c64a" stroke="#f6c64a" stroke-width="3" stroke-linejoin="round"/></svg>`;
const font = `@font-face{font-family:B;font-weight:800;src:url(file:///home/claude/insta/BarlowCondensed-ExtraBold.ttf)}@font-face{font-family:B;font-weight:700;src:url(file:///home/claude/insta/BarlowCondensed-Bold.ttf)}body{margin:0}`;
const icons = {
  how: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5l5 3.5-5 3.5z"/>',
  book: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M8 15l2.5 2.5L16 13"/>',
  poster: '<rect x="5" y="3" width="14" height="18" rx="1.5"/><rect x="8.5" y="12" width="7" height="6"/><path d="M8.5 7h7"/>',
  owners: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
  chat: '<path d="M21 12a8.5 8.5 0 0 1-12.6 7.4L3 21l1.6-5.3A8.5 8.5 0 1 1 21 12z"/>',
};
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
const p = await b.newPage();
// profile picture: Instagram crops to a circle, so the mark sits well inside it
await p.setViewportSize({ width: 1080, height: 1080 });
await p.setContent(`<style>${font}</style><div style="width:1080px;height:1080px;background:#04140b;display:flex;align-items:center;justify-content:center"><div style="width:640px;height:640px">${MARK(4)}</div></div>`);
await p.screenshot({ path: 'goarena-profile-picture.png' });
// highlight covers 1080x1920; the circle shows the centre
for (const [k, label] of [['how', 'How it works'], ['book', 'Book'], ['poster', 'Posters'], ['owners', 'Owners'], ['chat', 'Contact']]) {
  await p.setViewportSize({ width: 1080, height: 1920 });
  await p.setContent(`<style>${font}</style><div style="width:1080px;height:1920px;background:#15803d;display:flex;align-items:center;justify-content:center"><div style="width:900px;height:900px;border-radius:50%;background:#04140b;display:flex;align-items:center;justify-content:center"><svg width="440" height="440" viewBox="0 0 24 24" fill="none" stroke="#f6c64a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${icons[k]}</svg></div></div>`);
  await p.screenshot({ path: `highlight-${k}.png` });
}
await b.close();
