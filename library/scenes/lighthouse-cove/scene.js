// Lighthouse Cove — a small lighthouse and stone cottage on a rocky cove,
// a full moon over a calm sea.
// The illustration is still; a canvas on top adds:
//   - the lighthouse beam sweeping round (a soft flash when it faces you);
//   - glints on the moon's path and the open sea, a slow wash on the shore;
//   - stars twinkling (found in the picture itself), a breathing moon glow;
//   - chimney smoke and warm, gently glowing windows.
// Live wallpaper: when the mouse moves on the desktop the beam slowly turns to
// find the cursor and lights the water where it points; a few seconds after
// the mouse stops it goes back to sweeping.
// With reducedMotion everything is drawn once and nothing moves.
import photoUrl from './lighthouse-cove.jpg'

// Places in the illustration, in pixels of the 3840×2160 original.
const SW = 3840
const LANTERN = { x: 2880, y: 352 }
const MOON = { x: 1110, y: 450 }
const CHIMNEY = { x: 3472, y: 600 }
const WINDOWS = [
  { x: 3292, y: 738, r: 40 },
  { x: 3350, y: 876, r: 60 },
  { x: 3490, y: 876, r: 36 },
  { x: 2810, y: 575, r: 30 },
]
const HORIZON = 1105
const SHORE = { x: 1500, y: 1830 }

const FPS = 30
const SWEEP_SECONDS = 16
const AIM_HOLD_MS = 4000
const BEAM_LAYER_SCALE = 0.25 // beams are drawn small and scaled up, which keeps their edges soft
const MAX_STARS = 140

// Sea: left of the rocks, between the horizon and the shore.
const seaMaxX = (y) => (y < 1300 ? 2250 : y < 1500 ? 2500 : 2900)
const inSea = (x, y) => y > HORIZON + 6 && y < 1720 && x > 0 && x < seaMaxX(y)

export function mount(container, ctx) {
  const img = document.createElement('img')
  img.src = photoUrl
  img.alt = ''
  img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;'
  const canvas = document.createElement('canvas')
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;'
  container.replaceChildren(img, canvas)
  const g = canvas.getContext('2d')
  const layer = document.createElement('canvas')
  const lg = layer.getContext('2d')

  let v = null
  let stars = []
  let glints = []
  let smoke = []
  let frame = 0
  let last = 0
  let glintT = 0
  let smokeT = 0
  let aimAng = Math.PI
  let aimMix = 0
  let lastMove = -1e9
  let stopped = false
  const ptr = { x: 0, y: 0, seen: false }

  // source pixels -> screen
  const X = (x) => v.ox + x * v.k
  const Y = (y) => v.oy + y * v.k
  const toSrc = (px, py) => ({ x: (px - v.ox) / v.k, y: (py - v.oy) / v.k })

  function layout() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = container.clientWidth || window.innerWidth
    const h = container.clientHeight || window.innerHeight
    const iw = img.naturalWidth
    const ih = img.naturalHeight
    const s = Math.max(w / iw, h / ih)
    v = { w, h, dpr, s, iw, ih, ox: (w - iw * s) / 2, oy: (h - ih * s) / 2, k: (iw / SW) * s }
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    layer.width = Math.max(1, Math.ceil(w * BEAM_LAYER_SCALE))
    layer.height = Math.max(1, Math.ceil(h * BEAM_LAYER_SCALE))
    stars = findStars()
    glints = []
    smoke = []
  }

  // Small bright points in the sky of the picture itself.
  function findStars() {
    try {
      const w = 960
      const h = 250 // the top 1000 source pixels
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      const cg = c.getContext('2d')
      const f = img.naturalWidth / SW
      cg.drawImage(img, 0, 0, SW * f, 1000 * f, 0, 0, w, h)
      const d = cg.getImageData(0, 0, w, h).data
      const L = (x, y) => {
        const i = (y * w + x) * 4
        return 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]
      }
      const out = []
      for (let y = 3; y < h - 3; y++) {
        for (let x = 3; x < w - 3; x++) {
          const l = L(x, y)
          if (l < 120) continue
          let sum = 0
          for (let j = -3; j <= 3; j += 3) for (let i = -3; i <= 3; i += 3) if (i || j) sum += L(x + i, y + j)
          const sx = x * 4 + 2
          const sy = y * 4 + 2
          if (l - sum / 8 > 55 && Math.hypot(sx - MOON.x, sy - MOON.y) > 260 && Math.hypot(sx - LANTERN.x, sy - LANTERN.y) > 260) {
            out.push({ x: sx, y: sy, ph: Math.random() * 6.28, sp: 0.6 + Math.random() * 1.6 })
          }
        }
      }
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[out[i], out[j]] = [out[j], out[i]]
      }
      return out.slice(0, MAX_STARS)
    } catch {
      return []
    }
  }

  function spawnGlint(cx, cy, spread) {
    let x, y
    if (cx !== undefined) {
      x = cx + (Math.random() - 0.5) * spread
      y = cy + (Math.random() - 0.5) * spread * 0.35
    } else if (Math.random() < 0.55) { // the moon's path
      y = HORIZON + 10 + Math.random() * 860
      const half = 90 + (y - HORIZON) * 0.18
      x = 1140 + (Math.random() - 0.5) * half * 2
    } else {
      y = HORIZON + 10 + Math.random() ** 0.8 * 600
      x = Math.random() * seaMaxX(y)
    }
    if (!inSea(x, y)) return
    const depth = (y - HORIZON) / 615
    glints.push({ x, y, len: 8 + depth * 26 + Math.random() * 10, age: 0, life: 0.5 + Math.random() * 1.1, warm: cx !== undefined })
  }

  function glow(x, y, r, rgb, a, op, sy = 1) {
    if (a <= 0.002 || r <= 0) return
    g.save()
    g.globalCompositeOperation = op
    g.translate(x, y)
    g.scale(1, sy)
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, r)
    gr.addColorStop(0, `rgba(${rgb},${a})`)
    gr.addColorStop(1, `rgba(${rgb},0)`)
    g.fillStyle = gr
    g.fillRect(-r, -r, r * 2, r * 2)
    g.restore()
  }

  // One soft wedge of light on the beam layer.
  function wedge(lx, ly, ang, len, half, alpha) {
    if (alpha <= 0.002 || len < 1) return
    const ex = lx + Math.cos(ang) * len
    const ey = ly + Math.sin(ang) * len
    const nx = -Math.sin(ang)
    const ny = Math.cos(ang)
    const st = 14 * v.k * BEAM_LAYER_SCALE
    const gr = lg.createLinearGradient(lx, ly, ex, ey)
    gr.addColorStop(0, `rgba(255,236,190,${alpha})`)
    gr.addColorStop(0.75, `rgba(255,236,190,${alpha * 0.55})`)
    gr.addColorStop(1, 'rgba(255,236,190,0)')
    lg.fillStyle = gr
    const w = Math.tan(half) * len
    lg.beginPath()
    lg.moveTo(lx + nx * st, ly + ny * st)
    lg.lineTo(ex + nx * w, ey + ny * w)
    lg.lineTo(ex - nx * w, ey - ny * w)
    lg.lineTo(lx - nx * st, ly - ny * st)
    lg.closePath()
    lg.fill()
  }
  function beam(lx, ly, ang, len, alpha) {
    if (alpha <= 0.002) return
    const b = BEAM_LAYER_SCALE
    for (let i = 0; i < 6; i++) {
      const k = 1 - i / 6 // outer -> inner
      wedge(lx * b, ly * b, ang, len * b * (0.75 + 0.25 * k), 0.012 + 0.07 * k, alpha * 0.24)
    }
  }

  function step(dt, now, t) {
    smokeT += dt
    if (smokeT > 0.35) {
      smokeT = 0
      smoke.push({ x: CHIMNEY.x + (Math.random() - 0.5) * 10, y: CHIMNEY.y, r: 10, age: 0, life: 7 + Math.random() * 3, ph: Math.random() * 6 })
    }
    for (const p of smoke) {
      p.age += dt
      p.y -= 34 * dt
      p.x += (14 + 10 * Math.sin(t * 0.5 + p.ph)) * dt
      p.r += 9 * dt
    }
    smoke = smoke.filter((p) => p.age < p.life)

    glintT += dt
    while (glintT > 0.022) {
      glintT -= 0.022
      spawnGlint()
    }
    for (const gl of glints) gl.age += dt
    glints = glints.filter((gl) => gl.age < gl.life)

    const active = ptr.seen && now - lastMove < AIM_HOLD_MS
    aimMix += ((active ? 1 : 0) - aimMix) * Math.min(1, dt * (active ? 2.5 : 0.8))
    const lx = X(LANTERN.x)
    const ly = Y(LANTERN.y)
    let diff = Math.atan2(ptr.y - ly, ptr.x - lx) - aimAng
    while (diff > Math.PI) diff -= 2 * Math.PI
    while (diff < -Math.PI) diff += 2 * Math.PI
    aimAng += diff * Math.min(1, dt * 1.6) // turns slowly, like a heavy lamp
  }

  function draw(now, dt) {
    const t = now / 1000
    g.clearRect(0, 0, v.w, v.h)

    g.save()
    g.globalCompositeOperation = 'lighter'
    for (const st of stars) {
      const a = Math.max(0, Math.sin(t * st.sp + st.ph)) ** 3 * (ctx.reducedMotion ? 0.25 : 0.55)
      if (a < 0.02) continue
      const x = X(st.x)
      const y = Y(st.y)
      const r = Math.max(1.2, 9 * v.k)
      const gr = g.createRadialGradient(x, y, 0, x, y, r)
      gr.addColorStop(0, `rgba(235,240,255,${a})`)
      gr.addColorStop(1, 'rgba(235,240,255,0)')
      g.fillStyle = gr
      g.fillRect(x - r, y - r, r * 2, r * 2)
    }
    g.restore()

    glow(X(MOON.x), Y(MOON.y), 520 * v.k, '220,225,255', 0.06 + 0.025 * Math.sin(t * 0.35), 'screen')

    for (const p of smoke) {
      glow(X(p.x), Y(p.y), p.r * v.k, '205,214,232', 0.1 * Math.sin((Math.PI * p.age) / p.life), 'source-over')
    }
    for (const w of WINDOWS) glow(X(w.x), Y(w.y), w.r * 2.2 * v.k, '255,190,110', 0.1 + 0.04 * Math.sin(t * 1.3 + w.x), 'lighter')

    // the beam: free sweep, or turned toward the cursor
    const lx = X(LANTERN.x)
    const ly = Y(LANTERN.y)
    const phi = t * ((2 * Math.PI) / SWEEP_SECONDS)
    const c = Math.cos(phi)
    const toward = Math.sin(phi)
    const sweepAng = c < 0 ? Math.PI - 0.035 : 0.035
    const aimLen = Math.hypot(ptr.x - lx, ptr.y - ly) * 1.12 + 60 * v.k
    lg.globalCompositeOperation = 'source-over'
    lg.clearRect(0, 0, layer.width, layer.height)
    lg.globalCompositeOperation = 'lighter'
    beam(lx, ly, sweepAng, 3000 * Math.abs(c) * v.k, 0.3 * Math.abs(c) ** 0.7 * (1 - aimMix))
    beam(lx, ly, aimAng, aimLen, 0.36 * aimMix)
    g.save()
    g.globalCompositeOperation = 'lighter'
    g.imageSmoothingQuality = 'high'
    g.drawImage(layer, 0, 0, layer.width / BEAM_LAYER_SCALE, layer.height / BEAM_LAYER_SCALE)
    g.restore()

    const flash = Math.max(0, (toward - 0.82) / 0.18) * (1 - aimMix)
    glow(lx, ly, (160 + 260 * flash) * v.k, '255,232,180', 0.25 + 0.55 * flash + 0.2 * aimMix, 'lighter')

    // where the beam lands, the water lights up
    const reach = aimLen - 60 * v.k
    const tip = toSrc(lx + Math.cos(aimAng) * reach, ly + Math.sin(aimAng) * reach)
    if (aimMix > 0.05 && inSea(tip.x, tip.y)) {
      glow(X(tip.x), Y(tip.y), 420 * v.k, '255,236,200', 0.45 * aimMix, 'lighter', 0.3)
      if (Math.random() < dt * 70 * aimMix) spawnGlint(tip.x, tip.y, 520)
      if (Math.random() < dt * 70 * aimMix) spawnGlint(tip.x, tip.y, 360)
    }
    if (1 - aimMix > 0.05 && Math.abs(c) > 0.3) { // the sweep brushes the water far out
      const wx = LANTERN.x + (c < 0 ? -1 : 1) * 1500 * Math.abs(c)
      const wy = HORIZON + 120
      if (inSea(wx, wy)) glow(X(wx), Y(wy), 340 * v.k, '255,236,200', 0.1 * Math.abs(c) * (1 - aimMix), 'lighter', 0.18)
    }

    g.save()
    g.globalCompositeOperation = 'lighter'
    g.lineCap = 'round'
    g.lineWidth = Math.max(1, 3 * v.k)
    for (const gl of glints) {
      const a = Math.sin((Math.PI * gl.age) / gl.life) * (gl.warm ? 0.75 : 0.55)
      g.strokeStyle = gl.warm ? `rgba(255,236,200,${a})` : `rgba(225,235,255,${a})`
      const x = X(gl.x)
      const y = Y(gl.y)
      const hl = (gl.len * v.k) / 2
      g.beginPath()
      g.moveTo(x - hl, y)
      g.lineTo(x + hl, y)
      g.stroke()
    }
    g.restore()

    glow(X(SHORE.x), Y(SHORE.y), 1300 * v.k, '190,225,255', 0.035 * (0.5 + 0.5 * Math.sin(t * 0.55)), 'lighter', 0.12)
  }

  function loop(now) {
    if (stopped) return
    frame = requestAnimationFrame(loop)
    if (now - last < 1000 / FPS - 2) return
    const dt = Math.min((now - last) / 1000, 0.1)
    last = now
    step(dt, now, now / 1000)
    draw(now, dt)
  }

  const show = () => {
    layout()
    for (let i = 0; i < 40; i++) spawnGlint()
    draw(performance.now(), 0)
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
    throw new Error('lighthouse-cove: illustration failed to load')
  }

  // Live wallpaper: the beam turns to find the cursor.
  const offPointer = ctx.onPointer?.((e) => {
    ptr.x = e.x
    ptr.y = e.y
    ptr.seen = true
    lastMove = performance.now()
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
