// Hand control (camera), live wallpaper only, off unless the user ticks the tray switch.
// The camera picture is shrunk to 64×48 grey pixels, mirrored, and compared with the
// previous frame: blocks that changed become "motion blobs", each followed from frame to
// frame. Scenes get only those moving blocks (positions in CSS px + velocity), never the
// picture. Nothing is drawn, stored or sent anywhere.

export const GW = 64, GH = 48, BLOCK = 4
const BW = GW / BLOCK, BH = GH / BLOCK
const NOISE = 9 // grey-level change below this is camera noise
const MOVING = 4 // block energy above this counts as moving

// Pure part (tested): previous + current grey frames -> { energy, blobs }.
// energy: Float32Array(BW*BH), blobs: [{ x, y, w, cells }] in block units.
export function detectMotion(prev, cur) {
  const energy = new Float32Array(BW * BH)
  for (let y = 0; y < GH; y++) {
    for (let x = 0; x < GW; x++) {
      const i = y * GW + x, d = Math.abs(cur[i] - prev[i])
      if (d > NOISE) energy[((y / BLOCK) | 0) * BW + ((x / BLOCK) | 0)] += d
    }
  }
  for (let i = 0; i < energy.length; i++) energy[i] /= BLOCK * BLOCK
  const seen = new Uint8Array(energy.length), blobs = []
  for (let i = 0; i < energy.length; i++) {
    if (seen[i] || energy[i] < MOVING) continue
    const stack = [i], cells = []
    seen[i] = 1
    let sx = 0, sy = 0, w = 0
    while (stack.length) {
      const c = stack.pop(), cx = c % BW, cy = (c / BW) | 0, e = energy[c]
      cells.push(c); sx += cx * e; sy += cy * e; w += e
      for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
        if (nx < 0 || ny < 0 || nx >= BW || ny >= BH) continue
        const n = ny * BW + nx
        if (!seen[n] && energy[n] >= MOVING) { seen[n] = 1; stack.push(n) }
      }
    }
    if (cells.length >= 2) blobs.push({ x: sx / w, y: sy / w, w, cells })
  }
  return { energy, blobs }
}

// Matches each blob to the nearest one of the last frame and gives it a smoothed velocity
// (block units per second).
export function trackBlobs(blobs, last, dt) {
  for (const b of blobs) {
    let best = null, bd = 4.5
    for (const p of last) { const q = Math.hypot(p.x - b.x, p.y - b.y); if (q < bd) { bd = q; best = p } }
    b.vx = best ? best.vx * 0.45 + ((b.x - best.x) / dt) * 0.55 : 0
    b.vy = best ? best.vy * 0.45 + ((b.y - best.y) / dt) * 0.55 : 0
  }
  return blobs
}

// The camera runner. emit({ cells: [{ x, y, vx, vy, e }] }) in CSS px of the window, 15 times
// a second while moving. setEnabled / setFrozen decide whether the camera is open.
export function createHandCamera({ emit, log = () => {}, win = window } = {}) {
  let enabled = false, frozen = false, stream = null, timer = 0, starting = false
  let prev = null, last = [], lastT = 0
  const small = win.document.createElement('canvas'); small.width = GW; small.height = GH
  const sx = small.getContext('2d', { willReadFrequently: true })
  const video = win.document.createElement('video'); video.muted = true; video.playsInline = true
  const cur = new Float32Array(GW * GH)

  async function open() {
    if (stream || starting) return
    starting = true
    try {
      stream = await win.navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 15 } }, audio: false })
      if (!enabled || frozen) { close(); return }
      video.srcObject = stream
      await video.play()
      prev = null; last = []; lastT = win.performance.now()
      timer = win.setInterval(tick, 1000 / 15)
      log('camera: on')
    } catch (error) {
      stream = null
      log('camera: unavailable (' + (error && error.name) + ')')
    } finally { starting = false }
  }
  function close() {
    win.clearInterval(timer); timer = 0
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; log('camera: off') }
    video.srcObject = null
  }
  function update() { if (enabled && !frozen) open(); else close() }
  function tick() {
    if (!stream || video.readyState < 2) return
    const now = win.performance.now(), dt = Math.max(0.03, (now - lastT) / 1000)
    lastT = now
    sx.setTransform(-1, 0, 0, 1, GW, 0) // mirrored: your right hand moves things to the right
    sx.drawImage(video, 0, 0, GW, GH)
    const d = sx.getImageData(0, 0, GW, GH).data
    for (let i = 0; i < GW * GH; i++) cur[i] = d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11
    if (!prev) { prev = Float32Array.from(cur); return }
    const { energy, blobs } = detectMotion(prev, cur)
    prev.set(cur)
    last = trackBlobs(blobs, last, dt)
    if (!blobs.length) return
    const W = win.innerWidth, H = win.innerHeight, kx = W / BW, ky = H / BH, cells = []
    for (const b of blobs) {
      for (const c of b.cells) {
        const cx = c % BW, cy = (c / BW) | 0
        cells.push({ x: (cx + 0.5) * kx, y: (cy + 0.5) * ky, vx: b.vx * kx, vy: b.vy * ky, e: Math.min(1, (energy[c] - MOVING) / 14), bx: (b.x + 0.5) * kx, by: (b.y + 0.5) * ky })
      }
    }
    emit({ cells })
  }
  return {
    setEnabled(on) { enabled = on; update() },
    setFrozen(on) { frozen = on; update() },
    stop() { enabled = false; close() },
  }
}
