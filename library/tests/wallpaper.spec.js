// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { limitFrameRate, parsePointerMessage } from '../core/wallpaper.js'
import { runScene } from '../core/runner.js'

describe('parsePointerMessage', () => {
  it('parses move, down and up, scaling physical to CSS pixels', () => {
    expect(parsePointerMessage('pointer move 300 150', 1.5)).toEqual({ type: 'move', x: 200, y: 100 })
    expect(parsePointerMessage('pointer down -10 20')).toEqual({ type: 'down', x: -10, y: 20 })
    expect(parsePointerMessage('pointer up 0 0')).toEqual({ type: 'up', x: 0, y: 0 })
  })
  it('ignores anything else', () => {
    for (const bad of ['', 'goodbye 1 2', 'pointer drag 1 2', 'pointer move 1', 'pointer move a b']) {
      expect(parsePointerMessage(bad)).toBeNull()
    }
  })
})

// A fake animation-frame source that ticks every 16.7 ms (60 Hz).
function fakeTarget() {
  let queue = []
  let id = 0
  return {
    requestAnimationFrame: (cb) => { queue.push([++id, cb]); return id },
    cancelAnimationFrame: (n) => { queue = queue.filter(([i]) => i !== n) },
    run(frames) {
      let t = 0
      for (let i = 0; i < frames; i++) {
        t += 1000 / 60
        const due = queue
        queue = []
        due.forEach(([, cb]) => cb(t))
      }
    },
  }
}

describe('limitFrameRate', () => {
  it('runs a 60 Hz callback loop at about 30 fps', () => {
    const t = fakeTarget()
    limitFrameRate(t, 30)
    let calls = 0
    const loop = () => { calls++; t.requestAnimationFrame(loop) }
    t.requestAnimationFrame(loop)
    t.run(600) // 10 s at 60 Hz
    expect(calls).toBeGreaterThan(290)
    expect(calls).toBeLessThanOrEqual(305)
  })
  it('supports cancel and can be undone', () => {
    const t = fakeTarget()
    const raf = t.requestAnimationFrame
    const undo = limitFrameRate(t, 30)
    const cb = vi.fn()
    const id = t.requestAnimationFrame(cb)
    t.cancelAnimationFrame(id)
    t.run(10)
    expect(cb).not.toHaveBeenCalled()
    undo()
    expect(t.requestAnimationFrame).toBe(raf)
  })
})

describe('runScene in wallpaper mode', () => {
  const registry = (mount) => ({ 'rainy-window': { meta: {}, load: async () => ({ mount }) } })

  it('never says leaving or exit on input, and forwards desktop pointer input to the scene', async () => {
    vi.useFakeTimers()
    let listener
    window.chrome = { webview: { addEventListener: (_, fn) => { listener = fn }, removeEventListener() {}, postMessage() {} } }
    const host = vi.fn()
    const seen = []
    const run = await runScene(document.createElement('div'), {
      search: '?mode=wallpaper',
      host,
      registry: registry((container, ctx) => {
        expect(ctx.mode).toBe('wallpaper')
        ctx.onPointer((e) => seen.push(e))
        return { unmount() {} }
      }),
    })
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }))
    window.dispatchEvent(new MouseEvent('mousedown', { button: 0 }))
    listener({ data: 'pointer down 20 30' })
    listener({ data: 'pointer move 25 35' })
    listener({ data: 'goodbye 1 2' }) // a screensaver message: ignored here
    vi.advanceTimersByTime(5000)
    expect(seen.map((e) => e.type)).toEqual(['down', 'move'])
    expect(host.mock.calls.map((c) => c[0])).toEqual(['status: rainy-window running'])
    run.stop()
    delete window.chrome
    vi.useRealTimers()
  })
})