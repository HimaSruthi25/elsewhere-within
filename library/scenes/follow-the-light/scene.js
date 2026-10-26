// Follow the Light — a soft light drifts slowly over a dusk sky and far hills,
// growing and shrinking, so the eyes can follow it. Every 50 s it glides to the
// centre, dims and rests for 18 s with "rest your eyes · look at something far
// away", then wanders on. (Approved preview v0.5.1, 26 Oct 2026.)
// Live wallpaper: the light glows warmer when the cursor is near it.
// With reducedMotion the light rests in one place and nothing moves.

const FOLLOW = 50 // seconds the light wanders
const REST = 18 // seconds it rests in the middle
const BREATH = 16 // one grow-and-shrink
const CYCLE = FOLLOW + REST
const SPEED = 2 // travel speed along the path

const ease = (x) => x * x * (3 - 2 * x)
function seeded(n) { return () => ((n = (n * 16807) % 2147483647) / 2147483647) }
function ridge(rand, base, amp, f) {
  const p = [rand() * 6, rand() * 6, rand() * 6]
  return (x) => base - amp * (0.55 * Math.sin(x * f + p[0]) + 0.3 * Math.sin(x * f * 2.3 + p[1]) + 0.15 * Math.sin(x * f * 5.1 + p[2]))
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
  let warm = 0, t = 6, last = performance.now(), frame = 0, stopped = false
  const trail = []
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
    trail.length = 0
    paintBackdrop()
  }

  // A slow, smooth path over the screen without sharp turns.
  function wander(s) {
    const x = Math.sin(s * 0.131 + 0.4) * 0.72 + Math.sin(s * 0.057 + 2.1) * 0.28
    const y = Math.sin(s * 0.097 + 1.3) * 0.7 + Math.sin(s * 0.043 + 0.7) * 0.3
    return { x: w / 2 + x * w * 0.4, y: h / 2 + y * h * 0.36 }
  }

  function state(time) {
    const k = time % CYCLE
    const breath = 0.5 - 0.5 * Math.cos((time / BREATH) * Math.PI * 2)
    let p = wander(time * SPEED)
    let size = 0.018 + 0.04 * ease(breath)
    let glow = 1, rest = 0
    if (k > FOLLOW) {
      const r = k - FOLLOW
      rest = ease(Math.min(1, r / 4)) * (1 - ease(Math.max(0, (r - (REST - 4)) / 4)))
      p = { x: p.x + (w / 2 - p.x) * rest, y: p.y + (h / 2 - p.y) * rest }
      size = size * (1 - rest) + 0.018 * rest
      glow = 1 - 0.35 * rest
    }
    return { p, size: size * minDim, glow, rest }
  }

  function draw(time, dt) {
    const s = state(time)
    const near = Math.hypot(ptr.x - s.p.x, ptr.y - s.p.y) < Math.max(90, s.size * 3)
    warm += ((near ? 1 : 0) - warm) * Math.min(1, dt * 2.5)
    g.drawImage(bgc, 0, 0, w, h)
    if (!ctx.reducedMotion) { // a faint trail shows the direction of travel
      trail.push({ x: s.p.x, y: s.p.y, a: s.glow })
      if (trail.length > 40) trail.shift()
      for (let i = 0; i < trail.length; i++) {
        const q = trail[i]
        g.fillStyle = `rgba(255,217,160,${(i / trail.length) * 0.05 * q.a})`
        g.beginPath(); g.arc(q.x, q.y, Math.max(1.5, s.size * 0.25), 0, Math.PI * 2); g.fill()
      }
    }
    const r = s.size, a = s.glow * (1 + 0.35 * warm)
    const halo = g.createRadialGradient(s.p.x, s.p.y, 0, s.p.x, s.p.y, r * 4.5)
    halo.addColorStop(0, `rgba(255,205,140,${0.22 * a})`); halo.addColorStop(1, 'rgba(255,205,140,0)')
    g.fillStyle = halo
    g.fillRect(s.p.x - r * 4.5, s.p.y - r * 4.5, r * 9, r * 9)
    const body = g.createRadialGradient(s.p.x, s.p.y, 0, s.p.x, s.p.y, r)
    body.addColorStop(0, `rgba(255,246,228,${Math.min(1, 0.95 * a)})`); body.addColorStop(0.55, `rgba(255,217,160,${0.75 * a})`); body.addColorStop(1, 'rgba(255,190,120,0)')
    g.fillStyle = body
    g.beginPath(); g.arc(s.p.x, s.p.y, r, 0, Math.PI * 2); g.fill()
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
