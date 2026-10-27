// Last Train Platform — a small countryside platform at night in soft rain,
// a cat asleep on the bench under a warm lamp.
// The illustration is still; a canvas on top adds:
//   - rain in two depths that turns golden near the lamp, drips from the roof edge;
//   - ripples in the platform puddles and the flooded rice fields;
//   - a flickering lamp with a few moths, a pulsing green signal, a breathing moon glow;
//   - the cat breathing (a tiny, feathered warp of the picture itself);
//   - an old 1800s steam train (train.js): one 3D train that comes out of the
//     distance along the real line of the rails, waits at the platform with steam
//     and smoke, then rolls on past you until the last coach has gone by.
// Live wallpaper: when the mouse comes near the cat it opens its eyes and
// watches the cursor, and dozes off again a few seconds after it leaves.
// Clicking the green signal (or the empty track) calls the train; clicking the
// waiting train makes it whistle (a burst of steam) and pull away.
// The cat also wakes and watches the train while it is in.
// With reducedMotion everything is drawn once and nothing moves.
import photoUrl from './last-train-platform.jpg'
import { createTrain } from './train.js'

// Places in the illustration, as fractions of its width and height
// (measured on the 3840×2160 original).
const F = (x, y) => ({ x: x / 3840, y: y / 2160 })
const LAMP = F(945, 362)
const MOON = F(2858, 312)
const SIGNAL = F(2112, 1088)
const CAT = { x0: 805 / 3840, y0: 1085 / 2160, x1: 1115 / 3840, y1: 1266 / 2160 } // bottom = bench top
const FACE = F(1032, 1205)
const EYES = [{ ...F(1016, 1199), a: 0.85 }, { ...F(1048, 1211), a: -0.35 }]
const ROOF_A = F(1000, 0)
const ROOF_B = F(1680, 480)
const FLOOR_LIGHT = F(1050, 1620)
const DRIP_FLOOR = 1500 / 2160

const FPS = 30
const DROPS_PER_1080P = 300
const WIND = -0.12
const AWAKE_LINGER_MS = 2600
// How bright the lamp and rain are by time of day (the picture is always night).
const LIGHT = { night: 1, dusk: 0.9, dawn: 0.8, day: 0.7 }

export function mount(container, ctx) {
  const img = document.createElement('img')
  img.src = photoUrl
  img.alt = ''
  img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;'
  const canvas = document.createElement('canvas')
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;'
  container.replaceChildren(img, canvas)
  const g = canvas.getContext('2d')
  const patch = document.createElement('canvas')
  const pg = patch.getContext('2d')

  let v = null
  let drops = []
  let ripples = []
  let drips = []
  let moths = []
  let fur = 'rgb(205,196,190)'
  let frame = 0
  let last = 0
  let ripT = 0
  let dripT = 0
  let dipUntil = 0
  let nextDip = 0
  let awake = 0
  let lastNear = -1e9
  let stopped = false
  const ptr = { x: -1e4, y: -1e4, seen: false }
  const train = createTrain()
  let trainView = { beam: null, near: 0, lens: null }

  const X = (fx) => v.ox + fx * v.iw * v.s
  const Y = (fy) => v.oy + fy * v.ih * v.s
  const px = (n) => (n / 3840) * v.iw * v.s // a length measured on the original

  function layout() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = container.clientWidth || window.innerWidth
    const h = container.clientHeight || window.innerHeight
    const iw = img.naturalWidth
    const ih = img.naturalHeight
    const s = Math.max(w / iw, h / ih)
    v = { w, h, dpr, s, iw, ih, ox: (w - iw * s) / 2, oy: (h - ih * s) / 2 }
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    fur = sampleFur()
    seed()
  }

  function sampleFur() {
    try {
      const c = document.createElement('canvas')
      c.width = c.height = 1
      const cg = c.getContext('2d')
      cg.drawImage(img, (EYES[0].x - 14 / 3840) * img.naturalWidth, (EYES[0].y - 10 / 2160) * img.naturalHeight, 4, 4, 0, 0, 1, 1)
      const d = cg.getImageData(0, 0, 1, 1).data
      return `rgb(${d[0]},${d[1]},${d[2]})`
    } catch {
      return fur
    }
  }

  const scaleH = () => Math.max(v.h / 1080, 0.6)
  function newDrop(anyY) {
    const depth = Math.random()
    return {
      x: Math.random() * (v.w + 200) - 100,
      y: anyY ? Math.random() * v.h : -40 - Math.random() * v.h * 0.3,
      v: (700 + depth * 900) * scaleH(),
      len: (10 + depth * 26) * scaleH(),
      a: 0.07 + depth * 0.18,
      w: depth > 0.8 ? 1.4 : 1,
    }
  }
  function seed() {
    const n = Math.round(((v.w * v.h) / (1920 * 1080)) * DROPS_PER_1080P)
    drops = Array.from({ length: n }, () => newDrop(true))
    ripples = []
    drips = []
    moths = Array.from({ length: 4 }, (_, i) => ({ ph: Math.random() * 6.28, sp: 0.7 + Math.random() * 0.6, rx: 70 + Math.random() * 70, ry: 40 + Math.random() * 50, k: i }))
    nextDip = performance.now() + 6000 + Math.random() * 9000
  }

  function spawnRipple() {
    let x, y, big
    if (Math.random() < 0.62) { // platform, left of the yellow line
      y = 1640 + Math.random() * 500
      const xmax = 1900 + (y - 1262) * (350 / 898) - 80
      x = 760 + Math.random() * (xmax - 760)
      big = 1
    } else { // flooded rice fields
      y = 1260 + Math.random() * 380
      x = 2380 + Math.random() * 1440
      big = 0.6
    }
    ripples.push({ x: x / 3840, y: y / 2160, r: 0, max: (26 + Math.random() * 30) * big })
  }
  function spawnDrip() {
    const t = Math.random()
    drips.push({ x: ROOF_A.x + (ROOF_B.x - ROOF_A.x) * t, y0: ROOF_A.y + (ROOF_B.y - ROOF_A.y) * t, d: 0, v: 0 })
  }

  function glow(x, y, r, rgb, a, op) {
    if (a <= 0.002) return
    g.save()
    g.globalCompositeOperation = op
    const gr = g.createRadialGradient(x, y, 0, x, y, r)
    gr.addColorStop(0, `rgba(${rgb},${a})`)
    gr.addColorStop(1, `rgba(${rgb},0)`)
    g.fillStyle = gr
    g.fillRect(x - r, y - r, r * 2, r * 2)
    g.restore()
  }

  function lampLevel(now, t) {
    let l = 1 + 0.04 * Math.sin(t * 7.3) + 0.03 * Math.sin(t * 13.1 + 1.2) + 0.02 * Math.sin(t * 29.7)
    if (now > nextDip) {
      dipUntil = now + 70 + Math.random() * 120
      nextDip = now + 7000 + Math.random() * 12000
    }
    if (now < dipUntil) l *= 0.55
    return l
  }

  function step(dt, now) {
    ripT += dt
    while (ripT > 0.11) { ripT -= 0.11; spawnRipple() }
    for (const r of ripples) r.r += dt * 60
    ripples = ripples.filter((r) => r.r < r.max)

    dripT += dt
    if (dripT > 0.28) { dripT = 0; spawnDrip() }
    for (const d of drips) { d.v += 2600 * dt; d.d += d.v * dt }
    drips = drips.filter((d) => d.y0 + d.d / 2160 < DRIP_FLOOR)

    for (const d of drops) {
      d.y += d.v * dt
      d.x += d.v * WIND * dt
      if (d.y - d.len > v.h || d.x < -120) Object.assign(d, newDrop(false))
    }

    train.update(dt)
    const near = ptr.seen && Math.hypot(ptr.x - X(FACE.x), ptr.y - Y(FACE.y)) < Math.max(170, px(1800))
    if (near || trainView.near > 0.25) lastNear = now
    const target = now - lastNear < AWAKE_LINGER_MS ? 1 : 0
    awake += (target - awake) * Math.min(1, dt * (target ? 2.2 : 1.1))
  }

  function drawCat(t) {
    const dw = (CAT.x1 - CAT.x0) * v.iw * v.s
    const dh = (CAT.y1 - CAT.y0) * v.ih * v.s
    const pw = Math.max(2, Math.ceil(dw * v.dpr))
    const ph = Math.max(2, Math.ceil(dh * v.dpr))
    if (patch.width !== pw || patch.height !== ph) { patch.width = pw; patch.height = ph }
    const b = Math.sin(t * (1.5 + awake * 0.5)) * 0.5 + 0.5
    const sy = 1 + 0.014 * b
    const sx = 1 + 0.004 * b
    pg.globalCompositeOperation = 'source-over'
    pg.clearRect(0, 0, pw, ph)
    pg.drawImage(img, CAT.x0 * v.iw, CAT.y0 * v.ih, (CAT.x1 - CAT.x0) * v.iw, (CAT.y1 - CAT.y0) * v.ih,
      (pw - pw * sx) / 2, ph - ph * sy, pw * sx, ph * sy) // grows upward from the bench
    pg.globalCompositeOperation = 'destination-in' // feather the edges into the painting
    pg.save()
    pg.translate(pw * 0.5, ph * 0.6)
    pg.scale(1, (ph / pw) * 1.3)
    const m = pg.createRadialGradient(0, 0, 0, 0, 0, pw * 0.55)
    m.addColorStop(0, 'rgba(0,0,0,1)')
    m.addColorStop(0.7, 'rgba(0,0,0,1)')
    m.addColorStop(1, 'rgba(0,0,0,0)')
    pg.fillStyle = m
    pg.fillRect(-pw, -pw, pw * 2, pw * 2)
    pg.restore()
    g.drawImage(patch, X(CAT.x0), Y(CAT.y0), dw, dh)
    if (awake > 0.02) for (const e of EYES) drawEye(e, t)
  }

  function drawEye(e, t) {
    const w = px(19)
    const h = px(10)
    const open = awake * (Math.sin(t * 0.9) > 0.995 ? 0.15 : 1) // rare slow blink
    const ex = X(e.x)
    const ey = Y(e.y)
    // watch the hand if it is near, otherwise the train's lamp
    const handNear = ptr.seen && Math.hypot(ptr.x - X(FACE.x), ptr.y - Y(FACE.y)) < Math.max(170, px(1800))
    const look = !handNear && trainView.lens ? { x: X(trainView.lens[0] / 3840), y: Y(trainView.lens[1] / 2160) } : ptr
    let dx = look.x - ex
    let dy = look.y - ey
    const d = Math.hypot(dx, dy) || 1
    dx /= d
    dy /= d
    g.save()
    g.translate(ex, ey)
    g.rotate(e.a)
    g.globalAlpha = Math.min(1, awake * 1.4) // cover the painted closed-eye line
    g.fillStyle = fur
    g.beginPath()
    g.ellipse(0, 0, w * 0.62, h * 0.75, 0, 0, Math.PI * 2)
    g.fill()
    g.globalAlpha = 1
    const ry = Math.max(0.3, (h / 2) * open)
    g.beginPath()
    g.ellipse(0, 0, w / 2, ry, 0, 0, Math.PI * 2)
    g.save()
    g.clip()
    const iris = g.createRadialGradient(0, 0, 0, 0, 0, w / 2)
    iris.addColorStop(0, '#f2c766')
    iris.addColorStop(1, '#b77a22')
    g.fillStyle = iris
    g.fillRect(-w, -h, w * 2, h * 2)
    const ca = Math.cos(-e.a)
    const sa = Math.sin(-e.a)
    const lx = (dx * ca - dy * sa) * w * 0.2
    const ly = (dx * sa + dy * ca) * h * 0.18
    g.fillStyle = '#140d06'
    g.beginPath()
    g.ellipse(lx, ly, w * 0.11, h * 0.5, -e.a, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = 'rgba(255,248,230,0.9)'
    g.beginPath()
    g.arc(lx - w * 0.12, ly - h * 0.18, Math.max(0.6, w * 0.06), 0, Math.PI * 2)
    g.fill()
    g.restore()
    g.strokeStyle = 'rgba(30,20,14,0.85)'
    g.lineWidth = Math.max(0.7, px(3.2))
    g.beginPath()
    g.ellipse(0, 0, w / 2, ry, 0, 0, Math.PI * 2)
    g.stroke()
    g.restore()
  }

  function draw(now) {
    const t = now / 1000
    const light = LIGHT[ctx.timeOfDay] ?? 1
    g.clearRect(0, 0, v.w, v.h)

    glow(X(MOON.x), Y(MOON.y), px(260), '200,215,255', 0.05 + 0.03 * Math.sin(t * 0.4), 'screen')
    glow(X(SIGNAL.x), Y(SIGNAL.y), px(70), '90,255,170', 0.22 + 0.16 * Math.sin(t * 1.6), 'lighter')

    drawCat(t)

    // the train, drawn in the painting's own pixel space
    g.save()
    const k = (v.iw * v.s) / 3840
    g.setTransform(v.dpr * k, 0, 0, v.dpr * k, v.dpr * v.ox, v.dpr * v.oy)
    trainView = train.draw(g, t, light)
    g.restore()

    const L = (ctx.reducedMotion ? 1 : lampLevel(now, t)) * light
    glow(X(LAMP.x), Y(LAMP.y), px(520), '255,176,90', 0.13 * L, 'lighter')
    glow(X(LAMP.x), Y(LAMP.y), px(120), '255,214,150', 0.3 * L, 'lighter')
    glow(X(FLOOR_LIGHT.x), Y(FLOOR_LIGHT.y), px(620), '255,170,80', 0.05 * L, 'lighter')

    g.save()
    g.globalCompositeOperation = 'lighter'
    for (const m of moths) {
      const a = t * m.sp + m.ph
      const mx = X(LAMP.x) + px(Math.cos(a) * m.rx + Math.sin(a * 2.3) * 18)
      const my = Y(LAMP.y) + px(40 + Math.sin(a * 1.4) * m.ry)
      const flap = 0.6 + 0.4 * Math.abs(Math.sin(t * 22 + m.k))
      g.fillStyle = `rgba(255,236,200,${0.55 * flap * light})`
      g.beginPath()
      g.ellipse(mx, my, Math.max(1.2, px(7) * flap), Math.max(0.8, px(4)), 0, 0, Math.PI * 2)
      g.fill()
    }
    g.restore()

    g.save()
    g.lineWidth = Math.max(0.8, px(2.2))
    for (const r of ripples) {
      const life = 1 - r.r / r.max
      const warm = Math.hypot(r.x * 3840 - 1050, r.y * 2160 - 1600) < 1120
      g.strokeStyle = `rgba(${warm ? '255,214,160' : '200,220,255'},${0.32 * life})`
      g.beginPath()
      g.ellipse(X(r.x), Y(r.y), px(r.r), px(r.r) * 0.32, 0, 0, Math.PI * 2)
      g.stroke()
    }
    g.restore()

    g.save()
    g.lineCap = 'round'
    g.lineWidth = Math.max(1, px(3))
    for (const d of drips) {
      const y = d.y0 + d.d / 2160
      const lit = Math.max(0, 1 - Math.hypot((d.x - LAMP.x) * 3840, (y - LAMP.y) * 2160) / 900)
      g.strokeStyle = `rgba(${lit > 0.1 ? '255,220,170' : '210,225,255'},${0.35 + lit * 0.4})`
      g.beginPath()
      g.moveTo(X(d.x), Y(y) - px(Math.min(60, d.v * 0.03)))
      g.lineTo(X(d.x), Y(y))
      g.stroke()
    }
    g.restore()

    g.save()
    g.lineCap = 'round'
    const lx = X(LAMP.x)
    const ly = Y(LAMP.y)
    const lr = px(700)
    const bm = trainView.beam && {
      x0: X(trainView.beam.x0 / 3840), y0: Y(trainView.beam.y0 / 2160), x1: X(trainView.beam.x1 / 3840), y1: Y(trainView.beam.y1 / 2160), w: px(trainView.beam.w),
    }
    for (const d of drops) {
      let lit = Math.max(0, 1 - Math.hypot(d.x - lx, d.y - ly) / lr)
      if (bm) { // raindrops caught in the train's headlamp
        const ax = bm.x1 - bm.x0, ay = bm.y1 - bm.y0, al = ax * ax + ay * ay || 1
        const u = Math.max(0, Math.min(1, ((d.x - bm.x0) * ax + (d.y - bm.y0) * ay) / al))
        const dd = Math.hypot(d.x - bm.x0 - ax * u, d.y - bm.y0 - ay * u)
        if (dd < bm.w * u + px(30)) lit = Math.max(lit, 0.8 * (1 - u))
      }
      g.strokeStyle = lit > 0.05 ? `rgba(255,216,160,${(d.a + lit * 0.45) * light})` : `rgba(200,215,240,${d.a})`
      g.lineWidth = d.w
      g.beginPath()
      g.moveTo(d.x, d.y)
      g.lineTo(d.x - d.len * WIND, d.y - d.len)
      g.stroke()
    }
    g.restore()
  }

  function loop(now) {
    if (stopped) return
    frame = requestAnimationFrame(loop)
    if (now - last < 1000 / FPS - 2) return
    const dt = Math.min((now - last) / 1000, 0.1)
    last = now
    step(dt, now)
    draw(now)
  }

  const show = () => {
    layout()
    draw(performance.now())
  }
  const onResize = () => {
    if (img.naturalWidth) show()
  }
  img.onload = () => {
    if (stopped) return
    show()
    if (!ctx.reducedMotion) {
      last = performance.now()
      frame = requestAnimationFrame(loop)
    }
    window.addEventListener('resize', onResize)
    requestAnimationFrame(() => requestAnimationFrame(() => ctx.ready()))
  }
  img.onerror = () => {
    throw new Error('last-train-platform: illustration failed to load')
  }

  // Live wallpaper: the cat wakes and watches the cursor when it comes close;
  // the signal or the empty track calls the train, the waiting train whistles and leaves.
  const offPointer = ctx.onPointer?.((e) => {
    ptr.x = e.x
    ptr.y = e.y
    ptr.seen = true
    if (e.type !== 'down' || !v) return
    const k = (v.iw * v.s) / 3840
    const x = (e.x - v.ox) / k
    const y = (e.y - v.oy) / k
    if (train.hit(x, y)) train.whistle()
    else if (Math.hypot(x - SIGNAL.x * 3840, y - SIGNAL.y * 2160) < 220 || (x > 2050 && y > 1240)) train.call()
  })

  return {
    unmount() {
      stopped = true
      offPointer?.()
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', onResize)
      container.replaceChildren()
    },
  }
}
