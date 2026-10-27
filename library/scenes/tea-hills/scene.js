// Tea Hills in Morning Mist — terraced tea gardens at sunrise, mist in the valley.
// The illustration is drawn through a small WebGL shader that adds:
//   - the tall shade trees swaying in slow, uneven gusts;
//   - the near tea leaves rustling (more around a moving hand);
//   - mist drifting inside the misty valleys and a thin moving veil over the slopes;
//   - soft sun rays from behind the left ridge;
//   - a colour grade that follows the PC clock (dawn = the painting, day, dusk,
//     moonlit night with stars and a lit cottage window).
// A 2D canvas on top adds dew glints on the leaves and, now and then, a few
// far-off birds crossing the sky.
// Live wallpaper: moving over the bushes makes the leaves rustle around the
// hand; resting on them gathers dew glints round it; a click shakes off a
// little burst of dew.
// With reducedMotion one still frame is drawn (again when the time of day changes).
// Masks (640×360, made from the picture): R = tree crowns, G = near tea leaves,
// B = sky; mist.png = the misty valleys.
import photoUrl from './tea-hills.jpg'
import maskUrl from './tea-hills-mask.png'
import mistUrl from './tea-hills-mist.png'

const IW = 2560
const IH = 1440
const SUN = [0.278, 0.24]
const WINDOW = [0.776, 0.466]
const FPS = 30

// grade: mul rgb, add rgb, saturation, mist, rays, night, window light
const GRADES = {
  dawn: [1.0, 1.0, 1.0, 0, 0, 0, 1.0, 1.0, 1.0, 0, 0.1],
  day: [1.04, 1.04, 1.06, 0.01, 0.01, 0.02, 1.06, 0.6, 0.6, 0, 0],
  dusk: [1.0, 0.8, 0.7, 0.05, 0.015, 0.03, 1.05, 0.9, 0.8, 0.15, 0.6],
  night: [0.32, 0.4, 0.62, 0.0, 0.01, 0.04, 0.6, 0.6, 0.0, 1, 1],
}
const GRADE_NAMES = ['uMul0', 'uMul1', 'uMul2', 'uAdd0', 'uAdd1', 'uAdd2', 'uSat', 'uMist', 'uRays', 'uNight', 'uWin']

const VS = 'attribute vec2 a;varying vec2 v;uniform vec2 uS;void main(){v=(a*vec2(0.5,-0.5))*uS+0.5;gl_Position=vec4(a,0.,1.);}'
const FS = `precision highp float;
varying vec2 v;
uniform sampler2D uImg, uMask, uFar;
uniform float uT, uAsp, uHand, uMul0, uMul1, uMul2, uAdd0, uAdd1, uAdd2, uSat, uMist, uRays, uNight, uWin;
uniform vec2 uMouse;
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<4;i++){ s+=a*vn(p); p*=2.03; a*=0.5; } return s; }
void main(){
  vec2 uv = v;
  vec4 m = vec4(texture2D(uMask, uv).rgb, texture2D(uFar, uv).r);
  float t = uT;
  float gust = 0.6 + 0.4 * sin(t * 0.37) * sin(t * 0.23 + 1.0);
  vec2 off = vec2(0.0);
  off.x += m.r * (sin(t * 1.25 + uv.y * 38.0 + uv.x * 9.0) * 0.0011 + sin(t * 0.5 + uv.x * 2.0) * 0.0012) * gust;
  off.y += m.r * cos(t * 1.6 + uv.x * 31.0) * 0.0006 * gust;
  vec2 dh = (uv - uMouse) * vec2(uAsp, 1.0);
  float hand = uHand * exp(-dot(dh, dh) / 0.012);
  off += m.g * vec2(sin(t * 2.2 + uv.x * 31.0 + uv.y * 17.0), cos(t * 1.9 + uv.y * 27.0 + uv.x * 5.0)) * (0.0006 * gust + hand * 0.0045);
  vec3 col = texture2D(uImg, uv + off).rgb;
  float n = fbm(vec2(uv.x * 4.0 - t * 0.018, uv.y * 9.0 + sin(uv.x * 3.0 + t * 0.05) * 0.4));
  float n2 = fbm(vec2(uv.x * 9.0 + t * 0.03, uv.y * 14.0));
  float mist = m.a * smoothstep(0.35, 0.8, n * 0.75 + n2 * 0.35) * uMist;
  vec3 mistCol = mix(vec3(0.95, 0.94, 0.88), vec3(0.62, 0.68, 0.8), uNight);
  col = mix(col, mistCol, mist * 0.55);
  float veil = smoothstep(0.42, 0.6, uv.y) * (1.0 - smoothstep(0.6, 0.78, uv.y)) * (1.0 - m.g);
  col = mix(col, mistCol, veil * smoothstep(0.45, 0.85, fbm(vec2(uv.x * 3.0 - t * 0.025, uv.y * 8.0))) * 0.28 * uMist);
  vec2 d = (uv - vec2(${SUN[0]}, ${SUN[1]})) * vec2(uAsp, 1.0);
  float ang = atan(d.y, d.x), len = length(d);
  float rays = pow(0.5 + 0.5 * sin(ang * 13.0 + sin(ang * 5.0 + t * 0.07) * 2.2 + t * 0.03), 3.0) * (0.55 + 0.45 * vn(vec2(ang * 9.0, t * 0.08)));
  rays = mix(rays, 0.35, 0.35);
  rays *= smoothstep(0.0, 0.08, len) * exp(-len * 2.2) * (m.b * 0.7 + m.a + m.r * 0.4 + 0.15) * step(-0.25, d.y);
  col += vec3(1.0, 0.86, 0.6) * rays * 0.1 * uRays * (0.85 + 0.15 * sin(t * 0.4));
  col += vec3(1.0, 0.85, 0.6) * exp(-len * len / 0.01) * 0.12 * uRays;
  float l = dot(col, vec3(0.3, 0.59, 0.11));
  col = mix(vec3(l), col, uSat);
  col = col * vec3(uMul0, uMul1, uMul2) + vec3(uAdd0, uAdd1, uAdd2);
  if (uNight > 0.0) {
    vec2 sp = uv * vec2(uAsp, 1.0) * 140.0;
    vec2 cid = floor(sp), cf = fract(sp) - 0.5 - (vec2(h21(cid + 7.0), h21(cid + 9.0)) - 0.5) * 0.6;
    float st = step(0.982, h21(cid)) * smoothstep(0.35, 0.05, uv.y) * m.b * smoothstep(0.22, 0.0, length(cf));
    st *= 0.5 + 0.5 * sin(t * 2.0 + h21(cid + 3.0) * 30.0);
    col += vec3(0.85, 0.9, 1.0) * st * 0.8 * uNight;
  }
  vec2 dw = (uv - vec2(${WINDOW[0]}, ${WINDOW[1]})) * vec2(uAsp, 1.0);
  col += vec3(1.0, 0.68, 0.32) * exp(-dot(dw, dw) / 0.00012) * 0.9 * uWin * (0.9 + 0.1 * sin(t * 3.0));
  col += vec3(1.0, 0.6, 0.3) * exp(-dot(dw, dw) / 0.004) * 0.12 * uWin;
  vec2 q = v - 0.5; col *= 1.0 - dot(q, q) * 0.55;
  gl_FragColor = vec4(col, 1.0);
}`

const rnd = (a, b) => a + Math.random() * (b - a)
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const im = new Image()
    im.onload = () => resolve(im)
    im.onerror = () => reject(new Error(`tea-hills: ${src} failed to load`))
    im.src = src
  })
}

export function mount(container, ctx) {
  const glc = document.createElement('canvas')
  const fxc = document.createElement('canvas')
  for (const c of [glc, fxc]) c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;'
  container.replaceChildren(glc, fxc)
  const gl = glc.getContext('webgl', { antialias: false, alpha: false })
  if (!gl) throw new Error('tea-hills: WebGL is not available')
  const fx = fxc.getContext('2d')

  let tod = ctx.timeOfDay in GRADES ? ctx.timeOfDay : 'dawn'
  const G = GRADES[tod].slice()
  let GT = GRADES[tod]
  let W = 0, H = 0, DPR = 1, sx = 1, sy = 1
  let maskData = null, ready = false, stopped = false, frame = 0, last = 0, tNow = 0
  const hand = { x: -1e4, y: -1e4, inside: false, still: 0, amt: 0 }
  const dew = []
  const burst = []
  let farFlock = null
  let nextFar = rnd(6, 14)

  // ---- WebGL
  function sh(type, src) {
    const s = gl.createShader(type)
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`tea-hills: ${gl.getShaderInfoLog(s)}`)
    return s
  }
  const prog = gl.createProgram()
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS))
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS))
  gl.linkProgram(prog)
  gl.useProgram(prog)
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  const aLoc = gl.getAttribLocation(prog, 'a')
  gl.enableVertexAttribArray(aLoc)
  gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0)
  const U = {}
  for (const n of ['uImg', 'uMask', 'uFar', 'uT', 'uAsp', 'uHand', 'uMouse', 'uS', ...GRADE_NAMES]) U[n] = gl.getUniformLocation(prog, n)
  function tex(im, unit) {
    const t = gl.createTexture()
    gl.activeTexture(gl.TEXTURE0 + unit)
    gl.bindTexture(gl.TEXTURE_2D, t)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im)
  }

  // ---- layout: cover-fit the picture
  function layout() {
    DPR = Math.min(1.5, window.devicePixelRatio || 1)
    W = container.clientWidth || window.innerWidth
    H = container.clientHeight || window.innerHeight
    for (const c of [glc, fxc]) { c.width = Math.round(W * DPR); c.height = Math.round(H * DPR) }
    gl.viewport(0, 0, glc.width, glc.height)
    const ia = IW / IH, sa = W / H
    sx = sa > ia ? 1 : sa / ia
    sy = sa > ia ? ia / sa : 1
  }
  const toUV = (x, y) => [0.5 + (x / W - 0.5) * sx, 0.5 + (y / H - 0.5) * sy]
  const toScr = (u, v) => [((u - 0.5) / sx + 0.5) * W, ((v - 0.5) / sy + 0.5) * H]
  const pxScale = () => W / sx / IW

  function maskAt(u, v, ch) {
    if (!maskData) return 0
    const x = clamp((u * 640) | 0, 0, 639), y = clamp((v * 360) | 0, 0, 359)
    return maskData[(y * 640 + x) * 4 + ch] / 255
  }
  function leafSpotNear(u0, v0, r) {
    for (let k = 0; k < 40; k++) {
      const u = u0 + rnd(-r, r), v = v0 + rnd(-r, r) * 0.6
      if (v > 0.64 && v < 0.97 && u > 0.03 && u < 0.97 && maskAt(u, v, 1) > 0.6) return [u, v]
    }
    return null
  }
  function seedDew() {
    dew.length = 0
    for (let i = 0; i < 70 && dew.length < 46; i++) {
      const p = leafSpotNear(rnd(0.05, 0.95), rnd(0.7, 0.95), 0.02)
      if (p) dew.push({ u: p[0], v: p[1], ph: rnd(0, 6.28), sp: rnd(0.3, 0.8) })
    }
  }
  function star(x, y, r, a) {
    fx.globalAlpha = a
    const g = fx.createRadialGradient(x, y, 0, x, y, r * 2.2)
    g.addColorStop(0, 'rgba(255,252,230,0.9)')
    g.addColorStop(1, 'rgba(255,252,230,0)')
    fx.fillStyle = g
    fx.beginPath(); fx.arc(x, y, r * 2.2, 0, 7); fx.fill()
    fx.strokeStyle = 'rgba(255,255,240,0.95)'
    fx.lineWidth = Math.max(1, r * 0.22)
    fx.beginPath(); fx.moveTo(x - r * 2, y); fx.lineTo(x + r * 2, y); fx.moveTo(x, y - r * 2); fx.lineTo(x, y + r * 2); fx.stroke()
    fx.globalAlpha = 1
  }
  function farBirds(dt) {
    if (!farFlock) {
      nextFar -= dt
      if (nextFar < 0 && tod !== 'night') {
        const dir = Math.random() < 0.5 ? 1 : -1
        farFlock = { x: dir > 0 ? -40 : W + 40, y: rnd(0.08, 0.28) * H, dir, birds: Array.from({ length: 3 + ((Math.random() * 3) | 0) }, (_, i) => ({ dx: -i * rnd(14, 24) * dir, dy: rnd(-10, 10), ph: rnd(0, 6) })) }
      }
      return
    }
    farFlock.x += farFlock.dir * 38 * dt * clamp(pxScale() * 1.6, 0.6, 2)
    fx.strokeStyle = 'rgba(52,56,52,0.75)'
    fx.lineWidth = 1.3
    fx.beginPath()
    for (const b of farFlock.birds) {
      b.ph += dt * 9
      const x = farFlock.x + b.dx, y = farFlock.y + b.dy + Math.sin(b.ph * 0.2) * 3, f = Math.sin(b.ph) * 3
      fx.moveTo(x - 5, y - f); fx.quadraticCurveTo(x - 2, y - 1, x, y + 1); fx.quadraticCurveTo(x + 2, y - 1, x + 5, y - f)
    }
    fx.stroke()
    if (farFlock.x < -200 || farFlock.x > W + 200) { farFlock = null; nextFar = rnd(20, 40) }
  }

  function draw(dt) {
    for (let i = 0; i < G.length; i++) G[i] += (GT[i] - G[i]) * Math.min(1, dt * 1.2)
    hand.still += dt
    hand.amt *= Math.pow(0.25, dt)
    const [mu, mv] = toUV(hand.x, hand.y)
    gl.uniform1i(U.uImg, 0); gl.uniform1i(U.uMask, 1); gl.uniform1i(U.uFar, 2)
    gl.uniform1f(U.uT, tNow); gl.uniform1f(U.uAsp, IW / IH); gl.uniform1f(U.uHand, hand.inside ? hand.amt : 0)
    gl.uniform2f(U.uMouse, mu, mv); gl.uniform2f(U.uS, sx, sy)
    GRADE_NAMES.forEach((n, i) => gl.uniform1f(U[n], G[i]))
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    fx.setTransform(1, 0, 0, 1, 0, 0)
    fx.clearRect(0, 0, fxc.width, fxc.height)
    fx.setTransform(DPR, 0, 0, DPR, 0, 0)
    if (ctx.reducedMotion) return
    const ps = clamp(pxScale() * 1.6, 0.6, 2.4), dim = tod === 'night' ? 0.35 : tod === 'dusk' ? 0.7 : 1
    for (const d of dew) {
      const a = Math.pow(Math.max(0, Math.sin(tNow * d.sp + d.ph)), 12) * dim
      if (a > 0.02) { const [x, y] = toScr(d.u, d.v); star(x, y, 2.8 * ps, a) }
    }
    if (hand.inside && maskAt(mu, mv, 1) > 0.3 && hand.still > 0.8) { // a resting hand gathers dew glints
      const k = clamp((hand.still - 0.8) / 1.5, 0, 1)
      for (let i = 0; i < 9; i++) {
        const a = i * 2.4 + Math.floor(tNow * 0.5 + i * 0.37) * 1.7, r = (30 + ((i * 37) % 70)) * ps
        const tw = Math.pow(Math.max(0, Math.sin(tNow * (1.3 + i * 0.17) + i)), 6)
        star(hand.x + Math.cos(a) * r, hand.y + Math.sin(a) * r * 0.6, 2 * ps, tw * k * dim)
      }
    }
    for (let i = burst.length - 1; i >= 0; i--) {
      const b = burst[i]
      b.t += dt
      if (b.t > b.life) { burst.splice(i, 1); continue }
      star(b.x, b.y - b.t * 10, 2 * ps, Math.sin((b.t / b.life) * Math.PI) * dim)
    }
    farBirds(dt)
  }

  function loop(now) {
    if (stopped) return
    frame = requestAnimationFrame(loop)
    if (now - last < 1000 / FPS - 2) return
    const dt = Math.min((now - last) / 1000, 0.1)
    last = now
    tNow += dt
    draw(dt)
  }

  function onPointer(e) {
    const d = Math.hypot(e.x - hand.x, e.y - hand.y)
    hand.x = e.x
    hand.y = e.y
    if (!hand.inside) hand.inside = true
    else if (d > 2) { hand.still = 0; hand.amt = Math.min(1, hand.amt + d / 160) }
    if (e.type === 'down') for (let i = 0; i < 14; i++) burst.push({ x: e.x + rnd(-60, 60), y: e.y + rnd(-30, 40), t: 0, life: rnd(0.6, 1.4) })
  }

  const offPointer = ctx.onPointer?.(onPointer)
  const offClock = ctx.subscribe?.(({ timeOfDay }) => {
    if (!(timeOfDay in GRADES)) return
    tod = timeOfDay
    GT = GRADES[tod]
    if (ctx.reducedMotion && ready) { for (let i = 0; i < G.length; i++) G[i] = GT[i]; draw(0) }
  })
  let rz = 0
  const onResize = () => { clearTimeout(rz); rz = setTimeout(() => { if (!ready) return; layout(); seedDew(); draw(0) }, 150) }
  window.addEventListener('resize', onResize)

  Promise.all([loadImage(photoUrl), loadImage(maskUrl), loadImage(mistUrl)]).then(([img, mimg, fimg]) => {
    if (stopped) return
    tex(img, 0); tex(mimg, 1); tex(fimg, 2)
    const c = document.createElement('canvas')
    c.width = 640; c.height = 360
    const cx = c.getContext('2d')
    cx.drawImage(mimg, 0, 0)
    maskData = cx.getImageData(0, 0, 640, 360).data
    layout()
    seedDew()
    ready = true
    draw(0)
    if (!ctx.reducedMotion) { last = performance.now(); frame = requestAnimationFrame(loop) }
    requestAnimationFrame(() => requestAnimationFrame(() => ctx.ready()))
  })

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
