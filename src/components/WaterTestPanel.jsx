import { useEffect, useRef, useState } from 'react'

// A simulated breath, shaped like the microphone estimator's output: for the
// first 40% of each cycle a breath sound is heard (status 'breath') and the
// response swells; the rest of the cycle is quiet. At 6 breaths/min that is
// 4 s of breath sound and 6 s of quiet.
const SOUND_FRACTION = 0.4
const SLOW_RATE = 6 // breaths per minute, used for "Simulate one breath"
const breathAt = (phase, peak) =>
  phase < SOUND_FRACTION
    ? { status: 'breath', response: peak * Math.sin((Math.PI / 2) * (phase / SOUND_FRACTION)) }
    : { status: 'listening', response: 0 }

// Development-only: drives the water with a manual breathing signal instead
// of the microphone. Rendered only in `npm run dev` with ?water-test.
//   manual   - sliders set the signal directly (one continuous "breath")
//   pulse    - one slow simulated breath, peaking at the breath peak slider
//   cycle    - simulated breaths repeating at the chosen rate
//   released - signal 0 (the starting state, and after a pulse) so the
//              water can be watched settling
function WaterTestPanel({ overrideRef }) {
  const [enabled, setEnabled] = useState(true)
  const [mode, setMode] = useState('released')
  // 0.3 is about what a real breath near the microphone produces, so the
  // default preview matches what visitors see.
  const [response, setResponse] = useState(0.3)
  const [confidence, setConfidence] = useState(1)
  const [rate, setRate] = useState(SLOW_RATE)
  const [waves, setWaves] = useState(true)
  const frame = useRef(0)
  const latest = useRef({ response, confidence, rate, waves })
  latest.current = { response, confidence, rate, waves }

  useEffect(() => {
    const w = waves ? 1 : 0
    if (!enabled) overrideRef.current = null
    else if (mode === 'manual') overrideRef.current = { status: response > 0 ? 'breath' : 'listening', response, confidence, waves: w }
    else if (mode === 'released') overrideRef.current = { status: 'listening', response: 0, confidence, waves: w }
  }, [enabled, mode, response, confidence, waves, overrideRef])

  // Simulated breathing runs per frame and writes the override directly.
  // The phase advances by the current rate, so moving the slider mid-breath
  // changes the pace smoothly.
  useEffect(() => {
    if (mode !== 'pulse' && mode !== 'cycle') return
    let phase = 0
    let last = performance.now()
    const tick = (now) => {
      const { response: peak, confidence: c, rate: r, waves: w } = latest.current
      phase += ((now - last) / 1000) * ((mode === 'pulse' ? SLOW_RATE : r) / 60)
      last = now
      if (mode === 'pulse' && phase >= SOUND_FRACTION) {
        setMode('released')
        return
      }
      overrideRef.current = { ...breathAt(phase % 1, peak), confidence: c, waves: w ? 1 : 0 }
      frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame.current)
  }, [mode, overrideRef])

  useEffect(() => () => (overrideRef.current = null), [overrideRef])

  const run = (next) => {
    setEnabled(true)
    setMode(next)
  }

  return (
    <aside className="debug"aria-label="Water test controls (development only)">
      <label className="debug__row">
        <span>override breathing</span>
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
      </label>
      <label className="debug__row">
        <span>{mode === 'manual' ? 'response' : 'breath peak'} {response.toFixed(2)}</span>
        <input type="range" min="0" max="1" step="0.01" value={response} onChange={(e) => setResponse(Number(e.target.value))} />
      </label>
      <label className="debug__row">
        <span>confidence {confidence.toFixed(2)}</span>
        <input type="range" min="0" max="1" step="0.01" value={confidence} onChange={(e) => setConfidence(Number(e.target.value))} />
      </label>
      <label className="debug__row">
        <span>ambient waves (off = rings only)</span>
        <input type="checkbox" checked={waves} onChange={(e) => setWaves(e.target.checked)} />
      </label>
      <label className="debug__row">
        <span>breathe continuously</span>
        <input type="checkbox" checked={mode === 'cycle'} onChange={(e) => run(e.target.checked ? 'cycle' : 'released')} />
      </label>
      <label className="debug__row">
        <span>
          {rate} breaths/min ({((60 / rate) * SOUND_FRACTION).toFixed(1)} s sound, {((60 / rate) * (1 - SOUND_FRACTION)).toFixed(1)} s quiet)
        </span>
        <input type="range" min="4" max="40" step="1" value={rate} onChange={(e) => setRate(Number(e.target.value))} />
      </label>
      <div className="debug__row">
        <button type="button" className="debug__button" onClick={() => run('pulse')} disabled={mode === 'pulse' || mode === 'cycle'}>
          Simulate one breath
        </button>
        <button type="button" className="debug__button" onClick={() => run('manual')} disabled={mode === 'manual'}>
          Manual
        </button>
      </div>
      <div className="debug__row">
        <span>mode</span>
        <span>{{ manual: 'manual', pulse: 'inhaling…', cycle: 'breathing', released: 'still (signal 0)' }[mode]}</span>
      </div>
    </aside>
  )
}

export default WaterTestPanel
