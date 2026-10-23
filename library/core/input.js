// Same rules as screensaver/web/host.js: any key, click, wheel or touch ends
// the screensaver, and so does a mouse move of more than 8 px (tiny sensor
// jitter is ignored, as Windows does).
export const MOVE_THRESHOLD_PX = 8

export function movedFarEnough(origin, point, threshold = MOVE_THRESHOLD_PX) {
  return Math.hypot(point.x - origin.x, point.y - origin.y) > threshold
}

// Calls onInput(reason, event) for each qualifying input. Returns a stop function.
export function watchInput(onInput, target = window) {
  let origin = null
  const on = (type, handler) => target.addEventListener(type, handler, true)
  const off = (type, handler) => target.removeEventListener(type, handler, true)
  const handlers = {
    keydown: (e) => onInput(`key ${e.code || e.key}`, e),
    mousedown: (e) => onInput(`mouse button ${e.button}`, e),
    wheel: (e) => onInput('wheel', e),
    touchstart: (e) => onInput('touch', e),
    mousemove: (e) => {
      const point = { x: e.screenX, y: e.screenY }
      if (!origin) {
        origin = point
        return
      }
      if (movedFarEnough(origin, point)) onInput('mouse moved', e)
    },
  }
  Object.entries(handlers).forEach(([type, fn]) => on(type, fn))
  return () => Object.entries(handlers).forEach(([type, fn]) => off(type, fn))
}