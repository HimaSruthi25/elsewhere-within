// Turns the breathing signal ({ status, response, confidence }) into the
// values the water shader uses: a smoothed breath level and a few expanding
// ripples. Pure and frame-rate independent so it can be tested.

export const MAX_RIPPLES = 4

export const DRIVE_DEFAULTS = {
  riseSeconds: 0.7, // breath level builds while breath is heard...
  settleSeconds: 2.5, // ...and calms over ~7 s afterwards
  minConfidenceWeight: 0.4, // a low-confidence response still counts a little

  // A ripple starts at the onset of each breath the detector reports
  // (status becomes 'breath'), but only after a genuine lull, so one long
  // breath, or a flicker within it, makes one ripple.
  minLullSeconds: 0.25, // quiet needed between breaths
  minRippleInterval: 0.6, // floor between ripples, even for very fast breathing
  growSeconds: 2.5, // a young ripple keeps strengthening while its breath lasts
  // Ring strength comes from the breath's own peak (response x confidence
  // weight), not the smoothed level, which lags too far behind a 1-2 s
  // breath. Real breaths near the microphone peak around 0.2-0.4; a clear,
  // confident breath at ringReference or above gives a full ring of ringMax.
  ringReference: 0.35,
  ringMax: 0.55,
  retireSeconds: 0.8, // when all slots are busy, the faintest ring fades this fast to make room

  // Ripple motion on the water plane (see shaders.js for the units).
  rippleStartRadius: 0.15,
  rippleSpeed: 0.28, // slow, calm expansion, whatever the breathing rate
  rippleFadeIn: 1.2, // seconds
  rippleFadeOut: 6.5, // time constant of the natural decay
  rippleMaxAge: 22, // fully faded and recycled by then

  // Each ring starts at its own spot: [across, down] fractions of the visible
  // water (lakeGeometry.rippleOriginAt maps them onto the lake). Of a few
  // random candidates, the one farthest from the rings already on the water
  // and from the previous ring's spot is used, so successive breaths move round.
  spotCandidates: 6,
  fixedSpot: null, // [across, down]: every ring starts here instead (the screensaver uses this)
}

// Default spot for code that has no ring yet (the centre of the band).
export const CENTRE_SPOT = [0.5, 0.5]

const clamp01 = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0)
const smoothstep = (a, b, x) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

// random: () => [0, 1), injectable for tests.
export function createBreathDrive(overrides = {}, random = Math.random) {
  const o = { ...DRIVE_DEFAULTS, ...overrides }
  let level = 0
  let target = 0
  let wasBreathing = false
  let lullSeconds = Infinity
  let sinceRipple = Infinity
  let pending = false // a ripple waiting for a slot to finish fading
  let ringsStarted = 0 // running count of breath onsets that requested a ring
  // Fixed slots ({ age, amplitude, fade } or null), so a ring keeps its slot for life.
  const ripples = new Array(MAX_RIPPLES).fill(null)
  // [radius, strength] pairs for the shader, reused every frame.
  const packed = new Float32Array(MAX_RIPPLES * 2)
  // [across, down] spot of each slot's ring, reused every frame.
  const spots = new Float32Array(MAX_RIPPLES * 2)
  let lastSpot = null

  const strengthOf = ({ age, amplitude, fade }) =>
    amplitude *
    fade *
    smoothstep(0, o.rippleFadeIn, age) *
    Math.exp(-age / o.rippleFadeOut) *
    (1 - smoothstep(o.rippleMaxAge * 0.7, o.rippleMaxAge, age))

  const amplitudeFor = (peak) => o.ringMax * clamp01(peak / o.ringReference)
  function chooseSpot() {
    if (o.fixedSpot) return [...o.fixedSpot]
    const avoid = ripples.filter(Boolean).map((r) => r.spot)
    if (lastSpot) avoid.push(lastSpot)
    let best = null
    let bestDistance = -1
    for (let i = 0; i < o.spotCandidates; i++) {
      const spot = [random(), random()]
      const distance = Math.min(Infinity, ...avoid.map(([a, b]) => Math.hypot(spot[0] - a, spot[1] - b)))
      if (distance > bestDistance) {
        best = spot
        bestDistance = distance
      }
    }
    lastSpot = best
    return best
  }

  const place = (slot) => {
    ripples[slot] = { age: 0, peak: target, amplitude: amplitudeFor(target), fade: 1, retiring: false, spot: chooseSpot() }
  }

  function requestRipple() {
    sinceRipple = 0
    ringsStarted++
    const slot = ripples.indexOf(null)
    if (slot !== -1) {
      place(slot)
      return
    }
    // All slots busy: fade out the faintest ring rather than cutting it off;
    // the new ring takes its slot once it has gone.
    pending = true
    if (ripples.some((r) => r.retiring)) return
    let faintest = 0
    for (let i = 1; i < MAX_RIPPLES; i++) if (strengthOf(ripples[i]) < strengthOf(ripples[faintest])) faintest = i
    ripples[faintest].retiring = true
  }

  return {
    // dt in seconds. Returns { level: 0..1, ripples: Float32Array of
    // [radius, strength] pairs, MAX_RIPPLES long; unused slots are 0,
    // spots: Float32Array of each slot's [across, down] spot,
    // ringsStarted: running count of ring events }.
    step(signal, dtSeconds) {
      const dt = Math.min(Math.max(dtSeconds, 0), 0.1)
      const weight = o.minConfidenceWeight + (1 - o.minConfidenceWeight) * clamp01(signal?.confidence)
      target = clamp01(signal?.response) * weight
      const tau = target > level ? o.riseSeconds : o.settleSeconds
      level += (target - level) * (1 - Math.exp(-dt / tau))
      sinceRipple += dt

      const breathing = signal?.status === 'breath'
      if (breathing) {
        if (!wasBreathing && lullSeconds >= o.minLullSeconds && sinceRipple >= o.minRippleInterval) requestRipple()
        lullSeconds = 0
      } else {
        lullSeconds += dt
      }
      wasBreathing = breathing

      packed.fill(0)
      ripples.forEach((r, i) => {
        if (!r) return
        r.age += dt
        if (r.retiring) r.fade -= dt / o.retireSeconds
        if (r.age >= o.rippleMaxAge || r.fade <= 0) {
          ripples[i] = null
          return
        }
        if (r.age < o.growSeconds && target > r.peak) {
          r.peak = target
          r.amplitude = amplitudeFor(target)
        }
        packed[i * 2] = o.rippleStartRadius + o.rippleSpeed * r.age
        packed[i * 2 + 1] = strengthOf(r)
      })
      if (pending) {
        const slot = ripples.indexOf(null)
        if (slot !== -1) {
          place(slot)
          pending = false
        }
      }
      ripples.forEach((r, i) => {
        const [a, b] = r ? r.spot : CENTRE_SPOT
        spots[i * 2] = a
        spots[i * 2 + 1] = b
      })
      return { level, ripples: packed, spots, ringsStarted }
    },
  }
}
