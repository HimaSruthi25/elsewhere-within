// Follow the Light — a small, sharp light like a slow shooting star travels
// over a dusk sky and far hills along an even spiral of five turns.
// One cycle: the light fades in at the spiral's outer end (lower left), glides
// inward along the whole spiral without ever going back over the same line,
// reaches the centre, rests there for 18 s with "rest your eyes · look at
// something far away", fades away, and a new light fades in at the outer end.
// (v0.5.1 approved 26 Oct 2026; Fibonacci spiral 27 Oct; v0.7 28 Oct: even
// spiral, inward only, sharp core with no halo, smooth tail.)
// Live wallpaper: the light glows warmer when the cursor is near it.
// With reducedMotion the light rests at the spiral's centre and nothing moves.

const TRAVEL = 150 // seconds from the outer end to the centre
const RAMP = 10 // seconds to ease in at the start and ease out at the end
const REST = 18 // seconds it rests at the centre
const FADE = 2.5 // seconds to fade in at the start / fade out after the rest
const CYCLE = FADE + TRAVEL + REST + FADE
const BREATH = 16 // one slow brighten-and-soften of the glints
const TURNS = 5
const START_ANGLE = Math.PI * 0.82 // the outer end, lower left

function seeded(n) { return () => ((n = (n * 16807) % 2147483647) / 2147483647) }
function ridge(rand, base, amp, f) {
  const p = [rand() * 6, rand() * 6, rand() * 6]
  return (x) => base - amp * (0.55 * Math.sin(x * f + p[0]) + 0.3 * Math.sin(x * f * 2.3 + p[1]) + 0.15 * Math.sin(x * f * 5.1 + p[2]))
}
// distance travelled after k seconds: constant speed with soft ramps at both ends
function travelled(k) {
  const vmax = 1 / (TRAVEL - RAMP) // fraction of the path per second at full speed
  if (k <= 0) return 0
  if (k >= TRAVEL) return 1
  if (k < RAMP) return vmax * (k * k) / (2 * RAMP)
  if (k > TRAVEL - RAMP) { const r = TRAVEL - k; return 1 - vmax * (r * r) / (2 * RAMP) }
  return vmax * (RAMP / 2 + (k - RAMP))
}

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
  let path = [], cum = [], LEN = 1

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

  // the even spiral, fitted into the sky above the hills (a little wider than tall)
  function fit() {
    const cx = w * 0.5, cy = h * 0.415
    const ry = Math.min(h * 0.345, (w * 0.42) / 1.55), rx = ry * Math.min(1.55, (w * 0.44) / ry)
    const inner = Math.max(4, minDim * 0.006)
    const N = 4000
    path = new Float32Array((N + 1) * 2); cum = new Float32Array(N + 1)
    for (let i = 0; i <= N; i++) {
      const f = i / N, a = START_ANGLE + f * TURNS * Math.PI * 2
      const k = 1 - f + (inner / ry) * f
      path[i * 2] = cx + Math.cos(a) * rx * k
      path[i * 2 + 1] = cy + Math.sin(a) * ry * k
      if (i) cum[i] = cum[i - 1] + Math.hypot(path[i * 2] - path[i * 2 - 2], path[i * 2 + 1] - path[i * 2 - 1])
    }
    LEN = cum[N]
  }
  // a point on the spiral, d pixels from its outer end (0 … LEN)
  function on(d) {
    d = Math.max(0, Math.min(LEN, d))
    let lo = 0, hi = cum.length - 1
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] < d) lo = m; else hi = m }
    const f = (d - cum[lo]) / Math.max(1e-6, cum[hi] - cum[lo])
    return { x: path[lo * 2] + (path[hi * 2] - path[lo * 2]) * f, y: path[lo * 2 + 1] + (path[hi * 2 + 1] - path[lo * 2 + 1]) * f }
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

  // where the light is: fading in, travelling inward, resting, fading out
  function state(time) {
    if (ctx.reducedMotion) return { d: LEN, moving: 0, rest: 1, vis: 1, p: on(LEN) }
    const k = ((time % CYCLE) + CYCLE) % CYCLE
    let d, moving = 0, rest = 0, vis = 1
    if (k < FADE) { d = 0; vis = k / FADE }
    else if (k < FADE + TRAVEL) { d = LEN * travelled(k - FADE); moving = 1 }
    else if (k < FADE + TRAVEL + REST) { d = LEN; const r = k - FADE - TRAVEL; rest = Math.min(1, r / 3) * Math.min(1, (REST - r) / 3) }
    else { d = LEN; vis = 1 - (k - FADE - TRAVEL - REST) / FADE }
    return { d, moving, rest, vis: vis * vis * (3 - 2 * vis), p: on(d) }
  }

  function draw(time, dt) {
    const s = state(time)
    const near = Math.hypot(ptr.x - s.p.x, ptr.y - s.p.y) < Math.max(90, minDim * 0.08)
    warm += ((near ? 1 : 0) - warm) * Math.min(1, dt * 2.5)
    g.drawImage(bgc, 0, 0, w, h)
    const core = Math.max(2.2, minDim * 0.0042)
    const breath = 0.5 - 0.5 * Math.cos((time / BREATH) * Math.PI * 2)
    const a = s.vis * (0.85 + 0.15 * breath) * (1 + 0.3 * warm)
    g.save()
    g.globalCompositeOperation = 'lighter'
    // the tail: one smooth tapered streak along the stretch of spiral just behind the light
    if (s.moving && s.vis > 0) {
      const ahead = state(time + 0.25), speed = Math.abs(ahead.d - s.d) / 0.25 // px per second
      const tail = Math.min(minDim * 0.3, speed * 2.4)
      if (tail > 2) {
        const n = 40, L = [], R = []
        let prev = s.p
        for (let i = 0; i <= n; i++) {
          const f = i / n, q = on(s.d - tail * f), nx = on(s.d - tail * f + 1.5)
          let tx = nx.x - q.x, ty = nx.y - q.y
          const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl
          const hw = core * 0.85 * Math.pow(1 - f, 1.3) + 0.3
          L.push([q.x - ty * hw, q.y + tx * hw]); R.push([q.x + ty * hw, q.y - tx * hw])
          prev = q
        }
        const grad = g.createLinearGradient(s.p.x, s.p.y, prev.x, prev.y)
        grad.addColorStop(0, `rgba(255,236,200,${0.75 * a})`)
        grad.addColorStop(0.35, `rgba(255,214,160,${0.35 * a})`)
        grad.addColorStop(1, 'rgba(255,190,120,0)')
        g.fillStyle = grad
        g.beginPath()
        g.moveTo(L[0][0], L[0][1])
        for (const p of L) g.lineTo(p[0], p[1])
        for (let i = R.length - 1; i >= 0; i--) g.lineTo(R[i][0], R[i][1])
        g.closePath(); g.fill()
      }
      // a little stardust left behind
      if (Math.random() < dt * (2 + speed * 0.02)) dust.push({ x: s.p.x + (Math.random() - 0.5) * core * 3, y: s.p.y + (Math.random() - 0.5) * core * 3, t: 0, life: 1 + Math.random() * 1.5 })
    }
    for (let i = dust.length - 1; i >= 0; i--) {
      const q = dust[i]
      q.t += dt
      if (q.t > q.life) { dust.splice(i, 1); continue }
      g.fillStyle = `rgba(255,232,190,${0.5 * (1 - q.t / q.life) * a})`
      g.beginPath(); g.arc(q.x, q.y + q.t * 4, Math.max(0.6, core * 0.22), 0, Math.PI * 2); g.fill()
    }
    // no halo: a thin bright rim so the core reads crisp, and four faint turning glints
    const rim = g.createRadialGradient(s.p.x, s.p.y, core * 0.9, s.p.x, s.p.y, core * 1.9)
    rim.addColorStop(0, `rgba(255,240,215,${0.45 * a})`); rim.addColorStop(1, 'rgba(255,230,200,0)')
    g.fillStyle = rim
    g.beginPath(); g.arc(s.p.x, s.p.y, core * 1.9, 0, Math.PI * 2); g.fill()
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
    // the sharp core
    g.fillStyle = warm > 0.05 ? `rgba(255,${253 - 18 * warm},${247 - 50 * warm},${s.vis})` : `rgba(255,253,247,${s.vis})`
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
