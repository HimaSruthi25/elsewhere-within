// Turns per-frame microphone features into a smoothed breathing response.
// Pure logic with no browser audio APIs, so it can be unit-tested in Node.
//
// A microphone hears breath *sound*, not lung volume. The estimator only
// reports how strongly a breath-like sound is present, and how confident it
// is that the sound is breath rather than background noise.

export const BREATH_DEFAULTS = {
  calibrationSeconds: 3,
  calibrationRetries: 2, // re-run calibration if the room was unsteady
  calibrationSpreadDb: 12, // p80 - p20 spread that counts as unsteady
  warmupSeconds: 2, // response strength ramps in after calibration
  tooNoisyFloorDb: -38, // RMS dBFS floor above which breath is masked
  onDb: 6, // hysteresis: enter a sound event this far above the floor...
  offDb: 3, // ...and leave it when it drops back below this
  minBreathSeconds: 0.3, // shorter events are clicks, taps, knocks
  maxBreathSeconds: 7, // longer events are fans, traffic, music
  minFlatness: 0.15, // breath is noise-like; voice and music are tonal
  intensityRangeDb: 18, // SNR span mapped onto intensity 0..1
  attackSeconds: 0.05, // level envelope
  releaseSeconds: 0.25,
  floorFallSeconds: 1.5, // noise floor follows quieter rooms quickly...
  floorRiseSeconds: 10, // ...and louder rooms slowly
  riseSeconds: 0.9, // response rises while breath is heard...
  settleSeconds: 2.2, // ...and settles over roughly 6 seconds after
  confidenceDecaySeconds: 3,
}

const SILENCE_DB = -160

const smoothing = (dt, tau) => (tau <= 0 ? 1 : 1 - Math.exp(-dt / tau))
const clamp01 = (v) => Math.min(1, Math.max(0, v))

function percentile(sorted, p) {
  if (sorted.length === 0) return SILENCE_DB
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))
  return sorted[i]
}

export function createBreathEstimator(overrides = {}) {
  const o = { ...BREATH_DEFAULTS, ...overrides }

  let calibrationLevels = []
  let calibrationElapsed = 0
  let retries = 0
  let calibrated = false

  let floorDb = SILENCE_DB
  let envelopeDb = SILENCE_DB
  let warmup = 0

  let inEvent = false
  let eventSeconds = 0
  let aboveSeconds = 0 // time the raw level, not the envelope, is above onDb
  let eventFlatness = 0
  let breathing = false
  let sustained = false
  let tooNoisy = false

  let response = 0
  let confidence = 0
  let intensity = 0
  let last = { levelDb: SILENCE_DB, flatness: 0, windRatioDb: 0 }

  function finishCalibration() {
    const sorted = [...calibrationLevels].sort((a, b) => a - b)
    const spread = percentile(sorted, 0.8) - percentile(sorted, 0.2)
    if (spread > o.calibrationSpreadDb && retries < o.calibrationRetries) {
      retries += 1
      calibrationLevels = []
      calibrationElapsed = 0
      return
    }
    floorDb = percentile(sorted, 0.5)
    envelopeDb = floorDb
    calibrated = true
  }

  function status() {
    if (!calibrated) return 'calibrating'
    if (tooNoisy) return 'too-noisy'
    return breathing ? 'breath' : 'listening'
  }

  function snapshot() {
    return {
      status: status(),
      response,
      confidence,
      intensity,
      calibrationProgress: calibrated ? 1 : clamp01(calibrationElapsed / o.calibrationSeconds),
      levelDb: last.levelDb,
      envelopeDb,
      floorDb,
      snrDb: calibrated ? envelopeDb - floorDb : 0,
      flatness: last.flatness,
      windRatioDb: last.windRatioDb,
    }
  }

  function update(features, dtSeconds) {
    const dt = Math.min(Math.max(dtSeconds, 0), 0.1)
    const levelDb = Number.isFinite(features.levelDb) ? Math.max(features.levelDb, SILENCE_DB) : SILENCE_DB
    const flatness = Number.isFinite(features.flatness) ? features.flatness : 0
    last = { levelDb, flatness, windRatioDb: features.windRatioDb ?? 0 }

    if (!calibrated) {
      calibrationLevels.push(levelDb)
      calibrationElapsed += dt
      if (calibrationElapsed >= o.calibrationSeconds) finishCalibration()
      return snapshot()
    }

    envelopeDb += (levelDb - envelopeDb) * smoothing(dt, levelDb > envelopeDb ? o.attackSeconds : o.releaseSeconds)
    const snrDb = envelopeDb - floorDb

    // Hysteresis: a sound event starts well above the floor and only ends
    // once it has clearly dropped back, so flicker near the edge is ignored.
    if (!inEvent && snrDb > o.onDb) {
      inEvent = true
      eventSeconds = 0
      aboveSeconds = 0
      eventFlatness = flatness
      sustained = false
    } else if (inEvent && snrDb < o.offDb) {
      inEvent = false
      breathing = false
      sustained = false
    }

    if (inEvent) {
      eventSeconds += dt
      // The envelope's release stretches a click into a long event, so
      // duration is judged on the raw level.
      // Flatness is also only sampled during the sound itself, so the room
      // noise in a voice's fading tail can't make it look breath-like.
      if (levelDb - floorDb > o.onDb) {
        aboveSeconds += dt
        eventFlatness += (flatness - eventFlatness) * smoothing(dt, 0.2)
      }
      if (eventSeconds > o.maxBreathSeconds) sustained = true
      breathing = !sustained && aboveSeconds >= o.minBreathSeconds && eventFlatness >= o.minFlatness
    }

    // The floor is frozen during a plausible breath so the breath itself
    // doesn't raise it; sustained noise is allowed to become the new floor.
    if (!inEvent || sustained) {
      const tau = levelDb < floorDb ? o.floorFallSeconds : o.floorRiseSeconds / (sustained ? 3 : 1)
      floorDb += (levelDb - floorDb) * smoothing(dt, tau)
    }

    tooNoisy = tooNoisy ? floorDb > o.tooNoisyFloorDb - 2 || sustained : floorDb > o.tooNoisyFloorDb || sustained

    warmup = Math.min(1, warmup + dt / o.warmupSeconds)
    intensity = breathing ? clamp01((snrDb - o.offDb) / o.intensityRangeDb) : 0
    const target = intensity * warmup * (tooNoisy ? 0.3 : 1)
    response += (target - response) * smoothing(dt, target > response ? o.riseSeconds : o.settleSeconds)

    if (breathing) {
      const snrScore = clamp01((snrDb - o.onDb) / 10)
      const flatScore = clamp01((eventFlatness - o.minFlatness) / 0.25)
      const durationScore = clamp01(eventSeconds / 1)
      const c = (0.5 * snrScore + 0.3 * flatScore + 0.2 * durationScore) * (tooNoisy ? 0.4 : 1)
      confidence += (c - confidence) * smoothing(dt, 0.3)
    } else {
      confidence -= confidence * smoothing(dt, o.confidenceDecaySeconds)
    }

    return snapshot()
  }

  return { update, read: snapshot }
}
