// Rainy Window — a cozy room at night. The illustration is still; on top of it
// a canvas adds what a real rainy window does:
//   - the glass is wet, so the city behind it looks softly blurred;
//   - water drops sit on the glass and act as tiny lenses: each one shows a
//     small, upside-down, sharper image of what is behind it (no "balls");
//   - now and then a heavy drop slides down, collecting the drops in its path
//     and wiping a clearer trail that slowly mists over again;
//   - faint rain falls outside, steam rises from the cup, the lamp glows softly.
// With reducedMotion the glass and drops are drawn once and nothing moves.
import photoUrl from './rainy-window.jpg'

// Places in the illustration, as fractions of its width and height.
const PANES = [
  { x0: 0.0, y0: 0.0, x1: 0.153, y1: 0.605 }, // left pane
  { x0: 0.193, y0: 0.0, x1: 0.586, y1: 0.578 }, // main pane
]
const LAMP = { x: 0.629, y: 0.468, r: 0.2 }
const CUP = { x: 0.49, y: 0.632 }

const FPS = 30
const GLASS_BLUR_PX = 2.4 // how misted the wet glass is
const DROPS_PER_MEGAPIXEL = 1500 // small drops resting on the glass (per CSS megapixel of glass)
const NEW_DROPS_PER_SECOND = 40 // per megapixel of glass
const SLIDERS_MAX = 6
const STREAKS_PER_MEGAPIXEL = 120
const STATIC_REDRAW_MS = 160 // resting drops change slowly; redraw them ~6×/s

export function mount(container, ctx) {
  const img = document.createElement('img')
  img.src = photoUrl
  img.alt = ''
  img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;'
  const canvas = document.createElement('canvas')
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;'
  container.replaceChildren(img, canvas)
  const g = canvas.getContext('2d')

  // Offscreen layers, all in device pixels.
  const sharp = document.createElement('canvas') // the illustration as shown on screen
  const blurred = document.createElement('canvas') // the same, misted
  const mist = document.createElement('canvas') // misted glass; trails wipe it clear
  const resting = document.createElement('canvas') // drops resting on the glass

  let v = null // view: size, dpr and cover mapping
  let panes = []
  let drops = []
  let sliders = []
  let streaks = []
  let steam = []
  let frame = 0
  let last = 0
  let lastStatic = -1e9
  let staticDirty = true
  let refog = 0
  let stopped = false
  const puffSprite = makePuffSprite()

  function layout() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = container.clientWidth || window.innerWidth
    const h = container.clientHeight || window.innerHeight
    const iw = img.naturalWidth
    const ih = img.naturalHeight
    const s = Math.max(w / iw, h / ih)
    v = { w, h, dpr, s, iw, ih, ox: (w - iw * s) / 2, oy: (h - ih * s) / 2 }
    for (const c of [canvas, sharp, blurred, mist, resting]) {
      c.width = Math.round(w * dpr)
      c.height = Math.round(h * dpr)
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0)

    const sg = sharp.getContext('2d')
    sg.setTransform(dpr, 0, 0, dpr, 0, 0)
    sg.drawImage(img, v.ox, v.oy, iw * s, ih * s)
    const bg = blurred.getContext('2d')
    bg.setTransform(1, 0, 0, 1, 0, 0)
    bg.filter = `blur(${GLASS_BLUR_PX * dpr}px)`
    bg.drawImage(sharp, 0, 0)
    bg.filter = 'none'
    // A faint cool sheen of water on the glass.
    bg.fillStyle = 'rgba(120,150,180,0.06)'
    bg.fillRect(0, 0, blurred.width, blurred.height)

    panes = PANES.map((p) => {
      const a = at(p.x0, p.y0)
      const b = at(p.x1, p.y1)
      return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y }
    }).filter((p) => p.w > 4 && p.h > 4)

    const mg = mist.getContext('2d')
    mg.setTransform(1, 0, 0, 1, 0, 0)
    mg.clearRect(0, 0, mist.width, mist.height)
    mg.save()
    mg.beginPath()
    for (const p of panes) mg.rect(p.x * dpr, p.y * dpr, p.w * dpr, p.h * dpr)
    mg.clip()
    mg.drawImage(blurred, 0, 0)
    mg.restore()
    seed()
  }

  const at = (fx, fy) => ({ x: v.ox + fx * v.iw * v.s, y: v.oy + fy * v.ih * v.s })
  const glassArea = () => panes.reduce((sum, p) => sum + p.w * p.h, 0) / 1e6
  function pickPane() {
    let r = Math.random() * panes.reduce((sum, p) => sum + p.w * p.h, 0)
    for (const p of panes) if ((r -= p.w * p.h) <= 0) return p
    return panes[0]
  }
  // Most drops are tiny; a few are larger. Sizes in CSS pixels.
  const dropSize = () => 0.7 + Math.random() ** 3 * 4.2
  function newDrop(p = pickPane()) {
    const r = dropSize()
    return { p, x: p.x + Math.random() * p.w, y: p.y + Math.random() * p.h, r, sq: 0.9 + Math.random() * 0.25 }
  }
  function newStreak(p = pickPane()) {
    return { p, x: p.x + Math.random() * p.w, y: p.y + Math.random() * p.h, len: 10 + Math.random() * 18, v: 420 + Math.random() * 280 }
  }
  function seed() {
    drops = Array.from({ length: Math.round(glassArea() * DROPS_PER_MEGAPIXEL) }, () => newDrop())
    sliders = []
    streaks = Array.from({ length: Math.round(glassArea() * STREAKS_PER_MEGAPIXEL) }, () => newStreak())
    steam = []
    staticDirty = true
  }

  function step(dt) {
    // New drops land; a drop landing on another merges with it.
    let landing = glassArea() * NEW_DROPS_PER_SECOND * dt
    while (landing > 0) {
      if (Math.random() < landing) {
        const d = newDrop()
        const hit = drops.find((o) => o.p === d.p && Math.hypot(o.x - d.x, o.y - d.y) < o.r + d.r)
        if (hit) hit.r = Math.min(Math.hypot(hit.r, d.r), 6.5)
        else drops.push(d)
        staticDirty = true
      }
      landing -= 1
    }
    // Keep the glass from filling up: the oldest tiny drops dry away.
    const cap = Math.round(glassArea() * DROPS_PER_MEGAPIXEL * 1.15)
    if (drops.length > cap) {
      drops.splice(0, drops.length - cap)
      staticDirty = true
    }
    // A heavy drop starts to slide.
    if (sliders.length < SLIDERS_MAX && Math.random() < dt * 0.35) {
      const heavy = drops.filter((d) => d.r > 3.6 && d.y < d.p.y + d.p.h * 0.7)
      const d = heavy.length ? heavy[Math.floor(Math.random() * heavy.length)] : null
      if (d) {
        drops.splice(drops.indexOf(d), 1)
        sliders.push({ p: d.p, x: d.x, y: d.y, r: d.r, v: 0, pause: 0, wander: Math.random() * 10, lastX: d.x, lastY: d.y })
        staticDirty = true
      }
    }
    // Sliding: stick-and-slip, gathering drops in its path, wiping the mist.
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
      // Clear trail through the mist.
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
      // Tiny drops left behind in the trail.
      if (Math.random() < dt * 9) {
        drops.push({ p: s.p, x: s.x + (Math.random() - 0.5) * s.r, y: s.y - s.r * (1.5 + Math.random() * 2), r: 0.5 + Math.random() * 0.9, sq: 1 })
        staticDirty = true
      }
    }
    sliders = sliders.filter((s) => s.y < s.p.y + s.p.h + s.r * 2)

    // The wiped trails slowly mist over again. Done in occasional larger
    // steps: tiny per-frame blends lose colour to 8-bit rounding.
    refog += dt
    if (refog < 1.5) return finishStep(dt)
    refog = 0
    mg.save()
    mg.globalAlpha = 0.16
    mg.beginPath()
    for (const p of panes) mg.rect(p.x * v.dpr, p.y * v.dpr, p.w * v.dpr, p.h * v.dpr)
    mg.clip()
    mg.drawImage(blurred, 0, 0)
    mg.restore()
    finishStep(dt)
  }

  function finishStep(dt) {
    for (const r of streaks) {
      r.y += r.v * dt
      r.x -= r.v * dt * 0.1
      if (r.y > r.p.y + r.p.h || r.x < r.p.x) Object.assign(r, newStreak(r.p), { y: r.p.y - Math.random() * 40 })
    }
    if (Math.random() < dt * 2.2) {
      const c = at(CUP.x, CUP.y)
      steam.push({ x: c.x + (Math.random() - 0.5) * 12, y: c.y, age: 0, life: 3.5 + Math.random() * 2, drift: Math.random() * 6 })
    }
    for (const s of steam) {
      s.age += dt
      s.y -= 14 * dt
      s.x += Math.sin(s.age * 1.3 + s.drift) * 6 * dt
    }
    steam = steam.filter((s) => s.age < s.life)
  }

  // One water drop: a lens showing a small, flipped, sharp view of what is
  // behind it, with a darker upper rim and light caught along the bottom.
  function drawDrop(c, x, y, rx, ry) {
    const d = v.dpr
    c.save()
    c.beginPath()
    c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
    c.clip()
    const R = Math.max(rx, ry) * 2.6 // a lens sees a wider area than it covers
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
    for (const dr of drops) drawDrop(rg, dr.x, dr.y, dr.r * dr.sq, dr.r)
    staticDirty = false
  }

  function draw(time) {
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.clearRect(0, 0, canvas.width, canvas.height)
    g.setTransform(v.dpr, 0, 0, v.dpr, 0, 0)

    // Lamp: a slow, gentle breathing glow (no flicker, nothing flashes).
    const lamp = at(LAMP.x, LAMP.y)
    const glow = 0.1 + 0.035 * Math.sin(time * 0.55) + 0.02 * Math.sin(time * 1.7 + 1.3)
    const lr = LAMP.r * v.iw * v.s
    const grad = g.createRadialGradient(lamp.x, lamp.y, 0, lamp.x, lamp.y, lr)
    grad.addColorStop(0, `rgba(255,190,110,${glow})`)
    grad.addColorStop(1, 'rgba(255,190,110,0)')
    g.globalCompositeOperation = 'lighter'
    g.fillStyle = grad
    g.fillRect(lamp.x - lr, lamp.y - lr, lr * 2, lr * 2)
    g.globalCompositeOperation = 'source-over'

    // Rain outside, behind the glass.
    g.save()
    g.beginPath()
    for (const p of panes) g.rect(p.x, p.y, p.w, p.h)
    g.clip()
    g.strokeStyle = 'rgba(200,220,240,0.13)'
    g.lineWidth = 0.8
    g.beginPath()
    for (const r of streaks) {
      g.moveTo(r.x, r.y)
      g.lineTo(r.x + r.len * 0.1, r.y - r.len)
    }
    g.stroke()
    g.restore()

    // The wet glass, the drops resting on it, then the sliding drops.
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.drawImage(mist, 0, 0)
    g.drawImage(resting, 0, 0)
    g.setTransform(v.dpr, 0, 0, v.dpr, 0, 0)
    g.save()
    g.beginPath()
    for (const p of panes) g.rect(p.x, p.y, p.w, p.h)
    g.clip()
    for (const s of sliders) {
      drawDrop(g, s.x, s.y - s.r * 0.6, s.r * 0.55, s.r * 0.75) // the thinner tail above
      drawDrop(g, s.x, s.y, s.r * 0.9, s.r * 1.15) // the heavy head
    }
    g.restore()

    for (const s of steam) {
      const t = s.age / s.life
      const size = (10 + t * 34) * (v.s / 0.55)
      g.globalAlpha = 0.16 * Math.sin(Math.PI * t)
      g.drawImage(puffSprite, s.x - size / 2, s.y - size / 2, size, size)
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
    throw new Error('rainy-window: illustration failed to load')
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

function makePuffSprite() {
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
