// Island Colony — a small pixel-art island that lives and grows on its own.
// Picture + code: the painting (AI illustration, villagers and windmill sails cut out)
// with code layers on top:
//   - five villagers walk the painted paths with jobs (woodcutter, gatherer, dock worker,
//     wanderer, builder) and go home at night;
//   - the windmill turns with a varying wind, a second fishing boat sails in and out,
//     clouds + shadows drift, gulls fly, sea glints, foam washes the shore, fire smoke;
//   - the island grows: five hut spots are built one after another in stages
//     (stakes, scaffold, walls and roof) while the builder works.
// Time of day: dawn / day (= the painting) / dusk / night grades with window and fire glow.
// Live wallpaper (hover only): rest the mouse ~1 s near an empty spot → a flag goes in
// and that spot is built next.
// reducedMotion: one still frame (redrawn when the time of day changes).
import photoUrl from './island-colony.jpg'
import foamUrl from './ic-foam.png'
import seaUrl from './ic-seamask.png'
import sailsUrl from './ic-sails.png'
import hutUrl from './ic-hut.png'
import boatUrl from './ic-boat.png'
import cloudUrl from './ic-cloud.png'
import vA from './ic-villager-a.png'
import vC from './ic-villager-c.png'
import vF from './ic-villager-f.png'
import vH from './ic-villager-h.png'
import vJ from './ic-villager-j.png'

const ASSETS = { plate: photoUrl, foam: foamUrl, seamask: seaUrl, sails: sailsUrl, hut: hutUrl, boat: boatUrl, cloud: cloudUrl, spr_A: vA, spr_C: vC, spr_F: vF, spr_H: vH, spr_J: vJ }

export function mount(container, ctx) {
  const A = ASSETS; let SEA = null;
  const W = 1920, H = 1080, S = 1.25;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block';
  container.replaceChildren(cv);
  const g = cv.getContext('2d');
  const img = {}; let loaded = 0, stopped = false; const names = Object.keys(A);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  // ---------- walk graph ----------
  const N = {tl_door:[585,250],p1:[650,262],jn:[722,318],wm_path:[790,225],wm_door:[845,240],orchard:[690,250],p2:[660,375],left_door:[470,425],fire:[398,440],p3:[600,480],p4:[530,505],dock0:[455,545],dock1:[370,600],dock2:[255,628],beach0:[650,560],beach1:[700,630],S2:[790,684],S5:[905,724],crates:[980,660],fieldN:[820,335],mid_door:[965,355],p5:[1060,420],site:[1150,415],logs:[1270,420],east:[1300,480],H:[1368,540],S3:[1440,602],p6:[1030,520],br_door:[1115,600],p7:[980,580],S1:[258,520],S4:[560,604],p8:[330,470]};
  const E = [['tl_door','p1'],['p1','orchard'],['p1','jn'],['jn','wm_path'],['wm_path','wm_door'],['jn','p2'],['p2','left_door'],['left_door','fire'],['fire','p8'],['p8','S1'],['p2','p3'],['p3','p4'],['p4','dock0'],['dock0','dock1'],['dock1','dock2'],['p3','beach0'],['beach0','beach1'],['beach1','S2'],['S2','S5'],['S5','crates'],['beach0','S4'],['jn','fieldN'],['fieldN','mid_door'],['mid_door','p5'],['p5','site'],['site','logs'],['logs','east'],['east','H'],['H','S3'],['p5','p6'],['p6','br_door'],['p6','p7'],['p7','crates'],['p7','beach1']];
  const adj = {}; for (const k in N) adj[k] = [];
  for (const [a, b] of E) { adj[a].push(b); adj[b].push(a); }
  const dist = (a, b) => Math.hypot(N[a][0] - N[b][0], N[a][1] - N[b][1]);
  function route(from, to) {
    const d = {}, prev = {}, q = new Set(Object.keys(N));
    for (const k in N) d[k] = Infinity; d[from] = 0;
    while (q.size) {
      let u = null; for (const k of q) if (u === null || d[k] < d[u]) u = k;
      q.delete(u); if (u === to) break;
      for (const v of adj[u]) { const nd = d[u] + dist(u, v); if (nd < d[v]) { d[v] = nd; prev[v] = u; } }
    }
    const p = [to]; while (p[0] !== from && prev[p[0]]) p.unshift(prev[p[0]]);
    return p;
  }

  // ---------- build slots ----------
  const SLOTS = [
    {id:'S2', x:800, y:668, s:.8}, {id:'S4', x:560, y:590, s:.7}, {id:'S5', x:920, y:712, s:.75},
    {id:'S1', x:255, y:505, s:.7}, {id:'S3', x:1452, y:588, s:.65}];
  for (const sl of SLOTS) { sl.state = 'free'; sl.p = 0; sl.flip = Math.random() < .5; sl.done = 0; }
  let activeSlot = null, queued = null, nextAuto = 20;

  // ---------- villagers ----------
  const SPR = {A:[729,315],C:[601,507],F:[1063,437],H:[1367,539],J:[358,598]};
  const V = [
    {k:'A', home:'tl_door', at:'jn', job:'wood'},
    {k:'C', home:'left_door', at:'p3', job:'wander', spots:['fire','p3','fieldN','beach0','crates','p2','wm_door']},
    {k:'F', home:'mid_door', at:'p5', job:'gather'},
    {k:'H', home:'br_door', at:'H', job:'build', spots:['H','S3','east','logs','p6']},
    {k:'J', home:'left_door', at:'dock1', job:'dock', spots:['dock1','dock2','dock0','crates','beach1']}];
  for (const v of V) { v.x = N[v.at][0]; v.y = N[v.at][1]; v.path = []; v.state = 'idle'; v.t = rnd(1, 4); v.face = 1; v.phase = rnd(0, 6); v.inside = false; v.alpha = 1; v.task = null; }

  const parts = []; // particles {x,y,vx,vy,life,max,c,s,type}
  function puff(x, y, n, c, spread = 6, up = -10) { for (let i = 0; i < n; i++) parts.push({x:x + rnd(-spread, spread), y:y + rnd(-3, 3), vx:rnd(-8, 8), vy:rnd(up - 6, up + 4), life:0, max:rnd(.6, 1.3), c, s:rnd(2, 4)}); }

  // ---------- time of day ----------
  const GRADES = {
    dawn:  {mul:[255,214,206], ma:.32, glow:.35, sky:[255,190,170], stars:0},
    day:   {mul:[255,252,245], ma:.0,  glow:0,   sky:[255,255,255], stars:0},
    dusk:  {mul:[255,160,110], ma:.38, glow:.6,  sky:[255,150,90],  stars:0},
    night: {mul:[40,58,120],   ma:.9, glow:1,   sky:[60,80,150],   stars:1}};
  let tod = ctx.timeOfDay || 'day';
  const cur = Object.assign({}, GRADES[tod]); cur.mul = GRADES[tod].mul.slice();
  const unsub = ctx.subscribe ? ctx.subscribe(({ timeOfDay }) => { tod = timeOfDay; if (ctx.reducedMotion && loaded === names.length) { Object.assign(cur, GRADES[tod]); cur.mul = GRADES[tod].mul.slice(); frame(); } }) : null;
  const isNight = () => tod === 'night';

  const LIGHTS = [[590,222,'d'],[530,205,'w'],[468,405,'d'],[552,392,'w'],[972,342,'d'],[1044,332,'w'],[1117,585,'d'],[1205,565,'w'],[858,150,'w'],[1185,370,'d']];

  // ---------- pointer (hover only) ----------
  let ptr = null, ptrStill = 0, ptrUsed = false;
  const offPtr = ctx.onPointer ? ctx.onPointer(e => {
    const r = cv.getBoundingClientRect(), sc = Math.max(r.width / W, r.height / H);
    const nx = ((e.x - r.left - (r.width - W * sc) / 2) / sc) / S, ny = ((e.y - r.top - (r.height - H * sc) / 2) / sc) / S;
    if (e.type === 'move') {
      if (!ptr || Math.hypot(nx - ptr.x, ny - ptr.y) > 6) { ptrStill = 0; ptrUsed = false; }
      ptr = {x:nx, y:ny};
    }
  }) : null;

  // ---------- helpers ----------
  function freeSlotNear(x, y, r) {
    let best = null, bd = r;
    for (const sl of SLOTS) if (sl.state === 'free') { const d = Math.hypot(sl.x - x, sl.y - 30 - y); if (d < bd) { bd = d; best = sl; } }
    return best;
  }
  function startBuild(sl) { sl.state = 'building'; sl.p = 0; activeSlot = sl; puff(sl.x, sl.y - 5, 10, '210,180,130', 30, -6); }
  function goTo(v, node) { v.path = route(nearestNode(v.x, v.y), node).map(k => N[k]); v.state = 'walk'; v.dest = node; }
  function nearestNode(x, y) { let b = null, bd = 1e9; for (const k in N) { const d = Math.hypot(N[k][0] - x, N[k][1] - y); if (d < bd) { bd = d; b = k; } } return b; }

  function think(v) {
    if (isNight()) { if (!v.inside) { if (v.dest !== v.home || v.state !== 'walk') { goTo(v, v.home); v.task = 'home'; } } return; }
    if (v.inside) { v.inside = false; v.alpha = 0; }
    const pick = a => a[Math.floor(Math.random() * a.length)];
    if (v.job === 'wood') {
      if (v.task === 'chop') { const tgt = activeSlot ? activeSlot.id : 'logs'; goTo(v, tgt); v.task = 'deliver'; }
      else { goTo(v, Math.random() < .6 ? 'orchard' : 'east'); v.task = 'chop'; }
    } else if (v.job === 'gather') {
      if (v.task === 'pick') { goTo(v, 'crates'); v.task = 'drop'; } else { goTo(v, pick(['fieldN','p6','p5'])); v.task = 'pick'; }
    } else if (v.job === 'build' && activeSlot) { goTo(v, activeSlot.id); v.task = 'hammer'; }
    else { goTo(v, pick(v.spots)); v.task = 'look'; }
  }
  function arrive(v) {
    v.state = 'work';
    if (v.task === 'home') { v.inside = true; v.state = 'inside'; v.t = 9999; return; }
    if (v.task === 'chop') v.t = rnd(5, 8);
    else if (v.task === 'deliver') { v.t = 2.5; if (activeSlot && v.dest === activeSlot.id) activeSlot.p = Math.min(1, activeSlot.p + .05); puff(v.x + 10, v.y - 4, 5, '160,110,60', 8, -4); }
    else if (v.task === 'pick') v.t = rnd(4, 7);
    else if (v.task === 'drop') v.t = 2.5;
    else if (v.task === 'hammer') v.t = 1e9;
    else v.t = rnd(3, 8);
  }

  // ---------- extra boat, clouds, birds ----------
  const boat = {state:'away', t:rnd(10, 25), x:-200, y:780, dir:1};
  const clouds = [{x:420, y:40, s:1.1, v:9}, {x:1250, y:760, s:1.25, v:7}];
  const birds = Array.from({length:4}, () => ({x:rnd(0, 1536), y:rnd(120, 700), vx:rnd(22, 38) * (Math.random() < .5 ? -1 : 1), vy:rnd(-4, 4), ph:rnd(0, 6)}));
  const glints = Array.from({length:70}, () => newGlint());
  function newGlint() {
    const m = SEA; for (let i = 0; i < 40; i++) { const gx = Math.floor(Math.random() * 480), gy = Math.floor(Math.random() * 270); if (m && m[gy * 480 + gx]) return {x:gx * 3.2, y:gy * 3.2, life:0, max:rnd(.8, 2.2)}; }
    return {x:rnd(0, 300), y:rnd(0, 140), life:0, max:1};
  }
  let fishT = rnd(8, 20), fish = null, ring = 0;

  // ---------- offscreens ----------
  let cloudShadow = null;
  function prep() {
    const c = img.cloud; cloudShadow = document.createElement('canvas'); cloudShadow.width = c.width; cloudShadow.height = c.height;
    const x = cloudShadow.getContext('2d'); x.drawImage(c, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = 'rgb(10,30,50)'; x.fillRect(0, 0, c.width, c.height);
    // sea mask bits
    const mi = img.seamask, mc = document.createElement('canvas'); mc.width = 480; mc.height = 270; const mx = mc.getContext('2d'); mx.drawImage(mi, 0, 0);
    const d = mx.getImageData(0, 0, 480, 270).data; const arr = new Uint8Array(480 * 270); for (let i = 0; i < arr.length; i++) arr[i] = d[i * 4] > 128 ? 1 : 0; SEA = arr;
    for (let i = 0; i < glints.length; i++) { glints[i] = newGlint(); glints[i].life = rnd(0, glints[i].max); }
  }

  // ---------- update ----------
  let last = performance.now(), T = 0, raf = 0, windA = 0, windV = .45;
  function step(dt) {
    T += dt;
    // grade easing
    const tg = GRADES[tod], k = 1 - Math.exp(-dt / 6);
    for (let i = 0; i < 3; i++) { cur.mul[i] = lerp(cur.mul[i], tg.mul[i], k); }
    cur.ma = lerp(cur.ma, tg.ma, k); cur.glow = lerp(cur.glow, tg.glow, k); cur.stars = lerp(cur.stars, tg.stars, k);
    windV = lerp(windV, .35 + .25 * Math.sin(T * .05) + .1 * Math.sin(T * .17), dt * .5); windA += windV * dt;

    // pointer rest → build
    if (ptr) {
      ptrStill += dt;
      if (ptrStill > 1.1 && !ptrUsed) {
        const sl = freeSlotNear(ptr.x, ptr.y, 170);
        if (sl) { ptrUsed = true; if (!activeSlot) startBuild(sl); else if (!queued && sl !== activeSlot) { queued = sl; sl.state = 'queued'; } puff(sl.x, sl.y - 20, 14, '255,240,170', 26, -14); }
      }
    }
    // auto building
    if (!activeSlot) {
      if (queued) { const q = queued; queued = null; startBuild(q); }
      else { nextAuto -= dt; if (nextAuto <= 0) { const f = SLOTS.find(s => s.state === 'free'); if (f) startBuild(f); nextAuto = rnd(40, 60); } }
    }
    if (activeSlot && !isNight()) {
      const h = V.find(v => v.k === 'H'); const working = h.state === 'work' && h.task === 'hammer';
      activeSlot.p += dt * (working ? 1 / 85 : 1 / 400);
      if (working && Math.random() < dt * 1.6) puff(activeSlot.x + rnd(-30, 30) * activeSlot.s, activeSlot.y - rnd(10, 60) * activeSlot.s, 3, '220,200,160', 4, -6);
      if (activeSlot.p >= 1) {
        activeSlot.p = 1; activeSlot.state = 'built'; activeSlot.done = T; puff(activeSlot.x, activeSlot.y - 60 * activeSlot.s, 26, '255,236,150', 50, -18);
        activeSlot = null; nextAuto = rnd(35, 55); const hh = V.find(v => v.k === 'H'); if (hh.task === 'hammer') { hh.state = 'idle'; hh.t = 1.5; }
      }
    }
    // villagers
    for (const v of V) {
      v.phase += dt * 9;
      if (v.inside) { if (!isNight()) { v.inside = false; v.state = 'idle'; v.t = rnd(.5, 3); v.alpha = 0; } else continue; }
      v.alpha = Math.min(1, v.alpha + dt * 1.5);
      if (v.state === 'walk') {
        const tgt = v.path[0];
        if (!tgt) { arrive(v); continue; }
        const dx = tgt[0] - v.x, dy = tgt[1] - v.y, d = Math.hypot(dx, dy), sp = (v.k === 'A' && v.task === 'deliver' ? 24 : 30) * dt;
        if (Math.abs(dx) > .5) v.face = dx < 0 ? -1 : 1;
        if (d <= sp) { v.x = tgt[0]; v.y = tgt[1]; v.path.shift(); if (!v.path.length) arrive(v); }
        else { v.x += dx / d * sp; v.y += dy / d * sp; }
      } else if (v.state === 'work' || v.state === 'idle') {
        v.t -= dt;
        if (v.task === 'chop' && Math.random() < dt * 1.4) puff(v.x + v.face * 14, v.y - 18, 3, '190,140,80', 3, -14);
        if (v.task === 'pick' && Math.random() < dt * .8) puff(v.x, v.y - 6, 2, '120,170,70', 6, -8);
        if (v.task === 'hammer' && (!activeSlot || v.dest !== activeSlot.id)) v.t = 0;
        if (v.t <= 0 || (isNight() && v.task !== 'home')) think(v);
      } else if (v.state === 'inside') { if (!isNight()) { v.inside = false; v.state = 'idle'; v.t = 1; } }
    }
    // painted workers: builder dust, farmer soil
    if (Math.random() < dt * .9 && !isNight()) puff(1158, 385, 2, '215,195,150', 4, -6);
    if (Math.random() < dt * .7 && !isNight()) puff(840, 462, 2, '120,80,50', 4, -6);
    // fire smoke
    if (Math.random() < dt * 5) parts.push({x:331 + rnd(-3, 3), y:372, vx:rnd(2, 7), vy:rnd(-18, -12), life:0, max:rnd(2.2, 3.4), c:'235,232,226', s:rnd(3, 5), smoke:1});
    for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.life += dt; if (p.life > p.max) { parts.splice(i, 1); continue; } p.x += p.vx * dt; p.y += p.vy * dt; if (!p.smoke) p.vy += 14 * dt; else p.s += dt * 2.4; }
    // boat
    boat.t -= dt;
    if (boat.state === 'away' && boat.t <= 0) { boat.state = 'in'; boat.x = -160; boat.dir = 1; }
    if (boat.state === 'in') { boat.x += 26 * dt; if (boat.x >= 110) { boat.state = 'stay'; boat.t = rnd(18, 30); } }
    if (boat.state === 'stay' && boat.t <= 0) { boat.state = 'out'; boat.dir = -1; }
    if (boat.state === 'out') { boat.x -= 26 * dt; if (boat.x < -200) { boat.state = 'away'; boat.t = rnd(40, 80); } }
    // clouds
    for (const c of clouds) { c.x -= c.v * dt; if (c.x < -420) { c.x = 1600 + rnd(0, 300); c.y = Math.random() < .5 ? rnd(-20, 90) : rnd(720, 800); c.s = rnd(1, 1.35); } }
    for (const b of birds) { b.x += b.vx * dt; b.y += b.vy * dt + Math.sin(T * .7 + b.ph) * 4 * dt; b.ph += dt; if (b.x < -40 || b.x > 1580) { b.vx = -b.vx; b.y = rnd(100, 700); } }
    for (const gl of glints) { gl.life += dt; if (gl.life > gl.max) Object.assign(gl, newGlint()); }
    // fisherman float
    ring += dt; fishT -= dt;
    if (fishT <= 0) { fish = {t:0, x:89 + rnd(-30, 30), y:728 + rnd(5, 30)}; fishT = rnd(14, 30); }
    if (fish) { fish.t += dt; if (fish.t > 1.2) fish = null; }
  }

  // ---------- draw ----------
  function drawSprite(im, fx, fy, x, y, face, bob, rot, alpha) {
    g.save(); g.globalAlpha = alpha; g.translate(x, y - bob); g.rotate(rot); g.scale(face, 1);
    g.drawImage(im, -(fx), -(fy)); g.restore();
  }
  function drawHut(sl) {
    const h = img.hut, w = h.width * sl.s, hh = h.height * sl.s, x0 = sl.x - w / 2, y0 = sl.y - hh;
    const p = sl.state === 'built' ? 1 : sl.p;
    if (sl.state === 'queued') { drawFlag(sl); return; }
    if (sl.state === 'free') return;
    // ground patch
    g.fillStyle = 'rgba(120,85,45,' + (0.22 * Math.min(1, p * 6)) + ')';
    g.beginPath(); g.ellipse(sl.x, sl.y - 6 * sl.s, w * .48, 14 * sl.s, 0, 0, 7); g.fill();
    const wallP = clamp((p - .3) / .65, 0, 1);
    if (wallP > 0) {
      const rh = hh * wallP; g.save(); g.beginPath(); g.rect(x0 - 2, y0 + hh - rh, w + 4, rh + 2); g.clip();
      g.save(); if (sl.flip) { g.translate(sl.x * 2, 0); g.scale(-1, 1); }
      g.drawImage(h, x0, y0, w, hh); g.restore(); g.restore();
    }
    // scaffold
    const sc = sl.state === 'built' ? 0 : clamp(p / .25, 0, 1) * (1 - clamp((p - .93) / .07, 0, 1));
    if (sc > 0) {
      g.save(); g.globalAlpha = Math.min(1, sc * 1.5); g.lineCap = 'square';
      const poles = [-.42, -.14, .16, .44], top = y0 + hh * .28;
      for (let i = 0; i < poles.length; i++) {
        const px = sl.x + poles[i] * w, ph = (sl.y - top) * clamp(p / .2 - i * .15, 0, 1), base = sl.y - (i % 2 ? 4 : 10) * sl.s;
        g.strokeStyle = '#4a2c12'; g.lineWidth = 4 * sl.s + 1; g.beginPath(); g.moveTo(px, base); g.lineTo(px, base - ph); g.stroke();
        g.strokeStyle = '#b37a3c'; g.lineWidth = 2 * sl.s; g.beginPath(); g.moveTo(px - 1, base); g.lineTo(px - 1, base - ph); g.stroke();
      }
      const bp = clamp((p - .12) / .2, 0, 1);
      for (const yy of [.55, .78]) { const yb = y0 + hh * yy; g.strokeStyle = '#4a2c12'; g.lineWidth = 4 * sl.s + 1; g.beginPath(); g.moveTo(sl.x - .44 * w, yb); g.lineTo(sl.x - .44 * w + .88 * w * bp, yb - 8 * sl.s * bp); g.stroke(); g.strokeStyle = '#c48a48'; g.lineWidth = 2 * sl.s; g.beginPath(); g.moveTo(sl.x - .44 * w, yb - 1); g.lineTo(sl.x - .44 * w + .88 * w * bp, yb - 1 - 8 * sl.s * bp); g.stroke(); }
      // log stack
      g.fillStyle = '#7a4c22'; for (let i = 0; i < Math.round(3 * Math.min(1, p * 3)); i++) { g.fillRect(sl.x + w * .36, sl.y - 6 - i * 5, 26 * sl.s, 5); g.fillStyle = i % 2 ? '#7a4c22' : '#946032'; }
      g.restore();
    }
    // sparkle just after built
    if (sl.state === 'built' && T - sl.done < 3) { const a = 1 - (T - sl.done) / 3; for (let i = 0; i < 8; i++) { const ang = i / 8 * 6.28 + T; pixStar(sl.x + Math.cos(ang) * w * .5, y0 + hh * .4 + Math.sin(ang) * hh * .35, a); } }
  }
  function drawFlag(sl) {
    const x = sl.x, y = sl.y - 4, b = Math.sin(T * 3) * 1.5;
    g.fillStyle = '#5a3818'; g.fillRect(x - 1.5, y - 34, 3, 34);
    g.fillStyle = '#e94f3d'; g.beginPath(); g.moveTo(x + 1.5, y - 34); g.lineTo(x + 18, y - 29 + b); g.lineTo(x + 1.5, y - 23); g.fill();
    pixStar(x, y - 40, .5 + .5 * Math.sin(T * 4));
  }
  function pixStar(x, y, a) { g.fillStyle = 'rgba(255,248,210,' + a + ')'; g.fillRect(x - 1, y - 4, 2, 8); g.fillRect(x - 4, y - 1, 8, 2); }

  function frame() {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(img.plate, 0, 0, W, H);
    g.setTransform(S, 0, 0, S, 0, 0);
    // sea glints
    for (const gl of glints) { const a = Math.sin(Math.PI * gl.life / gl.max) * (1 - cur.ma * .7); if (a > 0) { g.fillStyle = 'rgba(255,255,240,' + (a * .8) + ')'; g.fillRect(gl.x, gl.y, 3, 3); if (a > .7) { g.fillRect(gl.x - 3, gl.y + 1, 9, 1); } } }
    // foam wash
    g.setTransform(1, 0, 0, 1, 0, 0);
    const wash = (T * .18) % 1;
    g.globalAlpha = .35 + .25 * Math.sin(T * 1.1); g.drawImage(img.foam, 0, 0);
    g.save(); g.translate(960, 560); const sc = 1 + .012 * wash; g.scale(sc, sc * 1.01); g.globalAlpha = .55 * (1 - wash); g.drawImage(img.foam, -960, -560); g.restore();
    g.globalAlpha = 1; g.setTransform(S, 0, 0, S, 0, 0);
    // float ripples + fish
    for (let i = 0; i < 2; i++) { const r = ((ring * .6 + i * .5) % 1); g.strokeStyle = 'rgba(255,255,255,' + (0.5 * (1 - r)) + ')'; g.lineWidth = 1.5; g.beginPath(); g.ellipse(89, 731, 4 + r * 16, (4 + r * 16) * .45, 0, 0, 7); g.stroke(); }
    if (fish) { const t = fish.t / 1.2, fx = fish.x + t * 24, fy = fish.y - Math.sin(t * Math.PI) * 26; g.fillStyle = '#d8e6ee'; g.fillRect(fx - 5, fy - 2, 10, 4); g.fillStyle = '#7d93a3'; g.fillRect(fx - 7, fy - 1, 3, 3); if (t < .15 || t > .85) { puff(fx, fish.y, 1, '255,255,255', 4, -10); } }
    // sailing boat (behind island things, it's on the sea)
    if (boat.state !== 'away') {
      const bs = .5, bw = img.boat.width * bs, bh = img.boat.height * bs, by = boat.y + Math.sin(T * 1.6) * 1.5;
      g.save(); g.translate(boat.x, by); if (boat.dir < 0) g.scale(-1, 1); g.rotate(Math.sin(T * 1.2) * .02);
      g.drawImage(img.boat, -bw / 2, -bh, bw, bh); g.restore();
      if (boat.state !== 'stay') for (let i = 0; i < 6; i++) { const wx = boat.x - boat.dir * (bw * .45 + i * 9), a = .5 - i * .08; g.fillStyle = 'rgba(255,255,255,' + a + ')'; g.fillRect(wx, by - 3 + (i % 2) * 3, 6, 2); }
    }
    // windmill sails
    g.save(); g.translate(850, 109); g.rotate(windA); g.drawImage(img.sails, -80, -94); g.restore();
    // sortable: villagers + code huts
    const items = [];
    for (const sl of SLOTS) if (sl.state !== 'free') items.push({y:sl.y, f:() => drawHut(sl)});
    for (const v of V) if (!v.inside && v.alpha > 0) items.push({y:v.y, f:() => {
      const im = img['spr_' + v.k];
      const walking = v.state === 'walk';
      let bob = 0, rot = 0;
      if (walking) { bob = Math.abs(Math.sin(v.phase)) * 2.2; rot = Math.sin(v.phase) * .05; }
      else if (v.task === 'chop' || v.task === 'hammer') { const c = Math.max(0, Math.sin(T * 7 + v.phase)); bob = c * 2.5; rot = c * .08 * v.face; }
      else if (v.task === 'pick') { bob = -Math.abs(Math.sin(T * 2 + v.phase)) * 2; }
      else bob = Math.sin(T * 2 + v.phase) * .6;
      g.fillStyle = 'rgba(40,30,10,' + (.22 * v.alpha) + ')'; g.beginPath(); g.ellipse(v.x, v.y - 1, im.width * .32, 4, 0, 0, 7); g.fill();
      drawSprite(im, im.width / 2, im.height, v.x, v.y, v.face, bob, rot, v.alpha);
    }});
    items.sort((a, b) => a.y - b.y); for (const it of items) it.f();
    // particles
    for (const p of parts) { const a = 1 - p.life / p.max; g.fillStyle = 'rgba(' + p.c + ',' + (p.smoke ? a * .55 : a) + ')'; const s = p.s; g.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s); }
    // cloud shadows + clouds
    for (const c of clouds) { const w = img.cloud.width * c.s, h = img.cloud.height * c.s; g.globalAlpha = .16; g.drawImage(cloudShadow, c.x + 60, c.y + (c.y < 400 ? 170 : -150), w, h); g.globalAlpha = .92; g.drawImage(img.cloud, c.x, c.y, w, h); g.globalAlpha = 1; }
    // gulls
    for (const b of birds) { const f = Math.sin(T * 6 + b.ph * 3); g.fillStyle = 'rgba(20,40,60,.15)'; g.fillRect(b.x + 30, b.y + 80, 8, 2); g.fillStyle = '#f7f4ec'; g.fillRect(b.x - 1, b.y, 3, 2); g.fillRect(b.x - 6, b.y - 2 - f * 2, 5, 2); g.fillRect(b.x + 2, b.y - 2 - f * 2, 5, 2); }
    // grade
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (cur.ma > .01) { g.globalCompositeOperation = 'multiply'; g.fillStyle = `rgba(${cur.mul.map(Math.round).join(',')},${cur.ma})`; g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'source-over'; }
    if (cur.glow > .02) {
      g.globalCompositeOperation = 'lighter'; g.setTransform(S, 0, 0, S, 0, 0);
      const fl = .85 + .15 * Math.sin(T * 9) * Math.sin(T * 3.3);
      const lights = LIGHTS.slice(); for (const sl of SLOTS) if (sl.state === 'built') { lights.push([sl.x - (sl.flip ? -1 : 1) * 37 * sl.s, sl.y - 26 * sl.s, 'd']); lights.push([sl.x + (sl.flip ? -1 : 1) * 40 * sl.s, sl.y - 36 * sl.s, 'w']); }
      for (const [x, y, t] of lights) { const r = t === 'd' ? 26 : 20; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(255,190,90,${.55 * cur.glow * fl})`); gr.addColorStop(1, 'rgba(255,150,60,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); g.fillStyle = `rgba(255,214,130,${.7 * cur.glow})`; g.fillRect(x - 3, y - 4, 6, 7); }
      const r = 70 * fl, gr = g.createRadialGradient(330, 405, 0, 330, 405, r); gr.addColorStop(0, `rgba(255,150,60,${.6 * cur.glow})`); gr.addColorStop(1, 'rgba(255,120,40,0)'); g.fillStyle = gr; g.fillRect(330 - r, 405 - r, r * 2, r * 2);
      g.globalCompositeOperation = 'source-over';
      if (cur.stars > .05) { for (let i = 0; i < 40; i++) { const sx = (i * 397) % 1536, sy = (i * 211) % 300; const m = SEA; if (m && m[Math.floor(sy / 3.2) * 480 + Math.floor(sx / 3.2)]) { g.fillStyle = `rgba(230,240,255,${cur.stars * (.25 + .25 * Math.sin(T * 2 + i))})`; g.fillRect(sx, sy, 2, 2); } } }
    }
    // hover hint: resting cursor near a free slot
    if (ptr && !ptrUsed && ptrStill > .25) { const sl = freeSlotNear(ptr.x, ptr.y, 170); if (sl) { const k = clamp((ptrStill - .25) / .85, 0, 1); g.setTransform(S, 0, 0, S, 0, 0); g.strokeStyle = `rgba(255,240,180,${.7 * k})`; g.lineWidth = 2; g.setLineDash([4, 4]); g.beginPath(); g.ellipse(sl.x, sl.y - 6, 60 * sl.s * (1.3 - .3 * k), 16 * sl.s, 0, 0, 7); g.stroke(); g.setLineDash([]); } }
    g.setTransform(1, 0, 0, 1, 0, 0);
  }

  function loop(now) {
    if (stopped) return;
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    step(dt); frame(); raf = requestAnimationFrame(loop);
  }
  for (const n of names) { const im = new Image(); im.onload = () => { if (++loaded === names.length && !stopped) start(); }; im.onerror = () => ctx.ready && ctx.ready(); im.src = A[n]; img[n] = im; }
  function start() {
    prep();
    if (ctx.reducedMotion) { SLOTS[0].state = 'built'; SLOTS[0].p = 1; SLOTS[0].done = -10; for (let i = 0; i < 40; i++) step(.05); frame(); ctx.ready && ctx.ready(); return; }
    // warm up a little so the first frame is lively
    for (let i = 0; i < 60; i++) step(.05);
    last = performance.now(); raf = requestAnimationFrame(loop); ctx.ready && ctx.ready();
  }
  return { unmount() { stopped = true; cancelAnimationFrame(raf); offPtr && offPtr(); unsub && unsub(); container.replaceChildren(); } };
}
