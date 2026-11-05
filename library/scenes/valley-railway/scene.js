// Valley Railway — a miniature valley diorama at dusk that runs on its own.
// Picture + code: the painting (AI illustration; painted train, barrier arm, cars and
// ferry removed) with code layers on top:
//   - a train (engine + 3 coaches, drawn as 2.5D boxes) runs one loop traced on the
//     painted rails: viaduct, left station (stops), level crossing, bridge, right curve,
//     tunnel (waits a while inside);
//   - a red two-car shuttle runs back and forth at the right-hand station;
//   - the crossing barrier lowers and its lamps blink while the train passes; cars
//     queue at the stop line and drive on;
//   - the ferry crosses the river; waterfalls and rapids shimmer; lights twinkle.
// Time of day: the painting is dusk; dawn tint, warmer day, blue night with lights.
// Live wallpaper (hover only): hover a station → its next train waits longer and the
// platform lamps and carriage windows glow brighter.
// reducedMotion: one still frame (redrawn when the time of day changes).
import photoUrl from './valley-railway.jpg'
import lightsUrl from './vr-lights.png'
import fallsUrl from './vr-falls.png'
import rapidsUrl from './vr-rapids.png'
import waterUrl from './vr-water.png'
import ferryUrl from './vr-ferry.png'
import carGrey from './vr-car-grey.png'
import carRed from './vr-car-red.png'
import carBlue1 from './vr-car-blue1.png'
import carBlue2 from './vr-car-blue2.png'
import { TR, SH, ROAD as ROADPTS, FE, LIGHTS } from './paths.js'

const ASSETS = { plate: photoUrl, lights: lightsUrl, falls: fallsUrl, rapids: rapidsUrl, water: waterUrl, ferry: ferryUrl, car_grey: carGrey, car_red: carRed, car_blue1: carBlue1, car_blue2: carBlue2 }
const PATHS = { TR, SH, ROAD: ROADPTS, FE, LIGHTS }

export function mount(container, ctx) {
  const A = ASSETS, P = PATHS; let WATER = null;
  const W = 1920, H = 1080, S = 1.25;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block';
  container.replaceChildren(cv);
  const g = cv.getContext('2d');
  const img = {};
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const K = y => .85 + (y - 200) / 600;           // perspective size factor
  const TILT = .5;

  // ---------- paths with world-length parameter ----------
  function mkPath(pts, closed) {
    const p = pts.map(q => ({x:q[0], y:q[1], v:q[2] === undefined ? 1 : q[2]}));
    if (closed) p.push(Object.assign({}, p[0]));
    const s = [0];
    for (let i = 1; i < p.length; i++) { const a = p[i - 1], b = p[i]; const d = Math.hypot(b.x - a.x, b.y - a.y); s.push(s[i - 1] + d / K((a.y + b.y) / 2)); }
    return {p, s, len:s[s.length - 1], closed};
  }
  function at(path, d) {
    if (path.closed) d = ((d % path.len) + path.len) % path.len; else d = clamp(d, 0, path.len);
    let lo = 0, hi = path.s.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (path.s[m] <= d) lo = m; else hi = m; }
    const a = path.p[lo], b = path.p[hi], t = (d - path.s[lo]) / ((path.s[hi] - path.s[lo]) || 1);
    return {x:lerp(a.x, b.x, t), y:lerp(a.y, b.y, t), v:lerp(a.v, b.v, t)};
  }
  function nearestS(path, x, y) { let best = 0, bd = 1e9; for (let d = 0; d < path.len; d += 2) { const q = at(path, d); const e = Math.hypot(q.x - x, q.y - y); if (e < bd) { bd = e; best = d; } } return best; }
  const LOOP = mkPath(P.TR, true);
  const SHP = mkPath(P.SH.map((q, i) => [q[0], q[1], i === 0 ? 0 : 1]), false);
  const ROAD = mkPath(P.ROAD, false);

  // ---------- box renderer ----------
  const lightsQ = []; // window glows drawn after grade
  function drawBox(F, B, L, opt) {
    const dx = F.x - B.x, dy = F.y - B.y, dl = Math.hypot(dx, dy) || 1;
    let gx = dx / dl, gy = dy / dl / TILT; const gn = Math.hypot(gx, gy); gx /= gn; gy /= gn;
    const k = K((F.y + B.y) / 2), half = opt.w / 2 * k, hgt = opt.h * k;
    let lx = -gy, ly = gx; if (ly < 0) { lx = -lx; ly = -ly; }
    const LX = lx * half, LY = ly * half * TILT;
    const Bn = {x:B.x + LX, y:B.y + LY}, Fn = {x:F.x + LX, y:F.y + LY}, Bf = {x:B.x - LX, y:B.y - LY}, Ff = {x:F.x - LX, y:F.y - LY};
    const up = -hgt;
    const poly = (pts, c) => { g.fillStyle = c; g.beginPath(); g.moveTo(pts[0].x, pts[0].y); for (const q of pts.slice(1)) g.lineTo(q.x, q.y); g.closePath(); g.fill(); };
    const U = q => ({x:q.x, y:q.y + up});
    // shadow
    g.fillStyle = 'rgba(10,8,12,.35)'; g.beginPath(); g.moveTo(Bn.x + 2, Bn.y + 3); g.lineTo(Fn.x + 2, Fn.y + 3); g.lineTo(Ff.x, Ff.y); g.lineTo(Bf.x, Bf.y); g.fill();
    const frontVis = gy > 0;
    const endN = frontVis ? [Fn, Ff] : [Bn, Bf];
    poly([endN[0], endN[1], U(endN[1]), U(endN[0])], opt.end);
    // near side in its own frame
    g.save(); g.transform((Fn.x - Bn.x) / L, (Fn.y - Bn.y) / L, 0, up / opt.h, Bn.x, Bn.y);
    opt.side(L, opt.h);
    g.restore();
    poly([U(Bn), U(Fn), U(Ff), U(Bf)], opt.roof);
    { const m1 = {x:(Bn.x + Bf.x) / 2, y:(Bn.y + Bf.y) / 2 + up - 1}, m2 = {x:(Fn.x + Ff.x) / 2, y:(Fn.y + Ff.y) / 2 + up - 1}; g.strokeStyle = 'rgba(200,205,210,.25)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(m1.x, m1.y); g.lineTo(m2.x, m2.y); g.stroke(); }
    // roof edge highlight
    g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 1; g.beginPath(); g.moveTo(U(Bn).x, U(Bn).y); g.lineTo(U(Fn).x, U(Fn).y); g.stroke();
    if (opt.after) opt.after({Bn, Fn, Bf, Ff, U, k, gx, gy, hgt});
    return {Bn, Fn, U, k};
  }
  function windowsRow(L, h, x0, x1, n, y0, y1, frame, lit) {
    const w = (x1 - x0) / n;
    for (let i = 0; i < n; i++) { g.fillStyle = frame; g.fillRect(x0 + i * w, y0 - 1, w, y1 - y0 + 2); g.fillStyle = lit; g.fillRect(x0 + i * w + w * .18, y0, w * .64, y1 - y0); }
  }
  // collect window positions in world for glow

  const COACH = { w:15, h:20,
    end:'#26302b', roof:'#5d6264',
    side(L, h) {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#132a20'); gr.addColorStop(1, '#2b5241');
      g.fillStyle = gr; g.fillRect(0, 0, L, h);                      // green body, lighter near the roof
      g.fillStyle = '#cfc7b0'; g.fillRect(0, h * .42, L, h * .36);   // cream window band
      g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, h * .42, L, h * .06);
      g.fillStyle = '#0e1c15'; g.fillRect(0, 0, L, h * .15);          // underframe
      g.fillStyle = '#0a0a0a'; g.fillRect(L * .08, -1.5, L * .16, h * .16); g.fillRect(L * .76, -1.5, L * .16, h * .16); // bogies
      windowsRow(L, h, L * .1, L * .9, 7, h * .5, h * .72, '#2f342e', winLit());
      g.fillStyle = '#2b3a33'; g.fillRect(L * .02, h * .2, L * .05, h * .58); g.fillRect(L * .93, h * .2, L * .05, h * .58); // doors
      g.fillStyle = 'rgba(0,0,0,.25)'; for (const x of [.08, .92]) g.fillRect(L * x, h * .18, 1, h * .62);
      g.fillStyle = '#b8953f'; g.fillRect(0, h * .4, L, h * .025);
      g.fillStyle = 'rgba(255,255,255,.2)'; g.fillRect(0, h * .95, L, h * .05);
    } };
  const ENGINE = { w:15, h:23, end:'#16271d', roof:'#232826',
    side(L, h) {
      g.fillStyle = '#183526'; g.fillRect(0, 0, L, h * .62);          // boiler body
      g.fillStyle = '#183526'; g.fillRect(0, 0, L * .38, h);          // cab at back
      g.fillStyle = '#0d1c14'; g.fillRect(0, 0, L, h * .16);
      g.fillStyle = '#111'; for (const x of [.14, .36, .58, .8]) { g.beginPath(); g.arc(L * x, h * .13, h * .13, 0, 7); g.fill(); }
      g.fillStyle = '#7b2a22'; g.fillRect(0, h * .16, L, h * .04);
      g.fillStyle = winLit(); g.fillRect(L * .08, h * .66, L * .22, h * .2);
      g.fillStyle = '#c9a24a'; g.fillRect(L * .4, h * .5, L * .55, h * .03);
    } };
  const RAILCAR = { w:14, h:19, end:'#4b1d1a', roof:'#6b6a68',
    side(L, h) {
      g.fillStyle = '#7a2a24'; g.fillRect(0, 0, L, h);
      g.fillStyle = '#e4dcc6'; g.fillRect(0, h * .44, L, h * .34);
      g.fillStyle = '#2a1512'; g.fillRect(0, 0, L, h * .14);
      g.fillStyle = '#111'; g.fillRect(L * .1, -2, L * .14, h * .14); g.fillRect(L * .76, -2, L * .14, h * .14);
      windowsRow(L, h, L * .06, L * .94, 6, h * .5, h * .72, '#40362e', winLit());
    } };
  let litBoost = 0;
  function winLit() { const n = cur.night; const b = .55 + .45 * n + litBoost * .3; return `rgb(${Math.round(lerp(200, 255, b))},${Math.round(lerp(170, 214, b))},${Math.round(lerp(110, 130, b))})`; }

  // ---------- trains ----------
  const TRAIN = [{t:'E', L:80, gap:6}, {t:'C', L:102, gap:6}, {t:'C', L:102, gap:6}, {t:'C', L:102, gap:6}];
  const trainLen = TRAIN.reduce((a, c) => a + c.L + c.gap, 0);
  const STOP_L = nearestS(LOOP, 250, 424);                  // left station centre
  const CROSS_S = nearestS(LOOP, 748, 626);
  const TUNNEL_S = nearestS(LOOP, 1010, 210);
  const train = {s:STOP_L + 360, v:0, state:'run', wait:0, target:null, extra:0};
  const MAXV = 62, ACC = 14;
  function headTargetForStop(center) { return center + trainLen / 2; }
  const stops = [{s:headTargetForStop(STOP_L), kind:'station'}, {s:TUNNEL_S, kind:'tunnel'}];
  function modDist(a, b, len) { return ((b - a) % len + len) % len; }

  const shuttle = {s:0, v:0, dir:1, state:'wait', wait:rnd(4, 10)};
  const SH_STOP = nearestS(SHP, 1235, 420);
  const SH_CARS = [{L:84, gap:3}, {L:84, gap:3}];

  // ---------- road traffic ----------
  const cars = [];
  let carT = 1, crossing = {closed:0, arm:0};
  const CAR_S = nearestS(ROAD, 748, 626);
  function spawnCar() {
    const down = Math.random() < .55;
    const spr = down ? ['car_grey', 'car_blue1', 'car_blue2'][Math.floor(Math.random() * 3)] : 'car_red';
    const hue = Math.random() < .4 ? Math.floor(rnd(0, 360)) : 0;
    cars.push({down, spr, hue, s:down ? -20 : ROAD.len + 20, v:rnd(34, 46), vmax:rnd(34, 46)});
  }

  // ---------- ferry ----------
  const ferry = {x:P.FE[0][0], y:P.FE[0][1], to:1, wait:rnd(3, 8), dir:1, moving:false};

  // ---------- time of day ----------
  const GR = {
    dawn:  {m:[228,212,236], ma:.28, sc:[0,0,0], sa:0,   night:.15},
    day:   {m:[255,255,255], ma:0,   sc:[255,236,210], sa:.10, night:0},
    dusk:  {m:[255,255,255], ma:0,   sc:[0,0,0], sa:0,   night:.35},
    night: {m:[58,72,138],   ma:.78, sc:[0,0,0], sa:0,   night:1}};
  let tod = ctx.timeOfDay in GR ? ctx.timeOfDay : 'dusk'; let started = false, stopped = false;
  const cur = {m:GR[tod].m.slice(), ma:GR[tod].ma, sc:GR[tod].sc.slice(), sa:GR[tod].sa, night:GR[tod].night};
  const unsub = ctx.subscribe ? ctx.subscribe(({ timeOfDay }) => { tod = timeOfDay in GR ? timeOfDay : 'dusk'; if (ctx.reducedMotion && started) { const t0 = GR[tod]; cur.m = t0.m.slice(); cur.sc = t0.sc.slice(); cur.ma = t0.ma; cur.sa = t0.sa; cur.night = t0.night; frame(); } }) : null;

  // ---------- pointer (hover) ----------
  const ZL = [[100,298],[330,278],[585,398],[565,452],[240,446],[84,360]];
  const ZR = [[1085,328],[1295,330],[1370,420],[1335,468],[1140,412]];
  const inPoly = (pt, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > pt.y) !== (b[1] > pt.y) && pt.x < (b[0] - a[0]) * (pt.y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
  let hoverL = 0, hoverR = 0, ptr = null;
  const offPtr = ctx.onPointer ? ctx.onPointer(e => { if (e.type !== 'move') return; const r = cv.getBoundingClientRect(), sc = Math.max(r.width / W, r.height / H); ptr = {x:(e.x - r.left - (r.width - W * sc) / 2) / sc / S, y:(e.y - r.top - (r.height - H * sc) / 2) / sc / S}; }) : null;

  // ---------- extras ----------
  const twinkle = (P.LIGHTS || []).map(p => ({x:p[0], y:p[1], ph:rnd(0, 6), sp:rnd(.5, 2.5)}));
  const parts = [];
  let T = 0, waterOff = null, streak = null, WREG = [];

  function prep() {
    // streak texture for waterfalls
    streak = document.createElement('canvas'); streak.width = 128; streak.height = 256;
    const s = streak.getContext('2d'); s.fillStyle = '#000'; s.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 220; i++) { const x = Math.random() * 128, y = Math.random() * 256, l = rnd(10, 60); const a = rnd(.15, .7); s.fillStyle = `rgba(255,255,255,${a})`; s.fillRect(x, y, rnd(1, 2.5), l); s.fillRect(x, y - 256, rnd(1, 2), l); }
    waterOff = document.createElement('canvas'); waterOff.width = 330; waterOff.height = 230;
    WREG = [[img.falls, 222, 25, 90, 150, 90, .55], [img.falls, 1150, 640, 160, 225, 70, .5], [img.rapids, 478, 288, 325, 145, 30, .35]];
  }

  // ---------- step ----------
  function step(dt) {
    T += dt;
    const tg = GR[tod], kk = 1 - Math.exp(-dt / 6);
    for (let i = 0; i < 3; i++) { cur.m[i] = lerp(cur.m[i], tg.m[i], kk); cur.sc[i] = lerp(cur.sc[i], tg.sc[i], kk); }
    cur.ma = lerp(cur.ma, tg.ma, kk); cur.sa = lerp(cur.sa, tg.sa, kk); cur.night = lerp(cur.night, tg.night, kk);
    const hl = ptr && inPoly(ptr, ZL), hr = ptr && inPoly(ptr, ZR);
    hoverL = clamp(hoverL + (hl ? dt * 2 : -dt), 0, 1); hoverR = clamp(hoverR + (hr ? dt * 2 : -dt), 0, 1);
    if (hl) train.extra = Math.max(train.extra, 1);
    if (hr) shuttle.extra = 1;

    // main train
    if (train.state === 'wait') {
      train.wait -= dt; if (hl && train.waitKind === 'station') train.wait = Math.max(train.wait, 4);
      if (train.wait <= 0) { train.state = 'run'; train.passed = train.waitKind; }
    } else {
      // next stop ahead
      let nxt = null, nd = 1e9;
      for (const st of stops) { const d = modDist(train.s, st.s, LOOP.len); if (d < nd && !(d < 1 && train.passed === st.kind)) { nd = d; nxt = st; } }
      const brake = train.v * train.v / (2 * ACC) + 2;
      if (nd < brake + 1) train.v = Math.max(4, train.v - ACC * 1.15 * dt); else train.v = Math.min(MAXV, train.v + ACC * dt);
      const adv = train.v * dt;
      if (nd <= adv || nd < .6) {
        train.s = nxt.s; train.v = 0; train.state = 'wait'; train.waitKind = nxt.kind;
        train.wait = nxt.kind === 'station' ? (12 + (train.extra ? 14 : 0)) : rnd(6, 22);
        train.extra = 0; train.passed = null;
      } else { train.s += adv; if (nd > 30) train.passed = null; }
    }
    // crossing control
    const headToCross = modDist(train.s, CROSS_S, LOOP.len);
    const near = headToCross < 220 || modDist(CROSS_S, train.s, LOOP.len) < trainLen + 25;
    crossing.closed = near ? 1 : 0;
    crossing.arm = clamp(crossing.arm + (near ? dt / 3.5 : -dt / 3), 0, 1);

    // shuttle
    if (shuttle.state === 'wait') { shuttle.wait -= dt; if (hr && shuttle.atStop) shuttle.wait = Math.max(shuttle.wait, 3); if (shuttle.wait <= 0) { shuttle.state = 'run'; shuttle.atStop = false; } }
    else {
      const len = SH_CARS.reduce((a, c) => a + c.L + c.gap, 0);
      const stopHead = SH_STOP + len / 2;
      const endS = shuttle.dir > 0 ? SHP.len + len + 10 : -5;
      const target = !shuttle.servedStop ? stopHead : endS;
      const d = (target - shuttle.s) * shuttle.dir;
      const brake = shuttle.v * shuttle.v / (2 * ACC) + 2;
      if (!shuttle.servedStop && d < brake) shuttle.v = Math.max(3, shuttle.v - ACC * 1.2 * dt); else shuttle.v = Math.min(44, shuttle.v + ACC * dt);
      const adv = shuttle.v * dt;
      if (d <= adv) {
        shuttle.s = target; shuttle.v = 0; shuttle.state = 'wait';
        if (!shuttle.servedStop) { shuttle.servedStop = true; shuttle.atStop = true; shuttle.wait = 10 + (shuttle.extra ? 14 : 0); shuttle.extra = 0; }
        else { shuttle.servedStop = false; shuttle.dir *= -1; shuttle.wait = rnd(14, 30); }
      } else shuttle.s += adv * shuttle.dir;
    }

    // cars
    carT -= dt; if (carT <= 0 && cars.length < 6) { spawnCar(); carT = rnd(3, 9); }
    for (let i = cars.length - 1; i >= 0; i--) {
      const c = cars[i]; const dir = c.down ? 1 : -1;
      let lim = c.vmax;
      // stop line at crossing
      const stopAt = c.down ? CAR_S - 46 : CAR_S + 46;
      const toStop = (stopAt - c.s) * dir;
      if (crossing.closed && toStop > 0 && toStop < 90) lim = Math.min(lim, Math.max(0, (toStop - 2) * .9));
      // keep distance to car ahead in same direction
      for (const o of cars) if (o !== c && o.down === c.down) { const gap = (o.s - c.s) * dir; if (gap > 0 && gap < 70) lim = Math.min(lim, Math.max(0, (gap - 46) * 1.2)); }
      c.v = lerp(c.v, lim, 1 - Math.exp(-dt * 2.5));
      c.s += c.v * dt * dir;
      if (c.s < -60 || c.s > ROAD.len + 60) cars.splice(i, 1);
    }

    // ferry
    if (!ferry.moving) { ferry.wait -= dt; if (ferry.wait <= 0) { ferry.moving = true; } }
    else {
      const tgt = P.FE[ferry.to], dx = tgt[0] - ferry.x, dy = tgt[1] - ferry.y, d = Math.hypot(dx, dy);
      const sp = Math.min(16, d * .5 + 3) * dt; ferry.dir = dx > 0 ? 1 : -1;
      if (d < .5) { ferry.moving = false; ferry.wait = rnd(10, 18); ferry.to = 1 - ferry.to; }
      else { ferry.x += dx / d * sp; ferry.y += dy / d * sp; if (Math.random() < dt * 6) parts.push({x:ferry.x - ferry.dir * 60 + rnd(-4, 4), y:ferry.y + 22 + rnd(-3, 3), vx:-ferry.dir * 4, vy:0, life:0, max:rnd(1.5, 2.5), c:'230,240,255', s:rnd(2, 4), wake:1}); }
    }
    if (Math.random() < dt * 3) parts.push({x:ferry.x + (ferry.dir < 0 ? -28 : 28), y:ferry.y - 34, vx:rnd(-3, 3) - 4, vy:rnd(-12, -8), life:0, max:rnd(2, 3), c:'210,205,215', s:rnd(3, 5), smoke:1});
    // engine smoke while running in view
    if (train.state === 'run' || Math.random() < .3) {
      const h = at(LOOP, train.s - 14);
      if (h.v > .5 && Math.random() < dt * (train.v > 5 ? 9 : 2)) parts.push({x:h.x, y:h.y - 24 * K(h.y), vx:rnd(-4, 4), vy:rnd(-14, -9), life:0, max:rnd(1.5, 2.6), c:'200,198,205', s:rnd(3, 5) * K(h.y), smoke:1});
    }
    for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.life += dt; if (p.life > p.max) { parts.splice(i, 1); continue; } p.x += p.vx * dt; p.y += p.vy * dt; if (p.smoke) p.s += dt * 3; }
  }

  // ---------- draw ----------
  function drawTrainOn(path, sHead, cars, model, dir) {
    let d = sHead; const drawn = [];
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i], F = at(path, d), B = at(path, d - c.L * dir);
      const vm = (F.v + B.v) / 2;
      if (vm > .02 && Math.hypot(F.x - B.x, F.y - B.y) > 2) drawn.push({F, B, c, vis:vm, i});
      d -= (c.L + c.gap) * dir;
    }
    // paint far-to-near (smaller y first)
    drawn.sort((a, b) => (a.F.y + a.B.y) - (b.F.y + b.B.y));
    for (const o of drawn) {
      g.save(); { const a = clamp((o.vis - .38) / .24, 0, 1); g.globalAlpha = a * a * (3 - 2 * a); }
      const m = model(o);
      const r = drawBox(dir > 0 ? o.F : o.B, dir > 0 ? o.B : o.F, o.c.L, m);
      g.restore();
      // window glow points
      if (o.vis > .5) for (let w = 0; w < 4; w++) { const t = (w + .5) / 4; lightsQ.push({x:lerp(r.Bn.x, r.Fn.x, t), y:lerp(r.Bn.y, r.Fn.y, t) - 12 * r.k, r:11 * r.k}); }
    }
    return drawn;
  }

  function frame() {
    lightsQ.length = 0;
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    g.drawImage(img.plate, 0, 0, W, H);
    g.setTransform(S, 0, 0, S, 0, 0);
    // waterfalls + rapids shimmer
    const wctx = waterOff.getContext('2d');
    for (const [mask, rx, ry, rw, rh, sp, a] of WREG) {
      wctx.globalCompositeOperation = 'source-over'; wctx.clearRect(0, 0, rw, rh);
      const off = (T * sp) % 256;
      for (let y = -256; y < rh; y += 256) for (let x = 0; x < rw; x += 128) wctx.drawImage(streak, x, y + off);
      wctx.globalCompositeOperation = 'destination-in'; wctx.drawImage(mask, rx, ry, rw, rh, 0, 0, rw, rh);
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = a; g.drawImage(waterOff, 0, 0, rw, rh, rx, ry, rw, rh); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    }
    // water sparkle
    for (let i = 0; i < 26; i++) { const t = T * .7 + i * 1.7; const ph = t % 1; const idx = Math.floor(t) * 7919 + i * 104729; const x = (idx * 13) % 1536, y = 300 + (idx * 7) % 560; if (WATER && WATER[Math.floor(y / 3.2) * 480 + Math.floor(x / 3.2)]) { g.fillStyle = `rgba(255,236,190,${Math.sin(ph * Math.PI) * .6})`; g.fillRect(x, y, 3, 1.5); } }
    // ferry (+ wake under)
    for (const p of parts) if (p.wake) { const a = 1 - p.life / p.max; g.fillStyle = `rgba(${p.c},${a * .5})`; g.fillRect(p.x - p.s, p.y, p.s * 2 + p.life * 6, 1.6); }
    { const f = img.ferry, bob = Math.sin(T * 1.3) * 1.2; g.save(); g.translate(ferry.x, ferry.y + bob); if (ferry.dir > 0) g.scale(-1, 1); g.drawImage(f, -f.width / 2, -f.height / 2); g.restore();
      g.globalCompositeOperation = 'lighter'; for (let i = 0; i < 5; i++) { g.fillStyle = `rgba(255,200,120,${.10 + .05 * Math.sin(T * 3 + i)})`; g.fillRect(ferry.x - 40 + i * 18, ferry.y + 30 + Math.sin(T * 2 + i) * 2, 10, 2); } g.globalCompositeOperation = 'source-over'; }
    // shuttle (right station) — behind the main loop's near parts
    drawTrainOn(SHP, shuttle.s, SH_CARS, () => RAILCAR, 1);
    // main train
    const TT = drawTrainOn(LOOP, train.s, TRAIN, o => o.c.t === 'E' ? ENGINE : COACH, 1);
    // headlamp
    { const h = at(LOOP, train.s), k = K(h.y); if (h.v > .3) { lightsQ.push({x:h.x, y:h.y - 7 * k, r:22 * k, hot:1}); } }
    // road cars
    const drawC = cars.slice().sort((a, b) => at(ROAD, a.s).y - at(ROAD, b.s).y);
    for (const c of drawC) {
      const q = at(ROAD, c.s), im = img[c.spr], oy = {car_grey:584, car_red:690, car_blue1:705, car_blue2:735}[c.spr];
      const sc = K(q.y) / K(oy), lat = c.down ? -9 : 9;
      g.save(); g.translate(q.x + lat * .5, q.y + lat * .4); g.scale(sc, sc); if (c.hue) g.filter = `hue-rotate(${c.hue}deg)`;
      g.drawImage(im, -im.width / 2, -im.height / 2); g.restore();
      if (c.down) lightsQ.push({x:q.x + 22 * sc, y:q.y + 10 * sc, r:18 * sc, car:1}); else lightsQ.push({x:q.x + 20 * sc, y:q.y + 12 * sc, r:12 * sc, tail:1});
    }
    // level-crossing barrier arm
    { const px = 712, py = 596, ang = lerp(-1.35, .41, crossing.arm), Lm = 132;
      g.save(); g.translate(px, py); g.rotate(ang);
      g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(2, 2, Lm, 4.5);
      for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#f2eee6' : '#d23a2c'; g.fillRect(i * Lm / 8, -2.2, Lm / 8 + .5, 4.4); }
      g.fillStyle = '#333'; g.beginPath(); g.arc(0, 0, 4, 0, 7); g.fill(); g.restore(); }
    // particles (smoke)
    for (const p of parts) if (!p.wake) { const a = (1 - p.life / p.max) * .4; g.fillStyle = `rgba(${p.c},${a})`; g.beginPath(); g.arc(p.x, p.y, p.s, 0, 7); g.fill(); }

    // ---------- grade ----------
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (cur.ma > .01) { g.globalCompositeOperation = 'multiply'; g.fillStyle = `rgba(${cur.m.map(Math.round)},${cur.ma})`; g.fillRect(0, 0, W, H); }
    if (cur.sa > .01) { g.globalCompositeOperation = 'screen'; g.fillStyle = `rgba(${cur.sc.map(Math.round)},${cur.sa})`; g.fillRect(0, 0, W, H); }
    g.globalCompositeOperation = 'lighter';
    // restore painted lights at night + twinkle
    if (cur.night > .3) { g.globalAlpha = (cur.night - .3) * .9; g.drawImage(img.lights, 0, 0, W, H); g.globalAlpha = 1; }
    g.setTransform(S, 0, 0, S, 0, 0);
    for (const t of twinkle) { const a = (.15 + .55 * cur.night) * Math.max(0, Math.sin(T * t.sp + t.ph)) ** 6; if (a > .02) { g.fillStyle = `rgba(255,214,150,${a})`; g.fillRect(t.x - 1, t.y - 1, 3, 3); } }
    // crossing lamps blink
    if (crossing.closed) { const on = Math.floor(T * 2.2) % 2; for (const [x, y, s] of [[700, 585, on], [831, 622, on], [844, 626, 1 - on]]) if (s) { const gr = g.createRadialGradient(x, y, 0, x, y, 16); gr.addColorStop(0, 'rgba(255,60,40,.85)'); gr.addColorStop(1, 'rgba(255,40,20,0)'); g.fillStyle = gr; g.fillRect(x - 16, y - 16, 32, 32); } }
    // station lamps on hover
    for (const [hv, lamps] of [[hoverL, [[177, 276], [137, 300], [272, 304], [348, 340]]], [hoverR, [[1182, 357], [1355, 386], [1235, 395]]]]) if (hv > .01) for (const [x, y] of lamps) { const gr = g.createRadialGradient(x, y, 0, x, y, 40); gr.addColorStop(0, `rgba(255,210,140,${.45 * hv})`); gr.addColorStop(1, 'rgba(255,190,110,0)'); g.fillStyle = gr; g.fillRect(x - 40, y - 40, 80, 80); }
    // window / lamp glows
    const glowK = .25 + .75 * cur.night;
    const trainLit = 1 + (train.state === 'wait' && train.waitKind === 'station' ? hoverL * 1.2 : 0);
    for (const q of lightsQ) {
      const a = q.hot ? .9 * glowK + .2 : q.car ? .7 * glowK : q.tail ? .6 * glowK : .32 * glowK * trainLit;
      const col = q.tail ? '255,60,40' : q.hot || q.car ? '255,236,190' : '255,190,110';
      const gr = g.createRadialGradient(q.x, q.y, 0, q.x, q.y, q.r); gr.addColorStop(0, `rgba(${col},${Math.min(1, a)})`); gr.addColorStop(1, `rgba(${col},0)`); g.fillStyle = gr; g.fillRect(q.x - q.r, q.y - q.r, q.r * 2, q.r * 2);
    }
    g.globalCompositeOperation = 'source-over'; g.setTransform(1, 0, 0, 1, 0, 0);
  }

  // ---------- loop / load ----------
  let last = performance.now(), raf = 0;
  function loop(now) { if (stopped) return; const dt = Math.min(.05, (now - last) / 1000); last = now; step(dt); frame(); raf = requestAnimationFrame(loop); }
  const names = Object.keys(A); let loaded = 0;
  for (const n of names) { const im = new Image(); im.onload = () => { if (++loaded === names.length && !stopped) start(); }; im.onerror = () => ctx.ready && ctx.ready(); im.src = A[n]; img[n] = im; }
  function start() {
    started = true;
    prep();
    const wc = document.createElement('canvas'); wc.width = 480; wc.height = 270; const wx = wc.getContext('2d'); wx.drawImage(img.water, 0, 0);
    const d = wx.getImageData(0, 0, 480, 270).data; WATER = new Uint8Array(480 * 270); for (let i = 0; i < WATER.length; i++) WATER[i] = d[i * 4] > 128 ? 1 : 0;
    for (let i = 0; i < 4; i++) { spawnCar(); cars[cars.length - 1].s = cars[cars.length - 1].down ? i * 90 : ROAD.len - i * 90; }
    if (ctx.reducedMotion) { train.s = STOP_L + trainLen / 2 + 400; for (let i = 0; i < 20; i++) step(.05); frame(); ctx.ready && ctx.ready(); return; }
    for (let i = 0; i < 40; i++) step(.05);
    last = performance.now(); raf = requestAnimationFrame(loop); ctx.ready && ctx.ready();
  }
  return { unmount() { stopped = true; cancelAnimationFrame(raf); offPtr && offPtr(); unsub && unsub(); container.replaceChildren(); } };
}
