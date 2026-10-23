import { useEffect, useId, useRef, useState } from 'react'

const STATUS_TEXT = {
  requesting: 'Waiting for permission',
  calibrating: 'Calibrating · stay quiet a moment',
  listening: 'Listening',
  breath: 'Breath detected',
  'too-noisy': 'Too noisy',
  denied: 'Microphone blocked',
  unavailable: 'Microphone unavailable',
  error: 'Microphone unavailable',
}

// Statuses read out to screen readers. Listening and breath alternate on
// every breath, so both are announced as a single steady "Listening".
const ANNOUNCED = new Set(['calibrating', 'too-noisy', 'denied', 'unavailable', 'error'])

function BreathingControl({ breathing, motionOn }) {
  const [panelOpen, setPanelOpen] = useState(false)
  const toggleRef = useRef(null)
  const primaryRef = useRef(null)
  const titleId = useId()
  const bodyId = useId()

  useEffect(() => {
    if (panelOpen) primaryRef.current?.focus()
  }, [panelOpen])

  const closePanel = () => {
    setPanelOpen(false)
    toggleRef.current?.focus()
  }

  const onToggle = () => {
    if (breathing.on) breathing.stop()
    else setPanelOpen((open) => !open)
  }

  const onAllow = () => {
    setPanelOpen(false)
    toggleRef.current?.focus()
    breathing.start()
  }

  const text = STATUS_TEXT[breathing.status]
  const hint =
    breathing.status === 'denied'
      ? 'Allow the microphone in your browser’s site settings to try again.'
      : breathing.on && !motionOn
        ? 'Motion is off, so the water stays still.'
        : null

  return (
    <div className="breathing" onKeyDown={(e) => e.key === 'Escape' && panelOpen && closePanel()}>
      {panelOpen && (
        <div className="consent" role="dialog" aria-modal="false" aria-labelledby={titleId} aria-describedby={bodyId}>
          <h2 className="consent__title" id={titleId}>
            Breathing mode
          </h2>
          {breathing.supported ? (
            <>
              <p className="consent__body" id={bodyId}>
                The lake can follow the sound of your breathing through your microphone. Sound is analysed live in this
                browser and is never recorded, stored, or uploaded. It calibrates to your room for a few quiet seconds
                first. Switch it off at any time to release the microphone.
              </p>
              <div className="consent__actions">
                <button type="button" className="consent__button consent__button--primary" ref={primaryRef} onClick={onAllow}>
                  Use microphone
                </button>
                <button type="button" className="consent__button" onClick={closePanel}>
                  Not now
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="consent__body" id={bodyId}>
                This browser can’t provide microphone access here, so breathing mode isn’t available. The lake is
                exactly the same without it.
              </p>
              <div className="consent__actions">
                <button type="button" className="consent__button consent__button--primary" ref={primaryRef} onClick={closePanel}>
                  Close
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <button
        type="button"
        className="control"
        aria-pressed={breathing.on}
        aria-expanded={panelOpen}
        ref={toggleRef}
        onClick={onToggle}
      >
        Breathing <span className="control__state">{breathing.on ? 'On' : 'Off'}</span>
      </button>

      <p className="breathing__status" aria-hidden="true">
        {text}
        {hint && <span className="breathing__hint">{hint}</span>}
      </p>
      <p className="visually-hidden" role="status">
        {ANNOUNCED.has(breathing.status) ? text : breathing.on ? 'Listening' : ''}
        {hint && ` ${hint}`}
      </p>
    </div>
  )
}

export default BreathingControl
