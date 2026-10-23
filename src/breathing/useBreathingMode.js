import { useCallback, useEffect, useRef, useState } from 'react'
import { BREATH_DEFAULTS } from './breathEstimator.js'
import { IDLE_SIGNAL, createMicrophoneBreath, isBreathingSupported } from './microphoneBreath.js'

const ACTIVE_STATUSES = new Set(['requesting', 'calibrating', 'listening', 'breath', 'too-noisy'])

/**
 * Breathing mode lifecycle. The microphone is only requested from start(),
 * which must be called from a user action, and is released by stop() or
 * on unmount.
 *
 * readSignal() is the interface for the water renderer. Call it once per
 * animation frame; it is cheap and never triggers a React render:
 *   { active, status, response: 0..1, confidence: 0..1 }
 * response: smoothed breath strength (rises while breath is heard, settles
 *   over ~6 s in quiet). confidence: how sure the estimator is that the
 *   current sound is breath. A renderer would typically scale its breathing
 *   disturbance by response, weighted by confidence.
 */
export function useBreathingMode() {
  const [supported] = useState(isBreathingSupported)
  const [status, setStatus] = useState('idle')
  const controllerRef = useRef(null)
  // After stop the last response decays instead of snapping to zero, so the
  // water settles naturally even though analysis has already ended.
  const releasedRef = useRef({ response: 0, confidence: 0, at: 0 })

  const stop = useCallback(() => {
    const controller = controllerRef.current
    if (!controller) return
    const last = controller.read()
    releasedRef.current = { response: last.response, confidence: last.confidence, at: performance.now() }
    controllerRef.current = null
    controller.stop()
    setStatus('idle')
  }, [])

  const start = useCallback(async () => {
    if (!supported || controllerRef.current) return
    const controller = createMicrophoneBreath({
      onStatus: (next) => {
        if (controllerRef.current === controller) setStatus(next)
      },
    })
    controllerRef.current = controller
    const ok = await controller.start()
    if (!ok && controllerRef.current === controller) controllerRef.current = null
  }, [supported])

  useEffect(() => stop, [stop])

  const readSignal = useCallback(() => {
    const controller = controllerRef.current
    if (controller) {
      const s = controller.read()
      return { active: true, status: s.status, response: s.response, confidence: s.confidence }
    }
    const { response, confidence, at } = releasedRef.current
    const decay = Math.exp(-(performance.now() - at) / 1000 / BREATH_DEFAULTS.settleSeconds)
    return { ...IDLE_SIGNAL, active: false, response: response * decay, confidence: confidence * decay }
  }, [])

  // Full estimator snapshot for the calibration panel; null when off or
  // while still waiting for permission (no audio analysed yet).
  const readDetails = useCallback(() => {
    const s = controllerRef.current?.read()
    return s && 'floorDb' in s ? s : null
  }, [])

  return {
    supported,
    status,
    on: ACTIVE_STATUSES.has(status),
    start,
    stop,
    readSignal,
    readDetails,
  }
}
