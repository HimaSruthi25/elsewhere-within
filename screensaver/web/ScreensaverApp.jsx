import { useCallback, useEffect, useRef } from 'react'
import LakeBackground from '../../src/components/LakeBackground.jsx'
import { CENTRE_SPOT } from '../../src/water/breathDrive.js'
import { createDecorativeSignal } from './decorativeRipples.js'
import { notifyHost } from './host.js'
import '../../src/App.css'

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Every ring spreads from one fixed point: the centre of the visible lake,
// the spot where the x10 RING_STRENGTH was confirmed (strength factor 1).
const DRIVE_OPTIONS = { fixedSpot: CENTRE_SPOT }

// The website's lake and title, with decorative ripples from one fixed point
// in place of the microphone, and no controls. No microphone or audio code is imported.
function ScreensaverApp() {
  const motionOn = !prefersReducedMotion()
  const signalAt = useRef(null)
  const startedAt = useRef(0)

  const getWaterSignal = useCallback(() => {
    if (!signalAt.current) {
      signalAt.current = createDecorativeSignal()
      startedAt.current = performance.now()
    }
    return signalAt.current((performance.now() - startedAt.current) / 1000)
  }, [])

  // Tells the host whether the water is animating, for its log.
  useEffect(() => {
    const id = setTimeout(() => {
      const water = document.querySelector('canvas.lake__water--ready')
        ? 'water animating'
        : motionOn
          ? 'still photo (WebGL unavailable)'
          : 'still photo (Windows animation effects are off)'
      notifyHost(`status: ${water}`)
    }, 5000)
    return () => clearTimeout(id)
  }, [motionOn])

  return (
    <main className="scene">
      <LakeBackground motionOn={motionOn} getWaterSignal={getWaterSignal} driveOptions={DRIVE_OPTIONS} />
      <header className="title-block">
        <h1 className="title">Elsewhere, Within</h1>
        <p className="tagline">A little closer to the natural world</p>
      </header>
    </main>
  )
}

export default ScreensaverApp
