// Live wallpaper mode (?mode=wallpaper): ElsewhereWallpaper.exe shows the scene
// behind the desktop icons. Nothing here ends the scene; the host forwards
// mouse input that lands on the bare desktop as "pointer <move|down|up> x y"
// (CSS pixels, relative to this monitor's window).

export const WALLPAPER_FPS = 30

// "pointer move 120 80" -> { type: 'move', x: 120, y: 80 }; anything else -> null.
export function parsePointerMessage(message, dpr = 1) {
  const m = /^pointer (move|down|up) (-?\d+) (-?\d+)$/.exec(message)
  if (!m) return null
  return { type: m[1], x: Number(m[2]) / dpr, y: Number(m[3]) / dpr }
}

// "freeze" -> true, "unfreeze" -> false; anything else -> null. The host sends these
// while an app is in front or covers the desktop: the page stays visible, with its
// last frame, but stops animating.
export function parseFreezeMessage(message) {
  if (message === 'freeze') return true
  if (message === 'unfreeze') return false
  return null
}

// "camera on" -> true, "camera off" -> false; anything else -> null. The host sends
// these when the tray switch "Hand control (camera)" changes (primary monitor only).
export function parseCameraMessage(message) {
  if (message === 'camera on') return true
  if (message === 'camera off') return false
  return null
}

// While frozen, requestAnimationFrame callbacks are held instead of run, so the
// frame loop (and the CPU use) stops; unfreeze runs them again. Held ids are
// negative so they never clash with real ones. Returns { freeze, unfreeze, restore }.
export function createFreezeGate(target) {
  const original = { raf: target.requestAnimationFrame, caf: target.cancelAnimationFrame }
  const realRaf = original.raf.bind(target)
  const realCaf = original.caf.bind(target)
  let frozen = false
  let nextId = -1
  const held = new Map()
  const moved = new Map() // held id -> real id, once unfrozen

  target.requestAnimationFrame = (cb) => {
    if (!frozen) return realRaf(cb)
    const id = nextId--
    held.set(id, cb)
    return id
  }
  target.cancelAnimationFrame = (id) => {
    if (held.delete(id)) return
    if (moved.has(id)) { realCaf(moved.get(id)); moved.delete(id); return }
    realCaf(id)
  }

  return {
    freeze() { frozen = true },
    unfreeze() {
      if (!frozen) return
      frozen = false
      const callbacks = [...held]
      held.clear()
      for (const [id, cb] of callbacks) {
        moved.set(id, realRaf((now) => { moved.delete(id); cb(now) }))
      }
    },
    restore() {
      frozen = false
      held.clear()
      target.requestAnimationFrame = original.raf
      target.cancelAnimationFrame = original.caf
    },
  }
}

// Caps requestAnimationFrame at fps for every scene: one real frame loop runs
// the callbacks at most fps times a second. Returns a function that undoes it.
export function limitFrameRate(target, fps = WALLPAPER_FPS) {
  const realRaf = target.requestAnimationFrame.bind(target)
  const realCaf = target.cancelAnimationFrame.bind(target)
  const original = { raf: target.requestAnimationFrame, caf: target.cancelAnimationFrame }
  const interval = 1000 / fps - 2
  let nextId = 1
  let pending = new Map()
  let loop = 0
  let last = -Infinity

  function tick(now) {
    loop = 0
    if (pending.size === 0) return
    if (now - last < interval) {
      loop = realRaf(tick)
      return
    }
    last = now
    const callbacks = pending
    pending = new Map()
    for (const cb of callbacks.values()) {
      try { cb(now) } catch (error) { setTimeout(() => { throw error }) }
    }
    if (pending.size > 0 && !loop) loop = realRaf(tick)
  }

  target.requestAnimationFrame = (cb) => {
    const id = nextId++
    pending.set(id, cb)
    if (!loop) loop = realRaf(tick)
    return id
  }
  target.cancelAnimationFrame = (id) => { pending.delete(id) }

  return () => {
    realCaf(loop)
    target.requestAnimationFrame = original.raf
    target.cancelAnimationFrame = original.caf
  }
}