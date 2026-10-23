// Time of day and season, from the PC clock.

// Hours are local. dawn 05-08, day 08-17, dusk 17-20, night 20-05.
export function getTimeOfDay(date = new Date()) {
  const h = date.getHours()
  if (h >= 5 && h < 8) return 'dawn'
  if (h >= 8 && h < 17) return 'day'
  if (h >= 17 && h < 20) return 'dusk'
  return 'night'
}

// Meteorological seasons for the northern hemisphere; pass southern = true to flip.
export function getSeason(date = new Date(), southern = false) {
  const m = date.getMonth() // 0 = January
  const north = m >= 2 && m <= 4 ? 'spring' : m >= 5 && m <= 7 ? 'summer' : m >= 8 && m <= 10 ? 'autumn' : 'winter'
  if (!southern) return north
  return { spring: 'autumn', summer: 'winter', autumn: 'spring', winter: 'summer' }[north]
}

export const TIMES_OF_DAY = ['dawn', 'day', 'dusk', 'night']
export const SEASONS = ['spring', 'summer', 'autumn', 'winter']

// The context every scene receives. timeOfDay and season are live getters;
// subscribe(fn) is called with the ctx whenever either changes.
export function createClock({ now = () => new Date(), override = {} } = {}) {
  const listeners = new Set()
  let timeOfDay = override.timeOfDay || getTimeOfDay(now())
  let season = override.season || getSeason(now())
  const timer = setInterval(() => {
    const t = override.timeOfDay || getTimeOfDay(now())
    const s = override.season || getSeason(now())
    if (t === timeOfDay && s === season) return
    timeOfDay = t
    season = s
    listeners.forEach((fn) => fn({ timeOfDay, season }))
  }, 30_000)
  return {
    get timeOfDay() { return timeOfDay },
    get season() { return season },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
    stop() { clearInterval(timer); listeners.clear() },
  }
}