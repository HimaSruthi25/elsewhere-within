// Night Market Alley — a narrow food-stall alley just after rain, strings of
// bulbs overhead, paper lanterns, steaming pots and a cat asleep on a crate.
// The painting (1920×1080) is drawn on a canvas with, on top:
//   - the string-light bulbs (cut out of the painting) swaying a little in the
//     breeze and flickering, with soft halos; a gentle wave of light runs along
//     the strings now and then;
//   - lantern glow flicker, steam rising from the pots, drips falling from the
//     awnings, warm glints and raindrop rings in the puddles;
//   - the cat breathing; stars twinkling in the strip of sky.
// The alley is always night; the strip of sky follows the PC clock (dusk violet,
// dawn/day blue twilight).
// Live wallpaper: running the cursor along a string of bulbs makes them flash and
// sends a wave of light and swing along the strings; clicking a bulb sends a bigger one.
// With reducedMotion one still frame is drawn (again when the time of day changes).
// The scene logic runs on a 640×360 grid (HS = 3 picture pixels per grid unit).
import photoUrl from './night-market-alley.jpg'
import bulbsUrl from './night-market-bulbs.png'
import skyUrl from './night-market-sky.png'
import { BULBS, OFFSET, STARS } from './bulbs.js'

const LW = 640
const LH = 360
const HS = 3
const FPS = 30
// places in the painting, on the 640×360 grid
const LANTERNS = [[25, 120, 16], [118, 142, 14], [456, 144, 14], [510, 128, 15], [516, 156, 13], [429, 160, 11], [404, 160, 10], [382, 166, 8], [84, 136, 6], [485, 142, 6]] // x, y, size
const POTS = [[38, 194, 34], [470, 198, 20], [122, 226, 14]] // steam: x, y, width
const EAVES = [[4, 120, 210, 128], [404, 138, 540, 104], [344, 166, 404, 152]] // drip edges: x0, y0, x1, y1
const PUDDLES = [[330, 318, 20, 4], [352, 290, 14, 3], [300, 345, 24, 5]] // cx, cy, rx, ry
const CAT = [502, 262, 78, 42] // x, y, w, h
const SKY_TINT = { night: null, dusk: ['#5a3a6a', '#d0784e', 0.55], dawn: ['#3c4a78', '#c9897a', 0.45], day: ['#3d5f8a', '#7aa2c4', 0.4] }

const rnd = (a, b) => a + Math.random() * (b - a)
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const im = new Image()
    im.onload = () => resolve(im)
    im.onerror = () => reject(new Error(`night-market-alley: ${src} failed to load`))
    im.src = src
  })
}

export function mount(container, ctx) {
  const cv = document.createElement('canvas')
  cv.width = LW * HS
  cv.height = LH * HS
  cv.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:block;pointer-events:none;'
  container.replaceChildren(cv)
  const g = cv.getContext('2d')

  let tod = ctx.timeOfDay in SKY_TINT ? ctx.timeOfDay : 'night'
  let base = null, bulbImg = null, skyImg = null, skyLayer = null, puff = null
  let stopped = false, frame = 0, last = 0, tNow = 0, nextWave = rnd(8, 16)
  const bulbs = BULBS.map((b) => ({ x: b[0], y: b[1], w: b[2], h: b[3], cx: b[4] / HS, cy: b[5] / HS, size: b[6] / 9, ang: 0, vel: 0, pulse: 0, queue: [], ph: Math.random() * 6.28, cool: 0 }))
  const stars = STARS.map((s) => [s[0] / HS, s[1] / HS])
  const steam = [], drips = [], splashes = [], rings = []
  const hand = { x: -999, y: -999, px: -999, py: -999, inside: false }

  function layout() {
    const w = container.clientWidth || window.innerWidth
    const h = container.clientHeight || window.innerHeight
    const s = Math.max(w / LW, h / LH)
    cv.style.width = `${Math.ceil(LW * s)}px`
    cv.style.height = `${Math.ceil(LH * s)}px`
  }
  function toGrid(x, y) {
    const r = cv.getBoundingClientRect()
    return [((x - r.left) / r.width) * LW, ((y - r.top) / r.height) * LH]
  }

  function wave(fromX, fromY, strength) { // a soft wave of light along the strings
    for (const b of bulbs) {
      const d = Math.hypot(b.cx - fromX, b.cy - fromY)
      if (d < 190 && b.queue.length < 3) b.queue.push({ at: tNow + d / 110, amp: strength * (1 - d / 220) })
    }
  }

  function step(dt) {
    tNow += dt
    for (const b of bulbs) {
      for (let i = b.queue.length - 1; i >= 0; i--) {
        const q = b.queue[i]
        if (tNow >= q.at) { b.pulse = Math.max(b.pulse, q.amp); b.vel += q.amp * 1.4 * (Math.random() < 0.5 ? -1 : 1); b.queue.splice(i, 1) }
      }
      const breeze = Math.sin(tNow * 0.7 + b.cx * 0.03) * 0.08
      b.vel += (-b.ang * 9 + breeze) * dt
      b.vel *= Math.pow(0.35, dt)
      b.ang = clamp(b.ang + b.vel * dt, -1.2, 1.2)
      b.pulse *= Math.pow(0.18, dt)
      b.cool -= dt
    }
    nextWave -= dt
    if (nextWave < 0) { const b = bulbs[(Math.random() * bulbs.length) | 0]; if (b) wave(b.cx, b.cy, 0.55); nextWave = rnd(14, 26) }
    if (hand.inside) { // the hand running along the strings
      const steps = Math.max(1, Math.ceil(Math.hypot(hand.x - hand.px, hand.y - hand.py) / 3))
      for (let s = 0; s <= steps; s++) {
        const x = hand.px + ((hand.x - hand.px) * s) / steps, y = hand.py + ((hand.y - hand.py) * s) / steps
        for (const b of bulbs) {
          if (b.cool <= 0 && Math.abs(b.cx - x) < 6 && Math.abs(b.cy - y) < 7) { b.cool = 1.2; b.pulse = 1; b.vel += (hand.x > hand.px ? 1 : -1) * 2.4; wave(b.cx, b.cy, 0.8) }
        }
      }
      hand.px = hand.x
      hand.py = hand.y
    }
    for (const p of POTS) if (Math.random() < dt * (p[2] > 10 ? 9 : 4)) steam.push({ x: p[0] + rnd(-p[2] / 2, p[2] / 2), y: p[1], vx: rnd(-2, 2), vy: rnd(-9, -5), life: 0, max: rnd(2.5, 4.5), s: Math.random() < 0.5 ? 2 : 1 })
    for (let i = steam.length - 1; i >= 0; i--) {
      const s = steam[i]
      s.life += dt
      s.x += (s.vx + Math.sin(tNow * 1.3 + s.y * 0.2) * 3) * dt
      s.y += s.vy * dt
      s.vy *= Math.pow(0.85, dt)
      if (s.life > s.max) steam.splice(i, 1)
    }
    for (const e of EAVES) {
      if (Math.random() < dt * 0.9) { const u = Math.random(), y = e[1] + (e[3] - e[1]) * u; drips.push({ x: Math.round(e[0] + (e[2] - e[0]) * u), y, vy: 0, hold: rnd(0.3, 1.2), floor: y + rnd(50, 120) }) }
    }
    for (let i = drips.length - 1; i >= 0; i--) {
      const d = drips[i]
      if (d.hold > 0) { d.hold -= dt; continue }
      d.vy += 260 * dt
      d.y += d.vy * dt
      if (d.y > d.floor || d.y > LH - 2) { splashes.push({ x: d.x, y: Math.min(d.y, LH - 2), t: 0 }); drips.splice(i, 1) }
    }
    for (let i = splashes.length - 1; i >= 0; i--) { splashes[i].t += dt; if (splashes[i].t > 0.25) splashes.splice(i, 1) }
    for (const p of PUDDLES) if (Math.random() < dt * 0.35) rings.push({ x: p[0] + rnd(-p[2] * 0.6, p[2] * 0.6), y: p[1] + rnd(-1, 1), t: 0 })
    for (let i = rings.length - 1; i >= 0; i--) { rings[i].t += dt; if (rings[i].t > 1.4) rings.splice(i, 1) }
  }

  function glow(x, y, r, col, a) {
    const gr = g.createRadialGradient(x, y, 0, x, y, r)
    gr.addColorStop(0, `rgba(${col},${a})`)
    gr.addColorStop(1, `rgba(${col},0)`)
    g.fillStyle = gr
    g.fillRect(x - r, y - r, r * 2, r * 2)
  }
  function ring(cx, cy, rx, ry, col) {
    g.fillStyle = col
    const n = Math.max(8, Math.round((rx + ry) * 2))
    for (let i = 0; i < n; i++) { const a = (i / n) * 6.283; g.fillRect(Math.round(cx + Math.cos(a) * rx), Math.round(cy + Math.sin(a) * ry), 1, 1) }
  }

  function render() {
    g.globalCompositeOperation = 'source-over'
    g.globalAlpha = 1
    g.setTransform(HS, 0, 0, HS, 0, 0)
    g.drawImage(base, 0, 0, LW, LH)
    if (skyLayer) g.drawImage(skyLayer, 0, 0, LW, LH)
    if (ctx.reducedMotion) return
    if (tod === 'night' || tod === 'dusk') {
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i], a = 0.5 + 0.5 * Math.sin(tNow * (0.8 + i * 0.13) + i * 2.1)
        if (a > 0.55) { g.fillStyle = `rgba(230,236,255,${(a - 0.5) * 1.6 * (tod === 'dusk' ? 0.5 : 1)})`; g.fillRect(s[0], s[1], 0.7, 0.7) }
      }
    }
    // the cat breathing: the top of its curled body rises a little
    if (Math.sin((tNow * 2 * Math.PI) / 3.4) > 0.15) g.drawImage(base, CAT[0] * HS, CAT[1] * HS + 3, CAT[2] * HS, 14 * HS, CAT[0], CAT[1], CAT[2], 14)
    g.globalCompositeOperation = 'lighter'
    for (let i = 0; i < LANTERNS.length; i++) {
      const l = LANTERNS[i]
      const f = 0.8 + 0.12 * Math.sin(tNow * 3.1 + i * 1.7) + 0.08 * Math.sin(tNow * 7.3 + i * 4.1)
      glow(l[0], l[1], l[2] * 3.2, '255,150,70', 0.2 * f)
    }
    for (const b of bulbs) {
      const fl = 0.9 + 0.06 * Math.sin(tNow * 2.3 + b.ph) + 0.04 * Math.sin(tNow * 9.1 + b.ph * 3)
      const k = Math.min(1.6, fl + b.pulse * 0.9)
      glow(b.cx + b.ang * 2.2, b.cy + Math.abs(b.ang) * 0.8, 3 + Math.sqrt(b.size) * 0.9 + b.pulse * 4, '255,190,110', 0.22 * k)
    }
    g.globalCompositeOperation = 'source-over'
    g.setTransform(1, 0, 0, 1, 0, 0)
    for (const b of bulbs) {
      const ox = b.ang * 2.2 * HS, oy = Math.abs(b.ang) * 0.8 * HS
      g.drawImage(bulbImg, b.x - OFFSET[0], b.y - OFFSET[1], b.w, b.h, b.x + ox, b.y + oy, b.w, b.h)
      if (b.pulse > 0.15) { g.fillStyle = `rgba(255,252,232,${Math.min(0.85, b.pulse)})`; g.beginPath(); g.arc(b.cx * HS + ox, b.cy * HS + oy, Math.sqrt(b.size * 9) * 0.45, 0, 7); g.fill() }
    }
    g.setTransform(HS, 0, 0, HS, 0, 0)
    if (!puff) {
      puff = document.createElement('canvas')
      puff.width = puff.height = 64
      const pc = puff.getContext('2d'), pg = pc.createRadialGradient(32, 32, 0, 32, 32, 32)
      pg.addColorStop(0, 'rgba(255,244,228,1)')
      pg.addColorStop(0.5, 'rgba(255,240,220,0.4)')
      pg.addColorStop(1, 'rgba(255,240,220,0)')
      pc.fillStyle = pg
      pc.fillRect(0, 0, 64, 64)
    }
    for (const s of steam) {
      const k = s.life / s.max, r = 3 + k * 10 + s.s
      g.globalAlpha = Math.sin(k * Math.PI) * 0.14
      g.drawImage(puff, s.x - r, s.y - r, r * 2, r * 2)
    }
    g.globalAlpha = 1
    g.fillStyle = 'rgba(190,220,235,0.85)'
    for (const d of drips) g.fillRect(d.x, Math.round(d.y), 1, d.hold > 0 ? 1 : 2)
    for (const s of splashes) {
      g.fillStyle = `rgba(200,225,240,${(1 - s.t / 0.25) * 0.8})`
      g.fillRect(s.x - 1, s.y - 1, 1, 1)
      g.fillRect(s.x + 1, s.y - 1, 1, 1)
    }
    for (const p of PUDDLES) {
      for (let i = 0; i < 3; i++) {
        const a = Math.max(0, Math.sin(tNow * (1.1 + i * 0.4) + p[0] + i * 2))
        if (a > 0.6) { g.fillStyle = `rgba(255,200,140,${(a - 0.6) * 1.8})`; g.fillRect(Math.round(p[0] + Math.sin(i * 3.1 + p[1]) * p[2] * 0.6), Math.round(p[1] + (i - 1)), 2, 1) }
      }
    }
    for (const r of rings) { const k = r.t / 1.4; ring(r.x, r.y, 1 + k * 7, 0.4 + k * 1.6, `rgba(255,215,170,${(1 - k) * 0.55})`) }
  }

  function setTod(t) {
    tod = t
    const tint = SKY_TINT[t]
    if (!tint || !skyImg) { skyLayer = null; return }
    const c = document.createElement('canvas')
    c.width = LW * HS
    c.height = LH * HS
    const x = c.getContext('2d')
    const gr = x.createLinearGradient(0, 0, 0, 420)
    gr.addColorStop(0, tint[0])
    gr.addColorStop(1, tint[1])
    x.fillStyle = gr
    x.fillRect(0, 0, LW * HS, 420)
    x.globalCompositeOperation = 'destination-in'
    x.drawImage(skyImg, 0, 0)
    const id = x.getImageData(0, 0, LW * HS, LH * HS), d = id.data
    for (let i = 3; i < d.length; i += 4) d[i] = Math.round(d[i] * tint[2])
    x.putImageData(id, 0, 0)
    skyLayer = c
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
    const [x, y] = toGrid(e.x, e.y)
    if (!hand.inside) { hand.px = x; hand.py = y }
    hand.x = x
    hand.y = y
    hand.inside = true
    if (e.type !== 'down') return
    hand.px = x
    hand.py = y
    let best = null, bd = 30
    for (const b of bulbs) { const d = Math.hypot(b.cx - x, b.cy - y); if (d < bd) { bd = d; best = b } }
    if (best) { best.pulse = 1; best.vel += 3; wave(best.cx, best.cy, 1) }
  }

  const offPointer = ctx.onPointer?.(onPointer)
  const offClock = ctx.subscribe?.(({ timeOfDay }) => {
    if (!(timeOfDay in SKY_TINT)) return
    setTod(timeOfDay)
    if (ctx.reducedMotion && base) render()
  })
  const onResize = () => layout()
  window.addEventListener('resize', onResize)

  Promise.all([loadImage(photoUrl), loadImage(bulbsUrl), loadImage(skyUrl)]).then(([a, b, c]) => {
    if (stopped) return
    base = a
    bulbImg = b
    skyImg = c
    setTod(tod)
    layout()
    if (ctx.reducedMotion) render()
    else {
      for (let i = 0; i < 90; i++) step(1 / 30) // start with steam already rising
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
