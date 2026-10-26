// Living Pond — a garden pond seen from above, drawn and animated live.
// Water: a wave-equation height field (~120 rows, on the CPU) uploaded to the
// GPU every frame as a 16-bit texture; a WebGL shader bends the pond floor
// through it (refraction) and adds caustics, sky sheen and glints.
// Under the water (painted into the floor, so the ripples bend them): fish and
// the shadows of everything floating. On the water: lily pads, paper boats,
// petals and frogs, which ride the waves.
// Follows the PC clock: dawn, day, dusk and night light; fireflies after dark.
// Live wallpaper: your hand leaves a wake that pushes boats and pads; fish dart
// from a quick hand and come to nibble at a hand that rests still; frogs hop
// away when you come close (sometimes onto a boat); a click makes a splash.
// With reducedMotion one still frame is drawn (redrawn when the time of day changes).

const SIM_ROWS = 120
const DAMP = 0.986
const HK = 4000 // height -> 16-bit scale
const FLOOR_MAX_W = 1200

const LIGHTS = {
  dawn: { sky: [1.0, 0.82, 0.76], sky2: [0.6, 0.68, 0.8], spec: [1.0, 0.86, 0.82], light: [0.92, 0.88, 0.92], over: [70, 50, 80], dim: 0.12, flies: 0 },
  day: { sky: [0.97, 0.88, 0.72], sky2: [0.62, 0.76, 0.74], spec: [1.0, 0.94, 0.8], light: [1, 1, 1], over: [0, 0, 0], dim: 0, flies: 0 },
  dusk: { sky: [0.98, 0.72, 0.5], sky2: [0.4, 0.42, 0.55], spec: [1.0, 0.8, 0.58], light: [0.86, 0.76, 0.66], over: [60, 30, 30], dim: 0.18, flies: 0.6 },
  night: { sky: [0.16, 0.22, 0.36], sky2: [0.07, 0.1, 0.18], spec: [0.75, 0.85, 1.0], light: [0.36, 0.44, 0.6], over: [8, 16, 36], dim: 0.55, flies: 1 },
}

const PAPERS = ['#f4efe2', '#dfeaf1', '#f3dede', '#f1e7c8', '#e3e9dc', '#ece3f0']
const FISH_COLS = [
  { body: '#ef8a3a', belly: '#ffd6a6', fin: 'rgba(255,190,130,0.55)', spots: null },
  { body: '#e8b03a', belly: '#fff1bd', fin: 'rgba(255,230,150,0.55)', spots: null },
  { body: '#f2ece2', belly: '#ffffff', fin: 'rgba(255,245,235,0.5)', spots: '#e2733a' },
  { body: '#d65a36', belly: '#ffc0a3', fin: 'rgba(255,170,140,0.5)', spots: null },
  { body: '#7d8c88', belly: '#c9d4cf', fin: 'rgba(200,215,210,0.45)', spots: null },
  { body: '#f6efe4', belly: '#ffffff', fin: 'rgba(255,248,240,0.5)', spots: '#2f2a28' },
]

const rnd = (a, b) => a + Math.random() * (b - a)
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const pick = (arr) => arr[(Math.random() * arr.length) | 0]
const lerp = (a, b, t) => a + (b - a) * t
function angDiff(a, b) {
  let d = a - b
  while (d > Math.PI) d -= 2 * Math.PI
  while (d < -Math.PI) d += 2 * Math.PI
  return d
}

const VS = 'attribute vec2 a;varying vec2 v;void main(){v=a*0.5+0.5;gl_Position=vec4(a,0.,1.);}'
const FS = `precision highp float;
varying vec2 v;
uniform sampler2D uH, uS;
uniform vec2 uTx; uniform float uT, uAsp;
uniform float uRef, uCau, uAmb, uRefl, uBase, uSpec;
uniform vec3 uSky, uSky2, uSpecC, uLight;
float hh(vec2 p){ vec4 t=texture2D(uH,p); return (t.r*65280.0+t.a*255.0-32768.0)/${HK.toFixed(1)}; }
float caus(vec2 p, float t){
  vec2 q=p; float c=0.0;
  for(int i=0;i<3;i++){
    float fi=float(i);
    q+=0.6*vec2(sin(q.y*1.21+t*0.55+fi*1.3), sin(q.x*1.07-t*0.47+fi*2.1));
    c+=abs(sin(q.x*0.9+q.y*0.4));
  }
  return pow(clamp(1.0-c/3.0,0.0,1.0),3.0);
}
void main(){
  vec2 p=vec2(v.x,1.0-v.y);
  float hc=hh(p), hl=hh(p-vec2(uTx.x,0.)), hr=hh(p+vec2(uTx.x,0.)), ht=hh(p-vec2(0.,uTx.y)), hb=hh(p+vec2(0.,uTx.y));
  vec2 sl=vec2(hr-hl, hb-ht);
  vec3 n=normalize(vec3(-sl,0.55));
  vec3 col=texture2D(uS, p - sl*uRef).rgb;
  float lap=hl+hr+ht+hb-4.0*hc;
  col*=1.0+uCau*clamp(-lap*3.0,-0.35,1.3);
  col+=col*uAmb*caus(vec2(p.x*uAsp,p.y)*13.0+sl*3.0, uT*0.8);
  col*=uLight;
  float s=length(sl);
  col=mix(col, mix(uSky,uSky2,p.y), clamp(uBase + s*uRefl, 0.0, 0.6));
  vec3 L=normalize(vec3(-0.35,-0.5,0.8));
  vec3 Hv=normalize(L+vec3(0.,0.,1.));
  col+=uSpecC*uSpec*pow(max(dot(n,Hv),0.0),70.0)*smoothstep(0.02,0.14,s);
  gl_FragColor=vec4(col,1.0);
}`

export function mount(container, ctx) {
  const glc = document.createElement('canvas')
  const over = document.createElement('canvas')
  for (const c of [glc, over]) c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;'
  container.replaceChildren(glc, over)
  const gl = glc.getContext('webgl', { antialias: false, alpha: false, premultipliedAlpha: false })
  if (!gl) throw new Error('living-pond: WebGL is not available')
  const oc = over.getContext('2d')
  const floor = document.createElement('canvas')
  const fc = floor.getContext('2d')
  const bottom = document.createElement('canvas')
  const bc = bottom.getContext('2d')

  let W = 0, H = 0, DPR = 1, SS = 1, SW = 0, SH = 0, U = 1
  let now = performance.now(), T = now / 1000
  let GW = 200, cur, prev, hbytes
  let frame = 0, stopped = false, last = 0, acc = 0
  let pads = [], boats = [], petals = [], frogs = [], fish = [], flies = [], dropT = 3

  // ---------- light (eases toward the PC clock's time of day) ----------
  const L = { ...structuredClone(LIGHTS[ctx.timeOfDay] || LIGHTS.day) }
  let target = LIGHTS[ctx.timeOfDay] || LIGHTS.day
  function easeLight(k) {
    for (const key of ['sky', 'sky2', 'spec', 'light', 'over']) for (let i = 0; i < 3; i++) L[key][i] = lerp(L[key][i], target[key][i], k)
    L.dim = lerp(L.dim, target.dim, k)
    L.flies = lerp(L.flies, target.flies, k)
  }

  // ---------- water ----------
  function initSim() {
    GW = Math.max(60, Math.round(SIM_ROWS * W / H))
    cur = new Float32Array(GW * SIM_ROWS)
    prev = new Float32Array(GW * SIM_ROWS)
    hbytes = new Uint8Array(GW * SIM_ROWS * 2)
  }
  function simStep() {
    const w = GW
    for (let y = 1; y < SIM_ROWS - 1; y++) {
      let i = y * w + 1
      for (let x = 1; x < w - 1; x++, i++) prev[i] = ((cur[i - 1] + cur[i + 1] + cur[i - w] + cur[i + w]) * 0.5 - prev[i]) * DAMP
    }
    const t = prev
    prev = cur
    cur = t
  }
  function disturb(px, py, rpx, amp) {
    const gx = px / W * GW, gy = py / H * SIM_ROWS, r = Math.max(3, rpx / W * GW) // never narrower than 3 cells, or the grid rings
    const x0 = Math.max(1, Math.floor(gx - r)), x1 = Math.min(GW - 2, Math.ceil(gx + r))
    const y0 = Math.max(1, Math.floor(gy - r)), y1 = Math.min(SIM_ROWS - 2, Math.ceil(gy + r))
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - gx, y - gy)
      if (d < r) cur[y * GW + x] += amp * 0.5 * (1 + Math.cos(Math.PI * d / r))
    }
  }
  function heightAt(px, py) {
    const gx = clamp(px / W * GW, 0, GW - 1.001), gy = clamp(py / H * SIM_ROWS, 0, SIM_ROWS - 1.001)
    const x = gx | 0, y = gy | 0, fx = gx - x, fy = gy - y, i = y * GW + x
    return (cur[i] * (1 - fx) + cur[i + 1] * fx) * (1 - fy) + (cur[i + GW] * (1 - fx) + cur[i + GW + 1] * fx) * fy
  }
  function grad(px, py) {
    const e = W / GW
    return { x: (heightAt(px + e, py) - heightAt(px - e, py)) / (2 * e), y: (heightAt(px, py + e) - heightAt(px, py - e)) / (2 * e) }
  }

  // ---------- GL ----------
  function sh(type, src) {
    const s = gl.createShader(type)
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('living-pond: ' + gl.getShaderInfoLog(s))
    return s
  }
  const prog = gl.createProgram()
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS))
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS))
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('living-pond: ' + gl.getProgramInfoLog(prog))
  gl.useProgram(prog)
  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const aLoc = gl.getAttribLocation(prog, 'a')
  gl.enableVertexAttribArray(aLoc)
  gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0)
  const UL = {}
  for (const n of ['uH', 'uS', 'uTx', 'uT', 'uAsp', 'uRef', 'uCau', 'uAmb', 'uRefl', 'uBase', 'uSpec', 'uSky', 'uSky2', 'uSpecC', 'uLight']) UL[n] = gl.getUniformLocation(prog, n)
  function mkTex(unit) {
    const t = gl.createTexture()
    gl.activeTexture(gl.TEXTURE0 + unit)
    gl.bindTexture(gl.TEXTURE_2D, t)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    return t
  }
  const hTex = mkTex(0)
  const sTex = mkTex(1)
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
  gl.uniform1i(UL.uH, 0)
  gl.uniform1i(UL.uS, 1)
  gl.uniform1f(UL.uRef, 0.05)
  gl.uniform1f(UL.uCau, 0.75)
  gl.uniform1f(UL.uAmb, 0.16)
  gl.uniform1f(UL.uRefl, 0.85)
  gl.uniform1f(UL.uBase, 0.08)
  gl.uniform1f(UL.uSpec, 0.85)

  // ---------- pointer (live wallpaper only) ----------
  const ptr = { x: -1e4, y: -1e4, vx: 0, vy: 0, t: -1e9, in: false }
  const moving = () => ptr.in && now - ptr.t < 260
  function trail(x0, y0, x1, y1, speed) {
    const d = Math.hypot(x1 - x0, y1 - y0), steps = Math.max(1, Math.ceil(d / (7 * U)))
    const amp = clamp(speed / 2600, 0.03, 0.32) / Math.sqrt(steps)
    for (let i = 1; i <= steps; i++) disturb(x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps, 10 * U, -amp)
  }
  function onPointer(e) {
    if (ctx.reducedMotion || !W) return
    const t = performance.now()
    if (e.type === 'down') {
      disturb(e.x, e.y, 22 * U, -1.5)
      for (const f of frogs) if (Math.hypot(f.x - e.x, f.y - e.y) < f.pad.r * 2.6) { f.cool = 0; hop(f, e.x, e.y) }
      for (const q of fish) if (Math.hypot(q.x - e.x, q.y - e.y) < 260 * U) q.fear = 1
    }
    if (e.type !== 'move') return
    if (ptr.in && t - ptr.t < 500) {
      const dt = Math.max(8, t - ptr.t) / 1000
      const vx = (e.x - ptr.x) / dt, vy = (e.y - ptr.y) / dt
      ptr.vx = ptr.vx * 0.6 + vx * 0.4
      ptr.vy = ptr.vy * 0.6 + vy * 0.4
      trail(ptr.x, ptr.y, e.x, e.y, Math.hypot(vx, vy))
    } else {
      ptr.vx = ptr.vy = 0
    }
    ptr.x = e.x
    ptr.y = e.y
    ptr.t = t
    ptr.in = true
  }

  // ---------- floating things ----------
  function stepFloat(f, dt, o) {
    const g = grad(f.x, f.y)
    f.vx -= g.x * o.wave * dt
    f.vy -= g.y * o.wave * dt
    if (moving()) {
      const dx = f.x - ptr.x, dy = f.y - ptr.y, d = Math.hypot(dx, dy) || 1
      if (d < o.reach) {
        const k = (1 - d / o.reach) ** 2
        f.vx += (ptr.vx * 0.5 + dx / d * 140) * k * dt * o.push
        f.vy += (ptr.vy * 0.5 + dy / d * 140) * k * dt * o.push
        f.va += ((dx * ptr.vy - dy * ptr.vx) / (d * 900)) * k * dt * o.push
      }
    }
    if (o.home) {
      f.vx += (f.hx - f.x) * o.home * dt
      f.vy += (f.hy - f.y) * o.home * dt
    }
    if (o.flow) o.flow(f, dt)
    const m = o.margin
    if (f.x < m) f.vx += (m - f.x) * 3 * dt
    if (f.x > W - m) f.vx -= (f.x - W + m) * 3 * dt
    if (f.y < m) f.vy += (m - f.y) * 3 * dt
    if (f.y > H - m) f.vy -= (f.y - H + m) * 3 * dt
    const dr = Math.exp(-o.drag * dt)
    f.vx *= dr
    f.vy *= dr
    f.va *= Math.exp(-1.6 * dt)
    const sp = Math.hypot(f.vx, f.vy), cap = 380 * U
    if (sp > cap) { f.vx *= cap / sp; f.vy *= cap / sp }
    f.x += f.vx * dt
    f.y += f.vy * dt
    f.a += f.va * dt
  }
  function separate(list) {
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, min = (a.r + b.r) * 0.85
      if (d < min) {
        const p = (min - d) * 0.5, nx = dx / d, ny = dy / d
        a.x -= nx * p; a.y -= ny * p; b.x += nx * p; b.y += ny * p
        const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny
        if (rv < 0) { a.vx += rv * nx * 0.5; a.vy += rv * ny * 0.5; b.vx -= rv * nx * 0.5; b.vy -= rv * ny * 0.5 }
      }
    }
  }
  function scatter(n, minD, margin) {
    const pts = []
    for (let tries = 0; pts.length < n && tries < 4000; tries++) {
      const p = { x: rnd(margin, W - margin), y: rnd(margin, H - margin * 1.3) }
      if (pts.every((q) => Math.hypot(q.x - p.x, q.y - p.y) > minD)) pts.push(p)
    }
    while (pts.length < n) pts.push({ x: rnd(margin, W - margin), y: rnd(margin, H - margin) })
    return pts
  }
  function softBlob(c, x, y, rx, ry, a, rgba0) {
    c.save()
    c.translate(x, y)
    c.rotate(a)
    c.scale(1, ry / rx)
    const g = c.createRadialGradient(0, 0, 0, 0, 0, rx)
    g.addColorStop(0, rgba0)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    c.fillStyle = g
    c.fillRect(-rx, -rx, rx * 2, rx * 2)
    c.restore()
  }

  // ---------- the pond floor (drawn once per layout) ----------
  function drawBottom() {
    const w = SW, h = SH, s = SS * U, c = bc
    let g = c.createLinearGradient(0, 0, w, h)
    g.addColorStop(0, '#a3b886'); g.addColorStop(0.5, '#7a9a72'); g.addColorStop(1, '#55765f')
    c.fillStyle = g
    c.fillRect(0, 0, w, h)
    for (let i = 0; i < w * h / 80; i++) {
      c.fillStyle = `rgba(${pick(['90,85,55', '245,240,210', '60,80,60'])},${rnd(0.03, 0.08)})`
      c.fillRect(Math.random() * w, Math.random() * h, rnd(0.6, 1.8) * s, rnd(0.6, 1.8) * s)
    }
    for (let i = 0; i < 40; i++) softBlob(c, rnd(0.15, 0.85) * w, rnd(0.15, 0.85) * h, rnd(40, 120) * s, rnd(25, 70) * s, rnd(0, 3), Math.random() < 0.6 ? 'rgba(30,50,35,0.22)' : 'rgba(170,160,110,0.14)')
    const cols = ['#b9b1a3', '#9e978b', '#c9a98f', '#8e9c94', '#d8cdbd', '#a88f86']
    for (let i = 0; i < 110; i++) { // pebbles gather toward the banks
      const edge = Math.random() < 0.5
      const x = edge ? pick([rnd(0, 0.14), rnd(0.86, 1)]) * w : rnd(0, w)
      const y = edge ? rnd(0, h) : pick([rnd(0, 0.15), rnd(0.85, 1)]) * h
      const r = rnd(3, 13) * s, a = rnd(0, 6.28), sq = rnd(0.55, 0.9)
      softBlob(c, x + r * 0.2, y + r * 0.25, r * 1.2, r * 1.2 * sq, a, 'rgba(30,45,35,0.2)')
      c.save(); c.translate(x, y); c.rotate(a); c.scale(1, sq)
      const pg = c.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r)
      pg.addColorStop(0, 'rgba(240,234,220,0.9)'); pg.addColorStop(0.45, pick(cols)); pg.addColorStop(1, 'rgba(80,85,75,0.85)')
      c.fillStyle = pg; c.beginPath(); c.arc(0, 0, r, 0, 6.283); c.fill(); c.restore()
    }
    for (let i = 0; i < 22; i++) { // sunken leaves
      c.save(); c.translate(rnd(0, w), rnd(0, h)); c.rotate(rnd(0, 6.28))
      c.fillStyle = `rgba(${pick(['130,95,45', '110,80,40', '150,110,55'])},${rnd(0.25, 0.4)})`
      const l = rnd(10, 22) * s
      c.beginPath(); c.ellipse(0, 0, l, l * 0.42, 0, 0, 6.283); c.fill(); c.restore()
    }
    c.lineCap = 'round'
    for (let k = 0; k < 10; k++) { // weed tufts by the banks
      const corner = pick([[0, rnd(0, h)], [w, rnd(0, h)], [rnd(0, w), 0], [rnd(0, w), h]])
      for (let j = 0; j < 7; j++) {
        c.strokeStyle = `rgba(${pick(['40,80,45', '60,100,55', '35,70,45'])},${rnd(0.35, 0.6)})`
        c.lineWidth = rnd(2, 4) * s
        const ang = rnd(0, 6.28), len = rnd(40, 110) * s
        c.beginPath(); c.moveTo(corner[0], corner[1])
        c.quadraticCurveTo(corner[0] + Math.cos(ang + 0.6) * len * 0.6, corner[1] + Math.sin(ang + 0.6) * len * 0.6, corner[0] + Math.cos(ang) * len, corner[1] + Math.sin(ang) * len)
        c.stroke()
      }
    }
    g = c.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.6) // deeper in the middle
    g.addColorStop(0, 'rgba(15,40,35,0.32)'); g.addColorStop(1, 'rgba(15,40,35,0)')
    c.fillStyle = g; c.fillRect(0, 0, w, h)
    g = c.createRadialGradient(w * 0.1, h * 0.05, 0, w * 0.1, h * 0.05, Math.max(w, h) * 0.8) // sun from the top left
    g.addColorStop(0, 'rgba(255,200,120,0.18)'); g.addColorStop(1, 'rgba(255,200,120,0)')
    c.fillStyle = g; c.fillRect(0, 0, w, h)
  }

  // ---------- the residents ----------
  function populate() {
    const R = clamp(54 * U, 32, 88), BL = clamp(72 * U, 44, 112), FL = clamp(64 * U, 38, 100)
    const spots = scatter(11, Math.max(R, BL) * 2.1, Math.max(R, BL) * 1.2)
    pads = spots.slice(0, 7).map((p) => ({ ...p, hx: p.x, hy: p.y, vx: 0, vy: 0, a: rnd(0, 6.28), va: rnd(-0.05, 0.05), r: R * rnd(0.75, 1.25), notch: rnd(0, 6.28), frog: null, claimed: false, flower: Math.random() < 0.35 ? pick(['#fbe9ef', '#f6c6d6', '#fff4e0']) : null }))
    boats = spots.slice(7, 11).map((p, i) => ({ ...p, vx: 0, vy: 0, a: rnd(0, 6.28), va: 0, L: BL * rnd(0.85, 1.15), r: BL * 0.45, col: PAPERS[i % PAPERS.length], frog: null, claimed: false, boat: true }))
    petals = []
    frogs = [...pads].sort(() => Math.random() - 0.5).slice(0, 3).map((pad, i) => {
      const f = { pad, x: pad.x, y: pad.y, z: 0, face: rnd(0, 6.28), size: R * rnd(0.6, 0.72), hop: null, cool: 0, next: rnd(8, 18) + i * 4, blink: rnd(2, 6), br: rnd(0, 6) }
      pad.frog = f
      return f
    })
    fish = Array.from({ length: 9 }, (_, i) => ({ x: rnd(0.15, 0.85) * W, y: rnd(0.15, 0.85) * H, a: rnd(0, 6.28), sp: 30 * U, L: FL * rnd(0.7, 1.2), col: FISH_COLS[i % FISH_COLS.length], ph: rnd(0, 6.28), tx: rnd(0.15, 0.85) * W, ty: rnd(0.15, 0.85) * H, wt: rnd(3, 8), nib: rnd(1, 3), fear: 0, seed: rnd(0, 100) }))
    flies = Array.from({ length: 14 }, () => ({ x: rnd(0, W), y: rnd(0, H), ph: rnd(0, 6.28), a: rnd(0, 6.28), sp: rnd(10, 22) }))
    dropT = rnd(2, 4)
  }

  function hop(f, awayX, awayY) {
    if (f.hop || f.cool > 0) return
    const maxD = Math.max(W, H) * 0.42
    let best = null, bestS = -1e9
    for (const p of [...pads, ...boats]) {
      if (p.frog || p.claimed || p === f.pad) continue
      const d = Math.hypot(p.x - f.x, p.y - f.y)
      if (d > maxD) continue
      let sc = -Math.abs(d - Math.min(W, H) * 0.24) * 0.6 + rnd(0, 40)
      if (p.boat) sc -= Math.random() < 0.35 ? 0 : 150 // now and then a frog takes a ride on a boat
      if (awayX !== undefined) sc += Math.hypot(p.x - awayX, p.y - awayY) * 1.2
      if (sc > bestS) { bestS = sc; best = p }
    }
    if (!best) return
    disturb(f.x, f.y, f.pad.r * 0.6, -0.45)
    f.pad.vx -= (best.x - f.x) * 0.25
    f.pad.vy -= (best.y - f.y) * 0.25
    f.pad.frog = null
    best.claimed = true
    f.hop = { x0: f.x, y0: f.y, to: best, t: 0, dur: 0.5 + Math.hypot(best.x - f.x, best.y - f.y) / (900 * U) }
  }

  function update(dt) {
    const oPad = { wave: 1500 * U, reach: 150 * U, push: 1.2, drag: 1.2, margin: 30 * U, home: 0.6 }
    const oBoat = { wave: 2600 * U, reach: 170 * U, push: 2.2, drag: 0.55, margin: 50 * U,
      flow: (f, d) => { f.vx += (-(f.y - H / 2) * 0.012 + 2) * U * d; f.vy += ((f.x - W / 2) * 0.012) * U * d } }
    for (const p of pads) { stepFloat(p, dt, oPad); p.va += Math.sin(T * 0.2 + p.hx) * 0.004 * dt }
    for (const b of boats) {
      stepFloat(b, dt, oBoat)
      const sp = Math.hypot(b.vx, b.vy)
      if (sp > 6) b.va += angDiff(Math.atan2(b.vy, b.vx), b.a) * 0.7 * dt * Math.min(1, sp / 60)
    }
    separate([...pads, ...boats])
    const oPetal = { ...oBoat, wave: 3400 * U, push: 3, drag: 0.8, margin: 20 * U }
    for (const p of petals) stepFloat(p, dt, oPetal)
    if ((dropT -= dt) < 0) { // a petal falls from a tree above the pond
      dropT = rnd(3, 7)
      const x = rnd(0.1, 0.9) * W, y = rnd(0.1, 0.85) * H
      disturb(x, y, 7 * U, -0.9)
      petals.push({ x, y, vx: 0, vy: 0, a: rnd(0, 6.28), va: rnd(-0.4, 0.4), r: rnd(6, 10) * U, col: pick(['#f7c9d4', '#f9dbe2', '#f3b8c6']), born: now })
      if (petals.length > 14) petals.shift()
    }

    for (const f of frogs) {
      f.cool -= dt; f.next -= dt; f.blink -= dt; f.br += dt * 2.2
      if (f.blink < -0.14) f.blink = rnd(2.5, 7)
      if (f.hop) {
        const h = f.hop
        h.t += dt / h.dur
        const t = Math.min(1, h.t), e = t * t * (3 - 2 * t)
        f.x = h.x0 + (h.to.x - h.x0) * e
        f.y = h.y0 + (h.to.y - h.y0) * e
        f.z = Math.sin(Math.PI * t)
        f.face += angDiff(Math.atan2(h.to.y - h.y0, h.to.x - h.x0), f.face) * Math.min(1, dt * 14)
        if (t >= 1) {
          const p = h.to
          p.claimed = false; p.frog = f; f.pad = p; f.hop = null; f.z = 0; f.cool = 1.4; f.next = rnd(12, 24)
          disturb(f.x, f.y, p.r * 0.9, -1.0)
          p.vx += Math.cos(f.face) * 40 * U
          p.vy += Math.sin(f.face) * 40 * U
          for (const q of fish) if (Math.hypot(q.x - f.x, q.y - f.y) < 180 * U) q.fear = Math.max(q.fear, 0.7)
        }
        continue
      }
      f.x = f.pad.x; f.y = f.pad.y; f.face += f.pad.va * dt; f.z = 0
      if (moving() && Math.hypot(f.x - ptr.x, f.y - ptr.y) < f.pad.r * 1.8) hop(f, ptr.x, ptr.y)
      else if (Math.abs(heightAt(f.x, f.y)) > 0.75) hop(f, ptr.in ? ptr.x : undefined, ptr.y)
      else if (f.next < 0) { f.next = rnd(12, 24); hop(f) }
    }

    // fish: wander; dart from a quick hand or a splash; come close, curious, to a hand that rests still
    const still = ptr.in && now - ptr.t > 900 && now - ptr.t < 60000
    const fast = moving() && Math.hypot(ptr.vx, ptr.vy) > 260 * U
    const m = 70 * U
    for (const q of fish) {
      const dx = q.x - ptr.x, dy = q.y - ptr.y, d = Math.hypot(dx, dy) || 1
      if (fast && d < 170 * U) q.fear = 1
      if (Math.abs(heightAt(q.x, q.y)) > 0.9) q.fear = Math.max(q.fear, 0.8)
      q.fear = Math.max(0, q.fear - dt * 0.5)
      let ta, ts, turn = 2.2
      if (q.fear > 0.05) {
        ta = Math.atan2(dy, dx) + Math.sin(q.seed) * 0.6; ts = (90 + 170 * q.fear) * U; turn = 6
      } else if (still && d < 300 * U) {
        ta = Math.atan2(-dy, -dx); ts = d < 55 * U ? 6 * U : clamp(d * 0.35, 18, 70) * U
        if (d < 70 * U && (q.nib -= dt) < 0) { // a nibble at your fingertip
          q.nib = rnd(0.7, 1.8)
          disturb(q.x + Math.cos(q.a) * q.L * 0.45, q.y + Math.sin(q.a) * q.L * 0.45, 4 * U, -0.28)
        }
      } else {
        q.wt -= dt
        if (q.wt < 0 || Math.hypot(q.tx - q.x, q.ty - q.y) < 40 * U) {
          q.wt = rnd(4, 10)
          const shade = Math.random() < 0.35 ? pick(pads) : null // sometimes they rest in the shade of a pad
          q.tx = shade ? shade.x + rnd(-30, 30) * U : rnd(0.12, 0.88) * W
          q.ty = shade ? shade.y + rnd(-30, 30) * U : rnd(0.12, 0.88) * H
        }
        ta = Math.atan2(q.ty - q.y, q.tx - q.x); ts = (26 + 22 * Math.sin(T * 0.4 + q.seed) ** 2) * U
      }
      if (q.x < m || q.x > W - m || q.y < m || q.y > H - m) { ta = Math.atan2(H / 2 - q.y, W / 2 - q.x); turn = Math.max(turn, 3) }
      q.a += clamp(angDiff(ta, q.a), -turn * dt, turn * dt)
      q.sp += (ts - q.sp) * Math.min(1, dt * (q.fear > 0.05 ? 6 : 1.5))
      q.x += Math.cos(q.a) * q.sp * dt
      q.y += Math.sin(q.a) * q.sp * dt
      q.ph += dt * (3 + q.sp / (12 * U))
    }
    for (let i = 0; i < fish.length; i++) for (let j = i + 1; j < fish.length; j++) {
      const a = fish[i], b = fish[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, min = (a.L + b.L) * 0.32
      if (d < min) { const p = (min - d) * 0.5 / d; a.x -= dx * p; a.y -= dy * p; b.x += dx * p; b.y += dy * p }
    }
    for (const q of flies) {
      q.a += rnd(-1.2, 1.2) * dt
      q.x = clamp(q.x + Math.cos(q.a) * q.sp * U * dt, -20, W + 20)
      q.y = clamp(q.y + Math.sin(q.a) * q.sp * U * dt, -20, H + 20)
      if (q.x <= -20 || q.x >= W + 20 || q.y <= -20 || q.y >= H + 20) q.a += Math.PI
    }
  }

  // ---------- drawing ----------
  function drawFish(c, q, s, shadow) {
    const N = 9, len = q.L * s, amp = len * 0.07 * (1 + Math.min(2, q.sp / (90 * U)))
    const ca = Math.cos(q.a), sa = Math.sin(q.a)
    const ox = shadow ? 14 * U * s : 0, oy = shadow ? 20 * U * s : 0
    const sp = []
    for (let i = 0; i <= N; i++) {
      const t = i / N, along = (0.5 - t) * len, lat = Math.sin(q.ph - t * 3.4) * amp * t * t
      sp.push({ x: q.x * s + ca * along - sa * lat + ox, y: q.y * s + sa * along + ca * lat + oy })
    }
    const wd = (t) => len * 0.15 * (t < 0.28 ? 0.62 + (t / 0.28) * 0.38 : 1 - ((t - 0.28) / 0.72) * 0.86)
    const left = [], right = []
    for (let i = 0; i <= N; i++) {
      const a = sp[Math.max(0, i - 1)], b = sp[Math.min(N, i + 1)]
      let nx = -(b.y - a.y), ny = b.x - a.x
      const nl = Math.hypot(nx, ny) || 1
      nx /= nl; ny /= nl
      const w = wd(i / N)
      left.push({ x: sp[i].x + nx * w, y: sp[i].y + ny * w })
      right.push({ x: sp[i].x - nx * w, y: sp[i].y - ny * w })
    }
    const tail = sp[N], pre = sp[N - 1], ta = Math.atan2(tail.y - pre.y, tail.x - pre.x), flick = Math.sin(q.ph - 3.6) * 0.35
    const body = () => {
      c.beginPath(); c.moveTo(left[0].x, left[0].y)
      c.quadraticCurveTo(sp[0].x + ca * len * 0.08, sp[0].y + sa * len * 0.08, right[0].x, right[0].y)
      for (let i = 1; i <= N; i++) c.lineTo(right[i].x, right[i].y)
      for (let i = N; i >= 0; i--) c.lineTo(left[i].x, left[i].y)
      c.closePath()
    }
    const fins = (col) => {
      c.fillStyle = col
      for (const side of [-1, 1]) { // tail lobes
        const fa = ta + flick + side * 0.55
        c.beginPath(); c.moveTo(tail.x, tail.y)
        c.quadraticCurveTo(tail.x + Math.cos(fa) * len * 0.2, tail.y + Math.sin(fa) * len * 0.2, tail.x + Math.cos(fa + side * 0.15) * len * 0.3, tail.y + Math.sin(fa + side * 0.15) * len * 0.3)
        c.lineTo(tail.x + Math.cos(ta + flick) * len * 0.14, tail.y + Math.sin(ta + flick) * len * 0.14)
        c.closePath(); c.fill()
      }
      const p2 = sp[2], pa = q.a + Math.PI
      for (const side of [-1, 1]) { // side fins
        const fa = pa + side * (1.9 + Math.sin(q.ph * 0.7) * 0.2)
        c.beginPath()
        c.ellipse(p2.x + Math.cos(q.a + side * Math.PI / 2) * len * 0.12, p2.y + Math.sin(q.a + side * Math.PI / 2) * len * 0.12, len * 0.09, len * 0.035, fa, 0, 6.283)
        c.fill()
      }
    }
    if (shadow) {
      c.save(); c.globalAlpha = 0.22; fins('rgb(15,35,25)'); c.fillStyle = 'rgb(15,35,25)'; body(); c.fill(); c.restore()
      return
    }
    fins(q.col.fin)
    body()
    const g = c.createLinearGradient(left[3].x, left[3].y, right[3].x, right[3].y)
    g.addColorStop(0, q.col.body); g.addColorStop(0.5, q.col.belly); g.addColorStop(1, q.col.body)
    c.fillStyle = g
    c.fill()
    if (q.col.spots) {
      c.save(); body(); c.clip(); c.fillStyle = q.col.spots
      for (const [i, side, r] of [[2, 0.4, 0.13], [4, -0.5, 0.1], [6, 0.2, 0.08]]) {
        const p = sp[i]
        c.beginPath(); c.arc(p.x - sa * side * len * 0.1, p.y + ca * side * len * 0.1, len * r, 0, 6.283); c.fill()
      }
      c.restore()
    }
    c.strokeStyle = 'rgba(255,255,240,0.25)'
    c.lineWidth = Math.max(0.8, len * 0.02)
    c.beginPath(); c.moveTo(sp[1].x, sp[1].y)
    for (let i = 2; i < N - 1; i++) c.lineTo(sp[i].x, sp[i].y)
    c.stroke()
    c.fillStyle = '#1a1612'
    for (const side of [-1, 1]) { const p = sp[1]; c.beginPath(); c.arc(p.x - sa * side * len * 0.075, p.y + ca * side * len * 0.075, Math.max(0.8, len * 0.022), 0, 6.283); c.fill() }
  }

  function drawBoat(c, b) {
    const h = heightAt(b.x, b.y), g = grad(b.x, b.y)
    const len = b.L * (1 + h * 0.035), wd = len * 0.42
    const tilt = clamp((g.x * Math.cos(b.a) + g.y * Math.sin(b.a)) * 40, -0.25, 0.25)
    const hull = () => {
      c.beginPath(); c.moveTo(-len / 2, 0); c.lineTo(-len / 4, -wd / 2); c.lineTo(len / 4, -wd / 2); c.lineTo(len / 2, 0); c.lineTo(len / 4, wd / 2); c.lineTo(-len / 4, wd / 2); c.closePath()
    }
    c.save(); c.translate(b.x, b.y); c.rotate(b.a)
    c.shadowColor = 'rgba(20,50,45,0.25)'; c.shadowBlur = 6 * U; c.shadowOffsetY = 2 * U
    c.fillStyle = b.col; hull(); c.fill()
    c.shadowColor = 'transparent'
    c.fillStyle = `rgba(40,50,60,${0.12 + tilt * 0.2})` // the shaded half
    c.beginPath(); c.moveTo(-len / 2, 0); c.lineTo(len / 2, 0); c.lineTo(len / 4, wd / 2); c.lineTo(-len / 4, wd / 2); c.closePath(); c.fill()
    c.strokeStyle = 'rgba(60,60,60,0.18)'; c.lineWidth = Math.max(0.8, 1.1 * U)
    hull(); c.stroke()
    c.beginPath(); c.moveTo(-len / 2, 0); c.lineTo(-len * 0.2, 0); c.moveTo(len * 0.2, 0); c.lineTo(len / 2, 0)
    c.moveTo(-len / 4, -wd / 2); c.lineTo(-len * 0.2, 0); c.moveTo(len / 4, -wd / 2); c.lineTo(len * 0.2, 0)
    c.moveTo(-len / 4, wd / 2); c.lineTo(-len * 0.2, 0); c.moveTo(len / 4, wd / 2); c.lineTo(len * 0.2, 0); c.stroke()
    c.fillStyle = 'rgba(30,40,50,0.18)' // the upright sail, seen from above, and the shadow it throws
    c.beginPath(); c.moveTo(-len * 0.2, 0); c.lineTo(0, wd * 0.42); c.lineTo(len * 0.2, 0); c.closePath(); c.fill()
    const sg = c.createLinearGradient(0, -wd * 0.14, 0, wd * 0.14)
    sg.addColorStop(0, '#ffffff'); sg.addColorStop(1, b.col)
    c.fillStyle = sg
    c.beginPath(); c.moveTo(-len * 0.2, 0); c.lineTo(0, -wd * 0.13); c.lineTo(len * 0.2, 0); c.lineTo(0, wd * 0.05); c.closePath(); c.fill()
    c.strokeStyle = 'rgba(60,60,60,0.25)'; c.stroke()
    c.restore()
  }

  function drawBloom(c, x, y, r, col, a) {
    c.save(); c.translate(x, y); c.rotate(a)
    for (const [n, rr, off, shade] of [[9, 1, 0, 0.82], [7, 0.72, 0.35, 0.92], [5, 0.45, 0.1, 1]]) {
      for (let k = 0; k < n; k++) {
        c.save(); c.rotate(k / n * 6.283 + off)
        const g = c.createLinearGradient(0, 0, r * rr, 0)
        g.addColorStop(0, '#fffaf0'); g.addColorStop(1, col)
        c.globalAlpha = shade; c.fillStyle = g
        c.beginPath(); c.ellipse(r * rr * 0.55, 0, r * rr * 0.55, r * rr * 0.22, 0, 0, 6.283); c.fill(); c.restore()
      }
    }
    c.globalAlpha = 1; c.fillStyle = '#f2c94c'; c.beginPath(); c.arc(0, 0, r * 0.16, 0, 6.283); c.fill(); c.restore()
  }

  function drawPad(c, p) {
    const r = p.r * (1 + heightAt(p.x, p.y) * 0.025)
    c.save(); c.translate(p.x, p.y); c.rotate(p.a + p.notch)
    const g = c.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r)
    g.addColorStop(0, '#79a54c'); g.addColorStop(0.7, '#4f7f35'); g.addColorStop(1, '#3a6128')
    c.fillStyle = g; c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, r, 0.16, 6.283 - 0.16); c.closePath(); c.fill()
    c.strokeStyle = 'rgba(170,210,110,0.28)'; c.lineWidth = Math.max(0.8, r * 0.02)
    c.beginPath()
    for (let k = 0; k < 14; k++) { const a = 0.3 + k / 14 * (6.283 - 0.6); c.moveTo(0, 0); c.lineTo(Math.cos(a) * r * 0.92, Math.sin(a) * r * 0.92) }
    c.stroke()
    c.strokeStyle = 'rgba(200,230,140,0.4)'; c.lineWidth = Math.max(1, r * 0.035)
    c.beginPath(); c.arc(0, 0, r * 0.98, 0.2, 6.283 - 0.2); c.stroke()
    const sh2 = c.createRadialGradient(-r * 0.5, -r * 0.5, 0, -r * 0.5, -r * 0.5, r * 1.3)
    sh2.addColorStop(0, 'rgba(255,190,120,0.18)'); sh2.addColorStop(1, 'rgba(255,190,120,0)')
    c.fillStyle = sh2; c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, r, 0.16, 6.283 - 0.16); c.closePath(); c.fill()
    c.restore()
    if (p.flower) drawBloom(c, p.x + Math.cos(p.a + 2.4) * r * 0.62, p.y + Math.sin(p.a + 2.4) * r * 0.62, r * 0.32, p.flower, p.a)
  }

  function drawFrog(c, f) {
    const s = f.size * (1 + f.z * 0.38), br = Math.sin(f.br) * 0.5 + 0.5
    c.save(); c.translate(f.x, f.y - f.z * 10 * U); c.rotate(f.face)
    c.shadowColor = 'rgba(10,15,8,0.45)'; c.shadowBlur = 6 * U; c.shadowOffsetX = 2 * U; c.shadowOffsetY = 3 * U
    const leg = f.z ? 0.5 + f.z * 0.6 : 0
    c.fillStyle = '#4e7d33'
    for (const side of [-1, 1]) { // back legs folded (stretched out mid-hop)
      c.save(); c.scale(1, side)
      c.beginPath(); c.ellipse(-s * (0.32 + leg * 0.25), s * 0.26, s * 0.26, s * 0.1, -0.5 + leg * 0.4, 0, 6.283); c.fill()
      c.beginPath(); c.ellipse(-s * (0.18 + leg * 0.5), s * 0.36, s * 0.2, s * 0.07, 0.3 - leg * 0.3, 0, 6.283); c.fill()
      c.beginPath(); c.ellipse(s * 0.2, s * 0.26, s * 0.13, s * 0.05, 0.6, 0, 6.283); c.fill()
      c.restore()
    }
    c.shadowColor = 'transparent'
    const g = c.createRadialGradient(-s * 0.1, -s * 0.12, s * 0.05, 0, 0, s * 0.5)
    g.addColorStop(0, '#9cc860'); g.addColorStop(0.7, '#5f9238'); g.addColorStop(1, '#3f6a27')
    c.fillStyle = g
    c.beginPath(); c.ellipse(-s * 0.05, 0, s * 0.4, s * 0.29, 0, 0, 6.283); c.fill()
    c.beginPath(); c.ellipse(s * 0.3, 0, s * 0.22, s * 0.25 * (1 + br * 0.03), 0, 0, 6.283); c.fill()
    c.fillStyle = 'rgba(40,70,25,0.55)'
    for (const [sx, sy, sr] of [[-0.18, -0.08, 0.06], [-0.02, 0.1, 0.05], [-0.28, 0.09, 0.045], [0.05, -0.13, 0.04]]) { c.beginPath(); c.arc(s * sx, s * sy, s * sr, 0, 6.283); c.fill() }
    c.strokeStyle = 'rgba(210,235,150,0.35)'; c.lineWidth = Math.max(0.8, s * 0.02)
    c.beginPath(); c.moveTo(-s * 0.4, -s * 0.05); c.quadraticCurveTo(0, -s * 0.2, s * 0.32, -s * 0.12); c.stroke()
    for (const side of [-1, 1]) { // eyes
      const ex = s * 0.36, ey = side * s * 0.15, blink = f.blink < 0
      c.fillStyle = '#5f9238'; c.beginPath(); c.arc(ex, ey, s * 0.1, 0, 6.283); c.fill()
      c.fillStyle = blink ? '#4e7d33' : '#e2c25a'; c.beginPath(); c.arc(ex, ey, s * 0.075, 0, 6.283); c.fill()
      if (!blink) {
        c.fillStyle = '#16120a'; c.beginPath(); c.ellipse(ex, ey, s * 0.025, s * 0.055, 0, 0, 6.283); c.fill()
        c.fillStyle = 'rgba(255,255,240,0.9)'; c.beginPath(); c.arc(ex - s * 0.025, ey - s * 0.025, s * 0.017, 0, 6.283); c.fill()
      }
    }
    c.restore()
  }

  function drawFloor(c) {
    const s = SS
    c.drawImage(bottom, 0, 0)
    for (const p of pads) softBlob(c, (p.x + p.r * 0.18) * s, (p.y + p.r * 0.26) * s, p.r * 1.15 * s, p.r * 1.0 * s, 0, 'rgba(15,30,20,0.38)')
    for (const b of boats) {
      c.save(); c.translate((b.x + 16 * U) * s, (b.y + 22 * U) * s); c.rotate(b.a); c.scale(1, 0.5)
      const g = c.createRadialGradient(0, 0, 0, 0, 0, b.L * 0.62 * s)
      g.addColorStop(0, 'rgba(20,45,35,0.4)'); g.addColorStop(1, 'rgba(20,45,35,0)')
      c.fillStyle = g; c.fillRect(-b.L * s, -b.L * s, b.L * 2 * s, b.L * 2 * s); c.restore()
    }
    for (const p of petals) softBlob(c, (p.x + 6 * U) * s, (p.y + 9 * U) * s, p.r * 1.3 * s, p.r * 0.8 * s, p.a, 'rgba(20,45,35,0.22)')
    for (const f of frogs) if (f.hop) softBlob(c, (f.x + 10 * U) * s, (f.y + 14 * U) * s, f.size * 0.6 * s, f.size * 0.45 * s, f.face, `rgba(15,30,20,${0.35 * (1 - f.z * 0.5)})`)
    for (const q of fish) drawFish(c, q, s, true)
    for (const q of fish) drawFish(c, q, s, false)
  }

  function drawOver(c) {
    c.clearRect(0, 0, W, H)
    for (const p of pads) drawPad(c, p)
    for (const p of petals) {
      const age = clamp((now - p.born) / 400, 0, 1)
      c.save(); c.translate(p.x, p.y - (1 - age) * 30 * U); c.rotate(p.a); c.globalAlpha = 0.95 * age
      const g = c.createLinearGradient(-p.r, 0, p.r, 0)
      g.addColorStop(0, '#fff3f5'); g.addColorStop(1, p.col)
      c.fillStyle = g; c.beginPath(); c.ellipse(0, 0, p.r, p.r * 0.6, 0, 0, 6.283); c.fill(); c.restore()
    }
    for (const b of boats) drawBoat(c, b)
    for (const f of frogs) if (!f.hop) drawFrog(c, f)
    for (const f of frogs) if (f.hop) drawFrog(c, f)
    if (L.dim > 0.01) { // evening and night light on the things above the water
      c.save(); c.globalCompositeOperation = 'source-atop'
      c.fillStyle = `rgba(${L.over.map(Math.round).join(',')},${L.dim})`
      c.fillRect(0, 0, W, H); c.restore()
    }
    if (L.flies > 0.02) {
      c.save(); c.globalCompositeOperation = 'lighter'
      for (const q of flies) {
        const a = (0.15 + 0.85 * Math.max(0, Math.sin(T * 1.3 + q.ph)) ** 6) * L.flies
        softBlob(c, q.x, q.y, 14 * U, 14 * U, 0, `rgba(255,220,120,${0.35 * a})`)
        softBlob(c, q.x, q.y, 3 * U, 3 * U, 0, `rgba(255,250,200,${a})`)
      }
      c.restore()
    }
  }

  function render() {
    drawFloor(fc)
    for (let i = 0, n = GW * SIM_ROWS; i < n; i++) {
      let v = (32768 + cur[i] * HK) | 0
      v = v < 0 ? 0 : v > 65535 ? 65535 : v
      hbytes[2 * i] = v >> 8
      hbytes[2 * i + 1] = v & 255
    }
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, hTex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE_ALPHA, GW, SIM_ROWS, 0, gl.LUMINANCE_ALPHA, gl.UNSIGNED_BYTE, hbytes)
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, sTex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, floor)
    gl.uniform2f(UL.uTx, 1 / GW, 1 / SIM_ROWS)
    gl.uniform1f(UL.uT, T)
    gl.uniform1f(UL.uAsp, W / H)
    gl.uniform3fv(UL.uSky, L.sky); gl.uniform3fv(UL.uSky2, L.sky2); gl.uniform3fv(UL.uSpecC, L.spec); gl.uniform3fv(UL.uLight, L.light)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    drawOver(oc)
  }

  function layout() {
    const ow = W, oh = H
    DPR = Math.min(window.devicePixelRatio || 1, 1.5)
    W = container.clientWidth || window.innerWidth
    H = container.clientHeight || window.innerHeight
    U = clamp(Math.min(W / 1280, H / 720), 0.55, 2.2)
    glc.width = over.width = Math.round(W * DPR)
    glc.height = over.height = Math.round(H * DPR)
    oc.setTransform(DPR, 0, 0, DPR, 0, 0)
    SS = Math.min(1, FLOOR_MAX_W / W)
    SW = Math.round(W * SS); SH = Math.round(H * SS)
    floor.width = bottom.width = SW
    floor.height = bottom.height = SH
    gl.viewport(0, 0, glc.width, glc.height)
    initSim()
    drawBottom()
    if (!ow || !oh) { populate(); return }
    const kx = W / ow, ky = H / oh // keep everyone where they were, scaled to the new size
    for (const o of [...pads, ...boats, ...petals, ...fish, ...flies]) { o.x *= kx; o.y *= ky; if ('hx' in o) { o.hx *= kx; o.hy *= ky } }
  }

  function loop(t) {
    if (stopped) return
    frame = requestAnimationFrame(loop)
    if (document.hidden) { last = t; return }
    const dt = Math.min(0.05, (t - last) / 1000)
    last = t; now = t; T = t / 1000
    acc += dt
    let n = 0
    while (acc > 1 / 60 && n < 3) { simStep(); acc -= 1 / 60; n++ }
    if (n === 3) acc = 0
    easeLight(Math.min(1, dt / 20)) // a 20-second change of light
    update(dt)
    render()
  }

  layout()
  render()
  if (!ctx.reducedMotion) {
    last = performance.now()
    frame = requestAnimationFrame(loop)
  }
  requestAnimationFrame(() => requestAnimationFrame(() => ctx.ready()))

  const offClock = ctx.subscribe?.(({ timeOfDay }) => {
    target = LIGHTS[timeOfDay] || LIGHTS.day
    if (ctx.reducedMotion) { easeLight(1); render() }
  })
  const offPointer = ctx.onPointer?.(onPointer)
  let rz = 0
  const onResize = () => { clearTimeout(rz); rz = setTimeout(() => { layout(); render() }, 150) }
  window.addEventListener('resize', onResize)

  return {
    unmount() {
      stopped = true
      cancelAnimationFrame(frame)
      clearTimeout(rz)
      window.removeEventListener('resize', onResize)
      offPointer?.()
      offClock?.()
      gl.getExtension('WEBGL_lose_context')?.loseContext()
      container.replaceChildren()
    },
  }
}
