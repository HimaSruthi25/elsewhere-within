// Lakeside Blocks — a living blocky village by a lake (Elsewhere, Within)
// Original voxel diorama look (flat-coloured bevelled blocks, no textures). WebGL2, no pictures, no network.
// API: mount(container, ctx) -> { unmount }

const X = 128, Z = 96, Y = 40, WL = 8, WATER_Y = 7.85
const hash3 = (a, b, c) => {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 2147483647)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
const vn2 = (x, z, s) => {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf)
  const a = hash3(xi, zi, s), b = hash3(xi + 1, zi, s), c = hash3(xi, zi + 1, s), d = hash3(xi + 1, zi + 1, s)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}
const fbm2 = (x, z, s = 0) => vn2(x, z, s) * 0.55 + vn2(x * 2.1, z * 2.1, s + 1) * 0.3 + vn2(x * 4.3, z * 4.3, s + 2) * 0.15
const clamp = (v, a, b) => v < a ? a : v > b ? b : v
const lerp = (a, b, t) => a + (b - a) * t

// block types: colour (sRGB 0..255), emissive
const B = {
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, SAND: 4, PLANK: 5, LOG: 6, LEAF: 7, ROOF_R: 8, ROOF_B: 9, PLASTER: 10, WINDOW: 11, DOOR: 12, LANTERN: 13,
  GRAVEL: 14, SOIL: 15, PUMPKIN: 16, DOCK: 17, COBBLE: 18, LEAF2: 19, ROOF_G: 20, BED: 21, HAY: 22,
}
const COL = []
COL[B.GRASS] = [112, 168, 78]; COL[B.DIRT] = [134, 98, 70]; COL[B.STONE] = [128, 130, 136]; COL[B.SAND] = [222, 204, 150]
COL[B.PLANK] = [176, 128, 82]; COL[B.LOG] = [104, 76, 52]; COL[B.LEAF] = [70, 132, 64]; COL[B.LEAF2] = [96, 150, 58]
COL[B.ROOF_R] = [178, 74, 58]; COL[B.ROOF_B] = [70, 98, 150]; COL[B.ROOF_G] = [76, 120, 92]; COL[B.PLASTER] = [232, 222, 202]
COL[B.WINDOW] = [70, 92, 116]; COL[B.DOOR] = [120, 80, 50]; COL[B.LANTERN] = [255, 196, 110]; COL[B.GRAVEL] = [168, 160, 146]
COL[B.SOIL] = [96, 68, 48]; COL[B.PUMPKIN] = [226, 128, 40]; COL[B.DOCK] = [150, 110, 72]; COL[B.COBBLE] = [118, 116, 112]
COL[B.BED] = [110, 120, 100]; COL[B.HAY] = [222, 186, 92]
const EMIT = new Float32Array(32); EMIT[B.WINDOW] = 1; EMIT[B.LANTERN] = 1

const TOD = {
  dawn: { sun: [-0.75, 0.32, -0.35], sunCol: [1.0, 0.72, 0.58], amb: [0.42, 0.42, 0.55], ground: [0.32, 0.26, 0.22], skyTop: [0.30, 0.38, 0.62], skyHor: [0.98, 0.72, 0.62], fog: [0.86, 0.70, 0.66], night: 0.15, water: [0.20, 0.36, 0.45] },
  day: { sun: [0.35, 0.82, -0.45], sunCol: [1.05, 0.98, 0.9], amb: [0.5, 0.56, 0.66], ground: [0.3, 0.3, 0.24], skyTop: [0.30, 0.52, 0.86], skyHor: [0.78, 0.88, 0.96], fog: [0.76, 0.85, 0.93], night: 0, water: [0.14, 0.40, 0.48] },
  dusk: { sun: [0.78, 0.26, -0.4], sunCol: [1.1, 0.62, 0.36], amb: [0.42, 0.36, 0.48], ground: [0.3, 0.2, 0.18], skyTop: [0.22, 0.24, 0.48], skyHor: [1.0, 0.58, 0.40], fog: [0.88, 0.58, 0.48], night: 0.35, water: [0.18, 0.26, 0.38] },
  night: { sun: [-0.4, 0.62, -0.5], sunCol: [0.09, 0.11, 0.22], amb: [0.035, 0.045, 0.09], ground: [0.02, 0.02, 0.03], skyTop: [0.02, 0.03, 0.09], skyHor: [0.08, 0.12, 0.24], fog: [0.07, 0.10, 0.19], night: 1, water: [0.04, 0.08, 0.14] },
}
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l] }

// ---------- matrices ----------
const M = {
  persp(fy, a, n, f) { const t = 1 / Math.tan(fy / 2); return new Float32Array([t / a, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0]) },
  ortho(l, r, b, t, n, f) { return new Float32Array([2 / (r - l), 0, 0, 0, 0, 2 / (t - b), 0, 0, 0, 0, -2 / (f - n), 0, -(r + l) / (r - l), -(t + b) / (t - b), -(f + n) / (f - n), 1]) },
  look(e, c, u) {
    const z = norm([e[0] - c[0], e[1] - c[1], e[2] - c[2]]), x = norm([u[1] * z[2] - u[2] * z[1], u[2] * z[0] - u[0] * z[2], u[0] * z[1] - u[1] * z[0]])
    const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]]
    return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -(x[0] * e[0] + x[1] * e[1] + x[2] * e[2]), -(y[0] * e[0] + y[1] * e[1] + y[2] * e[2]), -(z[0] * e[0] + z[1] * e[1] + z[2] * e[2]), 1])
  },
  mul(a, b) { const o = new Float32Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s } return o },
  inv(m) {
    const a = m, o = new Float32Array(16)
    const b00 = a[0] * a[5] - a[1] * a[4], b01 = a[0] * a[6] - a[2] * a[4], b02 = a[0] * a[7] - a[3] * a[4], b03 = a[1] * a[6] - a[2] * a[5], b04 = a[1] * a[7] - a[3] * a[5], b05 = a[2] * a[7] - a[3] * a[6]
    const b06 = a[8] * a[13] - a[9] * a[12], b07 = a[8] * a[14] - a[10] * a[12], b08 = a[8] * a[15] - a[11] * a[12], b09 = a[9] * a[14] - a[10] * a[13], b10 = a[9] * a[15] - a[11] * a[13], b11 = a[10] * a[15] - a[11] * a[14]
    const d = 1 / (b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06)
    o[0] = (a[5] * b11 - a[6] * b10 + a[7] * b09) * d; o[1] = (a[2] * b10 - a[1] * b11 - a[3] * b09) * d; o[2] = (a[13] * b05 - a[14] * b04 + a[15] * b03) * d; o[3] = (a[10] * b04 - a[9] * b05 - a[11] * b03) * d
    o[4] = (a[6] * b08 - a[4] * b11 - a[7] * b07) * d; o[5] = (a[0] * b11 - a[2] * b08 + a[3] * b07) * d; o[6] = (a[14] * b02 - a[12] * b05 - a[15] * b01) * d; o[7] = (a[8] * b05 - a[10] * b02 + a[11] * b01) * d
    o[8] = (a[4] * b10 - a[5] * b08 + a[7] * b06) * d; o[9] = (a[1] * b08 - a[0] * b10 - a[3] * b06) * d; o[10] = (a[12] * b04 - a[13] * b02 + a[15] * b00) * d; o[11] = (a[9] * b02 - a[8] * b04 - a[11] * b00) * d
    o[12] = (a[5] * b07 - a[4] * b09 - a[6] * b06) * d; o[13] = (a[0] * b09 - a[1] * b07 + a[2] * b06) * d; o[14] = (a[13] * b01 - a[12] * b03 - a[14] * b00) * d; o[15] = (a[8] * b03 - a[9] * b01 + a[10] * b00) * d
    return o
  },
  xf(m, p) { const x = p[0], y = p[1], z = p[2]; const w = m[3] * x + m[7] * y + m[11] * z + m[15]; return [(m[0] * x + m[4] * y + m[8] * z + m[12]) / w, (m[1] * x + m[5] * y + m[9] * z + m[13]) / w, (m[2] * x + m[6] * y + m[10] * z + m[14]) / w, w] },
}

// ---------- world generation ----------
function buildWorld(seed) {
  const W = new Uint8Array(X * Y * Z)
  const I = (x, y, z) => x + X * (z + Z * y)
  const get = (x, y, z) => (x < 0 || y < 0 || z < 0 || x >= X || y >= Y || z >= Z) ? 0 : W[I(x, y, z)]
  const set = (x, y, z, b) => { if (x >= 0 && y >= 0 && z >= 0 && x < X && y < Y && z < Z) W[I(x, y, z)] = b }
  let s = seed >>> 0
  const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296
  const LX = 64, LZ = 56
  const lakeD = (x, z) => Math.hypot((x - LX) / 17, (z - LZ) / 10) + (fbm2(x / 8, z / 8, 9) - 0.5) * 0.45
  const H = new Int16Array(X * Z)
  for (let z = 0; z < Z; z++) for (let x = 0; x < X; x++) {
    const n = fbm2(x / 26, z / 26, seed)
    const back = clamp((34 - z) / 34, 0, 1), side = Math.max(clamp((24 - x) / 24, 0, 1), clamp((x - 104) / 24, 0, 1))
    let h = 9.5 + (n - 0.5) * 4 + Math.pow(back, 1.6) * 13 + side * side * 10 + (fbm2(x / 10, z / 10, seed + 7) - 0.5) * 2.4 * (0.4 + back + side)
    const d = lakeD(x, z)
    if (d < 1) h = Math.min(h, 7.2 - (1 - d) * 5.5)
    else if (d < 1.45) h = Math.min(h, 7.6 + (d - 1) / 0.45 * 2.2)
    H[x + X * z] = clamp(Math.floor(h), 2, Y - 8)
  }
  for (let z = 0; z < Z; z++) for (let x = 0; x < X; x++) {
    const h = H[x + X * z], d = lakeD(x, z)
    for (let y = 0; y < h; y++) {
      let b = y < h - 4 ? B.STONE : y < h - 1 ? B.DIRT : B.GRASS
      if (y === h - 1) {
        if (h <= WL + 1 && d < 1.3) b = B.SAND
        else if (h <= WL - 1) b = B.SAND
        if (h > 19 && fbm2(x / 5, z / 5, 3) > 0.62) b = B.STONE
      }
      set(x, y, z, b)
    }
  }
  const top = (x, z) => H[clamp(x, 0, X - 1) + X * clamp(z, 0, Z - 1)]
  const used = new Uint8Array(X * Z)
  const free = (x0, z0, w, d, pad = 1) => {
    for (let z = z0 - pad; z < z0 + d + pad; z++) for (let x = x0 - pad; x < x0 + w + pad; x++) {
      if (x < 2 || z < 2 || x >= X - 2 || z >= Z - 2 || used[x + X * z]) return false
      if (top(x, z) <= WL) return false
    }
    return true
  }
  const mark = (x0, z0, w, d) => { for (let z = z0; z < z0 + d; z++) for (let x = x0; x < x0 + w; x++) used[x + X * z] = 1 }

  // houses around the lake
  const houses = [], chimneys = [], lanterns = [], windows = []
  const roofs = [B.ROOF_R, B.ROOF_B, B.ROOF_G, B.ROOF_R]
  let tries = 0
  while (houses.length < 7 && tries++ < 6000) {
    const a = rnd() * Math.PI * 2, rr = 1.45 + rnd() * 0.75
    const cx = Math.round(LX + Math.cos(a) * 21 * rr), cz = Math.round(LZ + Math.sin(a) * 13 * rr)
    if (cz > LZ + 12 || cz < 22) continue // keep the near shore open
    const w = 5 + (rnd() * 3 | 0), d = 5 + (rnd() * 2 | 0)
    const x0 = cx - (w >> 1), z0 = cz - (d >> 1)
    if (!free(x0, z0, w, d, 2)) continue
    let mn = 99, mx = 0
    for (let z = z0; z < z0 + d; z++) for (let x = x0; x < x0 + w; x++) { const h = top(x, z); mn = Math.min(mn, h); mx = Math.max(mx, h) }
    if (mx - mn > 2) continue
    houses.push({ x0, z0, w, d, base: mx, roof: roofs[houses.length % roofs.length], plaster: rnd() < 0.6, chimney: rnd() < 0.75 })
    mark(x0 - 1, z0 - 1, w + 2, d + 3)
  }
  for (const h of houses) {
    const { x0, z0, w, d, base } = h
    // level the plot
    for (let z = z0 - 1; z < z0 + d + 2; z++) for (let x = x0 - 1; x < x0 + w + 1; x++) {
      for (let y = top(x, z); y < base; y++) set(x, y, z, B.DIRT)
      for (let y = base; y < Y; y++) set(x, y, z, 0)
      set(x, base - 1, z, B.GRASS); H[x + X * z] = base
    }
    // door faces the lake (choose the wall nearest)
    const doorSouth = z0 + d / 2 < LZ
    const dz = doorSouth ? z0 + d - 1 : z0, dx = x0 + (w >> 1)
    for (let y = base; y < base + 4; y++) for (let z = z0; z < z0 + d; z++) for (let x = x0; x < x0 + w; x++) {
      const edgeX = x === x0 || x === x0 + w - 1, edgeZ = z === z0 || z === z0 + d - 1
      if (!edgeX && !edgeZ) continue
      let b = edgeX && edgeZ ? B.LOG : (y === base ? B.COBBLE : h.plaster ? B.PLASTER : B.PLANK)
      if (!(edgeX && edgeZ) && y >= base + 1 && y <= base + 2 && ((edgeZ && (x - x0) % 2 === 1 && x !== dx) || (edgeX && (z - z0) % 3 === 1))) { b = B.WINDOW; if (y === base + 1) windows.push([x, y, z]) }
      if (x === dx && z === dz && y < base + 2) b = y === base ? B.DOOR : B.DOOR
      set(x, y, z, b)
    }
    // gable roof along x
    const rb = base + 4
    for (let k = 0; k <= Math.ceil(d / 2); k++) {
      const za = z0 - 1 + k, zb = z0 + d - k
      if (za > zb) break
      for (let x = x0 - 1; x <= x0 + w; x++) { set(x, rb + k, za, h.roof); set(x, rb + k, zb, h.roof) }
      for (let x = x0; x < x0 + w; x++) for (let z = za + 1; z < zb; z++) if (k > 0) { if (x === x0 || x === x0 + w - 1) set(x, rb + k - 1, z, h.plaster ? B.PLASTER : B.PLANK) }
    }
    if (h.chimney) {
      const cx = x0 + 1, cz = z0 + 1
      for (let y = base + 3; y < rb + Math.ceil(d / 2) + 2; y++) set(cx, y, cz, B.COBBLE)
      chimneys.push([cx + 0.5, rb + Math.ceil(d / 2) + 2, cz + 0.5])
    }
    // lantern post by the door
    const lx = dx + 2, lz = doorSouth ? dz + 2 : dz - 2
    if (lx < X && lz >= 0 && lz < Z) { const ty = top(lx, lz); set(lx, ty, lz, B.LOG); set(lx, ty + 1, lz, B.LOG); set(lx, ty + 2, lz, B.LANTERN); lanterns.push([lx + 0.5, ty + 2.5, lz + 0.5]); used[lx + X * lz] = 1 }
    // gravel path toward the lake
    let px = dx, pz = doorSouth ? dz + 1 : dz - 1
    for (let k = 0; k < 30; k++) {
      if (px < 0 || pz < 0 || px >= X || pz >= Z) break
      const t0 = top(px, pz); if (t0 <= WL + 1) break
      if (get(px, t0 - 1, pz) === B.GRASS) set(px, t0 - 1, pz, B.GRAVEL)
      const ddx = LX - px, ddz = LZ - pz
      if (Math.abs(ddx) * 0.6 > Math.abs(ddz)) px += Math.sign(ddx); else pz += Math.sign(ddz)
    }
    h.door = [dx + 0.5, base, dz + 0.5]
  }
  // pumpkin patch + hay next to the first house
  if (houses.length) {
    const h = houses[0], fx = h.x0 + h.w + 2, fz = h.z0
    for (let z = fz; z < fz + 6; z++) for (let x = fx; x < fx + 5; x++) {
      if (x >= X || used[x + X * z]) continue
      const t0 = top(x, z); if (t0 <= WL + 1) continue
      set(x, t0 - 1, z, B.SOIL)
      if ((z - fz) % 2 === 0 && rnd() < 0.45) set(x, t0, z, B.PUMPKIN)
      used[x + X * z] = 1
    }
    const hx = h.x0 - 3, hz = h.z0 + 2
    if (hx > 2) { const t0 = top(hx, hz); set(hx, t0, hz, B.HAY); set(hx, t0, hz + 1, B.HAY); set(hx, t0 + 1, hz, B.HAY) }
  }
  // dock into the lake from the near shore
  const dock = { x: LX + 6, z: 0, len: 0 }
  for (let z = Z - 1; z > LZ; z--) { if (top(dock.x, z) <= WL) { dock.z = z; break } }
  for (let k = 0; k < 9; k++) { const z = dock.z - k; for (let x = dock.x; x < dock.x + 2; x++) set(x, WL, z, B.DOCK); if (k % 3 === 0) { set(dock.x, WL - 1, z, B.LOG); set(dock.x + 1, WL - 1, z, B.LOG) } dock.len = k }
  set(dock.x + 1, WL + 1, dock.z - dock.len, B.LOG); set(dock.x + 1, WL + 2, dock.z - dock.len, B.LANTERN); lanterns.push([dock.x + 1.5, WL + 2.5, dock.z - dock.len + 0.5])
  // building site: flat plot on the near-left shore
  let site = null
  for (let k = 0; k < 3000 && !site; k++) {
    const x0 = 26 + (rnd() * 70 | 0), z0 = LZ + 4 + (rnd() * 18 | 0), w = 6, d = 5
    if (!free(x0, z0, w, d, 1)) continue
    let mn = 99, mx = 0
    for (let z = z0; z < z0 + d; z++) for (let x = x0; x < x0 + w; x++) { const h = top(x, z); mn = Math.min(mn, h); mx = Math.max(mx, h) }
    if (mx - mn > 2) continue
    for (let z = z0 - 1; z < z0 + d + 1; z++) for (let x = x0 - 1; x < x0 + w + 1; x++) { for (let y = top(x, z); y < mx; y++) set(x, y, z, B.DIRT); for (let y = mx; y < Y; y++) set(x, y, z, 0); set(x, mx - 1, z, B.GRAVEL); H[x + X * z] = mx }
    site = { x0, z0, w, d, base: mx }; mark(x0 - 1, z0 - 1, w + 2, d + 2)
  }
  // trees
  const trees = []
  for (let k = 0; k < 900 && trees.length < 70; k++) {
    const x = 3 + (rnd() * (X - 6) | 0), z = 3 + (rnd() * (Z - 6) | 0)
    if (!free(x - 2, z - 2, 5, 5, 0) || top(x, z) <= WL + 1) continue
    if (z > Z - 14 && x > 40 && x < 90) continue // keep the foreground clear
    const ty = top(x, z), th = 4 + (rnd() * 3 | 0), pine = ty > 18 || rnd() < 0.25
    for (let y = ty; y < ty + th; y++) set(x, y, z, B.LOG)
    const leaf = rnd() < 0.5 ? B.LEAF : B.LEAF2
    if (pine) {
      for (let y = ty + 2, r = 2; y < ty + th + 3; y++) {
        const rr = Math.max(0, r - ((y - ty - 2) / 1.6 | 0))
        for (let dz = -rr; dz <= rr; dz++) for (let dx = -rr; dx <= rr; dx++) if (Math.abs(dx) + Math.abs(dz) <= rr + 0.5 && !get(x + dx, y, z + dz)) set(x + dx, y, z + dz, B.LEAF)
      }
    } else {
      const r = 2 + (rnd() < 0.4 ? 1 : 0), cy = ty + th
      for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        const q = (dx * dx + dz * dz) / (r * r) + (dy * dy) / ((r - 0.6) * (r - 0.6))
        if (q < 1.05 + (hash3(x + dx, cy + dy, z + dz) - 0.5) * 0.5 && !get(x + dx, cy + dy, z + dz)) set(x + dx, cy + dy, z + dz, leaf)
      }
    }
    trees.push([x, z]); mark(x - 1, z - 1, 3, 3)
  }
  return { W, H, get, set, I, houses, chimneys, lanterns, windows, trees, dock, site, LX, LZ, lakeD, top }
}

// ---------- meshing ----------
const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]
const FLOATS = 13
function pushV(o, x, y, z, nx, ny, nz, c, ao, em, u, v) { o.push(x, y, z, nx, ny, nz, c[0], c[1], c[2], ao, em, u, v) }
function meshVoxels(world) {
  const { get } = world, out = []
  const solid = (x, y, z) => { const b = get(x, y, z); return b !== 0 }
  for (let y = 0; y < Y; y++) for (let z = 0; z < Z; z++) for (let x = 0; x < X; x++) {
    const b = get(x, y, z); if (!b) continue
    const tint = 0.92 + hash3(x, y, z) * 0.14
    const base = COL[b]
    for (let f = 0; f < 6; f++) {
      const n = DIRS[f]
      if (solid(x + n[0], y + n[1], z + n[2])) continue
      if (n[1] === -1 && y === 0) continue
      const a = n[0] ? 0 : n[1] ? 1 : 2, s = n[a]
      const ua = (a + 1) % 3, va = (a + 2) % 3
      let c = base
      if (b === B.GRASS && n[1] !== 1) c = [base[0] * 0.86, base[1] * 0.86, base[2] * 0.8]
      c = [c[0] / 255 * tint, c[1] / 255 * tint, c[2] / 255 * tint]
      const em = EMIT[b] || 0
      const corners = s > 0 ? [[0, 0], [1, 0], [1, 1], [0, 1]] : [[0, 0], [0, 1], [1, 1], [1, 0]]
      const vs = []
      for (const [cu, cv] of corners) {
        const p = [x, y, z]; if (s > 0) p[a] += 1
        p[ua] += cu; p[va] += cv
        const o1 = [n[0], n[1], n[2]], o2 = [n[0], n[1], n[2]], o3 = [n[0], n[1], n[2]]
        o1[ua] += cu ? 1 : -1; o2[va] += cv ? 1 : -1; o3[ua] += cu ? 1 : -1; o3[va] += cv ? 1 : -1
        const s1 = solid(x + o1[0], y + o1[1], z + o1[2]) ? 1 : 0, s2 = solid(x + o2[0], y + o2[1], z + o2[2]) ? 1 : 0, s3 = solid(x + o3[0], y + o3[1], z + o3[2]) ? 1 : 0
        const ao = (s1 && s2) ? 0 : 3 - s1 - s2 - s3
        vs.push([p, ao / 3, cu, cv])
      }
      const order = vs[0][1] + vs[2][1] > vs[1][1] + vs[3][1] ? [0, 1, 2, 0, 2, 3] : [1, 2, 3, 1, 3, 0]
      for (const k of order) { const [p, ao, u, v] = vs[k]; pushV(out, p[0], p[1], p[2], n[0], n[1], n[2], c, 0.45 + ao * 0.55, em, u, v) }
    }
  }
  return new Float32Array(out)
}
// a box (for details, creatures, clouds, smoke); yaw about (px,pz)
function addBox(out, x0, y0, z0, x1, y1, z1, col, em = 0, yaw = 0, px = 0, pz = 0) {
  const c = [col[0] / 255, col[1] / 255, col[2] / 255]
  const cs = Math.cos(yaw), sn = Math.sin(yaw)
  const R = (x, z) => [px + (x - px) * cs - (z - pz) * sn, pz + (x - px) * sn + (z - pz) * cs]
  const P = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]].map(([x, y, z]) => { const [rx, rz] = R(x, z); return [rx, y, rz] })
  const F = [[1, 5, 6, 2, [1, 0, 0]], [4, 0, 3, 7, [-1, 0, 0]], [3, 2, 6, 7, [0, 1, 0]], [4, 5, 1, 0, [0, -1, 0]], [5, 4, 7, 6, [0, 0, 1]], [0, 1, 2, 3, [0, 0, -1]]]
  const UV = [[0, 0], [1, 0], [1, 1], [0, 1]]
  for (const [a, b, d, e, n] of F) {
    const [nx, nz] = [n[0] * cs - n[2] * sn, n[0] * sn + n[2] * cs]
    const q = [a, b, d, e]
    for (const k of [0, 1, 2, 0, 2, 3]) { const p = P[q[k]]; pushV(out, p[0], p[1], p[2], nx, n[1], nz, c, 1, em, UV[k][0], UV[k][1]) }
  }
}

// ---------- shaders ----------
const VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNrm; layout(location=2) in vec3 aCol; layout(location=3) in float aAo; layout(location=4) in float aEm; layout(location=5) in vec2 aUv;
uniform mat4 uVP; uniform mat4 uLVP;
out vec3 vPos; out vec3 vNrm; out vec3 vCol; out float vAo; out float vEm; out vec2 vUv; out vec4 vL;
void main(){ vPos=aPos; vNrm=aNrm; vCol=aCol; vAo=aAo; vEm=aEm; vUv=aUv; vL=uLVP*vec4(aPos,1.); gl_Position=uVP*vec4(aPos,1.); }`
const FS = `#version 300 es
precision highp float; precision highp sampler2DShadow;
in vec3 vPos; in vec3 vNrm; in vec3 vCol; in float vAo; in float vEm; in vec2 vUv; in vec4 vL;
uniform vec3 uSun, uSunCol, uAmb, uGround, uFog, uEye; uniform float uNight, uTime, uWet; uniform sampler2DShadow uShadow;
out vec4 o;
vec3 toLin(vec3 c){ return pow(c, vec3(2.2)); }
void main(){
  vec3 n=normalize(vNrm);
  vec3 L=vL.xyz/vL.w*0.5+0.5; float sh=0.;
  vec2 ts=vec2(1./2048.);
  for(int i=-1;i<=1;i++) for(int j=-1;j<=1;j++) sh+=texture(uShadow, vec3(L.xy+vec2(i,j)*ts*1.3, L.z-0.0018));
  sh/=9.; if(L.x<0.||L.x>1.||L.y<0.||L.y>1.) sh=1.;
  float nd=max(dot(n,uSun),0.);
  vec3 base=toLin(vCol);
  // bevelled toy-block edge
  float e=min(min(vUv.x,1.-vUv.x),min(vUv.y,1.-vUv.y));
  float bev=smoothstep(0.0,0.07,e);
  base*=mix(0.78,1.0,bev); base+=(1.-smoothstep(0.0,0.035,e))*0.04*float(n.y>0.5);
  base*=1.-uWet*0.25*float(n.y>0.5);
  vec3 amb=mix(uGround,uAmb,n.y*0.5+0.5);
  vec3 col=base*(amb*vAo+uSunCol*nd*sh*(0.55+0.45*vAo));
  float glow=vEm*uNight; col+=toLin(vCol)*glow*2.2;
  float d=length(vPos-uEye);
  float f=1.-exp(-pow(max(d-55.,0.)/90.,1.6));
  col=mix(col,toLin(uFog),clamp(f,0.,1.)*(1.-glow*0.6));
  o=vec4(pow(col,vec3(1./2.2)),1.);
}`
const SVS = `#version 300 es
layout(location=0) in vec3 aPos; uniform mat4 uLVP; void main(){ gl_Position=uLVP*vec4(aPos,1.); }`
const SFS = `#version 300 es
precision mediump float; out vec4 o; void main(){ o=vec4(1.); }`
const SKY_VS = `#version 300 es
out vec2 vP; void main(){ vec2 p=vec2(gl_VertexID==1?3.:-1., gl_VertexID==2?3.:-1.); vP=p; gl_Position=vec4(p,0.9999,1.); }`
const SKY_FS = `#version 300 es
precision highp float; in vec2 vP; uniform mat4 uInv; uniform vec3 uSun, uTop, uHor, uSunCol; uniform float uNight, uTime; out vec4 o;
float h(vec3 p){ return fract(sin(dot(p,vec3(12.9898,78.233,37.719)))*43758.5453); }
void main(){
  vec4 a=uInv*vec4(vP,-1.,1.), b=uInv*vec4(vP,1.,1.); vec3 d=normalize(b.xyz/b.w-a.xyz/a.w);
  float y=clamp(d.y,0.,1.);
  vec3 c=mix(uHor,uTop,pow(y,0.55));
  float s=max(dot(d,normalize(uSun)),0.);
  c+=uSunCol*(pow(s,600.)*(uNight>0.5?1.2:3.)+pow(s,12.)*0.25*(1.-uNight*0.7));
  if(uNight>0.3){ vec3 q=floor(d*420.); float st=step(0.9975,h(q)); c+=st*uNight*(0.6+0.4*sin(uTime*1.7+h(q+1.)*30.))*smoothstep(0.02,0.25,d.y); }
  o=vec4(c,1.);
}`
const WVS = `#version 300 es
layout(location=0) in vec2 aXZ; uniform mat4 uVP; uniform float uY; out vec3 vP;
void main(){ vP=vec3(aXZ.x,uY,aXZ.y); gl_Position=uVP*vec4(vP,1.); }`
const WFS = `#version 300 es
precision highp float; precision highp sampler2DShadow;
in vec3 vP; uniform vec3 uEye, uSun, uSunCol, uTop, uHor, uWater, uFog; uniform float uTime, uNight, uRain; uniform vec4 uRip[4]; uniform mat4 uLVP; uniform sampler2DShadow uShadow; out vec4 o;
void main(){
  vec2 p=vP.xz; float t=uTime;
  vec2 g=vec2(0.);
  g+=vec2(0.8,0.6)*cos(dot(p,vec2(0.8,0.6))*1.3+t*1.4)*0.06;
  g+=vec2(-0.5,0.85)*cos(dot(p,vec2(-0.5,0.85))*2.3+t*2.0)*0.04;
  g+=vec2(0.95,-0.3)*cos(dot(p,vec2(0.95,-0.3))*3.7+t*2.9)*0.025;
  for(int i=0;i<4;i++){ vec4 r=uRip[i]; float age=t-r.z; if(age<0.||age>5.) continue; vec2 dv=p-r.xy; float dist=length(dv); float w=sin(dist*3.2-age*5.)*exp(-age*0.8)*smoothstep(age*2.2+1.5,age*2.2,dist)*r.w; g+=dv/(dist+0.01)*w*0.35; }
  if(uRain>0.){ vec2 c=floor(p*1.3); float ph=fract(sin(dot(c,vec2(7.1,3.3)))*91.7+t*0.9); vec2 dv=fract(p*1.3)-0.5; float dist=length(dv); g+=dv*sin(dist*30.-ph*18.)*(1.-ph)*uRain*0.6; }
  vec3 n=normalize(vec3(-g.x,1.,-g.y));
  vec3 v=normalize(uEye-vP);
  float fr=0.04+0.96*pow(1.-max(dot(n,v),0.),5.);
  vec3 r=reflect(-v,n);
  vec3 sky=mix(uHor,uTop,pow(clamp(r.y,0.,1.),0.55));
  vec4 L=uLVP*vec4(vP,1.); vec3 lc=L.xyz/L.w*0.5+0.5; float sh=texture(uShadow,vec3(lc.xy,lc.z-0.002));
  float sp=pow(max(dot(r,normalize(uSun)),0.),220.)*sh*(uNight>0.5?0.6:2.2);
  vec3 col=mix(uWater,sky,fr*0.85)+uSunCol*sp;
  float d=length(vP-uEye); float f=1.-exp(-pow(max(d-55.,0.)/90.,1.6));
  col=mix(col,uFog,clamp(f,0.,1.));
  o=vec4(col,0.88+fr*0.1);
}`

export function mount(container, ctx = {}) {
  const cv = document.createElement('canvas'); cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block'
  const ov = document.createElement('canvas'); ov.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none'
  container.appendChild(cv); container.appendChild(ov)
  const gl = cv.getContext('webgl2', { antialias: true, alpha: false })
  if (!gl) throw new Error('WebGL2 not available')
  const g2 = ov.getContext('2d')

  const prog = (vs, fs) => {
    const p = gl.createProgram()
    for (const [t, s] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); gl.attachShader(p, sh) }
    gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p))
    const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS)
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name.replace('[0]', '')] = gl.getUniformLocation(p, info.name) }
    return { p, u }
  }
  const P = prog(VS, FS), PS = prog(SVS, SFS), PK = prog(SKY_VS, SKY_FS), PW = prog(WVS, WFS)
  const mkVAO = () => {
    const vao = gl.createVertexArray(), buf = gl.createBuffer()
    gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    const st = FLOATS * 4, off = [0, 3, 6, 9, 10, 11], sz = [3, 3, 3, 1, 1, 2]
    for (let i = 0; i < 6; i++) { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, sz[i], gl.FLOAT, false, st, off[i] * 4) }
    gl.bindVertexArray(null)
    return { vao, buf, n: 0 }
  }
  const upload = (m, data, usage) => { gl.bindBuffer(gl.ARRAY_BUFFER, m.buf); gl.bufferData(gl.ARRAY_BUFFER, data, usage); m.n = data.length / FLOATS }

  // world
  const world = buildWorld(20261101)
  const terrain = mkVAO(); upload(terrain, meshVoxels(world), gl.STATIC_DRAW)
  // details (flowers, reeds, lantern frames)
  const det = []
  {
    let s = 77
    const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296
    for (let k = 0; k < 1400; k++) {
      const x = 2 + rnd() * (X - 4), z = 2 + rnd() * (Z - 4), xi = x | 0, zi = z | 0
      const ty = world.top(xi, zi), b = world.get(xi, ty - 1, zi)
      if (world.get(xi, ty, zi)) continue
      if (b === B.GRASS) {
        const r = rnd()
        if (r < 0.2) { const c = [[236, 90, 90], [250, 220, 90], [240, 240, 236], [170, 120, 230]][rnd() * 4 | 0]; addBox(det, x - 0.04, ty, z - 0.04, x + 0.04, ty + 0.32, z + 0.04, [70, 130, 60]); addBox(det, x - 0.12, ty + 0.3, z - 0.12, x + 0.12, ty + 0.46, z + 0.12, c) }
        else if (r < 0.55) addBox(det, x - 0.18, ty, z - 0.06, x + 0.18, ty + 0.22 + rnd() * 0.2, z + 0.06, [96, 156, 66], 0, rnd() * 3, x, z)
      } else if (b === B.SAND && world.lakeD(x, z) < 1.25) {
        for (let j = 0; j < 3; j++) { const ox = x + (rnd() - 0.5) * 0.6, oz = z + (rnd() - 0.5) * 0.6, h = 0.8 + rnd() * 0.9; addBox(det, ox - 0.05, ty - 0.2, oz - 0.05, ox + 0.05, ty + h, oz + 0.05, [96, 128, 70]); if (rnd() < 0.5) addBox(det, ox - 0.08, ty + h - 0.3, oz - 0.08, ox + 0.08, ty + h, oz + 0.08, [120, 86, 56]) }
      }
    }
  }
  const detail = mkVAO(); upload(detail, new Float32Array(det), gl.STATIC_DRAW)
  const dyn = mkVAO(), siteM = mkVAO()
  // water grid
  const wvao = gl.createVertexArray(), wbuf = gl.createBuffer()
  {
    const pts = [], N = 64
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x0 = -40 + i * (X + 80) / N, x1 = -40 + (i + 1) * (X + 80) / N, z0 = -20 + j * (Z + 60) / N, z1 = -20 + (j + 1) * (Z + 60) / N
      pts.push(x0, z0, x1, z0, x1, z1, x0, z0, x1, z1, x0, z1)
    }
    gl.bindVertexArray(wvao); gl.bindBuffer(gl.ARRAY_BUFFER, wbuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pts), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0); gl.bindVertexArray(null)
  }
  const wN = 64 * 64 * 6
  // shadow map
  const SM = 2048, stex = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, stex)
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, SM, SM)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  const sfb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, sfb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, stex, 0); gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  const SHADOWS_EVERY_FRAME = true
  let shadowDirty = true

  // ---------- state ----------
  let tod = TOD[ctx.timeOfDay] ? ctx.timeOfDay : 'dusk', T = TOD[tod], cur = JSON.parse(JSON.stringify(T)), todMix = 1
  let W = 1, H = 1, t = 0
  const pointer = { x: 0, y: 0, active: false, last: -99, still: 0, px: 0, py: 0, wx: 0, wz: 0, onWater: false }
  const ripples = [[0, 0, -99, 0], [0, 0, -99, 0], [0, 0, -99, 0], [0, 0, -99, 0]]; let ripK = 0, ripCool = 0
  const isWater = (x, z) => x >= 0 && z >= 0 && x < X && z < Z && world.top(x | 0, z | 0) <= WL - 0 && !world.get(x | 0, WL, z | 0)
  // creatures
  let rs = 5; const rnd = () => (rs = (Math.imul(rs, 1664525) + 1013904223) >>> 0) / 4294967296
  const ducks = []
  for (let k = 0; k < 7; k++) {
    let x, z; do { x = world.LX + (rnd() - 0.5) * 30; z = world.LZ + (rnd() - 0.5) * 16 } while (!isWater(x, z))
    ducks.push({ x, z, a: rnd() * 6.28, v: 0, tx: x, tz: z, wait: rnd() * 4, brown: k % 3 === 0, bob: rnd() * 6, dip: 0 })
  }
  const rabbits = []
  for (let k = 0; k < 5; k++) {
    let x, z, tries = 0; do { x = 20 + rnd() * 88; z = 40 + rnd() * 50; tries++ } while ((world.get(x | 0, world.top(x | 0, z | 0) - 1, z | 0) !== B.GRASS || world.get(x | 0, world.top(x | 0, z | 0), z | 0)) && tries < 200)
    rabbits.push({ x, z, a: rnd() * 6.28, hop: 0, wait: rnd() * 3, light: k % 2 === 0 })
  }
  const cat = { x: world.dock.x + 0.4, z: world.dock.z - world.dock.len + 1.2 }
  const smoke = [], foam = [], fireflies = Array.from({ length: 40 }, () => ({ x: 20 + rnd() * 90, z: 30 + rnd() * 60, p: rnd() * 6, y: 0 }))
  const clouds = Array.from({ length: 7 }, () => { const bx = []; const n = 6 + (rnd() * 8 | 0); for (let j = 0; j < n; j++) bx.push([(rnd() - 0.5) * 14, (rnd() * 1.5), (rnd() - 0.5) * 7, 2 + rnd() * 5, 1 + rnd() * 1.2, 2 + rnd() * 4]); return { x: rnd() * 220 - 60, z: -10 + rnd() * 70, y: 34 + rnd() * 6, bx } })
  let weather = { rain: 0, target: 0, next: 90 + rnd() * 120, left: 0 }
  // building site
  const site = world.site
  const plan = []
  let siteState = { built: 0, falling: null, timer: 3, phase: 'build', hold: 0, roof: B.ROOF_B }
  function makePlan() {
    plan.length = 0
    if (!site) return
    const { x0, z0, w, d, base } = site
    const roof = [B.ROOF_R, B.ROOF_B, B.ROOF_G][(rnd() * 3) | 0], pl = rnd() < 0.5
    for (let y = base; y < base + 3; y++) for (let z = z0; z < z0 + d; z++) for (let x = x0; x < x0 + w; x++) {
      const ex = x === x0 || x === x0 + w - 1, ez = z === z0 || z === z0 + d - 1
      if (!ex && !ez) continue
      let b = ex && ez ? B.LOG : y === base ? B.COBBLE : pl ? B.PLASTER : B.PLANK
      if (!(ex && ez) && y === base + 1 && (x - x0) % 2 === 1 && ez) b = B.WINDOW
      if (ez && z === z0 + d - 1 && x === x0 + 2 && y < base + 2) b = B.DOOR
      plan.push([x, y, z, b])
    }
    for (let k = 0; k <= Math.ceil(d / 2); k++) {
      const za = z0 - 1 + k, zb = z0 + d - k; if (za > zb) break
      for (let x = x0 - 1; x <= x0 + w; x++) { plan.push([x, base + 3 + k, za, roof]); if (zb !== za) plan.push([x, base + 3 + k, zb, roof]) }
      if (k > 0) for (let z = za + 1; z < zb; z++) { plan.push([x0, base + 2 + k, z, pl ? B.PLASTER : B.PLANK]); plan.push([x0 + w - 1, base + 2 + k, z, pl ? B.PLASTER : B.PLANK]) }
    }
    plan.sort((a, b) => a[1] - b[1] || (a[0] + a[2] * 0.3) - (b[0] + b[2] * 0.3))
  }
  makePlan()
  function rebuildSite() {
    const out = []
    const n = siteState.phase === 'clear' ? siteState.built : siteState.built
    for (let k = 0; k < n; k++) { const [x, y, z, b] = plan[k]; addBlock(out, x, y, z, b, 0) }
    // scaffold poles while building
    if (siteState.phase === 'build' && site) { const { x0, z0, w, d, base } = site; for (const [x, z] of [[x0 - 1.3, z0 - 1.3], [x0 + w + 0.3, z0 - 1.3], [x0 - 1.3, z0 + d + 0.3], [x0 + w + 0.3, z0 + d + 0.3]]) addBox(out, x, base, z, x + 0.2, base + 6, z + 0.2, [150, 112, 70]) }
    upload(siteM, new Float32Array(out), gl.DYNAMIC_DRAW); shadowDirty = true
  }
  function addBlock(out, x, y, z, b, dy) {
    const c = COL[b], tint = 0.92 + hash3(x, y, z) * 0.14
    addBox(out, x, y + dy, z, x + 1, y + 1 + dy, z + 1, [c[0] * tint, c[1] * tint, c[2] * tint], EMIT[b] || 0)
  }
  rebuildSite()

  // camera
  const cam = { yaw: 0, pitch: 0.4, dist: 72, ty: 0, tx: 0 }
  let VP, LVP, eye, INV
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    const r = container.getBoundingClientRect()
    W = Math.max(2, Math.round((r.width || innerWidth) * dpr)); H = Math.max(2, Math.round((r.height || innerHeight) * dpr))
    cv.width = W; cv.height = H; ov.width = W; ov.height = H
  }
  function computeCamera() {
    const target = [64, 10, 46]
    const yaw = cam.yaw, pitch = cam.pitch
    eye = [target[0] + Math.sin(yaw) * Math.cos(pitch) * cam.dist, target[1] + Math.sin(pitch) * cam.dist, target[2] + Math.cos(yaw) * Math.cos(pitch) * cam.dist]
    const a = W / H
    const fov = a < 1.3 ? 0.95 : 0.7
    const proj = M.persp(fov, a, 1, 400), view = M.look(eye, target, [0, 1, 0])
    VP = M.mul(proj, view); INV = M.inv(VP)
  }
  function computeLight() {
    const sd = norm(cur.sun), c = [64, 10, 48]
    const le = [c[0] + sd[0] * 120, c[1] + sd[1] * 120, c[2] + sd[2] * 120]
    LVP = M.mul(M.ortho(-82, 82, -70, 70, 10, 260), M.look(le, c, [0, 1, 0]))
  }
  function pick(px, py) {
    const nx = px / W * 2 - 1, ny = 1 - py / H * 2
    const a = M.xf(INV, [nx, ny, -1]), b = M.xf(INV, [nx, ny, 1])
    const dy = b[1] - a[1]; if (Math.abs(dy) < 1e-6) return null
    const k = (WATER_Y - a[1]) / dy; if (k < 0) return null
    return [a[0] + (b[0] - a[0]) * k, a[2] + (b[2] - a[2]) * k]
  }

  // ---------- simulation ----------
  function step(dt) {
    t += dt
    // tod blend
    if (todMix < 1) {
      todMix = Math.min(1, todMix + dt / 6)
      for (const k of Object.keys(T)) { if (Array.isArray(T[k])) for (let i = 0; i < 3; i++) cur[k][i] = lerp(cur[k][i], T[k][i], todMix); else cur[k] = lerp(cur[k], T[k], todMix) }
      shadowDirty = true
    }
    // camera: slow sway + pointer parallax
    const pAct = pointer.active && t - pointer.last < 10
    const tyaw = Math.sin(t * 0.045) * 0.09 + (pAct ? (pointer.x / W - 0.5) * 0.28 : 0)
    const tpitch = 0.36 + Math.sin(t * 0.03) * 0.02 + (pAct ? (pointer.y / H - 0.5) * 0.08 : 0)
    cam.yaw += (tyaw - cam.yaw) * Math.min(1, dt * 0.8); cam.pitch += (tpitch - cam.pitch) * Math.min(1, dt * 0.8)
    computeCamera()
    pointer.still += dt
    // pointer over water
    pointer.onWater = false
    if (pAct) {
      const h = pick(pointer.x, pointer.y)
      if (h && isWater(h[0], h[1])) {
        pointer.onWater = true; pointer.wx = h[0]; pointer.wz = h[1]
        ripCool -= dt
        if (ripCool < 0 && t - pointer.last < 0.3) { ripples[ripK] = [h[0], h[1], t, 0.8]; ripK = (ripK + 1) % 4; ripCool = 0.45 }
        if (pointer.still > 1.2 && ripCool < -1.5) { ripples[ripK] = [h[0], h[1], t, 0.5]; ripK = (ripK + 1) % 4; ripCool = 0.9 }
      }
    }
    // weather
    weather.next -= dt
    if (weather.next < 0 && weather.target === 0) { weather.target = 1; weather.left = 50 + rnd() * 40 }
    if (weather.target === 1) { weather.left -= dt; if (weather.left < 0) { weather.target = 0; weather.next = 180 + rnd() * 240 } }
    weather.rain += (weather.target - weather.rain) * Math.min(1, dt * 0.25)
    // ducks
    for (const d of ducks) {
      d.bob += dt
      const lure = pointer.onWater && pointer.still > 0.6 && Math.hypot(pointer.wx - d.x, pointer.wz - d.z) < 26
      if (lure) { const a = Math.atan2(pointer.wz - d.z, pointer.wx - d.x), r = 1.6 + (ducks.indexOf(d) % 4) * 0.5; d.tx = pointer.wx - Math.cos(a) * r; d.tz = pointer.wz - Math.sin(a) * r; d.wait = 0 }
      const dx = d.tx - d.x, dz = d.tz - d.z, dist = Math.hypot(dx, dz)
      if (dist < 0.4) {
        d.v *= 0.95; d.wait -= dt
        if (d.wait < 0 && !lure) { for (let k = 0; k < 20; k++) { const nx = d.x + (rnd() - 0.5) * 24, nz = d.z + (rnd() - 0.5) * 14; if (isWater(nx, nz) && isWater((d.x + nx) / 2, (d.z + nz) / 2)) { d.tx = nx; d.tz = nz; break } } d.wait = 3 + rnd() * 8; if (rnd() < 0.25) d.dip = 1.6 }
      } else {
        const ta = Math.atan2(dz, dx); let da = ta - d.a; while (da > Math.PI) da -= 6.283; while (da < -Math.PI) da += 6.283
        d.a += da * Math.min(1, dt * 2.2)
        d.v = lerp(d.v, Math.min(lure ? 3.2 : 1.6, dist), dt * 1.5)
      }
      const nx = d.x + Math.cos(d.a) * d.v * dt, nz = d.z + Math.sin(d.a) * d.v * dt
      if (isWater(nx, nz)) { d.x = nx; d.z = nz } else { d.tx = d.x; d.tz = d.z; d.a += Math.PI * 0.5 }
      for (const e of ducks) if (e !== d) { const ex = d.x - e.x, ez = d.z - e.z, l = Math.hypot(ex, ez); if (l < 1 && l > 0) { d.x += ex / l * (1 - l) * 0.5; d.z += ez / l * (1 - l) * 0.5 } }
      if (d.v > 0.5 && rnd() < dt * 6) foam.push({ x: d.x - Math.cos(d.a) * 0.5, z: d.z - Math.sin(d.a) * 0.5, life: 1.6, s: 0.12 })
      d.dip = Math.max(0, d.dip - dt)
    }
    // rabbits hop
    for (const r of rabbits) {
      if (r.hop > 0) {
        r.hop -= dt
        const nx = r.x + Math.cos(r.a) * dt * 2.4, nz = r.z + Math.sin(r.a) * dt * 2.4
        const ty = world.top(nx | 0, nz | 0)
        if (world.get(nx | 0, ty - 1, nz | 0) === B.GRASS && !world.get(nx | 0, ty, nz | 0) && Math.abs(ty - world.top(r.x | 0, r.z | 0)) <= 1) { r.x = nx; r.z = nz } else { r.a += 2; r.hop = 0 }
      } else { r.wait -= dt; if (r.wait < 0) { r.hop = 0.45; r.wait = 0.4 + rnd() * (rnd() < 0.3 ? 6 : 1.2); if (rnd() < 0.4) r.a += (rnd() - 0.5) * 2.5 } }
    }
    // smoke
    for (const c of world.chimneys) if (rnd() < dt * 1.4) smoke.push({ x: c[0] + (rnd() - 0.5) * 0.3, y: c[1], z: c[2], s: 0.35 + rnd() * 0.2, life: 6 + rnd() * 3, max: 9 })
    for (let k = smoke.length - 1; k >= 0; k--) { const p = smoke[k]; p.life -= dt; if (p.life < 0) { smoke.splice(k, 1); continue } p.y += dt * 0.9; p.x += dt * (0.5 + Math.sin(t * 0.3) * 0.3); p.z -= dt * 0.15; p.s += dt * 0.12 }
    for (let k = foam.length - 1; k >= 0; k--) { foam[k].life -= dt; if (foam[k].life < 0) foam.splice(k, 1) }
    // clouds drift
    for (const c of clouds) { c.x += dt * 0.9; if (c.x > 200) c.x = -70 }
    // building site
    if (site) {
      siteState.timer -= dt
      if (siteState.phase === 'build') {
        if (siteState.falling) { siteState.falling.t += dt / 0.55; if (siteState.falling.t >= 1) { siteState.built++; siteState.falling = null; rebuildSite() } }
        else if (siteState.timer < 0) {
          if (siteState.built >= plan.length) { siteState.phase = 'hold'; siteState.timer = 150; rebuildSite() }
          else { siteState.falling = { t: 0 }; siteState.timer = 1.4 + rnd() * 0.8 }
        }
      } else if (siteState.phase === 'hold') { if (siteState.timer < 0) { siteState.phase = 'clear'; siteState.timer = 0 } }
      else if (siteState.phase === 'clear') {
        if (siteState.timer < 0) { siteState.built = Math.max(0, siteState.built - 3); siteState.timer = 0.12; rebuildSite(); if (!siteState.built) { siteState.phase = 'build'; siteState.timer = 6; makePlan(); rebuildSite() } }
      }
    }
  }

  // ---------- dynamic geometry ----------
  function buildDynamic() {
    const out = []
    // clouds
    const cc = cur.night > 0.5 ? [70, 80, 110] : [250, 248, 246]
    const dark = weather.rain
    const ccol = [lerp(cc[0], 120, dark), lerp(cc[1], 124, dark), lerp(cc[2], 132, dark)]
    for (const c of clouds) for (const [ox, oy, oz, w, h, d] of c.bx) addBox(out, c.x + ox - w / 2, c.y + oy, c.z + oz - d / 2, c.x + ox + w / 2, c.y + oy + h, c.z + oz + d / 2, ccol)
    // ducks
    for (const d of ducks) {
      const y = WATER_Y - 0.12 + Math.sin(d.bob * 2.2) * 0.04, a = -d.a, px = d.x, pz = d.z, S = 1.8
      const bx = (x0, y0, z0, x1, y1, z1, c) => addBox(out, px + x0 * S, y + y0 * S, pz + z0 * S, px + x1 * S, y + y1 * S, pz + z1 * S, c, 0, a, px, pz)
      const body = d.brown ? [140, 104, 72] : [246, 244, 236], head = d.brown ? [40, 110, 70] : [246, 244, 236]
      const dip = d.dip > 0 ? Math.sin(d.dip / 1.6 * Math.PI) : 0
      bx(-0.38, 0, -0.22, 0.34, 0.32, 0.22, body)
      bx(-0.48, 0.18, -0.1, -0.3, 0.34, 0.1, body)
      const hx = 0.3 - dip * 0.1, hy = 0.28 - dip * 0.42
      bx(hx, hy, -0.12, hx + 0.24, hy + 0.26, 0.12, head)
      bx(hx + 0.24, hy + 0.08, -0.06, hx + 0.38, hy + 0.15, 0.06, [240, 160, 40])
      bx(hx + 0.12, hy + 0.17, -0.125, hx + 0.17, hy + 0.22, 0.125, [20, 20, 24])
    }
    for (const f of foam) { const s = f.s + (1.6 - f.life) * 0.18; addBox(out, f.x - s, WATER_Y - 0.03, f.z - s, f.x + s, WATER_Y + 0.01, f.z + s, [235, 242, 246]) }
    // rabbits
    for (const r of rabbits) {
      const ty = world.top(r.x | 0, r.z | 0), up = r.hop > 0 ? Math.sin((0.45 - r.hop) / 0.45 * Math.PI) * 0.35 : 0, a = -r.a, px = r.x, pz = r.z
      const c = r.light ? [214, 206, 196] : [150, 120, 92]
      addBox(out, px - 0.25, ty + up, pz - 0.15, px + 0.2, ty + 0.3 + up, pz + 0.15, c, 0, a, px, pz)
      addBox(out, px + 0.12, ty + 0.18 + up, pz - 0.12, px + 0.36, ty + 0.42 + up, pz + 0.12, c, 0, a, px, pz)
      addBox(out, px + 0.16, ty + 0.42 + up, pz - 0.1, px + 0.22, ty + 0.68 + up, pz - 0.03, c, 0, a, px, pz)
      addBox(out, px + 0.16, ty + 0.42 + up, pz + 0.03, px + 0.22, ty + 0.66 + up, pz + 0.1, c, 0, a, px, pz)
      addBox(out, px - 0.32, ty + 0.12 + up, pz - 0.06, px - 0.24, ty + 0.24 + up, pz + 0.06, [245, 245, 240], 0, a, px, pz)
    }
    // cat asleep on the dock (breathing)
    { const br = Math.sin(t * 1.4) * 0.025, y = WL + 1, c = [230, 150, 70]
      addBox(out, cat.x, y, cat.z, cat.x + 0.62, y + 0.26 + br, cat.z + 0.4, c)
      addBox(out, cat.x + 0.5, y, cat.z + 0.05, cat.x + 0.8, y + 0.24, cat.z + 0.36, c)
      addBox(out, cat.x + 0.55, y + 0.24, cat.z + 0.07, cat.x + 0.62, y + 0.32, cat.z + 0.14, c); addBox(out, cat.x + 0.55, y + 0.24, cat.z + 0.27, cat.x + 0.62, y + 0.32, cat.z + 0.34, c)
      addBox(out, cat.x - 0.3, y, cat.z + 0.3, cat.x + 0.05, y + 0.08, cat.z + 0.4, [200, 120, 56]) }
    // smoke
    for (const p of smoke) { const k = p.life / p.max, s = p.s, gcol = cur.night > 0.5 ? [90, 96, 118] : [214, 210, 206]; const sz = s * Math.min(1, (1 - k) * 6) * (0.4 + k * 0.6); addBox(out, p.x - sz, p.y - sz, p.z - sz, p.x + sz, p.y + sz, p.z + sz, gcol) }
    // falling block on the site
    if (siteState.falling && plan[siteState.built]) {
      const [x, y, z, b] = plan[siteState.built], k = siteState.falling.t, e = 1 - Math.pow(1 - k, 3)
      addBlock(out, x, y, z, b, (1 - e) * 4 + Math.sin(k * Math.PI) * 0.3)
    }
    // fireflies
    if (cur.night > 0.5) for (const f of fireflies) {
      const ty = world.top(f.x | 0, f.z | 0), y = ty + 0.8 + Math.sin(t * 0.7 + f.p) * 0.6, x = f.x + Math.sin(t * 0.3 + f.p) * 1.2, z = f.z + Math.cos(t * 0.27 + f.p) * 1.2
      f.y = y; f.sx = x; f.sz = z
      const on = Math.max(0, Math.sin(t * 1.3 + f.p * 3))
      if (on > 0.1) addBox(out, x - 0.06, y - 0.06, z - 0.06, x + 0.06, y + 0.06, z + 0.06, [210, 255, 140], on)
    }
    upload(dyn, new Float32Array(out), gl.DYNAMIC_DRAW)
  }

  // ---------- render ----------
  function draw() {
    buildDynamic()
    if (shadowDirty || SHADOWS_EVERY_FRAME) { // sun, clouds and creatures move, so shadows redraw each frame
      computeLight()
      gl.bindFramebuffer(gl.FRAMEBUFFER, sfb); gl.viewport(0, 0, SM, SM)
      gl.clear(gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST); gl.colorMask(false, false, false, false)
      gl.useProgram(PS.p); gl.uniformMatrix4fv(PS.u.uLVP, false, LVP)
      gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(2, 4)
      for (const m of [terrain, detail, siteM, dyn]) if (m.n) { gl.bindVertexArray(m.vao); gl.drawArrays(gl.TRIANGLES, 0, m.n) }
      gl.disable(gl.POLYGON_OFFSET_FILL); gl.colorMask(true, true, true, true)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); shadowDirty = false
    }
    gl.viewport(0, 0, W, H)
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    const sd = norm(cur.sun)
    const rainDim = 1 - weather.rain * 0.35
    const sunCol = cur.sunCol.map((v) => v * rainDim), skyTop = cur.skyTop.map((v) => lerp(v, 0.45 * (1 - cur.night * 0.8), weather.rain * 0.5)), skyHor = cur.skyHor.map((v) => lerp(v, 0.6 * (1 - cur.night * 0.8), weather.rain * 0.5))
    // sky
    gl.disable(gl.DEPTH_TEST); gl.useProgram(PK.p)
    gl.uniformMatrix4fv(PK.u.uInv, false, INV); gl.uniform3fv(PK.u.uSun, sd); gl.uniform3fv(PK.u.uTop, skyTop); gl.uniform3fv(PK.u.uHor, skyHor); gl.uniform3fv(PK.u.uSunCol, sunCol); gl.uniform1f(PK.u.uNight, cur.night); gl.uniform1f(PK.u.uTime, t)
    gl.bindVertexArray(null); gl.drawArrays(gl.TRIANGLES, 0, 3)
    // world
    gl.enable(gl.DEPTH_TEST); gl.useProgram(P.p)
    gl.uniformMatrix4fv(P.u.uVP, false, VP); gl.uniformMatrix4fv(P.u.uLVP, false, LVP)
    gl.uniform3fv(P.u.uSun, sd); gl.uniform3fv(P.u.uSunCol, sunCol); gl.uniform3fv(P.u.uAmb, cur.amb.map((v) => v * (1 - weather.rain * 0.15))); gl.uniform3fv(P.u.uGround, cur.ground)
    gl.uniform3fv(P.u.uFog, cur.fog.map((v, i) => lerp(v, skyHor[i], 0.3))); gl.uniform3fv(P.u.uEye, eye); gl.uniform1f(P.u.uNight, cur.night); gl.uniform1f(P.u.uTime, t); gl.uniform1f(P.u.uWet, weather.rain)
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, stex); gl.uniform1i(P.u.uShadow, 0)
    for (const m of [terrain, detail, siteM, dyn]) if (m.n) { gl.bindVertexArray(m.vao); gl.drawArrays(gl.TRIANGLES, 0, m.n) }
    // water
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false)
    gl.useProgram(PW.p)
    gl.uniformMatrix4fv(PW.u.uVP, false, VP); gl.uniformMatrix4fv(PW.u.uLVP, false, LVP); gl.uniform1f(PW.u.uY, WATER_Y)
    gl.uniform3fv(PW.u.uEye, eye); gl.uniform3fv(PW.u.uSun, sd); gl.uniform3fv(PW.u.uSunCol, sunCol); gl.uniform3fv(PW.u.uTop, skyTop); gl.uniform3fv(PW.u.uHor, skyHor); gl.uniform3fv(PW.u.uWater, cur.water); gl.uniform3fv(PW.u.uFog, cur.fog)
    gl.uniform1f(PW.u.uTime, t); gl.uniform1f(PW.u.uNight, cur.night); gl.uniform1f(PW.u.uRain, weather.rain)
    gl.uniform4fv(PW.u.uRip, new Float32Array(ripples.flat())); gl.uniform1i(PW.u.uShadow, 0)
    gl.bindVertexArray(wvao); gl.drawArrays(gl.TRIANGLES, 0, wN)
    gl.depthMask(true); gl.disable(gl.BLEND); gl.bindVertexArray(null)
    drawOverlay()
  }
  const proj = (p) => { const q = M.xf(VP, p); if (q[3] <= 0 || q[2] > 1) return null; return [(q[0] * 0.5 + 0.5) * W, (1 - (q[1] * 0.5 + 0.5)) * H, q[3]] }
  function drawOverlay() {
    g2.clearRect(0, 0, W, H)
    const n = cur.night
    if (n > 0.2) {
      g2.globalCompositeOperation = 'lighter'
      const glow = (p, r, a, c) => { const s = proj(p); if (!s) return; const R = r * H / s[2]; const gr = g2.createRadialGradient(s[0], s[1], 0, s[0], s[1], R); gr.addColorStop(0, `rgba(${c},${a})`); gr.addColorStop(1, `rgba(${c},0)`); g2.fillStyle = gr; g2.beginPath(); g2.arc(s[0], s[1], R, 0, 7); g2.fill() }
      for (const l of world.lanterns) { glow(l, 3.2, 0.45 * n * (0.92 + Math.sin(t * 7 + l[0]) * 0.05), '255,190,110'); glow([l[0], WATER_Y + 0.01, l[2]], 1.6, 0.0, '255,190,110') }
      for (const w of world.windows) glow([w[0] + 0.5, w[1] + 0.5, w[2] + 0.5], 1.6, 0.22 * n, '255,200,130')
      g2.globalCompositeOperation = 'source-over'
    }
    if (weather.rain > 0.02) {
      g2.strokeStyle = `rgba(200,215,235,${0.35 * weather.rain})`; g2.lineWidth = Math.max(1, H / 900)
      g2.beginPath()
      const cnt = (220 * weather.rain) | 0
      for (let k = 0; k < cnt; k++) { const x = (hash3(k, 1, 0) * W + t * 120 * (0.8 + hash3(k, 2, 0))) % W, y = (hash3(k, 3, 0) * H + t * H * 1.6 * (0.8 + hash3(k, 4, 0) * 0.4)) % H; g2.moveTo(x, y); g2.lineTo(x - H * 0.006, y + H * 0.03) }
      g2.stroke()
    }
  }

  // ---------- loop + events ----------
  let raf = 0, last = 0, alive = true
  function loop(now) { if (!alive) return; const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now; step(dt); draw(); raf = requestAnimationFrame(loop) }
  function setTod(v) { if (!TOD[v] || v === tod) return; tod = v; T = TOD[v]; todMix = ctx.reducedMotion ? 1 : 0; if (ctx.reducedMotion) { cur = JSON.parse(JSON.stringify(T)); step(0); draw() } }
  function onPointer(e) {
    const r = cv.getBoundingClientRect(), k = W / (r.width || 1)
    const x = (e.x - r.left) * k, y = (e.y - r.top) * k
    if (Math.hypot(x - pointer.px, y - pointer.py) > 3 * k) { pointer.still = 0; pointer.last = t }
    pointer.px = x; pointer.py = y; pointer.x = x; pointer.y = y; pointer.active = true
    if (e.type === 'down') { pointer.still = 0; pointer.last = t }
  }
  resize()
  const ro = new ResizeObserver(() => { resize(); if (ctx.reducedMotion) { step(0); draw() } })
  ro.observe(container)
  const offPointer = ctx.onPointer ? ctx.onPointer(onPointer) : null
  const offClock = ctx.subscribe ? ctx.subscribe((s) => setTod(s.timeOfDay)) : null
  if (ctx.reducedMotion) { step(0.016); draw() } else { last = performance.now(); raf = requestAnimationFrame(loop) }
  requestAnimationFrame(() => requestAnimationFrame(() => ctx.ready && ctx.ready()))
  return {
    unmount() { alive = false; cancelAnimationFrame(raf); ro.disconnect(); offPointer && offPointer(); offClock && offClock(); cv.remove(); ov.remove(); const ext = gl.getExtension('WEBGL_lose_context'); ext && ext.loseContext() },
  }
}
