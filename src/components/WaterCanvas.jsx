import { useEffect, useRef, useState } from 'react'
import { createWaterRenderer } from '../water/createWaterRenderer.js'
import { CENTRE_SPOT, createBreathDrive } from '../water/breathDrive.js'
import { applyRingBoost, newestSlot, waterDiagnostics } from '../water/waterDiagnostics.js'
import { DEBUG_GLSL, defaultProbePoint } from '../water/shaderDebug.js'

const PROBE_INTERVAL_MS = 250

const AMBIENT_FADE_IN_SECONDS = 2.5

/**
 * Animated water drawn over the still photo. While inactive, or if WebGL is
 * unavailable, nothing is rendered and the <img> underneath shows through.
 * getSignal() is read once per frame and returns { response, confidence }.
 * driveOptions (optional, keep it a stable object) override the ring drive's
 * DRIVE_DEFAULTS; the website passes none.
 */
function WaterCanvas({ imageRef, active, getSignal, driveOptions }) {
  const canvasRef = useRef(null)
  const getSignalRef = useRef(getSignal)
  const [ready, setReady] = useState(false)
  // Bumped after a lost GPU context is restored, to start on a fresh canvas.
  const [generation, setGeneration] = useState(0)

  useEffect(() => {
    getSignalRef.current = getSignal
  }, [getSignal])

  useEffect(() => {
    const canvas = canvasRef.current
    const image = imageRef.current
    if (import.meta.env.DEV) waterDiagnostics.rendererStatus = active ? 'starting' : 'motion off (no canvas)'
    if (!active || !canvas || !image) return

    let renderer = null
    let frame = 0
    let cancelled = false
    const drive = createBreathDrive(driveOptions)

    const onContextLost = (event) => {
      event.preventDefault() // allows the browser to restore it
      cancelAnimationFrame(frame)
      // Its GPU objects died with the context; there is nothing to dispose.
      renderer = null
      setReady(false)
    }
    const onContextRestored = () => setGeneration((g) => g + 1)
    canvas.addEventListener('webglcontextlost', onContextLost)
    canvas.addEventListener('webglcontextrestored', onContextRestored)

    async function start() {
      try {
        await image.decode()
      } catch {
        // decode() rejects for images that are already broken; checked below.
      }
      if (cancelled || !image.complete || image.naturalWidth === 0) {
        if (import.meta.env.DEV && !cancelled) waterDiagnostics.rendererStatus = 'photo failed to load'
        return
      }
      renderer = createWaterRenderer(
        canvas,
        image,
        import.meta.env.DEV
          ? { debugGlsl: DEBUG_GLSL, onFail: (reason) => (waterDiagnostics.rendererStatus = `FAILED: ${reason}`) }
          : undefined,
      )
      if (!renderer) return
      if (import.meta.env.DEV) {
        waterDiagnostics.rendererStatus = 'running'
        waterDiagnostics.info = renderer.info
      }

      const startedAt = performance.now()
      let last = startedAt
      let lastProbe = 0
      const loop = (now) => {
        const dt = (now - last) / 1000
        last = now
        const elapsed = (now - startedAt) / 1000
        const signal = getSignalRef.current()
        const { level, ripples, spots, ringsStarted } = drive.step(signal, dt)
        let debug = null
        if (import.meta.env.DEV) {
          const driven = Array.from(ripples)
          // Extra dev-only boost on top of the production RING_STRENGTH; x1 = what visitors see.
          applyRingBoost(ripples, waterDiagnostics.ringBoost)
          waterDiagnostics.frame = { at: now, signal, level, ringsStarted, ripples: driven, sent: Array.from(ripples), spots: Array.from(spots) }
          waterDiagnostics.readUniforms = renderer.readUniforms
          const newest = newestSlot(ripples)
          const patternSpot = newest === -1 ? CENTRE_SPOT : [spots[newest * 2], spots[newest * 2 + 1]]
          const probe = now - lastProbe >= PROBE_INTERVAL_MS
            ? (waterDiagnostics.probePoint ?? defaultProbePoint(canvas.clientWidth, canvas.clientHeight, patternSpot))
            : null
          debug = { mode: waterDiagnostics.mode, probe, patternSpot }
        }
        const readback = renderer.render({
          time: elapsed,
          ambient: Math.min(1, elapsed / AMBIENT_FADE_IN_SECONDS),
          breath: level,
          ripples,
          spots,
          waves: signal?.waves ?? 1, // only the dev test panel sets this
          debug,
        })
        if (import.meta.env.DEV && readback) {
          lastProbe = now
          waterDiagnostics.probe = { at: now, point: debug.probe, ...readback }
        }
        frame = requestAnimationFrame(loop)
      }
      frame = requestAnimationFrame((now) => {
        loop(now)
        setReady(true)
      })
    }
    start()

    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
      canvas.removeEventListener('webglcontextlost', onContextLost)
      canvas.removeEventListener('webglcontextrestored', onContextRestored)
      renderer?.dispose()
      setReady(false)
    }
  }, [active, imageRef, generation, driveOptions])

  if (!active) return null
  return <canvas key={generation} ref={canvasRef} className={`lake__water${ready ? ' lake__water--ready' : ''}`} />
}

export default WaterCanvas
