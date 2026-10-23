import { describe, expect, it, vi } from 'vitest'
import { createClock, getSeason, getTimeOfDay } from '../core/time.js'

const at = (month, day, hour = 12, minute = 0) => new Date(2026, month - 1, day, hour, minute)

describe('getTimeOfDay', () => {
  it.each([
    [4, 59, 'night'], [5, 0, 'dawn'], [7, 59, 'dawn'], [8, 0, 'day'],
    [16, 59, 'day'], [17, 0, 'dusk'], [19, 59, 'dusk'], [20, 0, 'night'], [0, 0, 'night'],
  ])('%i:%i is %s', (h, m, expected) => {
    expect(getTimeOfDay(at(6, 1, h, m))).toBe(expected)
  })
})

describe('getSeason', () => {
  it.each([[12, 'winter'], [1, 'winter'], [2, 'winter'], [3, 'spring'], [5, 'spring'], [6, 'summer'], [8, 'summer'], [9, 'autumn'], [11, 'autumn']])(
    'month %i is %s', (month, expected) => {
      expect(getSeason(at(month, 15))).toBe(expected)
    })
  it('flips for the southern hemisphere', () => {
    expect(getSeason(at(12, 15), true)).toBe('summer')
    expect(getSeason(at(7, 15), true)).toBe('winter')
  })
})

describe('createClock', () => {
  it('updates live and notifies subscribers', () => {
    vi.useFakeTimers()
    let now = at(6, 1, 7, 59)
    const clock = createClock({ now: () => now })
    const seen = []
    clock.subscribe((c) => seen.push(c.timeOfDay))
    expect(clock.timeOfDay).toBe('dawn')
    now = at(6, 1, 8, 1)
    vi.advanceTimersByTime(30_000)
    expect(clock.timeOfDay).toBe('day')
    expect(seen).toEqual(['day'])
    clock.stop()
    vi.useRealTimers()
  })
  it('honours an override', () => {
    const clock = createClock({ override: { timeOfDay: 'dusk', season: 'autumn' } })
    expect([clock.timeOfDay, clock.season]).toEqual(['dusk', 'autumn'])
    clock.stop()
  })
})