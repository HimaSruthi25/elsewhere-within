// Tide Harbour Clock — a blue-hour fishing harbour whose chalk board tells the time and the tide.
// Picture + code: the harbour painting with code layers on top:
//   - the blank tide board shows the live time and a rising/falling tide gauge (offline model, not real tables);
//   - boats rise and sink with the tide and rock on the swell; harbour water shimmers;
//   - the quay lantern, house lamps and windows flicker; the lighthouse flashes and sweeps a faint beam;
//   - a distant fishing boat with a lantern crosses the bay every few minutes (more often near high tide);
// Time of day: dawn / day / dusk (= the painting) / night grades with stars.
// Live wallpaper (hover only): rest the mouse on the board → it also shows the date and the next high and low tide.
// reducedMotion: one still frame (redrawn each minute and when the time of day changes).
import plateUrl from './tide-harbour-clock.jpg'

const PERIOD = 12.4206 * 3600e3, EPOCH = Date.UTC(2000, 0, 6, 18, 14), SPRING = 14.765 * 86400e3
export function tideAt(ms) {
  const n = (ms - EPOCH) / PERIOD, s = .85 + .15 * Math.cos(2 * Math.PI * (ms - EPOCH) / SPRING)
  const level = .5 + .5 * s * Math.cos(2 * Math.PI * n)
  const frac = n - Math.floor(n)
  return { level, rising: frac > .5, nextHigh: EPOCH + PERIOD * Math.ceil(n), nextLow: EPOCH + PERIOD * (Math.ceil(n - .5) + .5) }
}

export function mount(container, ctx) {
  const W = 1920, H = 1080
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H
  cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block'
  container.replaceChildren(cv)
  const g = cv.getContext('2d')
  const rnd = (a, b) => a + Math.random() * (b - a)
  const plate = new Image()
  let stopped = false, raf = 0, last = 0, T = 0

  const GRADES = {
    dawn:  { mul: [255, 200, 205], ma: .0, add: [255, 150, 130, .16], glow: .6, stars: 0 },
    day:   { mul: [255, 255, 255], ma: 0,  add: [190, 220, 255, .38], glow: .15, stars: 0 },
    dusk:  { mul: [255, 255, 255], ma: 0,  add: [0, 0, 0, 0], glow: 1, stars: 0 },
    night: { mul: [60, 75, 140],   ma: .55, add: [0, 0, 0, 0], glow: 1.3, stars: 1 } }
  let tod = ctx.timeOfDay || 'dusk'
  const unsub = ctx.subscribe ? ctx.subscribe(({ timeOfDay }) => { tod = timeOfDay; if (ctx.reducedMotion && plate.complete) frame() }) : null

  const BOARD = { x: 1383, y: 270, w: 204, h: 323 }
  const BOATS = [{ x: 200, y: 625, w: 490, h: 295, ph: 0 }, { x: 630, y: 600, w: 232, h: 120, ph: 2 }, { x: 847, y: 592, w: 101, h: 98, ph: 4 }]
  const LAMPS = [[165, 465], [607, 483], [1507, 840]]
  const WINS = [[162, 390], [300, 405], [220, 498], [555, 504]]
  const glints = Array.from({ length: 80 }, () => newGlint())
  function newGlint() { const sea = Math.random() < .3; return { x: sea ? rnd(930, 1770) : rnd(660, 1260), y: sea ? rnd(545, 625) : rnd(700, 1050), life: rnd(0, 3), max: rnd(1.2, 3), w: rnd(10, 36) } }
  const stars = Array.from({ length: 60 }, () => ({ x: rnd(0, 1900), y: rnd(0, 330), p: rnd(0, 6), s: Math.random() < .2 ? 3 : 2 }))
  const clouds = Array.from({ length: 4 }, () => ({ x: rnd(0, W), y: rnd(20, 300), w: rnd(240, 500), v: rnd(3, 7) }))
  let boat = null, nextBoat = 12, hover = 0, ptr = null

  const offPtr = ctx.onPointer ? ctx.onPointer(e => {
    const r = cv.getBoundingClientRect(), sc = Math.max(r.width / W, r.height / H)
    const nx = (e.x - r.left - (r.width - W * sc) / 2) / sc, ny = (e.y - r.top - (r.height - H * sc) / 2) / sc
    if (e.type === 'move') ptr = { x: nx, y: ny }
  }) : null
  const overBoard = () => ptr && ptr.x > BOARD.x - 40 && ptr.x < BOARD.x + BOARD.w + 40 && ptr.y > BOARD.y - 30 && ptr.y < BOARD.y + BOARD.h + 60

  function step(dt) {
    T += dt
    for (const s of glints) { s.life += dt; if (s.life > s.max) Object.assign(s, newGlint(), { life: 0 }) }
    for (const c of clouds) { c.x += c.v * dt; if (c.x > W + 50) { c.x = -c.w; c.y = rnd(20, 300) } }
    const lv = tideAt(Date.now()).level
    nextBoat -= dt
    if (!boat && nextBoat <= 0) { const d = Math.random() < .5 ? 1 : -1; boat = { x: d > 0 ? 930 : 1770, d, y: rnd(560, 610) }; nextBoat = rnd(120, 240) * (lv > .7 ? .5 : 1) }
    if (boat) { boat.x += boat.d * 14 * dt; if (boat.x < 900 || boat.x > 1800) boat = null }
    hover += ((overBoard() ? 1 : 0) - hover) * Math.min(1, dt * 4)
  }

  const pad = n => String(n).padStart(2, '0')
  const hm = ms => { const d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()) }
  function board(tide) {
    const now = new Date(Date.now()), cx = BOARD.x + BOARD.w / 2
    g.save(); g.textAlign = 'center'; g.textBaseline = 'alphabetic'
    g.shadowColor = 'rgba(255,255,240,.25)'; g.shadowBlur = 4
    g.fillStyle = 'rgba(236,232,214,.9)'
    g.font = '600 20px Georgia, serif'; g.fillText('T I D E   C L O C K', cx, BOARD.y + 44)
    g.font = '500 56px Georgia, serif'; g.fillText(hm(now.getTime()), cx, BOARD.y + 118)
    g.font = '500 22px Georgia, serif'
    g.fillText((tide.rising ? '▲ rising' : '▼ falling'), cx, BOARD.y + 156)
    // gauge
    const gx = BOARD.x + 26, gw = BOARD.w - 52, gy = BOARD.y + 176
    g.strokeStyle = 'rgba(236,232,214,.8)'; g.lineWidth = 2; g.strokeRect(gx, gy, gw, 16)
    g.fillStyle = 'rgba(150,200,230,.75)'; g.fillRect(gx + 2, gy + 2, (gw - 4) * tide.level, 12)
    g.font = '15px Georgia, serif'; g.fillStyle = 'rgba(236,232,214,.8)'; g.textAlign = 'left'; g.fillText('low', gx, gy + 36); g.textAlign = 'right'; g.fillText('high', gx + gw, gy + 36)
    g.textAlign = 'center'
    // hover details
    if (hover > .02) {
      g.globalAlpha = hover; g.fillStyle = 'rgba(236,232,214,.92)'
      g.font = '500 21px Georgia, serif'
      g.fillText(now.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }), cx, BOARD.y + 238)
      g.font = '500 22px Georgia, serif'
      g.fillText('High  ' + hm(tide.nextHigh), cx, BOARD.y + 272)
      g.fillText('Low   ' + hm(tide.nextLow), cx, BOARD.y + 302)
    }
    g.restore()
  }

  function frame() {
    const G = GRADES[tod] || GRADES.dusk, tide = tideAt(Date.now())
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'
    g.drawImage(plate, 0, 0, W, H)
    // boats rise with the tide and rock
    for (const b of BOATS) {
      const dy = (tide.level - .5) * -9 + Math.sin(T * .9 + b.ph) * 2.4, dx = Math.sin(T * .6 + b.ph) * 1.2
      g.drawImage(plate, b.x, b.y, b.w, b.h, b.x + dx, b.y + dy, b.w, b.h)
    }
    // stars + clouds
    if (G.stars) for (const s of stars) { g.fillStyle = `rgba(235,240,255,${.35 + .35 * Math.sin(T * 1.3 + s.p)})`; g.fillRect(s.x, s.y, s.s, s.s) }
    g.fillStyle = 'rgba(20,28,60,.07)'
    for (const c of clouds) { g.beginPath(); g.ellipse(c.x, c.y, c.w / 2, 22, 0, 0, 7); g.fill() }
    // lighthouse (grid ≈ 1077,528): red flash + faint sweeping beam
    const flash = Math.pow(Math.max(0, Math.sin(T * 1.2)), 6)
    g.globalCompositeOperation = 'lighter'
    let gg = g.createRadialGradient(1077, 528, 0, 1077, 528, 16 + 12 * flash); gg.addColorStop(0, `rgba(255,120,100,${.2 + .45 * flash})`); gg.addColorStop(1, 'rgba(255,80,60,0)'); g.fillStyle = gg; g.fillRect(1037, 488, 80, 80)
    const dir = Math.cos(T * .6) > 0 ? 1 : -1, bl = 140 + 380 * flash
    gg = g.createLinearGradient(1077, 528, 1077 + dir * bl, 520); gg.addColorStop(0, `rgba(255,170,150,${.22 * flash})`); gg.addColorStop(1, 'rgba(255,170,150,0)')
    g.fillStyle = gg; g.beginPath(); g.moveTo(1077, 524); g.lineTo(1077 + dir * bl, 500); g.lineTo(1077 + dir * bl, 548); g.lineTo(1077, 532); g.fill()
    // lamps and windows
    const fl = .86 + .14 * Math.sin(T * 8) * Math.sin(T * 2.9)
    for (const [x, y] of LAMPS) { const r = (x === 1507 ? 110 : 55) * (.95 + .05 * fl); gg = g.createRadialGradient(x, y, 0, x, y, r); gg.addColorStop(0, `rgba(255,185,80,${.5 * G.glow * fl})`); gg.addColorStop(1, 'rgba(255,140,40,0)'); g.fillStyle = gg; g.fillRect(x - r, y - r, r * 2, r * 2) }
    WINS.forEach(([x, y], i) => { gg = g.createRadialGradient(x, y, 0, x, y, 30); gg.addColorStop(0, `rgba(255,190,90,${.28 * G.glow * (.9 + .1 * Math.sin(T * 4 + i))})`); gg.addColorStop(1, 'rgba(255,150,50,0)'); g.fillStyle = gg; g.fillRect(x - 30, y - 30, 60, 60) })
    // wet cobble reflection under the quay lantern
    for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(255,190,100,${(.22 - i * .03) * G.glow * fl})`; g.fillRect(1507 - 22 + Math.sin(T * 2 + i) * 3, 900 + i * 22, 44 - i * 4, 5) }
    // water shimmer
    for (const s of glints) { const a = Math.sin(Math.PI * s.life / s.max); if (a > 0) { g.fillStyle = `rgba(190,210,255,${.34 * a})`; g.fillRect(s.x, s.y, s.w, 2) } }
    g.globalCompositeOperation = 'source-over'
    // the distant fishing boat
    if (boat) { const bob = Math.sin(T * 1.3) * 1.5; g.fillStyle = 'rgba(10,14,30,.92)'; g.beginPath(); g.moveTo(boat.x - 18, boat.y + bob); g.lineTo(boat.x + 18, boat.y + bob); g.lineTo(boat.x + 12, boat.y + 7 + bob); g.lineTo(boat.x - 14, boat.y + 7 + bob); g.fill(); g.fillRect(boat.x - 1, boat.y - 18 + bob, 2, 18); g.fillStyle = 'rgba(255,200,110,.95)'; g.fillRect(boat.x - 2, boat.y - 20 + bob, 4, 4); g.globalCompositeOperation = 'lighter'; gg = g.createRadialGradient(boat.x, boat.y - 18 + bob, 0, boat.x, boat.y - 18 + bob, 22); gg.addColorStop(0, 'rgba(255,190,90,.5)'); gg.addColorStop(1, 'rgba(255,150,50,0)'); g.fillStyle = gg; g.fillRect(boat.x - 22, boat.y - 40 + bob, 44, 44); g.globalCompositeOperation = 'source-over' }
    // grade
    if (G.ma > .01) { g.globalCompositeOperation = 'multiply'; g.fillStyle = `rgba(${G.mul.join(',')},${G.ma})`; g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'source-over' }
    if (G.add[3] > 0) { g.fillStyle = `rgba(${G.add.join(',')})`; g.fillRect(0, 0, W, H) }
    board(tide)
  }

  function loop(now) { if (stopped) return; const dt = Math.min(.05, (now - last) / 1000); last = now; step(dt); frame(); raf = requestAnimationFrame(loop) }
  plate.onload = () => {
    if (stopped) return
    if (ctx.reducedMotion) { frame(); ctx.ready && ctx.ready(); const id = setInterval(() => stopped ? clearInterval(id) : frame(), 60000); return }
    for (let i = 0; i < 40; i++) step(.05)
    last = performance.now(); raf = requestAnimationFrame(loop); ctx.ready && ctx.ready()
  }
  plate.onerror = () => ctx.ready && ctx.ready()
  plate.src = plateUrl
  return { unmount() { stopped = true; cancelAnimationFrame(raf); offPtr && offPtr(); unsub && unsub(); container.replaceChildren() } }
}
