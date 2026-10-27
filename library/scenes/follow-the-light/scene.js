// Follow the Light — a small, bright light like a slow shooting star, with a
// soft tail, travels over a dusk sky and far hills along a Fibonacci spiral:
// quarter-circle arcs drawn in squares of 21, 13, 8, 5, 3, 2, 1 and 1 units, the
// same squares that build a golden rectangle. It glides out from the spiral's
// heart to its outer edge and back in, slowly; then it rests at the heart for
// 18 s with "rest your eyes · look at something far away", and sets off again.
// (v0.5.1 approved 26 Oct 2026; shooting-star light + Fibonacci path, 27 Oct.)
// Live wallpaper: the light glows warmer when the cursor is near it.
// With reducedMotion the light rests at the spiral's heart and nothing moves.

const TRAVEL = 55 // seconds to travel the spiral one way (out, then in)
const REST = 18 // seconds it rests at the spiral's heart
const BREATH = 16 // one slow brighten-and-soften of the glow
const CYCLE = REST + TRAVEL * 2
const FIB = [21, 13, 8, 5, 3, 2, 1, 1] // the squares, largest first
const RECT = [34, 21] // the golden rectangle they fill (34 = 21 + 13)

const ease = (x) => x * x * (3 - 2 * x)
const ease2 = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2) // slow at both ends
function seeded(n) { return () => ((n = (n * 16807) % 2147483647) / 2147483647) }
function ridge(rand, base, amp, f) {
  const p = [rand() * 6, rand() * 6, rand() * 6]
  return (x) => base - amp * (0.55 * Math.sin(x * f + p[0]) + 0.3 * Math.sin(x * f * 2.3 + p[1]) + 0.15 * Math.sin(x * f * 5.1 + p[2]))
}

// The spiral in rectangle units: one quarter arc per square, cutting squares
// from the left, top, right and bottom in turn. Each arc: centre, radius, start
// angle (it turns a further quarter, clockwise on screen).
export function fibonacciArcs() {
  let x = 0, y = 0, w = RECT[0], h = RECT[1]
  const arcs = []
  FIB.forEach((s, i) => {
    const side = i % 4
    const a0 = Math.PI + (i * Math.PI) / 2
    if (side === 0) { arcs.push({ cx: x + s, cy: y + s, r: s, a0 }); x += s; w -= s } // left
    else if (side === 1) { arcs.push({ cx: x, cy: y + s, r: s, a0 }); y += s; h -= s } // top
    else if (side === 2) { arcs.push({ cx: x + w - s, cy: y, r: s, a0 }); w -= s } // right
    else { arcs.push({ cx: x + w, cy: y + h - s, r: s, a0 }); h -= s } // bottom
  })
  return arcs
}
const ARCS = fibonacciArcs()
const LEN = ARCS.reduce((a, c) => a + (c.r * Math.PI) / 2, 0) // spiral length in units

export function mount(container, ctx) {
  const canvas = document.createElement('canvas')
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;'
  const hint = document.createElement('div')
  hint.textContent = 'rest your eyes · look at something far away'
  hint.style.cssText = 'position:absolute;left:0;right:0;bottom:18%;text-align:center;font:15px "Segoe UI",system-ui,sans-serif;letter-spacing:.04em;color:rgba(220,230,240,.55);opacity:0;transition:opacity 3s ease;pointer-events:none;'
  container.replaceChildren(canvas, hint)
  const g = canvas.getContext('2d')
  const bgc = document.createElement('canvas')
  const bg = bgc.getContext('2d')

  let w = 0, h = 0, dpr = 1, minDim = 1
  let warm = 0, t = 0, last = performance.now(), frame = 0, stopped = false
  const dust = []
  const ptr = { x: -1e4, y: -1e4 }

  function paintBackdrop() {
    bgc.width = Math.round(w * dpr)
    bgc.height = Math.round(h * dpr)
    bg.setTransform(dpr, 0, 0, dpr, 0, 0)
    const rand = seeded(7)
    const sky = bg.createLinearGradient(0, 0, 0, h)
    sky.addColorStop(0, '#0a1626'); sky.addColorStop(0.5, '#162a40'); sky.addColorStop(0.72, '#2c3a52'); sky.addColorStop(0.8, '#43405a'); sky.addColorStop(1, '#43405a')
    bg.fillStyle = sky
    bg.fillRect(0, 0, w, h)
    for (let i = 0; i < Math.round((w * h) / 9000); i++) { // a few faint stars
      const x = rand() * w, y = rand() * rand() * h * 0.6
      bg.fillStyle = `rgba(220,230,255,${0.15 + rand() * 0.35})`
      bg.beginPath(); bg.arc(x, y, 0.4 + rand() * 0.9, 0, Math.PI * 2); bg.fill()
    }
    for (const L of [{ base: 0.8, amp: 0.035, f: 2.2, col: '#2a3248' }, { base: 0.86, amp: 0.045, f: 3.1, col: '#1c2436' }, { base: 0.93, amp: 0.05, f: 4.4, col: '#111826' }]) {
      const y = ridge(rand, L.base * h, L.amp * h, L.f / w)
      bg.fillStyle = L.col
      bg.beginPath(); bg.moveTo(0, h)
      for (let x = 0; x <= w; x += 6) bg.lineTo(x, y(x))
      bg.lineTo(w, y(w)); bg.lineTo(w, h); bg.closePath(); bg.fill()
    }
    const mist = bg.createLinearGradient(0, h * 0.72, 0, h * 0.84)
    mist.addColorStop(0, 'rgba(120,130,160,0)'); mist.addColorStop(0.6, 'rgba(120,130,160,0.10)'); mist.addColorStop(1, 'rgba(120,130,160,0)')
    bg.fillStyle = mist
    bg.fillRect(0, h * 0.72, w, h * 0.12)
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    w = container.clientWidth || window.innerWidth
    h = container.clientHeight || window.innerHeight
    minDim = Math.min(w, h)
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    dust.length = 0
    fit()
    paintBackdrop()
  }

  // the golden rectangle, fitted into the sky above the hills
  let unit = 1, ox = 0, oy = 0
  function fit() {
    unit = Math.min((w * 0.88) / RECT[0], (h * 0.66) / RECT[1])
    ox = (w - RECT[0] * unit) / 2
    oy = h * 0.06 + (h * 0.66 - RECT[1] * unit) / 2
  }
  // a point on the spiral, d units from its outer end (0 … LEN)
  function on(d) {
    d = Math.max(0, Math.min(LEN, d))
    for (const c of ARCS) {
      const l = (c.r * Math.PI) / 2
      if (d <= l || c === ARCS[ARCS.length - 1]) {
        const a = c.a0 + (Math.min(d, l) / c.r)
        return { x: ox + (c.cx + Math.cos(a) * c.r) * unit, y: oy + (c.cy + Math.sin(a) * c.r) * unit }
      }
      d -= l
    }
    return { x: ox, y: oy }
  }

  // where along the spiral the light is: resting at the heart, then out, then in
  function state(time) {
    const k = time % CYCLE
    let d, rest = 0, dir = 0
    if (k < REST) { d = LEN; rest = ease(Math.min(1, k / 3)) * (1 - ease(Math.max(0, (k - (REST - 3)) / 3))) }
    else if (k < REST + TRAVEL) { d = LEN * (1 - ease2((k - REST) / TRAVEL)); dir = -1 }
    else { d = LEN * ease2((k - REST - TRAVEL) / TRAVEL); dir = 1 }
    const breath = 0.5 - 0.5 * Math.cos((time / BREATH) * Math.PI * 2)
    return { d, dir, rest, glow: 0.8 + 0.2 * breath - 0.3 * rest, p: on(d) }
  }

  function draw(time, dt) {
    const s = state(time)
    const near = Math.hypot(ptr.x - s.p.x, ptr.y - s.p.y) < Math.max(90, minDim * 0.08)
    warm += ((near ? 1 : 0) - warm) * Math.min(1, dt * 2.5)
    g.drawImage(bgc, 0, 0, w, h)
    const core = Math.max(2.2, minDim * 0.0042)
    const a = s.glow * (1 + 0.3 * warm)
    g.save()
    g.globalCompositeOperation = 'lighter'
    // the tail: the stretch of spiral just behind the light, longer when it moves faster
    if (!ctx.reducedMotion && s.dir) {
      const ahead = state(time + 0.2), speed = Math.abs(ahead.d - s.d) / 0.2 // units per second
      const tailUnits = Math.min(LEN * 0.12, speed * 2.2)
      const n = 36
      let prev = s.p
      for (let i = 1; i <= n; i++) {
        const f = i / n
        const q = on(s.d - s.dir * tailUnits * f)
        g.strokeStyle = `rgba(255,${222 - 40 * f},${170 - 70 * f},${0.55 * (1 - f) * (1 - f) * a})`
        g.lineWidth = core * 1.5 * (1 - f) + 0.6
        g.lineCap = 'round'
        g.beginPath(); g.moveTo(prev.x, prev.y); g.lineTo(q.x, q.y); g.stroke()
        prev = q
      }
      // a little stardust left behind
      if (Math.random() < dt * (3 + speed * 0.6)) dust.push({ x: s.p.x + (Math.random() - 0.5) * core * 3, y: s.p.y + (Math.random() - 0.5) * core * 3, t: 0, life: 1 + Math.random() * 1.5 })
    }
    for (let i = dust.length - 1; i >= 0; i--) {
      const q = dust[i]
      q.t += dt
      if (q.t > q.life) { dust.splice(i, 1); continue }
      g.fillStyle = `rgba(255,232,190,${0.5 * (1 - q.t / q.life) * a})`
      g.beginPath(); g.arc(q.x, q.y + q.t * 4, Math.max(0.6, core * 0.22), 0, Math.PI * 2); g.fill()
    }
    // the head: a soft halo, a tight glow and a sharp bright core with faint glints
    const halo = g.createRadialGradient(s.p.x, s.p.y, 0, s.p.x, s.p.y, core * 14)
    halo.addColorStop(0, `rgba(255,205,140,${0.16 * a})`); halo.addColorStop(1, 'rgba(255,205,140,0)')
    g.fillStyle = halo
    g.fillRect(s.p.x - core * 14, s.p.y - core * 14, core * 28, core * 28)
    const glow = g.createRadialGradient(s.p.x, s.p.y, 0, s.p.x, s.p.y, core * 4)
    glow.addColorStop(0, `rgba(255,236,200,${0.6 * a})`); glow.addColorStop(1, 'rgba(255,220,170,0)')
    g.fillStyle = glow
    g.beginPath(); g.arc(s.p.x, s.p.y, core * 4, 0, Math.PI * 2); g.fill()
    const spin = time * 0.15
    for (let k = 0; k < 4; k++) {
      const ang = spin + (k * Math.PI) / 2, len = core * (k % 2 ? 5 : 7) * (0.8 + 0.2 * a)
      const gx = Math.cos(ang) * len, gy = Math.sin(ang) * len
      const gr = g.createLinearGradient(s.p.x, s.p.y, s.p.x + gx, s.p.y + gy)
      gr.addColorStop(0, `rgba(255,248,232,${0.5 * a})`); gr.addColorStop(1, 'rgba(255,248,232,0)')
      g.strokeStyle = gr; g.lineWidth = Math.max(0.8, core * 0.35)
      g.beginPath(); g.moveTo(s.p.x, s.p.y); g.lineTo(s.p.x + gx, s.p.y + gy); g.stroke()
    }
    g.restore()
    g.fillStyle = `rgba(255,252,242,${Math.min(1, 0.95 * a + 0.1)})`
    g.beginPath(); g.arc(s.p.x, s.p.y, core, 0, Math.PI * 2); g.fill()
    hint.style.opacity = s.rest > 0.6 ? '1' : '0'
  }

  function loop(now) {
    if (stopped) return
    frame = requestAnimationFrame(loop)
    const dt = Math.min((now - last) / 1000, 0.1)
    last = now
    if (document.hidden) return
    t += dt
    draw(t, dt)
  }

  resize()
  draw(t, 0)
  if (!ctx.reducedMotion) { last = performance.now(); frame = requestAnimationFrame(loop) }
  requestAnimationFrame(() => requestAnimationFrame(() => ctx.ready()))
  const onResize = () => { resize(); draw(t, 0) }
  window.addEventListener('resize', onResize)
  const offPointer = ctx.onPointer?.((e) => { ptr.x = e.x; ptr.y = e.y })

  return {
    unmount() {
      stopped = true
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', onResize)
      offPointer?.()
      container.replaceChildren()
    },
  }
}
