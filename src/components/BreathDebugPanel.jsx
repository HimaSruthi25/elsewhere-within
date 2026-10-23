import { useEffect, useState } from 'react'

// Calibration readout, shown only with ?breath-debug in the URL.
function BreathDebugPanel({ readDetails, readSignal }) {
  const [view, setView] = useState(null)

  useEffect(() => {
    const id = setInterval(() => setView({ details: readDetails(), signal: readSignal() }), 100)
    return () => clearInterval(id)
  }, [readDetails, readSignal])

  if (!view) return null
  const d = view.details
  const s = view.signal
  const row = (label, value) => (
    <div className="debug__row">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
  const bar = (label, value) => (
    <div className="debug__row">
      <span>{label}</span>
      <span className="debug__bar">
        <span style={{ width: `${Math.round(value * 100)}%` }} />
      </span>
    </div>
  )

  return (
    <aside className="debug" aria-label="Breathing detector readout">
      {row('status', s.status)}
      {bar('response', s.response)}
      {bar('confidence', s.confidence)}
      {d && (
        <>
          {row('calibration', `${Math.round(d.calibrationProgress * 100)}%`)}
          {row('level dB', d.levelDb.toFixed(1))}
          {row('floor dB', d.floorDb.toFixed(1))}
          {row('snr dB', d.snrDb.toFixed(1))}
          {row('flatness', d.flatness.toFixed(2))}
          {row('wind/hiss dB', d.windRatioDb.toFixed(1))}
        </>
      )}
    </aside>
  )
}

export default BreathDebugPanel
