import { describe, expect, it } from 'vitest'
import { detectMotion, trackBlobs, GW, GH } from '../core/camera.js'
import { parseCameraMessage } from '../core/wallpaper.js'

const frame = (fill = 100) => new Float32Array(GW * GH).fill(fill)
function square(f, x0, y0, size, value) {
  for (let y = y0; y < y0 + size; y++) for (let x = x0; x < x0 + size; x++) f[y * GW + x] = value
  return f
}

describe('parseCameraMessage', () => {
  it('reads camera on/off and ignores anything else', () => {
    expect(parseCameraMessage('camera on')).toBe(true)
    expect(parseCameraMessage('camera off')).toBe(false)
    for (const bad of ['', 'camera', 'camera maybe', 'freeze']) expect(parseCameraMessage(bad)).toBeNull()
  })
})

describe('detectMotion', () => {
  it('finds nothing in a still picture or in small noise', () => {
    expect(detectMotion(frame(), frame()).blobs).toEqual([])
    const noisy = frame(); for (let i = 0; i < noisy.length; i += 7) noisy[i] += 6
    expect(detectMotion(frame(), noisy).blobs).toEqual([])
  })
  it('finds a moving hand as one blob where it is', () => {
    const { blobs } = detectMotion(frame(), square(frame(), 40, 8, 12, 220))
    expect(blobs).toHaveLength(1)
    expect(blobs[0].x).toBeGreaterThan(9); expect(blobs[0].x).toBeLessThan(13) // blocks 10..12
    expect(blobs[0].y).toBeGreaterThan(1); expect(blobs[0].y).toBeLessThan(5)
  })
  it('keeps two separate hands apart', () => {
    const f = square(square(frame(), 4, 30, 8, 220), 50, 30, 8, 220)
    expect(detectMotion(frame(), f).blobs).toHaveLength(2)
  })
})

describe('trackBlobs', () => {
  it('gives a blob the velocity of its movement since the last frame', () => {
    const [b] = trackBlobs([{ x: 6, y: 4 }], [{ x: 5, y: 4, vx: 0, vy: 0 }], 0.1)
    expect(b.vx).toBeCloseTo(5.5) // (1 block / 0.1 s) * 0.55
    expect(b.vy).toBe(0)
  })
  it('starts new blobs at rest', () => {
    const [b] = trackBlobs([{ x: 2, y: 2 }], [{ x: 14, y: 10, vx: 3, vy: 3 }], 0.1)
    expect(b.vx).toBe(0); expect(b.vy).toBe(0)
  })
})
