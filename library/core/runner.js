import { notifyHost, inHost, onHostMessage } from './host.js'
import { createClock } from './time.js'
import { watchInput } from './input.js'
import { scenes, resolveSceneId } from './registry.js'
import { showFallback } from './fallback.js'
import { createGoodbye } from './goodbye.js'

const STATUS_DELAY_MS = 5000
const REVEAL_TIMEOUT_MS = 2000

// Runs one scene in container. Returns { stop, state } (state is for tests).
export async function runScene(container, { search = window.location.search, registry = scenes, host = notifyHost } = {}) {
  const params = new URLSearchParams(search)
  const id = resolveSceneId(params.get('scene'), registry)
  const state = { id, fallback: false }

  const clock = createClock({ override: { timeOfDay: params.get('time') || undefined, season: params.get('season') || undefined } })
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || params.get('reduced') === '1'

  // Goodbye moment, started by whichever notices input first: the page or the
  // host. The host waits for "exit:" but never longer than 0.7 s.
  const goodbye = createGoodbye(container, { host, reducedMotion, inHost: inHost() })
  const pointOf = (e) => (e && 'clientX' in e ? { x: e.clientX, y: e.clientY } : null)
  const stopInput = watchInput((reason, e) => goodbye(reason, pointOf(e)))
  const stopHostMessages = onHostMessage((message) => {
    const m = /^goodbye (-?\d+) (-?\d+)$/.exec(message)
    // The host sends physical pixels; the page works in CSS pixels.
    if (m) goodbye('host saw input', { x: m[1] / devicePixelRatio, y: m[2] / devicePixelRatio })
  })

  container.style.opacity = '0'
  container.style.transition = reducedMotion ? 'none' : 'opacity 1.2s ease'
  let revealed = false
  const reveal = () => {
    if (revealed) return
    revealed = true
    container.style.opacity = '1'
  }
  const revealTimer = setTimeout(reveal, REVEAL_TIMEOUT_MS)

  let unmount
  const fail = (error) => {
    console.error('scene failed:', error)
    state.fallback = true
    try { unmount?.() } catch { /* already failing */ }
    showFallback(container)
  }

  try {
    const entry = registry[id]
    const mod = await entry.load()
    const ctx = {
      get timeOfDay() { return clock.timeOfDay },
      get season() { return clock.season },
      reducedMotion,
      subscribe: clock.subscribe,
      ready: reveal,
    }
    const result = await mod.mount(container, ctx)
    unmount = result?.unmount
  } catch (error) {
    fail(error)
    reveal()
  }

  const onError = (e) => { if (!state.fallback) { fail(e.error || e.message); reveal() } }
  window.addEventListener('error', onError)

  const statusTimer = setTimeout(() => {
    host(`status: ${state.id} ${state.fallback ? 'still fallback' : 'running'}`)
  }, STATUS_DELAY_MS)

  return {
    state,
    stop() {
      clearTimeout(revealTimer)
      clearTimeout(statusTimer)
      window.removeEventListener('error', onError)
      stopInput()
      stopHostMessages()
      clock.stop()
      try { unmount?.() } catch { /* shutting down */ }
    },
  }
}