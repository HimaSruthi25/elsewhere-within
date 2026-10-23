import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { RING_STRENGTH, fragmentShader } from './shaders.js'
import { DEFAULT_RING_BOOST, applyRingBoost, waterDiagnostics } from './waterDiagnostics.js'
import { DEBUG_GLSL, DEBUG_MODES, PROBE_PX_RANGE, decodeProbe, defaultProbePoint } from './shaderDebug.js'
import { coverTransform, shorelineAt } from './lakeGeometry.js'

const production = fragmentShader(13, 4)
const debug = fragmentShader(13, 4, DEBUG_GLSL)

test('the production shader contains none of the debug code', () => {
  for (const name of ['uDebugMode', 'uViewPx', 'debugBands']) assert.ok(!production.includes(name), name)
  assert.ok(!/undefined|null/.test(production))
  assert.equal(fragmentShader(13, 4, null), production)
})

const sha256 = (s) => createHash('sha256').update(s).digest('hex')

test('the production shader source is pinned', () => {
  assert.equal(sha256(production), PRODUCTION_SHADER_SHA256)
})

test('the production shader differs from the previous one only by ring strength and per-ring origins', () => {
  // Undo exactly the intended edits; what remains must be the old shader byte for byte.
  const undone = production
    .replace('#define RING_STRENGTH 0.70', '#define RING_STRENGTH 0.07')
    .replace(
      'uniform vec2 uRipples[MAX_RIPPLES]; // (radius, strength); strength 0 = unused\nuniform vec2 uRippleCenters[MAX_RIPPLES]; // each ring\'s origin on the water plane',
      'uniform vec2 uRippleCenter;  // ripple origin on the water plane\nuniform vec2 uRipples[MAX_RIPPLES]; // (radius, strength); strength 0 = unused',
    )
    .replace('vec2 ring(vec2 p, vec2 ripple, vec2 center) {\n  vec2 d = p - center;', 'vec2 ring(vec2 p, vec2 ripple) {\n  vec2 d = p - uRippleCenter;')
    .replace('rings += ring(p, uRipples[i], uRippleCenters[i]);', 'rings += ring(p, uRipples[i]);')
  assert.equal(sha256(undone), PREVIOUS_PRODUCTION_SHADER_SHA256)
})

test('production ring strength is ten times the old one, the confirmed x10 boost', () => {
  assert.ok(Math.abs(RING_STRENGTH - 10 * 0.07) < 1e-12)
  assert.ok(production.includes('#define RING_STRENGTH 0.70'))
  // The boost scaled each ring's strength, and the shader is linear in it, so
  // x10 on the strengths equals x10 on RING_STRENGTH.
  assert.ok(production.includes('rings * (RING_STRENGTH * uAmbient)'))
  assert.ok(production.includes('return (d / r) * slope * ripple.y * spreading;'))
})

test('the dev boost defaults to x1, so it never multiplies the production strength again', () => {
  assert.equal(DEFAULT_RING_BOOST, 1)
  assert.equal(waterDiagnostics.ringBoost, DEFAULT_RING_BOOST)
  const ripples = new Float32Array([0.5, 0.4, 1.2, 0.3])
  applyRingBoost(ripples, DEFAULT_RING_BOOST)
  assert.deepEqual(Array.from(ripples), Array.from(new Float32Array([0.5, 0.4, 1.2, 0.3])))
  applyRingBoost(ripples, 2) // only strengths change, never radii
  assert.deepEqual(Array.from(ripples), Array.from(new Float32Array([0.5, 0.8, 1.2, 0.6])))
})

test('the dev boost is applied only inside the development-only block', async () => {
  const source = await readFile(new URL('../components/WaterCanvas.jsx', import.meta.url), 'utf8')
  const devBlock = source.indexOf('if (import.meta.env.DEV) {\n          const driven')
  const call = source.indexOf('applyRingBoost(')
  assert.ok(devBlock !== -1 && call > devBlock, 'boost sits in the DEV block')
  assert.equal(source.indexOf('applyRingBoost(', call + 1), -1, 'boost applied once')
  assert.ok(call < source.indexOf('debug = {', devBlock), 'and before that block ends')
})

test('debug hooks sit at the right points of the shader', () => {
  const at = (s) => {
    const i = debug.indexOf(s)
    assert.ok(i >= 0, `missing: ${s}`)
    return i
  }
  assert.ok(at('uniform float uDebugMode') < at('void main()'))
  assert.ok(at('uDebugMode > 0.5 && uDebugMode < 1.5') < at('float belowShore')) // A ignores the mask
  assert.ok(at('if (belowShore <= 0.0)') < at('uDebugMode > 1.5 && uDebugMode < 2.5')) // B only on water
  assert.ok(at('vec2 p = vec2(') < at('uDebugMode > 1.5 && uDebugMode < 2.5')) // B uses water-plane coords
  assert.ok(at('offset.y = max(') < at('length(ringOffset)')) // probe sees the final offsets
  assert.ok(at('length(ringOffset)') < at('vec2 sampleUv'))
})

test('mode numbers match the shader branches', () => {
  assert.deepEqual(DEBUG_MODES, { normal: 0, patternUnmasked: 1, patternMasked: 2, probe: 3 })
})

test('probe pixels decode to mask and displacement', () => {
  assert.deepEqual(decodeProbe([0, 0, 0]), { water: false, shoreFade: 0, ringPx: 0, totalPx: 0 })
  const open = decodeProbe([255, 128, 255])
  assert.equal(open.water, true)
  assert.equal(open.shoreFade, 1)
  assert.ok(Math.abs(open.ringPx - PROBE_PX_RANGE * (128 / 255)) < 1e-9)
  assert.equal(open.totalPx, PROBE_PX_RANGE)
  const nearShore = decodeProbe([Math.round(0.2 * 255), 0, 0])
  assert.equal(nearShore.water, true)
  assert.ok(nearShore.shoreFade < 0.01)
})

for (const [w, h] of [[1536, 864], [1440, 900], [390, 844], [844, 390]]) {
  test(`default probe point is on visible water below the ripple origin (${w}x${h})`, () => {
    const { x, y } = defaultProbePoint(w, h)
    assert.ok(x > 0 && x < w && y > 0 && y < h, `(${x}, ${y}) on screen`)
    const t = coverTransform(w, h)
    const u = (x / w) * t.scale[0] + t.offset[0]
    const v = (y / h) * t.scale[1] + t.offset[1]
    assert.ok(v > shorelineAt(u) + 0.02, 'on the water')
  })
}

// sha256 of fragmentShader(13, 4). Update it only for a deliberate change
// to the production shader.
const PRODUCTION_SHADER_SHA256 = '852e1b83ede13c8742999571320e2a609a2e8549ae9eca4535790e54460e2f86'
// The production shader before the x10 strength and per-ring origins.
const PREVIOUS_PRODUCTION_SHADER_SHA256 = 'cc50f92f1c1f882df94b2574224bb2654000c1c1ed3f2fa02b310da11cd5718f'
