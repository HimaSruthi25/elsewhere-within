// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { runScene } from '../core/runner.js'

const registry = (mount) => ({ 'rainy-window': { meta: {}, load: async () => ({ mount }) } })

describe('runScene', () => {
  it('shows the still fallback and reports it when a scene throws', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const host = vi.fn()
    const container = document.createElement('div')
    const run = await runScene(container, { search: '?scene=unknown', host, registry: registry(() => { throw new Error('boom') }) })
    expect(run.state.fallback).toBe(true)
    expect(container.textContent).toContain('Elsewhere, Within')
    vi.advanceTimersByTime(5000)
    expect(host).toHaveBeenCalledWith('status: rainy-window still fallback')
    run.stop()
    vi.useRealTimers()
  })
  it('reports running after 5 s', async () => {
    vi.useFakeTimers()
    const host = vi.fn()
    const container = document.createElement('div')
    const run = await runScene(container, { search: '', host, registry: registry(() => ({ unmount() {} })) })
    vi.advanceTimersByTime(5000)
    expect(host).toHaveBeenCalledWith('status: rainy-window running')
    run.stop()
    vi.useRealTimers()
  })
  it('on input says leaving at once, then exit after the 500 ms goodbye', async () => {
    vi.useFakeTimers()
    const host = vi.fn()
    const container = document.createElement('div')
    const run = await runScene(container, { search: '', host, registry: registry(() => ({ unmount() {} })) })
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }))
    expect(host.mock.calls.map((c) => c[0])).toEqual(['leaving: key Space'])
    vi.advanceTimersByTime(499)
    expect(host).not.toHaveBeenCalledWith(expect.stringMatching(/^exit:/))
    vi.advanceTimersByTime(1)
    expect(host).toHaveBeenLastCalledWith('exit: goodbye done (key Space)')
    run.stop()
    vi.useRealTimers()
  })
  it('a host "goodbye x y" after input still gives only one goodbye', async () => {
    vi.useFakeTimers()
    let listener
    window.chrome = { webview: { addEventListener: (_, fn) => { listener = fn }, removeEventListener() {}, postMessage() {} } }
    const host = vi.fn()
    const container = document.createElement('div')
    const run = await runScene(container, { search: '', host, registry: registry(() => ({ unmount() {} })) })
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }))
    listener({ data: 'goodbye 100 200' })
    vi.advanceTimersByTime(1000)
    expect(host.mock.calls.map((c) => c[0])).toEqual(['leaving: key Space', 'exit: goodbye done (key Space)'])
    run.stop()
    delete window.chrome
    vi.useRealTimers()
  })
  it('a host "goodbye x y" alone starts one goodbye', async () => {
    vi.useFakeTimers()
    let listener
    window.chrome = { webview: { addEventListener: (_, fn) => { listener = fn }, removeEventListener() {}, postMessage() {} } }
    const host = vi.fn()
    const container = document.createElement('div')
    const run = await runScene(container, { search: '', host, registry: registry(() => ({ unmount() {} })) })
    listener({ data: 'goodbye 100 200' })
    listener({ data: 'goodbye 100 200' })
    vi.advanceTimersByTime(1000)
    expect(host.mock.calls.map((c) => c[0])).toEqual(['leaving: host saw input', 'exit: goodbye done (host saw input)'])
    run.stop()
    delete window.chrome
    vi.useRealTimers()
  })
})