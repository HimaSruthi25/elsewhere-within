// Messages to the C# screensaver host (WebView2). Outside the host, for
// example when this page is opened in a normal browser, they are ignored.

export function notifyHost(message) {
  window.chrome?.webview?.postMessage(message)
}

// Ends the screensaver on keyboard, click, wheel, touch, or a mouse movement
// of more than a few pixels (tiny sensor jitter is ignored, as Windows does).
const MOVE_THRESHOLD_PX = 8

export function exitOnInput() {
  let origin = null
  const exit = (reason) => () => notifyHost(`exit: ${reason}`)
  window.addEventListener('keydown', (e) => notifyHost(`exit: key ${e.code || e.key}`), true)
  window.addEventListener('mousedown', (e) => notifyHost(`exit: mouse button ${e.button}`), true)
  window.addEventListener('wheel', exit('wheel'), true)
  window.addEventListener('touchstart', exit('touch'), true)
  window.addEventListener(
    'mousemove',
    (e) => {
      if (!origin) {
        origin = { x: e.screenX, y: e.screenY }
        return
      }
      if (Math.hypot(e.screenX - origin.x, e.screenY - origin.y) > MOVE_THRESHOLD_PX) notifyHost('exit: mouse moved')
    },
    true,
  )
}
