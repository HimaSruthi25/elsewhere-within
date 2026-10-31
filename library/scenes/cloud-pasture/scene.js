// Cloud Pasture — a patchwork countryside seen from high above, drawn and animated live.
// Clouds float over it (with their shadows sliding across the fields), sheep graze,
// a river glints, chimneys smoke, birds pass. Follows the PC clock (dawn/day/dusk/night).
// Live wallpaper: your hand is wind (move = push and tear clouds, sheep shy away);
// rest still on a crop field = that field runs through its whole year while you watch
// (plough, sow, sprout, grow, ripen, harvest with a combine, bales, plough again);
// click a cloud = a short shower (fields darken, sheep run for the trees);
// click open sky = a new little cloud puffs up there.
// Hand control (tray switch "Hand control (camera)", wallpaper only): wave hello = the sheep
// look up at you and the farmer steps out and waves back; hold your hand in one spot and
// wiggle your fingers (sprinkling) = hay falls there and the sheep trot over to eat it.
// The scene only gets the moving blocks from ctx.onWave, never the picture.
// With reducedMotion one still frame is drawn (redrawn when the time of day changes).
// Seasons: one season per day, in turn (spring, summer, autumn, winter, then spring again),
// changing at midnight by the PC's date. Spring: blossom in the hedges, petals, lambs.
// Summer: deep green, sunny, fewer showers. Autumn: orange and red trees, falling leaves.
// Winter: snow over the fields, bare trees, light snowfall, showers fall as snow.

export function mount (container, ctx) {
  const TODS = {
    dawn:  { sd: [0.85, 0.22], light: [1.0, 0.86, 0.80], amb: [0.62, 0.58, 0.70], tint: [255, 236, 228], shade: 0.55, sh: 0.30,
             cl: ['#fff3ea', '#f6d9d6', '#b7a6c0', '#857c9c'], night: 0 },
    day:   { sd: [0.36, 0.26], light: [1.0, 0.98, 0.92], amb: [0.66, 0.70, 0.74], tint: [255, 253, 246], shade: 0.60, sh: 0.40,
             cl: ['#ffffff', '#eef2f7', '#bdc8d8', '#8e9bb2'], night: 0 },
    dusk:  { sd: [-0.9, 0.24], light: [1.0, 0.80, 0.58], amb: [0.55, 0.50, 0.62], tint: [255, 226, 200], shade: 0.58, sh: 0.30,
             cl: ['#ffe6c0', '#f3bd96', '#94819e', '#5f5878'], night: 0.25 },
    night: { sd: [0.28, 0.30], light: [0.55, 0.65, 0.90], amb: [0.36, 0.42, 0.58], tint: [112, 132, 176], shade: 0.40, sh: 0.18,
             cl: ['#cfdaf0', '#909fbe', '#4f5c7c', '#2e3752'], night: 1 },
  }
  const RAIN_CL = ['#e4e8ee', '#b9c1cc', '#7e8798', '#5a6274']

  const rnd = (a, b) => a + Math.random() * (b - a)
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
  const lerp = (a, b, t) => a + (b - a) * t
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
  const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`

  const canvas = document.createElement('canvas')
  container.appendChild(canvas)
  let g = canvas.getContext('2d')
  let W = 0, H = 0
  let tod = TODS[ctx.timeOfDay] ? ctx.timeOfDay : 'day'
  const SEASONS = ['spring', 'summer', 'autumn', 'winter']
  // one season per day, in turn; the same date gives the same season on every PC
  const seasonForToday = () => { const d = new Date(); const day = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000); return SEASONS[((day % 4) + 4) % 4] }
  const forced = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('season') : null
  let season = SEASONS.includes(forced) ? forced : seasonForToday()
  const PASTURE = { spring: [0.96, 1.1, 0.94], summer: [1.05, 1.0, 0.84], autumn: [1.1, 1.0, 0.84], winter: [1, 1, 1] }
  const HEDGE = { spring: [50, 76, 38], summer: [46, 70, 34], autumn: [72, 60, 36], winter: [62, 58, 54] }
  let L = TODS[tod]

  // ---------- noise ----------
  const seed = Math.random() * 1000
  function hash (x, y) { const s = Math.sin(x * 127.1 + y * 311.7 + seed) * 43758.5453; return s - Math.floor(s) }
  function vnoise (x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf)
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1)
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
  }
  function fbm (x, y, o = 4) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { s += a * vnoise(x * f, y * f); f *= 2.03; a *= 0.5 } return s }

  // ---------- world layout (made once per size) ----------
  let fields = [], cellS = 150, gw = 0, gh = 0
  let riverY = null, laneX = null, houses = [], trees = [], sheep = [], flocks = []
  const FIELD_COLS = [
    ['#7b9a4c', 0.02], ['#88a85a', 0.025], ['#6b8c46', 0.02], ['#98b266', 0.02], ['#7a9850', 0.03], ['#6f9150', 0.02],
    ['#c4b175', 0.05], ['#d1bf84', 0.045], ['#b8a466', 0.05], ['#9a7f5c', 0.07], ['#a88d66', 0.06], ['#8ea65e', 0.03],
  ]
  function layout () {
    cellS = clamp(Math.min(W, H) / 5.2, 110, 190)
    gw = Math.ceil(W / cellS) + 3; gh = Math.ceil(H / cellS) + 3
    fields = []
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const fc = FIELD_COLS[(Math.random() * FIELD_COLS.length) | 0]
      fields.push({ x: (i - 1 + rnd(0.1, 0.9)) * cellS, y: (j - 1 + rnd(0.1, 0.9)) * cellS, col: hex(fc[0]), crop: fc[1] >= 0.045, stripe: fc[1], ang: rnd(0, Math.PI), freq: rnd(0.45, 0.7), vary: rnd(-0.05, 0.05), grp: fields.length })
    }
    // merge some neighbours into one bigger field (no hedge between them)
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      if (Math.random() > 0.32) continue
      const f = fields[j * gw + i], n = Math.random() < 0.5 && i > 0 ? fields[j * gw + i - 1] : j > 0 ? fields[(j - 1) * gw + i] : null
      if (n) { f.col = n.col; f.crop = n.crop; f.stripe = n.stripe; f.ang = n.ang; f.freq = n.freq; f.vary = n.vary; f.grp = n.grp }
    }
    const ph = rnd(0, 6), ph2 = rnd(0, 6), y0 = H * rnd(0.18, 0.3), y1 = H * rnd(0.72, 0.85)
    riverY = (x) => lerp(y0, y1, (x + 60) / (W + 120)) + H * 0.07 * Math.sin(x * 0.0055 + ph) + H * 0.025 * Math.sin(x * 0.017 + ph2)
    const lx = W * rnd(0.55, 0.68), lp = rnd(0, 6)
    laneX = (y) => lx + W * 0.05 * Math.sin(y * 0.0045 + lp) + W * 0.015 * Math.sin(y * 0.013)
    // farms along the lane
    houses = []
    const farmYs = [H * rnd(0.12, 0.28), H * rnd(0.55, 0.68)]
    for (const fy of farmYs) {
      let fx = laneX(fy) + (Math.random() < 0.5 ? -1 : 1) * rnd(34, 50)
      if (Math.abs(fy - riverY(fx)) < 60) continue
      const ang = rnd(-0.4, 0.4), n = 2 + ((Math.random() * 2) | 0)
      for (let k = 0; k < n; k++) {
        const a = ang + (k % 2) * Math.PI / 2
        houses.push({ x: fx + Math.cos(ang) * k * 20 + rnd(-4, 4), y: fy + Math.sin(ang) * k * 20 + (k % 2) * 16, w: rnd(17, 26), d: rnd(10, 13), a, roof: Math.random() < 0.6 ? hex('#a65c3e') : hex('#636c77'), chimney: k === 0 })
      }
    }
    // one lone barn far away
    { const bx = W * rnd(0.12, 0.3), by = H * rnd(0.6, 0.85); if (Math.abs(by - riverY(bx)) > 60) houses.push({ x: bx, y: by, w: 24, d: 13, a: rnd(-0.5, 0.5), roof: hex('#7b5a44'), chimney: false }) }
    // trees: hedgerows + copses
    trees = []
    const nearHouse = (x, y) => houses.some(h => Math.hypot(h.x - x, h.y - y) < 30)
    const okTree = (x, y) => Math.abs(y - riverY(x)) > 16 && Math.abs(x - laneX(y)) > 8 && !nearHouse(x, y)
    for (let y = -10; y < H + 10; y += 5) for (let x = -10; x < W + 10; x += 5) {
      const jx = x + rnd(-2, 2), jy = y + rnd(-2, 2)
      if (border(jx, jy) < 2.2 && okTree(jx, jy) && Math.random() < 1.5 * fbm(jx * 0.012, jy * 0.012, 2) - 0.15) trees.push({ x: jx, y: jy, r: rnd(3.8, 6.8) })
    }
    for (let c = 0; c < 5; c++) {
      const cx = rnd(0, W), cy = rnd(0, H)
      for (let k = 0; k < 26; k++) { const x = cx + rnd(-1, 1) * 38, y = cy + rnd(-1, 1) * 26; if (okTree(x, y)) trees.push({ x, y, r: rnd(6, 10) }) }
    }
    // trees by the river bank
    for (let x = 0; x < W; x += rnd(20, 60)) { const y = riverY(x) + (Math.random() < 0.5 ? -1 : 1) * rnd(19, 24); if (Math.random() < 0.6) trees.push({ x, y, r: rnd(5, 8) }) }
    trees.sort((a, b) => a.y - b.y)
    // sheep flocks in green fields
    sheep = []; flocks = []
    const greens = fields.filter(f => !f.crop && f.x > 40 && f.x < W - 40 && f.y > 40 && f.y < H - 40 && Math.abs(f.y - riverY(f.x)) > 50 && Math.abs(f.x - laneX(f.y)) > 40)
    greens.sort(() => Math.random() - 0.5)
    for (let k = 0; k < Math.min(4, greens.length); k++) {
      const f = greens[k], fl = { x: f.x, y: f.y, r: cellS * 0.3 }
      flocks.push(fl)
      const n = 5 + ((Math.random() * 6) | 0)
      for (let s = 0; s < n; s++) sheep.push({ fl, x: f.x + rnd(-1, 1) * fl.r * 0.6, y: f.y + rnd(-1, 1) * fl.r * 0.6, h: rnd(0, 6.28), st: 'graze', t: rnd(1, 6), tx: 0, ty: 0, sp: 0, lie: 0, bob: rnd(0, 6), lamb: Math.random() < (season === 'spring' ? 0.45 : 0.18), dark: Math.random() < 0.08 })
    }
  }
  // Voronoi border metric (distance to the edge between two fields)
  function nearest2 (x, y) {
    x += (fbm(x * 0.006, y * 0.006, 2) - 0.5) * 46; y += (fbm(x * 0.006 + 40, y * 0.006 + 17, 2) - 0.5) * 46
    const ci = Math.floor(x / cellS) + 1, cj = Math.floor(y / cellS) + 1
    let d1 = 1e9, d2 = 1e9, f1 = null, f2 = null
    for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
      if (i < 0 || j < 0 || i >= gw || j >= gh) continue
      const f = fields[j * gw + i], dx = f.x - x, dy = f.y - y, d = dx * dx + dy * dy
      if (d < d1) { d2 = d1; f2 = f1; d1 = d; f1 = f } else if (d < d2) { d2 = d; f2 = f }
    }
    const b = Math.sqrt(d2) - Math.sqrt(d1)
    return [f1, f2 && f2.grp === f1.grp ? 99 : b]
  }
  function border (x, y) { return nearest2(x, y)[1] }

  // ---------- ground painting (per time of day) ----------
  let ground = null, prevGround = null, fadeT = 1
  let cropMap = null, cropHW = 0, cropHH = 0
  function paintGround () {
    const c = document.createElement('canvas'); c.width = W; c.height = H
    const q = c.getContext('2d')
    const s = 2, hw = Math.ceil(W / s), hh = Math.ceil(H / s)
    const small = document.createElement('canvas'); small.width = hw; small.height = hh
    const sq = small.getContext('2d'), img = sq.createImageData(hw, hh), d = img.data
    const ls = [-L.sd[0], -L.sd[1]], ln = Math.hypot(ls[0], ls[1]) || 1
    const lx = ls[0] / ln * 0.75, ly = ls[1] / ln * 0.75, lz = 0.66
    const sc = 1 / (Math.min(W, H) * 0.55)
    const fillMap = !cropMap
    if (fillMap) { cropMap = new Int32Array(hw * hh).fill(-1); cropHW = hw; cropHH = hh }
    for (let py = 0; py < hh; py++) {
      for (let px = 0; px < hw; px++) {
        const x = px * s, y = py * s
        // height + slope light
        const h0 = fbm(x * sc, y * sc, 4), hx = fbm((x + 6) * sc, y * sc, 4), hy = fbm(x * sc, (y + 6) * sc, 4)
        let nx = -(hx - h0) * 26, ny = -(hy - h0) * 26, nz = 1
        const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl
        const lit = Math.max(0, nx * lx + ny * ly + nz * lz)
        const sh = 1 - L.shade + L.shade * 1.25 * lit
        const [f, b] = nearest2(x, y)
        let r = f.col[0], gg = f.col[1], bb = f.col[2]
        if (f.crop) { r = 232; gg = 228; bb = 218 } // crop fields: neutral, coloured live by the crop layer
        let inWater = false, onLane = false
        const v = 1 + (f.crop ? 0 : f.vary) + (fbm(x * 0.02, y * 0.02, 2) - 0.5) * 0.18 + (fbm(x * 0.0035 + 9, y * 0.0035, 2) - 0.5) * 0.22 + (hash(px, py) - 0.5) * 0.07
        const st = 1 + (f.crop ? 0 : f.stripe) * Math.sin((x * Math.cos(f.ang) + y * Math.sin(f.ang)) * f.freq + fbm(x * 0.01, y * 0.01, 2) * 3)
        r *= v * st; gg *= v * st; bb *= v * st
        if (!f.crop) { const pt = PASTURE[season]; r *= pt[0]; gg *= pt[1]; bb *= pt[2] }
        // field edge: grass margin, then hedge
        if (b < 9) { const m = 1 - b / 9; r = lerp(r, 92, m * 0.45); gg = lerp(gg, 118, m * 0.45); bb = lerp(bb, 62, m * 0.45) }
        if (b < 3.2) { const m = Math.min(1, (1 - b / 3.2) * 1.6) * (0.75 + 0.5 * hash(px * 3, py)); const hc = HEDGE[season]; r = lerp(r, hc[0], m); gg = lerp(gg, hc[1], m); bb = lerp(bb, hc[2], m) }
        // lane
        const lxd = Math.abs(x - laneX(y))
        if (lxd < 4.5) { onLane = lxd < 3.2; const m = lxd < 3 ? 1 : 1 - (lxd - 3) / 1.5; r = lerp(r, 206, m); gg = lerp(gg, 188, m); bb = lerp(bb, 150, m) }
        // river (distance along y, corrected for slope)
        const ry = riverY(x), slope = (riverY(x + 2) - ry) / 2, rd = Math.abs(y - ry) / Math.sqrt(1 + slope * slope)
        const rw = 9 + 3 * Math.sin(x * 0.01)
        if (rd < rw + 7) {
          inWater = rd < rw + 1
          if (rd < rw) { const deep = 1 - rd / rw, sheen = Math.max(0, 1 - Math.abs(rd / rw - 0.45) * 6) * 0.5 * (0.6 + 0.4 * vnoise(x * 0.05, 3)); r = lerp(88, 48, deep) + sheen * 70; gg = lerp(112, 84, deep) + sheen * 70; bb = lerp(100, 98, deep) + sheen * 60 }
          else { const m = 1 - (rd - rw) / 7; r = lerp(r, 112, m * 0.8); gg = lerp(gg, 128, m * 0.8); bb = lerp(bb, 76, m * 0.8) }
        }
        if (season === 'winter') {
          const sn = fbm(x * 0.03, y * 0.03, 3)
          const D = L.night > 0.5 ? L : TODS.day, TG = L.night > 0.5 ? [150, 160, 186] : [246, 248, 252], SW = [0, 1, 2].map(j => TG[j] / (D.amb[j] * 1.35 * (0.8 + 0.2 * D.light[j]) * D.tint[j] / 255))
          if (rd < rw) { if (rd > rw - 2.5) { r = lerp(r, 214, 0.8); gg = lerp(gg, 224, 0.8); bb = lerp(bb, 236, 0.8) } else { r *= 0.8; gg *= 0.86; bb *= 0.98 } }
          else {
            let k = b < 3.2 ? 0.35 + 0.25 * sn : onLane ? 0.55 + 0.2 * sn : 0.8 + 0.18 * sn
            if (rd < rw + 7) k *= 0.85
            const fur = f.crop ? 0.04 * Math.sin((x * Math.cos(f.ang) + y * Math.sin(f.ang)) * 1.1) : 0
            r = lerp(r, SW[0] * (1 + fur), k); gg = lerp(gg, SW[1] * (1 + fur), k); bb = lerp(bb, SW[2] * (1 + fur), k)
          }
        }
        if (fillMap && f.crop && b >= 0.8 && !inWater && !onLane) cropMap[py * hw + px] = f.grp
        const i = (py * hw + px) * 4
        d[i] = r * sh * L.amb[0] * 1.35 * (0.8 + 0.2 * L.light[0])
        d[i + 1] = gg * sh * L.amb[1] * 1.35 * (0.8 + 0.2 * L.light[1])
        d[i + 2] = bb * sh * L.amb[2] * 1.35 * (0.8 + 0.2 * L.light[2])
        d[i + 3] = 255
      }
    }
    sq.putImageData(img, 0, 0)
    q.imageSmoothingEnabled = true
    q.drawImage(small, 0, 0, W, H)
    const topC = document.createElement('canvas'); topC.width = W; topC.height = H
    const t2 = topC.getContext('2d')
    const lc = L.light, dim = 1 - L.night * 0.55
    const shade = (hx, k = 1) => { const c3 = hex(hx); return rgb([c3[0] * lc[0] * dim * k, c3[1] * lc[1] * dim * k, c3[2] * lc[2] * dim * k]) }
    // bridge where the lane crosses the river
    { let by = 0, best = 1e9; for (let y = 0; y < H; y += 1) { const dd = Math.abs(y - riverY(laneX(y))); if (dd < best) { best = dd; by = y } }
      if (best < 3) { const bx = laneX(by); t2.save(); t2.translate(bx, by); t2.fillStyle = 'rgba(0,0,0,0)'; t2.fillRect(-6 + L.sd[0] * 4, -18 + L.sd[1] * 4, 13, 36); t2.fillStyle = shade('#b9ad98'); t2.fillRect(-6, -18, 12, 36); t2.fillStyle = shade('#8c8270'); t2.fillRect(-6, -18, 2, 36); t2.fillRect(4, -18, 2, 36); t2.restore() } }
    // tree shadows, then crowns
    const sdx = L.sd[0], sdy = L.sd[1]
    const crownSprites = makeCrowns()
    for (const t of trees) if (t.si === undefined) t.si = (Math.random() * 1e6) | 0
    q.globalAlpha = (season === 'winter' ? 0.2 : 0.34) * (1 - L.night * 0.4)
    for (const t of trees) {
      const sp = crownSprites[t.si % crownSprites.length], z = t.r * 3.4, off = t.r * 1.7
      q.drawImage(sp.shadow, t.x + sdx * off - z / 2, t.y + sdy * off - z / 2 + t.r * 0.2, z * (1 + Math.abs(sdx) * 0.25), z * (1 + Math.abs(sdy) * 0.25))
    }
    q.globalAlpha = 1
    for (const h of houses) {
      q.save(); q.translate(h.x + sdx * 7, h.y + sdy * 7); q.rotate(h.a); q.fillStyle = 'rgba(20,28,30,0.35)'; q.fillRect(-h.w / 2, -h.d / 2, h.w, h.d); q.restore()
    }
    for (const t of trees) { const sp = crownSprites[t.si % crownSprites.length], z = t.r * 3.4; t2.drawImage(sp.crown, t.x - z / 2, t.y - z / 2 - t.r * 0.35, z, z) }
    // houses: walls hidden from above, gabled roofs lit on the sun side
    for (const h of houses) {
      t2.save(); t2.translate(h.x, h.y); t2.rotate(h.a)
      if (!h.yard) { h.yard = []; for (let k = 0; k < 6; k++) h.yard.push([rnd(-0.6, 0.6) * h.w, rnd(-0.5, 0.9) * h.d, rnd(0.25, 0.45) * h.w, rnd(0.4, 0.7) * h.d, rnd(0, 1)]); h.garden = Math.random() < 0.7 ? (Math.random() < 0.5 ? -1 : 1) : 0 }
      for (const y of h.yard) { t2.fillStyle = shade(y[4] < 0.5 ? '#9c8a68' : '#8f8a5e'); t2.beginPath(); t2.ellipse(y[0], y[1], y[2], y[3], 0, 0, 6.29); t2.fill() } // packed-earth farmyard
      if (h.garden) { // kitchen garden beside the house: dark soil with green rows
        const gx = h.garden * (h.w / 2 + 7) - 6, gy = -h.d / 2
        t2.fillStyle = shade('#6f5a40'); t2.fillRect(gx, gy, 12, h.d)
        t2.fillStyle = shade('#6f9a48'); for (let k = 0; k < 4; k++) t2.fillRect(gx + 1.5 + k * 2.8, gy + 1, 1.4, h.d - 2)
      }
      const nx = -Math.sin(h.a), ny = Math.cos(h.a) // roof half normal (local +y side)
      const facing = -(nx * sdx + ny * sdy)
      const k1 = 0.78 + 0.32 * clamp(facing, -1, 1), k2 = 0.78 - 0.32 * clamp(facing, -1, 1)
      t2.fillStyle = rgb([h.roof[0] * lc[0] * dim * k2, h.roof[1] * lc[1] * dim * k2, h.roof[2] * lc[2] * dim * k2]); t2.fillRect(-h.w / 2, -h.d / 2, h.w, h.d / 2)
      t2.fillStyle = rgb([h.roof[0] * lc[0] * dim * k1, h.roof[1] * lc[1] * dim * k1, h.roof[2] * lc[2] * dim * k1]); t2.fillRect(-h.w / 2, 0, h.w, h.d / 2)
      t2.fillStyle = 'rgba(0,0,0,0.25)'; t2.fillRect(-h.w / 2, -0.5, h.w, 1)
      if (h.chimney) { t2.fillStyle = shade('#7a6a5c'); t2.fillRect(h.w / 2 - 6, -h.d / 2 + 1, 3, 3) }
      t2.restore()
    }
    // tone for the time of day (base, then the top layer keeping its own shape)
    q.globalCompositeOperation = 'multiply'; q.fillStyle = rgb(L.tint); q.fillRect(0, 0, W, H)
    q.globalCompositeOperation = 'source-over'
    const keep = document.createElement('canvas'); keep.width = W; keep.height = H; keep.getContext('2d').drawImage(topC, 0, 0)
    t2.globalCompositeOperation = 'multiply'; t2.fillStyle = rgb(L.tint); t2.fillRect(0, 0, W, H)
    t2.globalCompositeOperation = 'destination-in'; t2.drawImage(keep, 0, 0)
    t2.globalCompositeOperation = 'source-over'
    // soft vignette + haze toward the top (own layer, drawn over the crops)
    const fxC = document.createElement('canvas'); fxC.width = W; fxC.height = H
    const fq = fxC.getContext('2d')
    const vg = fq.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.35, W / 2, H * 0.55, Math.max(W, H) * 0.75)
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(10,16,24,${0.32 + L.night * 0.2})`)
    fq.fillStyle = vg; fq.fillRect(0, 0, W, H)
    const hz = fq.createLinearGradient(0, 0, 0, H * 0.35)
    const hc = L.night ? [60, 75, 110] : tod === 'dusk' ? [255, 196, 150] : tod === 'dawn' ? [250, 210, 220] : [220, 232, 245]
    hz.addColorStop(0, rgb(hc, 0.26)); hz.addColorStop(1, rgb(hc, 0))
    fq.fillStyle = hz; fq.fillRect(0, 0, W, H * 0.35)
    return { base: c, top: topC, fx: fxC }
  }
  // Tree crowns seen from above: many leaf clumps in a lobed, uneven crown, dark gaps between
  // clumps, lit on the sun side; a few conifers (star-like whorls); bare branching trees in winter.
  // Each sprite comes with a matching shadow silhouette.
  function makeCrowns () {
    const out = []
    const lc = L.light, dim = 1 - L.night * 0.55
    const ls = [-L.sd[0], -L.sd[1]], n = Math.hypot(ls[0], ls[1]) || 1
    const lx = ls[0] / n, ly = ls[1] / n
    const PAL = {
      spring: ['#6a9744', '#78a24b', '#5d8a3e', '#82aa55'],
      summer: ['#4a6f33', '#42673a', '#557a36', '#3b6238', '#61803a'],
      autumn: ['#c06a2c', '#d39a3a', '#a8452c', '#b8862f', '#8a7d36', '#cf7f34'],
      winter: ['#6d6257', '#5f564e', '#776b5e'],
    }
    const pal = PAL[season].map(hex)
    const S = 64, C = 32
    const lit = (c, k) => rgb([c[0] * k * lc[0] * dim, c[1] * k * lc[1] * dim, c[2] * k * lc[2] * dim])
    for (let v = 0; v < 14; v++) {
      const cv = document.createElement('canvas'); cv.width = cv.height = S
      const sh = document.createElement('canvas'); sh.width = sh.height = S
      const q = cv.getContext('2d'), sq = sh.getContext('2d')
      sq.fillStyle = '#000'
      const conifer = season !== 'winter' ? v % 6 === 5 : v % 4 === 3
      if (conifer) {
        // spruce from above: whorls of needle branches, darker green; snow on top in winter
        const base = hex(season === 'autumn' ? '#36573a' : '#2f5236')
        const spokes = 11 + (v % 4)
        for (let layer = 0; layer < 3; layer++) {
          const R = 22 - layer * 6, k = 0.75 + layer * 0.25
          for (let i = 0; i < spokes; i++) {
            const a = i / spokes * 6.283 + layer * 0.4 + rnd(-0.1, 0.1), w = 0.22
            const facing = Math.cos(a) * lx + Math.sin(a) * ly
            q.fillStyle = lit(base, k * (0.85 + 0.35 * facing))
            q.beginPath(); q.moveTo(C, C); q.lineTo(C + Math.cos(a - w) * R * 0.55, C + Math.sin(a - w) * R * 0.55); q.lineTo(C + Math.cos(a) * R, C + Math.sin(a) * R); q.lineTo(C + Math.cos(a + w) * R * 0.55, C + Math.sin(a + w) * R * 0.55); q.closePath(); q.fill()
            if (layer === 0) { sq.beginPath(); sq.moveTo(C, C); sq.lineTo(C + Math.cos(a - w) * R * 0.55, C + Math.sin(a - w) * R * 0.55); sq.lineTo(C + Math.cos(a) * R, C + Math.sin(a) * R); sq.lineTo(C + Math.cos(a + w) * R * 0.55, C + Math.sin(a + w) * R * 0.55); sq.closePath(); sq.fill() }
          }
        }
        if (season === 'winter') { q.fillStyle = lit([250, 252, 255], 1); for (let k = 0; k < 40; k++) { const a = rnd(0, 6.28), r = rnd(2, 18); if (Math.cos(a) * lx + Math.sin(a) * ly > -0.2) { q.globalAlpha = 0.8; q.beginPath(); q.arc(C + Math.cos(a) * r, C + Math.sin(a) * r, rnd(0.7, 1.5), 0, 6.29); q.fill() } } q.globalAlpha = 1 }
        q.fillStyle = lit(base, 0.5); q.beginPath(); q.arc(C, C, 2, 0, 6.29); q.fill()
        out.push({ crown: cv, shadow: sh }); continue
      }
      if (season === 'winter') {
        // bare deciduous tree: branching twigs from the trunk, a faint haze of fine twigs, snow on the lit side
        const base = pal[v % pal.length]
        q.lineCap = 'round'; sq.lineCap = 'round'; sq.strokeStyle = '#000'
        const branch = (x, y, a, len, w, depth) => {
          const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len
          q.strokeStyle = lit(base, 0.8 + 0.3 * (Math.cos(a) * lx + Math.sin(a) * ly)); q.lineWidth = w
          q.beginPath(); q.moveTo(x, y); q.lineTo(x2, y2); q.stroke()
          sq.lineWidth = w; sq.beginPath(); sq.moveTo(x, y); sq.lineTo(x2, y2); sq.stroke()
          if (depth > 0) { const k = 1 + (Math.random() < 0.5 ? 1 : 0); for (let i = 0; i <= k; i++) branch(x2, y2, a + rnd(-0.6, 0.6), len * rnd(0.55, 0.75), w * 0.62, depth - 1) }
        }
        const m = 5 + (v % 3)
        for (let i = 0; i < m; i++) branch(C, C, i / m * 6.283 + rnd(-0.3, 0.3), rnd(7, 10), 2, 3)
        q.globalCompositeOperation = 'destination-over'
        q.fillStyle = lit(base, 0.9); q.globalAlpha = 0.22; q.beginPath(); q.arc(C, C, 19, 0, 6.29); q.fill(); q.globalAlpha = 1
        q.globalCompositeOperation = 'source-over'
        q.fillStyle = lit([250, 252, 255], 1)
        for (let k = 0; k < 26; k++) { const a = Math.atan2(ly, lx) + rnd(-1.2, 1.2), r = rnd(3, 17); q.globalAlpha = 0.75; q.beginPath(); q.arc(C + Math.cos(a) * r, C + Math.sin(a) * r, rnd(0.6, 1.4), 0, 6.29); q.fill() }
        q.globalAlpha = 1
        out.push({ crown: cv, shadow: sh }); continue
      }
      // broadleaf crown: lobed outline from a few big lobes, filled with small leaf clumps
      const lobes = []
      const nl = 3 + ((Math.random() * 4) | 0), stretch = rnd(0.8, 1.2), rot = rnd(0, 6.28)
      for (let i = 0; i < nl; i++) { const a = rot + i / nl * 6.283 + rnd(-0.4, 0.4), d = rnd(4, 10); lobes.push({ x: C + Math.cos(a) * d * stretch, y: C + Math.sin(a) * d / stretch, r: rnd(9, 14) }) }
      lobes.push({ x: C, y: C, r: rnd(11, 15) })
      const inside = (x, y) => lobes.some(l => (x - l.x) ** 2 + (y - l.y) ** 2 < l.r * l.r)
      const clumps = []
      for (let k = 0; k < 140 && clumps.length < 46; k++) { const x = rnd(4, S - 4), y = rnd(4, S - 4); if (inside(x, y)) clumps.push({ x, y, r: rnd(3.2, 6), c: pal[(Math.random() * pal.length) | 0], blossom: season === 'spring' && v % 2 === 0 && Math.random() < 0.55 }) }
      const main = pal[v % pal.length]
      // dark under-layer (gaps between clumps read as shade inside the crown)
      for (const c of clumps) { q.fillStyle = lit(main, 0.55); q.beginPath(); q.arc(c.x, c.y, c.r + 1.4, 0, 6.29); q.fill(); sq.beginPath(); sq.arc(c.x, c.y, c.r + 1.4, 0, 6.29); sq.fill() }
      // clumps from the shaded side to the sunny side
      clumps.sort((a, b) => (a.x * lx + a.y * ly) - (b.x * lx + b.y * ly))
      for (const c of clumps) {
        const side = ((c.x - C) * lx + (c.y - C) * ly) / 18 // -1 shaded side .. +1 sunny side
        const col = main.map((m, j) => lerp(m, c.c[j], season === 'autumn' ? 0.45 : 0.35))
        const k = 0.82 + 0.28 * clamp(side, -1, 1)
        const gr = q.createRadialGradient(c.x + lx * c.r * 0.45, c.y + ly * c.r * 0.45, c.r * 0.1, c.x, c.y, c.r)
        gr.addColorStop(0, lit(col, k * 1.26)); gr.addColorStop(0.6, lit(col, k)); gr.addColorStop(1, lit(col, k * 0.72))
        q.fillStyle = gr; q.beginPath(); q.arc(c.x, c.y, c.r, 0, 6.29); q.fill()
        if (c.blossom) {
          const bl = v % 4 === 0 ? [248, 206, 220] : [255, 244, 246]
          for (let i = 0; i < 7; i++) { const a = rnd(0, 6.28), rr = Math.sqrt(Math.random()) * c.r * 0.85; q.fillStyle = lit(bl, 0.82 + 0.3 * Math.max(0, Math.cos(a) * lx + Math.sin(a) * ly)); q.beginPath(); q.arc(c.x + Math.cos(a) * rr, c.y + Math.sin(a) * rr, rnd(0.6, 1.2), 0, 6.29); q.fill() }
        }
      }
      // leaf speckle and a soft shade on the far side of the whole crown
      q.globalCompositeOperation = 'source-atop'
      for (let i = 0; i < 160; i++) { const x = rnd(0, S), y = rnd(0, S); q.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,230,0.10)' : 'rgba(0,20,0,0.14)'; q.fillRect(x, y, 1, 1) }
      const gsh = q.createLinearGradient(C + lx * 22, C + ly * 22, C - lx * 22, C - ly * 22)
      gsh.addColorStop(0, 'rgba(0,0,0,0)'); gsh.addColorStop(1, 'rgba(10,20,10,0.28)')
      q.fillStyle = gsh; q.fillRect(0, 0, S, S)
      q.globalCompositeOperation = 'source-over'
      out.push({ crown: cv, shadow: sh })
    }
    return out
  }

  // ---------- puff sprites (per time of day) ----------
  let puffs = null, rainPuffs = null, shadowPuff = null, woolSprite = null
  function makePuffSet (cols) {
    const [hi, mid, sh, base] = cols.map(hex)
    const ls = [-L.sd[0], -L.sd[1]], n = Math.hypot(ls[0], ls[1]) || 1
    const lx = ls[0] / n, ly = ls[1] / n
    const ramp = (t) => { // base -> shade -> mid -> hi
      const k = t * 3, i = Math.min(2, Math.floor(k)), f = k - i, A = [base, sh, mid, hi][i], B = [base, sh, mid, hi][i + 1]
      return [lerp(A[0], B[0], f), lerp(A[1], B[1], f), lerp(A[2], B[2], f)]
    }
    const set = []
    const S = 96
    for (let lev = 0; lev < 3; lev++) { // low, mid, high puffs: higher = brighter
      const vars = []
      for (let v = 0; v < 3; v++) {
        const c = document.createElement('canvas'); c.width = c.height = S
        const q = c.getContext('2d'), img = q.createImageData(S, S), d = img.data
        const o = rnd(0, 500)
        for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
          const dx = (x - S / 2) / (S / 2), dy = (y - S / 2) / (S / 2), r = Math.hypot(dx, dy)
          const nz = fbm(x * 0.075 + o, y * 0.075 + o, 4), nz2 = fbm(x * 0.2 + o, y * 0.2, 2)
          const edge = 0.74 + (nz - 0.5) * 0.5
          let a = clamp((edge - r) / 0.32, 0, 1); a = a * a * (3 - 2 * a) * (0.8 + 0.2 * nz2)
          if (a <= 0.003) continue
          // lit from above and from the sun side; a little inner texture
          const sphere = Math.sqrt(Math.max(0, 1 - r * r))
          let t = 0.42 + (-dy) * 0.32 + (dx * lx + dy * ly) * 0.18 + sphere * 0.16 + (nz - 0.5) * 0.45 + (nz2 - 0.5) * 0.12 + lev * 0.09
          t = clamp(t, 0, 1)
          const col = ramp(t), i = (y * S + x) * 4
          d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = a * 255
        }
        q.putImageData(img, 0, 0)
        vars.push(c)
      }
      set.push(vars)
    }
    // underside haze (soft dark base)
    const c = document.createElement('canvas'); c.width = c.height = 64
    const q = c.getContext('2d'), m = q.createRadialGradient(32, 32, 0, 32, 32, 32)
    m.addColorStop(0, rgb(base, 0.55)); m.addColorStop(0.6, rgb(base, 0.3)); m.addColorStop(1, rgb(base, 0))
    q.fillStyle = m; q.fillRect(0, 0, 64, 64)
    set.push(c)
    return set
  }
  function makeSprites () {
    puffs = makePuffSet(L.cl)
    rainPuffs = makePuffSet(L.night ? ['#9aa6bd', '#6f7b94', '#434d66', '#2a3248'] : RAIN_CL)
    shadowPuff = document.createElement('canvas'); shadowPuff.width = shadowPuff.height = 32
    const q = shadowPuff.getContext('2d'), m = q.createRadialGradient(16, 16, 0, 16, 16, 16)
    m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(0.55, 'rgba(0,0,0,0.75)'); m.addColorStop(1, 'rgba(0,0,0,0)')
    q.fillStyle = m; q.fillRect(0, 0, 32, 32)
    woolSprite = document.createElement('canvas'); woolSprite.width = woolSprite.height = 24
    const w = woolSprite.getContext('2d'), lc = L.light, dim = 1 - L.night * 0.5
    const ls = [-L.sd[0], -L.sd[1]], n = Math.hypot(ls[0], ls[1]) || 1
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * 6.28, x = 12 + Math.cos(a) * 3.5, y = 12 + Math.sin(a) * 2.5
      const gr = w.createRadialGradient(x + ls[0] / n * 2, y + ls[1] / n * 2 - 1, 0.5, x, y, 5.5)
      gr.addColorStop(0, rgb([255 * lc[0] * dim, 252 * lc[1] * dim, 244 * lc[2] * dim])); gr.addColorStop(1, rgb([170 * dim, 166 * dim, 160 * dim]))
      w.fillStyle = gr; w.beginPath(); w.arc(x, y, 5.5, 0, 6.29); w.fill()
    }
  }

  // ---------- clouds ----------
  const clouds = []
  let wind = { x: 9, y: 1.5 }
  function newCloud (x, y, R, small) {
    const c = { x, y, alt: rnd(130, 190), R, vx: 0, vy: 0, p: [], cache: null, rcache: null, dirty: true, rain: 0, rainT: 0, grow: 0, age: 0, churn: rnd(0, 6) }
    const n = small ? 6 : Math.round(clamp(R / 3, 14, 42))
    for (let k = 0; k < n; k++) addPuff(c, k / n)
    return c
  }
  let p_var = 0
  function addPuff (c, u, near) {
    const R = c.R
    let a = rnd(0, 6.28), rr = Math.sqrt(Math.random()) * R * 0.75
    if (near) { a = Math.atan2(near[1], near[0]) + rnd(-0.5, 0.5); rr = rnd(0.4, 0.9) * R }
    const px = Math.cos(a) * rr, py = Math.sin(a) * rr * 0.72
    const centr = 1 - rr / R
    const r = R * rnd(0.24, 0.4) * (0.7 + 0.5 * centr)
    const pz = R * (0.04 + centr * centr * rnd(0.3, 0.6) + rnd(0, 0.06))
    p_var = (p_var + 1) % 3
    c.p.push({ v: p_var, x: px, y: py, z: pz, r, ox: 0, oy: 0, vx: 0, vy: 0, ph: rnd(0, 6.28), born: u === -1 ? 0 : 1 })
  }
  function renderCloud (c, set) {
    let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9
    for (const p of c.p) { const sx = p.x + p.ox, sy = (p.y + p.oy) * 0.62 - p.z; minx = Math.min(minx, sx - p.r); maxx = Math.max(maxx, sx + p.r); miny = Math.min(miny, sy - p.r); maxy = Math.max(maxy, sy + p.r * 1.2) }
    const pad = 4, cw = Math.ceil(maxx - minx + pad * 2 + 20), ch = Math.ceil(maxy - miny + pad * 2 + 20)
    const cv = document.createElement('canvas'); cv.width = Math.max(2, cw); cv.height = Math.max(2, ch)
    const q = cv.getContext('2d'), ox = -minx + pad + 10, oy = -miny + pad + 10
    const ps = c.p.slice().sort((a, b) => (a.z + a.y * 0.25) - (b.z + b.y * 0.25))
    const zmax = c.R * 0.6
    for (const p of ps) { const sx = p.x + p.ox + ox, sy = (p.y + p.oy) * 0.62 - p.z + oy, r = p.r * p.born * 1.15; q.drawImage(set[3], sx - r, sy - r * 0.6, r * 2, r * 1.9) }
    for (const p of ps) {
      const sx = p.x + p.ox + ox, sy = (p.y + p.oy) * 0.62 - p.z + oy, r = p.r * p.born * 0.98
      const lev = clamp(Math.floor(p.z / zmax * 3), 0, 2)
      q.drawImage(set[lev][p.v], sx - r * 1.12, sy - r * 1.12, r * 2.24, r * 2.24)
    }
    return { cv, ox, oy }
  }
  function seedClouds () {
    clouds.length = 0
    const n = Math.round(clamp(W * H / 190000, 5, 10))
    for (let k = 0; k < n; k++) clouds.push(newCloud(rnd(-100, W + 100), rnd(H * 0.05, H * 1.2), rnd(55, 120)))
  }

  // ---------- birds, smoke, rain ----------
  let birds = null, birdT = rnd(8, 20)
  const smoke = [], drops = [], splash = []
  let wet = null, wq = null
  let shadowC = null, sq2 = null

  // ---------- crops: each crop field lives through its year ----------
  // phase 0..1: ploughed · sown · sprouting · growing · ripening · harvest (combine) · stubble + bales · ploughing (tractor)
  const ST = [0, 0.10, 0.18, 0.36, 0.58, 0.74, 0.84, 0.93, 1]
  const CYCLE = 540 // seconds for a whole year on its own
  const LANE = 10
  const COL = { brown: [138, 104, 72], sow: [150, 118, 84], sprout: [156, 190, 96], green: [126, 168, 74], deep: [104, 148, 62], yel: [212, 200, 98], gold: [230, 200, 112], stub: [208, 190, 140] }
  let crops = []
  const dust = []
  function buildCrops () {
    crops = []
    if (!cropMap) return
    const hw = cropHW
    const byG = new Map()
    for (let k = 0; k < cropMap.length; k++) { const gid = cropMap[k]; if (gid < 0) continue; let a = byG.get(gid); if (!a) byG.set(gid, a = []); a.push(k) }
    for (const [gid, pix] of byG) {
      if (pix.length < 250) { for (const k of pix) cropMap[k] = -1; continue }
      const f = fields.find(ff => ff.grp === gid)
      const ca = Math.cos(f.ang), sa = Math.sin(f.ang)
      let bx0 = 1e9, by0 = 1e9, bx1 = -1, by1 = -1, u0 = 1e9, u1 = -1e9
      for (const k of pix) { const px = k % hw, py = (k / hw) | 0; bx0 = Math.min(bx0, px); bx1 = Math.max(bx1, px); by0 = Math.min(by0, py); by1 = Math.max(by1, py); const x = px * 2, y = py * 2, u = x * ca + y * sa; u0 = Math.min(u0, u); u1 = Math.max(u1, u) }
      const bw = bx1 - bx0 + 1, bh = by1 - by0 + 1
      const n = pix.length, U = new Float32Array(n), V = new Float32Array(n), NZ = new Float32Array(n), LI = new Int16Array(n), OFF = new Int32Array(n)
      const lanes = Math.max(1, Math.ceil((u1 - u0) / LANE)), vmin = new Float32Array(lanes).fill(1e9), vmax = new Float32Array(lanes).fill(-1e9)
      pix.forEach((k, i) => {
        const px = k % hw, py = (k / hw) | 0, x = px * 2, y = py * 2
        U[i] = x * ca + y * sa; V[i] = -x * sa + y * ca; NZ[i] = 0.6 * hash(px, py) + 0.4 * fbm(x * 0.05, y * 0.05, 2)
        const li = Math.min(lanes - 1, Math.floor((U[i] - u0) / LANE)); LI[i] = li
        vmin[li] = Math.min(vmin[li], V[i]); vmax[li] = Math.max(vmax[li], V[i])
        OFF[i] = ((py - by0) * bw + (px - bx0)) * 4
      })
      const cum = [0]
      for (let l = 0; l < lanes; l++) cum.push(cum[l] + Math.max(0, vmax[l] - vmin[l]))
      const cv = document.createElement('canvas'); cv.width = bw; cv.height = bh
      const cq = cv.getContext('2d'), img = cq.createImageData(bw, bh)
      crops.push({ gid, pix, n, U, V, NZ, LI, OFF, lanes, vmin, vmax, cum, u0, ca, sa, bx: bx0, by: by0, bw, bh, cv, cq, img,
        ph: Math.random(), rate: rnd(0.85, 1.15) / CYCLE, boost: 0, last: -1, lastVeh: -9, bales: [], veh: null })
    }
    for (const C of crops) { paintCrop(C); C.last = C.ph }
  }
  function cropAt (x, y) {
    if (!cropMap) return null
    const X = Math.round(x / 2), Y = Math.round(y / 2)
    if (X < 0 || Y < 0 || X >= cropHW || Y >= cropHH) return null
    const gid = cropMap[Y * cropHW + X]; if (gid < 0) return null
    return crops.find(c => c.gid === gid) || null
  }
  const stageOf = (ph) => { for (let k = 0; k < 8; k++) if (ph < ST[k + 1]) return k; return 7 }
  // where the machine is: distance along the lanes (boustrophedon)
  function vehicleAt (C, pr) {
    const dist = pr * C.cum[C.lanes]
    let l = 0; while (l < C.lanes - 1 && C.cum[l + 1] < dist) l++
    const along = dist - C.cum[l], fwd = l % 2 === 0
    const v = fwd ? C.vmin[l] + along : C.vmax[l] - along
    const u = C.u0 + (l + 0.5) * LANE
    return { l, v, fwd, u, x: u * C.ca - v * C.sa, y: u * C.sa + v * C.ca, hx: -C.sa * (fwd ? 1 : -1), hy: C.ca * (fwd ? 1 : -1) }
  }
  function paintCrop (C) {
    const ph = C.ph, stg = stageOf(ph), t = (ph - ST[stg]) / (ST[stg + 1] - ST[stg])
    const d = C.img.data
    let veh = null
    if (stg === 5 || stg === 7) veh = vehicleAt(C, t)
    const B = COL.brown, SO = COL.sow, SP = COL.sprout, GR = COL.green, DE = COL.deep, YE = COL.yel, GO = COL.gold, SB = COL.stub
    const PALE = [200, 186, 142]
    // per-stage colour helpers write into r,g,b (no allocations in the loop)
    let r = 0, gg = 0, bb = 0
    const mix = (a, b2, k) => { r = a[0] + (b2[0] - a[0]) * k; gg = a[1] + (b2[1] - a[1]) * k; bb = a[2] + (b2[2] - a[2]) * k }
    const mixTo = (b2, k) => { r += (b2[0] - r) * k; gg += (b2[1] - gg) * k; bb += (b2[2] - bb) * k }
    const vl = veh ? veh.l : -1, vv = veh ? veh.v : 0, vf = veh ? veh.fwd : true
    for (let i = 0; i < C.n; i++) {
      const u = C.U[i], nz = C.NZ[i]
      const furrow = Math.sin(u * 1.15), rows = 0.5 + 0.5 * Math.sin(u * 0.85)
      let amp = 0
      const li = C.LI[i]
      const done = veh ? (li < vl || (li === vl && (vf ? C.V[i] < vv : C.V[i] > vv))) : false
      if (stg === 0 || (stg === 7 && done)) { r = B[0]; gg = B[1]; bb = B[2]; amp = 0.14 * furrow }
      else if (stg === 1) { mix(B, SO, t); amp = 0.14 * furrow + (0.07 * (rows * 2 - 1) - 0.14 * furrow) * t }
      else if (stg === 2) { const w = clamp(t * 1.5 - (1 - rows) * 0.7 + (nz - 0.5) * 0.3, 0, 1); mix(SO, SP, w); amp = 0.05 * (rows * 2 - 1) * (1 - w) }
      else if (stg === 3) { mix(SP, GR, Math.min(1, t * 2)); if (t > 0.5) mixTo(DE, (t - 0.5) * 2); amp = 0.035 * (rows * 2 - 1) + (nz - 0.5) * 0.08 }
      else if (stg === 4) { const k = clamp(t + (nz - 0.5) * 0.3, 0, 1); if (k < 0.5) mix(DE, YE, k * 2); else mix(YE, GO, (k - 0.5) * 2); amp = 0.04 * (rows * 2 - 1) + (nz - 0.5) * 0.08 }
      else if (stg === 5 && !done) { r = GO[0]; gg = GO[1]; bb = GO[2]; amp = 0.04 * (rows * 2 - 1) + (nz - 0.5) * 0.08 }
      else { // stubble (after the combine, during stubble, ahead of the plough)
        r = SB[0]; gg = SB[1]; bb = SB[2]; amp = (li % 2 ? 0.05 : -0.05) + 0.03 * furrow
        if (stg === 6) mixTo(PALE, t * 0.5); else if (stg === 7) mixTo(PALE, 0.5)
      }
      const m = (1 + amp) * (0.94 + nz * 0.12) * (1.06 - L.night * 0.16)
      const o = C.OFF[i]
      d[o] = r * m; d[o + 1] = gg * m; d[o + 2] = bb * m; d[o + 3] = 255
    }
    C.cq.putImageData(C.img, 0, 0)
    C.veh = veh ? { ...veh, kind: stg === 5 ? 'combine' : 'tractor' } : null
  }
  function updateCrops (dt, restG) {
    if (season === 'winter') { for (const C of crops) C.veh = null; return }
    for (const C of crops) {
      C.boost = lerp(C.boost, C === restG ? 1 : 0, Math.min(1, dt * (C === restG ? 1.2 : 2.5)))
      const stg = stageOf(C.ph), machine = stg === 5 || stg === 7
      const mult = 1 + C.boost * (machine ? 4 : 24)
      const before = C.ph
      C.ph += C.rate * mult * dt
      if (C.ph >= 1) C.ph -= 1
      const nstg = stageOf(C.ph)
      if (stageOf(before) === 5 && nstg === 6) { // harvest done: round bales
        C.bales = []
        const nb = clamp(Math.round(C.n / 380), 3, 10)
        for (let k = 0; k < nb; k++) { const i = (Math.random() * C.n) | 0, px = C.pix[i] % cropHW, py = (C.pix[i] / cropHW) | 0; C.bales.push({ x: px * 2, y: py * 2, a: Math.atan2(C.ca, -C.sa) + rnd(-0.3, 0.3) }) }
      }
      if (nstg === 7 || nstg < 6) C.bales.length = 0
      // machine dust
      if (C.veh && Math.random() < dt * (C.boost > 0.5 ? 18 : 6)) {
        const v = C.veh
        dust.push({ x: v.x - v.hx * 7 + rnd(-2, 2), y: v.y - v.hy * 7 + rnd(-2, 2), t: 0, chaff: v.kind === 'combine' })
      }
      // a sprinkle of tiny motes while a field is racing through its year
      if (C.boost > 0.4 && Math.random() < dt * 10 * C.boost) { const i = (Math.random() * C.n) | 0; dust.push({ x: (C.pix[i] % cropHW) * 2, y: ((C.pix[i] / cropHW) | 0) * 2, t: 0, mote: true }) }
    }
    for (let i = dust.length - 1; i >= 0; i--) { const p = dust[i]; p.t += dt; if (p.mote) p.y -= 10 * dt; else { p.x += wind.x * 0.5 * dt; p.y += wind.y * 0.5 * dt } if (p.t > (p.mote ? 1.4 : 2.2)) dust.splice(i, 1) }
    // repaint the fields that changed (a few per frame)
    let budget = 1 + (restG ? 1 : 0)
    const order = crops.slice().sort((a, b) => Math.abs(b.ph - b.last) - Math.abs(a.ph - a.last))
    for (const C of order) {
      if (budget <= 0) break
      const stg = stageOf(C.ph), machine = stg === 5 || stg === 7
      const moved = machine ? Math.abs(C.ph - C.last) * C.cum[C.lanes] / (ST[stg + 1] - ST[stg]) > 3 : Math.abs(C.ph - C.last) > (C.boost > 0.3 ? 0.003 : 0.005)
      if (C.last < 0 || moved || (machine && !C.veh) || (!machine && C.veh)) { paintCrop(C); C.last = C.ph; budget-- }
    }
  }
  function drawCrops (layer) {
    if (season === 'winter') return
    if (layer) {
      g.globalCompositeOperation = 'multiply'
      for (const C of crops) g.drawImage(C.cv, C.bx * 2, C.by * 2, C.bw * 2, C.bh * 2)
      g.globalCompositeOperation = 'source-over'
      return
    }
    const lc = L.light, dm = 1 - L.night * 0.5, sdx = L.sd[0], sdy = L.sd[1]
    const tone = (c, k = 1) => rgb([c[0] * lc[0] * dm * k, c[1] * lc[1] * dm * k, c[2] * lc[2] * dm * k])
    // round bales
    for (const C of crops) {
      if (!C.bales.length) continue
      const stg = stageOf(C.ph), t = (C.ph - ST[stg]) / (ST[stg + 1] - ST[stg])
      const a = stg === 6 ? clamp(Math.min(t * 6, (1 - t) * 4), 0, 1) : 0
      if (a <= 0) continue
      g.globalAlpha = a
      for (const b of C.bales) {
        g.save(); g.translate(b.x, b.y); g.rotate(b.a)
        g.fillStyle = 'rgba(25,30,20,0.35)'; g.beginPath(); g.ellipse(sdx * 3, sdy * 3 + 1, 5, 3.6, 0, 0, 6.29); g.fill()
        g.fillStyle = tone([206, 176, 102]); g.fillRect(-4.5, -3.2, 9, 6.4)
        g.fillStyle = tone([236, 214, 150]); g.fillRect(-4.5, -3.2, 9, 2.6)
        g.fillStyle = tone([186, 152, 84]); g.beginPath(); g.ellipse(4.5, 0, 1.4, 3.2, 0, 0, 6.29); g.fill()
        g.fillStyle = tone([226, 196, 124]); g.beginPath(); g.ellipse(-4.5, 0, 1.4, 3.2, 0, 0, 6.29); g.fill()
        g.restore()
      }
      g.globalAlpha = 1
    }
    // dust, chaff and growth motes
    for (const p of dust) {
      if (p.mote) { const a = Math.sin(p.t / 1.4 * Math.PI) * 0.8; g.fillStyle = `rgba(255,246,190,${a})`; g.fillRect(p.x, p.y, 1.6, 1.6); continue }
      const a = (1 - p.t / 2.2) * 0.3, r = 2 + p.t * 4
      g.fillStyle = p.chaff ? `rgba(240,222,160,${a})` : `rgba(150,118,84,${a})`
      g.beginPath(); g.arc(p.x, p.y, r, 0, 6.29); g.fill()
    }
    // the machines: a combine at harvest, a tractor with a plough after
    for (const C of crops) {
      const v = C.veh; if (!v) continue
      const ang = Math.atan2(v.hy, v.hx)
      g.save(); g.translate(v.x, v.y); g.rotate(ang)
      g.fillStyle = 'rgba(20,26,20,0.4)'; g.fillRect(-7 + sdx * 3, -4.5 + sdy * 3, 14, 9)
      if (L.night > 0.5) { const gr = g.createRadialGradient(14, 0, 1, 14, 0, 18); gr.addColorStop(0, 'rgba(255,230,160,0.55)'); gr.addColorStop(1, 'rgba(255,220,150,0)'); g.fillStyle = gr; g.fillRect(-4, -18, 36, 36) }
      if (v.kind === 'combine') {
        g.fillStyle = tone([96, 92, 80]); g.fillRect(6, -6.5, 2.4, 13)          // header across the cut
        g.fillStyle = tone([212, 176, 62]); g.fillRect(-7, -4, 13, 8)           // body
        g.fillStyle = tone([236, 206, 96]); g.fillRect(-7, -4, 13, 3)
        g.fillStyle = tone([60, 70, 80]); g.fillRect(0, -2.4, 4, 4.8)           // cab roof
        g.fillStyle = tone([170, 140, 50]); g.fillRect(-6, 3.5, 8, 1.6)          // unloading auger
      } else {
        g.fillStyle = tone([120, 120, 118]); g.fillRect(-12, -4.5, 5, 9)         // plough
        g.fillStyle = tone([60, 60, 58]); g.fillRect(-5, -4.6, 3.2, 9.2); g.fillRect(3, -3.6, 2.4, 7.2) // wheels
        g.fillStyle = tone([178, 58, 44]); g.fillRect(-4, -2.8, 10, 5.6)         // body
        g.fillStyle = tone([210, 92, 70]); g.fillRect(-4, -2.8, 10, 2)
        g.fillStyle = tone([60, 70, 80]); g.fillRect(-3.5, -2.2, 3.4, 4.4)       // cab roof
      }
      g.restore()
    }
  }

  // ---------- greeting, farmer, hay (camera hand) ----------
  const greet = { t: 0 }
  let farmer = null
  const hay = [], hearts = []
  const cam = { x: 0, y: 0, t: -9, prog: 0, amt: 0 }
  function farmHouse () { return houses.find(h => h.chimney) || houses[0] }
  function waveHello () {
    greet.t = 8
    for (const s of sheep) if (s.st === 'graze' || s.st === 'walk' || s.st === 'lie') { s.look = 0; s.lookDelay = rnd(0, 0.9) }
    const h = farmHouse(); if (!h) return
    if (!farmer) {
      const door = { x: h.x + Math.sin(h.a) * -(h.d / 2 + 3), y: h.y + Math.cos(h.a) * (h.d / 2 + 3) }
      let sx = door.x, sy = door.y + 34
      if (Math.abs(sy - riverY(sx)) < 24) sy = door.y - 34
      farmer = { x: door.x, y: door.y, hx: door.x, hy: door.y, tx: sx, ty: sy, st: 'out', t: 0, wave: 0, walk: 0 }
    } else if (farmer.st === 'wave' || farmer.st === 'back') { farmer.st = 'wave'; farmer.t = 0 }
  }
  function feedAt (x, y) {
    x = clamp(x, 30, W - 30); y = clamp(y, 30, H - 30)
    // keep hay off the river and the lane
    for (let k = 0; k < 20 && Math.abs(y - riverY(x)) < 24; k++) y += y > riverY(x) ? 4 : -4
    const strands = []
    for (let k = 0; k < 70; k++) { const a = rnd(0, 6.28), r = Math.sqrt(Math.random()) * 15; strands.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r * 0.75, z: rnd(40, 90), vz: 0, a: rnd(0, 3.14), l: rnd(5, 9), c: Math.random() }) }
    const pile = { x, y, amt: 1, strands, eaters: 0 }
    hay.push(pile); if (hay.length > 3) hay.shift()
    // the nearest sheep (up to two flocks) trot over
    const near = sheep.map(s => ({ s, d: Math.hypot(s.x - x, s.y - y) })).filter(o => o.d < Math.max(W, H) * 0.45).sort((a, b) => a.d - b.d).slice(0, 14)
    near.forEach((o, i) => {
      const s = o.s, a = (i / near.length) * 6.283 + rnd(-0.2, 0.2), r = rnd(17, 24) + (i > 8 ? 9 : 0)
      s.st = 'feed'; s.pile = pile; s.tx = x + Math.cos(a) * r; s.ty = y + Math.sin(a) * r * 0.8; s.t = 30; s.lie = 0; s.look = 0
    })
  }
  function onHand (e) {
    if (e.type === 'wave') waveHello()
    else if (e.type === 'feed') feedAt(e.x * W, e.y * H)
    else if (e.type === 'hand') { cam.x = e.x * W; cam.y = e.y * H; cam.t = now; cam.prog = e.progress || 0; cam.amt = e.amount || 0 }
  }
  function updateExtras (dt) {
    greet.t = Math.max(0, greet.t - dt)
    for (const s of sheep) {
      if (s.lookDelay > 0) { s.lookDelay -= dt; continue }
      const want = greet.t > 0 && (s.st === 'graze' || s.st === 'walk' || s.st === 'lie') ? 1 : 0
      s.look = lerp(s.look || 0, want, dt * 3)
      if (want && s.st === 'walk') { s.st = 'graze'; s.t = greet.t + rnd(0.5, 2) }
    }
    if (farmer) {
      const f = farmer
      const go = (tx, ty, sp) => { const dx = tx - f.x, dy = ty - f.y, d = Math.hypot(dx, dy); if (d > 0.8) { f.x += dx / d * sp * dt; f.y += dy / d * sp * dt; f.walk += dt; f.face = Math.atan2(dy, dx); return false } return true }
      if (f.st === 'out') { if (go(f.tx, f.ty, 16)) { f.st = 'wave'; f.t = 0 } }
      else if (f.st === 'wave') { f.t += dt; f.wave = Math.min(1, f.wave + dt * 4); if (f.t > 4.5) { f.st = 'back'; f.wave = 0 } }
      else if (f.st === 'back') { if (go(f.hx, f.hy, 14)) farmer = null }
    }
    for (let i = hay.length - 1; i >= 0; i--) {
      const p = hay[i]
      for (const st of p.strands) if (st.z > 0) { st.vz += 160 * dt; st.z = Math.max(0, st.z - st.vz * dt); st.x += wind.x * 0.25 * dt * (st.z > 0 ? 1 : 0); st.a += dt * 2 * (st.z > 0 ? 1 : 0) }
      p.eaters = sheep.filter(s => s.pile === p && s.st === 'eat').length
      p.amt -= p.eaters * 0.0028 * dt
      if (p.amt <= 0) {
        hay.splice(i, 1)
        for (const s of sheep) if (s.pile === p) { s.pile = null; s.st = 'graze'; s.t = rnd(2, 6); s.fl.x = lerp(s.fl.x, p.x, 0.7); s.fl.y = lerp(s.fl.y, p.y, 0.7) }
      } else if (p.eaters && Math.random() < dt * 0.5) {
        const e = sheep.filter(s => s.pile === p && s.st === 'eat'); const s = e[(Math.random() * e.length) | 0]
        hearts.push({ x: s.x, y: s.y - 10, t: 0 })
      }
    }
    for (let i = hearts.length - 1; i >= 0; i--) { hearts[i].t += dt; hearts[i].y -= 9 * dt; if (hearts[i].t > 2.2) hearts.splice(i, 1) }
  }

  // ---------- hand ----------
  const hand = { x: -1e4, y: -1e4, px: 0, py: 0, vx: 0, vy: 0, inside: false, still: 0, lastMove: 0, held: null, spawnT: 0 }
  function onPointer (e) {
    const r = container.getBoundingClientRect()
    const x = e.x - (e.clientMode ? r.left : 0), y = e.y - (e.clientMode ? r.top : 0)
    if (e.type === 'move') {
      if (hand.inside) { hand.vx = lerp(hand.vx, (x - hand.x) * 60, 0.5); hand.vy = lerp(hand.vy, (y - hand.y) * 60, 0.5) }
      if (!hand.inside || Math.hypot(x - hand.x, y - hand.y) > 2) { hand.still = 0; hand.held = null }
      hand.x = x; hand.y = y; hand.inside = true; hand.lastMove = now
    } else if (e.type === 'down') {
      hand.x = x; hand.y = y; hand.inside = true
      click(x, y)
    }
  }
  function cloudAt (x, y, slack = 0) {
    let best = null, bd = 1e9
    for (const c of clouds) { const d = Math.hypot((x - c.x) / 1.0, (y - (c.y - c.alt)) / 0.7); if (d < c.R * 0.95 + slack && d < bd) { bd = d; best = c } }
    return best
  }
  function click (x, y) {
    const c = cloudAt(x, y, 20)
    if (c) { c.rainT = rnd(6, 8); return }
    if (clouds.length < 14) { const nc = newCloud(x, y + 160, 40, true); nc.alt = 160; nc.grow = 2.5; clouds.push(nc) }
  }

  // ---------- size ----------
  function resize () {
    const r = container.getBoundingClientRect()
    const nw = Math.max(320, Math.round(r.width)), nh = Math.max(200, Math.round(r.height))
    if (nw === W && nh === H) return
    W = nw; H = nh; canvas.width = W; canvas.height = H
    layout(); makeSprites(); cropMap = null; ground = paintGround(); buildCrops(); prevGround = null; fadeT = 1
    shadowC = document.createElement('canvas'); shadowC.width = Math.ceil(W / 4); shadowC.height = Math.ceil(H / 4); sq2 = shadowC.getContext('2d')
    wet = document.createElement('canvas'); wet.width = Math.ceil(W / 6); wet.height = Math.ceil(H / 6); wq = wet.getContext('2d')
    seedClouds(); for (const c of clouds) c.dirty = true
  }

  let seasonOverride = null
  function setSeason (sn, manual) {
    if (!SEASONS.includes(sn) || sn === season) return
    if (manual) seasonOverride = sn
    season = sn; flakes.length = 0
    if (W) refreshGround()
  }
  function setTod (t) {
    if (!TODS[t] || t === tod) return
    tod = t; L = TODS[t]
    if (!W) return
    refreshGround()
  }
  function refreshGround () {
    if (ground) {
      const snap = document.createElement('canvas'); snap.width = W; snap.height = H
      const keepG = g; g = snap.getContext('2d')
      g.drawImage(ground.base, 0, 0); drawCrops(true); g.drawImage(ground.top, 0, 0); g.drawImage(ground.fx, 0, 0)
      g = keepG; prevGround = snap
    }
    ground = paintGround(); fadeT = 0
    for (const C of crops) C.last = -1
    makeSprites(); for (const c of clouds) { c.dirty = true; c.rcache = null }
  }

  // ---------- seasonal particles ----------
  const flakes = []
  function updateSeason (dt) {
    if (season === 'winter') {
      const want = Math.round(W * H / 7000)
      while (flakes.length < want) flakes.push({ x: rnd(0, W), y: rnd(-20, H), v: rnd(14, 34), s: rnd(1, 2.4), ph: rnd(0, 6.28), k: 'snow' })
      for (const f of flakes) { f.y += f.v * dt; f.x += (wind.x * 0.8 + Math.sin(now * 0.8 + f.ph) * 6) * dt; if (f.y > H + 5) { f.y = -5; f.x = rnd(0, W) } if (f.x > W + 5) f.x = -5 }
      return
    }
    if (season === 'autumn' || season === 'spring') {
      const rate = season === 'autumn' ? 2.2 : 1.2
      if (trees.length && Math.random() < dt * rate * Math.min(3, W / 600)) {
        const t = trees[(Math.random() * trees.length) | 0]
        flakes.push({ x: t.x + rnd(-4, 4), y: t.y, z: rnd(8, 18), vz: rnd(4, 8), a: rnd(0, 6.28), sp: rnd(2, 5), t: 0, k: season === 'autumn' ? 'leaf' : 'petal', c: Math.random() })
      }
      for (let i = flakes.length - 1; i >= 0; i--) {
        const f = flakes[i]; f.t += dt
        if (f.z > 0) { f.z = Math.max(0, f.z - f.vz * dt); f.x += wind.x * 1.6 * dt + Math.sin(f.t * 3 + f.a) * 8 * dt; f.y += wind.y * 1.6 * dt; f.a += f.sp * dt }
        if (f.t > 12) flakes.splice(i, 1)
      }
    } else flakes.length = 0
  }
  function drawSeason (top) {
    if (!flakes.length) return
    const lc = L.light, dm = 1 - L.night * 0.5
    if (season === 'winter') {
      if (!top) return
      g.fillStyle = L.night ? 'rgba(215,226,255,0.7)' : 'rgba(255,255,255,0.8)'
      for (const f of flakes) g.fillRect(f.x, f.y, f.s, f.s)
      return
    }
    if (top) return
    for (const f of flakes) {
      const fade = Math.min(1, (12 - f.t) / 2)
      const col = f.k === 'leaf' ? (f.c < 0.33 ? [196, 98, 40] : f.c < 0.66 ? [214, 158, 58] : [168, 64, 40]) : (f.c < 0.5 ? [250, 210, 222] : [255, 244, 246])
      const y = f.y - f.z
      if (f.z > 0) { g.fillStyle = 'rgba(20,30,20,0.18)'; g.fillRect(f.x + L.sd[0] * f.z * 0.6, f.y + L.sd[1] * f.z * 0.6, 2, 1.4) }
      g.fillStyle = rgb([col[0] * lc[0] * dm, col[1] * lc[1] * dm, col[2] * lc[2] * dm], 0.95 * fade)
      g.beginPath(); g.ellipse(f.x, y, f.k === 'leaf' ? 2.2 : 1.6, Math.abs(Math.cos(f.a)) * 1.3 + 0.4, f.a, 0, 6.29); g.fill()
    }
  }

  // ---------- update ----------
  let now = 0, last = 0, autoRainT = rnd(25, 45), frame = 0
  function update (dt) {
    const t = now
    wind.x = 9 + 4 * Math.sin(t * 0.03); wind.y = 1.5 + 2 * Math.sin(t * 0.021 + 1)
    // hand state
    if (hand.inside && now - hand.lastMove > 0.12) { hand.vx *= 0.8; hand.vy *= 0.8 }
    const speed = Math.hypot(hand.vx, hand.vy)
    if (hand.inside && speed < 25) hand.still += dt; else hand.still = 0
    // resting hand: gather a cloud
    // resting hand on a crop field: that field races through its year
    const restG = hand.inside && hand.still > 0.8 ? cropAt(hand.x, hand.y) : null
    updateCrops(dt, restG)
    for (const c of clouds) {
      c.age += dt
      // drift with the wind, ease toward it
      c.vx = lerp(c.vx, wind.x * (220 / c.alt), dt * 0.4); c.vy = lerp(c.vy, wind.y, dt * 0.4)
      // moving hand = wind
      const sx = c.x, sy = c.y - c.alt
      if (hand.inside && speed > 40) {
        const d = Math.hypot(hand.x - sx, hand.y - sy), fall = clamp(1 - d / (c.R + 180), 0, 1)
        if (fall > 0) {
          c.vx += hand.vx * fall * dt * 0.9; c.vy += hand.vy * fall * dt * 0.9
          for (const p of c.p) { // tear the puffs near the hand
            const px = sx + p.x + p.ox, py = sy + (p.y + p.oy) * 0.62 - p.z, pd = Math.hypot(hand.x - px, hand.y - py)
            const f = clamp(1 - pd / 120, 0, 1); if (f > 0) { p.vx += hand.vx * f * dt * 1.6; p.vy += hand.vy * f * dt * 1.6 / 0.62 }
          }
        }
      }
      // held by a resting hand: drift over it and grow
      if (c === hand.held) {
        const tx = hand.x, ty = hand.y + c.alt
        c.vx = lerp(c.vx, (tx - c.x) * 0.5, dt * 1.5); c.vy = lerp(c.vy, (ty - c.y) * 0.5, dt * 1.5)
        if (hand.still < 30 && c.R < 140) { c.grow += dt * 1.6 }
      }
      if (c.grow > 0) {
        const step = Math.min(c.grow, dt * 1.2); c.grow -= step
        const old = c.R; c.R = Math.min(150, c.R + step * 9)
        const k = c.R / old; for (const p of c.p) { p.x *= k; p.y *= k; p.z *= k; p.r *= k }
        if (c.p.length < 30 && Math.random() < step * 2.2) addPuff(c, -1, c === hand.held ? null : null)
        c.dirty = true
      }
      c.x += c.vx * dt; c.y += c.vy * dt
      // puffs: spring back, gently churn, born puffs swell in
      let moved = false
      for (const p of c.p) {
        p.vx -= p.ox * 1.6 * dt; p.vy -= p.oy * 1.6 * dt
        p.vx *= 1 - dt * 1.4; p.vy *= 1 - dt * 1.4
        p.ox += p.vx * dt; p.oy += p.vy * dt
        if (p.born < 1) { p.born = Math.min(1, p.born + dt * 0.6); moved = true }
        if (Math.abs(p.vx) + Math.abs(p.vy) > 0.4) moved = true
      }
      if (moved) c.dirty = true
      // rain
      if (c.rainT > 0) { c.rainT -= dt; c.rain = Math.min(1, c.rain + dt * 0.8) } else c.rain = Math.max(0, c.rain - dt * 0.4)
      // wrap: leaving downwind -> come back upwind with a new shape
      const m = 260
      if (c.x - c.R > W + m || c.x + c.R < -m || c.y - c.alt - c.R > H + m || c.y - c.alt + c.R * 3 < -m - 120) {
        if (clouds.length > Math.round(clamp(W * H / 190000, 5, 10)) && c !== hand.held) { c.dead = true; continue }
        const R = rnd(55, 120), nc = newCloud(-m * 0.6 - R, rnd(H * 0.05, H * 1.2), R)
        Object.assign(c, nc)
      }
    }
    for (let i = clouds.length - 1; i >= 0; i--) if (clouds[i].dead) clouds.splice(i, 1)
    // the occasional passing shower on its own
    autoRainT -= dt
    if (autoRainT < 0) { autoRainT = season === 'summer' ? rnd(80, 140) : rnd(35, 70); const vis = clouds.filter(c => c.x > W * 0.15 && c.x < W * 0.85 && c.y > H * 0.2 && c.y < H && c.R > 80); if (vis.length) vis[(Math.random() * vis.length) | 0].rainT = rnd(5, 8) }
    // raindrops + wet ground
    for (const c of clouds) {
      if (c.rain <= 0.02) continue
      const n = c.rain * c.R * 0.9 * dt
      for (let k = 0; k < n; k++) {
        const a = rnd(0, 6.28), rr = Math.sqrt(Math.random()) * c.R * 0.65
        const gx = c.x + Math.cos(a) * rr, gy = c.y + Math.sin(a) * rr * 0.6
        drops.push({ x: gx, y: gy - c.alt + c.R * 0.15, gy, v: season === 'winter' ? rnd(70, 110) : rnd(380, 460) })
      }
      wq.globalAlpha = Math.min(1, c.rain * dt * 1.4)
      wq.fillStyle = '#000'; wq.beginPath(); wq.ellipse(c.x / 6, c.y / 6, c.R * 0.7 / 6, c.R * 0.42 / 6, 0, 0, 6.29); wq.fill()
      wq.globalAlpha = 1
    }
    if (frame % 10 === 0) { wq.globalCompositeOperation = 'destination-out'; wq.fillStyle = 'rgba(0,0,0,0.012)'; wq.fillRect(0, 0, wet.width, wet.height); wq.globalCompositeOperation = 'source-over' }
    for (let i = drops.length - 1; i >= 0; i--) { const d = drops[i]; d.y += d.v * dt; d.x += wind.x * dt; if (d.y >= d.gy) { if (Math.random() < 0.4) splash.push({ x: d.x, y: d.gy, t: 0 }); drops.splice(i, 1) } }
    for (let i = splash.length - 1; i >= 0; i--) { splash[i].t += dt; if (splash[i].t > 0.35) splash.splice(i, 1) }
    // sheep
    for (const s of sheep) updateSheep(s, dt, speed)
    updateSeason(dt)
    if (frame % 120 === 0 && !forced && seasonOverride === null) { const ns = seasonForToday(); if (ns !== season) setSeason(ns) }
    updateExtras(dt)
    // birds
    birdT -= dt
    if (!birds && birdT < 0) {
      const fromLeft = Math.random() < 0.7, y0 = rnd(H * 0.15, H * 0.75), n = 5 + ((Math.random() * 4) | 0), vx = (fromLeft ? 1 : -1) * rnd(60, 80), vy = rnd(-12, 12)
      birds = { alt: rnd(70, 110), list: [] }
      for (let k = 0; k < n; k++) { const side = k % 2 ? 1 : -1, rank = Math.ceil(k / 2); birds.list.push({ x: (fromLeft ? -40 : W + 40) - Math.sign(vx) * rank * 16, y: y0 + side * rank * 11, vx, vy, ph: rnd(0, 6) }) }
    }
    if (birds) {
      let alive = false
      for (const b of birds.list) {
        b.x += b.vx * dt; b.y += b.vy * dt; b.ph += dt * 7
        if (hand.inside && Math.hypot(hand.x - b.x, hand.y - (b.y - birds.alt)) < 70 && speed > 60) { b.vy += (b.y - birds.alt - hand.y > 0 ? 1 : -1) * 120 * dt }
        if (b.x > -80 && b.x < W + 80) alive = true
      }
      if (!alive) { birds = null; birdT = rnd(25, 50) }
    }
    // chimney smoke
    if (frame % 14 === 0) for (const h of houses) if (h.chimney) smoke.push({ x: h.x + Math.cos(h.a) * (h.w / 2 - 4), y: h.y + Math.sin(h.a) * (h.w / 2 - 4), z: 4, t: 0, r: 2 })
    for (let i = smoke.length - 1; i >= 0; i--) { const p = smoke[i]; p.t += dt; p.z += 9 * dt; p.x += wind.x * 0.9 * dt; p.y += wind.y * 0.9 * dt; p.r += 1.4 * dt; if (p.t > 4) smoke.splice(i, 1) }
  }

  function rainOn (x, y) {
    for (const c of clouds) { if (c.rain < 0.3) continue; const dx = (x - c.x) / (c.R * 0.75), dy = (y - c.y) / (c.R * 0.45); if (dx * dx + dy * dy < 1.4) return true }
    return false
  }
  function updateSheep (s, dt, speed) {
    s.t -= dt; s.bob += dt
    const night = L.night > 0.9
    // quick hand nearby: shy away
    const hd = Math.hypot(hand.x - s.x, hand.y - s.y)
    if (hand.inside && hd < 70 && speed > 120 && s.st !== 'flee') { s.st = 'flee'; s.t = rnd(0.8, 1.4); const a = Math.atan2(s.y - hand.y, s.x - hand.x) + rnd(-0.4, 0.4); s.tx = s.x + Math.cos(a) * 50; s.ty = s.y + Math.sin(a) * 50; s.lie = 0 }
    if (s.st === 'feed' || s.st === 'eat') {
      if (!s.pile || !hay.includes(s.pile)) { s.st = 'graze'; s.pile = null; s.t = rnd(1, 4) }
      else if (s.st === 'feed') {
        const dx = s.tx - s.x, dy = s.ty - s.y, d = Math.hypot(dx, dy)
        if (d > 1.2) { const ta = Math.atan2(dy, dx); let da = ta - s.h; while (da > Math.PI) da -= 6.283; while (da < -Math.PI) da += 6.283; s.h += da * Math.min(1, dt * 6); const sp = d > 40 ? 24 : 12; s.x += Math.cos(s.h) * sp * dt; s.y += Math.sin(s.h) * sp * dt }
        else s.st = 'eat'
      } else {
        const ta = Math.atan2(s.pile.y - s.y, s.pile.x - s.x); let da = ta - s.h; while (da > Math.PI) da -= 6.283; while (da < -Math.PI) da += 6.283; s.h += da * Math.min(1, dt * 3)
      }
      return
    }
    if (s.st !== 'flee' && rainOn(s.x, s.y) && s.st !== 'shelter') {
      let best = null, bd = 1e9; for (const tr of trees) { const d = Math.hypot(tr.x - s.x, tr.y - s.y); if (d < bd && !rainOn(tr.x, tr.y)) { bd = d; best = tr } }
      if (best && bd < 220) { s.st = 'shelter'; s.tx = best.x + rnd(-6, 6); s.ty = best.y + rnd(-4, 6); s.t = 12; s.lie = 0 }
    }
    const resting = night
    if (s.st === 'graze' || s.st === 'lie') {
      if (resting) { s.st = 'lie'; s.lie = Math.min(1, s.lie + dt * 0.8) } else { s.lie = Math.max(0, s.lie - dt * 0.8); if (s.st === 'lie' && s.lie <= 0) s.st = 'graze' }
      if (s.st === 'graze' && s.t < 0) {
        const fl = s.fl, a = rnd(0, 6.28), rr = Math.sqrt(Math.random()) * fl.r
        s.tx = fl.x + Math.cos(a) * rr; s.ty = fl.y + Math.sin(a) * rr * 0.8
        s.st = 'walk'; s.t = rnd(2, 5)
      }
    }
    if (s.st === 'walk' || s.st === 'flee' || s.st === 'shelter') {
      const dx = s.tx - s.x, dy = s.ty - s.y, d = Math.hypot(dx, dy)
      const sp = s.st === 'flee' ? 46 : s.st === 'shelter' ? 26 : 7
      if (d > 1.5) { const ta = Math.atan2(dy, dx); let da = ta - s.h; while (da > Math.PI) da -= 6.283; while (da < -Math.PI) da += 6.283; s.h += da * Math.min(1, dt * 6); s.x += Math.cos(s.h) * sp * dt; s.y += Math.sin(s.h) * sp * dt }
      if (d <= 1.5 || s.t < 0) {
        if (s.st === 'shelter' && rainOn(s.tx, s.ty) === false && rainOn(s.x, s.y)) { s.t = 3 } else if (s.st === 'shelter' && !rainOn(s.fl.x, s.fl.y) && s.t < 0) { s.st = 'walk'; s.tx = s.fl.x + rnd(-10, 10); s.ty = s.fl.y + rnd(-8, 8); s.t = 20 } else if (s.st !== 'shelter') { s.st = 'graze'; s.t = rnd(3, 9) }
      }
      if (s.st === 'shelter') s.t -= 0
    }
  }

  // ---------- draw ----------
  const sdxG = () => L.sd[0], sdyG = () => L.sd[1]
  function draw () {
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'
    g.drawImage(ground.base, 0, 0)
    drawCrops(true)
    g.drawImage(ground.top, 0, 0)
    g.drawImage(ground.fx, 0, 0)
    if (prevGround && fadeT < 1) { g.globalAlpha = 1 - fadeT; g.drawImage(prevGround, 0, 0); g.globalAlpha = 1 }
    drawCrops(false)
    // wet fields
    g.globalCompositeOperation = 'multiply'; g.globalAlpha = season === 'winter' ? 0 : 0.28
    g.drawImage(wet, 0, 0, W, H)
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'
    // river glints
    const lc = L.light
    g.fillStyle = rgb([255 * lc[0], 250 * lc[1], 230 * lc[2]])
    for (let x = 6; x < W; x += 23) {
      const k = Math.sin(now * 1.7 + x * 0.37) * Math.sin(now * 0.9 + x * 0.11)
      if (k > 0.55) { g.globalAlpha = (k - 0.55) * 1.6 * (L.night ? 0.5 : 0.8); const y = riverY(x) + Math.sin(x * 1.3) * 4; g.fillRect(x, y, 3, 1) }
    }
    g.globalAlpha = 1
    // night: farm window light
    if (L.night > 0.2) {
      for (const h of houses) {
        const fl = 0.8 + 0.2 * Math.sin(now * 3 + h.x)
        const gr = g.createRadialGradient(h.x, h.y + 4, 1, h.x, h.y + 4, 26)
        gr.addColorStop(0, `rgba(255,190,110,${0.5 * L.night * fl})`); gr.addColorStop(1, 'rgba(255,170,90,0)')
        g.fillStyle = gr; g.fillRect(h.x - 26, h.y - 22, 52, 52)
        g.fillStyle = `rgba(255,215,140,${0.9 * L.night})`
        g.fillRect(h.x + Math.cos(h.a) * 4 - 1, h.y + Math.sin(h.a) * 4 + h.d * 0.55, 2, 1.5)
      }
    }
    // hay piles (falling strands with shadows, then the pile)
    for (const p of hay) {
      const n = Math.ceil(p.strands.length * clamp(p.amt * 1.1, 0, 1))
      g.fillStyle = 'rgba(30,30,20,0.22)'
      for (let k = 0; k < n; k++) { const st = p.strands[k]; if (st.z > 0) { g.fillRect(st.x + sdxG() * st.z * 0.5, st.y + sdyG() * st.z * 0.5, 2, 1) } }
      const hc = hex('#d9bb63'), hc2 = hex('#b89443'), lc2 = L.light, dm = 1 - L.night * 0.5
      g.lineWidth = 1.6; g.lineCap = 'round'
      for (let k = 0; k < n; k++) {
        const st = p.strands[k], c = st.c > 0.5 ? hc : hc2
        g.strokeStyle = rgb([c[0] * lc2[0] * dm, c[1] * lc2[1] * dm, c[2] * lc2[2] * dm], 0.95)
        const y = st.y - st.z
        g.beginPath(); g.moveTo(st.x - Math.cos(st.a) * st.l / 2, y - Math.sin(st.a) * st.l / 4); g.lineTo(st.x + Math.cos(st.a) * st.l / 2, y + Math.sin(st.a) * st.l / 4); g.stroke()
      }
    }
    // sheep (shadow, body, head)
    const sdx = L.sd[0], sdy = L.sd[1], dim = 1 - L.night * 0.5
    g.fillStyle = season === 'winter' ? 'rgba(40,50,70,0.5)' : 'rgba(20,30,28,0.35)'
    for (const s of sheep) { const sz = (s.lamb ? 0.7 : 1) * 1.55; g.beginPath(); g.ellipse(s.x + sdx * 3 * sz, s.y + sdy * 3 * sz + 1, 4.6 * sz, 3.4 * sz, s.h, 0, 6.29); g.fill() }
    for (const s of sheep) {
      const sz = (s.lamb ? 0.7 : 1) * 1.55, bob = s.st === 'walk' || s.st === 'flee' || s.st === 'shelter' || s.st === 'feed' ? Math.sin(s.bob * 14) * 0.4 : (s.look > 0.5 && s.lamb ? -Math.abs(Math.sin(s.bob * 5)) * 1.2 : 0)
      g.save(); g.translate(s.x, s.y + bob); g.rotate(s.h)
      if (s.dark) g.filter = 'brightness(0.45)'
      g.drawImage(woolSprite, -7 * sz, -6 * sz, 14 * sz, 12 * sz)
      g.filter = 'none'
      // head: down while grazing, tucked while lying
      let hx = s.st === 'graze' ? 5.6 : s.st === 'lie' ? 3.6 + (1 - s.lie) * 2 : s.st === 'eat' ? 6.2 + Math.sin(s.bob * 9) * 0.6 : 6
      g.fillStyle = rgb([42 * dim, 36 * dim, 34 * dim])
      const lk = s.look || 0
      if (lk > 0.02) {
        // looking up at you: head turns toward the screen and lifts (drawn bigger, ears out)
        g.restore(); g.save(); g.translate(s.x, s.y + bob)
        const ha = lerp(s.h, Math.PI / 2, lk) // toward the viewer (down the screen)
        const hxx = Math.cos(ha) * hx * sz, hyy = Math.sin(ha) * hx * sz - lk * 2.2 * sz
        g.beginPath(); g.ellipse(hxx, hyy, (2.1 + lk * 0.5) * sz, (1.6 + lk * 0.6) * sz, ha, 0, 6.29); g.fill()
        g.beginPath(); g.ellipse(hxx - 2.4 * sz * lk, hyy - 0.6 * sz, 1.3 * sz * lk, 0.6 * sz, -0.3, 0, 6.29); g.ellipse(hxx + 2.4 * sz * lk, hyy - 0.6 * sz, 1.3 * sz * lk, 0.6 * sz, 0.3, 0, 6.29); g.fill()
        g.fillStyle = `rgba(255,255,255,${0.85 * lk})`; g.fillRect(hxx - 1 * sz, hyy - 0.4 * sz, 0.7 * sz, 0.7 * sz); g.fillRect(hxx + 0.4 * sz, hyy - 0.4 * sz, 0.7 * sz, 0.7 * sz)
      } else { g.beginPath(); g.ellipse(hx * sz, 0, 2.1 * sz, 1.6 * sz, 0, 0, 6.29); g.fill() }
      g.restore()
    }
    // the farmer (seen from above: straw hat, blue overalls), waving back
    if (farmer) {
      const f = farmer, k = 2.3, step = Math.sin(f.walk * 10) * 0.8
      g.save(); g.translate(f.x, f.y)
      g.fillStyle = 'rgba(20,30,28,0.35)'; g.beginPath(); g.ellipse(sdx * 6, sdy * 6 + 1, 4 * k, 2.6 * k, 0, 0, 6.29); g.fill()
      if (L.night > 0.5) { const gr = g.createRadialGradient(4, 0, 1, 4, 0, 30); gr.addColorStop(0, 'rgba(255,200,120,0.45)'); gr.addColorStop(1, 'rgba(255,180,100,0)'); g.fillStyle = gr; g.fillRect(-28, -30, 64, 60) }
      const lc3 = L.light, dm3 = 1 - L.night * 0.45
      const tone = (h) => { const c = hex(h); return rgb([c[0] * lc3[0] * dm3, c[1] * lc3[1] * dm3, c[2] * lc3[2] * dm3]) }
      // legs + body
      g.fillStyle = tone('#3d4f73'); g.fillRect(-1.6 * k, (1 + step) * k, 1.2 * k, 2.4 * k); g.fillRect(0.4 * k, (1 - step) * k, 1.2 * k, 2.4 * k)
      g.fillStyle = tone('#4f6a9a'); g.beginPath(); g.ellipse(0, -0.6 * k, 2.4 * k, 2.8 * k, 0, 0, 6.29); g.fill()
      // arms: one swings overhead while waving
      g.strokeStyle = tone('#e2b896'); g.lineWidth = 1.1 * k; g.lineCap = 'round'
      g.beginPath(); g.moveTo(-2 * k, -1.4 * k); g.lineTo(-3 * k, 1 * k); g.stroke()
      const wa = f.st === 'wave' ? -1.2 + Math.sin(f.t * 9) * 0.55 : 1.2
      g.beginPath(); g.moveTo(2 * k, -1.6 * k); g.lineTo(2 * k + Math.cos(wa) * 3.6 * k, -1.6 * k + Math.sin(wa) * 3.6 * k); g.stroke()
      // straw hat
      g.fillStyle = tone('#d8b860'); g.beginPath(); g.ellipse(0, -3.4 * k, 3.1 * k, 2.2 * k, 0, 0, 6.29); g.fill()
      g.fillStyle = tone('#c19d48'); g.beginPath(); g.ellipse(0, -3.8 * k, 1.6 * k, 1.2 * k, 0, 0, 6.29); g.fill()
      if (L.night > 0.5) { g.fillStyle = 'rgba(255,214,140,0.95)'; g.fillRect(-4.2 * k, 0.6 * k, 1.4 * k, 1.6 * k) }
      g.restore()
    }
    // little hearts from happy sheep
    for (const ht of hearts) {
      const a = Math.min(1, ht.t * 3) * (1 - ht.t / 2.2), r = 2.6
      g.fillStyle = `rgba(255,128,150,${a * 0.9})`
      g.beginPath(); g.arc(ht.x - r, ht.y, r, 0, 6.29); g.arc(ht.x + r, ht.y, r, 0, 6.29); g.moveTo(ht.x - 2 * r, ht.y + 0.4); g.lineTo(ht.x, ht.y + 2.6 * r); g.lineTo(ht.x + 2 * r, ht.y + 0.4); g.fill()
    }
    // rain streaks + splashes (below the clouds)
    if (drops.length && season === 'winter') {
      g.fillStyle = L.night ? 'rgba(220,230,255,0.75)' : 'rgba(255,255,255,0.85)'
      for (const d of drops) g.fillRect(d.x + Math.sin(d.y * 0.05) * 2, d.y, 1.8, 1.8)
    } else if (drops.length) {
      g.strokeStyle = L.night ? 'rgba(170,190,230,0.35)' : 'rgba(225,235,250,0.45)'; g.lineWidth = 1
      g.beginPath(); for (const d of drops) { g.moveTo(d.x, d.y); g.lineTo(d.x - wind.x * 0.02, d.y - 12) } g.stroke()
      g.strokeStyle = 'rgba(230,240,255,0.4)'
      for (const sp of splash) { g.globalAlpha = 1 - sp.t / 0.35; g.beginPath(); g.ellipse(sp.x, sp.y, 1 + sp.t * 8, 0.6 + sp.t * 4, 0, 0, 6.29); g.stroke() }
      g.globalAlpha = 1
    }
    // smoke
    for (const p of smoke) { const a = Math.min(1, p.t * 2) * (1 - p.t / 4) * 0.16; g.fillStyle = L.night ? `rgba(150,160,190,${a})` : `rgba(235,235,235,${a})`; g.beginPath(); g.arc(p.x, p.y - p.z, p.r, 0, 6.29); g.fill() }
    // cloud + bird shadows (soft, low-res, overlaps don't stack)
    sq2.clearRect(0, 0, shadowC.width, shadowC.height)
    for (const c of clouds) {
      const bx = c.x + sdx * c.alt, by = c.y + sdy * c.alt
      for (const p of c.p) {
        const r = p.r * p.born * 0.95, x = bx + p.x + p.ox + sdx * p.z, y = by + (p.y + p.oy) * 0.62 + sdy * p.z
        sq2.drawImage(shadowPuff, (x - r) / 4, (y - r * 0.8) / 4, r / 2, r * 0.4)
      }
    }
    if (birds) for (const b of birds.list) sq2.drawImage(shadowPuff, (b.x + sdx * birds.alt - 4) / 4, (b.y + sdy * birds.alt - 2) / 4, 2, 1.2)
    g.globalAlpha = L.sh; g.globalCompositeOperation = 'multiply'
    g.drawImage(shadowC, 0, 0, W, H)
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'
    // birds
    if (birds) {
      g.strokeStyle = L.night ? 'rgba(30,34,50,0.9)' : 'rgba(40,40,46,0.85)'; g.lineWidth = 1.4; g.lineCap = 'round'
      g.beginPath()
      for (const b of birds.list) { const x = b.x, y = b.y - birds.alt, w = Math.sin(b.ph) * 3, dir = Math.sign(b.vx); g.moveTo(x - 5, y - w); g.quadraticCurveTo(x - 2, y - 2, x + dir, y); g.quadraticCurveTo(x + 2, y - 2, x + 5, y - w) }
      g.stroke()
    }
    drawSeason(false)
    // clouds: back to front by ground y
    clouds.sort((a, b) => a.y - b.y)
    let rebuilt = 0
    for (const c of clouds) {
      if ((c.dirty && (rebuilt < 3 || !c.cache)) || !c.cache) { c.cache = renderCloud(c, puffs); if (c.rain > 0 || c.rainT > 0) c.rcache = renderCloud(c, rainPuffs); c.dirty = false; rebuilt++ }
      if ((c.rain > 0 || c.rainT > 0) && !c.rcache) c.rcache = renderCloud(c, rainPuffs)
      const sx = c.x, sy = c.y - c.alt
      g.drawImage(c.cache.cv, sx - c.cache.ox, sy - c.cache.oy)
      if (c.rain > 0 && c.rcache) { g.globalAlpha = c.rain * 0.85; g.drawImage(c.rcache.cv, sx - c.rcache.ox, sy - c.rcache.oy); g.globalAlpha = 1 }
      if (c.rain <= 0 && c.rainT <= 0) c.rcache = null
    }
    drawSeason(true)
    // camera hand: a soft warm ring where your hand is; it fills while you sprinkle
    const ca = clamp(1 - (now - cam.t) / 0.4, 0, 1)
    if (ca > 0) {
      g.lineWidth = 2; g.strokeStyle = `rgba(255,236,190,${0.35 * ca})`
      g.beginPath(); g.arc(cam.x, cam.y, 20, 0, 6.29); g.stroke()
      if (cam.prog > 0) { g.strokeStyle = `rgba(255,214,120,${0.85 * ca})`; g.lineWidth = 3; g.beginPath(); g.arc(cam.x, cam.y, 20, -Math.PI / 2, -Math.PI / 2 + cam.prog * 6.283); g.stroke() }
    }
  }

  // ---------- loop ----------
  let raf = 0, stopped = false
  const perf = { js: [] }
  function loop (ts) {
    if (stopped) return
    raf = requestAnimationFrame(loop)
    const t = ts / 1000
    const dt = Math.min(0.05, last ? t - last : 0.016); last = t; now += dt; frame++
    const t0 = performance.now()
    if (fadeT < 1) fadeT = Math.min(1, fadeT + dt / 3)
    update(dt); draw()
    perf.js.push(performance.now() - t0); if (perf.js.length > 600) perf.js.shift()
  }

  const ro = new ResizeObserver(() => { resize(); if (ctx.reducedMotion) still() })
  resize(); ro.observe(container)
  function still () { for (let k = 0; k < 90; k++) { now += 1 / 30; update(1 / 30) } for (const c of clouds) { for (const p of c.p) p.born = 1; c.dirty = true } draw() }
  if (ctx.reducedMotion) still(); else raf = requestAnimationFrame(loop)
  requestAnimationFrame(() => requestAnimationFrame(() => ctx.ready && ctx.ready()))
  const offClock = ctx.subscribe ? ctx.subscribe(({ timeOfDay }) => { setTod(timeOfDay); if (ctx.reducedMotion) { fadeT = 1; draw() } }) : null
  const offPointer = ctx.onPointer ? ctx.onPointer(onPointer) : null
  // camera motion blocks -> two gestures (wave hello, sprinkle to feed)
  const detect = makeHandDetector(onHand)
  const offHand = ctx.onWave ? ctx.onWave(({ cells }) => {
    if (ctx.reducedMotion || !W || !cells || !cells.length) return
    let sx = 0, sy = 0
    for (const c of cells) { sx += c.x; sy += c.y }
    detect(performance.now() / 1000, cells.length / 192, sx / cells.length / W, sy / cells.length / H)
  }) : null

  const api = { unmount () { stopped = true; cancelAnimationFrame(raf); ro.disconnect(); offClock && offClock(); offPointer && offPointer(); offHand && offHand(); canvas.remove() } }
  return api
}

// Gesture detector on motion summaries: t (s), n (share of the picture moving, 0..1), x, y (0..1).
// wave = three or more wide side-to-side swings; sprinkle = a small busy patch that stays put ~1.3 s.
function makeHandDetector (emit) {
  let hist = [], prog = 0, coolWave = 0, coolFeed = 0, lastT = 0
  return function sample (t, n, x, y) {
    const dt = lastT ? Math.min(0.2, t - lastT) : 0.066; lastT = t
    coolWave -= dt; coolFeed -= dt
    hist.push({ t, n, x, y })
    while (hist.length && t - hist[0].t > 1.6) hist.shift()
    if (coolWave <= 0) {
      const big = hist.filter(h => h.n > 0.022)
      if (big.length > 6) {
        let turns = 0, dir = 0, ext = big[0].x, minx = 1, maxx = 0
        for (const h of big) { minx = Math.min(minx, h.x); maxx = Math.max(maxx, h.x); const d = h.x - ext; if (Math.abs(d) > 0.05) { const nd = Math.sign(d); if (dir && nd !== dir) turns++; dir = nd; ext = h.x } else if ((dir > 0 && h.x > ext) || (dir < 0 && h.x < ext)) ext = h.x }
        if (turns >= 3 && maxx - minx > 0.18) { emit({ type: 'wave' }); coolWave = 6; prog = 0; hist = []; return }
      }
    }
    const recent = hist.filter(h => t - h.t < 0.9)
    let still = false, mx = 0, my = 0
    if (recent.length > 6) {
      for (const h of recent) { mx += h.x; my += h.y } mx /= recent.length; my /= recent.length
      still = recent.every(h => Math.hypot(h.x - mx, h.y - my) < 0.08 && h.n < 0.14)
    }
    if (still && coolFeed <= 0) prog = Math.min(1, prog + dt / 1.3); else prog = Math.max(0, prog - dt * 1.5)
    emit({ type: 'hand', x, y, amount: n, progress: prog })
    if (prog >= 1) { emit({ type: 'feed', x: mx, y: my }); prog = 0; coolFeed = 5 }
  }
}

