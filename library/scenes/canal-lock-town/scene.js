// Canal Lock Town — a pixel-art hillside canal town at golden dusk.
// Picture + code: the pixel-art painting with code layers on top (all snapped to the picture's 4 px grid):
//   - canal water shimmers; lamp reflections wobble; lock gates keep a little water falling;
//   - lamps and windows glow and flicker, chimney smoke drifts, bats cross the sky, sunset clouds drift;
//   - every ~70 s a lock is "worked": its signal turns green, water churns and foam spreads, lamps flare;
// Time of day: dawn / day / dusk (= the painting) / night grades, with lamp glow stronger at night.
// Live wallpaper (hover only): rest the mouse ~0.6 s over a lock → that lock is worked at once.
// reducedMotion: one still frame (redrawn when the time of day changes).
import plateUrl from './canal-lock-town.jpg'

export function mount(container, ctx) {
  const W = 1920, H = 1080, P = 4
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H
  cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block'
  container.replaceChildren(cv)
  const g = cv.getContext('2d')
  const rnd = (a, b) => a + Math.random() * (b - a)
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
  const px = v => Math.round(v / P) * P
  const plate = new Image()
  let stopped = false, raf = 0, last = 0, T = 0

  const GRADES = {
    dawn:  { mul: [255, 205, 215], ma: .28, glow: .55, haze: [255, 170, 150, .10] },
    day:   { mul: [255, 255, 255], ma: 0,   glow: .25, haze: [150, 200, 255, .16] },
    dusk:  { mul: [255, 255, 255], ma: 0,   glow: 1,   haze: [0, 0, 0, 0] },
    night: { mul: [60, 80, 150],   ma: .62, glow: 1.5, haze: [0, 0, 0, 0] } }
  let tod = ctx.timeOfDay || 'dusk'
  const unsub = ctx.subscribe ? ctx.subscribe(({ timeOfDay }) => { tod = timeOfDay; if (ctx.reducedMotion && plate.complete) frame() }) : null
  const gr = () => GRADES[tod] || GRADES.dusk

  const LAMPS = [[990, 338], [1175, 315], [1365, 315], [963, 465], [1242, 465], [700, 690], [1050, 698], [1670, 660], [228, 660]]
  const WINDOWS = [[183, 575], [267, 575], [183, 670], [267, 670], [406, 654], [1572, 657], [1870, 678], [1572, 747], [1870, 802], [1225, 159], [1290, 159], [1445, 147], [1560, 202]]
  const CHIMNEYS = [[78, 417], [252, 427], [1732, 393], [1872, 405]]
  const LOCKS = [
    { id: 'lower', x: 900, y: 740, r: 230, gate: [790, 805, 240], sig: [760, 690], t: -99 },
    { id: 'mid', x: 1120, y: 520, r: 150, gate: [1050, 605, 130], sig: [1010, 470], t: -99 },
    { id: 'upper', x: 1285, y: 365, r: 120, gate: [1230, 415, 110], sig: [1215, 330], t: -99 }]
  const dim = WINDOWS.map(() => ({ off: 0 }))
  const smoke = [], foam = [], bats = [], clouds = []
  for (let i = 0; i < 3; i++) clouds.push({ x: rnd(0, 900), y: rnd(40, 230), w: rnd(160, 300), v: rnd(5, 9) })
  const glints = Array.from({ length: 70 }, () => ({ x: rnd(0, 1290), y: rnd(905, 1070), life: rnd(0, 2), max: rnd(1.2, 2.4) }))
  let nextBat = rnd(8, 20), nextWork = 25, nextDim = 4, workIdx = 0

  let ptr = null, still = 0, used = false
  const offPtr = ctx.onPointer ? ctx.onPointer(e => {
    const r = cv.getBoundingClientRect(), sc = Math.max(r.width / W, r.height / H)
    const nx = (e.x - r.left - (r.width - W * sc) / 2) / sc, ny = (e.y - r.top - (r.height - H * sc) / 2) / sc
    if (e.type === 'move') { if (!ptr || Math.hypot(nx - ptr.x, ny - ptr.y) > 8) { still = 0; used = false } ptr = { x: nx, y: ny } }
  }) : null

  function work(l) {
    l.t = T
    for (let i = 0; i < 26; i++) foam.push({ x: l.gate[0] + rnd(0, l.gate[2]), y: l.gate[1] + rnd(-4, 6), vx: rnd(-14, 14), vy: rnd(6, 22), life: 0, max: rnd(1, 2.2) })
  }

  function step(dt) {
    T += dt
    for (const c of clouds) { c.x += c.v * dt; if (c.x > W + 100) { c.x = -c.w; c.y = rnd(40, 230) } }
    for (const s of glints) { s.life += dt; if (s.life > s.max) { s.x = rnd(0, 1290); s.y = rnd(905, 1070); s.life = 0; s.max = rnd(1.2, 2.4) } }
    // chimney smoke
    if (Math.random() < dt * 5) { const c = CHIMNEYS[Math.floor(Math.random() * CHIMNEYS.length)]; smoke.push({ x: c[0], y: c[1], vx: rnd(4, 12), vy: rnd(-16, -9), life: 0, max: rnd(3, 6) }) }
    for (let i = smoke.length - 1; i >= 0; i--) { const s = smoke[i]; s.life += dt; s.x += s.vx * dt; s.y += s.vy * dt; if (s.life > s.max) smoke.splice(i, 1) }
    // water falling at the lock sills
    for (const l of LOCKS) {
      const active = T - l.t < 14
      if (Math.random() < dt * (active ? 45 : 6)) foam.push({ x: l.gate[0] + rnd(0, l.gate[2]), y: l.gate[1], vx: rnd(-6, 6), vy: rnd(8, 18), life: 0, max: rnd(.7, 1.6) })
    }
    for (let i = foam.length - 1; i >= 0; i--) { const f = foam[i]; f.life += dt; f.x += f.vx * dt; f.y += f.vy * dt; if (f.life > f.max) foam.splice(i, 1) }
    // bats
    nextBat -= dt
    if (nextBat <= 0 && (tod === 'dusk' || tod === 'night' || tod === 'dawn')) { nextBat = rnd(14, 30); const d = Math.random() < .5 ? 1 : -1; for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) bats.push({ x: d > 0 ? -40 - i * 70 : W + 40 + i * 70, y: rnd(60, 260), vx: d * rnd(60, 90), ph: rnd(0, 6) }) }
    for (let i = bats.length - 1; i >= 0; i--) { const b = bats[i]; b.x += b.vx * dt; b.y += Math.sin(T * 2 + b.ph) * 12 * dt; if (b.x < -120 || b.x > W + 120) bats.splice(i, 1) }
    // a window dims now and then
    nextDim -= dt; if (nextDim <= 0) { nextDim = rnd(5, 14); dim[Math.floor(Math.random() * dim.length)].off = T + rnd(6, 18) }
    // lock cycle
    nextWork -= dt; if (nextWork <= 0) { nextWork = rnd(55, 80); work(LOCKS[workIdx++ % LOCKS.length]) }
    // hover
    if (ptr) {
      still += dt
      if (!used && still > .6) { let best = null, bd = 1e9; for (const l of LOCKS) { const d = Math.hypot(l.x - ptr.x, l.y - ptr.y); if (d < l.r && d < bd) { bd = d; best = l } } if (best) { used = true; work(best) } }
    }
  }

  function rect(x, y, w, h) { g.fillRect(px(x), px(y), Math.max(P, px(w)), Math.max(P, px(h))) }
  function frame() {
    const G = gr()
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'
    g.drawImage(plate, 0, 0, W, H)
    // sunset clouds
    const sky = tod === 'night' ? .12 : tod === 'day' ? .2 : .32
    for (const c of clouds) { g.fillStyle = tod === 'dawn' ? `rgba(255,190,200,${sky})` : `rgba(255,150,90,${sky})`; for (let i = 0; i < 6; i++) rect(c.x + i * c.w / 7, c.y + Math.sin(i * 1.7) * 8, c.w / 5, P * (2 + (i % 3))) }
    // water shimmer
    for (const s of glints) { const a = Math.sin(Math.PI * s.life / s.max); if (a > 0) { g.fillStyle = `rgba(255,214,160,${.5 * a * (tod === 'night' ? .6 : 1)})`; rect(s.x, s.y, 12 + (s.max * 6 | 0), P) } }
    // lamp reflections in the canal
    for (const [rx, ry] of [[790, 940], [1045, 955], [680, 985]]) for (let i = 0; i < 9; i++) { const wob = Math.sin(T * 1.6 + i) * 6; g.fillStyle = `rgba(255,170,70,${(.34 - i * .028) * G.glow * (.8 + .2 * Math.sin(T * 3 + i))})`; rect(rx + wob, ry + i * 14, 14 - i, P) }
    // water at the lock sills + foam
    g.fillStyle = 'rgba(235,240,245,.55)'
    for (const f of foam) { const a = 1 - f.life / f.max; g.globalAlpha = clamp(a, 0, 1); rect(f.x, f.y, P * 3, P * 2) }
    g.globalAlpha = 1
    // smoke
    for (const s of smoke) { const a = Math.sin(Math.PI * s.life / s.max); g.fillStyle = `rgba(190,170,170,${.3 * a})`; rect(s.x, s.y, 8 + s.life * 3, 8 + s.life * 2) }
    // bats
    g.fillStyle = 'rgba(15,10,25,.9)'
    for (const b of bats) { const w = Math.sin(T * 14 + b.ph) > 0; rect(b.x, b.y, 12, P); rect(b.x - 8, b.y + (w ? -P : P), P * 2, P); rect(b.x + 12, b.y + (w ? -P : P), P * 2, P) }
    // time-of-day grade
    if (G.ma > .01) { g.globalCompositeOperation = 'multiply'; g.fillStyle = `rgba(${G.mul.join(',')},${G.ma})`; g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'source-over' }
    if (G.haze[3] > 0) { g.fillStyle = `rgba(${G.haze.join(',')})`; g.fillRect(0, 0, W, H) }
    // glows
    g.globalCompositeOperation = 'lighter'
    const fl = .88 + .12 * Math.sin(T * 7) * Math.sin(T * 2.3)
    const flare = LOCKS.reduce((m, l) => Math.max(m, clamp(1 - (T - l.t) / 14, 0, 1)), 0)
    for (const [x, y] of LAMPS) { const r = 46 + flare * 10, gg = g.createRadialGradient(x, y, 0, x, y, r); gg.addColorStop(0, `rgba(255,185,80,${clamp(.5 * G.glow * fl + flare * .12, 0, .9)})`); gg.addColorStop(1, 'rgba(255,140,40,0)'); g.fillStyle = gg; g.fillRect(x - r, y - r, r * 2, r * 2) }
    WINDOWS.forEach(([x, y], i) => { if (T < dim[i].off) return; const r = 30, gg = g.createRadialGradient(x, y, 0, x, y, r); gg.addColorStop(0, `rgba(255,190,90,${.3 * G.glow * (.92 + .08 * Math.sin(T * 5 + i))})`); gg.addColorStop(1, 'rgba(255,150,50,0)'); g.fillStyle = gg; g.fillRect(x - r, y - r, r * 2, r * 2) })
    g.globalCompositeOperation = 'source-over'
    // lock signals (red = resting, green = being worked)
    for (const l of LOCKS) { const on = T - l.t < 14; g.fillStyle = on ? '#6cf08a' : '#e0583c'; rect(l.sig[0], l.sig[1], P * 2, P * 2); g.fillStyle = on ? 'rgba(108,240,138,.35)' : 'rgba(224,88,60,.25)'; rect(l.sig[0] - P, l.sig[1] - P, P * 4, P * 4) }
    // hover hint ring
    if (ptr && !used && still > .25) { const l = LOCKS.find(l => Math.hypot(l.x - ptr.x, l.y - ptr.y) < l.r); if (l) { const k = clamp((still - .25) / .35, 0, 1); g.strokeStyle = `rgba(255,236,180,${.6 * k})`; g.lineWidth = P; g.beginPath(); g.ellipse(l.gate[0] + l.gate[2] / 2, l.gate[1], 40 + 20 * k, 12 + 6 * k, 0, 0, 7); g.stroke() } }
  }

  function loop(now) { if (stopped) return; const dt = Math.min(.05, (now - last) / 1000); last = now; step(dt); frame(); raf = requestAnimationFrame(loop) }
  plate.onload = () => {
    if (stopped) return
    if (ctx.reducedMotion) { frame(); ctx.ready && ctx.ready(); return }
    for (let i = 0; i < 80; i++) step(.05)
    last = performance.now(); raf = requestAnimationFrame(loop); ctx.ready && ctx.ready()
  }
  plate.onerror = () => ctx.ready && ctx.ready()
  plate.src = plateUrl
  return { unmount() { stopped = true; cancelAnimationFrame(raf); offPtr && offPtr(); unsub && unsub(); container.replaceChildren() } }
}
