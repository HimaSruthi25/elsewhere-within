// Ginkgo Courtyard — an old stone courtyard under a ginkgo tree in autumn, drawn and animated live.
// Ground: flagstones, moss and a wooden veranda painted once in code; a mossy stone lantern
// (square roof with a knob, round windows, arched legs) drawn in a small 3D projection, its
// windows glowing at dusk and night. Dappled light from the tree sways over everything (WebGL2).
// Leaves: ~950 golden ginkgo leaves, each a small physical flake that falls fluttering from the
// tree, lands, and slides/tumbles in the wind (instanced WebGL, soft shadows that grow with
// height). Gusts roll across the yard; now and then a small whirl lifts a spiral of leaves.
// Follows the PC clock: dawn, day, dusk, night (lantern lit, moths circle it).
// Live wallpaper: move = your hand is wind; rest still = leaves slowly gather into a ring
// around your hand; click = a puff that throws the leaves up in a small whirl.
// Hand control (tray switch, camera): waving your real hand blows the leaves where it moves.
// With reducedMotion one still frame is drawn (redrawn when the time of day changes).

const LIGHTS = {
  dawn:  { amb: [0.38, 0.36, 0.44], sun: [1.00, 0.72, 0.52], sunAmt: 0.75, sdir: [-1.55, 0.42], lan: 0.35 },
  day:   { amb: [0.40, 0.43, 0.50], sun: [1.00, 0.93, 0.80], sunAmt: 0.90, sdir: [-0.42, 0.55], lan: 0.0 },
  dusk:  { amb: [0.34, 0.30, 0.38], sun: [1.00, 0.58, 0.34], sunAmt: 0.78, sdir: [1.55, 0.38], lan: 0.55 },
  night: { amb: [0.13, 0.17, 0.28], sun: [0.55, 0.66, 0.95], sunAmt: 0.10, sdir: [0.5, 0.9], lan: 1.0 },
}
const rnd = (a, b) => a + Math.random() * (b - a)
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const lerp = (a, b, t) => a + (b - a) * t

// ---------------- shared GLSL ----------------
const NOISE = `
float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<4;i++){ s+=a*vn(p); p=p*2.03+vec2(17.1,9.3); a*=0.5; } return s; }
uniform vec2 uRes; uniform float uT, uS, uGust, uSunAmt, uLan, uFlick;
uniform vec3 uAmb, uSun; uniform vec2 uSdir, uLanP, uTrunk;
float segShadow(vec2 p, vec2 a, vec2 dir, float len, float r){
  vec2 b=a+dir*len; vec2 pa=p-a, ba=b-a; float h=clamp(dot(pa,ba)/max(dot(ba,ba),1e-4),0.0,1.0);
  float d=length(pa-ba*h); float rr=r*(1.0-0.35*h);
  return (1.0-smoothstep(rr-4.0*uS, rr+12.0*uS*(1.0+h*2.0), d))*(1.0-0.5*h);
}
float sunlit(vec2 p){
  vec2 q=p/uS;
  float mask=1.0-smoothstep(650.0, 1250.0, length(q-vec2(-160.0,-220.0)));
  vec2 sway=vec2(sin(uT*0.71)+0.5*sin(uT*1.9), cos(uT*0.53)+0.4*sin(uT*1.4))*(4.0+16.0*uGust);
  float n=fbm((q+sway)/105.0+vec2(3.7,1.1)) + 0.35*vn((q+sway*1.6)/26.0);
  float holes=smoothstep(0.66,0.76,n);
  float lit=mix(1.0, holes, mask*0.94);
  vec2 sd=uSdir; float sl=length(sd); vec2 sn=sd/max(sl,1e-3);
  lit*=1.0-0.92*segShadow(p, uLanP, sn, sl*175.0*uS, 50.0*uS);
  lit*=1.0-0.95*segShadow(p, uTrunk, sn, sl*900.0*uS, 70.0*uS);
  return lit;
}
vec3 lanternLight(vec2 p){
  float d=length((p-uLanP-vec2(0.0,-20.0*uS))/uS);
  return vec3(1.0,0.60,0.28)*uLan*uFlick*(1.5*exp(-d*d/(150.0*150.0)) + 0.35*exp(-d*d/(420.0*420.0)));
}
vec3 lightAt(vec2 p){ return uAmb + uSun*uSunAmt*sunlit(p) + lanternLight(p); }
`

const BG_VS = `#version 300 es
in vec2 a; out vec2 vUv; void main(){ vUv=vec2(a.x*0.5+0.5, 0.5-a.y*0.5); gl_Position=vec4(a,0.0,1.0); }`
const BG_FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o; uniform sampler2D uG, uLt, uEm; uniform int uMode;
${NOISE}
void main(){
  vec2 p=vUv*uRes;
  if(uMode==1){
    vec4 t=texture(uLt, vUv); float e=texture(uEm, vUv).r;
    if(t.a<0.004 && e<0.004) discard;
    vec3 lc=uAmb + uSun*uSunAmt*0.92 + lanternLight(uLanP+vec2(0.0,60.0*uS))*0.45;
    vec2 fb=(p-uLanP-vec2(0.0,-73.0*uS))/uS;
    float near=exp(-dot(fb,fb)/(60.0*60.0));
    vec3 c=t.rgb*(lc + vec3(1.0,0.6,0.3)*uLan*uFlick*near*0.5);
    vec3 glow=vec3(1.0,0.70,0.36)*uLan*uFlick*e*1.7;
    o=vec4(c+glow, max(t.a, clamp(e*uLan,0.0,1.0))); return;
  }
  vec3 g=texture(uG, vUv).rgb;
  vec3 col=g*lightAt(p);
  o=vec4(col,1.0);
}`

const LEAF_VS = `#version 300 es
layout(location=0) in vec2 aC;
layout(location=1) in vec4 aA;  // x, y, z, angle
layout(location=2) in vec4 aB;  // flip, size, variant, shade
uniform int uPass;
${NOISE}
out vec2 vUv; out vec3 vL; out float vA, vLod, vFlip;
void main(){
  vec2 xy=aA.xy; float z=aA.z; float flip=aB.x; float sz=aB.y;
  vec2 loc=aC*sz; loc.x*=max(abs(flip),0.13);
  float c=cos(aA.w), s=sin(aA.w);
  loc=vec2(c*loc.x-s*loc.y, s*loc.x+c*loc.y);
  vec2 ctr;
  if(uPass==0){
    float sl=sunlit(xy);
    ctr=xy+uSdir*(z*0.9+5.0*uS)+vec2(1.0,2.0)*uS;
    loc*=1.0+z/(260.0*uS);
    vA=(0.14+0.46*sl)*clamp(uSunAmt*1.35,0.25,1.0)*(1.0-0.96*smoothstep(0.0,90.0*uS,z));
    vLod=min(z/(20.0*uS)+1.3,3.8);
  } else {
    ctr=xy-vec2(0.0,z*0.85); loc*=1.0+z/(1100.0*uS);
    vL=lightAt(xy)*(0.80+0.2*aB.w);
    vA=1.0; vLod=0.0;
  }
  float v=aB.z; vec2 cell=vec2(mod(v,4.0), floor(v/4.0));
  vUv=(cell+aC+0.5)/vec2(4.0,2.0);
  vFlip=flip;
  vec2 p=ctr+loc;
  gl_Position=vec4(p.x/uRes.x*2.0-1.0, 1.0-p.y/uRes.y*2.0, 0.0, 1.0);
}`
const LEAF_FS = `#version 300 es
precision highp float; precision highp int;
uniform sampler2D uL; uniform int uPass;
in vec2 vUv; in vec3 vL; in float vA, vLod, vFlip; out vec4 o;
void main(){
  if(uPass==0){ float a=textureLod(uL,vUv,vLod).a; o=vec4(0.0,0.0,0.0,a*vA); return; }
  vec4 t=texture(uL,vUv);
  vec3 c=t.rgb;
  if(vFlip<0.0){ float l=dot(c,vec3(0.33)); c=mix(c, vec3(l)*vec3(1.08,1.02,0.78), 0.35)*0.92; }
  c*=0.78+0.22*abs(vFlip);
  o=vec4(c*vL, t.a);
}`

// ---------------- painted ground ----------------
function noiseFn(seed) {
  const P = new Uint8Array(512); const p = [...Array(256).keys()]
  let s = seed
  for (let i = 255; i > 0; i--) { s = (s * 16807) % 2147483647; const j = s % (i + 1); [p[i], p[j]] = [p[j], p[i]] }
  for (let i = 0; i < 512; i++) P[i] = p[i & 255]
  const val = (x, y) => P[(P[x & 255] + y) & 255] / 255
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y); let fx = x - xi, fy = y - yi
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy)
    const a = val(xi, yi), b = val(xi + 1, yi), c = val(xi, yi + 1), d = val(xi + 1, yi + 1)
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy
  }
}

function paintGround(W, H, S, lan) {
  const TW = Math.min(1920, Math.round(W * Math.min(1.5, window.devicePixelRatio || 1)))
  const TH = Math.round(TW * H / W), k = TW / W
  const VW = Math.round(TW / 2), VH = Math.round(TH / 2), vk = VW / W
  const nz = noiseFn(7), nz2 = noiseFn(91)
  // jittered points
  const cell = 118 * S * vk
  const cols = Math.ceil(VW / cell) + 2, rows = Math.ceil(VH / cell) + 2
  const pts = []
  for (let j = -1; j < rows; j++) for (let i = -1; i < cols; i++) {
    pts.push({ x: (i + 0.5 + rnd(-0.36, 0.36)) * cell, y: (j + 0.5 + rnd(-0.36, 0.36)) * cell,
      c: [[112, 108, 101], [100, 99, 96], [116, 110, 101], [96, 97, 95], [108, 103, 96], [104, 104, 101]][(Math.random() * 6) | 0].map((v, _, a) => v * (a.f || (a.f = rnd(0.86, 1.1)))),
      li: Math.random() })
  }
  const pidx = (i, j) => (j + 1) * (cols + 1) + (i + 1)
  const E = new Float32Array(VW * VH), ID = new Int32Array(VW * VH)
  for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) {
    const wx = x + (nz(x / 30, y / 30) - 0.5) * 14 * S, wy = y + (nz(x / 30 + 9, y / 30) - 0.5) * 14 * S
    const ci = Math.floor(wx / cell), cj = Math.floor(wy / cell)
    let f1 = 1e9, f2 = 1e9, id = 0
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ii = ci + di, jj = cj + dj
      if (ii < -1 || jj < -1 || ii >= cols || jj >= rows) continue
      const n = pidx(ii, jj); const p = pts[n]; if (!p) continue
      const d = Math.hypot(wx - p.x, wy - p.y)
      if (d < f1) { f2 = f1; f1 = d; id = n } else if (d < f2) f2 = d
    }
    E[y * VW + x] = f2 - f1; ID[y * VW + x] = id
  }
  const gap = 1.6 * S * vk * 2
  const Hh = new Float32Array(VW * VH)
  for (let i = 0; i < E.length; i++) { const t = clamp((E[i] - gap) / (9 * S * vk * 2), 0, 1); Hh[i] = t * t * (3 - 2 * t) }
  const vc = document.createElement('canvas'); vc.width = VW; vc.height = VH
  const vx = vc.getContext('2d'); const img = vx.createImageData(VW, VH); const D = img.data
  for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) {
    const i = y * VW + x, e = E[i], p = pts[ID[i]]
    const hl = Hh[Math.max(0, i - 1 - VW)], hr = Hh[Math.min(E.length - 1, i + 1 + VW)]
    const shade = 1 + (hl - hr) * 0.9
    const g1 = nz(x / 5, y / 5), g2 = nz2(x / 40, y / 40), g3 = nz(x / 1.7 + 50, y / 1.7), big = nz2(x / 160 + 7, y / 160)
    const mz = nz2(x / 55 + 30, y / 55), mossW = gap + Math.max(0, mz - 0.5) * 22 * S * (0.6 + 0.8 * nz(x / 9, y / 9))
    let r, g, b
    if (e < mossW) {
      const deep = clamp(e / mossW, 0, 1)
      if (mz > 0.5) { const m = 0.5 + 0.5 * nz2(x / 3, y / 3); r = (46 + 34 * m) * (0.6 + 0.4 * deep); g = (64 + 44 * m) * (0.6 + 0.4 * deep); b = (24 + 14 * m) * (0.6 + 0.4 * deep) }
      else { const m = nz(x / 3, y / 3); r = 44 + 16 * m; g = 37 + 13 * m; b = 30 + 10 * m }
    } else {
      let v = 0.80 + 0.22 * g1 + 0.14 * (g2 - 0.5) + 0.16 * (g3 - 0.5)
      if (g3 > 0.82) v += 0.12; if (g3 < 0.12) v -= 0.12
      v *= 0.86 + 0.26 * big
      r = p.c[0] * v; g = p.c[1] * v; b = p.c[2] * v
      const lich = nz2(x / 7 + p.li * 40, y / 7)
      if (lich > 0.76) { const t = Math.min(1, (lich - 0.76) * 4) * 0.6; r = lerp(r, 168, t); g = lerp(g, 166, t); b = lerp(b, 128, t) }
      const ao = 0.62 + 0.38 * Hh[i]
      r *= shade * ao; g *= shade * ao; b *= shade * ao
    }
    D[i * 4] = clamp(r, 0, 255); D[i * 4 + 1] = clamp(g, 0, 255); D[i * 4 + 2] = clamp(b, 0, 255); D[i * 4 + 3] = 255
  }
  vx.putImageData(img, 0, 0)
  const c = document.createElement('canvas'); c.width = TW; c.height = TH
  let x = c.getContext('2d')
  x.imageSmoothingQuality = 'high'
  x.drawImage(vc, 0, 0, TW, TH)
  // fine grain
  for (let i = 0; i < TW * TH / 260; i++) {
    x.fillStyle = Math.random() < 0.5 ? 'rgba(255,250,235,0.07)' : 'rgba(20,16,10,0.09)'
    x.fillRect(Math.random() * TW, Math.random() * TH, rnd(1, 2.4) * k, rnd(1, 2.4) * k)
  }
  // pebbles in a few gaps
  for (let i = 0; i < 140; i++) {
    const px = Math.random() * VW, py = Math.random() * VH, ii = (py | 0) * VW + (px | 0)
    if (E[ii] > gap * 1.2) continue
    const r = rnd(2, 4.5) * S * k, X = px * 2, Y = py * 2
    const gr = x.createRadialGradient(X - r * 0.3, Y - r * 0.4, r * 0.1, X, Y, r)
    gr.addColorStop(0, '#cfc8bb'); gr.addColorStop(1, '#6d675e')
    x.fillStyle = gr; x.beginPath(); x.ellipse(X, Y, r * 1.2, r, rnd(0, 3), 0, 7); x.fill()
  }
  // veranda (wooden boards) along the bottom
  const vy = TH * 0.905
  x.fillStyle = 'rgba(10,8,6,0.35)'; x.fillRect(0, vy - 9 * S * k, TW, 9 * S * k)
  const bh = 26 * S * k
  for (let y = vy, n = 0; y < TH + bh; y += bh, n++) {
    const f0 = rnd(0.88, 1.06), base = [92, 66, 44].map(v => v * f0)
    const gr = x.createLinearGradient(0, y, 0, y + bh)
    gr.addColorStop(0, `rgb(${base.map(v => v * 1.12 | 0)})`); gr.addColorStop(1, `rgb(${base.map(v => v * 0.86 | 0)})`)
    x.fillStyle = gr; x.fillRect(0, y, TW, bh)
    x.strokeStyle = 'rgba(40,24,12,0.22)'; x.lineWidth = 1 * k
    for (let l = 0; l < 6; l++) {
      x.beginPath(); const yy = y + rnd(3, bh - 3), ph = rnd(0, 6)
      for (let xx = 0; xx <= TW; xx += 20 * k) x.lineTo(xx, yy + Math.sin(xx / (90 * k) + ph) * 2.2 * k)
      x.stroke()
    }
    x.fillStyle = 'rgba(20,12,6,0.65)'; x.fillRect(0, y + bh - 2 * k, TW, 2 * k)
    for (let xx = (n % 2) * 260 * k; xx < TW; xx += 520 * S * k) x.fillRect(xx, y, 2 * k, bh)
  }
  x.fillStyle = 'rgba(255,230,190,0.18)'; x.fillRect(0, vy, TW, 2.5 * k)
  // stone lantern: square pyramid roof with a knob, cube firebox with round windows,
  // a slab and an arched-leg base; weathered, mossy. Drawn in a small 3D projection
  // (looking down ~40°, turned 35°) so its sides show like a lantern seen from the veranda.
  const L = { x: lan[0] * k, y: lan[1] * k }, s = S * k * 1.05
  const lc = document.createElement('canvas'); lc.width = TW; lc.height = TH
  const ec = document.createElement('canvas'); ec.width = TW; ec.height = TH
  const gx0 = x
  gx0.fillStyle = 'rgba(15,12,8,0.5)'; gx0.beginPath(); gx0.ellipse(L.x, L.y + 4 * s, 72 * s, 34 * s, 0, 0, 7); gx0.fill()
  gx0.fillStyle = 'rgba(15,12,8,0.35)'; gx0.beginPath(); gx0.ellipse(L.x, L.y + 2 * s, 92 * s, 46 * s, 0, 0, 7); gx0.fill()
  paintLantern(lc.getContext('2d'), ec.getContext('2d'), L.x, L.y, s, k)
  return { ground: c, lantern: lc, emit: ec }
}

function paintLantern(x, em, cx, cy, s, k) {
  const P = 27 * Math.PI / 180, Yw = 35 * Math.PI / 180
  const cP = Math.cos(P), sP = Math.sin(P), cY = Math.cos(Yw), sY = Math.sin(Yw)
  const rot = (v) => [v[0] * cY + v[2] * sY, v[1], -v[0] * sY + v[2] * cY]
  const pr = (v) => { const r = rot(v); return [cx + r[0] * s, cy + (r[2] * sP - r[1] * cP) * s] }
  const Lv = (() => { const l = [-0.55, 0.78, 0.32], m = Math.hypot(...l); return l.map(q => q / m) })()
  const vis = (n) => { const r = rot(n); return r[1] * sP + r[2] * cP > 0.02 }
  const bright = (n) => { const r = rot(n), m = Math.hypot(...r); return 0.40 + 0.72 * Math.max(0, (r[0] * Lv[0] + r[1] * Lv[1] + r[2] * Lv[2]) / m) }
  const base = [150, 149, 137]
  const nzA = noiseFn(33), nzB = noiseFn(71)
  function poly(ctx2, pts) { ctx2.beginPath(); pts.forEach((p, i) => (i ? ctx2.lineTo(p[0], p[1]) : ctx2.moveTo(p[0], p[1]))); ctx2.closePath() }
  // face: 3D quad (or polygon), normal, options {moss, dirt, cut(fn)}
  function face(v3, n, o = {}) {
    if (!vis(n)) return null
    const pts = v3.map(pr), b = bright(n)
    x.save(); poly(x, pts)
    x.fillStyle = `rgb(${base.map(c => Math.min(255, c * b) | 0)})`; x.fill(); x.clip()
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9
    for (const p of pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]) }
    // weathering: darker toward the bottom of upright faces, stains from noise
    if (o.dirt) { const g = x.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, 'rgba(30,26,18,0)'); g.addColorStop(1, `rgba(30,26,18,${o.dirt})`); x.fillStyle = g; x.fillRect(x0, y0, x1 - x0, y1 - y0) }
    const area = (x1 - x0) * (y1 - y0), st = 2.2 * k
    for (let i = 0; i < area / (st * st) * 0.5; i++) {
      const px = x0 + Math.random() * (x1 - x0), py = y0 + Math.random() * (y1 - y0)
      const nv = nzA(px / (14 * k), py / (14 * k)), fine = Math.random()
      let col
      if (o.moss && nzB(px / (16 * k), py / (16 * k)) * o.moss > 0.5 + 0.12 * fine) { x.fillStyle = `rgba(${62 + fine * 36 | 0},${88 + fine * 36 | 0},${34 + fine * 14 | 0},0.35)`; x.beginPath(); x.arc(px, py, (1.5 + fine * 2.5) * k, 0, 7); x.fill(); continue }
      else if (nv < 0.32) col = 'rgba(40,36,28,0.16)'
      else col = fine < 0.5 ? 'rgba(255,252,240,0.11)' : 'rgba(20,18,12,0.13)'
      x.fillStyle = col; x.fillRect(px, py, st * (0.6 + fine), st * (0.6 + fine))
    }
    if (o.cut) o.cut()
    x.restore()
    if (o.occ) { em.save(); em.globalCompositeOperation = 'destination-out'; poly(em, pts); em.fill(); em.restore() }
    // crisp edge highlight on the top edge, soft dark outline
    x.strokeStyle = 'rgba(25,22,16,0.35)'; x.lineWidth = 1 * k; poly(x, pts); x.stroke()
    return pts
  }
  function box(w, d, y0, y1, o = {}) {
    const hw = w / 2, hd = d / 2
    const C = (sx, sy, sz) => [sx * hw, sy ? y1 : y0, sz * hd]
    const sides = [
      { v: [C(-1, 1, 1), C(1, 1, 1), C(1, 0, 1), C(-1, 0, 1)], n: [0, 0, 1], u: [1, 0, 0], c: [0, 0, hd] },
      { v: [C(1, 1, 1), C(1, 1, -1), C(1, 0, -1), C(1, 0, 1)], n: [1, 0, 0], u: [0, 0, -1], c: [hw, 0, 0] },
      { v: [C(1, 1, -1), C(-1, 1, -1), C(-1, 0, -1), C(1, 0, -1)], n: [0, 0, -1], u: [-1, 0, 0], c: [0, 0, -hd] },
      { v: [C(-1, 1, -1), C(-1, 1, 1), C(-1, 0, 1), C(-1, 0, -1)], n: [-1, 0, 0], u: [0, 0, 1], c: [-hw, 0, 0] },
    ]
    for (const f of sides) face(f.v, f.n, { dirt: o.dirt ?? 0.25, moss: o.sideMoss, occ: o.occ, cut: o.cut && (() => o.cut(f)) })
    face([C(-1, 1, -1), C(1, 1, -1), C(1, 1, 1), C(-1, 1, 1)], [0, 1, 0], { moss: o.topMoss, occ: o.occ })
  }
  // base with arched legs
  box(92, 92, 0, 34, { dirt: 0.45, sideMoss: 0.9, cut: (f) => {
    const pts = []
    const at = (u, h) => { const p = [f.c[0] + f.u[0] * u, h, f.c[2] + f.u[2] * u]; return pr(p) }
    pts.push(at(-30, -1)); pts.push(at(-30, 10))
    for (let a = Math.PI; a >= 0; a -= Math.PI / 16) pts.push(at(Math.cos(a) * 30, 10 + Math.sin(a) * 12))
    pts.push(at(30, -1))
    poly(x, pts); x.fillStyle = '#26231d'; x.fill()
  } })
  box(116, 116, 34, 48, { dirt: 0.15, topMoss: 0.85 })
  // firebox with round windows
  box(70, 70, 48, 122, { dirt: 0.25, cut: (f) => {
    const pts = []
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 24) pts.push(pr([f.c[0] + f.u[0] * Math.cos(a) * 17, 78 + Math.sin(a) * 17, f.c[2] + f.u[2] * Math.cos(a) * 17]))
    poly(x, pts); x.fillStyle = '#1d1913'; x.fill()
    // inner wall of the hole catches a little light on one side
    const pts2 = []
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 24) pts2.push(pr([f.c[0] * 0.55 + f.u[0] * Math.cos(a) * 17, 78 + Math.sin(a) * 17, f.c[2] * 0.55 + f.u[2] * Math.cos(a) * 17]))
    x.save(); poly(x, pts); x.clip(); poly(x, pts2); x.fillStyle = 'rgba(120,112,98,0.55)'; x.fill(); x.restore()
    em.save(); poly(em, pts); em.fillStyle = '#fff'; em.fill(); em.restore()
  } })
  // roof: eave slab + pyramid + knob
  box(152, 152, 122, 134, { dirt: 0.2, sideMoss: 0.7, occ: true })
  const R0 = 76, R1 = 21, y0 = 134, y1 = 166
  const sl = Math.atan2(y1 - y0, R0 - R1), ny = Math.cos(sl), nh = Math.sin(sl)
  const roofF = [
    { v: [[-R1, y1, R1], [R1, y1, R1], [R0, y0, R0], [-R0, y0, R0]], n: [0, ny, nh] },
    { v: [[R1, y1, R1], [R1, y1, -R1], [R0, y0, -R0], [R0, y0, R0]], n: [nh, ny, 0] },
    { v: [[R1, y1, -R1], [-R1, y1, -R1], [-R0, y0, -R0], [R0, y0, -R0]], n: [0, ny, -nh] },
    { v: [[-R1, y1, -R1], [-R1, y1, R1], [-R0, y0, R0], [-R0, y0, -R0]], n: [-nh, ny, 0] },
  ]
  for (const f of roofF) face(f.v, f.n, { moss: 1.15, occ: true })
  box(34, 34, 166, 184, { dirt: 0.15, topMoss: 0.6, occ: true })
  const kf = [
    { v: [[0, 196, 0], [17, 184, 17], [-17, 184, 17]], n: [0, 0.8, 0.6] },
    { v: [[0, 196, 0], [17, 184, -17], [17, 184, 17]], n: [0.6, 0.8, 0] },
    { v: [[0, 196, 0], [-17, 184, -17], [17, 184, -17]], n: [0, 0.8, -0.6] },
    { v: [[0, 196, 0], [-17, 184, 17], [-17, 184, -17]], n: [-0.6, 0.8, 0] },
  ]
  for (const f of kf) face(f.v, f.n, { moss: 0.5, occ: true })
  // soft blur of the emission mask so the windows glow at the edges
  const tmp = document.createElement('canvas'); tmp.width = em.canvas.width; tmp.height = em.canvas.height
  const t2 = tmp.getContext('2d'); t2.filter = `blur(${(4 * k) | 0}px)`; t2.drawImage(em.canvas, 0, 0)
  em.globalCompositeOperation = 'lighter'; em.globalAlpha = 0.9; em.drawImage(tmp, 0, 0); em.globalAlpha = 1; em.globalCompositeOperation = 'source-over'
}

function paintLeaves() {
  const C = 128, c = document.createElement('canvas'); c.width = C * 4; c.height = C * 2
  const x = c.getContext('2d')
  const sets = [
    ['#f7d443', '#e9a917', '#c98a10'], ['#f5cf2c', '#e6a41a', '#b97c12'], ['#f2dc5c', '#e8bb2c', '#c9921a'],
    ['#d6cf4e', '#d9b02a', '#a98a1b'], ['#f0c23a', '#d98a1c', '#a8611a'], ['#e6b44a', '#c58a34', '#8f5f2a'],
    ['#f8de55', '#f0b324', '#cc8916'], ['#cdbf55', '#c8a43a', '#93782a'],
  ]
  sets.forEach((col, v) => {
    const ox = (v % 4) * C + C / 2, oy = Math.floor(v / 4) * C
    x.save(); x.translate(ox, oy + C * 0.80)
    const R = 54 + Math.random() * 5, wav = Math.random() * 6, notch = 0.35 + Math.random() * 0.75, sp = (58 + Math.random() * 8) * Math.PI / 180
    const P = (f, r) => [Math.sin(f) * r, -Math.cos(f) * r]
    x.beginPath(); x.moveTo(0, 0)
    let q = P(-sp, R * 0.97); x.quadraticCurveTo(-R * 0.18, -R * 0.42, q[0], q[1])
    for (let f = -sp; f <= sp + 1e-6; f += sp / 30) {
      let r = R * (1 + 0.03 * Math.sin(f * 9 + wav) + 0.015 * Math.sin(f * 23))
      r -= R * 0.30 * notch * Math.exp(-((f / 0.07) ** 2))
      r *= 1 - 0.06 * (f / sp) ** 2
      q = P(f, r); x.lineTo(q[0], q[1])
    }
    x.quadraticCurveTo(R * 0.18, -R * 0.42, 0, 0)
    x.closePath()
    const gr = x.createRadialGradient(0, 0, 3, 0, -R * 0.3, R * 1.05)
    gr.addColorStop(0, col[2]); gr.addColorStop(0.4, col[1]); gr.addColorStop(0.85, col[0]); gr.addColorStop(1, col[1])
    x.fillStyle = gr; x.fill()
    x.save(); x.clip()
    x.strokeStyle = 'rgba(110,64,8,0.20)'; x.lineWidth = 0.7
    for (let f = -sp - 0.1; f <= sp + 0.1; f += 0.055) { x.beginPath(); x.moveTo(0, -1); q = P(f, R * 1.2); x.lineTo(q[0], q[1]); x.stroke() }
    if (v === 5 || v === 4) { x.fillStyle = 'rgba(110,60,20,0.35)'; for (let i = 0; i < 5; i++) { x.beginPath(); x.arc(rnd(-28, 28), rnd(-50, -28), rnd(2, 5), 0, 7); x.fill() } }
    const hl = x.createLinearGradient(-R, -R, R * 0.4, 0); hl.addColorStop(0, 'rgba(255,250,210,0.18)'); hl.addColorStop(1, 'rgba(255,250,210,0)')
    x.fillStyle = hl; x.fillRect(-R, -R * 1.1, R * 2, R * 1.1)
    x.restore()
    x.strokeStyle = 'rgba(120,72,12,0.55)'; x.lineWidth = 1; x.stroke()
    x.strokeStyle = col[2]; x.lineWidth = 2.6; x.lineCap = 'round'
    x.beginPath(); x.moveTo(0, -2); x.quadraticCurveTo(1.5, 10, -1 + Math.random() * 3, 22); x.stroke()
    x.restore()
  })
  return c
}

// ---------------- the scene ----------------
export function mount(container, ctx) {
  const cv = document.createElement('canvas'), ov = document.createElement('canvas')
  const vig = document.createElement('div')
  for (const c of [cv, ov, vig]) c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;'
  vig.style.background = 'radial-gradient(ellipse 75% 70% at 50% 48%, rgba(0,0,0,0) 55%, rgba(12,8,4,0.42) 100%)'
  container.replaceChildren(cv, ov, vig)
  const gl = cv.getContext('webgl2', { antialias: true, premultipliedAlpha: true, alpha: false })
  if (!gl) throw new Error('ginkgo-courtyard: WebGL2 is not available')
  const ox = ov.getContext('2d')
  function sh(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s }
  function prog(vs, fs) { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p }
  const pBg = prog(BG_VS, BG_FS), pLeaf = prog(LEAF_VS, LEAF_FS)
  const U = (p) => new Proxy({}, { get: (o, n) => (n in o ? o[n] : (o[n] = gl.getUniformLocation(p, n))) })
  const uBg = U(pBg), uLf = U(pLeaf)

  const quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  const vaoBg = gl.createVertexArray(); gl.bindVertexArray(vaoBg)
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  gl.bindAttribLocation(pBg, 0, 'a')
  const corner = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, corner)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]), gl.STATIC_DRAW)
  const inst = gl.createBuffer()
  const vaoLf = gl.createVertexArray(); gl.bindVertexArray(vaoLf)
  gl.bindBuffer(gl.ARRAY_BUFFER, corner); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  gl.bindBuffer(gl.ARRAY_BUFFER, inst)
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 0); gl.vertexAttribDivisor(1, 1)
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 16); gl.vertexAttribDivisor(2, 1)
  gl.bindVertexArray(null)

  function tex(src, mip) {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    if (mip) { gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR) } else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    return t
  }
  const leafTex = tex(paintLeaves(), true)
  let groundTex = null, lanTex = null, emTex = null

  let W = 0, H = 0, S = 1, DPR = 1, N = 0
  let X, Y, Z, VX, VY, VZ, A, AV, PH, PV, SZ, VR, SD, ST, TH, buf
  const lanP = [0, 0], trunk = [0, 0]
  const GW = 48, GH = 27, gx = new Float32Array(GW * GH), gy = new Float32Array(GW * GH)
  const ptr = { x: -1e4, y: -1e4, t: -1e9, in: false, vx: 0, vy: 0, moved: 0 }
  let gather = 0, T = 0, spawnT = 0, gustT = rnd(4, 8), gust = null, whirl = null, whirlT = rnd(30, 50)
  let breezeA = rnd(0, 6.28), flick = 1

  // light
  const cl = (o) => JSON.parse(JSON.stringify(o))
  const Lt = cl(LIGHTS[ctx.timeOfDay] || LIGHTS.day); let target = LIGHTS[ctx.timeOfDay] || LIGHTS.day
  function easeLight(k) {
    for (const key of ['amb', 'sun']) for (let i = 0; i < 3; i++) Lt[key][i] = lerp(Lt[key][i], target[key][i], k)
    for (let i = 0; i < 2; i++) Lt.sdir[i] = lerp(Lt.sdir[i], target.sdir[i], k)
    Lt.sunAmt = lerp(Lt.sunAmt, target.sunAmt, k); Lt.lan = lerp(Lt.lan, target.lan, k)
  }

  function layout() {
    W = container.clientWidth || innerWidth; H = container.clientHeight || innerHeight; S = H / 900; DPR = Math.min(1.5, devicePixelRatio || 1)
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); ov.width = cv.width; ov.height = cv.height
    lanP[0] = W * 0.80; lanP[1] = H * 0.31; trunk[0] = -60 * S; trunk[1] = -40 * S
    if (groundTex) { gl.deleteTexture(groundTex); gl.deleteTexture(lanTex); gl.deleteTexture(emTex) }
    const pg = paintGround(W, H, S, lanP)
    groundTex = tex(pg.ground, false); lanTex = tex(pg.lantern, false); emTex = tex(pg.emit, false)
    N = clamp(Math.round(950 * (W * H) / (1600 * 900)), 600, 1500)
    const F = () => new Float32Array(N)
    X = F(); Y = F(); Z = F(); VX = F(); VY = F(); VZ = F(); A = F(); AV = F(); PH = F(); PV = F(); SZ = F(); VR = F(); SD = F(); TH = F()
    ST = new Uint8Array(N); buf = new Float32Array(N * 8)
    const clumps = [[0.12, 0.2], [0.33, 0.75], [0.72, 0.38], [0.55, 0.86], [0.9, 0.7], [0.2, 0.55]]
    for (let i = 0; i < N; i++) {
      let x, y
      if (Math.random() < 0.62) { const c = clumps[(Math.random() * clumps.length) | 0]; x = c[0] * W + gauss() * 120 * S; y = c[1] * H + gauss() * 90 * S }
      else { x = Math.random() * W; y = Math.random() * H }
      X[i] = x; Y[i] = y; Z[i] = 0; A[i] = rnd(0, 6.28); PH[i] = Math.random() < 0.8 ? 0 : Math.PI
      SZ[i] = rnd(44, 60) * S; VR[i] = (Math.random() * 8) | 0; SD[i] = Math.random(); TH[i] = rnd(28, 75) * S; ST[i] = 0
    }
    for (let i = 0; i < 40; i++) { ST[i] = 2 }
  }
  function gauss() { return (Math.random() + Math.random() + Math.random() - 1.5) * 1.4 }

  // ---------- wind ----------
  function splat(x, y, vx, vy, r) {
    const cx = x / W * GW, cy = y / H * GH, rc = r / W * GW
    const x0 = Math.max(0, Math.floor(cx - rc)), x1 = Math.min(GW - 1, Math.ceil(cx + rc))
    const y0 = Math.max(0, Math.floor(cy - rc)), y1 = Math.min(GH - 1, Math.ceil(cy + rc))
    for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
      const d = Math.hypot(i + 0.5 - cx, j + 0.5 - cy) / rc; if (d >= 1) continue
      const w = (1 - d) * (1 - d) * 0.7, n = j * GW + i
      gx[n] += (vx - gx[n]) * w; gy[n] += (vy - gy[n]) * w
    }
  }
  const wv = [0, 0]
  function wind(x, y) {
    // hand grid (bilinear)
    let fx = clamp(x / W * GW - 0.5, 0, GW - 1.001), fy = clamp(y / H * GH - 0.5, 0, GH - 1.001)
    const i = fx | 0, j = fy | 0; fx -= i; fy -= j
    const n = j * GW + i
    let wx = (gx[n] * (1 - fx) + gx[n + 1] * fx) * (1 - fy) + (gx[n + GW] * (1 - fx) + gx[n + GW + 1] * fx) * fy
    let wy = (gy[n] * (1 - fx) + gy[n + 1] * fx) * (1 - fy) + (gy[n + GW] * (1 - fx) + gy[n + GW + 1] * fx) * fy
    // breeze + gust front
    let b = 10 * S
    if (gust) {
      const proj = (x - W / 2) * gust.dx + (y - H / 2) * gust.dy
      const L = Math.hypot(W, H), s = lerp(-0.85, 0.85, gust.u) * L
      b += gust.g * Math.exp(-(((proj - s) / (0.28 * L)) ** 2)) * Math.sin(Math.PI * Math.min(1, gust.u * 1.4))
      wx += gust.dx * b; wy += gust.dy * b
    } else { wx += Math.cos(breezeA) * b; wy += Math.sin(breezeA) * b }
    if (whirl) {
      const dx = x - whirl.x, dy = y - whirl.y, d = Math.hypot(dx, dy) + 1e-3, R = whirl.r
      if (d < R * 1.6) {
        const f = whirl.e * Math.exp(-((d / R) ** 2)) * whirl.v
        wx += (-dy / d) * f - dx / d * f * 0.25 + whirl.mx; wy += (dx / d) * f - dy / d * f * 0.25 + whirl.my
      }
    }
    wv[0] = wx; wv[1] = wy
    return wv
  }

  // ---------- leaves ----------
  function step(dt) {
    T += dt
    // grid decay + soft spread
    const dec = Math.exp(-2.2 * dt)
    for (let i = 0; i < gx.length; i++) { gx[i] *= dec; gy[i] *= dec }
    // gusts
    breezeA += (Math.sin(T * 0.05) * 0.4) * dt
    gustT -= dt
    if (!gust && gustT <= 0) { const a = breezeA + rnd(-0.5, 0.5); gust = { dx: Math.cos(a), dy: Math.sin(a), g: rnd(130, 260) * S, u: 0, dur: rnd(4.5, 6.5) } }
    if (gust) { gust.u += dt / gust.dur; if (gust.u >= 1) { gust = null; gustT = rnd(8, 18) } }
    whirlT -= dt
    if (!whirl && whirlT <= 0) {
      const a = rnd(0, 6.28)
      whirl = { x: rnd(0.25, 0.75) * W, y: rnd(0.3, 0.75) * H, r: rnd(90, 130) * S, v: 300 * S, e: 0, life: rnd(6, 8), age: 0, mx: Math.cos(a) * 45 * S, my: Math.sin(a) * 30 * S }
    }
    if (whirl) {
      whirl.age += dt; whirl.x += whirl.mx * dt; whirl.y += whirl.my * dt
      whirl.e = Math.min(1, whirl.age / 1.2, (whirl.life - whirl.age) / 1.5)
      if (whirl.age >= whirl.life) { whirl = null; whirlT = rnd(35, 70) }
    }
    const gustNow = gust ? gust.g / (260 * S) * Math.sin(Math.PI * gust.u) : 0
    // resting hand
    const still = ptr.in && T - ptr.moved > 0.6 && T - ptr.moved < 30
    gather = clamp(gather + (still ? dt / 1.6 : -dt * 2.5), 0, 1)
    // spawning from the tree
    spawnT -= dt * (1 + gustNow * 3)
    let freeCount = 0
    if (spawnT <= 0) {
      spawnT = rnd(0.35, 0.7)
      for (let i = 0; i < N; i++) if (ST[i] === 2) {
        const y = rnd(-0.02, 0.8) * H
        X[i] = rnd(-0.05, 0.85) * W * (Math.random() < 0.6 ? 0.6 : 1); Y[i] = y; Z[i] = (y + 40 * S) / 0.85 + rnd(0, 120) * S
        VX[i] = 0; VY[i] = 0; VZ[i] = -40 * S; PH[i] = rnd(0, 6.28); PV[i] = rnd(2.2, 5) * (Math.random() < 0.5 ? -1 : 1)
        A[i] = rnd(0, 6.28); AV[i] = rnd(-1.5, 1.5); ST[i] = 1
        break
      }
    }
    const e5 = Math.exp(-5 * dt), hx = ptr.x, hy = ptr.y, R = 300 * S, r0 = 58 * S
    for (let i = 0; i < N; i++) {
      const st = ST[i]; if (st === 2) { freeCount++; continue }
      const w = wind(X[i], Y[i]); const wx = w[0], wy = w[1]
      if (st === 1) {
        PH[i] += PV[i] * dt
        const sp = Math.sin(PH[i]), fl = Math.sin(PH[i] * 2)
        const fall = -(30 + 50 * Math.abs(sp)) * S
        let lift = 0
        if (whirl) { const d = Math.hypot(X[i] - whirl.x, Y[i] - whirl.y); lift = whirl.e * 140 * S * Math.exp(-((d / whirl.r) ** 2)) * (Z[i] < 260 * S ? 1 : 0.3) }
        VZ[i] += (fall + lift - VZ[i]) * Math.min(1, 1.6 * dt)
        const ca = Math.cos(A[i]), sa = Math.sin(A[i])
        VX[i] += (wx + ca * fl * 42 * S - VX[i]) * Math.min(1, 1.4 * dt)
        VY[i] += (wy + sa * fl * 42 * S - VY[i]) * Math.min(1, 1.4 * dt)
        if (gather > 0.2 && Z[i] < 220 * S) { const dx = hx - X[i], dy = hy - Y[i], d = Math.hypot(dx, dy); if (d < R) { VX[i] += dx / d * 30 * S * gather * dt; VY[i] += dy / d * 30 * S * gather * dt } }
        A[i] += AV[i] * dt
        X[i] += VX[i] * dt; Y[i] += VY[i] * dt; Z[i] += VZ[i] * dt
        if (Z[i] <= 0) { Z[i] = 0; ST[i] = 0; VZ[i] = 0; VX[i] *= 0.35; VY[i] *= 0.35; AV[i] *= 0.3 }
      } else {
        const ws = Math.hypot(wx, wy), th = TH[i]
        if (ws > th) {
          const k = Math.min(1, 2.6 * dt * (ws - th) / ws * 2)
          VX[i] += (wx * 0.75 - VX[i]) * k; VY[i] += (wy * 0.75 - VY[i]) * k
          AV[i] += ((VX[i] * 0.013 - VY[i] * 0.007) - AV[i]) * Math.min(1, 2 * dt)
          if (ws > th * 3.4 && Math.random() < dt * 1.3) { ST[i] = 1; VZ[i] = rnd(50, 150) * S; Z[i] = 1; PV[i] = rnd(3, 6) * (Math.random() < 0.5 ? -1 : 1) }
          if (ws > th * 1.8) PH[i] += (ws / th) * 0.6 * dt * (SD[i] < 0.5 ? 1 : -1)
        } else { VX[i] *= e5; VY[i] *= e5; AV[i] *= e5 }
        if (gather > 0) {
          const dx = X[i] - hx, dy = Y[i] - hy, d = Math.hypot(dx, dy) + 1e-3
          if (d < R) {
            const nx = dx / d, ny = dy / d, f = gather * (1 - d / R)
            let ax = -ny * 22 * S * f, ay = nx * 22 * S * f
            const rr = r0 + SD[i] * 34 * S
            if (d > rr) { const pull = Math.min(d - rr, 150 * S) * 1.9 * gather; ax -= nx * pull; ay -= ny * pull }
            else { ax += nx * (rr - d) * 3 * gather; ay += ny * (rr - d) * 3 * gather }
            VX[i] += ax * dt; VY[i] += ay * dt
            AV[i] += (-ny * 0.004 * f) * dt * 60
          }
        }
        const sp = Math.hypot(VX[i], VY[i]), cap = 700 * S
        if (sp > cap) { VX[i] *= cap / sp; VY[i] *= cap / sp }
        const tgt = Math.round(PH[i] / Math.PI) * Math.PI
        if (ws <= th * 1.8) PH[i] += (tgt - PH[i]) * Math.min(1, 6 * dt)
        A[i] += AV[i] * dt; X[i] += VX[i] * dt; Y[i] += VY[i] * dt
        const ex = (X[i] - lanP[0]) / (68 * S), ey = (Y[i] - lanP[1]) / (34 * S), ee = ex * ex + ey * ey
        if (ee < 1) { const q = 1 / Math.sqrt(ee + 1e-4); X[i] = lanP[0] + ex * q * 68 * S; Y[i] = lanP[1] + ey * q * 34 * S }
      }
      if (X[i] < -90 * S || X[i] > W + 90 * S || Y[i] < -90 * S || Y[i] > H + 90 * S) { ST[i] = 2; freeCount++ }
    }
    // a gust also brings leaves in from the upwind edge
    if (gust && freeCount > 10 && Math.random() < dt * 6 * Math.sin(Math.PI * gust.u)) {
      for (let i = 0; i < N; i++) if (ST[i] === 2) {
        const side = Math.abs(gust.dx) > Math.abs(gust.dy)
        X[i] = side ? (gust.dx > 0 ? -60 * S : W + 60 * S) : rnd(0, W); Y[i] = side ? rnd(0, H * 0.88) : (gust.dy > 0 ? -60 * S : H + 60 * S)
        Z[i] = rnd(0, 40) * S; ST[i] = Z[i] > 5 ? 1 : 0; VX[i] = gust.dx * 200 * S; VY[i] = gust.dy * 200 * S; VZ[i] = 20 * S
        PV[i] = rnd(3, 6); TH[i] = rnd(28, 75) * S; break
      }
    }
    // bird
    flick = 0.88 + 0.08 * Math.sin(T * 7.3) + 0.05 * Math.sin(T * 13.1 + 1) + 0.03 * Math.sin(T * 23.7)
    uniforms.gust = gustNow + (whirl ? whirl.e * 0.5 : 0)
  }
  const uniforms = { gust: 0 }

  // moths at the lantern after dark
  const moths = [0, 1, 2].map(i => ({ a: i * 2.1, r: rnd(28, 52), sp: rnd(1.6, 2.6) }))
  function drawMoths(c) {
    const k = Lt.lan * (1 - Lt.sunAmt); if (k < 0.15) return
    c.globalCompositeOperation = 'lighter'
    for (const m of moths) {
      m.a += m.sp * 0.016
      const x = lanP[0] + Math.cos(m.a) * m.r * S + Math.sin(T * 9 + m.a) * 4 * S, y = lanP[1] - 73 * S + Math.sin(m.a * 1.3) * m.r * 0.45 * S
      c.fillStyle = `rgba(255,230,180,${0.55 * k})`; c.beginPath(); c.ellipse(x, y, 3 * S * (0.6 + 0.4 * Math.abs(Math.sin(T * 30 + m.a))), 2 * S, 0, 0, 7); c.fill()
    }
    c.globalCompositeOperation = 'source-over'
  }

  // ---------- draw ----------
  function setCommon(u) {
    gl.uniform2f(u.uRes, W, H); gl.uniform1f(u.uT, T); gl.uniform1f(u.uS, S); gl.uniform1f(u.uGust, uniforms.gust)
    gl.uniform1f(u.uSunAmt, Lt.sunAmt); gl.uniform1f(u.uLan, Lt.lan); gl.uniform1f(u.uFlick, flick)
    gl.uniform3fv(u.uAmb, Lt.amb); gl.uniform3fv(u.uSun, Lt.sun); gl.uniform2fv(u.uSdir, Lt.sdir)
    gl.uniform2fv(u.uLanP, lanP); gl.uniform2fv(u.uTrunk, trunk)
  }
  function render() {
    gl.viewport(0, 0, cv.width, cv.height)
    gl.disable(gl.BLEND)
    gl.useProgram(pBg); setCommon(uBg)
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, groundTex); gl.uniform1i(uBg.uG, 0)
    gl.uniform1i(uBg.uMode, 0); gl.uniform1i(uBg.uLt, 1); gl.uniform1i(uBg.uEm, 2)
    gl.bindVertexArray(vaoBg); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    // instance data: ground leaves first, then airborne (low to high)
    let n = 0
    const put = (i) => { const o = n * 8; buf[o] = X[i]; buf[o + 1] = Y[i]; buf[o + 2] = Z[i]; buf[o + 3] = A[i]; buf[o + 4] = Math.cos(PH[i]); buf[o + 5] = SZ[i]; buf[o + 6] = VR[i]; buf[o + 7] = SD[i]; n++ }
    for (let i = 0; i < N; i++) if (ST[i] === 0) put(i)
    for (let i = 0; i < N; i++) if (ST[i] === 1) put(i)
    gl.bindBuffer(gl.ARRAY_BUFFER, inst); gl.bufferData(gl.ARRAY_BUFFER, buf.subarray(0, n * 8), gl.DYNAMIC_DRAW)
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.useProgram(pLeaf); setCommon(uLf)
    gl.bindTexture(gl.TEXTURE_2D, leafTex); gl.uniform1i(uLf.uL, 0)
    gl.bindVertexArray(vaoLf)
    gl.uniform1i(uLf.uPass, 0); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n)
    gl.uniform1i(uLf.uPass, 1); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n)
    gl.useProgram(pBg); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, lanTex); gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, emTex); gl.activeTexture(gl.TEXTURE0)
    gl.uniform1i(uBg.uMode, 1); gl.bindVertexArray(vaoBg); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    gl.bindVertexArray(null)
    ox.setTransform(DPR, 0, 0, DPR, 0, 0); ox.clearRect(0, 0, W, H)
    drawMoths(ox)
  }

  // ---------- input ----------
  function onPointer(e) {
    if (ctx.reducedMotion || !W) return
    if (e.type === 'down') {
      const R = 210 * S
      for (let i = 0; i < N; i++) {
        if (ST[i] === 2) continue
        const dx = X[i] - e.x, dy = Y[i] - e.y, d = Math.hypot(dx, dy) + 1e-3; if (d > R) continue
        const f = 1 - d / R
        ST[i] = 1; Z[i] = Math.max(Z[i], 1); VZ[i] = (110 + 260 * f) * S * rnd(0.7, 1.1)
        VX[i] += (dx / d * 120 - dy / d * 170) * f * S; VY[i] += (dy / d * 120 + dx / d * 170) * f * S
        PV[i] = rnd(3, 7) * (Math.random() < 0.5 ? -1 : 1)
      }
      whirl = { x: e.x, y: e.y, r: 140 * S, v: 260 * S, e: 1, life: 2.4, age: 0.9, mx: 0, my: 0 }
      gather = 0; ptr.moved = T
      return
    }
    if (e.type !== 'move') return
    const now = T
    if (ptr.in && now - ptr.t < 0.5) {
      const dt = Math.max(0.008, now - ptr.t)
      const vx = clamp((e.x - ptr.x) / dt, -1600 * S, 1600 * S), vy = clamp((e.y - ptr.y) / dt, -1600 * S, 1600 * S)
      ptr.vx = ptr.vx * 0.5 + vx * 0.5; ptr.vy = ptr.vy * 0.5 + vy * 0.5
      const steps = Math.max(1, Math.ceil(Math.hypot(e.x - ptr.x, e.y - ptr.y) / (30 * S)))
      for (let i = 1; i <= steps; i++) splat(lerp(ptr.x, e.x, i / steps), lerp(ptr.y, e.y, i / steps), ptr.vx * 0.9, ptr.vy * 0.9, 95 * S)
      if (Math.hypot(e.x - ptr.x, e.y - ptr.y) > 2) ptr.moved = now
    } else { ptr.vx = ptr.vy = 0; ptr.moved = now }
    ptr.x = e.x; ptr.y = e.y; ptr.t = now; ptr.in = true
  }

  // ---------- loop ----------
  let raf = 0, last = performance.now(), stopped = false
  function loop(t) {
    if (stopped) return
    raf = requestAnimationFrame(loop)
    const dt = Math.min(0.05, (t - last) / 1000); last = t
    easeLight(Math.min(1, dt / 20)); step(dt); render()
  }
  layout()
  if (ctx.reducedMotion) { step(0.016); render() } else { raf = requestAnimationFrame(loop) }
  requestAnimationFrame(() => requestAnimationFrame(() => ctx.ready()))
  const offClock = ctx.subscribe?.(({ timeOfDay }) => { target = LIGHTS[timeOfDay] || LIGHTS.day; if (ctx.reducedMotion) { easeLight(1); render() } })
  const offPointer = ctx.onPointer?.(onPointer)
  // Hand control (camera, wallpaper only): a waving hand is wind where it moves, plus a
  // small outward push like a hand pushing air.
  const offWave = ctx.onWave?.(({ cells }) => {
    if (ctx.reducedMotion || !W) return
    const cap = 1500 * S
    for (const c of cells) {
      const ox = c.x - c.bx, oy = c.y - c.by, ol = Math.hypot(ox, oy) || 1
      let vx = c.vx * 1.1 + (ox / ol) * 140 * S * c.e, vy = c.vy * 1.1 + (oy / ol) * 140 * S * c.e
      const sp = Math.hypot(vx, vy)
      if (sp > cap) { vx *= cap / sp; vy *= cap / sp }
      const k = 0.4 + 0.6 * c.e
      splat(c.x, c.y, vx * k, vy * k, 120 * S)
    }
  })
  let rz = 0
  const onResize = () => { clearTimeout(rz); rz = setTimeout(() => { layout(); render() }, 150) }
  addEventListener('resize', onResize)
  return {
    unmount() {
      stopped = true
      cancelAnimationFrame(raf)
      clearTimeout(rz)
      removeEventListener('resize', onResize)
      offPointer?.()
      offWave?.()
      offClock?.()
      gl.getExtension('WEBGL_lose_context')?.loseContext()
      container.replaceChildren()
    },
  }
}
