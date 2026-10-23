import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createBreathEstimator } from './breathEstimator.js'

const DT = 1 / 30
const FLOOR = -60

// Deterministic jitter so "quiet" frames fluctuate like a real room.
function jitter(i) {
  const x = Math.sin(i * 12.9898) * 43758.5453
  return (x - Math.floor(x) - 0.5) * 2 // -1..1
}

function run(estimator, segments) {
  const frames = []
  let i = 0
  for (const { seconds, levelDb = FLOOR, flatness = 0.4, wobbleDb = 1 } of segments) {
    const n = Math.round(seconds / DT)
    for (let k = 0; k < n; k++, i++) {
      const level = typeof levelDb === 'function' ? levelDb(k * DT) : levelDb
      frames.push(estimator.update({ levelDb: level + jitter(i) * wobbleDb, flatness, windRatioDb: 0 }, DT))
    }
  }
  return frames
}

const quiet = (seconds) => ({ seconds })
// A breath sound: soft swell and fade over its duration, noise-like spectrum.
const breath = (seconds, peakSnr = 16) => ({
  seconds,
  levelDb: (t) => FLOOR + peakSnr * Math.sin((Math.PI * t) / seconds),
  flatness: 0.35,
})

test('stays calibrating with zero response for the calibration period', () => {
  const frames = run(createBreathEstimator(), [breath(2, 25), quiet(0.9)])
  assert.ok(frames.every((f) => f.status === 'calibrating'))
  assert.ok(frames.every((f) => f.response === 0))
})

test('a quiet room never reports a breath', () => {
  const frames = run(createBreathEstimator(), [quiet(30)])
  assert.ok(frames.every((f) => f.status !== 'breath'))
  assert.ok(Math.max(...frames.map((f) => f.response)) < 0.01)
})

test('breaths raise the response, then quiet lets it settle', () => {
  const est = createBreathEstimator()
  run(est, [quiet(6)]) // calibrate and warm up
  const during = run(est, [breath(2)])
  assert.ok(during.some((f) => f.status === 'breath'), 'breath detected')
  const peak = Math.max(...during.map((f) => f.response))
  assert.ok(peak > 0.25, `peak response ${peak.toFixed(2)}`)
  assert.ok(Math.max(...during.map((f) => f.confidence)) > 0.3)

  const after = run(est, [quiet(8)])
  assert.ok(after.at(-1).response < 0.05, `settled to ${after.at(-1).response.toFixed(3)}`)
  assert.ok(after.at(-1).status === 'listening')
})

test('stronger breaths give a stronger response', () => {
  const peakFor = (snr) => {
    const est = createBreathEstimator()
    run(est, [quiet(6)])
    return Math.max(...run(est, [breath(2, snr)]).map((f) => f.response))
  }
  assert.ok(peakFor(24) > peakFor(12))
})

test('response changes smoothly, without jumps', () => {
  const est = createBreathEstimator()
  const frames = run(est, [quiet(6), breath(2, 30), quiet(1), breath(1.5, 30), quiet(6)])
  let maxStep = 0
  for (let i = 1; i < frames.length; i++) maxStep = Math.max(maxStep, Math.abs(frames[i].response - frames[i - 1].response))
  assert.ok(maxStep < 0.05, `largest frame-to-frame change ${maxStep.toFixed(3)}`)
})

test('short clicks are not breaths', () => {
  const est = createBreathEstimator()
  run(est, [quiet(6)])
  const frames = run(est, [{ seconds: 0.1, levelDb: FLOOR + 35, flatness: 0.5 }, quiet(2)])
  assert.ok(frames.every((f) => f.status !== 'breath'))
  assert.ok(Math.max(...frames.map((f) => f.response)) < 0.01)
})

test('tonal sound such as a voice is not a breath', () => {
  const est = createBreathEstimator()
  run(est, [quiet(6)])
  // the quiet tail after the voice is noise-like, but must not count either
  const frames = run(est, [{ seconds: 2, levelDb: FLOOR + 20, flatness: 0.04 }, quiet(2)])
  assert.ok(frames.every((f) => f.status !== 'breath'))
  assert.ok(Math.max(...frames.map((f) => f.response)) < 0.01)
})

test('a fan switching on is absorbed into the noise floor', () => {
  const est = createBreathEstimator()
  run(est, [quiet(6)])
  const frames = run(est, [{ seconds: 40, levelDb: FLOOR + 12, flatness: 0.45 }])
  const breathSeconds = frames.filter((f) => f.status === 'breath').length * DT
  assert.ok(breathSeconds <= 7.1, `counted ${breathSeconds.toFixed(1)}s of the fan as breath`)
  assert.equal(frames.at(-1).status, 'listening')
  assert.ok(frames.at(-1).floorDb > FLOOR + 8)
  // and breathing is still detectable on top of the new floor
  const later = run(est, [{ ...breath(2), levelDb: (t) => FLOOR + 12 + 16 * Math.sin((Math.PI * t) / 2) }])
  assert.ok(later.some((f) => f.status === 'breath'))
})

test('a loud room reports too-noisy and keeps the response low', () => {
  const est = createBreathEstimator()
  const frames = run(est, [{ seconds: 6, levelDb: -30 }, { ...breath(2), levelDb: (t) => -30 + 16 * Math.sin((Math.PI * t) / 2) }])
  assert.equal(frames.at(-1).status, 'too-noisy')
  assert.ok(Math.max(...frames.map((f) => f.response)) < 0.2)
})

test('an unsteady calibration is retried', () => {
  const est = createBreathEstimator()
  const frames = run(est, [breath(1.5, 25), quiet(1.5), quiet(3.5)])
  assert.equal(frames[Math.round(3.2 / DT)].status, 'calibrating')
  assert.notEqual(frames.at(-1).status, 'calibrating')
  assert.ok(Math.abs(frames.at(-1).floorDb - FLOOR) < 2)
})
