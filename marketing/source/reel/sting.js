// GoArena logo sting: the flaming ball flies in, circles the logo (behind, then in front)
// and settles. mode 'word': it lands as the "o" of GoArena. mode 'badge': it settles behind "GA".
// Every frame is computed from time alone, so it can be rendered to video or played live.
// Usage: const s = makeSting(el, { mode, width, height, cx, cy, size }); s.frame(t) with t in seconds.
// Duration: 2.9 s to settle; s.frame(t) for t past that holds the settled logo.
(function () {
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const p = (t, a, b) => clamp((t - a) / (b - a));
  const eo = (x) => 1 - (1 - x) ** 3;
  const eio = (x) => (x < .5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
  const backE = (x) => { const c = 1.7; return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2; };
  const lerp = (a, b, x) => a + (b - a) * x;
  const ASSET = (window.STING_ASSETS || 'assets/');
  // flames.png is 700x700 with the ball centre at (575, 350) and ball radius 190
  const FL = { w: 700, bx: 575, by: 350, r: 190 };

  window.makeSting = function (root, o) {
    const mode = o.mode || 'word', size = o.size || 190;   // font size in px
    const W = o.width, H = o.height, CX = o.cx ?? W / 2, CY = o.cy ?? H / 2;
    root.style.position = root.style.position || 'relative';
    const layer = document.createElement('div');
    Object.assign(layer.style, { position: 'absolute', left: 0, top: 0, width: W + 'px', height: H + 'px', pointerEvents: 'none' });
    root.appendChild(layer);
    const uid = 'st' + Math.random().toString(36).slice(2, 8);
    layer.classList.add(uid);
    const css = document.createElement('style');
    css.textContent = `
      .${uid} .st-word{position:absolute;left:0;top:0;display:flex;align-items:baseline;white-space:nowrap;font:italic 900 ${size}px MontIt, sans-serif;line-height:1;letter-spacing:${mode === 'badge' ? size * .05 : -size * .026}px;z-index:3}
      .${uid} .st-word span{display:inline-block}
      .${uid} .st-gold{background:linear-gradient(180deg,#ffe680,#f59e0b);-webkit-background-clip:text;color:transparent;padding-right:${size * .06}px}
      .${uid} .st-shadow span{filter:drop-shadow(${size * .02}px 0 ${size * .04}px rgba(3,20,12,.6))}
      .${uid} .st-back{color:#03140c;-webkit-text-stroke:${size * .08}px #03140c;z-index:2;filter:drop-shadow(0 ${size * .04}px ${size * .07}px rgba(0,0,0,.7))}
      .${uid} .st-abs{position:absolute;left:0;top:0;will-change:transform}`;
    layer.appendChild(css);
    const word = document.createElement('div'); word.className = 'st-word st-shadow';
    let back = null;
    if (mode === 'word') word.innerHTML = `<span class="g" style="color:#fff">G</span><span class="st-slot" style="width:${size * .74}px;height:${size * .74}px;margin:0 ${size * .03}px 0 ${size * .015}px"></span><span class="a st-gold">Arena</span>`;
    else {
      back = document.createElement('div'); back.className = 'st-word st-back'; back.innerHTML = '<span class="g">G</span><span class="a">A</span>';
      word.innerHTML = '<span class="g" style="color:#fff">G</span><span class="a st-gold">A</span>';
      layer.appendChild(back);
    }
    layer.appendChild(word);
    const trail = document.createElement('img'); trail.src = ASSET + 'flames.png'; trail.className = 'st-abs';
    const ball = document.createElement('img'); ball.src = ASSET + 'ball-front.png'; ball.className = 'st-abs';
    const flash = document.createElement('div'); flash.className = 'st-abs';
    for (const el of [trail, ball, flash]) layer.appendChild(el);
    let G = null, lastAng = 0;
    function geometry() {
      // place the word centred on (CX, CY) and measure where the ball must land
      const r = word.getBoundingClientRect(), L = layer.getBoundingClientRect();
      const wx = CX - r.width / 2, wy = CY - r.height / 2;
      word.style.left = wx + 'px'; word.style.top = wy + 'px';
      if (back) { back.style.left = wx + 'px'; back.style.top = wy + 'px'; }
      let land, D;
      if (mode === 'word') {
        const s = word.querySelector('.st-slot').getBoundingClientRect();
        D = s.width; land = { x: s.left - L.left + D / 2, y: s.top - L.top + D / 2 + size * .07 };
      } else { D = size * 1.15; land = { x: CX + size * .06, y: CY - size * .02 }; }
      G = { w: r.width, h: r.height, land, D, rx: r.width / 2 + size * (o.pad ?? .62), ry: size * .62 };
    }
    // ball path: fly in, 1.25 loops around the logo, drop into place
    const T_IN = .55, T_ORB = 2.05, T_LAND = 2.5;
    function pos(t) {
      const ph0 = Math.PI, ph1 = Math.PI + 2.5 * Math.PI;
      const orbit = (ph) => ({ x: CX + G.rx * Math.cos(ph), y: CY + G.ry * Math.sin(ph), ph });
      if (t < T_IN) {
        const q = eo(p(t, 0, T_IN)), s = { x: -W * .25, y: CY + H * .45 }, e = orbit(ph0), c = { x: W * .05, y: CY + G.ry * 1.6 };
        return { x: (1 - q) ** 2 * s.x + 2 * (1 - q) * q * c.x + q * q * e.x, y: (1 - q) ** 2 * s.y + 2 * (1 - q) * q * c.y + q * q * e.y, front: true, sc: 1.25 };
      }
      if (t < T_ORB) {
        const ph = lerp(ph0, ph1, eio(p(t, T_IN, T_ORB)) * .92 + p(t, T_IN, T_ORB) * .08), o2 = orbit(ph);
        const depth = Math.sin(ph);                           // -1 top (behind) .. +1 bottom (front)
        return { x: o2.x, y: o2.y, front: depth > 0, sc: 1 + .25 * depth };
      }
      const s = orbit(ph1), q = eio(p(t, T_ORB, T_LAND));
      return { x: lerp(s.x, G.land.x, q), y: lerp(s.y, G.land.y, q) - Math.sin(q * Math.PI) * G.ry * .5, front: mode === 'word' ? q > .55 : false, sc: lerp(.75, 1, q) };
    }
    function frame(t) {
      if (!G) geometry();
      const P = pos(t), Pp = pos(Math.max(0, t - 1 / 30));
      const vx = P.x - Pp.x, vy = P.y - Pp.y, speed = Math.hypot(vx, vy);
      const settled = t >= T_LAND;
      const growTo = mode === 'word' ? 1 : 1;
      const D = G.D * (settled ? 1 : P.sc) * (mode === 'badge' && settled ? 1 : 1);
      ball.style.width = ball.style.height = D + 'px';
      const bump = settled ? 1 + .08 * Math.sin(p(t, T_LAND, T_LAND + .35) * Math.PI) : 1;
      ball.style.transform = `translate(${P.x - D / 2}px, ${P.y - D / 2}px) scale(${bump})`;
      ball.style.zIndex = P.front || (mode === 'word' && settled) ? 5 : 1;
      ball.style.filter = `drop-shadow(0 ${D * .08}px ${D * .1}px rgba(0,0,0,.45)) drop-shadow(0 0 ${D * .12}px rgba(255,160,40,${settled ? .35 * (1 - p(t, T_LAND, T_LAND + .8)) + .15 : .55}))`;
      // flame trail points away from the motion, fades out after landing
      const ang = Math.atan2(vy, vx), s = D / (2 * FL.r);
      const rest = p(t, T_LAND, T_LAND + .4), fade = settled ? lerp(1, .9, rest) : clamp(speed / 6);
      trail.style.width = FL.w * s + 'px'; trail.style.height = FL.w * s + 'px';
      trail.style.transformOrigin = `${FL.bx * s}px ${FL.by * s}px`;
      const restAng = mode === 'word' ? 0 : Math.PI * .15, a2 = settled ? lerp(lastAng, restAng, eo(rest)) : (speed > .5 ? ang : lastAng); if (!settled && speed > .5) lastAng = ang;
      trail.style.transform = `translate(${P.x - FL.bx * s}px, ${P.y - FL.by * s}px) rotate(${a2}rad) scaleX(${settled ? lerp(1.1, 1, rest) : .6 + .6 * clamp(speed / 30)})`;
      trail.style.opacity = fade; trail.style.zIndex = settled ? 1 : ball.style.zIndex - 1;
      // letters reveal as the ball passes them
      const gIn = backE(p(t, .45, .75)), aIn = backE(p(t, .95, 1.3));
      const bumpW = settled ? 1 + .04 * Math.sin(p(t, T_LAND, T_LAND + .3) * Math.PI) : 1;
      for (const box of [word, back].filter(Boolean)) {
        box.querySelector('.g').style.transform = `scale(${lerp(.3, 1, gIn)})`; box.querySelector('.g').style.opacity = p(t, .45, .55);
        box.querySelector('.a').style.transform = `scale(${lerp(.3, 1, aIn)})`; box.querySelector('.a').style.opacity = p(t, .95, 1.05);
        box.style.transform = `scale(${bumpW})`;
      }
      // landing flash
      const fq = p(t, T_LAND, T_LAND + .45), R = G.D * (.6 + 2.2 * eo(fq));
      Object.assign(flash.style, { width: R * 2 + 'px', height: R * 2 + 'px', borderRadius: '50%', transform: `translate(${G.land.x - R}px, ${G.land.y - R}px)`,
        background: 'radial-gradient(circle, rgba(255,236,170,.0) 45%, rgba(255,200,80,.55) 62%, rgba(255,160,40,0) 72%)', opacity: fq > 0 && fq < 1 ? 1 - fq : 0, zIndex: 6 });
    }
    return { frame, duration: 2.9 };
  };
})();
