// Screensaver only: a gentle stream of decorative ripple events, shaped like
// the breathing signal the website gets from the microphone ({ status,
// response, confidence }). The site's ring drive turns each event into a
// ring (the screensaver fixes where they start), so the shader, mask,
// strength and fading are all the website's own.
// Nothing here listens to anything; it is decoration, not breath detection.

export const DECORATIVE_DEFAULTS = {
  firstDelay: [1.5, 2.5], // seconds before the first ripple
  // Seconds between ripple onsets, varied slightly so it never ticks like a
  // clock. With rings living ~20 s, three or four concentric rings are on
  // the water at a time.
  interval: [4, 6],
  duration: [0.9, 1.4], // seconds each event lasts
  peak: [0.32, 0.35], // event strength; the drive gives a full ring at 0.35
}

const between = ([a, b], random) => a + (b - a) * random()

// Returns signalAt(seconds since start). Time must not go backwards.
// random: () => [0, 1), injectable for tests.
export function createDecorativeSignal(overrides = {}, random = Math.random) {
  const o = { ...DECORATIVE_DEFAULTS, ...overrides }
  let start = between(o.firstDelay, random)
  let end = start + between(o.duration, random)
  let peak = between(o.peak, random)

  return function signalAt(t) {
    while (t >= end) {
      start += between(o.interval, random)
      end = start + between(o.duration, random)
      peak = between(o.peak, random)
    }
    if (t < start) return { status: 'listening', response: 0, confidence: 1 }
    // A soft swell and fade over the event.
    return { status: 'breath', response: peak * Math.sin((Math.PI * (t - start)) / (end - start)), confidence: 1 }
  }
}
