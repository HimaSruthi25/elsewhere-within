// Sunset Ruins — living side-scrolling game world (Elsewhere, Within)
// Everything is drawn live in code (canvas 2D). No pictures, no network.
// API: mount(container, ctx) -> { unmount }

const PAL = {
  dawn: { top: [52, 62, 112], mid: [196, 134, 152], bot: [246, 202, 160], sun: [255, 220, 175], sunX: 0.2, sunY: 0.6, sunR: 5.5, haze: [214, 170, 176], light: [255, 222, 190], amb: 0.78, night: 0.15 },
  day: { top: [70, 128, 196], mid: [150, 192, 224], bot: [230, 236, 236], sun: [255, 250, 232], sunX: 0.62, sunY: 0.16, sunR: 4.5, haze: [188, 208, 224], light: [255, 250, 236], amb: 1.0, night: 0 },
  dusk: { top: [40, 40, 86], mid: [204, 98, 118], bot: [255, 178, 104], sun: [255, 196, 118], sunX: 0.6, sunY: 0.5, sunR: 7.5, haze: [226, 142, 124], light: [255, 176, 116], amb: 0.72, night: 0.25 },
  night: { top: [6, 9, 26], mid: [18, 28, 62], bot: [44, 58, 102], sun: [226, 234, 255], sunX: 0.74, sunY: 0.2, sunR: 3.2, haze: [58, 72, 118], light: [150, 172, 232], amb: 0.38, night: 1 },
}

const hash = (a, b) => {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
const vnoise = (x, s) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return hash(i, s) * (1 - u) + hash(i + 1, s) * u }
const fbm = (x, s) => vnoise(x, s) * 0.55 + vnoise(x * 2.13, s + 1) * 0.28 + vnoise(x * 4.37, s + 2) * 0.17
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const mul = (a, b, k = 1) => [a[0] * b[0] / 255 * k, a[1] * b[1] / 255 * k, a[2] * b[2] / 255 * k]
const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`
const clamp = (v, a, b) => v < a ? a : v > b ? b : v

// ground: slots of 26 units; even slots may be a pit (middle 11 units open)
const SLOT = 26, PIT0 = 7.5, PIT1 = 18.5
const isPit = (i) => (i & 1) === 0 && hash(i, 7) < 0.3 && Math.abs(i) > 2
const slotTop = (i) => 71 + Math.floor(hash(i, 11) * 4) * 2.6
function groundAt(x) {
  const i = Math.floor(x / SLOT), l = x - i * SLOT
  if (isPit(i)) {
    if (l > PIT0 && l < PIT1) return null
    return slotTop(l <= PIT0 ? i - 1 : i + 1)
  }
  return slotTop(i)
}
const decoOf = (i) => {
  if (isPit(i)) return null
  const r = hash(i, 23)
  return r < 0.22 ? 'crystal' : r < 0.36 ? 'banner' : r < 0.45 ? 'fire' : r < 0.6 ? 'column' : r < 0.68 ? 'statue' : null
}

export function mount(container, ctx = {}) {
  const cv = document.createElement('canvas')
  cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block'
  container.appendChild(cv)
  const g = cv.getContext('2d')
  const fade = document.createElement('canvas'), fg = fade.getContext('2d')
  let W = 1, H = 1, U = 1, VW = 100
  let tod = PAL[ctx.timeOfDay] ? ctx.timeOfDay : 'dusk'
  let P = PAL[tod], fadeT = 0
  const tiles = new Map()

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const r = container.getBoundingClientRect()
    W = Math.max(2, Math.round((r.width || innerWidth) * dpr)); H = Math.max(2, Math.round((r.height || innerHeight) * dpr))
    cv.width = W; cv.height = H; fade.width = W; fade.height = H
    U = H / 100; VW = W / U
    tiles.clear(); makeSprites()
  }

  // ---------- colours ----------
  const stone = (depth, base = [150, 124, 112]) => mix(mul(base, P.light, P.amb), P.haze, depth)

  // ---------- sprites (clouds, mist) ----------
  let clouds = [], mist = null
  function makeSprites() {
    clouds = []
    for (let k = 0; k < 7; k++) {
      const w = Math.round((40 + hash(k, 3) * 40) * U), h = Math.round(w * 0.3)
      const c = document.createElement('canvas'); c.width = w; c.height = h
      const q = c.getContext('2d')
      const n = 34 + (hash(k, 4) * 16 | 0)
      const lit = mix(P.light, [255, 255, 255], 0.35), shade = mix(P.mid, P.top, 0.35)
      for (let j = 0; j < n; j++) {
        const u = hash(k * 31 + j, 5), px = w * (0.08 + 0.84 * u)
        const top = 1 - Math.abs(u - 0.5) * 1.6
        const pr = h * (0.1 + 0.2 * hash(k * 31 + j, 8)) * (0.5 + top * 0.7)
        const py = h * 0.72 - pr * 0.6 - hash(k * 31 + j, 6) * h * 0.25 * top
        const low = P.sunY > 0.4 // sun low: clouds lit from below
        const gr = q.createRadialGradient(px, py + (low ? pr * 0.5 : -pr * 0.5), pr * 0.05, px, py, pr * 1.6)
        gr.addColorStop(0, css(mix(lit, P.sun, 0.45), 0.9)); gr.addColorStop(0.45, css(mix(lit, shade, 0.5), 0.75)); gr.addColorStop(1, css(shade, 0))
        q.fillStyle = gr; q.beginPath(); q.ellipse(px, py, pr * 1.9, pr, 0, 0, 7); q.fill()
      }
      clouds.push({ c, x: hash(k, 9) * 1.6, y: 6 + hash(k, 10) * 34, s: 0.4 + hash(k, 12) * 0.6, v: 0.004 + hash(k, 13) * 0.006 })
    }
    mist = document.createElement('canvas'); mist.width = Math.round(W * 1.5); mist.height = Math.round(30 * U)
    const m = mist.getContext('2d')
    for (let j = 0; j < 90; j++) {
      const px = hash(j, 41) * mist.width, py = mist.height * (0.35 + 0.5 * hash(j, 42)), pr = (5 + hash(j, 43) * 12) * U
      for (const dx of [-mist.width, 0, mist.width]) {
        const gr = m.createRadialGradient(px + dx, py, 0, px + dx, py, pr)
        gr.addColorStop(0, css(mix(P.haze, [255, 255, 255], 0.25), 0.5)); gr.addColorStop(1, css(P.haze, 0))
        m.fillStyle = gr; m.beginPath(); m.arc(px + dx, py, pr, 0, 7); m.fill()
      }
    }
  }

  // ---------- parallax layer tiles ----------
  const TW = 90 // tile width in layer units
  function arch(q, x, base, w, h, th, col) {
    q.fillStyle = col
    q.beginPath()
    q.rect(x, base - h, w, h)
    const r = (w - th * 2) / 2
    q.moveTo(x + th, base); q.lineTo(x + th, base - h + th + r); q.arc(x + w / 2, base - h + th + r, r, Math.PI, 0); q.lineTo(x + w - th, base)
    q.closePath(); q.fill('evenodd')
  }
  function tower(q, x, base, w, h, col, rim, rnd) {
    q.fillStyle = col; q.fillRect(x, base - h, w, h)
    // broken top
    q.beginPath(); q.moveTo(x, base - h)
    const n = 4
    for (let k = 0; k <= n; k++) q.lineTo(x + w * k / n, base - h - (rnd() * 0.12 + 0.02) * w * (k % 2 ? 1.6 : 0.6))
    q.lineTo(x + w, base - h); q.closePath(); q.fill()
    q.fillStyle = rim; q.fillRect(x + w * 0.62, base - h, w * 0.38, h)
    q.fillStyle = 'rgba(0,0,0,0.25)'
    for (let k = 1; k < 4; k++) { q.fillRect(x + w * 0.35, base - h + h * k / 4.2, w * 0.18, w * 0.32) }
  }
  function drawLayerTile(name, ti) {
    const c = document.createElement('canvas')
    const tw = Math.ceil(TW * U) + 2
    c.width = tw; c.height = H
    const q = c.getContext('2d'); q.scale(U, U)
    let s = (ti * 9973 + name.length * 131) >>> 0
    const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296
    const X0 = ti * TW
    if (name === 'peaks') {
      for (const [d, base, amp, sd] of [[0.82, 58, 26, 1], [0.7, 64, 18, 2]]) {
        q.fillStyle = css(stone(d, [120, 104, 124])); q.beginPath(); q.moveTo(0, 100)
        for (let x = 0; x <= TW + 1; x += 1) { const y = base - Math.pow(fbm((X0 + x) / 38, sd), 1.6) * amp * 1.6; q.lineTo(x, y) }
        q.lineTo(TW + 1, 100); q.fill()
      }
      if (hash(ti, 77) < 0.7) { // castle on a cliff
        const cx = 15 + hash(ti, 78) * 55, base = 64 - Math.pow(fbm((X0 + cx) / 38, 2), 1.6) * 18 * 1.6
        const col = css(stone(0.62, [110, 96, 120]))
        q.fillStyle = col
        q.beginPath(); q.moveTo(cx - 9, base + 2); q.lineTo(cx - 6, base - 5); q.lineTo(cx + 6, base - 6); q.lineTo(cx + 10, base + 2); q.fill()
        for (let k = 0; k < 6; k++) {
          const tx = cx - 6 + k * 2.4 + rnd(), th = 5 + rnd() * 9, tw2 = 1.3 + rnd() * 0.8
          q.fillRect(tx, base - 5 - th, tw2, th + 1)
          q.beginPath(); q.moveTo(tx - 0.3, base - 5 - th); q.lineTo(tx + tw2 / 2, base - 5 - th - 3 - rnd() * 2); q.lineTo(tx + tw2 + 0.3, base - 5 - th); q.fill()
        }
        q.fillStyle = css(mix(P.sun, [255, 220, 150], 0.4), 0.35 + P.night * 0.5)
        for (let k = 0; k < 5; k++) q.fillRect(cx - 5 + rnd() * 10, base - 5 - rnd() * 9, 0.35, 0.5)
      }
    } else if (name === 'far') {
      const col = css(stone(0.46)), rim = css(mix(stone(0.42), P.sun, 0.3))
      // great broken bridge / aqueduct
      const deck = 52 + hash(ti, 81) * 3
      if (hash(ti, 82) < 0.7) {
        const broken = hash(ti, 83) * TW
        for (let x = 0; x < TW; x += 12) {
          if (Math.abs(x + 6 - broken) < 9) continue
          arch(q, x, 100, 12, 100 - deck, 2.2, col)
        }
        q.fillStyle = rim
        for (let x = 0; x < TW; x += 12) { if (Math.abs(x + 6 - broken) < 9) continue; q.fillRect(x, deck - 1.2, 12, 1.4) }
      }
      for (let k = 0; k < 2; k++) if (rnd() < 0.7) tower(q, rnd() * (TW - 10), 100, 5 + rnd() * 4, 52 + rnd() * 18, col, rim, rnd)
    } else if (name === 'mid') {
      const col = css(stone(0.24, [140, 116, 106])), rim = css(mix(stone(0.2, [150, 124, 112]), P.sun, 0.4))
      for (let k = 0; k < 3; k++) {
        const r = rnd(), x = rnd() * (TW - 14)
        if (r < 0.4) tower(q, x, 100, 6 + rnd() * 5, 38 + rnd() * 22, col, rim, rnd)
        else if (r < 0.75) { const w = 14 + rnd() * 8, h = 30 + rnd() * 14; arch(q, x, 100, w, h, 2.6, col); q.fillStyle = rim; q.fillRect(x, 100 - h, w, 1) }
        else { // tree on a rock
          const ty = 70 + rnd() * 10
          q.fillStyle = col; q.beginPath(); q.ellipse(x + 5, ty + 15, 8, 16, 0, 0, 7); q.fill()
          const leaf = css(mix(mul([70, 96, 70], P.light, P.amb), P.haze, 0.38))
          q.fillStyle = col; q.fillRect(x + 4.4, ty - 9, 1.2, 10)
          q.fillStyle = leaf
          for (let j = 0; j < 7; j++) { q.beginPath(); q.arc(x + 5 + (rnd() - 0.5) * 9, ty - 10 + (rnd() - 0.5) * 6, 2.6 + rnd() * 2, 0, 7); q.fill() }
        }
      }
    } else if (name === 'near') {
      const col = css(stone(0.18, [120, 98, 92]))
      for (let k = 0; k < 2; k++) if (rnd() < 0.55) {
        const x = rnd() * (TW - 8), w = 4 + rnd() * 3, top = 76 + rnd() * 10
        q.fillStyle = col; q.fillRect(x, top, w, 100 - top)
        q.beginPath(); q.moveTo(x, top); q.lineTo(x + w * 0.4, top - 2 - rnd() * 3); q.lineTo(x + w, top - 0.5); q.lineTo(x + w, top + 1); q.fill()
      }
    } else if (name === 'front') {
      if (rnd() < 0.4) { // hanging vines from the top edge
        const x = rnd() * (TW - 12)
        q.strokeStyle = css(mul([40, 56, 42], P.light, P.amb * 0.6)); q.lineCap = 'round'
        for (let j = 0; j < 7; j++) {
          q.lineWidth = 0.5 + rnd() * 0.5; q.beginPath(); const vx = x + rnd() * 12; q.moveTo(vx, -1)
          const L = 8 + rnd() * 18; q.quadraticCurveTo(vx + 2, L / 2, vx + (rnd() - 0.5) * 3, L); q.stroke()
          q.fillStyle = css(mul([60, 92, 56], P.light, P.amb * 0.7))
          for (let m = 2; m < L; m += 2.2) { q.beginPath(); q.ellipse(vx + Math.sin(m) * 0.8, m, 0.9, 0.5, m, 0, 7); q.fill() }
        }
      }
    }
    return c
  }
  const GT = 52 // ground tile width (2 slots)
  function drawGroundTile(ti) {
    const c = document.createElement('canvas')
    c.width = Math.ceil(GT * U) + 2; c.height = H
    const q = c.getContext('2d'); q.scale(U, U)
    const X0 = ti * GT
    const face = stone(0.0, [156, 128, 112]), faceD = stone(0.0, [112, 92, 86]), moss = mul([96, 128, 70], P.light, P.amb), mossL = mix(moss, P.sun, 0.25)
    const i0 = Math.floor(X0 / SLOT) - 1, i1 = Math.floor((X0 + GT) / SLOT) + 1
    for (let i = i0; i <= i1; i++) {
      const sx = i * SLOT - X0
      const parts = isPit(i) ? [[0, PIT0, slotTop(i - 1)], [PIT1, SLOT, slotTop(i + 1)]] : [[0, SLOT, slotTop(i)]]
      for (const [a, b, top] of parts) {
        const x = sx + a, w = b - a
        const gr = q.createLinearGradient(0, top, 0, 100)
        gr.addColorStop(0, css(face)); gr.addColorStop(1, css(mix(faceD, P.top, 0.35)))
        q.fillStyle = gr; q.fillRect(x - 0.02, top, w + 0.04, 100 - top)
        // bricks
        q.strokeStyle = css(faceD, 0.55); q.lineWidth = 0.25
        for (let y = top + 3.4, row = 0; y < 100; y += 3.4, row++) {
          q.beginPath(); q.moveTo(x, y); q.lineTo(x + w, y); q.stroke()
          const off = (row % 2) * 3
          for (let bx = Math.ceil((i * SLOT + a - off) / 6) * 6 + off - i * SLOT; bx < b; bx += 6) { q.beginPath(); q.moveTo(sx + bx, y - 3.4); q.lineTo(sx + bx, y); q.stroke() }
        }
        // weathering specks
        for (let k = 0; k < 18; k++) { const h = hash(i * 97 + k, Math.round(a)); q.fillStyle = css(h < 0.5 ? faceD : mix(face, [255, 255, 255], 0.2), 0.35); q.fillRect(x + hash(i * 97 + k, 3) * w, top + 1 + hash(i * 97 + k, 4) * (100 - top), 0.7, 0.5) }
        // step / pit edges get a side face
        const leftH = a === 0 ? (isPit(i - 1) ? null : slotTop(i - 1)) : null
        const rightH = b === SLOT ? (isPit(i + 1) ? null : slotTop(i + 1)) : null
        q.fillStyle = css(faceD, 0.8)
        if (a !== 0 || (leftH !== null && leftH > top)) q.fillRect(x, top, 0.7, 100 - top)
        if (b !== SLOT || (rightH !== null && rightH > top)) q.fillRect(x + w - 0.7, top, 0.7, 100 - top)
        // moss lip + tufts
        q.fillStyle = css(moss); q.fillRect(x, top - 0.3, w, 1.3)
        q.fillStyle = css(mossL); q.fillRect(x, top - 0.3, w, 0.45)
        for (let k = 0; k < w * 0.8; k++) {
          const h = hash(i * 131 + k, Math.round(a) + 5), tx = x + h * w, th = 0.6 + hash(i * 131 + k, 9) * 1.4
          q.fillStyle = css(h < 0.5 ? moss : mossL); q.beginPath(); q.moveTo(tx - 0.3, top); q.lineTo(tx + 0.1, top - th); q.lineTo(tx + 0.4, top); q.fill()
        }
        // drips of moss down the face
        for (let k = 0; k < 3; k++) { const dx = x + hash(i, 50 + k + a) * w; q.fillStyle = css(moss, 0.7); q.fillRect(dx, top, 0.5, 1 + hash(i, 60 + k) * 4) }
      }
      // static deco
      const d = decoOf(i), top = isPit(i) ? 0 : slotTop(i), cx = sx + 13
      if (d === 'column') {
        const h = 8 + hash(i, 31) * 10
        q.fillStyle = css(stone(0, [176, 150, 134])); q.fillRect(cx - 1.6, top - h, 3.2, h)
        q.fillStyle = css(faceD, 0.5); q.fillRect(cx + 0.6, top - h, 1, h)
        q.fillStyle = css(stone(0, [186, 160, 142])); q.fillRect(cx - 2.2, top - 1, 4.4, 1); q.fillRect(cx - 2.2, top - h - 0.4, 4.4, 1)
        q.fillStyle = css(mix(stone(0, [186, 160, 142]), P.sun, 0.4)); q.fillRect(cx - 2.2, top - h - 0.4, 4.4, 0.3)
        if (hash(i, 32) < 0.5) { q.save(); q.translate(cx + 5, top - 0.8); q.rotate(0.15); q.fillStyle = css(stone(0, [170, 144, 128])); q.fillRect(-3.5, -0.8, 7, 1.8); q.restore() }
      } else if (d === 'statue') {
        q.fillStyle = css(stone(0, [160, 150, 140]))
        q.fillRect(cx - 2.5, top - 2, 5, 2)
        q.beginPath(); q.moveTo(cx - 1.6, top - 2); q.lineTo(cx - 1.2, top - 9); q.lineTo(cx + 1.2, top - 9); q.lineTo(cx + 1.8, top - 2); q.fill()
        q.beginPath(); q.arc(cx, top - 10.2, 1.3, 0, 7); q.fill()
        q.fillStyle = css(moss, 0.8); q.fillRect(cx - 1.4, top - 9.4, 2.8, 0.6)
        q.fillStyle = css(faceD, 0.5); q.fillRect(cx + 0.3, top - 9, 1.2, 7)
      } else if (d === 'banner') {
        q.fillStyle = css(mul([70, 54, 44], P.light, P.amb)); q.fillRect(cx - 0.35, top - 16, 0.7, 16)
        q.fillStyle = css(mix(mul([210, 170, 90], P.light, P.amb), P.sun, 0.2)); q.beginPath(); q.arc(cx, top - 16.4, 0.6, 0, 7); q.fill()
      } else if (d === 'fire') {
        for (let k = 0; k < 7; k++) { const a2 = k / 7 * Math.PI; q.fillStyle = css(stone(0, [130, 120, 116])); q.beginPath(); q.ellipse(cx + Math.cos(a2) * 2.4, top - 0.4 - Math.sin(a2) * 0.2, 0.8, 0.55, 0, 0, 7); q.fill() }
        q.strokeStyle = css(mul([90, 60, 40], P.light, P.amb)); q.lineWidth = 0.5
        q.beginPath(); q.moveTo(cx - 1.6, top - 0.3); q.lineTo(cx + 1.4, top - 1.2); q.moveTo(cx + 1.6, top - 0.3); q.lineTo(cx - 1.3, top - 1.1); q.stroke()
        q.fillStyle = css(mul([92, 70, 52], P.light, P.amb)); q.fillRect(cx - 7.5, top - 1.2, 4, 1.2) // log seat
      }
    }
    return c
  }
  function getTile(key, make) {
    let t = tiles.get(key)
    if (!t) { t = make(); tiles.set(key, t); if (tiles.size > 70) tiles.delete(tiles.keys().next().value) }
    return t
  }
  function drawLayer(name, f, camX) {
    const off = camX * f, t0 = Math.floor(off / TW), t1 = Math.floor((off + VW) / TW)
    for (let ti = t0; ti <= t1; ti++) g.drawImage(getTile(name + ti, () => drawLayerTile(name, ti)), Math.round((ti * TW - off) * U), 0)
  }
  function drawGround(camX) {
    const t0 = Math.floor(camX / GT), t1 = Math.floor((camX + VW) / GT)
    for (let ti = t0; ti <= t1; ti++) g.drawImage(getTile('g' + ti, () => drawGroundTile(ti)), Math.round((ti * GT - camX) * U), 0)
  }

  // ---------- world state ----------
  const stars = Array.from({ length: 160 }, (_, k) => ({ x: hash(k, 91), y: hash(k, 92) * 0.6, s: 0.5 + hash(k, 93) * 1.2, p: hash(k, 94) * 6 }))
  const hero = { x: 20, y: slotTop(0), vy: 0, dir: 1, face: 1, state: 'idle', timer: 2, phase: 0, jump: null, look: 0, sitFor: 0 }
  let camX = hero.x - 40, t = 0
  const pointer = { x: 0, y: 0, active: false, last: -99, still: 0, px: 0, py: 0 }
  const crystalBoost = new Map()
  const birds = [], embers = [], motes = []
  let nextBirds = 6, shoot = null, nextShoot = 12

  function startJump(fromX, toX, fromY, toY, dur, hgt) { hero.jump = { fromX, toX, fromY, toY, dur, hgt, t: 0 }; hero.state = 'jump' }
  function decoNear(x, kind, range) {
    const i = Math.round((x - 13) / SLOT)
    for (const j of [i, i - 1, i + 1]) if (decoOf(j) === kind && Math.abs(j * SLOT + 13 - x) < range) return j * SLOT + 13
    return null
  }

  function stepHero(dt) {
    hero.phase += dt
    const guide = pointer.active && t - pointer.last < 8
    if (hero.state === 'jump') {
      const j = hero.jump; j.t += dt / j.dur
      const k = Math.min(1, j.t)
      hero.x = j.fromX + (j.toX - j.fromX) * k
      hero.y = j.fromY + (j.toY - j.fromY) * k - Math.sin(k * Math.PI) * j.hgt
      if (k >= 1) { hero.y = j.toY; hero.state = 'walk'; hero.jump = null; dust(hero.x, hero.y) }
      return
    }
    // decide
    let want = 0 // -1, 0, 1
    if (guide) {
      const pwx = camX + pointer.x / U
      const d = pwx - hero.x
      if (Math.abs(d) > 5) want = Math.sign(d)
      hero.look = clamp((pointer.y / U - (hero.y - 8)) / 30, -1, 1)
      if (!want) hero.face = Math.sign(d) || hero.face
      if (!want && pointer.still > 6 && hero.state !== 'sit') { hero.state = 'sit'; hero.timer = 9999 }
      if (want && hero.state === 'sit') hero.state = 'idle'
      if (!want && hero.state === 'walk') hero.state = 'idle'
      if (want) { hero.state = 'walk'; hero.dir = want }
    } else {
      hero.look *= 0.98
      hero.timer -= dt
      if (hero.state === 'walk') {
        const fire = decoNear(hero.x, 'fire', 1.2)
        const cry = decoNear(hero.x, 'crystal', 1.2)
        if (fire !== null && hash(Math.round(fire), 3) < 0.8 && hero.timer < 0) { hero.state = 'sit'; hero.timer = 12 + Math.random() * 10; hero.x = fire - 5.5 * hero.dir; hero.face = hero.dir }
        else if (cry !== null && hero.timer < 0) { hero.state = 'touch'; hero.timer = 3.2; crystalBoost.set(Math.round(cry), 1.6) }
        else if (hero.timer < -14 - Math.random() * 20) { hero.state = 'idle'; hero.timer = 2 + Math.random() * 3 }
      } else if (hero.timer <= 0) {
        if (hero.state === 'idle' && Math.random() < 0.12) hero.dir = -hero.dir
        hero.state = 'walk'; hero.timer = 3
      }
      want = hero.state === 'walk' ? hero.dir : 0
      if (hero.state === 'idle') hero.look = Math.sin(t * 0.7) * 0.5
    }
    if (hero.state === 'walk') {
      hero.face = hero.dir
      const sp = 8.5 * dt * hero.dir
      const ahead = hero.x + hero.dir * 2
      const gA = groundAt(ahead)
      if (gA === null) { // pit: jump to the far side
        let lx = ahead
        while (groundAt(lx) === null) lx += hero.dir * 0.5
        lx += hero.dir * 2.5
        startJump(hero.x, lx, hero.y, groundAt(lx), 0.75, 7)
        return
      }
      if (gA < hero.y - 0.5) { startJump(hero.x, ahead + hero.dir * 1.5, hero.y, groundAt(ahead + hero.dir * 1.5), 0.34, 3.2); return }
      hero.x += sp
      const gy = groundAt(hero.x)
      if (gy !== null) hero.y = gy > hero.y ? Math.min(gy, hero.y + 30 * dt) : gy
    }
  }
  function dust(x, y) { for (let k = 0; k < 8; k++) motes.push({ x, y: y - 0.3, vx: (Math.random() - 0.5) * 6, vy: -Math.random() * 2, life: 0.7, kind: 'dust' }) }

  // ---------- drawing live things ----------
  function drawHero() {
    const s = U, x = (hero.x - camX) * U, y = hero.y * U
    const lit = P.light, cloak = mul([206, 152, 54], lit, P.amb + 0.08), cloakD = mul([150, 98, 40], lit, P.amb), dark = mul([60, 42, 36], lit, P.amb + 0.2)
    const rim = mix(cloak, P.sun, 0.55)
    g.save(); g.translate(x, y); g.scale(hero.face * s, s)
    const st = hero.state, ph = hero.phase * 9
    const walking = st === 'walk'
    const bob = walking ? Math.abs(Math.sin(ph)) * 0.45 : st === 'idle' || st === 'touch' ? Math.sin(t * 1.6) * 0.12 : 0
    const sit = st === 'sit'
    const lift = sit ? 2.0 : 0
    // shadow
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.beginPath(); g.ellipse(0, 0, sit ? 3 : 2.3, 0.45, 0, 0, 7); g.fill()
    g.translate(0, -bob + lift)
    // legs / boots
    g.fillStyle = css(dark)
    if (sit) { g.fillRect(-0.2, -3.1, 3.4, 1.1); g.fillRect(2.6, -3.4, 1.2, 1.4); g.fillRect(-0.8, -2.9, 3.0, 0.9) }
    else if (st === 'jump') { g.fillRect(-0.9, -3.4, 1.1, 2.0); g.fillRect(0.5, -3.0, 1.1, 1.8) }
    else {
      const a = walking ? Math.sin(ph) * 1.1 : 0
      g.fillRect(-0.9 + a, -2.6, 1.1, 2.6); g.fillRect(0.3 - a, -2.6, 1.1, 2.6)
      g.fillStyle = css(mul([40, 30, 26], lit, P.amb + 0.2)); g.fillRect(-1.1 + a, -0.6, 1.5, 0.6); g.fillRect(0.1 - a, -0.6, 1.5, 0.6)
    }
    // cloak body with fluttering hem
    const wind = Math.sin(t * 2.2) * 0.4 + (walking ? 0.9 : 0.2)
    g.fillStyle = css(cloak)
    g.beginPath(); g.moveTo(-1.4, -8.6)
    g.quadraticCurveTo(-2.4 - wind * 0.8, -5, -2.8 - wind * 1.2, -2.3 + Math.sin(t * 5) * 0.2)
    for (let k = 0; k <= 6; k++) { const hx = -2.8 - wind * 1.2 + k * (5.0 + wind * 0.6) / 6; g.lineTo(hx, -2.3 + Math.sin(t * 6 + k * 1.3) * 0.25 * (1 + wind)) }
    g.quadraticCurveTo(2.2, -5, 1.4, -8.6); g.closePath(); g.fill()
    g.fillStyle = css(cloakD); g.beginPath(); g.moveTo(-0.2, -8.4); g.quadraticCurveTo(-1.4 - wind, -5, -2.4 - wind * 1.1, -2.4); g.lineTo(-1.2, -2.4); g.quadraticCurveTo(-0.6, -5, -0.2, -8.4); g.fill()
    g.fillStyle = css(rim, 0.55); g.beginPath(); g.moveTo(1.4, -8.6); g.quadraticCurveTo(2.2, -5, 2.2 + wind * 0.1, -2.4); g.lineTo(1.6, -2.4); g.quadraticCurveTo(1.6, -5, 1.0, -8.6); g.fill()
    // scarf
    g.fillStyle = css(mul([160, 54, 48], lit, P.amb + 0.1)); g.fillRect(-1.3, -8.9, 2.6, 0.9)
    g.beginPath(); g.moveTo(-1.2, -8.6); g.quadraticCurveTo(-3 - wind, -8.2 + Math.sin(t * 7) * 0.4, -4.4 - wind * 1.4, -7.6 + Math.sin(t * 6.3) * 0.6); g.lineTo(-4.2 - wind * 1.4, -7.0 + Math.sin(t * 6.3) * 0.6); g.quadraticCurveTo(-2.6, -7.8, -1.0, -8.0); g.fill()
    // hood
    const lk = hero.look * 0.35
    g.save(); g.translate(0.2, -10); g.rotate(lk)
    g.fillStyle = css(cloak); g.beginPath(); g.arc(0, 0, 1.9, 0, 7); g.fill()
    g.beginPath(); g.moveTo(-1.6, -0.9); g.quadraticCurveTo(-3.2, -1.2, -3.6 - wind * 0.4, 0.4); g.lineTo(-1.2, 0.8); g.fill()
    g.fillStyle = css(rim, 0.6); g.beginPath(); g.arc(0.2, -0.2, 1.9, -1.2, 0.4); g.lineTo(0.2, -0.2); g.fill()
    g.fillStyle = css([18, 14, 20]); g.beginPath(); g.ellipse(0.85, 0.25, 0.9, 1.15, 0, 0, 7); g.fill()
    const blink = (t % 4.3) < 0.12 ? 0.15 : 1
    g.fillStyle = css([255, 214, 140]); g.fillRect(0.75, 0.0, 0.32, 0.38 * blink); g.fillRect(1.35, 0.0, 0.3, 0.38 * blink)
    g.restore()
    // arm + lantern
    const raise = st === 'touch' ? 1 : 0
    const hx = 2.0 + raise * 0.6, hy = -5.6 - raise * 2.4
    g.strokeStyle = css(cloak); g.lineWidth = 0.9; g.lineCap = 'round'; g.beginPath(); g.moveTo(0.9, -7.6); g.lineTo(hx, hy); g.stroke()
    const sw = walking ? Math.sin(ph + 1) * 0.25 : Math.sin(t * 1.3) * 0.08
    g.save(); g.translate(hx, hy); g.rotate(sw)
    g.strokeStyle = css(dark); g.lineWidth = 0.18; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, 1); g.stroke()
    g.fillStyle = css(mul([90, 70, 50], lit, P.amb + 0.2)); g.fillRect(-0.6, 1, 1.2, 0.3); g.fillRect(-0.6, 2.9, 1.2, 0.3)
    g.fillStyle = css([255, 210, 120]); g.fillRect(-0.45, 1.3, 0.9, 1.6)
    g.restore()
    g.restore()
    // lantern glow (screen space)
    const lx = x + hero.face * (hx + Math.sin(sw) * -2) * s, ly = y + (hy + 2.1 - bob + lift) * s
    const R = (3 + P.night * 9 + (1 - P.amb) * 4) * s * (0.95 + Math.sin(t * 9) * 0.03 + Math.sin(t * 13.7) * 0.02)
    g.save(); g.globalCompositeOperation = 'lighter'
    const gr = g.createRadialGradient(lx, ly, 0, lx, ly, R)
    gr.addColorStop(0, `rgba(255,200,120,${0.5 + P.night * 0.3})`); gr.addColorStop(0.3, `rgba(255,160,80,${0.16 + P.night * 0.15})`); gr.addColorStop(1, 'rgba(255,140,60,0)')
    g.fillStyle = gr; g.beginPath(); g.arc(lx, ly, R, 0, 7); g.fill(); g.restore()
  }
  function drawLiveDeco() {
    const i0 = Math.floor(camX / SLOT) - 1, i1 = Math.floor((camX + VW) / SLOT) + 1
    const px = pointer.x / U + camX, py = pointer.y / U
    for (let i = i0; i <= i1; i++) {
      const d = decoOf(i); if (!d || d === 'column' || d === 'statue') continue
      const top = slotTop(i), cx = i * SLOT + 13, sx = (cx - camX) * U
      if (d === 'crystal') {
        let b = crystalBoost.get(cx) || 0
        if (pointer.active && t - pointer.last < 3 && Math.hypot(px - cx, py - (top - 4)) < 10) b = Math.max(b, 1)
        const cur = (crystalBoost.get(cx + 0.5) || 0) + (b - (crystalBoost.get(cx + 0.5) || 0)) * 0.08
        crystalBoost.set(cx + 0.5, cur); if (crystalBoost.has(cx)) { const v = crystalBoost.get(cx) - 0.016; v > 0 ? crystalBoost.set(cx, v) : crystalBoost.delete(cx) }
        const pulse = 0.6 + 0.4 * Math.sin(t * 1.4 + i)
        const glow = (0.35 + P.night * 0.65 + (1 - P.amb) * 0.3) * (0.7 + pulse * 0.3) + cur * 0.8
        g.save(); g.translate(sx, top * U); g.scale(U, U)
        const shards = [[0, -7, 1.3], [-1.6, -4.5, 1.0], [1.7, -4, 0.9], [0.9, -5.2, 0.7]]
        for (const [ox, h, w] of shards) {
          const gr = g.createLinearGradient(ox - w, 0, ox + w, h)
          gr.addColorStop(0, css(mix([40, 140, 150], [120, 255, 240], clamp(glow * 0.6, 0, 1)))); gr.addColorStop(1, css([220, 255, 250], 0.95))
          g.fillStyle = gr; g.beginPath(); g.moveTo(ox - w, 0); g.lineTo(ox - w * 0.7, h * 0.75); g.lineTo(ox, h); g.lineTo(ox + w * 0.7, h * 0.75); g.lineTo(ox + w, 0); g.fill()
        }
        g.restore()
        g.save(); g.globalCompositeOperation = 'lighter'
        const R = (6 + glow * 8) * U, gy = (top - 4) * U
        const gr = g.createRadialGradient(sx, gy, 0, sx, gy, R)
        gr.addColorStop(0, `rgba(110,255,235,${0.28 * glow})`); gr.addColorStop(1, 'rgba(60,200,220,0)')
        g.fillStyle = gr; g.beginPath(); g.arc(sx, gy, R, 0, 7); g.fill(); g.restore()
        if (Math.random() < 0.03 + cur * 0.15) motes.push({ x: cx + (Math.random() - 0.5) * 3, y: top - 3 - Math.random() * 4, vx: (Math.random() - 0.5) * 0.6, vy: -1 - Math.random(), life: 2.2, kind: 'spark' })
      } else if (d === 'banner') {
        const bx = sx, by = (top - 15.6) * U
        const c1 = mul([46, 64, 128], P.light, P.amb + 0.15), c2 = mix(mul([210, 170, 90], P.light, P.amb + 0.1), P.sun, 0.2)
        const pts = []
        for (let k = 0; k <= 10; k++) { const u = k / 10; pts.push([u * 6.5, Math.sin(t * 3.1 - u * 4 + i) * u * 0.9 + Math.sin(t * 1.3 + i) * u * 0.4]) }
        g.save(); g.translate(bx, by); g.scale(U, U)
        g.fillStyle = css(c1); g.beginPath(); g.moveTo(0, 0)
        for (const [u, w] of pts) g.lineTo(u, w)
        for (let k = pts.length - 1; k >= 0; k--) { const [u, w] = pts[k]; g.lineTo(u, w + 4.2 - u * 0.12 + (k === pts.length - 1 ? 0 : 0)) }
        g.closePath(); g.fill()
        g.fillStyle = css(c2)
        const m = pts[5]; g.beginPath(); g.arc(m[0], m[1] + 2.0, 0.85, 0, 7); g.fill()
        g.strokeStyle = css(c2, 0.9); g.lineWidth = 0.22; g.beginPath(); g.moveTo(0, 0); for (const [u, w] of pts) g.lineTo(u, w); g.stroke()
        g.restore()
      } else if (d === 'fire') {
        const fx = sx, fy = top * U
        g.save(); g.globalCompositeOperation = 'lighter'
        const R = (10 + P.night * 10) * U
        const gr = g.createRadialGradient(fx, fy - U, 0, fx, fy - U, R)
        gr.addColorStop(0, `rgba(255,170,80,${0.35 + P.night * 0.25})`); gr.addColorStop(1, 'rgba(255,120,40,0)')
        g.fillStyle = gr; g.beginPath(); g.arc(fx, fy - U, R, 0, 7); g.fill()
        for (let k = 0; k < 4; k++) {
          const fl = 2.6 + Math.sin(t * 11 + k * 2.1) * 0.6 + Math.sin(t * 17 + k) * 0.3, ox = (k - 1.5) * 0.7
          const fg2 = g.createLinearGradient(0, fy, 0, fy - fl * U)
          fg2.addColorStop(0, 'rgba(255,200,90,0.9)'); fg2.addColorStop(1, 'rgba(255,90,30,0)')
          g.fillStyle = fg2; g.beginPath(); g.moveTo(fx + (ox - 0.7) * U, fy - 0.4 * U)
          g.quadraticCurveTo(fx + (ox - 0.4) * U, fy - fl * 0.6 * U, fx + (ox + Math.sin(t * 6 + k) * 0.3) * U, fy - fl * U)
          g.quadraticCurveTo(fx + (ox + 0.5) * U, fy - fl * 0.6 * U, fx + (ox + 0.7) * U, fy - 0.4 * U); g.fill()
        }
        g.restore()
        if (Math.random() < 0.25) embers.push({ x: cx + (Math.random() - 0.5) * 1.5, y: top - 1.5, vx: (Math.random() - 0.3) * 1.2, vy: -3 - Math.random() * 3, life: 1.5 + Math.random() })
      }
    }
  }
  function drawSky() {
    const gr = g.createLinearGradient(0, 0, 0, H * 0.75)
    gr.addColorStop(0, css(P.top)); gr.addColorStop(0.55, css(P.mid)); gr.addColorStop(1, css(P.bot))
    g.fillStyle = gr; g.fillRect(0, 0, W, H)
    if (P.night > 0.1) {
      for (const s of stars) { const a = P.night * (0.5 + 0.5 * Math.sin(t * (0.6 + s.s) + s.p)); g.fillStyle = `rgba(235,240,255,${a})`; g.fillRect(((s.x * W - camX * U * 0.01) % W + W) % W, s.y * H, s.s * U * 0.18, s.s * U * 0.18) }
    }
    const sx = P.sunX * W, sy = P.sunY * H, sr = P.sunR * U
    g.save(); g.globalCompositeOperation = 'lighter'
    const halo = g.createRadialGradient(sx, sy, sr * 0.5, sx, sy, sr * 9)
    halo.addColorStop(0, css(P.sun, P.night > 0.9 ? 0.25 : 0.55)); halo.addColorStop(1, css(P.sun, 0))
    g.fillStyle = halo; g.fillRect(0, 0, W, H)
    if (P.night < 0.9) { // slow god rays
      for (let k = 0; k < 9; k++) {
        const a = k / 9 * Math.PI * 2 + t * 0.012, w = 0.05 + 0.03 * Math.sin(t * 0.2 + k * 2)
        g.fillStyle = css(P.sun, 0.05 + 0.03 * Math.sin(t * 0.3 + k)); g.beginPath(); g.moveTo(sx, sy)
        g.lineTo(sx + Math.cos(a - w) * W, sy + Math.sin(a - w) * W); g.lineTo(sx + Math.cos(a + w) * W, sy + Math.sin(a + w) * W); g.fill()
      }
    }
    g.restore()
    g.fillStyle = css(mix(P.sun, [255, 255, 255], 0.3)); g.beginPath(); g.arc(sx, sy, sr, 0, 7); g.fill()
    if (tod === 'night') { g.fillStyle = css(P.top, 0.9); g.beginPath(); g.arc(sx + sr * 0.45, sy - sr * 0.2, sr * 0.9, 0, 7); g.fill() }
    // clouds
    for (const c of clouds) {
      const x = ((c.x - t * c.v - camX * 0.0004 * c.s) % 1.6 + 1.6) % 1.6 * W - c.c.width * 0.6
      g.globalAlpha = 0.55 + c.s * 0.4; g.drawImage(c.c, x, c.y * U); g.globalAlpha = 1
    }
    // shooting star at night
    if (shoot) {
      shoot.t += 1 / 60
      const k = shoot.t / 1.6, x = shoot.x + shoot.dx * k, y = shoot.y + shoot.dy * k
      const gr2 = g.createLinearGradient(x, y, x - shoot.dx * 0.2, y - shoot.dy * 0.2)
      gr2.addColorStop(0, `rgba(255,255,255,${0.9 * Math.sin(Math.min(1, k) * Math.PI)})`); gr2.addColorStop(1, 'rgba(255,255,255,0)')
      g.strokeStyle = gr2; g.lineWidth = U * 0.2; g.beginPath(); g.moveTo(x, y); g.lineTo(x - shoot.dx * 0.2, y - shoot.dy * 0.2); g.stroke()
      if (k > 1) shoot = null
    }
  }
  function drawBirds(dt) {
    nextBirds -= dt
    if (nextBirds < 0) {
      nextBirds = 25 + Math.random() * 30
      const n = 4 + (Math.random() * 6 | 0), dir = Math.random() < 0.5 ? 1 : -1, y0 = 18 + Math.random() * 20
      for (let k = 0; k < n; k++) birds.push({ x: dir > 0 ? -10 - k * 3 : VW + 10 + k * 3, y: y0 + Math.abs(k - n / 2) * 1.6 + Math.random(), v: dir * (9 + Math.random()), p: Math.random() * 6, s: 0.8 + Math.random() * 0.3 })
    }
    g.strokeStyle = css(mix(P.top, [20, 16, 30], 0.6), 0.75); g.lineWidth = U * 0.22; g.lineCap = 'round'
    for (let k = birds.length - 1; k >= 0; k--) {
      const b = birds[k]; b.x += b.v * dt; b.p += dt * 9; b.y += Math.sin(b.p * 0.2) * dt * 0.6
      if (b.x < -20 || b.x > VW + 20) { birds.splice(k, 1); continue }
      const w = Math.sin(b.p) * 0.9 * b.s, x = b.x * U, y = b.y * U
      g.beginPath(); g.moveTo(x - 1.2 * U * b.s, y - w * U); g.lineTo(x, y); g.lineTo(x + 1.2 * U * b.s, y - w * U); g.stroke()
    }
  }
  function drawParticles(dt) {
    g.save(); g.globalCompositeOperation = 'lighter'
    for (let k = embers.length - 1; k >= 0; k--) {
      const e = embers[k]; e.life -= dt; if (e.life < 0) { embers.splice(k, 1); continue }
      e.x += e.vx * dt + Math.sin(t * 3 + k) * dt * 0.6; e.y += e.vy * dt; e.vy *= 0.99
      g.fillStyle = `rgba(255,${150 + (e.life * 40 | 0)},70,${Math.min(1, e.life)})`; g.fillRect((e.x - camX) * U, e.y * U, U * 0.3, U * 0.3)
    }
    for (let k = motes.length - 1; k >= 0; k--) {
      const m = motes[k]; m.life -= dt; if (m.life < 0) { motes.splice(k, 1); continue }
      m.x += m.vx * dt; m.y += m.vy * dt
      if (m.kind === 'spark') { g.fillStyle = `rgba(150,255,240,${Math.min(1, m.life) * 0.8})`; g.fillRect((m.x - camX) * U, m.y * U, U * 0.28, U * 0.28) }
      else { g.fillStyle = css(P.haze, m.life * 0.5); g.beginPath(); g.arc((m.x - camX) * U, m.y * U, U * 0.6 * (1.2 - m.life), 0, 7); g.fill() }
    }
    g.restore()
    // fireflies at night, dust in the light by day
    const n = 24
    for (let k = 0; k < n; k++) {
      const wx = ((hash(k, 71) * 160 + Math.sin(t * 0.2 + k) * 6 - camX * 0.9) % 160 + 160) % 160 * VW / 160
      const wy = 40 + hash(k, 72) * 45 + Math.sin(t * 0.37 + k * 1.7) * 3
      if (P.night > 0.5) { const a = Math.max(0, Math.sin(t * (0.8 + hash(k, 73)) + k)); g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = `rgba(210,255,140,${a * 0.85})`; g.beginPath(); g.arc(wx * U, wy * U, U * 0.32, 0, 7); g.fill(); g.restore() }
      else { g.fillStyle = css(mix(P.sun, [255, 255, 255], 0.4), 0.25 + 0.2 * Math.sin(t + k)); g.fillRect(wx * U, wy * U, U * 0.16, U * 0.16) }
    }
  }
  function drawMist(f, y, alpha) {
    const off = ((t * 1.2 + camX * f) * U) % mist.width
    g.globalAlpha = alpha
    g.drawImage(mist, -off, y * U); g.drawImage(mist, -off + mist.width, y * U)
    g.globalAlpha = 1
  }

  function frame(dt) {
    t += dt
    if (P.night > 0.5) { nextShoot -= dt; if (nextShoot < 0) { nextShoot = 15 + Math.random() * 25; shoot = { x: Math.random() * W * 0.6 + W * 0.2, y: Math.random() * H * 0.2, dx: (Math.random() < 0.5 ? -1 : 1) * W * 0.25, dy: H * 0.12, t: 0 } } }
    stepHero(dt)
    pointer.still += dt
    // dead-zone camera
    const sxp = hero.x - camX
    let target = camX
    if (sxp > VW * 0.62) target = hero.x - VW * 0.62
    else if (sxp < VW * 0.3) target = hero.x - VW * 0.3
    camX += (target - camX) * Math.min(1, dt * 2.2)

    drawSky()
    drawLayer('peaks', 0.06, camX)
    drawMist(0.08, 50, 0.3)
    drawLayer('far', 0.16, camX)
    drawBirds(dt)
    drawMist(0.22, 62, 0.55)
    drawLayer('mid', 0.34, camX)
    const cg = g.createLinearGradient(0, 72 * U, 0, H)
    cg.addColorStop(0, css(P.haze, 0)); cg.addColorStop(1, css(mix(P.haze, P.top, 0.5), 0.85))
    g.fillStyle = cg; g.fillRect(0, 72 * U, W, H)
    drawMist(0.45, 74, 0.8)
    drawLayer('near', 0.62, camX)
    drawGround(camX)
    drawLiveDeco()
    drawHero()
    drawParticles(dt)
    drawLayer('front', 1.35, camX)
    // warm grade + vignette
    const vg = g.createRadialGradient(W / 2, H * 0.45, H * 0.35, W / 2, H * 0.5, H * 1.05)
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(10,6,18,${0.35 + P.night * 0.2})`)
    g.fillStyle = vg; g.fillRect(0, 0, W, H)
    if (fadeT > 0) { g.globalAlpha = fadeT / 2; g.drawImage(fade, 0, 0); g.globalAlpha = 1; fadeT -= dt }
  }

  // ---------- loop / events ----------
  let raf = 0, last = 0, alive = true
  function loop(now) {
    if (!alive) return
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now
    frame(dt)
    raf = requestAnimationFrame(loop)
  }
  function setTod(v) {
    if (!PAL[v] || v === tod) return
    fg.clearRect(0, 0, W, H); fg.drawImage(cv, 0, 0); fadeT = ctx.reducedMotion ? 0 : 2
    tod = v; P = PAL[v]; tiles.clear(); makeSprites()
    if (ctx.reducedMotion) frame(0)
  }
  function onPointer(e) {
    const r = cv.getBoundingClientRect(), k = W / (r.width || 1)
    const x = (e.x - r.left) * k, y = (e.y - r.top) * k
    if (e.type === 'move' || e.type === 'down') {
      if (Math.hypot(x - pointer.px, y - pointer.py) > 3 * k) pointer.still = 0
      pointer.px = x; pointer.py = y
      pointer.x = x; pointer.y = y; pointer.active = true; pointer.last = t
      if (e.type === 'down') pointer.still = 0
    }
  }
  resize()
  const ro = new ResizeObserver(() => { resize(); if (ctx.reducedMotion) frame(0) })
  ro.observe(container)
  const offPointer = ctx.onPointer ? ctx.onPointer(onPointer) : null
  const offClock = ctx.subscribe ? ctx.subscribe((s) => setTod(s.timeOfDay)) : null
  if (ctx.reducedMotion) { for (let k = 0; k < 3; k++) frame(0.016) } else { last = performance.now(); raf = requestAnimationFrame(loop) }
  requestAnimationFrame(() => requestAnimationFrame(() => ctx.ready && ctx.ready()))

  const api = {
    unmount() { alive = false; cancelAnimationFrame(raf); ro.disconnect(); offPointer && offPointer(); offClock && offClock(); cv.remove() },
  }
  return api
}
