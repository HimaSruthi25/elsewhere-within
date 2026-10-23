import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  HORIZON,
  PHOTO_ASPECT,
  PHOTO_FOCUS,
  SHORELINE,
  coverTransform,
  planeToImageUv,
  rippleOriginAt,
  rippleStrengthAt,
  shorelineAt,
} from './lakeGeometry.js'

const toImage = ({ scale, offset }, sx, sy) => [sx * scale[0] + offset[0], sy * scale[1] + offset[1]]
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`)

for (const [label, w, h] of [
  ['wide desktop', 1440, 900],
  ['ultrawide', 3440, 1440],
  ['portrait phone', 390, 844],
  ['landscape phone', 844, 390],
  ['exact 5:4', 1250, 1000],
]) {
  test(`cover transform matches CSS object-fit: cover (${label})`, () => {
    const t = coverTransform(w, h)
    // CSS percentage positioning puts the image's focus point at the same
    // fraction of the viewport.
    const [fx, fy] = toImage(t, PHOTO_FOCUS.x, PHOTO_FOCUS.y)
    close(fx, PHOTO_FOCUS.x)
    close(fy, PHOTO_FOCUS.y)
    // Cover: the viewport never shows past the image edges, and one axis fits exactly.
    const [x0, y0] = toImage(t, 0, 0)
    const [x1, y1] = toImage(t, 1, 1)
    assert.ok(x0 >= -1e-9 && y0 >= -1e-9 && x1 <= 1 + 1e-9 && y1 <= 1 + 1e-9)
    assert.ok(Math.abs(x1 - x0 - 1) < 1e-9 || Math.abs(y1 - y0 - 1) < 1e-9)
    // Uniform scaling: screen pixels map to image pixels isotropically.
    close((t.scale[0] / t.scale[1]) * 1.25, w / h)
  })
}

test('shoreline points are sorted and lie on the horizon band', () => {
  for (let i = 1; i < SHORELINE.length; i++) assert.ok(SHORELINE[i][0] >= SHORELINE[i - 1][0])
  assert.equal(SHORELINE[0][0], 0)
  assert.equal(SHORELINE.at(-1)[0], 1)
  for (const [, y] of SHORELINE) assert.ok(y > 0.5 && y < 0.52)
})

const SPOTS = []
for (let a = 0; a <= 1; a += 0.25) for (let b = 0; b <= 1; b += 0.25) SPOTS.push([a, b])

for (const [label, w, h] of [
  ['wide desktop', 1440, 900],
  ['Edge window', 1230, 870],
  ['ultrawide', 3440, 1440],
  ['portrait phone', 390, 844],
  ['landscape phone', 844, 390],
]) {
  test(`every ripple spot lands on visible water, clear of the shore and edges (${label})`, () => {
    const t = coverTransform(w, h)
    const [left, top] = toImage(t, 0, 0)
    const [right, bottom] = toImage(t, 1, 1)
    for (const spot of SPOTS) {
      const [u, v] = planeToImageUv(rippleOriginAt(t, spot))
      const shore = Math.max(shorelineAt(u), top)
      const band = bottom - shore
      assert.ok(u > left + 0.1 * (right - left) && u < right - 0.1 * (right - left), `${spot}: away from the sides`)
      assert.ok(v > shore + 0.2 * band, `${spot}: well below the shoreline`)
      assert.ok(v < bottom - 0.25 * band, `${spot}: well above the bottom edge`)
    }
  })

  test(`every spot gets the centre spot's peak displacement (${label})`, () => {
    const t = coverTransform(w, h)
    close(rippleStrengthAt(t, [0.5, 0.5]), 1)
    const depthAt = (spot) => planeToImageUv(rippleOriginAt(t, spot))[1] - HORIZON
    const centre = depthAt([0.5, 0.5])
    for (const spot of SPOTS) close(rippleStrengthAt(t, spot) * depthAt(spot), centre, 1e-9)
    assert.ok(rippleStrengthAt(t, [0.5, 1]) < 1, 'nearer rings are toned down')
  })

  test(`different spots give clearly different origins (${label})`, () => {
    const t = coverTransform(w, h)
    const [left] = toImage(t, 0, 0)
    const [right] = toImage(t, 1, 1)
    const [ua] = planeToImageUv(rippleOriginAt(t, [0, 0.5]))
    const [ub] = planeToImageUv(rippleOriginAt(t, [1, 0.5]))
    assert.ok(ub - ua > 0.6 * (right - left), 'spread across most of the visible width')
    const [, near] = planeToImageUv(rippleOriginAt(t, [0.5, 1]))
    const [, far] = planeToImageUv(rippleOriginAt(t, [0.5, 0]))
    assert.ok(near > far, 'down = 1 is nearer the viewer than down = 0')
  })
}

test('planeToImageUv inverts the shader plane mapping', () => {
  const [u, v] = [0.3, 0.7]
  const z = 1 / (v - HORIZON)
  const [bu, bv] = planeToImageUv([(u - 0.5) * PHOTO_ASPECT * z, z])
  close(bu, u)
  close(bv, v)
})

test('the perspective horizon is straight and above all of the water', () => {
  for (const [, y] of SHORELINE) assert.ok(HORIZON < y)
  assert.ok(Math.min(...SHORELINE.map(([, y]) => y)) - HORIZON < 0.001)
})

test('shorelineAt passes through the traced points and interpolates between them', () => {
  for (const [x, y] of SHORELINE.slice(0, 3)) close(shorelineAt(x), y)
  const [ax, ay] = SHORELINE[5]
  const [bx, by] = SHORELINE[6]
  close(shorelineAt((ax + bx) / 2), (ay + by) / 2)
  close(shorelineAt(-0.1), SHORELINE[0][1])
  close(shorelineAt(1.1), SHORELINE.at(-1)[1])
})
