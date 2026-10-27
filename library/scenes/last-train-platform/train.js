// The night train — an old 1800s steam train that comes out of the distance,
// round the curve, pulls in beside the platform, waits, and then rolls on past
// you until the last coach has gone by.
//
// It is one persistent 3D object (engine, tender and two coaches) moving along
// the real line of the rails, drawn live in code over the painting:
//   - The rails in the painting were traced and turned into a path on the
//     ground with a simple camera (eye 1.42 m above the rails, horizon at
//     y = 1235, focal length 3400 px, all in the painting's 3840×2160 pixels).
//     TRACK is that path's centre line in metres (x to the right, z away from
//     you), every 2 m, from far away (index 0) to behind you.
//   - Every car sits on the path by its two axles, so it turns with the curve
//     and grows with perspective; nothing is scaled or swapped on screen.
//   - Faces are lit (moon, sky, the platform lamp), fogged with distance and
//     drawn back to front. Wheels turn with the distance travelled and the
//     rods move with them. Steam stays where it was puffed out, so it drifts
//     back behind the moving engine. Headlamp glare, its beam through the rain
//     and glints on the wet rails ahead are drawn on top.

const CAM = { cx: 1920, yh: 1235, f: 3400, h: 1.42 }
const TRACK = [
  84.82, 821.00, 84.58, 819.02, 84.33, 817.03, 84.09, 815.05, 83.84, 813.06, 83.60, 811.08, 83.36, 809.09, 83.11, 807.11, 82.87, 805.12, 82.62, 803.14,
  82.38, 801.15, 82.14, 799.17, 81.89, 797.18, 81.65, 795.20, 81.41, 793.21, 81.16, 791.23, 80.92, 789.24, 80.67, 787.26, 80.43, 785.27, 80.19, 783.29,
  79.94, 781.30, 79.70, 779.32, 79.46, 777.33, 79.21, 775.35, 78.97, 773.36, 78.72, 771.38, 78.48, 769.39, 78.24, 767.41, 77.99, 765.42, 77.75, 763.44,
  77.51, 761.45, 77.26, 759.47, 77.02, 757.48, 76.78, 755.50, 76.53, 753.51, 76.29, 751.53, 76.04, 749.54, 75.80, 747.56, 75.56, 745.57, 75.31, 743.59,
  75.07, 741.60, 74.83, 739.62, 74.58, 737.63, 74.34, 735.65, 74.09, 733.66, 73.85, 731.67, 73.61, 729.69, 73.36, 727.71, 73.12, 725.72, 72.88, 723.74,
  72.63, 721.75, 72.39, 719.76, 72.14, 717.78, 71.90, 715.79, 71.66, 713.81, 71.41, 711.83, 71.17, 709.84, 70.92, 707.85, 70.68, 705.87, 70.44, 703.88,
  70.19, 701.90, 69.95, 699.91, 69.71, 697.93, 69.46, 695.94, 69.22, 693.96, 68.97, 691.97, 68.73, 689.99, 68.49, 688.00, 68.24, 686.02, 68.00, 684.03,
  67.76, 682.05, 67.51, 680.06, 67.27, 678.08, 67.02, 676.09, 66.78, 674.11, 66.54, 672.12, 66.29, 670.14, 66.05, 668.15, 65.81, 666.17, 65.56, 664.18,
  65.32, 662.20, 65.07, 660.21, 64.83, 658.23, 64.59, 656.24, 64.34, 654.26, 64.10, 652.27, 63.86, 650.29, 63.61, 648.30, 63.37, 646.32, 63.12, 644.33,
  62.88, 642.35, 62.64, 640.36, 62.39, 638.38, 62.15, 636.39, 61.91, 634.41, 61.66, 632.42, 61.42, 630.44, 61.17, 628.45, 60.93, 626.47, 60.69, 624.48,
  60.44, 622.50, 60.20, 620.51, 59.95, 618.52, 59.71, 616.54, 59.47, 614.55, 59.22, 612.57, 58.98, 610.59, 58.74, 608.60, 58.49, 606.62, 58.25, 604.63,
  58.01, 602.64, 57.76, 600.66, 57.52, 598.67, 57.27, 596.69, 57.03, 594.70, 56.79, 592.72, 56.54, 590.73, 56.30, 588.75, 56.05, 586.76, 55.81, 584.78,
  55.57, 582.79, 55.32, 580.81, 55.08, 578.82, 54.84, 576.84, 54.59, 574.85, 54.35, 572.87, 54.10, 570.88, 53.86, 568.90, 53.62, 566.91, 53.37, 564.93,
  53.13, 562.94, 52.89, 560.96, 52.64, 558.97, 52.40, 556.99, 52.16, 555.00, 51.91, 553.02, 51.67, 551.03, 51.42, 549.05, 51.18, 547.06, 50.94, 545.08,
  50.69, 543.09, 50.45, 541.11, 50.20, 539.12, 49.96, 537.14, 49.72, 535.15, 49.47, 533.17, 49.23, 531.18, 48.99, 529.20, 48.74, 527.21, 48.50, 525.23,
  48.26, 523.24, 48.01, 521.26, 47.77, 519.27, 47.52, 517.29, 47.28, 515.30, 47.04, 513.32, 46.79, 511.33, 46.55, 509.35, 46.30, 507.36, 46.06, 505.38,
  45.82, 503.39, 45.57, 501.40, 45.33, 499.42, 45.09, 497.44, 44.84, 495.45, 44.60, 493.46, 44.35, 491.48, 44.11, 489.49, 43.87, 487.51, 43.62, 485.52,
  43.38, 483.54, 43.14, 481.55, 42.89, 479.57, 42.65, 477.58, 42.41, 475.60, 42.16, 473.61, 41.92, 471.63, 41.67, 469.64, 41.43, 467.66, 41.19, 465.67,
  40.94, 463.69, 40.70, 461.70, 40.45, 459.72, 40.21, 457.73, 39.97, 455.75, 39.72, 453.76, 39.48, 451.78, 39.24, 449.79, 38.99, 447.81, 38.75, 445.82,
  38.51, 443.84, 38.26, 441.85, 38.02, 439.87, 37.77, 437.88, 37.53, 435.90, 37.29, 433.91, 37.04, 431.93, 36.80, 429.94, 36.55, 427.96, 36.31, 425.97,
  36.07, 423.99, 35.82, 422.00, 35.58, 420.02, 35.34, 418.03, 35.09, 416.05, 34.85, 414.06, 34.60, 412.08, 34.36, 410.09, 34.12, 408.11, 33.87, 406.12,
  33.63, 404.14, 33.39, 402.15, 33.14, 400.17, 32.90, 398.18, 32.66, 396.19, 32.41, 394.21, 32.17, 392.23, 31.92, 390.24, 31.68, 388.25, 31.44, 386.27,
  31.19, 384.29, 30.95, 382.30, 30.70, 380.31, 30.46, 378.33, 30.22, 376.34, 29.97, 374.36, 29.73, 372.37, 29.49, 370.39, 29.24, 368.40, 29.00, 366.42,
  28.75, 364.43, 28.51, 362.45, 28.27, 360.46, 28.02, 358.48, 27.78, 356.49, 27.54, 354.51, 27.29, 352.52, 27.05, 350.54, 26.80, 348.55, 26.56, 346.57,
  26.32, 344.58, 26.07, 342.60, 25.83, 340.61, 25.59, 338.63, 25.34, 336.64, 25.10, 334.66, 24.85, 332.67, 24.61, 330.69, 24.37, 328.70, 24.12, 326.72,
  23.88, 324.73, 23.64, 322.75, 23.39, 320.76, 23.15, 318.78, 22.90, 316.79, 22.66, 314.81, 22.42, 312.82, 22.17, 310.84, 21.93, 308.85, 21.68, 306.87,
  21.44, 304.88, 21.20, 302.90, 20.95, 300.91, 20.71, 298.93, 20.47, 296.94, 20.22, 294.96, 19.98, 292.97, 19.74, 290.99, 19.50, 289.00, 19.27, 287.01,
  19.04, 285.03, 18.83, 283.04, 18.64, 281.05, 18.45, 279.06, 18.27, 277.06, 18.10, 275.07, 17.92, 273.08, 17.75, 271.09, 17.58, 269.09, 17.40, 267.10,
  17.23, 265.11, 17.05, 263.12, 16.88, 261.12, 16.71, 259.13, 16.53, 257.14, 16.36, 255.15, 16.18, 253.15, 16.01, 251.16, 15.84, 249.17, 15.66, 247.18,
  15.49, 245.18, 15.31, 243.19, 15.14, 241.20, 14.97, 239.21, 14.79, 237.21, 14.62, 235.22, 14.45, 233.23, 14.27, 231.24, 14.10, 229.25, 13.92, 227.25,
  13.75, 225.26, 13.57, 223.27, 13.40, 221.28, 13.23, 219.28, 13.05, 217.29, 12.88, 215.30, 12.71, 213.31, 12.53, 211.31, 12.36, 209.32, 12.18, 207.33,
  12.01, 205.34, 11.84, 203.34, 11.66, 201.35, 11.49, 199.36, 11.31, 197.37, 11.14, 195.37, 10.97, 193.38, 10.79, 191.39, 10.62, 189.40, 10.45, 187.40,
  10.27, 185.41, 10.10, 183.42, 9.93, 181.43, 9.76, 179.43, 9.60, 177.44, 9.44, 175.45, 9.29, 173.45, 9.13, 171.46, 8.98, 169.46, 8.82, 167.47,
  8.67, 165.48, 8.52, 163.48, 8.36, 161.49, 8.21, 159.49, 8.05, 157.50, 7.90, 155.50, 7.75, 153.51, 7.60, 151.52, 7.45, 149.52, 7.31, 147.53,
  7.17, 145.53, 7.03, 143.54, 6.89, 141.54, 6.75, 139.55, 6.62, 137.55, 6.48, 135.56, 6.34, 133.56, 6.21, 131.57, 6.07, 129.57, 5.93, 127.58,
  5.79, 125.58, 5.65, 123.58, 5.52, 121.59, 5.38, 119.59, 5.24, 117.60, 5.11, 115.60, 4.97, 113.61, 4.84, 111.61, 4.71, 109.62, 4.58, 107.62,
  4.46, 105.62, 4.34, 103.63, 4.23, 101.63, 4.11, 99.63, 4.01, 97.64, 3.90, 95.64, 3.80, 93.64, 3.70, 91.64, 3.60, 89.65, 3.50, 87.65,
  3.40, 85.65, 3.31, 83.66, 3.21, 81.66, 3.12, 79.66, 3.04, 77.66, 2.96, 75.66, 2.88, 73.66, 2.80, 71.67, 2.72, 69.67, 2.65, 67.67,
  2.58, 65.67, 2.51, 63.67, 2.43, 61.67, 2.36, 59.67, 2.29, 57.67, 2.23, 55.68, 2.17, 53.68, 2.11, 51.68, 2.06, 49.68, 2.02, 47.68,
  1.98, 45.68, 1.94, 43.68, 1.91, 41.68, 1.89, 39.68, 1.88, 37.68, 1.88, 35.68, 1.88, 33.68, 1.89, 31.68, 1.90, 29.68, 1.92, 27.68,
  1.93, 25.68, 1.95, 23.68, 1.98, 21.68, 2.01, 19.68, 2.05, 17.68, 2.10, 15.68, 2.16, 13.68, 2.22, 11.68, 2.29, 9.68, 2.36, 7.68,
  2.44, 5.69, 2.51, 3.69, 2.59, 1.69, 2.66, -0.31, 2.74, -2.31, 2.81, -4.31, 2.89, -6.30, 2.97, -8.30, 3.04, -10.30, 3.12, -12.30,
  3.19, -14.30, 3.27, -16.30, 3.34, -18.30, 3.42, -20.30, 3.49, -22.29, 3.57, -24.29, 3.64, -26.29, 3.72, -28.29, 3.79, -30.29, 3.87, -32.29,
]

const STEP = 2
const TRACK_LEN = (TRACK.length / 2 - 1) * STEP
const NEAR_Z = 0.35
const MOON_DIR = norm([0.32, 0.55, 0.77]) // toward the moon: up, right, behind the scene
const LAMP_POS = [-2.3, 3.5, 8.1] // the platform lamp, in metres
const FOG = [22, 30, 50]

function norm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l] }
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)

// point on the centre line, s metres from the far end
function at(s) {
  s = clamp(s, 0, TRACK_LEN - 1e-3)
  const i = Math.floor(s / STEP), t = s / STEP - i
  return [TRACK[i * 2] + (TRACK[i * 2 + 2] - TRACK[i * 2]) * t, TRACK[i * 2 + 1] + (TRACK[i * 2 + 3] - TRACK[i * 2 + 1]) * t]
}
// cut a polygon (world points) to the part in front of the near plane
function clipNear(W) {
  const out = []
  for (let i = 0; i < W.length; i++) {
    const a = W[i], b = W[(i + 1) % W.length], ia = a[2] >= NEAR_Z, ib = b[2] >= NEAR_Z
    if (ia) out.push(a)
    if (ia !== ib) { const t = (NEAR_Z - a[2]) / (b[2] - a[2]); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, NEAR_Z]) }
  }
  return out
}
function project(p) {
  return [CAM.cx + (CAM.f * p[0]) / p[2], CAM.yh + (CAM.f * (CAM.h - p[1])) / p[2]]
}
// metres along the track where the centre line is d metres in front of you
function sAtDepth(d) {
  for (let s = 0; s < TRACK_LEN; s += 0.25) if (at(s)[1] < d) return s
  return TRACK_LEN
}

// ---- the cars, built once in their own coordinates:
// x = across (negative = the platform side), y = up from the rails,
// z = along (0 = the car's front end, negative toward its back)
const IRON = [44, 47, 50], IRON2 = [58, 60, 62], BRASS = [168, 132, 70], RED = [92, 40, 34]
const MAROON = [104, 38, 32], ROOF = [40, 36, 38], DARK = [26, 26, 28], TENDER = [36, 42, 40]

function boxFaces(out, x0, x1, y0, y1, z0, z1, col, opt = {}) {
  // z0 > z1 (front, back)
  const P = (x, y, z) => [x, y, z]
  opt = { o: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], ...opt }
  out.push({ p: [P(x0, y0, z0), P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0)], c: col, ...opt }) // left side
  out.push({ p: [P(x1, y0, z1), P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1)], c: col, ...opt }) // right side
  out.push({ p: [P(x0, y0, z0), P(x0, y1, z0), P(x1, y1, z0), P(x1, y0, z0)], c: opt.front || col, ...opt }) // front
  out.push({ p: [P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1), P(x0, y0, z1)], c: col, ...opt }) // back
  out.push({ p: [P(x0, y1, z0), P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0)], c: opt.top || col, ...opt }) // top
  out.push({ p: [P(x0, y0, z1), P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1)], c: col, ...opt }) // bottom
}
function cylAlong(out, cy, r, z0, z1, col, n = 22, capCol) {
  const ring = (z) => Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return [Math.cos(a) * r, cy + Math.sin(a) * r, z] })
  const A = ring(z0), B = ring(z1)
  const o = [0, cy, (z0 + z1) / 2]
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; out.push({ p: [A[i], B[i], B[j], A[j]], c: col, o, smooth: true }) }
  out.push({ p: A.slice(), c: capCol || col, o }) // front cap (faces forward)
  out.push({ p: B.slice().reverse(), c: col, o })
}
function cylUp(out, cx, cz, r0, r1, y0, y1, col, n = 18, capCol) {
  const ring = (r, y) => Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r] })
  const A = ring(r0, y0), B = ring(r1, y1)
  const o = [cx, (y0 + y1) / 2, cz]
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; out.push({ p: [A[i], A[j], B[j], B[i]], c: col, o, smooth: true }) }
  out.push({ p: B.slice().reverse(), c: capCol || col, o })
}
function discFace(out, cx, cy, z, r, col, opt = {}, n = 16) { // a circle facing forward
  out.push({ p: Array.from({ length: n }, (_, i) => { const a = (-i / n) * Math.PI * 2; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r, z] }), c: col, o: [cx, cy, z - 1], ...opt })
}

function buildLoco() {
  const f = []
  // frame and running boards
  boxFaces(f, -0.85, 0.85, 0.7, 1.38, -1.4, -9.2, DARK)
  boxFaces(f, -1.32, -0.78, 1.38, 1.46, -1.45, -6.8, IRON2)
  boxFaces(f, 0.78, 1.32, 1.38, 1.46, -1.45, -6.8, IRON2)
  // pilot (cow catcher): a wedge of slats in front of the wheels
  f.push({ p: [[-0.95, 0.95, -1.2], [-0.15, 0.18, -0.15], [0.15, 0.18, -0.15], [0.95, 0.95, -1.2]], c: [50, 36, 32], slats: 8, o: [0, 0.6, -1.5] })
  f.push({ p: [[-0.95, 0.95, -1.2], [-0.95, 0.22, -1.2], [-0.15, 0.18, -0.15]], c: [40, 32, 30], o: [0, 0.6, -1.5] })
  f.push({ p: [[0.95, 0.22, -1.2], [0.95, 0.95, -1.2], [0.15, 0.18, -0.15]], c: [40, 32, 30], o: [0, 0.6, -1.5] })
  boxFaces(f, -1.35, 1.35, 0.95, 1.38, -1.2, -1.45, RED)
  // cylinders
  boxFaces(f, -1.45, -0.95, 0.8, 1.45, -1.6, -2.75, IRON2)
  boxFaces(f, 0.95, 1.45, 0.8, 1.45, -1.6, -2.75, IRON2)
  // boiler with brass bands, smokebox with its big round door
  cylAlong(f, 2.25, 0.78, -2.7, -6.8, IRON)
  for (const z of [-3.6, -4.8, -6.0]) cylAlong(f, 2.25, 0.8, z, z - 0.09, BRASS, 14)
  cylAlong(f, 2.25, 0.86, -1.45, -2.7, [36, 38, 40], 16, [40, 42, 45])
  discFace(f, 0, 2.25, -1.43, 0.64, [56, 58, 62], { door: true })
  discFace(f, 0, 2.25, -1.42, 0.09, BRASS)
  // smokestack: tall, flared at the top
  cylUp(f, 0, -2.05, 0.28, 0.28, 3.0, 3.6, IRON)
  cylUp(f, 0, -2.05, 0.3, 0.7, 3.6, 4.45, IRON, 14, [12, 12, 14])
  cylUp(f, 0, -2.05, 0.72, 0.72, 4.45, 4.56, IRON2, 14, [10, 10, 12])
  // headlamp
  boxFaces(f, -0.36, 0.36, 3.1, 3.75, -1.5, -2.1, [34, 34, 36])
  cylUp(f, 0, -1.8, 0.3, 0.16, 3.75, 3.95, BRASS)
  discFace(f, 0, 3.42, -1.49, 0.24, [255, 236, 190], { em: 1, lens: true })
  // domes and whistle
  cylUp(f, 0, -3.4, 0.3, 0.27, 2.95, 3.45, IRON2, 12, IRON2)
  cylUp(f, 0, -4.7, 0.37, 0.33, 2.95, 3.65, BRASS, 12, [196, 156, 82])
  cylUp(f, 0, -6.55, 0.07, 0.07, 3.0, 3.35, BRASS, 8)
  // cab
  boxFaces(f, -1.38, 1.38, 1.4, 3.7, -6.8, -9.2, [70, 34, 26])
  f.push({ p: [[-1.395, 2.6, -7.2], [-1.395, 2.6, -8.3], [-1.395, 3.3, -8.3], [-1.395, 3.3, -7.2]], c: [255, 150, 70], em: 0.85, fire: true, o: [0, 2.5, -8] })
  for (const x0 of [-1.22, 0.85]) f.push({ p: [[x0, 2.85, -6.79], [x0, 3.35, -6.79], [x0 + 0.37, 3.35, -6.79], [x0 + 0.37, 2.85, -6.79]], c: [255, 160, 80], em: 0.8, fire: true, o: [0, 2.5, -8] })
  boxFaces(f, -1.55, 1.55, 3.7, 3.86, -6.6, -9.4, ROOF)
  cylUp(f, 0, -4.05, 0.13, 0.2, 3.02, 3.32, BRASS, 12, [196, 156, 82]) // bell
  const lines = []
  for (const sx of [-1, 1]) {
    lines.push({ a: [sx * 0.93, 2.78, -2.75], b: [sx * 0.93, 2.78, -6.65], col: BRASS, w: 0.035 }) // boiler handrails
    lines.push({ a: [sx * 1.41, 1.6, -6.85], b: [sx * 1.41, 3.0, -6.85], col: BRASS, w: 0.03 }) // cab grab rails
    lines.push({ a: [sx * 1.41, 1.6, -9.15], b: [sx * 1.41, 3.0, -9.15], col: BRASS, w: 0.03 })
    lines.push({ a: [sx * 0.88, 3.08, -1.5], b: [sx * 0.88, 3.08, -2.6], col: BRASS, w: 0.03 }) // smokebox rail
  }
  return { faces: f, lines, len: 9.4, axles: [-2.7, -6.8], wheels: [
    { z: -2.2, r: 0.42, col: IRON2 }, { z: -3.2, r: 0.42, col: IRON2 },
    { z: -5.0, r: 0.8, col: [74, 76, 80], drive: true }, { z: -6.8, r: 0.8, col: [74, 76, 80], drive: true },
  ] }
}
function buildTender() {
  const f = []
  boxFaces(f, -0.9, 0.9, 0.6, 1.0, -0.3, -5.3, DARK)
  boxFaces(f, -1.35, 1.35, 1.0, 2.9, 0, -5.6, TENDER, { lining: [1.25, 2.65] })
  boxFaces(f, -1.1, 1.1, 2.9, 3.15, -0.4, -4.4, [20, 20, 22])
  return { faces: f, len: 5.6, axles: [-1.35, -4.25], wheels: [-0.9, -1.8, -3.8, -4.7].map((z) => ({ z, r: 0.45, col: IRON2 })) }
}
function buildCoach() {
  const f = []
  boxFaces(f, -1.0, 1.0, 0.55, 1.0, -1.0, -11.0, DARK)
  boxFaces(f, -1.4, 1.4, 1.0, 3.3, -0.6, -11.4, MAROON, { lining: [1.3, 2.98], panels: [-0.95, ...Array.from({ length: 9 }, (_, i) => -1.24 - i * 1.25), -11.05], front: [84, 30, 26] })
  // arched roof + clerestory
  f.push({ p: [[-1.52, 3.3, -0.4], [-1.52, 3.3, -11.6], [-0.7, 3.62, -11.6], [-0.7, 3.62, -0.4]], c: ROOF, o: [0, 2.5, -6] })
  f.push({ p: [[0.7, 3.62, -0.4], [0.7, 3.62, -11.6], [1.52, 3.3, -11.6], [1.52, 3.3, -0.4]], c: ROOF, o: [0, 2.5, -6] })
  boxFaces(f, -0.7, 0.7, 3.62, 3.86, -1.0, -11.0, [48, 42, 44])
  f.push({ p: [[-0.7, 3.62, -0.4], [0.7, 3.62, -0.4], [0.7, 3.62, -11.6], [-0.7, 3.62, -11.6]], c: ROOF, o: [0, 2.5, -6] })
  // windows, both sides, lit by oil lamps
  for (let i = 0; i < 8; i++) {
    const z0 = -1.35 - i * 1.25, z1 = z0 - 0.78
    f.push({ p: [[-1.405, 2.0, z0], [-1.405, 2.0, z1], [-1.405, 2.85, z1], [-1.405, 2.85, z0]], c: [236, 160, 78], em: 0.9, win: i, o: [0, 2.2, -6] })
    f.push({ p: [[1.405, 2.0, z1], [1.405, 2.0, z0], [1.405, 2.85, z0], [1.405, 2.85, z1]], c: [236, 160, 78], em: 0.9, win: i + 8, o: [0, 2.2, -6] })
  }
  // end doors with a small lit pane, and the open end platforms
  f.push({ p: [[-0.42, 1.05, -0.59], [-0.42, 2.95, -0.59], [0.42, 2.95, -0.59], [0.42, 1.05, -0.59]], c: [52, 22, 18], o: [0, 2, -6] })
  f.push({ p: [[-0.25, 2.2, -0.58], [-0.25, 2.8, -0.58], [0.25, 2.8, -0.58], [0.25, 2.2, -0.58]], c: [255, 190, 110], em: 0.8, o: [0, 2, -6] })
  boxFaces(f, -1.3, 1.3, 0.95, 1.05, 0, -0.6, [40, 34, 30])
  boxFaces(f, -1.3, 1.3, 0.95, 1.05, -11.4, -12.0, [40, 34, 30])
  const lines = []
  for (const sx of [-1, 1]) {
    for (const z of [-0.78, -11.22]) lines.push({ a: [sx * 1.43, 1.3, z], b: [sx * 1.43, 2.9, z], col: BRASS, w: 0.03 }) // grab rails by the doors
    lines.push({ a: [sx * 1.53, 3.31, -0.4], b: [sx * 1.53, 3.31, -11.6], col: [30, 26, 28], w: 0.05 }) // rain gutter
    lines.push({ a: [sx * 1.3, 1.08, 0.0], b: [sx * 1.3, 1.6, 0.0], col: [60, 52, 44], w: 0.03 }) // end railing posts
    lines.push({ a: [sx * 1.3, 1.08, -12.0], b: [sx * 1.3, 1.6, -12.0], col: [60, 52, 44], w: 0.03 })
  }
  lines.push({ a: [-1.3, 1.6, 0.0], b: [1.3, 1.6, 0.0], col: [60, 52, 44], w: 0.03 }, { a: [-1.3, 1.6, -12.0], b: [1.3, 1.6, -12.0], col: [60, 52, 44], w: 0.03 })
  return { faces: f, lines, len: 12, axles: [-1.9, -10.1], wheels: [-1.4, -2.4, -9.6, -10.6].map((z) => ({ z, r: 0.45, col: IRON2 })) }
}

export function createTrain() {
  const loco = buildLoco(), tender = buildTender(), coach = buildCoach()
  const CARS = [loco, tender, coach, coach]
  const GAP = 0.6
  const offsets = [] // where each car's front end is, behind the engine's front
  let o = 0
  for (const c of CARS) { offsets.push(o); o += c.len + GAP }
  const TRAIN_LEN = o - GAP

  const S_START = sAtDepth(760) // out of sight in the haze, far down the line
  const S_STOP = sAtDepth(10.5) // the engine's front beside the platform
  const S_GONE = sAtDepth(0.2) + TRAIN_LEN + 1 // the last coach has passed you
  const st = { phase: 'away', s: S_START, v: 0, travel: 0, wait: 0, nextIn: 30, hiss: 0, whistle: 0, puffT: 0 }
  const steam = []
  const VMAX = 17, BRAKE = 0.8, ACC = 0.6

  function call() {
    if (st.phase !== 'away') return false
    st.phase = 'in'; st.s = S_START; st.v = VMAX
    return true
  }
  function whistle() { st.whistle = 1.4; if (st.phase === 'wait') st.wait = Math.min(st.wait, 2.2) }

  // ---- placing a car on the rails by its two axles
  function pose(front, car) {
    const a = at(front + car.axles[0]), b = at(front + car.axles[1])
    let dx = a[0] - b[0], dz = a[1] - b[1]
    const l = Math.hypot(dx, dz) || 1
    dx /= l; dz /= l
    const ox = a[0] - dx * car.axles[0], oz = a[1] - dz * car.axles[0] // the car's front end
    return { ox, oz, dx, dz, sx: -dz, sz: dx }
  }
  const toWorld = (P, q) => [P.ox + P.sx * q[0] + P.dx * q[2], q[1], P.oz + P.sz * q[0] + P.dz * q[2]]

  function update(dt) {
    if (st.phase === 'away') { st.nextIn -= dt; if (st.nextIn <= 0) call() }
    else if (st.phase === 'in') {
      st.v = Math.min(VMAX, Math.sqrt(2 * BRAKE * Math.max(0, S_STOP - st.s)))
      if (S_STOP - st.s < 0.02 || st.v < 0.03) { st.s = S_STOP; st.v = 0; st.phase = 'wait'; st.wait = 14; st.hiss = 3 }
    } else if (st.phase === 'wait') {
      st.wait -= dt
      if (st.wait <= 0) { st.phase = 'out'; st.hiss = 2; st.whistle = Math.max(st.whistle, 1.1) }
    } else if (st.phase === 'out') {
      st.v = Math.min(12, st.v + ACC * dt)
      if (st.s >= S_GONE) { st.phase = 'away'; st.v = 0; st.nextIn = 120 + Math.random() * 90 }
    }
    st.s += st.v * dt
    st.travel += st.v * dt
    st.hiss = Math.max(0, st.hiss - dt)
    st.whistle = Math.max(0, st.whistle - dt)

    if (st.phase !== 'away') {
      const P = pose(st.s, loco)
      // puffs from the chimney, quicker with speed; they stay where they are puffed out
      st.puffT -= dt
      if (st.puffT <= 0) {
        st.puffT = st.v > 0.3 ? Math.max(0.12, 1.9 / (st.v + 0.5)) : 0.45
        const w = toWorld(P, [0, 4.6, -2.05])
        steam.push({ p: w, v: [0.15 + Math.random() * 0.25, 1.5 + Math.random() * 0.8 + st.v * 0.04, 0], r: 0.32, gr: 0.75 + st.v * 0.03, life: 0, max: 5.5 + Math.random() * 2.5, a: 0.36, smoke: true })
      }
      if (st.hiss > 0) for (let k = 0; k < 2; k++) {
        const side = Math.random() < 0.5 ? -1.6 : 1.6
        const w = toWorld(P, [side, 0.9, -2.2])
        steam.push({ p: w, v: [P.sx * side * (0.7 + Math.random()), 0.3 + Math.random() * 0.5, P.sz * side * 0.7], r: 0.18, gr: 0.7, life: 0, max: 1 + Math.random(), a: 0.12 })
      }
      if (st.whistle > 0) steam.push({ p: toWorld(P, [0, 3.4, -6.55]), v: [0, 2.6, 0], r: 0.1, gr: 0.7, life: 0, max: 1, a: 0.45 })
      if (st.phase === 'wait' && Math.random() < dt * 1.2) steam.push({ p: toWorld(P, [0, 3.7, -4.7]), v: [0.1, 1.8, 0], r: 0.08, gr: 0.5, life: 0, max: 1.3, a: 0.3 })
    }
    for (let i = steam.length - 1; i >= 0; i--) {
      const q = steam[i]
      q.life += dt
      if (q.life > q.max) { steam.splice(i, 1); continue }
      const k = Math.pow(0.7, dt)
      q.v[0] = q.v[0] * k + 0.25 * dt; q.v[1] *= k; q.v[2] *= k // a light breeze to the right
      for (let j = 0; j < 3; j++) q.p[j] += q.v[j] * dt
      q.r += q.gr * dt
    }
  }

  // ---- lighting
  function lit(col, n, c, k = 1) {
    const amb = 0.2, sky = 0.24 * Math.max(0, n[1]), moon = 0.5 * Math.max(0, n[0] * MOON_DIR[0] + n[1] * MOON_DIR[1] + n[2] * MOON_DIR[2])
    const lx = LAMP_POS[0] - c[0], ly = LAMP_POS[1] - c[1], lz = LAMP_POS[2] - c[2], ld = Math.hypot(lx, ly, lz)
    const lamp = (1.4 * Math.max(0, (n[0] * lx + n[1] * ly + n[2] * lz) / ld)) / (1 + (ld * ld) / 40)
    const d = Math.hypot(c[0], c[1] - CAM.h, c[2])
    const fog = Math.min(0.88, 1 - Math.exp(-d / 150))
    const m = amb + sky + moon
    return [
      (col[0] * (m * 0.92 + lamp * 1.0) * k) * (1 - fog) + FOG[0] * fog,
      (col[1] * (m * 0.96 + lamp * 0.72) * k) * (1 - fog) + FOG[1] * fog,
      (col[2] * (m * 1.1 + lamp * 0.45) * k) * (1 - fog) + FOG[2] * fog,
    ]
  }
  const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`

  let puffImg = null
  function puffSprite() {
    if (puffImg) return puffImg
    puffImg = document.createElement('canvas'); puffImg.width = puffImg.height = 64
    const x = puffImg.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32)
    g.addColorStop(0, 'rgba(226,232,244,0.9)'); g.addColorStop(0.4, 'rgba(210,218,234,0.45)'); g.addColorStop(1, 'rgba(196,206,226,0)')
    x.fillStyle = g; x.fillRect(0, 0, 64, 64)
    return puffImg
  }
  function glowAt(g, x, y, r, rgbs, a) {
    if (a <= 0.003 || r < 1) return
    const gr = g.createRadialGradient(x, y, 0, x, y, r)
    gr.addColorStop(0, `rgba(${rgbs},${a})`); gr.addColorStop(1, `rgba(${rgbs},0)`)
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2)
  }

  let lastBox = null
  // g is already in the painting's pixel space (3840×2160)
  function draw(g, t, light) {
    const res = { beam: null, near: 0, lens: null }
    lastBox = null
    if (st.phase === 'away' && !steam.length) return res
    const far = Math.hypot(...at(st.s)) // distance of the engine front
    const fade = clamp((720 - far) / 220, 0, 1) // comes out of the haze far away
    const items = []
    const glows = []
    const mirrors = [] // lit windows, mirrored in the wet ground
    let lens = null
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9
    if (st.phase !== 'away') {
      CARS.forEach((car, ci) => {
        const front = st.s - offsets[ci]
        const P = pose(front, car)
        // shadow on the ballast
        const sh = clipNear([[-1.6, 0.02, 0.2], [-1.6, 0.02, -car.len - 0.2], [1.6, 0.02, -car.len - 0.2], [1.6, 0.02, 0.2]].map((q) => toWorld(P, q)))
        if (sh.length > 2) items.push({ d: 1e6 + Math.hypot(sh[0][0], sh[0][2]), shadow: sh.map(project) })
        for (const fc of car.faces) {
          const W0 = fc.p.map((q) => toWorld(P, q))
          const W = W0.some((w) => w[2] < NEAR_Z) ? clipNear(W0) : W0
          if (W.length < 3) continue
          const S = W.map(project)
          const c = [0, 0, 0]
          for (const w of W) { c[0] += w[0]; c[1] += w[1]; c[2] += w[2] }
          c[0] /= W.length; c[1] /= W.length; c[2] /= W.length // centre of what is visible
          const e1 = [W0[1][0] - W0[0][0], W0[1][1] - W0[0][1], W0[1][2] - W0[0][2]], e2 = [W0[2][0] - W0[0][0], W0[2][1] - W0[0][1], W0[2][2] - W0[0][2]]
          let n = norm([e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]])
          // point the normal outward (away from the part's middle), then keep only faces turned toward you
          const oc = toWorld(P, fc.o)
          if (n[0] * (c[0] - oc[0]) + n[1] * (c[1] - oc[1]) + n[2] * (c[2] - oc[2]) < 0) n = [-n[0], -n[1], -n[2]]
          if (n[0] * -c[0] + n[1] * (CAM.h - c[1]) + n[2] * -c[2] <= 0) continue
          items.push({ d: Math.hypot(c[0], c[1] - CAM.h, c[2]), S, fc, n, c, ci, W, W0, P })
          if (ci === 0) for (const p of S) { if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0]; if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1] }
        }
        for (const ln of car.lines || []) {
          const a = toWorld(P, ln.a), b = toWorld(P, ln.b)
          if (a[2] < NEAR_Z && b[2] < NEAR_Z) continue
          const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]
          items.push({ d: Math.hypot(m[0], m[1] - CAM.h, m[2]) - 0.12, line: ln, a, b, m })
        }
        // wheels on both sides, turning with the distance travelled
        for (const wh of car.wheels) for (const side of [-1, 1]) {
          const x = side * (wh.drive ? 1.08 : 1.02)
          const ctr = toWorld(P, [x, wh.r, wh.z])
          if (ctr[2] < NEAR_Z + wh.r) continue
          items.push({ d: Math.hypot(ctr[0], ctr[1] - CAM.h, ctr[2]) - 0.35, wheel: wh, P, x, ci })
        }
      })
    }
    items.sort((a, b) => b.d - a.d)

    g.save()
    g.globalAlpha = fade
    g.lineJoin = 'round'
    const spin = st.travel
    for (const it of items) {
      if (it.shadow) {
        const s = it.shadow
        g.fillStyle = 'rgba(4,6,10,0.4)'; g.beginPath(); g.moveTo(s[0][0], s[0][1]); for (let i = 1; i < s.length; i++) g.lineTo(s[i][0], s[i][1]); g.closePath(); g.fill()
        continue
      }
      if (it.wheel) { drawWheel(g, it, spin); continue }
      if (it.line) {
        let { a, b } = it
        if (a[2] < NEAR_Z || b[2] < NEAR_Z) { const k = (NEAR_Z - a[2]) / (b[2] - a[2]), q = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, NEAR_Z]; if (a[2] < NEAR_Z) a = q; else b = q }
        const pa = project(a), pb = project(b)
        g.strokeStyle = rgb(lit(it.line.col, [0, 0.6, -0.8], it.m, 1.2)); g.lineWidth = Math.max(0.8, (CAM.f / it.m[2]) * it.line.w); g.lineCap = 'round'
        g.beginPath(); g.moveTo(pa[0], pa[1]); g.lineTo(pb[0], pb[1]); g.stroke()
        continue
      }
      const { S, fc, n, c } = it
      let col
      if (fc.em) {
        const fl = fc.fire ? 0.8 + 0.2 * Math.sin(t * 9 + it.ci) * Math.sin(t * 3.3) : 0.92 + 0.08 * Math.sin(t * 2.3 + (fc.win || 0) * 1.7)
        const fog = Math.min(0.7, 1 - Math.exp(-it.d / 260))
        col = [fc.c[0] * fl * (1 - fog) + FOG[0] * fog, fc.c[1] * fl * (1 - fog) + FOG[1] * fog, fc.c[2] * fl * (1 - fog) + FOG[2] * fog]
        const cx = S.reduce((a, p) => a + p[0], 0) / S.length, cy = S.reduce((a, p) => a + p[1], 0) / S.length
        const size = Math.hypot(S[0][0] - S[2][0], S[0][1] - S[2][1])
        if (fc.lens) lens = [cx, cy, CAM.f / it.d]
        else {
          glows.push([cx, cy, size * 1.2, fc.fire ? '255,140,60' : '255,176,96', 0.12 * fl])
          if (fc.win !== undefined) mirrors.push([c, fl])
        }
      } else col = lit(fc.c, n, c)
      g.beginPath(); g.moveTo(S[0][0], S[0][1]); for (let i = 1; i < S.length; i++) g.lineTo(S[i][0], S[i][1]); g.closePath()
      const px = CAM.f / it.d // pixels per metre here
      if (fc.em) g.fillStyle = rgb(col)
      else { // lighter at the top, darker toward the wet ground
        let y0 = 1e9, y1 = -1e9
        for (const p of S) { if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1] }
        const top = 1.18 - 0.12 * clamp((c[1] - 1) / 3, 0, 1)
        const gr = g.createLinearGradient(0, y0, 0, y1 + 1)
        gr.addColorStop(0, rgb([col[0] * top, col[1] * top, col[2] * top])); gr.addColorStop(1, rgb([col[0] * 0.72, col[1] * 0.72, col[2] * 0.75]))
        g.fillStyle = gr
      }
      g.fill()
      if (!fc.smooth) { g.strokeStyle = `rgba(8,8,12,${fc.em ? 0.5 : 0.3})`; g.lineWidth = Math.max(0.6, px * 0.01); g.stroke() }
      else { g.strokeStyle = rgb(col); g.lineWidth = 1; g.stroke() } // hide the seams between strips
      const whole = it.W === it.W0
      const seg = (q0, q1) => { // a line on this car, in its own coordinates, cut at the near plane
        let a = toWorld(it.P, q0), b = toWorld(it.P, q1)
        if (a[2] < NEAR_Z && b[2] < NEAR_Z) return
        if (a[2] < NEAR_Z || b[2] < NEAR_Z) { const t = (NEAR_Z - a[2]) / (b[2] - a[2]), m = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, NEAR_Z]; if (a[2] < NEAR_Z) a = m; else b = m }
        const pa = project(a), pb = project(b)
        g.moveTo(pa[0], pa[1]); g.lineTo(pb[0], pb[1])
      }
      if (fc.slats && whole) { // the cow catcher's bars
        g.strokeStyle = rgb(lit([96, 62, 50], n, c)); g.lineWidth = Math.max(0.8, px * 0.03); g.beginPath()
        for (let k = 1; k < fc.slats; k++) { const u = k / fc.slats; const a = [S[0][0] + (S[3][0] - S[0][0]) * u, S[0][1] + (S[3][1] - S[0][1]) * u], b = [S[1][0] + (S[2][0] - S[1][0]) * u, S[1][1] + (S[2][1] - S[1][1]) * u]; g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]) }
        g.stroke()
      }
      if (fc.door && whole) { // hinge straps across the smokebox door
        g.strokeStyle = rgb(lit([120, 104, 70], n, c)); g.lineWidth = Math.max(0.8, px * 0.035); g.beginPath()
        const cx = S.reduce((a, p) => a + p[0], 0) / S.length, cy = S.reduce((a, p) => a + p[1], 0) / S.length, rr = px * 0.55
        g.moveTo(cx - rr, cy - rr * 0.25); g.lineTo(cx + rr * 0.2, cy - rr * 0.25); g.moveTo(cx - rr, cy + rr * 0.25); g.lineTo(cx + rr * 0.2, cy + rr * 0.25); g.stroke()
      }
      if (fc.win !== undefined) { // window frame and glazing bars
        const q = fc.p, x = q[0][0], zm = (q[0][2] + q[1][2]) / 2, ym = 2.55
        g.strokeStyle = `rgba(60,30,20,0.85)`; g.lineWidth = Math.max(0.8, px * 0.04); g.beginPath()
        seg([x, q[0][1], zm], [x, q[2][1], zm]); seg([x, ym, q[0][2]], [x, ym, q[1][2]])
        seg(q[0], q[1]); seg(q[1], q[2]); seg(q[2], q[3]); seg(q[3], q[0])
        g.stroke()
      }
      if (fc.lining && Math.abs(fc.p[0][0] - fc.p[1][0]) < 1e-6) { // gold lines and panel beading along the sides
        const x = fc.p[0][0], za = fc.p[0][2], zb = fc.p[1][2], ya = fc.p[0][1], yb = fc.p[2][1]
        g.strokeStyle = rgb(lit([190, 150, 80], n, c)); g.lineWidth = Math.max(0.6, px * 0.022); g.beginPath()
        for (const ly of fc.lining) seg([x, ly, za], [x, ly, zb])
        g.stroke()
        if (fc.panels) {
          g.strokeStyle = rgb(lit([70, 24, 20], n, c)); g.lineWidth = Math.max(0.6, px * 0.02); g.beginPath()
          for (const pz of fc.panels) seg([x, ya + 0.08, pz], [x, yb - 0.08, pz])
          g.stroke()
        }
      }
      // moonlight catching the top edge of upright faces
      if (!fc.em && !fc.smooth && Math.abs(n[1]) < 0.3 && S.length >= 4) {
        let i0 = 0
        for (let i = 1; i < S.length; i++) if (S[i][1] + S[(i + 1) % S.length][1] < S[i0][1] + S[(i0 + 1) % S.length][1]) i0 = i
        const a = S[i0], b = S[(i0 + 1) % S.length]
        g.strokeStyle = `rgba(150,172,222,${0.3 * light})`; g.lineWidth = Math.max(0.7, px * 0.018)
        g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke()
      }
      // wet highlight on upward faces
      if (n[1] > 0.6 && !fc.em) { g.strokeStyle = `rgba(150,172,220,${0.25 * light})`; g.lineWidth = Math.max(0.6, px * 0.012); g.stroke() }
    }
    // window and lamp glow
    g.globalCompositeOperation = 'lighter'
    for (const w of glows) glowAt(g, w[0], w[1], w[2], w[3], w[4] * fade)
    // their reflections on the wet ballast and platform edge: soft warm streaks below the ground line
    for (const [c, fl] of mirrors) {
      const p0 = [c[0] - 0.4, 0.02, c[2]], p1 = [c[0] - 0.4, -c[1] * 0.9, c[2]]
      if (p0[2] < NEAR_Z) continue
      const q0 = project(p0), q1 = project(p1), wdt = (CAM.f / p0[2]) * 0.35
      const gr = g.createLinearGradient(q0[0], q0[1], q1[0], q1[1])
      gr.addColorStop(0, `rgba(255,170,90,${0.12 * fl * fade})`); gr.addColorStop(1, 'rgba(255,170,90,0)')
      g.fillStyle = gr; g.fillRect(q0[0] - wdt / 2, q0[1], wdt, Math.max(1, q1[1] - q0[1]))
    }
    if (st.phase !== 'away') {
      const P = pose(st.s, loco)
      // glints of the headlamp on the wet rails ahead
      for (const side of [-0.72, 0.72]) for (let k = 0; k < 10; k++) {
        const s0 = st.s + 0.4 + k * 1.3
        const a0 = at(s0), a1 = at(s0 + 0.8)
        const dir = [a1[0] - a0[0], a1[1] - a0[1]], l = Math.hypot(dir[0], dir[1]) || 1, sx = -dir[1] / l, sz = dir[0] / l
        const p0 = [a0[0] + sx * side, 0.05, a0[1] + sz * side], p1 = [a1[0] + sx * side, 0.05, a1[1] + sz * side]
        if (p0[2] < NEAR_Z || p1[2] < NEAR_Z) continue
        const q0 = project(p0), q1 = project(p1)
        g.strokeStyle = `rgba(255,222,170,${0.45 * (1 - k / 10) * fade})`; g.lineWidth = Math.max(1, (CAM.f / p0[2]) * 0.05)
        g.beginPath(); g.moveTo(q0[0], q0[1]); g.lineTo(q1[0], q1[1]); g.stroke()
      }
      if (lens && lens[0] > -500 && lens[0] < 4400) {
        const s = lens[2]
        glowAt(g, lens[0], lens[1], s * 0.9 + 18, '255,230,180', 0.7 * fade)
        glowAt(g, lens[0], lens[1], s * 3.4 + 50, '255,200,130', 0.2 * fade)
        // the headlamp mirrored in the wet ground ahead of the engine
        const lw = toWorld(P, [0, -3.42, -1.0])
        if (lw[2] > NEAR_Z) {
          const q = project(lw), r = s * 1.6 + 20
          g.save(); g.translate(q[0], q[1]); g.scale(0.55, 1.6)
          glowAt(g, 0, 0, r, '255,214,150', 0.22 * fade)
          g.restore()
        }
        // a beam through the rain, toward you along the rails
        const ahead = toWorld(P, [0, 1.6, 22])
        if (ahead[2] > NEAR_Z) {
          const q = project(ahead), w = (CAM.f / ahead[2]) * 3.2
          const dx = q[0] - lens[0], dy = q[1] - lens[1], dl = Math.hypot(dx, dy) || 1, nx = -dy / dl, ny = dx / dl
          const gr = g.createLinearGradient(lens[0], lens[1], q[0], q[1])
          gr.addColorStop(0, `rgba(255,214,150,${0.14 * fade})`); gr.addColorStop(1, 'rgba(255,214,150,0)')
          g.fillStyle = gr; g.beginPath(); g.moveTo(lens[0] + nx * s * 0.2, lens[1] + ny * s * 0.2); g.lineTo(q[0] + nx * w, q[1] + ny * w); g.lineTo(q[0] - nx * w, q[1] - ny * w); g.lineTo(lens[0] - nx * s * 0.2, lens[1] - ny * s * 0.2); g.closePath(); g.fill()
          res.beam = { x0: lens[0], y0: lens[1], x1: q[0], y1: q[1], w }
        }
        res.lens = lens
        res.near = clamp((s - 25) / 120, 0, 1)
      }
    }
    g.globalCompositeOperation = 'source-over'
    // steam and smoke, far ones first
    const sp = puffSprite()
    steam.sort((a, b) => b.p[2] - a.p[2])
    for (const q of steam) {
      if (q.p[2] < NEAR_Z) continue
      const k = q.life / q.max, a = q.a * Math.min(1, k * 10) * (1 - k) * (q.smoke ? 0.75 * light + 0.25 : 1)
      const pp = project(q.p), r = (q.r * CAM.f) / q.p[2]
      if (a < 0.01 || r < 0.5) continue
      g.globalAlpha = a * fade
      g.drawImage(sp, pp[0] - r, pp[1] - r, r * 2, r * 2)
    }
    g.restore()
    if (minX < 1e9) lastBox = [minX, minY, maxX, maxY]
    return res

    function drawWheel(gg, it, travel) {
      const { wheel: wh, P, x } = it
      const ang = -travel / wh.r
      const pt = (a, rr) => project(toWorld(P, [x, wh.r + Math.sin(a) * rr, wh.z + Math.cos(a) * rr]))
      const ring = (rr) => { gg.beginPath(); for (let i = 0; i <= 20; i++) { const p = pt((i / 20) * Math.PI * 2, rr); i ? gg.lineTo(p[0], p[1]) : gg.moveTo(p[0], p[1]) } gg.closePath() }
      const ctrW = toWorld(P, [x, wh.r, wh.z]), ctr = project(ctrW)
      const n = [P.sx * Math.sign(x), 0, P.sz * Math.sign(x)]
      ring(wh.r); gg.fillStyle = rgb(lit([28, 28, 30], n, ctrW)); gg.fill()
      ring(wh.r * 0.84); gg.fillStyle = rgb(lit([18, 18, 20], n, ctrW)); gg.fill()
      const px = CAM.f / ctrW[2]
      gg.strokeStyle = rgb(lit(wh.col, n, ctrW, 1.3)); gg.lineWidth = Math.max(0.8, px * (wh.drive ? 0.05 : 0.035)); gg.beginPath()
      const spokes = wh.drive ? 14 : 8
      for (let i = 0; i < spokes; i++) { const p = pt(ang + (i / spokes) * Math.PI * 2, wh.r * 0.84); gg.moveTo(ctr[0], ctr[1]); gg.lineTo(p[0], p[1]) }
      gg.stroke()
      ring(wh.r); gg.strokeStyle = `rgba(150,170,210,${0.5 * light})`; gg.lineWidth = Math.max(0.8, px * 0.02); gg.stroke()
      gg.fillStyle = rgb(lit(BRASS, n, ctrW)); gg.beginPath(); gg.arc(ctr[0], ctr[1], Math.max(1, wh.r * 0.14 * px), 0, 7); gg.fill()
      if (wh.drive && wh.z === -6.8) { // rods: side rod between the drivers, main rod to the piston
        const crank = 0.32
        const pinW = (z) => toWorld(P, [x + Math.sign(x) * 0.06, wh.r + Math.sin(ang) * crank, z + Math.cos(ang) * crank])
        const headW = toWorld(P, [x + Math.sign(x) * 0.06, 1.12, -2.85 + Math.cos(ang) * crank])
        const ws = [pinW(-5.0), pinW(-6.8), headW]
        if (ws.some((w) => w[2] < NEAR_Z + 0.5)) return
        const [a, b, head] = ws.map(project)
        gg.lineCap = 'round'
        gg.strokeStyle = rgb(lit([150, 152, 160], n, ctrW, 1.2)); gg.lineWidth = Math.max(1.2, px * 0.09)
        gg.beginPath(); gg.moveTo(a[0], a[1]); gg.lineTo(b[0], b[1]); gg.moveTo(head[0], head[1]); gg.lineTo(a[0], a[1]); gg.stroke()
        gg.strokeStyle = `rgba(200,214,240,${0.35 * light})`; gg.lineWidth = Math.max(0.6, px * 0.025)
        gg.beginPath(); gg.moveTo(a[0], a[1]); gg.lineTo(b[0], b[1]); gg.stroke()
      }
    }
  }

  function hit(x, y) {
    return Boolean(lastBox && x > lastBox[0] && x < lastBox[2] && y > lastBox[1] && y < lastBox[3])
  }

  return { update, draw, call, whistle, hit, state: st, S_STOP, S_GONE }
}
