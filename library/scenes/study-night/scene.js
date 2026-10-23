// Study Night — a woman studies by a rainy window, headphones on, tea beside her.
// The illustration is still; a canvas on top adds, following the reference video:
//   - wet, slightly misted glass with lens-like drops and drops that slide down;
//   - faint rain outside and slowly shimmering city lights;
//   - her head nodding very gently to the music, her pen hand moving a little,
//     slow breathing (tiny, feathered warps of the picture itself);
//   - steam from the tea, a softly breathing lamp, a candle and a lantern.
// With reducedMotion everything is drawn once and nothing moves.
import photoUrl from './study-night.jpg'

// Places in the illustration, as fractions of its width and height.
const PANES = [
  { x0: 0.392, y0: 0.0, x1: 0.472, y1: 0.485 }, // narrow pane beside her head
  { x0: 0.502, y0: 0.0, x1: 0.901, y1: 0.62 }, // main pane
]
const HEAD = { x0: 0.225, y0: 0.2, x1: 0.392, y1: 0.465, px: 0.309, py: 0.45 } // pivot at the neck
const TORSO = { x0: 0.235, y0: 0.45, x1: 0.48, y1: 0.73, px: 0.36, py: 0.73 }
const HAND = { x: 0.452, y: 0.555, r: 0.035 }
const CUP = { x: 0.227, y: 0.585 }
const GLOWS = [
  { x: 0.133, y: 0.42, r: 0.18, rgb: '255,190,110', base: 0.1, amp: 0.03, speed: 0.5 }, // lamp: slow breathing
  { x: 0.879, y: 0.69, r: 0.06, rgb: '255,170,80', base: 0.16, amp: 0.06, speed: 2.1 }, // lantern: candle
  { x: 0.121, y: 0.78, r: 0.05, rgb: '255,170,80', base: 0.14, amp: 0.05, speed: 2.6 }, // candle
]

const FPS = 30
const GLASS_BLUR_PX = 1.6
const DROPS_PER_MEGAPIXEL = 1300
const NEW_DROPS_PER_SECOND = 35
const SLIDERS_MAX = 5
const STREAKS_PER_MEGAPIXEL = 140
const TWINKLES = 45
const STATIC_REDRAW_MS = 160

export function mount(container, ctx) {
  const img = document.createElement('img')
  img.src = photoUrl
  img.alt = ''
  img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;'
  const canvas = document.createElement('canvas')
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;'
  container.replaceChildren(img, canvas)
  const g = canvas.getContext('2d')

  const sharp = document.createElement('canvas')
  const blurred = document.createElement('canvas')
  const mist = document.createElement('canvas')
  const resting = document.createElement('canvas')
  const patch = document.createElement('canvas') // scratch for the head/torso/hand warps

  let v = null
  let panes = []
  let drops = []
  let sliders = []
  let streaks = []
  let steam = []
  let twinkles = []
  let frame = 0
  let last = 0
  let lastStatic = -1e9
  let staticDirty = true
  let refog = 0
  let stopped = false
  const puff = makePuff()

  const at = (fx, fy) => ({ x: v.ox + fx * v.iw * v.s, y: v.oy + fy * v.ih * v.s })
  const box = (b) => {
    const a = at(b.x0, b.y0)
    const c = at(b.x1, b.y1)
    return { x: a.x, y: a.y, w: c.x - a.x, h: c.y - a.y }
  }

  function layout() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = container.clientWidth || window.innerWidth
    const h = container.clientHeight || window.innerHeight
    const iw = img.naturalWidth
    const ih = img.naturalHeight
    const s = Math.max(w / iw, h / ih)
    v = { w, h, dpr, s, iw, ih, ox: (w - iw * s) / 2, oy: (h - ih * s) / 2 }
    for (const c of [canvas, sharp, blurred, mist, resting, patch]) {
      c.width = Math.round(w * dpr)
      c.height = Math.round(h * dpr)
    }
    const sg = sharp.getContext('2d')
    sg.setTransform(dpr, 0, 0, dpr, 0, 0)
    sg.drawImage(img, v.ox, v.oy, iw * s, ih * s)
    const bg = blurred.getContext('2d')
    bg.filter = `blur(${GLASS_BLUR_PX * dpr}px)`
    bg.drawImage(sharp, 0, 0)
    bg.filter = 'none'
    bg.fillStyle = 'rgba(120,150,180,0.05)'
    bg.fillRect(0, 0, blurred.width, blurred.height)

    panes = PANES.map(box).filter((p) => p.w > 4 && p.h > 4)
    const mg = mist.getContext('2d')
    mg.clearRect(0, 0, mist.width, mist.height)
    clipPanes(mg, dpr, () => mg.drawImage(blurred, 0, 0))

    twinkles = findLights()
    seed()
  }

  function clipPanes(c, scale, fn) {
    c.save()
    c.beginPath()
    for (const p of panes) c.rect(p.x * scale, p.y * scale, p.w * scale, p.h * scale)
    c.clip()
    fn()
    c.restore()
  }

  // Bright window lights in the city, found in the picture itself.
  function findLights() {
    const out = []
    const sg = sharp.getContext('2d')
    for (let tries = 0; tries < 4000 && out.length < TWINKLES; tries++) {
      const p = panes[tries % panes.length]
      const x = p.x + Math.random() * p.w
      const y = p.y + p.h * 0.15 + Math.random() * p.h * 0.75
      const [r, gg, b] = sg.getImageData(Math.round(x * v.dpr), Math.round(y * v.dpr), 1, 1).data
      if (r + gg + b > 520 && r > b) out.push({ x, y, phase: Math.random() * 6.3, speed: 0.4 + Math.random() * 1.2, size: 2 + Math.random() * 3 })
    }
    return out
  }

  const glassArea = () => panes.reduce((t, p) => t + p.w * p.h, 0) / 1e6
  function pickPane() {
    let r = Math.random() * panes.reduce((t, p) => t + p.w * p.h, 0)
    for (const p of panes) if ((r -= p.w * p.h) <= 0) return p
    return panes[0]
  }
  const newDrop = (p = pickPane()) => ({ p, x: p.x + Math.random() * p.w, y: p.y + Math.random() * p.h, r: 0.7 + Math.random() ** 3 * 4, sq: 0.9 + Math.random() * 0.25 })
  const newStreak = (p = pickPane()) => ({ p, x: p.x + Math.random() * p.w, y: p.y + Math.random() * p.h, len: 10 + Math.random() * 18, v: 420 + Math.random() * 280 })
  function seed() {
    drops = Array.from({ length: Math.round(glassArea() * DROPS_PER_MEGAPIXEL) }, () => newDrop())
    sliders = []
    streaks = Array.from({ length: Math.round(glassArea() * STREAKS_PER_MEGAPIXEL) }, () => newStreak())
    steam = []
    staticDirty = true
  }

  function step(dt) {
    let landing = glassArea() * NEW_DROPS_PER_SECOND * dt
    while (landing > 0) {
      if (Math.random() < landing) {
        const d = newDrop()
        const hit = drops.find((o) => o.p === d.p && Math.hypot(o.x - d.x, o.y - d.y) < o.r + d.r)
        if (hit) hit.r = Math.min(Math.hypot(hit.r, d.r), 6)
        else drops.push(d)
        staticDirty = true
      }
      landing -= 1
    }
    const cap = Math.round(glassArea() * DROPS_PER_MEGAPIXEL * 1.15)
    if (drops.length > cap) {
      drops.splice(0, drops.length - cap)
      staticDirty = true
    }
    if (sliders.length < SLIDERS_MAX && Math.random() < dt * 0.35) {
      const heavy = drops.filter((d) => d.r > 3.4 && d.y < d.p.y + d.p.h * 0.7)
      const d = heavy.length ? heavy[Math.floor(Math.random() * heavy.length)] : null
      if (d) {
        drops.splice(drops.indexOf(d), 1)
        sliders.push({ p: d.p, x: d.x, y: d.y, r: d.r, v: 0, pause: 0, wander: Math.random() * 10, lastX: d.x, lastY: d.y })
        staticDirty = true
      }
    }
    const mg = mist.getContext('2d')
    for (const s of sliders) {
      if (s.pause > 0) {
        s.pause -= dt
        continue
      }
      s.v = Math.min(s.v + 220 * dt, 40 + s.r * 22)
      if (Math.random() < dt * 0.6) {
        s.pause = 0.15 + Math.random() * 0.8
        s.v *= 0.2
      }
      s.wander += dt * 1.7
      s.lastX = s.x
      s.lastY = s.y
      s.y += s.v * dt
      s.x += Math.sin(s.wander) * 4 * dt
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i]
        if (d.p === s.p && Math.abs(d.x - s.x) < s.r + d.r && d.y > s.lastY - s.r && d.y < s.y + s.r) {
          drops.splice(i, 1)
          s.r = Math.min(Math.hypot(s.r, d.r * 0.6), 7)
          staticDirty = true
        }
      }
      mg.save()
      mg.globalCompositeOperation = 'destination-out'
      mg.strokeStyle = 'rgba(0,0,0,0.85)'
      mg.lineCap = 'round'
      mg.lineWidth = s.r * 1.25 * v.dpr
      mg.beginPath()
      mg.moveTo(s.lastX * v.dpr, s.lastY * v.dpr)
      mg.lineTo(s.x * v.dpr, s.y * v.dpr)
      mg.stroke()
      mg.restore()
      if (Math.random() < dt * 9) {
        drops.push({ p: s.p, x: s.x + (Math.random() - 0.5) * s.r, y: s.y - s.r * (1.5 + Math.random() * 2), r: 0.5 + Math.random() * 0.9, sq: 1 })
        staticDirty = true
      }
    }
    sliders = sliders.filter((s) => s.y < s.p.y + s.p.h + s.r * 2)
    // Wiped trails mist over again, in occasional larger steps (tiny per-frame
    // blends lose colour to 8-bit rounding).
    refog += dt
    if (refog > 1.5) {
      refog = 0
      mg.save()
      mg.globalAlpha = 0.16
      clipPanes(mg, v.dpr, () => mg.drawImage(blurred, 0, 0))
      mg.restore()
    }
    for (const r of streaks) {
      r.y += r.v * dt
      r.x -= r.v * dt * 0.08
      if (r.y > r.p.y + r.p.h || r.x < r.p.x) Object.assign(r, newStreak(r.p), { y: r.p.y - Math.random() * 40 })
    }
    if (Math.random() < dt * 2.2) {
      const c = at(CUP.x, CUP.y)
      steam.push({ x: c.x + (Math.random() - 0.5) * 10, y: c.y, age: 0, life: 3.5 + Math.random() * 2, drift: Math.random() * 6 })
    }
    for (const s of steam) {
      s.age += dt
      s.y -= 13 * dt
      s.x += Math.sin(s.age * 1.3 + s.drift) * 5 * dt
    }
    steam = steam.filter((s) => s.age < s.life)
  }

  function drawDrop(c, x, y, rx, ry) {
    const d = v.dpr
    c.save()
    c.beginPath()
    c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
    c.clip()
    const R = Math.max(rx, ry) * 2.6
    c.translate(x, y)
    c.scale(1, -1)
    c.drawImage(sharp, (x - R) * d, (y - R) * d, 2 * R * d, 2 * R * d, -rx, -ry, 2 * rx, 2 * ry)
    c.restore()
    if (rx < 1.1) return
    const rim = c.createLinearGradient(x, y - ry, x, y + ry)
    rim.addColorStop(0, 'rgba(0,0,0,0.38)')
    rim.addColorStop(0.45, 'rgba(0,0,0,0)')
    rim.addColorStop(0.8, 'rgba(255,255,255,0)')
    rim.addColorStop(1, 'rgba(255,240,220,0.32)')
    c.strokeStyle = rim
    c.lineWidth = Math.max(0.6, rx * 0.22)
    c.beginPath()
    c.ellipse(x, y, rx * 0.92, ry * 0.92, 0, 0, Math.PI * 2)
    c.stroke()
    if (rx > 2.2) {
      c.fillStyle = 'rgba(255,255,255,0.35)'
      c.beginPath()
      c.ellipse(x - rx * 0.35, y - ry * 0.45, rx * 0.14, ry * 0.1, -0.5, 0, Math.PI * 2)
      c.fill()
    }
  }

  function drawResting() {
    const rg = resting.getContext('2d')
    rg.setTransform(1, 0, 0, 1, 0, 0)
    rg.clearRect(0, 0, resting.width, resting.height)
    rg.setTransform(v.dpr, 0, 0, v.dpr, 0, 0)
    for (const d of drops) drawDrop(rg, d.x, d.y, d.r * d.sq, d.r)
    staticDirty = false
  }

  // Redraws a feathered patch of the picture, rotated/scaled/shifted a tiny
  // amount around a pivot. Because the change is a few pixels at most and the
  // edges fade out, it reads as natural movement rather than a cut-out.
  function warp(b, { angle = 0, sy = 1, dx = 0, dy = 0 }) {
    const r = box(b)
    const pivot = at(b.px ?? (b.x0 + b.x1) / 2, b.py ?? (b.y0 + b.y1) / 2)
    const d = v.dpr
    const pg = patch.getContext('2d')
    pg.setTransform(1, 0, 0, 1, 0, 0)
    pg.clearRect(0, 0, patch.width, patch.height)
    pg.setTransform(d, 0, 0, d, 0, 0)
    pg.save()
    pg.translate(pivot.x + dx, pivot.y + dy)
    pg.rotate(angle)
    pg.scale(1, sy)
    pg.translate(-pivot.x, -pivot.y)
    pg.drawImage(sharp, r.x * d, r.y * d, r.w * d, r.h * d, r.x, r.y, r.w, r.h)
    pg.restore()
    // Feather: keep the middle, fade the edges.
    const cx = r.x + r.w / 2
    const cy = r.y + r.h / 2
    const mask = pg.createRadialGradient(cx, cy, Math.min(r.w, r.h) * 0.25, cx, cy, Math.max(r.w, r.h) * 0.62)
    mask.addColorStop(0, 'rgba(0,0,0,1)')
    mask.addColorStop(1, 'rgba(0,0,0,0)')
    pg.globalCompositeOperation = 'destination-in'
    pg.fillStyle = mask
    pg.fillRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4)
    pg.globalCompositeOperation = 'source-over'
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.drawImage(patch, 0, 0)
    g.setTransform(d, 0, 0, d, 0, 0)
  }

  function draw(t) {
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.clearRect(0, 0, canvas.width, canvas.height)
    g.setTransform(v.dpr, 0, 0, v.dpr, 0, 0)

    // City lights shimmer softly; rain falls outside.
    clipPanes(g, 1, () => {
      g.globalCompositeOperation = 'lighter'
      for (const L of twinkles) {
        const a = 0.12 * Math.max(0, Math.sin(t * L.speed + L.phase))
        if (a < 0.01) continue
        const gr = g.createRadialGradient(L.x, L.y, 0, L.x, L.y, L.size * 2)
        gr.addColorStop(0, `rgba(255,210,150,${a})`)
        gr.addColorStop(1, 'rgba(255,210,150,0)')
        g.fillStyle = gr
        g.fillRect(L.x - L.size * 2, L.y - L.size * 2, L.size * 4, L.size * 4)
      }
      g.globalCompositeOperation = 'source-over'
      g.strokeStyle = 'rgba(200,220,240,0.12)'
      g.lineWidth = 0.8
      g.beginPath()
      for (const r of streaks) {
        g.moveTo(r.x, r.y)
        g.lineTo(r.x + r.len * 0.08, r.y - r.len)
      }
      g.stroke()
    })

    // Wet glass, resting drops, sliding drops.
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.drawImage(mist, 0, 0)
    g.drawImage(resting, 0, 0)
    g.setTransform(v.dpr, 0, 0, v.dpr, 0, 0)
    clipPanes(g, 1, () => {
      for (const s of sliders) {
        drawDrop(g, s.x, s.y - s.r * 0.6, s.r * 0.55, s.r * 0.75)
        drawDrop(g, s.x, s.y, s.r * 0.9, s.r * 1.15)
      }
    })

    // Her: slow breathing, a gentle nod to the music, a small pen movement.
    warp(TORSO, { sy: 1 + 0.004 * Math.sin(t * 1.4) })
    const nod = Math.sin(t * 4.4) * (0.5 + 0.5 * Math.sin(t * 0.21)) // nods in phrases, rests between
    warp(HEAD, { angle: (0.55 * Math.PI / 180) * nod, dy: 0.6 * Math.max(0, nod) })
    const hand = { x0: HAND.x - HAND.r, y0: HAND.y - HAND.r, x1: HAND.x + HAND.r, y1: HAND.y + HAND.r }
    const writing = Math.sin(t * 0.5) > -0.3 // writes, pauses, writes
    warp(hand, writing ? { dx: 1.1 * Math.sin(t * 7), dy: 0.6 * Math.sin(t * 11) } : {})

    // Lamp, lantern, candle.
    g.globalCompositeOperation = 'lighter'
    for (const L of GLOWS) {
      const c = at(L.x, L.y)
      const a = L.base + L.amp * Math.sin(t * L.speed) + L.amp * 0.5 * Math.sin(t * L.speed * 2.3 + 1)
      const rr = L.r * v.iw * v.s
      const gr = g.createRadialGradient(c.x, c.y, 0, c.x, c.y, rr)
      gr.addColorStop(0, `rgba(${L.rgb},${Math.max(0, a)})`)
      gr.addColorStop(1, `rgba(${L.rgb},0)`)
      g.fillStyle = gr
      g.fillRect(c.x - rr, c.y - rr, rr * 2, rr * 2)
    }
    g.globalCompositeOperation = 'source-over'

    for (const s of steam) {
      const k = s.age / s.life
      const size = (10 + k * 32) * (v.s / 0.55)
      g.globalAlpha = 0.15 * Math.sin(Math.PI * k)
      g.drawImage(puff, s.x - size / 2, s.y - size / 2, size, size)
    }
    g.globalAlpha = 1
  }

  function loop(now) {
    if (stopped) return
    frame = requestAnimationFrame(loop)
    if (now - last < 1000 / FPS - 2) return
    const dt = Math.min((now - last) / 1000, 0.1)
    last = now
    step(dt)
    if (staticDirty && now - lastStatic > STATIC_REDRAW_MS) {
      drawResting()
      lastStatic = now
    }
    draw(now / 1000)
  }

  const show = () => {
    layout()
    drawResting()
    draw(0)
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
    throw new Error('study-night: illustration failed to load')
  }

  return {
    unmount() {
      stopped = true
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', onResize)
      container.replaceChildren()
    },
  }
}

function makePuff() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  const p = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  p.addColorStop(0, 'rgba(255,245,235,0.9)')
  p.addColorStop(1, 'rgba(255,245,235,0)')
  g.fillStyle = p
  g.fillRect(0, 0, 64, 64)
  return c
}
