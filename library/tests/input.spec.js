// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { MOVE_THRESHOLD_PX, movedFarEnough, watchInput } from '../core/input.js'

describe('movedFarEnough', () => {
  const o = { x: 100, y: 100 }
  it('ignores jitter up to 8 px', () => {
    expect(MOVE_THRESHOLD_PX).toBe(8)
    expect(movedFarEnough(o, { x: 100, y: 100 })).toBe(false)
    expect(movedFarEnough(o, { x: 108, y: 100 })).toBe(false)
  })
  it('counts diagonal distance, not per axis', () => {
    expect(movedFarEnough(o, { x: 106, y: 106 })).toBe(true) // 8.49 px
    expect(movedFarEnough(o, { x: 105, y: 105 })).toBe(false) // 7.07 px
  })
  it('exits above 8 px', () => {
    expect(movedFarEnough(o, { x: 109, y: 100 })).toBe(true)
  })
})

describe('watchInput', () => {
  const move = (x, y) => new MouseEvent('mousemove', { screenX: x, screenY: y })
  it('reports keys, clicks, wheel and touch', () => {
    const fn = vi.fn()
    const stop = watchInput(fn, window)
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA' }))
    window.dispatchEvent(new MouseEvent('mousedown', { button: 0 }))
    window.dispatchEvent(new Event('wheel'))
    window.dispatchEvent(new Event('touchstart'))
    expect(fn.mock.calls.map((c) => c[0])).toEqual(['key KeyA', 'mouse button 0', 'wheel', 'touch'])
    stop()
  })
  it('the first mouse move only sets the origin; small moves are ignored; big ones report', () => {
    const fn = vi.fn()
    const stop = watchInput(fn, window)
    window.dispatchEvent(move(500, 500))
    window.dispatchEvent(move(504, 503))
    expect(fn).not.toHaveBeenCalled()
    window.dispatchEvent(move(520, 500))
    expect(fn).toHaveBeenCalledWith('mouse moved', expect.anything())
    stop()
  })
  it('stops listening after stop()', () => {
    const fn = vi.fn()
    watchInput(fn, window)()
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA' }))
    expect(fn).not.toHaveBeenCalled()
  })
})