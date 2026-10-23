// The goodbye moment: on input, a soft ring spreads from the cursor while the
// scene fades out, then the host is told it may close. The host waits at most
// 0.7 s for this, so DURATION_MS must stay well under that.
const DURATION_MS = 500
const REDUCED_MS = 250 // reduced motion: a short plain fade, no ring

export function createGoodbye(container, { host, reducedMotion, inHost }) {
  let leaving = false

  return function goodbye(reason, point) {
    if (leaving) return
    leaving = true
    host(`leaving: ${reason}`)

    const ms = reducedMotion ? REDUCED_MS : DURATION_MS
    const x = point?.x ?? window.innerWidth / 2
    const y = point?.y ?? window.innerHeight / 2
    const animations = []
    let ring = null

    if (!reducedMotion && typeof container.animate === 'function') {
      ring = document.createElement('div')
      ring.style.cssText =
        'position:fixed;width:70vmax;height:70vmax;border-radius:50%;pointer-events:none;z-index:10;' +
        'border:2px solid rgba(255,255,255,.45);box-shadow:0 0 40px rgba(255,255,255,.25);' +
        `left:${x}px;top:${y}px;transform:translate(-50%,-50%) scale(0)`
      document.body.appendChild(ring)
      animations.push(ring.animate(
        [
          { transform: 'translate(-50%,-50%) scale(0)', opacity: 0.7 },
          { transform: 'translate(-50%,-50%) scale(1)', opacity: 0 },
        ],
        { duration: ms, easing: 'cubic-bezier(.2,.6,.3,1)', fill: 'forwards' },
      ))
    }
    if (typeof container.animate === 'function') {
      animations.push(container.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms, easing: 'ease-in', fill: 'forwards' }))
    }

    setTimeout(() => {
      host(`exit: goodbye done (${reason})`)
      // In a normal browser there is no host to close the page, so put the
      // scene back after a moment; that way the goodbye can be previewed again.
      if (!inHost) {
        setTimeout(() => {
          animations.forEach((a) => a.cancel())
          ring?.remove()
          leaving = false
        }, 800)
      }
    }, ms)
  }
}
