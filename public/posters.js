// GoArena poster templates. Each template returns an SVG string for a given size.
// Everything is laid out on a canvas 1000 units wide; the height follows the chosen format,
// so the same design works for an A4 print, a 4-foot standee or an Instagram story.
// Fonts used (all free, open licences, in /fonts): Anton, Bebas Neue, Barlow Condensed, Permanent Marker.
import qrcode from './vendor/qrcode.js';

// Print sizes are rendered at a dpi that print shops accept for that size
// (big prints are seen from further away), and kept under the ~16 MP canvas limit of phones.
export const POSTER_FORMATS = {
  a4:      { label: 'A4 poster',             group: 'print',  ratio: 297 / 210, mm: [210, 297], dpi: 200 },
  a3:      { label: 'A3 poster',             group: 'print',  ratio: 420 / 297, mm: [297, 420], dpi: 150 },
  standee: { label: 'Standee 2 × 4 ft',      group: 'print',  ratio: 2,         mm: [610, 1220], dpi: 100 },
  rollup:  { label: 'Roll-up banner 3 × 6 ft', group: 'print', ratio: 2,        mm: [914, 1829], dpi: 72 },
  story:   { label: 'Status / Reel',         group: 'social', ratio: 16 / 9,   px: [1080, 1920] },
  post:    { label: 'Instagram post',        group: 'social', ratio: 1.25,     px: [1080, 1350] },
  square:  { label: 'Square post',           group: 'social', ratio: 1,        px: [1080, 1080] },
};
export function formatPixels(id) {
  const f = POSTER_FORMATS[id];
  if (f.px) return f.px;
  return f.mm.map((mm) => Math.round((mm / 25.4) * f.dpi));
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// small seeded random, so a poster always looks the same for the same ground
function rng(seed) {
  let s = 0; for (const c of String(seed)) s = (s * 31 + c.charCodeAt(0)) >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// ---------- vector QR code (needs qrcode-generator, MIT, already in the app's vendor folder)
function qrPath(text, x, y, size) {
  const q = qrcode(0, 'M'); q.addData(text); q.make();
  const n = q.getModuleCount(), m = size / n; let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${(x + c * m).toFixed(2)} ${(y + r * m).toFixed(2)}h${m.toFixed(3)}v${m.toFixed(3)}h-${m.toFixed(3)}z`;
  return d;
}

// ---------- paint: a rough brush stroke from (x1,y1) to (x2,y2)
function brush(r, x1, y1, x2, y2, width, color, opacity = 1) {
  const len = Math.hypot(x2 - x1, y2 - y1), ang = Math.atan2(y2 - y1, x2 - x1);
  const steps = 36, top = [], bot = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, taper = Math.sin(Math.PI * Math.min(1, t * 1.15)) ** 0.35;
    const w = width * (0.55 + 0.45 * taper) * (0.85 + r() * 0.3);
    top.push([t * len, -w / 2 + (r() - 0.5) * width * 0.18]);
    bot.push([t * len, w / 2 + (r() - 0.5) * width * 0.18]);
  }
  const pts = [...top, ...bot.reverse()];
  const d = 'M' + pts.map(([px, py]) => `${px.toFixed(1)} ${py.toFixed(1)}`).join('L') + 'Z';
  // dry-brush streaks along the stroke
  let streaks = '';
  for (let i = 0; i < 14; i++) {
    const sy = (r() - 0.5) * width * 0.9, sx = r() * len * 0.3, sl = len * (0.35 + r() * 0.6);
    streaks += `<path d="M${sx.toFixed(1)} ${sy.toFixed(1)}h${sl.toFixed(1)}" stroke="${color}" stroke-width="${(1 + r() * width * 0.05).toFixed(1)}" stroke-linecap="round" opacity="${(0.25 + r() * 0.5).toFixed(2)}"/>`;
  }
  return `<g transform="translate(${x1} ${y1}) rotate(${(ang * 180 / Math.PI).toFixed(2)})" opacity="${opacity}" filter="url(#rough)"><path d="${d}" fill="${color}"/>${streaks}</g>`;
}

// paint splatter around a point
function splatter(r, cx, cy, spread, count, color, max = 14) {
  let s = '';
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2, dist = spread * Math.sqrt(r()), size = Math.max(1.2, max * r() ** 3);
    s += `<circle cx="${(cx + Math.cos(a) * dist).toFixed(1)}" cy="${(cy + Math.sin(a) * dist * 0.7).toFixed(1)}" r="${size.toFixed(1)}" fill="${color}"/>`;
  }
  return s;
}

// fit text into a width: returns a font size
const fit = (text, maxW, maxSize, perChar) => Math.min(maxSize, maxW / Math.max(1, String(text).length * perChar));

const ICON = {
  clock: (c) => `<circle cx="12" cy="12" r="9.5" fill="none" stroke="${c}" stroke-width="1.8"/><path d="M12 6.5V12l3.6 2.2" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round"/>`,
  pin: (c) => `<path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z" fill="none" stroke="${c}" stroke-width="1.8"/><circle cx="12" cy="10" r="2.6" fill="none" stroke="${c}" stroke-width="1.8"/>`,
  rupee: (c) => `<path d="M7 4h10M7 8.5h10M7 4c6.5 0 6.5 9 0 9h-.5L15 21" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`,
  phone: (c) => `<path d="M5 3.5h3.5l1.8 4.5-2.3 1.4a12 12 0 0 0 6.6 6.6l1.4-2.3 4.5 1.8V19a2 2 0 0 1-2 2A16.5 16.5 0 0 1 3 5.5a2 2 0 0 1 2-2z" fill="none" stroke="${c}" stroke-width="1.8" stroke-linejoin="round"/>`,
  scan: (c) => `<path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3M7 12h10" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round"/>`,
};
const icon = (name, x, y, s, c) => `<g transform="translate(${x} ${y}) scale(${s / 24})">${ICON[name](c)}</g>`;

const DEFS = `
  <filter id="rough" x="-10%" y="-30%" width="120%" height="160%">
    <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="3" seed="4" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="16" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
  <filter id="grain" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="9" result="g"/>
    <feColorMatrix in="g" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.11 0"/>
  </filter>
  <filter id="shadow" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="14" stdDeviation="18" flood-color="#000" flood-opacity="0.45"/></filter>
  <filter id="soft" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="7"/></filter>`;

// ============================================================ Template 1: "Splash"
// Light grunge background, huge headline with a brushed word, the ground photo inside
// navy and gold paint strokes, QR card, dark info strip and a gold ribbon (like the tournament poster).
function tplSplash(d, H) {
  const r = rng(d.slug + 'splash');
  const navy = '#14213d', gold = d.accent || '#c9962e';
  const tall = H / 1000;
  const headY = 70 + 40 * Math.min(tall, 2);
  const nameSize = fit(d.name, 860, 190, 0.5);
  const stripH = 210, stripY = H - stripH - 70;
  const midTop = headY + nameSize + 220, midBot = stripY - 30;
  const midH = Math.max(320, midBot - midTop), cy = midTop + midH / 2;
  const qrSize = Math.min(H > 1500 ? 470 : 360, midH * 0.7), qrX = 500 - qrSize / 2, qrY = cy - qrSize / 2 - 20;
  return `
  <rect width="1000" height="${H}" fill="#f1f0ec"/>
  <polygon points="0,0 230,0 0,${H * 0.28}" fill="#e4e3de"/><polygon points="1000,${H * 0.55} 1000,${H} 640,${H}" fill="#e7e6e1"/>
  <path d="M-20 ${H * 0.08} L240 -20" stroke="#cfcdc6" stroke-width="10"/><path d="M-20 ${H * 0.62} L120 ${H * 0.7}" stroke="#d6d4ce" stroke-width="18"/>
  <!-- paint with the ground photo inside -->
  <defs><mask id="paintmask" maskUnits="userSpaceOnUse" x="0" y="0" width="1000" height="${H}">${brush(rng(d.slug + 'clip'), -60, cy + midH * 0.3, 1080, cy - midH * 0.3, midH * 0.62, '#fff')}</mask></defs>
  ${brush(r, -80, cy + midH * 0.62, 1090, cy - midH * 0.25, midH * 0.3, gold)}
  ${brush(r, -80, cy + midH * 0.42, 1090, cy - midH * 0.62, midH * 0.9, navy)}
  ${d.photo ? `<image href="${d.photo}" x="-40" y="${cy - midH * 0.8}" width="1080" height="${midH * 1.6}" preserveAspectRatio="xMidYMid slice" mask="url(#paintmask)"/>` : ''}
  ${splatter(r, 820, cy - midH * 0.4, 220, 70, navy, 16)}${splatter(r, 180, cy + midH * 0.35, 200, 60, gold, 14)}${splatter(r, 860, cy + midH * 0.1, 260, 40, gold, 7)}
  <!-- headline -->
  <text x="500" y="${headY + nameSize * 0.82}" text-anchor="middle" font-family="Anton" font-size="${nameSize}" fill="#0b0b0b" letter-spacing="2">${esc(d.name.toUpperCase())}</text>
  <text x="500" y="${headY + nameSize + 120}" text-anchor="middle" font-family="Permanent Marker" font-size="140" fill="${gold}" transform="rotate(-6 500 ${headY + nameSize + 70})">Book Online</text>
  <text x="500" y="${headY + nameSize + 182}" text-anchor="middle" font-family="Permanent Marker" font-size="${fit(d.tagline || 'Football turf', 560, 44, 0.55)}" fill="#111" stroke="#f1f0ec" stroke-width="9" stroke-linejoin="round" paint-order="stroke" transform="rotate(-6 500 ${headY + nameSize + 170})">${esc(d.tagline || 'Football turf')}</text>
  <!-- QR card -->
  <g filter="url(#shadow)"><rect x="${qrX - 34}" y="${qrY - 86}" width="${qrSize + 68}" height="${qrSize + 150}" rx="26" fill="#fff"/></g>
  ${icon('scan', qrX - 4, qrY - 66, 40, navy)}
  <text x="${qrX + 46}" y="${qrY - 32}" font-family="Barlow Condensed" font-weight="800" font-size="44" fill="${navy}" letter-spacing="1">SCAN TO BOOK</text>
  <path d="${qrPath(d.url, qrX, qrY, qrSize)}" fill="#0b0b0b"/>
  <text x="${qrX + qrSize / 2}" y="${qrY + qrSize + 46}" text-anchor="middle" font-family="Barlow Condensed" font-weight="700" font-size="30" fill="#555">Pay by UPI · Confirmed instantly</text>
  <!-- info strip -->
  <defs><linearGradient id="strip" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b2b2b" stop-opacity="0"/><stop offset=".25" stop-color="#1c1c1c"/><stop offset="1" stop-color="#050505"/></linearGradient></defs>
  <rect x="0" y="${stripY - 120}" width="1000" height="${H - stripY + 120}" fill="url(#strip)"/>
  ${[['clock', 'OPEN DAILY', d.hours], ['rupee', 'FROM', d.priceFrom], ['pin', 'LOCATION', d.area]].map(([ic, k, v], i) => {
    const x = 60 + i * 310;
    return `${i ? `<rect x="${x - 26}" y="${stripY + 20}" width="3" height="120" fill="#444"/>` : ''}${icon(ic, x, stripY + 42, 64, '#fff')}
      <text x="${x + 80}" y="${stripY + 64}" font-family="Bebas Neue" font-size="34" fill="#bbb" letter-spacing="2">${k}</text>
      <text x="${x + 80}" y="${stripY + 112}" font-family="Bebas Neue" font-size="${fit(v, 200, 52, 0.42)}" fill="#fff">${esc(v)}</text>`;
  }).join('')}
  <polygon points="${230},${H - 30} ${300},${H - 120} ${790},${H - 120} ${720},${H - 30}" fill="${gold}"/>
  <text x="510" y="${H - 58}" text-anchor="middle" font-family="Bebas Neue" font-size="${fit(d.urlShort, 440, 54, 0.43)}" fill="#fff" letter-spacing="1">${esc(d.urlShort.toUpperCase())}</text>
  <rect width="1000" height="${H}" filter="url(#grain)"/>`;
}

// ============================================================ Template 2: "Floodlight"
// The ground photo at night under a deep teal wash, neon-lime scratches and frame corners,
// a big brushed headline and a QR card (like the football-match poster).
function tplFloodlight(d, H) {
  const r = rng(d.slug + 'flood');
  const lime = '#b7f23a', deep = '#06262a';
  const headY = H * 0.13;
  const nameY = headY + 510, avail = (H - 300) - (nameY + 60) - 150;
  const qrSize = Math.min(H > 1500 ? 480 : 360, avail), qrY = nameY + 60 + Math.max(40, (avail - qrSize) / 2), qrX = 500 - qrSize / 2;
  const scratch = (x, y, len, ang, w) => `<path d="M${x} ${y} l${(Math.cos(ang) * len).toFixed(1)} ${(Math.sin(ang) * len).toFixed(1)}" stroke="${lime}" stroke-width="${w}" stroke-linecap="round" opacity="${(0.55 + r() * 0.45).toFixed(2)}"/>`;
  let scratches = '';
  for (let i = 0; i < 16; i++) scratches += scratch(30 + r() * 220, 40 + r() * H * 0.25, 80 + r() * 260, -0.9 + r() * 0.3, 2 + r() * 7);
  for (let i = 0; i < 16; i++) scratches += scratch(760 + r() * 200, H * 0.7 + r() * H * 0.25, 80 + r() * 240, -1.1 + r() * 0.3, 2 + r() * 7);
  const nameSize = fit(d.name, 820, 96, 0.47);
  return `
  <rect width="1000" height="${H}" fill="${deep}"/>
  ${d.photo ? `<image href="${d.photo}" x="0" y="0" width="1000" height="${H}" preserveAspectRatio="xMidYMid slice"/>` : ''}
  <defs><linearGradient id="wash" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#062c33" stop-opacity=".88"/><stop offset=".45" stop-color="#0a3b37" stop-opacity=".55"/><stop offset=".75" stop-color="#05201d" stop-opacity=".82"/><stop offset="1" stop-color="#021311" stop-opacity=".97"/></linearGradient>
  <radialGradient id="glow" cx=".5" cy=".18" r=".6"><stop offset="0" stop-color="#7ef0d0" stop-opacity=".35"/><stop offset="1" stop-color="#7ef0d0" stop-opacity="0"/></radialGradient></defs>
  <rect width="1000" height="${H}" fill="url(#wash)"/><rect width="1000" height="${H}" fill="url(#glow)"/>
  ${scratches}
  <path d="M28 ${H * 0.33} V28 H${H * 0.06 + 120}" fill="none" stroke="${lime}" stroke-width="10"/><path d="M972 ${H * 0.67} V${H - 28} H${1000 - H * 0.06 - 120}" fill="none" stroke="${lime}" stroke-width="10"/>
  <polygon points="1000,0 1000,170 830,0" fill="#e8ffe0" opacity=".9"/><polygon points="0,${H} 0,${H - 170} 170,${H}" fill="#e8ffe0" opacity=".9"/>
  <!-- top line -->
  <text x="500" y="${headY - 40}" text-anchor="middle" font-family="Barlow Condensed" font-weight="700" font-size="40" fill="#e9fff1" letter-spacing="6">${esc((d.area || '').toUpperCase())}</text>
  <!-- brushed headline -->
  <g transform="rotate(-5 500 ${headY + 140})">
    <text x="500" y="${headY + 150}" text-anchor="middle" font-family="Permanent Marker" font-size="150" fill="#000" opacity=".35" transform="translate(8 10)">Book Your</text>
    <text x="500" y="${headY + 150}" text-anchor="middle" font-family="Permanent Marker" font-size="150" fill="#fff">Book Your</text>
    <text x="520" y="${headY + 330}" text-anchor="middle" font-family="Permanent Marker" font-size="210" fill="#000" opacity=".35" transform="translate(8 10)">Slot</text>
    <text x="520" y="${headY + 330}" text-anchor="middle" font-family="Permanent Marker" font-size="210" fill="#fff">Slot</text>
    ${brush(r, 290, headY + 362, 760, headY + 345, 30, lime)}
  </g>
  <text x="500" y="${nameY}" text-anchor="middle" font-family="Anton" font-size="${nameSize}" fill="${lime}" letter-spacing="3">${esc(d.name.toUpperCase())}</text>
  <!-- QR -->
  <g transform="rotate(-3 500 ${qrY + qrSize / 2})">
    <g filter="url(#shadow)"><rect x="${qrX - 30}" y="${qrY - 30}" width="${qrSize + 60}" height="${qrSize + 60}" rx="22" fill="#fff"/></g>
    <rect x="${qrX - 30}" y="${qrY - 30}" width="${qrSize + 60}" height="${qrSize + 60}" rx="22" fill="none" stroke="${lime}" stroke-width="8"/>
    <path d="${qrPath(d.url, qrX, qrY, qrSize)}" fill="#04211d"/>
  </g>
  <rect x="${500 - 190}" y="${qrY + qrSize + 58}" width="380" height="64" rx="32" fill="${lime}"/>
  <text x="500" y="${qrY + qrSize + 102}" text-anchor="middle" font-family="Barlow Condensed" font-weight="800" font-size="40" fill="#062a20" letter-spacing="3">SCAN TO BOOK</text>
  <!-- details -->
  <path d="M310 ${H - 250} H690" stroke="${lime}" stroke-width="3"/><circle cx="500" cy="${H - 250}" r="9" fill="${lime}"/>
  <text x="500" y="${H - 186}" text-anchor="middle" font-family="Barlow Condensed" font-weight="600" font-size="46" fill="#fff">Open daily ${esc(d.hours)} · from ${esc(d.priceFrom)}</text>
  ${d.phoneLabel ? `<text x="500" y="${H - 120}" text-anchor="middle" font-family="Barlow Condensed" font-weight="600" font-size="44" fill="#fff">${esc(d.phoneLabel)}</text>` : ''}
  <text x="500" y="${H - 66}" text-anchor="middle" font-family="Barlow Condensed" font-weight="700" font-size="${fit(d.urlShort, 700, 40, 0.42)}" fill="${lime}" letter-spacing="1">${esc(d.urlShort)}</text>
  <rect width="1000" height="${H}" filter="url(#grain)"/>`;
}

// ============================================================ Template 3: "Match day"
// Big photo with soft depth, an outlined football, a huge condensed headline and a black
// band with QR and price tiles (like the match-week poster).
function tplMatchday(d, H) {
  const gold = '#f6c64a', cream = '#fff4d8';
  const bandH = Math.min(H * 0.36, 520), bandY = H - bandH;
  const headSize = Math.min(250, H * 0.17), headY = bandY - 10;
  const tile = Math.min(240, bandH * 0.52);
  const ball = (cx, cy, rr) => {
    let s = `<circle cx="${cx}" cy="${cy}" r="${rr}" fill="none" stroke="#000" stroke-width="12"/>`;
    const pent = (x, y, rad, rot) => Array.from({ length: 5 }, (_, i) => { const a = rot + i * Math.PI * 2 / 5; return `${(x + Math.cos(a) * rad).toFixed(1)},${(y + Math.sin(a) * rad).toFixed(1)}`; }).join(' ');
    s += `<polygon points="${pent(cx, cy, rr * 0.28, -Math.PI / 2)}" fill="#000"/>`;
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + i * Math.PI * 2 / 5, ix = cx + Math.cos(a) * rr * 0.28, iy = cy + Math.sin(a) * rr * 0.28, ox = cx + Math.cos(a) * rr * 0.6, oy = cy + Math.sin(a) * rr * 0.6;
      s += `<line x1="${ix}" y1="${iy}" x2="${ox}" y2="${oy}" stroke="#000" stroke-width="10"/><polygon points="${pent(cx + Math.cos(a) * rr * 0.78, cy + Math.sin(a) * rr * 0.78, rr * 0.2, a + Math.PI)}" fill="none" stroke="#000" stroke-width="10"/>`;
      const b = a + Math.PI / 5; s += `<line x1="${cx + Math.cos(a) * rr * 0.6}" y1="${cy + Math.sin(a) * rr * 0.6}" x2="${cx + Math.cos(b) * rr * 0.98}" y2="${cy + Math.sin(b) * rr * 0.98}" stroke="#000" stroke-width="10"/>`;
    }
    return s;
  };
  const priceTile = `<text x="${tile / 2}" y="${tile * 0.3}" text-anchor="middle" font-family="Bebas Neue" font-size="${tile * 0.17}" fill="#000" letter-spacing="2">FROM</text>
    <text x="${tile / 2}" y="${tile * 0.66}" text-anchor="middle" font-family="Anton" font-size="${fit(d.priceFrom, tile * 0.86, tile * 0.38, 0.5)}" fill="#000">${esc(d.priceFrom)}</text>
    <text x="${tile / 2}" y="${tile * 0.86}" text-anchor="middle" font-family="Bebas Neue" font-size="${tile * 0.15}" fill="#000" letter-spacing="2">PER HOUR</text>`;
  return `
  <rect width="1000" height="${H}" fill="#0a0a0a"/>
  ${d.photo ? `<image href="${d.photo}" x="0" y="0" width="1000" height="${bandY + 60}" preserveAspectRatio="xMidYMid slice"/>` : ''}
  <defs><linearGradient id="top" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".85"/><stop offset=".28" stop-color="#000" stop-opacity=".1"/><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset=".88" stop-color="#000" stop-opacity=".85"/><stop offset="1" stop-color="#000"/></linearGradient></defs>
  <rect width="1000" height="${bandY + 2}" fill="url(#top)"/>
  <g opacity=".9" transform="translate(${880} ${170 + H * 0.02}) scale(.45) translate(-880 ${-(170 + H * 0.02)})">${ball(880, 170 + H * 0.02, 150).replace(/#000/g, '${gold}')}</g>
  <!-- top: ground name as the 'cup' -->
  <text x="500" y="${150 + H * 0.02}" text-anchor="middle" font-family="Anton" font-size="${fit(d.name, 760, 84, 0.46)}" fill="#fff" letter-spacing="2">${esc(d.name.toUpperCase())}</text>
  <text x="500" y="${200 + H * 0.02}" text-anchor="middle" font-family="Barlow Condensed" font-weight="700" font-size="34" fill="#f6c64a" letter-spacing="5">${esc((d.area || '').toUpperCase())}</text>
  <!-- headline -->
  <text x="500" y="${headY}" text-anchor="middle" font-family="Anton" font-size="${headSize}" fill="${cream}" stroke="#000" stroke-width="4" paint-order="stroke" textLength="900" lengthAdjust="spacingAndGlyphs">BOOK YOUR SLOT</text>
  <!-- black band -->
  <rect x="0" y="${bandY}" width="1000" height="${bandH}" fill="#000"/>
  <defs><linearGradient id="goldg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset="1" stop-color="${gold}"/></linearGradient></defs>
  <g transform="translate(70 ${bandY + 40})"><rect width="${tile}" height="${tile}" fill="url(#goldg)"/><rect x="${tile * 0.09}" y="${tile * 0.09}" width="${tile * 0.82}" height="${tile * 0.82}" fill="#fff"/><path d="${qrPath(d.url, tile * 0.12, tile * 0.12, tile * 0.76)}" fill="#000"/></g>
  <g transform="translate(${90 + tile} ${bandY + 40})"><rect width="${tile}" height="${tile}" fill="url(#goldg)"/>${priceTile}</g>
  <text x="940" y="${bandY + 40 + tile * 0.32}" text-anchor="end" font-family="Anton" font-size="${tile * 0.3}" fill="#fff">SCAN &amp; BOOK</text>
  <text x="940" y="${bandY + 40 + tile * 0.62}" text-anchor="end" font-family="Barlow Condensed" font-weight="700" font-size="38" fill="#fff">OPEN DAILY ${esc(d.hours.toUpperCase())}</text>
  <text x="940" y="${bandY + 40 + tile * 0.84}" text-anchor="end" font-family="Barlow Condensed" font-weight="700" font-size="38" fill="#fff">${esc(d.phoneLabel)}</text>
  <text x="500" y="${H - 130}" text-anchor="middle" font-family="Barlow Condensed" font-weight="600" font-size="34" fill="#aaa" letter-spacing="4">BOOK ONLINE AT</text>
  <text x="500" y="${H - 56}" text-anchor="middle" font-family="Anton" font-size="${fit(d.urlShort, 860, 60, 0.47)}" fill="#fff" letter-spacing="1">${esc(d.urlShort.toUpperCase())}</text>`;
}

export const TEMPLATES = {
  splash: { name: 'Splash', draw: tplSplash },
  floodlight: { name: 'Floodlight', draw: tplFloodlight },
  matchday: { name: 'Match day', draw: tplMatchday },
};

// fontsCss: an @font-face block (with embedded fonts) so the SVG renders the same everywhere
export function posterSVG(templateId, data, formatId, fontsCss = '') {
  const f = POSTER_FORMATS[formatId], H = Math.round(1000 * f.ratio);
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1000 ${H}" width="1000" height="${H}">
  <defs>${fontsCss ? `<style>${fontsCss}</style>` : ''}${DEFS}</defs>
  ${TEMPLATES[templateId].draw(data, H)}
</svg>`;
}


// ---------- turning a poster into a file (runs in the browser)
const FONT_FILES = [['Anton', 'Anton-Regular.ttf', 400], ['Bebas Neue', 'BebasNeue-Regular.ttf', 400],
  ['Permanent Marker', 'PermanentMarker-Regular.ttf', 400], ['Barlow Condensed', 'BarlowCondensed-SemiBold.ttf', 600],
  ['Barlow Condensed', 'BarlowCondensed-Bold.ttf', 700], ['Barlow Condensed', 'BarlowCondensed-ExtraBold.ttf', 800]];

export const blobToDataUrl = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });

// An SVG drawn as an image can't load anything from outside, so fonts are packed into it.
let fontsCssPromise = null;
export function fontsCss() {
  fontsCssPromise ??= Promise.all(FONT_FILES.map(async ([fam, file, w]) => {
    const url = await blobToDataUrl(await (await fetch('/fonts/' + file)).blob());
    return `@font-face{font-family:'${fam}';font-weight:${w};src:url(${url}) format('truetype')}`;
  })).then((a) => a.join('')).catch((e) => { fontsCssPromise = null; throw e; });
  return fontsCssPromise;
}

// The fonts must be known to the page too, or the first drawing can come out in a fallback font.
let pageFonts = null;
export function loadPageFonts() {
  pageFonts ??= Promise.all(FONT_FILES.map(([fam, file, w]) => new FontFace(fam, `url(/fonts/${file})`, { weight: String(w) }).load().then((f) => document.fonts.add(f))));
  return pageFonts;
}

export async function photoDataUrl(src) {
  if (!src) return null;
  if (src.startsWith('data:')) return src;
  return blobToDataUrl(await (await fetch(src)).blob());
}

// Draws the SVG at the exact pixel size and returns a Blob (JPEG for print and posts).
export async function renderPoster(svg, w, h, type = 'image/jpeg', quality = 0.92) {
  await loadPageFonts();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image(); img.decoding = 'async';
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('Could not draw the poster')); img.src = url; });
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise((res) => c.toBlob(res, type, quality));
    c.width = c.height = 1; // free the memory straight away on phones
    if (!blob) throw new Error('This phone ran out of memory. Try a smaller size.');
    return blob;
  } finally { URL.revokeObjectURL(url); }
}

// A PDF page at the exact physical size, with the poster image filling it.
export async function posterPdf(jpegBlob, formatId, title) {
  const { PDFDocument } = await import('./vendor/pdf-lib.esm.min.js');
  const f = POSTER_FORMATS[formatId];
  const [wPt, hPt] = f.mm.map((mm) => (mm / 25.4) * 72);
  const doc = await PDFDocument.create();
  doc.setTitle(title); doc.setCreator('GoArena'); doc.setProducer('GoArena');
  const img = await doc.embedJpg(new Uint8Array(await jpegBlob.arrayBuffer()));
  doc.addPage([wPt, hPt]).drawImage(img, { x: 0, y: 0, width: wPt, height: hPt });
  return new Blob([await doc.save()], { type: 'application/pdf' });
}
