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