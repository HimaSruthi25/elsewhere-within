// Clockmaker's Almanac — a clockmaker's desk in golden afternoon light (Dashboard).
// Picture (AI illustration, 1920×1080, pendulum painted out) + live 2D code layers:
//   the wall clock shows the real time (hands drawn in code, ticking second hand),
//   the pendulum swings with its shadow, the tear-off calendar shows today's date,
//   dust drifts where the sunbeams fall, steam rises from the tea, the fern trembles,
//   and the light follows the PC clock (dawn, day, dusk, night).
// Live wallpaper: rest your hand on the calendar and its top page lifts in the draft,
// flutters (tomorrow's date peeks out underneath) and settles back.
// With reducedMotion one still frame is drawn (redrawn each minute and on time-of-day change).

import imgUrl from './clockmakers-almanac.jpg'
import bobUrl from './clockmakers-almanac-pendulum.png'
import maskUrl from './clockmakers-almanac-light.png'

const IW = 1920, IH = 1080
const CLOCK = { x: 1392, y: 226, rx: 133, ry: 154 }
const PIVOT = [1399, 406], BOB = { x0: 1340, y0: 400 }
const CAL = { hinge: 566, left: 912, right: 1238, bottom: 868, poly: [[915, 548], [1240, 552], [1246, 868], [1180, 885], [822, 842], [860, 700]] }
const CUP = [452, 832]
const GRADE = {
  dawn: { mul: [228, 212, 222], scr: [30, 22, 34], a: 0.06 },
  day: { mul: [250, 246, 236], scr: [255, 250, 240], a: 0.04 },
  dusk: { mul: [255, 255, 255], scr: [0, 0, 0], a: 0 },
  night: { mul: [62, 72, 118], scr: [20, 30, 60], a: 0.05 },
}
const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER']
const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
const lerp = (a, b, t) => a + (b - a) * t
const rnd = (a, b) => a + Math.random() * (b - a)

export function mount(container, ctx) {
  const assets = { img: imgUrl, bob: bobUrl, mask: maskUrl }
  const cv = document.createElement('canvas')
  cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;'
  container.replaceChildren(cv)
  const c = cv.getContext('2d')
  const bobShadow = document.createElement('canvas')
  let W = 0, H = 0, DPR = 1, cov = { s: 1, x: 0, y: 0 }, T = 0, img = null, bob = null, lumMap = null
  const L = structuredClone(GRADE[ctx.timeOfDay] || GRADE.dusk); let target = GRADE[ctx.timeOfDay] || GRADE.dusk
  const easeLight = (k) => { for (const key of ['mul', 'scr']) for (let i = 0; i < 3; i++) L[key][i] = lerp(L[key][i], target[key][i], k); L.a = lerp(L.a, target.a, k) }
  const pageToday = document.createElement('canvas'), pageNext = document.createElement('canvas')
  let pageKey = ''
  const dust = [], steam = []
  let steamT = 0
  const lift = { a: 0, v: 0, want: 0, restT: 0, cool: 0 }
  const ptr = { x: -1, y: -1, t: -1e9, on: false }

  function layout() {
    W = container.clientWidth || innerWidth; H = container.clientHeight || innerHeight; DPR = Math.min(2, devicePixelRatio || 1)
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR)
    const s = Math.max(W / IW, H / IH); cov = { s, x: (W - IW * s) / 2, y: (H - IH * s) / 2 }
  }
  const toImg = (x, y) => [(x - cov.x) / cov.s, (y - cov.y) / cov.s]
  function inPoly(x, y, P) { let o = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) o = !o } return o }

  // the calendar page with a date printed on it (drawn onto a copy of the painted page)
  function paintPage(canvas, date) {
    const x0 = 800, y0 = 540, w = 460, h = 360
    canvas.width = w; canvas.height = h
    const p = canvas.getContext('2d')
    p.save(); p.beginPath(); CAL.poly.forEach(([x, y], i) => (i ? p.lineTo(x - x0, y - y0) : p.moveTo(x - x0, y - y0))); p.closePath(); p.clip()
    p.drawImage(img, x0, y0, w, h, 0, 0, w, h)
    p.globalCompositeOperation = 'multiply'
    // the page leans back and curls: shear the print a little to sit on it
    p.translate(1080 - x0, 0); p.transform(1, 0, -0.14, 1, 0, 0)
    p.textAlign = 'center'; p.textBaseline = 'alphabetic'
    p.fillStyle = 'rgba(70,45,30,0.9)'
    p.font = '600 26px Georgia, "Times New Roman", serif'
    const month = MONTHS[date.getMonth()]
    p.save(); p.translate(0, 625 - y0); p.scale(1.05, 1); spaced(p, month, 0, 0, 5); p.restore()
    p.fillStyle = date.getDay() === 0 ? 'rgba(150,40,35,0.92)' : 'rgba(55,35,25,0.92)'
    p.font = '700 150px Georgia, "Times New Roman", serif'
    p.fillText(String(date.getDate()), 0, 768 - y0)
    p.fillStyle = 'rgba(70,45,30,0.85)'
    p.font = '600 22px Georgia, "Times New Roman", serif'
    spaced(p, DAYS[date.getDay()], 0, 812 - y0, 4)
    p.strokeStyle = 'rgba(80,50,30,0.35)'; p.lineWidth = 1.2; p.beginPath(); p.moveTo(-90, 640 - y0); p.lineTo(90, 640 - y0); p.stroke()
    p.restore()
  }
  function spaced(p, text, x, y, sp) {
    let w = 0; for (const ch of text) w += p.measureText(ch).width + sp
    let cx = x - (w - sp) / 2
    p.textAlign = 'left'
    for (const ch of text) { p.fillText(ch, cx, y); cx += p.measureText(ch).width + sp }
    p.textAlign = 'center'
  }
  function refreshPages() {
    const now = new Date(), key = now.toDateString()
    if (key === pageKey) return
    pageKey = key
    paintPage(pageToday, now)
    const next = new Date(now); next.setDate(now.getDate() + 1)
    paintPage(pageNext, next)
  }

  function step(dt) {
    T += dt
    // calendar page: rest the hand on it -> lift, flutter, settle
    const [ix, iy] = toImg(ptr.x, ptr.y)
    const over = ptr.on && inPoly(ix, iy, CAL.poly)
    lift.cool -= dt
    if (over && T - ptr.t > 0.45 && lift.cool <= 0 && lift.want === 0) { lift.want = 1; lift.restT = 0 }
    if (lift.want === 1) { lift.restT += dt; if (lift.restT > 1.4) { lift.want = 0; lift.cool = 2.5 } }
    const tgt = lift.want ? 0.95 + Math.sin(T * 9) * 0.06 : 0
    lift.v += ((tgt - lift.a) * 38 - lift.v * 7) * dt
    lift.a = Math.max(0, lift.a + lift.v * dt)
    // dust motes
    while (dust.length < 90) dust.push({ x: rnd(250, 1500), y: rnd(40, 900), vx: rnd(-4, 4), vy: rnd(-3, 3), r: rnd(0.8, 2.2), ph: rnd(0, 6) })
    for (const d of dust) {
      d.vx += (Math.sin(T * 0.3 + d.ph) * 3 - d.vx) * dt * 0.5; d.vy += (Math.cos(T * 0.23 + d.ph * 1.7) * 2.5 - 0.6 - d.vy) * dt * 0.5
      d.x += d.vx * dt; d.y += d.vy * dt
      if (d.x < 200 || d.x > 1560 || d.y < 0 || d.y > 960) { d.x = rnd(250, 1500); d.y = rnd(40, 900) }
    }
    // tea steam
    steamT -= dt
    if (steamT <= 0) { steamT = rnd(0.5, 0.9); steam.push({ x: CUP[0] + rnd(-30, 30), y: CUP[1] - 10, r: rnd(10, 16), life: 0, max: rnd(4, 5.5), ph: rnd(0, 6) }) }
    for (const p of steam) { p.life += dt; p.y -= 22 * dt; p.x += Math.sin(T * 1.1 + p.ph) * 10 * dt; p.r += 6 * dt }
    while (steam.length && steam[0].life > steam[0].max) steam.shift()
  }

  function drawHands(now) {
    const h = now.getHours() % 12, m = now.getMinutes(), s = now.getSeconds(), ms = now.getMilliseconds()
    const tick = ctx.reducedMotion ? 0 : Math.max(0, 1 - ms / 120) // a little bounce on each tick
    const sa = (s + Math.sin(tick * Math.PI) * 0.08 * (ms < 120 ? 1 : 0)) / 60 * Math.PI * 2
    const ma = (m + s / 60) / 60 * Math.PI * 2, ha = (h + m / 60) / 12 * Math.PI * 2
    const R = CLOCK.ry
    const hand = (ang, len, back, w, col, tip) => {
      c.save(); c.rotate(ang)
      c.fillStyle = col; c.beginPath()
      c.moveTo(-w * 0.5, back); c.lineTo(-w * 0.35, -len * 0.8); c.lineTo(0, -len); c.lineTo(w * 0.35, -len * 0.8); c.lineTo(w * 0.5, back); c.closePath(); c.fill()
      if (tip) tip()
      c.restore()
    }
    const all = (shadow) => {
      const col = shadow ? 'rgba(40,25,10,0.28)' : null
      hand(ha, R * 0.52, R * 0.1, 9, col || '#2b1d12', () => { if (!shadow) { c.fillStyle = '#2b1d12' } c.beginPath(); c.ellipse(0, -R * 0.36, 7, 10, 0, 0, 7); c.fill() })
      hand(ma, R * 0.8, R * 0.12, 6, col || '#2b1d12')
      hand(sa, R * 0.86, R * 0.22, 2, col || '#8a2a1c', () => { c.beginPath(); c.arc(0, R * 0.16, 6, 0, 7); c.fill() })
      c.fillStyle = col || '#b8892f'; c.beginPath(); c.arc(0, 0, 8, 0, 7); c.fill()
      if (!shadow) { c.fillStyle = '#f2d589'; c.beginPath(); c.arc(-2, -2, 3, 0, 7); c.fill() }
    }
    c.save(); c.translate(CLOCK.x + 4, CLOCK.y + 6); c.scale(CLOCK.rx / CLOCK.ry, 1); all(true); c.restore()
    c.save(); c.translate(CLOCK.x, CLOCK.y); c.scale(CLOCK.rx / CLOCK.ry, 1); all(false); c.restore()
  }

  function render() {
    if (!img) return
    const now = new Date()
    refreshPages()
    c.setTransform(DPR * cov.s, 0, 0, DPR * cov.s, DPR * cov.x, DPR * cov.y)
    c.drawImage(img, 0, 0)
    // fern trembles: thin strips nudged sideways, more toward the tips
    if (!ctx.reducedMotion) for (let y = 220; y < 700; y += 6) {
      const k = 1 - (y - 220) / 480, dx = (Math.sin(T * 1.7 + y * 0.03) * 1.2 + Math.sin(T * 3.1 + y * 0.07) * 0.5) * k
      c.drawImage(img, 90, y, 760, 6, 90 + dx, y, 760, 6)
    }
    // pendulum: shadow on the wall, then the brass
    const ang = ctx.reducedMotion ? 0 : Math.sin(T * Math.PI / 0.85) * 0.075
    if (bob) {
      c.save(); c.translate(PIVOT[0] + 24, PIVOT[1] + 12); c.rotate(ang); c.globalAlpha = 0.35
      c.drawImage(bobShadow, BOB.x0 - PIVOT[0] - 8, BOB.y0 - PIVOT[1] - 8); c.restore()
      c.save(); c.translate(PIVOT[0], PIVOT[1]); c.rotate(ang); c.drawImage(bob, BOB.x0 - PIVOT[0], BOB.y0 - PIVOT[1])
      // a glint that slides across the bob as it swings
      c.globalCompositeOperation = 'lighter'; const gx = Math.sin(T * Math.PI / 0.85) * 18
      const g = c.createRadialGradient(gx - 1, 191 - 8, 0, gx - 1, 191 - 8, 26); g.addColorStop(0, 'rgba(255,230,160,0.35)'); g.addColorStop(1, 'rgba(255,230,160,0)')
      c.fillStyle = g; c.beginPath(); c.arc(gx - 1, 183, 26, 0, 7); c.fill(); c.restore()
    }
    drawHands(now)
    // calendar
    if (lift.a < 0.01) c.drawImage(pageToday, 800, 540)
    else {
      c.drawImage(pageNext, 800, 540)
      const k = Math.cos(Math.min(1.25, lift.a * 1.1)), hy = CAL.hinge
      // soft shadow cast by the lifted sheet
      c.save(); c.globalAlpha = 0.18 * Math.min(1, lift.a); c.fillStyle = '#3a2410'
      c.beginPath(); c.moveTo(915, hy); c.lineTo(1238, hy); c.lineTo(1238, hy + (CAL.bottom - hy) * k + 30); c.lineTo(870, hy + (CAL.bottom - hy) * k + 20); c.fill(); c.restore()
      c.save(); c.translate(0, hy); c.scale(1, k); c.translate(0, -hy)
      c.drawImage(pageToday, 800, 540)
      c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.18 * Math.min(1, lift.a); c.drawImage(pageToday, 800, 540)
      c.restore()
    }
    // tea steam
    for (const p of steam) {
      const k = p.life / p.max, a = Math.sin(Math.PI * Math.min(1, k * 1.2)) * 0.12
      const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r); g.addColorStop(0, `rgba(255,245,230,${a})`); g.addColorStop(1, 'rgba(255,245,230,0)')
      c.fillStyle = g; c.beginPath(); c.arc(p.x, p.y, p.r, 0, 7); c.fill()
    }
    // dust in the sunbeams (bright only where the light falls)
    c.globalCompositeOperation = 'lighter'
    const sun = 1 - L.a * 0 - (target === GRADE.night ? 0.8 : 0)
    for (const d of dust) {
      const lx = Math.min(191, Math.max(0, d.x / 10 | 0)), ly = Math.min(107, Math.max(0, d.y / 10 | 0))
      const lum = lumMap ? lumMap[ly * 192 + lx] / 255 : 0.5
      const a = Math.max(0, lum - 0.45) * 1.6 * (0.6 + 0.4 * Math.sin(T * 2 + d.ph)) * sun
      if (a < 0.03) continue
      c.fillStyle = `rgba(255,236,190,${Math.min(0.9, a)})`; c.beginPath(); c.arc(d.x, d.y, d.r, 0, 7); c.fill()
    }
    c.globalCompositeOperation = 'source-over'
    // time of day
    c.setTransform(DPR, 0, 0, DPR, 0, 0)
    c.globalCompositeOperation = 'multiply'; c.fillStyle = `rgb(${L.mul.map((v) => v | 0)})`; c.fillRect(0, 0, W, H)
    c.globalCompositeOperation = 'screen'; c.fillStyle = `rgba(${L.scr.map((v) => v | 0)},${L.a})`; c.fillRect(0, 0, W, H)
    c.globalCompositeOperation = 'source-over'
    const vg = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.75)
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(20,10,0,0.35)'); c.fillStyle = vg; c.fillRect(0, 0, W, H)
  }

  function onPointer(e) {
    if (ctx.reducedMotion || !W) return
    if (e.type === 'move') {
      if (Math.hypot(e.x - ptr.x, e.y - ptr.y) > 3) ptr.t = T
      ptr.x = e.x; ptr.y = e.y; ptr.on = true
    } else if (e.type === 'down') {
      const [ix, iy] = toImg(e.x, e.y)
      if (inPoly(ix, iy, CAL.poly) && lift.want === 0) { lift.want = 1; lift.restT = 0 }
    }
  }

  let raf = 0, last = performance.now(), stopped = false, minute = 0
  function loop(t) { if (stopped) return; raf = requestAnimationFrame(loop); const dt = Math.min(0.05, (t - last) / 1000); last = t; easeLight(Math.min(1, dt / 20)); step(dt); render() }
  const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src })
  Promise.all([load(assets.img), load(assets.bob), load(assets.mask)]).then(([a, b, m]) => {
    if (stopped) return
    img = a; bob = b
    bobShadow.width = b.width + 16; bobShadow.height = b.height + 16
    const bs = bobShadow.getContext('2d'); bs.filter = 'blur(4px) brightness(0)'; bs.drawImage(b, 8, 8)
    const t = document.createElement('canvas'); t.width = 192; t.height = 108; const tx = t.getContext('2d'); tx.drawImage(m, 0, 0)
    const d = tx.getImageData(0, 0, 192, 108).data; lumMap = new Uint8Array(192 * 108); for (let i = 0; i < lumMap.length; i++) lumMap[i] = d[i * 4]
    layout()
    if (ctx.reducedMotion) { render(); minute = setInterval(render, 60000) } else raf = requestAnimationFrame(loop)
    requestAnimationFrame(() => requestAnimationFrame(() => ctx.ready()))
  }).catch((err) => { console.error(err); ctx.ready() })
  layout()
  const offClock = ctx.subscribe?.(({ timeOfDay }) => { target = GRADE[timeOfDay] || GRADE.dusk; if (ctx.reducedMotion) { easeLight(1); render() } })
  const offPointer = ctx.onPointer?.(onPointer)
  let rz = 0
  const onResize = () => { clearTimeout(rz); rz = setTimeout(() => { layout(); render() }, 150) }
  addEventListener('resize', onResize)
  return { unmount() { stopped = true; cancelAnimationFrame(raf); clearInterval(minute); clearTimeout(rz); removeEventListener('resize', onResize); offPointer?.(); offClock?.(); container.replaceChildren() } }
}
