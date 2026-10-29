import { notifyHost, inHost, onHostMessage } from './host.js'
import { createClock } from './time.js'
import { watchInput } from './input.js'
import { scenes, resolveSceneId } from './registry.js'
import { showFallback } from './fallback.js'
import { createGoodbye } from './goodbye.js'
import { createFreezeGate, limitFrameRate, parseCameraMessage, parseFreezeMessage, parsePointerMessage } from './wallpaper.js'
import { createHandCamera } from './camera.js'

const STATUS_DELAY_MS = 5000
const REVEAL_TIMEOUT_MS = 2000

// Runs one scene in container. Returns { stop, state } (state is for tests).
export async function runScene(container, { search = window.location.search, registry = scenes, host = notifyHost } = {}) {
  const params = new URLSearchParams(search)
  const id = resolveSceneId(params.get('scene'), registry)
  const state = { id, fallback: false }

  const clock = createClock({ override: { timeOfDay: params.get('time') || undefined, season: params.get('season') || undefined } })
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || params.get('reduced') === '1'

  // Live wallpaper (ElsewhereWallpaper.exe): input never ends the scene. The
  // host forwards mouse input on the bare desktop as "pointer ..." messages.
  const wallpaper = params.get('mode') === 'wallpaper'
  const pointerListeners = new Set()
  const waveListeners = new Set()
  let camera = null
  let cameraFrozen = false
  let cameraWanted = false // tray switch "Hand control (camera)" (host message)
  const syncCamera = () => {
    const on = cameraWanted && waveListeners.size > 0
    if (on && !camera) { camera = createHandCamera({ emit: (e) => waveListeners.forEach((fn) => fn(e)), log: (m) => host(m) }); camera.setFrozen(cameraFrozen) }
    camera?.setEnabled(on)
  }
  let stopInput = () => {}
  let stopHostMessages = () => {}
  let unlimit = () => {}
  if (wallpaper) {
    const stopLimit = limitFrameRate(window)
    const gate = createFreezeGate(window) // outermost: held frames never reach the limiter
    unlimit = () => { gate.restore(); stopLimit() }
    stopHostMessages = onHostMessage((message) => {
      const freeze = parseFreezeMessage(message)
      if (freeze !== null) {
        if (freeze) gate.freeze()
        else gate.unfreeze()
        cameraFrozen = freeze
        camera?.setFrozen(freeze)
        return
      }
      const cam = parseCameraMessage(message)
      if (cam !== null) {
        cameraWanted = cam
        syncCamera()
        return
      }
      // The host sends physical pixels; the page works in CSS pixels.
      const e = parsePointerMessage(message, window.devicePixelRatio || 1)
      if (e) pointerListeners.forEach((fn) => fn(e))
    })
    notifyHost('ready') // the host repeats the current freeze state
  } else {
    // Goodbye moment, started by whichever notices input first: the page or the
    // host. The host waits for "exit:" but never longer than 0.7 s.
    const goodbye = createGoodbye(container, { host, reducedMotion, inHost: inHost() })
    const pointOf = (e) => (e && 'clientX' in e ? { x: e.clientX, y: e.clientY } : null)
    stopInput = watchInput((reason, e) => goodbye(reason, pointOf(e)))
    stopHostMessages = onHostMessage((message) => {
      const m = /^goodbye (-?\d+) (-?\d+)$/.exec(message)
      if (m) goodbye('host saw input', { x: m[1] / devicePixelRatio, y: m[2] / devicePixelRatio })
    })
  }

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
      mode: wallpaper ? 'wallpaper' : 'screensaver',
      // Wallpaper only: fn({ type: 'move'|'down'|'up', x, y }) for mouse input on the bare desktop. Returns an unsubscribe.
      onPointer(fn) { pointerListeners.add(fn); return () => pointerListeners.delete(fn) },
      // Wallpaper + tray switch "Hand control (camera)" only: fn({ cells: [{ x, y, vx, vy, e }] })
      // with the moving parts of the camera picture (CSS px, px/s, strength 0..1), ~15×/s.
      onWave(fn) { waveListeners.add(fn); syncCamera(); return () => { waveListeners.delete(fn); syncCamera() } },
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
      camera?.stop()
      unlimit()
      clock.stop()
      try { unmount?.() } catch { /* shutting down */ }
    },
  }
}