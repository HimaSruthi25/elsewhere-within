import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DECORATIVE_DEFAULTS, createDecorativeSignal } from './decorativeRipples.js'
import { CENTRE_SPOT, MAX_RIPPLES, createBreathDrive } from '../../src/water/breathDrive.js'

const FPS = 30

function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Onset times of events over `seconds`.
function onsets(signalAt, seconds) {
  const out = []
  let was = false
  for (let i = 0; i < seconds * FPS; i++) {
    const breath = signalAt(i / FPS).status === 'breath'
    if (breath && !was) out.push(i / FPS)
    was = breath
  }
  return out
}

test('the first ripple comes soon, then events are spaced irregularly within the set range', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const times = onsets(createDecorativeSignal({}, seeded(seed)), 300)
    assert.ok(times[0] >= DECORATIVE_DEFAULTS.firstDelay[0] - 0.05 && times[0] <= DECORATIVE_DEFAULTS.firstDelay[1] + 0.05)
    const gaps = times.slice(1).map((t, i) => t - times[i])
    const [shortest, longest] = DECORATIVE_DEFAULTS.interval
    for (const g of gaps) assert.ok(g >= shortest - 0.05 && g <= longest + 0.05, `gap ${g}`)
    const mean = gaps.reduce((a, b) => a + b) / gaps.length
    const spread = Math.sqrt(gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length)
    assert.ok(spread > 0.3, 'not a clockwork rhythm')
  }
})

test('events are soft swells within the set strength range', () => {
  const signalAt = createDecorativeSignal({}, seeded(4))
  let peak = 0
  for (let i = 0; i < 60 * FPS; i++) {
    const s = signalAt(i / FPS)
    assert.ok(s.response >= 0 && s.response <= DECORATIVE_DEFAULTS.peak[1])
    if (s.status !== 'breath') assert.equal(s.response, 0)
    peak = Math.max(peak, s.response)
  }
  assert.ok(peak >= DECORATIVE_DEFAULTS.peak[0] * 0.95)
})

test('with the screensaver drive, every event makes a ring at the same fixed spot', () => {
  const signalAt = createDecorativeSignal({}, seeded(9))
  const drive = createBreathDrive({ fixedSpot: CENTRE_SPOT }, seeded(11))
  const expected = onsets(createDecorativeSignal({}, seeded(9)), 120).length
  const before = new Array(MAX_RIPPLES).fill(0)
  let births = 0
  let mostAtOnce = 0
  for (let i = 0; i < 120 * FPS; i++) {
    const out = drive.step(signalAt(i / FPS), 1 / FPS)
    let live = 0
    for (let k = 0; k < MAX_RIPPLES; k++) {
      const r = out.ripples[k * 2]
      if (r > 0 && (before[k] === 0 || r < before[k])) births++
      before[k] = r
      if (out.ripples[k * 2 + 1] > 0) {
        live++
        assert.deepEqual(Array.from(out.spots.slice(k * 2, k * 2 + 2)), CENTRE_SPOT)
      }
    }
    mostAtOnce = Math.max(mostAtOnce, live)
    if (i === 120 * FPS - 1) assert.equal(out.ringsStarted, expected)
  }
  assert.ok(expected >= 19 && expected <= 30, `${expected} ring events in 2 minutes`)
  assert.ok(births >= expected - 1, 'every event becomes a ring')
  assert.equal(mostAtOnce, MAX_RIPPLES, 'several concentric rings at once')
})
