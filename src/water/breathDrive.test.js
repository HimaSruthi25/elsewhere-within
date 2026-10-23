import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CENTRE_SPOT, DRIVE_DEFAULTS, MAX_RIPPLES, createBreathDrive } from './breathDrive.js'
import { createBreathEstimator } from '../breathing/breathEstimator.js'

const FPS = 60

// Runs the drive over a signal function of time; returns a per-frame record.
function run(drive, signalAt, seconds, fps = FPS) {
  const out = []
  for (let i = 0; i < Math.round(seconds * fps); i++) {
    const { level, ripples } = drive.step(signalAt(i / fps), 1 / fps)
    const rings = []
    for (let k = 0; k < MAX_RIPPLES; k++) if (ripples[k * 2 + 1] > 0) rings.push({ radius: ripples[k * 2], strength: ripples[k * 2 + 1] })
    out.push({ level, rings, raw: Array.from(ripples) })
  }
  return out
}
const quiet = () => ({ status: 'listening', response: 0, confidence: 0 })
const constant = (response, confidence = 1) => () => ({ status: response > 0 ? 'breath' : 'listening', response, confidence })
// Breathing as the microphone estimator reports it: a breath sound swelling
// over `soundSeconds` of each cycle (status 'breath'), then quiet.
const breathing = (peak, cycle = 10, soundSeconds = 0.4 * cycle, confidence = 1) => (t) => {
  const p = t % cycle
  return p < soundSeconds
    ? { status: 'breath', response: peak * Math.sin((Math.PI / 2) * (p / soundSeconds)), confidence }
    : { status: 'listening', response: 0, confidence }
}
// Counts ripple births: a slot that becomes active, or whose radius restarts.
function births(frames) {
  let n = 0
  for (let k = 0; k < MAX_RIPPLES; k++) if (frames[0].raw[k * 2] > 0) n++
  for (let i = 1; i < frames.length; i++)
    for (let k = 0; k < MAX_RIPPLES; k++) {
      const before = frames[i - 1].raw[k * 2]
      const now = frames[i].raw[k * 2]
      if (now > 0 && (before === 0 || now < before)) n++
    }
  return n
}

test('starts still and stays still without a signal', () => {
  const frames = run(createBreathDrive(), quiet, 10)
  assert.ok(frames.every((f) => f.level === 0 && f.rings.length === 0))
})

test('one breath makes one ring that expands, then fades away on its own', () => {
  const frames = run(createBreathDrive(), breathing(0.6, 1000, 4), 25)
  assert.equal(births(frames), 1)
  const alive = frames.filter((f) => f.rings.length === 1)
  for (let i = 1; i < alive.length; i++) assert.ok(alive[i].rings[0].radius > alive[i - 1].rings[0].radius, 'always expanding')
  const peak = Math.max(...alive.map((f) => f.rings[0].strength))
  assert.ok(peak > 0.2, `peak strength ${peak}`)
  assert.equal(frames.at(-1).rings.length, 0, 'gone after its lifetime')
})

test('the ring keeps expanding and fading after the breath has ended', () => {
  const frames = run(createBreathDrive(), breathing(0.6, 1000, 4), 12)
  const at = (s) => frames[Math.round(s * FPS)]
  assert.ok(at(9).level < 0.15, 'breath level has mostly settled')
  assert.equal(at(9).rings.length, 1, 'ring still travelling')
  assert.ok(at(11).rings[0].strength < at(7).rings[0].strength)
})

// Real breaths make estimator responses of roughly 0.15-0.45 (see the end to
// end tests below), so the strength tests use values in that range.
const ringPeak = (signalAt, seconds = 8) =>
  Math.max(...run(createBreathDrive(), signalAt, seconds).flatMap((f) => f.rings.map((r) => r.strength)))

test('stronger breaths make stronger rings', () => {
  assert.ok(ringPeak(breathing(0.3, 1000, 4)) > ringPeak(breathing(0.12, 1000, 4)) * 1.5)
})

test('low confidence makes weaker rings', () => {
  assert.ok(ringPeak(breathing(0.3, 1000, 4, 0.1)) < ringPeak(breathing(0.3, 1000, 4, 1)) * 0.7)
})

test('very strong breaths are capped, never a splash', () => {
  const strong = ringPeak(breathing(0.5, 1000, 4))
  const extreme = ringPeak(breathing(1, 1000, 4))
  assert.ok(extreme <= DRIVE_DEFAULTS.ringMax)
  assert.ok(extreme < strong * 1.25, `doubling the breath took the ring from ${strong} to ${extreme}`)
})

test('slow breathing makes one ring per breath', () => {
  const frames = run(createBreathDrive(), breathing(0.6, 10), 60)
  assert.equal(births(frames), 6)
  assert.ok(Math.max(...frames.map((f) => f.rings.length)) >= 2, 'successive rings overlap')
})

for (const perMinute of [20, 30, 45]) {
  test(`rapid breathing (${perMinute}/min) makes one ring per breath, never more than ${MAX_RIPPLES} at once`, () => {
    const cycle = 60 / perMinute
    const breaths = Math.round(30 / cycle)
    // Ends 1 s after the last breath begins, so its ring has had time to start.
    const frames = run(createBreathDrive(), breathing(0.6, cycle, cycle * 0.45), (breaths - 1) * cycle + 1)
    assert.equal(births(frames), breaths)
    assert.ok(frames.every((f) => f.rings.length <= MAX_RIPPLES))
    assert.ok(frames.slice(10 * FPS).every((f) => f.rings.length >= 2), 'rings overlap continuously')
  })
}

test('rapid breathing does not speed up the rings themselves', () => {
  const growth = (frames) => {
    const r = frames.map((f) => f.raw[0])
    return r[Math.round(1.5 * FPS)] - r[Math.round(0.5 * FPS)]
  }
  const slow = run(createBreathDrive(), breathing(0.6, 10), 2)
  const fast = run(createBreathDrive(), breathing(0.6, 1.5, 0.6), 2)
  assert.ok(Math.abs(growth(slow) - growth(fast)) < 1e-6)
})

test('distinct breaths are separated only by a genuine lull', () => {
  // Two sounds 0.15 s apart (a flicker) vs 0.4 s apart (a real pause).
  const twoSounds = (gap) => (t) => (t < 1 || (t >= 1 + gap && t < 2 + gap) ? { status: 'breath', response: 0.6, confidence: 1 } : quiet())
  assert.equal(births(run(createBreathDrive(), twoSounds(0.15), 15)), 1)
  assert.equal(births(run(createBreathDrive(), twoSounds(0.4), 15)), 2)
})

test('a long continuous sound makes only one ring', () => {
  assert.equal(births(run(createBreathDrive(), constant(0.7), 30)), 1)
})

test('brief noisy fluctuations within a breath do not add rings', () => {
  // Response wobbles and the status drops out for a frame or two at a time.
  const noisy = (t) => ({
    status: Math.sin(t * 23) > 0.97 ? 'listening' : 'breath',
    response: 0.5 + 0.25 * Math.sin(t * 9),
    confidence: 0.6 + 0.3 * Math.sin(t * 5),
  })
  assert.equal(births(run(createBreathDrive(), noisy, 20)), 1)
})

test('a faint breath makes only a faint ring', () => {
  assert.ok(ringPeak(breathing(0.08, 1000, 4)) < ringPeak(breathing(0.35, 1000, 4)) / 3)
})

test('when all slots are busy, the oldest ring fades out instead of vanishing', () => {
  const frames = run(createBreathDrive(), breathing(0.8, 1.2, 0.5), 30)
  let endings = 0
  for (let i = 1; i < frames.length; i++)
    for (let k = 0; k < MAX_RIPPLES; k++) {
      const [prevRadius, prevStrength] = [frames[i - 1].raw[k * 2], frames[i - 1].raw[k * 2 + 1]]
      const radius = frames[i].raw[k * 2]
      // A ring ends when its slot empties or restarts with a new ring.
      if (prevRadius > 0 && (radius === 0 || radius < prevRadius)) {
        endings++
        assert.ok(prevStrength < 0.02, `a ring of strength ${prevStrength} was cut off`)
      }
    }
  assert.ok(frames.some((f) => f.rings.length === MAX_RIPPLES))
  assert.ok(endings > 10, `slots were recycled during the run (${endings})`)
})

test('ring strength and breath level change smoothly, without jumps', () => {
  const frames = run(createBreathDrive(), breathing(1, 2, 0.9), 40)
  let maxLevelStep = 0
  let maxRingStep = 0
  for (let i = 1; i < frames.length; i++) {
    maxLevelStep = Math.max(maxLevelStep, Math.abs(frames[i].level - frames[i - 1].level))
    for (let k = 0; k < MAX_RIPPLES; k++) maxRingStep = Math.max(maxRingStep, Math.abs(frames[i].raw[k * 2 + 1] - frames[i - 1].raw[k * 2 + 1]))
  }
  assert.ok(maxLevelStep < 0.03, `level step ${maxLevelStep}`)
  assert.ok(maxRingStep < 0.02, `ring step ${maxRingStep}`)
})

test('frame rate does not change the result', () => {
  const at30 = run(createBreathDrive(), breathing(0.7), 6, 30).at(-1)
  const at144 = run(createBreathDrive(), breathing(0.7), 6, 144).at(-1)
  assert.ok(Math.abs(at30.level - at144.level) < 2e-3)
  assert.ok(Math.abs(at30.rings[0].radius - at144.rings[0].radius) < 0.02)
})

test('tolerates missing or invalid signals', () => {
  const drive = createBreathDrive()
  for (const s of [null, undefined, {}, { status: 'breath', response: NaN, confidence: Infinity }, { response: 5, confidence: -2 }]) {
    const { level, ripples } = drive.step(s, 1 / 60)
    assert.ok(Number.isFinite(level) && level >= 0 && level <= 1)
    assert.ok(Array.from(ripples).every(Number.isFinite))
  }
})

// One breath sound through the real estimator: calibrate 5 s, then a breath
// of `seconds` peaking `snrDb` above the room. Returns the peak ring strength.
function micBreathRing(snrDb, seconds) {
  const est = createBreathEstimator()
  const drive = createBreathDrive()
  const dt = 1 / 30
  let peak = 0
  for (let i = 0; i < 20 / dt; i++) {
    const c = i * dt - 5
    const levelDb = -60 + (c > 0 && c < seconds ? snrDb * Math.sin((Math.PI * c) / seconds) : 0) + Math.sin(i * 7.3) * 0.8
    const { ripples } = drive.step(est.update({ levelDb, flatness: 0.35 }, dt), dt)
    for (let k = 0; k < MAX_RIPPLES; k++) peak = Math.max(peak, ripples[k * 2 + 1])
  }
  return peak
}

test('end to end: an ordinary microphone breath makes a clearly visible ring', () => {
  // ~12 dB above the room is what a real breath near a laptop mic measured.
  // The test panel's default breath peaks at about the same strength.
  const panelDefault = ringPeak(breathing(0.3, 1000, 4), 15)
  assert.ok(micBreathRing(11.7, 1.5) > panelDefault * 0.6, 'short breath')
  assert.ok(micBreathRing(11.7, 3) > panelDefault * 0.9, 'long breath')
  assert.ok(micBreathRing(8, 2) < micBreathRing(16, 2), 'quieter breath, weaker ring')
})

test('end to end with the real estimator: fast breaths each make a ring', () => {
  // 30 breaths/min: 0.8 s of breath sound then 1.2 s quiet, after calibration.
  const est = createBreathEstimator()
  const drive = createBreathDrive()
  const dt = 1 / 30
  let onsets = 0
  let wasBreath = false
  const frames = []
  for (let i = 0; i < 40 / dt; i++) {
    const t = i * dt
    const c = t - 6
    const loud = t > 6 && c % 2 < 0.8
    const levelDb = -60 + (loud ? 16 * Math.sin((Math.PI * (c % 2)) / 0.8) : 0) + Math.sin(i * 7.3) * 0.8
    const s = est.update({ levelDb, flatness: 0.35 }, dt)
    if (s.status === 'breath' && !wasBreath) onsets++
    wasBreath = s.status === 'breath'
    const { ripples } = drive.step(s, dt)
    frames.push({ raw: Array.from(ripples), rings: [] })
  }
  assert.equal(onsets, 17)
  assert.equal(births(frames), 17)
})

// Seeded generator, so origin tests are repeatable.
function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Spot of each ring at its birth, in order, over `seconds` of a signal.
function birthSpots(drive, signalAt, seconds) {
  const spots = []
  let before = new Array(MAX_RIPPLES).fill(0)
  for (let i = 0; i < seconds * FPS; i++) {
    const out = drive.step(signalAt(i / FPS), 1 / FPS)
    for (let k = 0; k < MAX_RIPPLES; k++) {
      const radius = out.ripples[k * 2]
      if (radius > 0 && (before[k] === 0 || radius < before[k])) spots.push([out.spots[k * 2], out.spots[k * 2 + 1]])
      before[k] = radius
    }
  }
  return spots
}

test('each breath starts its ring at a new spot, well away from the previous one', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const spots = birthSpots(createBreathDrive({}, seeded(seed)), breathing(0.35, 3), 60)
    assert.equal(spots.length, 20)
    for (const [a, b] of spots) assert.ok(a >= 0 && a < 1 && b >= 0 && b < 1)
    for (let i = 1; i < spots.length; i++) {
      const d = Math.hypot(spots[i][0] - spots[i - 1][0], spots[i][1] - spots[i - 1][1])
      assert.ok(d > 0.15, `seed ${seed}, breath ${i}: moved only ${d.toFixed(3)}`)
    }
  }
})

test('rings on the water at the same time start at separate spots', () => {
  const drive = createBreathDrive({}, seeded(7))
  const signal = breathing(0.35, 1.5) // fast breathing keeps all four slots busy
  let out
  for (let i = 0; i < 6 * FPS; i++) out = drive.step(signal(i / FPS), 1 / FPS)
  const live = []
  for (let k = 0; k < MAX_RIPPLES; k++) if (out.ripples[k * 2 + 1] > 0) live.push([out.spots[k * 2], out.spots[k * 2 + 1]])
  assert.ok(live.length >= 3)
  for (let i = 0; i < live.length; i++)
    for (let j = i + 1; j < live.length; j++) assert.ok(Math.hypot(live[i][0] - live[j][0], live[i][1] - live[j][1]) > 0.1)
})

test('a ring keeps its spot for its whole life, and empty slots report the centre', () => {
  const drive = createBreathDrive({}, seeded(3))
  const signal = (t) => (t < 1 ? { status: 'breath', response: 0.3, confidence: 1 } : quiet())
  let first = null
  for (let i = 0; i < 20 * FPS; i++) {
    const out = drive.step(signal(i / FPS), 1 / FPS)
    if (out.ripples[1] > 0) {
      first ??= [out.spots[0], out.spots[1]]
      assert.deepEqual([out.spots[0], out.spots[1]], first)
    }
    for (let k = 1; k < MAX_RIPPLES; k++) assert.deepEqual([out.spots[k * 2], out.spots[k * 2 + 1]], CENTRE_SPOT)
  }
  assert.ok(first)
})

test('without an injected generator, spots still vary between breaths', () => {
  const spots = birthSpots(createBreathDrive(), breathing(0.35, 3), 30)
  assert.equal(new Set(spots.map((s) => s.join())).size, spots.length)
})

test('a fixed spot puts every ring at the same place, and the website default still varies', () => {
  const fixed = birthSpots(createBreathDrive({ fixedSpot: [0.5, 0.5] }, seeded(5)), breathing(0.35, 3), 30)
  assert.equal(fixed.length, 10)
  for (const spot of fixed) assert.deepEqual(spot, [0.5, 0.5])
  const varied = birthSpots(createBreathDrive({}, seeded(5)), breathing(0.35, 3), 30)
  assert.equal(new Set(varied.map((s) => s.join())).size, varied.length)
  assert.equal(DRIVE_DEFAULTS.fixedSpot, null)
})
