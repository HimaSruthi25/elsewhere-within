// Hillside Cable Car — a terraced hill town at dusk with a little cable car.
// Picture: AI pixel-art illustration (1920×1080) with the two painted cabins
// cut out, so they can travel the real cables in code:
//   - the two cabins run as a pair (one goes up while the other comes down),
//     pass each other midway, slip into the stations and wait, then go again;
//     they swing gently on their hangers when they start, brake and in the wind;
//   - a slow veil of lilac cloud drifts through the valley behind the tower;
//   - the red lamps on the towers and the upper station glow softly on and off;
//   - town windows and lamps shimmer, now and then one goes dark or lights up;
//   - stars twinkle; at night the sky deepens and the town glows warmer.
// Live wallpaper (hover only): pass the cursor over a cabin → its cabin light
// turns warm and it sways a little on the cable.
// With reducedMotion one still frame is drawn (again when the time of day changes).
import photoUrl from './hillside-cable-car.jpg'
import lightsUrl from './hcc-lights.png'
import cab0Url from './hcc-cab0.png'
import cab1Url from './hcc-cab1.png'
import win0Url from './hcc-cab0-win.png'
import win1Url from './hcc-cab1-win.png'
import occLowUrl from './hcc-occ-low.png'
import occUpUrl from './hcc-occ-up.png'
import cloudMaskUrl from './hcc-cloud-mask.png'
import { LAMPS, LIGHTS, STARS } from './points.js'

const W = 1920
const H = 1080
const FPS = 30
const CW = 640 // valley-cloud grid (3 screen px per pixel, like the painting)
const CH = 360
// cable midline (between the two cables) from the lower station to the upper one
const PATH = [[288, 576], [350, 552], [425, 519], [522, 485], [575, 470], [725, 416], [875, 355], [1025, 294], [1175, 232], [1325, 171], [1400, 139], [1450, 116], [1525, 100], [1612, 78]]
// cabin sprites: anchor (grip on the cable) and the size they were painted at
const CABS = [
  { ax: 52.5, ay: 16.4, native: 1 },
  { ax: 41.25, ay: 14.75, native: 0.82 },
]
const OCC_LOW = [0, 545]
const OCC_UP = [1561, 0]
// grade: multiply r, g, b; lights restored; glow strength; extra stars
const GRADES = {
  dawn: [0.93, 0.9, 1.0, 0.2, 0.75, 0.3],
  day: [1, 1, 1, 0, 0.7, 0],
  dusk: [1, 1, 1, 0, 0.8, 0.15],
  night: [0.42, 0.47, 0.8, 0.92, 1.15, 1],
}
const DWELL = 7
const TRAVEL = 52
const RAMP = 7

const rnd = (a, b) => a + Math.random() * (b - a)
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const im = new Image()
    im.onload = () => resolve(im)
    im.onerror = () => reject(new Error(`hillside-cable-car: ${src} failed to load`))
    im.src = src
  })
}

// arc-length table of the cable path
const SEG = []
let PATH_LEN = 0
for (let i = 1; i < PATH.length; i++) {
  const [x0, y0] = PATH[i - 1], [x1, y1] = PATH[i]
  const l = Math.hypot(x1 - x0, y1 - y0)
  SEG.push({ x0, y0, dx: x1 - x0, dy: y1 - y0, l, s: PATH_LEN })
  PATH_LEN += l
}
function pointAt(u) {
  const d = clamp(u, 0, 1) * PATH_LEN
  let sg = SEG[SEG.length - 1]
  for (const s of SEG) if (d <= s.s + s.l) { sg = s; break }
  const k = clamp((d - sg.s) / sg.l, 0, 1)
  return [sg.x0 + sg.dx * k, sg.y0 + sg.dy * k]
}
function uAtX(x) {
  for (const s of SEG) if (x >= s.x0 && x <= s.x0 + s.dx) return (s.s + ((x - s.x0) / s.dx) * s.l) / PATH_LEN
  return 0.5
}
const scaleAt = (x) => 1 - ((x / 1.25 - 535) * 0.18) / 420

// trapezoid speed profile: progress 0..1 over the travel time
function travelPos(t) {
  const v = 1 / (TRAVEL - RAMP)
  if (t <= 0) return 0
  if (t >= TRAVEL) return 1
  if (t < RAMP) return (0.5 * v * t * t) / RAMP
  if (t > TRAVEL - RAMP) { const r = TRAVEL - t; return 1 - (0.5 * v * r * r) / RAMP }
  return 0.5 * v * RAMP + v * (t - RAMP)
}

export function mount(container, ctx) {
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  cv.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:block;pointer-events:none;'
  container.replaceChildren(cv)
  const g = cv.getContext('2d')
  const cc = document.createElement('canvas')
  cc.width = CW
  cc.height = CH
  const cg = cc.getContext('2d')

  let tod = ctx.timeOfDay in GRADES ? ctx.timeOfDay : 'dusk'
  const grade = GRADES[tod].slice()
  let img = null, stopped = false, frame = 0, last = 0, tNow = 0
  let halo = null, wisps = [], extraStars = []
  // cycle: dwell at the stations, then both cabins travel (A up, B down)
  // start where the painting has them (lower cabin ~29 % of the way up)
  let lo = 0, hi = TRAVEL
  for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (travelPos(mid) < 0.29) lo = mid; else hi = mid }
  let cycleT = DWELL + lo
  let dir = 1
  const cabs = [0, 1].map((k) => ({ k, u: 0, th: 0, om: 0, warm: 0, hoverAt: -99, box: null, prevV: 0, ph: Math.random() * 6 }))
  const lights = LIGHTS.map((l) => ({ x: l[0], y: l[1], a: l[2], bx: l[3], by: l[4], bw: l[5], bh: l[6], ph: Math.random() * 6.28, sp: rnd(0.4, 1.3), off: 0, offT: 0 }))
  let nextToggle = rnd(10, 20)
  const hand = { x: -999, y: -999, vx: 0, t: -99 }

  function layout() {
    const w = container.clientWidth || window.innerWidth
    const h = container.clientHeight || window.innerHeight
    const s = Math.max(w / W, h / H)
    cv.style.width = `${Math.ceil(W * s)}px`
    cv.style.height = `${Math.ceil(H * s)}px`
  }
  function toCanvas(x, y) {
    const r = cv.getBoundingClientRect()
    return [((x - r.left) / r.width) * W, ((y - r.top) / r.height) * H]
  }

  function makeHalo() {
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32)
    gr.addColorStop(0, 'rgba(255,255,255,1)')
    gr.addColorStop(0.35, 'rgba(255,255,255,0.35)')
    gr.addColorStop(1, 'rgba(255,255,255,0)')
    x.fillStyle = gr
    x.fillRect(0, 0, 64, 64)
    return c
  }
  function tinted(base, rgb) {
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const x = c.getContext('2d')
    x.drawImage(base, 0, 0)
    x.globalCompositeOperation = 'source-in'
    x.fillStyle = `rgb(${rgb})`
    x.fillRect(0, 0, 64, 64)
    return c
  }

  // pixel-style cloud wisps: lumpy shapes with stepped alpha, drawn on the low-res grid
  function makeWisp(w, h) {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const x = c.getContext('2d')
    const id = x.createImageData(w, h), d = id.data
    const blobs = []
    for (let i = 0; i < 9; i++) blobs.push([rnd(0.12, 0.88) * w, rnd(0.45, 0.75) * h, rnd(0.14, 0.3) * w, rnd(0.25, 0.45) * h])
    for (let y = 0; y < h; y++) {
      for (let xx = 0; xx < w; xx++) {
        let v = 0
        for (const b of blobs) { const dx = (xx - b[0]) / b[2], dy = (y - b[1]) / b[3]; v = Math.max(v, 1 - (dx * dx + dy * dy)) }
        const ex = Math.min(xx, w - 1 - xx) / (w * 0.18)
        v *= Math.min(1, ex)
        const a = v > 0.55 ? 0.62 : v > 0.3 ? 0.42 : v > 0.08 ? 0.2 : 0
        const top = clamp(1 - y / (h * 0.55), 0, 1)
        const i4 = (y * w + xx) * 4
        d[i4] = 196 + top * 50
        d[i4 + 1] = 168 + top * 20
        d[i4 + 2] = 222 - top * 10
        d[i4 + 3] = a * 255
      }
    }
    x.putImageData(id, 0, 0)
    return c
  }
  function initWisps() {
    wisps = []
    for (let i = 0; i < 7; i++) {
      const w = Math.round(rnd(70, 150)), h = Math.round(rnd(12, 22))
      wisps.push({ c: makeWisp(w, h), x: rnd(-150, CW), y: rnd(152, 205), v: rnd(1.4, 2.6), a: rnd(0.55, 0.85), ph: Math.random() * 6 })
    }
    extraStars = []
    for (let i = 0; i < 60; i++) extraStars.push([rnd(0, 1880), rnd(8, 210) * (0.5 + Math.random() * 0.5), Math.random() * 6.28, rnd(0.5, 1.6)])
  }

  function setCabins(dt) {
    cycleT += dt
    const total = DWELL + TRAVEL
    if (cycleT > total) { cycleT -= total; dir = -dir }
    const p = travelPos(cycleT - DWELL)
    const uA = dir > 0 ? p : 1 - p
    const ua = [uA, 1 - uA]
    for (const c of cabs) {
      const prev = c.u
      c.u = ua[c.k]
      const [x] = pointAt(c.u)
      const [xp] = pointAt(prev)
      const v = dt > 0 ? (x - xp) / dt : 0
      const acc = dt > 0 ? (v - c.prevV) / dt : 0
      c.prevV = v
      // pendulum: start/stop tilts the cabin back, a soft wind keeps it alive
      const wind = 0.014 * Math.sin(tNow * 0.31 + c.ph) * Math.sin(tNow * 0.13 + c.ph * 2)
      const w0 = (2 * Math.PI) / 3.1
      c.om += (-w0 * w0 * (c.th - wind) - 0.45 * c.om - acc * 0.006) * dt
      c.th += c.om * dt
      c.th = clamp(c.th, -0.22, 0.22)
      const near = tNow - c.hoverAt < 1.2
      c.warm += ((near ? 1 : 0) - c.warm) * Math.min(1, dt * (near ? 2.2 : 0.45))
    }
  }

  function step(dt) {
    tNow += dt
    setCabins(dt)
    for (const w of wisps) {
      w.x += w.v * dt
      if (w.x > CW + 10) { w.x = -w.c.width - rnd(0, 120); w.y = rnd(152, 205) }
    }
    nextToggle -= dt
    if (nextToggle < 0) {
      nextToggle = rnd(8, 18)
      const l = lights[Math.floor(Math.random() * lights.length)]
      if (l.a >= 10 && l.y > 500) { l.offT = 1; l.off = l.off > 0.5 ? 0 : 1 }
    }
    for (const l of lights) if (l.offT > 0) l.offT = Math.max(0, l.offT - dt * 0.5)
    const gt = 1 - Math.exp(-dt / 6) // ~20 s to settle into a new time of day
    for (let j = 0; j < 6; j++) grade[j] += (GRADES[tod][j] - grade[j]) * gt
  }

  function drawCabins() {
    const order = [cabs[0], cabs[1]] // the descending track is nearer: drawn last
    for (const c of order) {
      const [x, y0] = pointAt(c.u)
      const spec = CABS[c.k], im = img.cabs[c.k]
      const s = (scaleAt(x) / spec.native) * (c.k === 1 ? 1.03 : 1)
      const y = y0 + (c.k === 1 ? 4 : 0)
      g.save()
      g.translate(x, y)
      g.rotate(c.th)
      g.scale(s, s)
      g.drawImage(im, -spec.ax, -spec.ay)
      g.restore()
      c.box = [x - spec.ax * s - 20, y - 10, x + (im.width - spec.ax) * s + 20, y + (im.height - spec.ay) * s + 14]
      c.pos = [x, y, s]
    }
  }

  function drawCabinGlow(k) {
    for (const c of cabs) {
      if (!c.pos) continue
      const [x, y, s] = c.pos
      const spec = CABS[c.k], im = img.wins[c.k]
      const a = clamp((0.25 + grade[3] * 0.45 + c.warm * 0.9) * k, 0, 1.4)
      if (a < 0.02) continue
      g.save()
      g.translate(x, y)
      g.rotate(c.th)
      g.scale(s, s)
      g.globalAlpha = Math.min(1, a)
      g.drawImage(im, -spec.ax, -spec.ay)
      g.restore()
      if (c.warm > 0.02) {
        const cx = x + Math.sin(c.th) * 70 * s, cy = y + 95 * s
        g.globalAlpha = c.warm * 0.32
        g.drawImage(halo.warm, cx - 80 * s, cy - 60 * s, 160 * s, 120 * s)
      }
    }
    g.globalAlpha = 1
  }

  function render() {
    g.globalCompositeOperation = 'source-over'
    g.globalAlpha = 1
    g.drawImage(img.base, 0, 0)
    // valley cloud veil
    {
      cg.globalCompositeOperation = 'source-over'
      cg.clearRect(0, 0, CW, CH)
      for (const w of wisps) {
        cg.globalAlpha = w.a * (0.85 + 0.15 * Math.sin(tNow * 0.2 + w.ph))
        cg.drawImage(w.c, Math.round(w.x), Math.round(w.y + Math.sin(tNow * 0.15 + w.ph) * 2))
      }
      cg.globalAlpha = 1
      cg.globalCompositeOperation = 'destination-in'
      cg.drawImage(img.cloudMask, 0, 0)
      g.imageSmoothingEnabled = false
      g.globalAlpha = 0.8
      g.drawImage(cc, 0, 0, W, H)
      g.globalAlpha = 1
      g.imageSmoothingEnabled = true
    }
    drawCabins()
    g.drawImage(img.occLow, OCC_LOW[0], OCC_LOW[1])
    g.drawImage(img.occUp, OCC_UP[0], OCC_UP[1])
    // time-of-day grade
    const m = [grade[0], grade[1], grade[2]]
    if (m[0] < 0.995 || m[1] < 0.995 || m[2] < 0.995) {
      g.globalCompositeOperation = 'multiply'
      g.fillStyle = `rgb(${Math.round(m[0] * 255)},${Math.round(m[1] * 255)},${Math.round(m[2] * 255)})`
      g.fillRect(0, 0, W, H)
      g.globalCompositeOperation = 'source-over'
    }
    if (grade[3] > 0.02) { g.globalAlpha = grade[3]; g.drawImage(img.lights, 0, 0); g.globalAlpha = 1 }
    // windows that went dark (fade in/out)
    for (const l of lights) {
      const k = l.off ? 1 - l.offT : l.offT
      if (k <= 0.01) continue
      g.globalAlpha = k * 0.88
      g.fillStyle = `rgb(${Math.round(70 * m[0])},${Math.round(52 * m[1])},${Math.round(60 * m[2])})`
      g.fillRect(l.bx, l.by, l.bw, l.bh)
    }
    g.globalAlpha = 1
    const gk = grade[4]
    g.globalCompositeOperation = 'lighter'
    // window and lamp glows
    for (const l of lights) {
      const on = l.off ? l.offT : 1 - l.offT
      if (on < 0.02) continue
      const f = 0.8 + 0.12 * Math.sin(tNow * l.sp + l.ph) + 0.08 * Math.sin(tNow * l.sp * 4.3 + l.ph * 2)
      const r = 5 + Math.sqrt(l.a) * 2.2
      g.globalAlpha = clamp(0.2 * f * gk * on, 0, 1)
      g.drawImage(halo.warm, l.x - r, l.y - r, r * 2, r * 2)
    }
    // red lamps: slow soft glow, never a flash
    for (let i = 0; i < LAMPS.length; i++) {
      const [x, y] = LAMPS[i]
      const b = 0.5 + 0.5 * Math.sin((tNow * 2 * Math.PI) / 3.2 + (i % 2) * 1.2 + Math.floor(i / 2) * 0.7)
      g.globalAlpha = clamp((0.15 + 0.55 * b) * gk, 0, 1)
      g.drawImage(halo.red, x - 16, y - 16, 32, 32)
      g.globalAlpha = clamp((0.1 + 0.3 * b) * gk, 0, 1)
      g.drawImage(halo.red, x - 4, y - 4, 8, 8)
    }
    // stars
    g.fillStyle = 'rgb(235,236,255)'
    for (let i = 0; i < STARS.length; i++) {
      const [x, y] = STARS[i]
      const a = 0.5 + 0.5 * Math.sin(tNow * (0.7 + i * 0.17) + i * 2.3)
      g.globalAlpha = a * 0.55
      g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3)
    }
    if (grade[5] > 0.05) {
      for (const s of extraStars) {
        const a = (0.5 + 0.5 * Math.sin(tNow * s[3] + s[2])) * grade[5]
        if (a < 0.15) continue
        g.globalAlpha = a * 0.6
        g.fillRect(Math.round(s[0] / 3) * 3, Math.round(s[1] / 3) * 3, 3, 3)
      }
    }
    g.globalAlpha = 1
    drawCabinGlow(gk)
    g.globalCompositeOperation = 'source-over'
    g.globalAlpha = 1
  }

  function setTod(t, instant) {
    if (!(t in GRADES)) return
    tod = t
    if (instant) for (let j = 0; j < 6; j++) grade[j] = GRADES[t][j]
  }

  function loop(now) {
    if (stopped) return
    frame = requestAnimationFrame(loop)
    if (now - last < 1000 / FPS - 2) return
    const dt = Math.min((now - last) / 1000, 0.1)
    last = now
    step(dt)
    render()
  }

  function onPointer(e) {
    const [x, y] = toCanvas(e.x, e.y)
    const dt = Math.max(0.016, tNow - hand.t)
    hand.vx = hand.t > 0 ? (x - hand.x) / dt : 0
    hand.x = x
    hand.y = y
    hand.t = tNow
    for (const c of cabs) {
      const b = c.box
      if (!b || x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue
      if (tNow - c.hoverAt > 1.5) c.om += 0.16 * (Math.random() < 0.5 ? -1 : 1)
      c.om += clamp(hand.vx * 0.0002, -0.08, 0.08)
      c.hoverAt = tNow
    }
  }

  const offPointer = ctx.onPointer?.(onPointer)
  const offClock = ctx.subscribe?.(({ timeOfDay }) => {
    setTod(timeOfDay, ctx.reducedMotion)
    if (ctx.reducedMotion && img) render()
  })
  const onResize = () => layout()
  window.addEventListener('resize', onResize)

  Promise.all([photoUrl, lightsUrl, cab0Url, cab1Url, win0Url, win1Url, occLowUrl, occUpUrl, cloudMaskUrl].map(loadImage)).then((ims) => {
    if (stopped) return
    const [base, li, c0, c1, w0, w1, ol, ou, cm] = ims
    img = { base, lights: li, cabs: [c0, c1], wins: [w0, w1], occLow: ol, occUp: ou, cloudMask: cm }
    const hb = makeHalo()
    halo = { warm: tinted(hb, '255,190,110'), red: tinted(hb, '255,60,50') }
    initWisps()
    setTod(tod, true)
    layout()
    if (ctx.reducedMotion) {
      // the cabins where the painting has them
      cabs[0].u = uAtX(535 * 1.25)
      cabs[1].u = uAtX(955 * 1.25)
      render()
    } else {
      for (let i = 0; i < 30; i++) step(1 / 30)
      render()
      last = performance.now()
      frame = requestAnimationFrame(loop)
    }
    requestAnimationFrame(() => requestAnimationFrame(() => ctx.ready()))
  })

  return {
    unmount() {
      stopped = true
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', onResize)
      offPointer?.()
      offClock?.()
      container.replaceChildren()
    },
  }
}
