import { useState } from 'react'
import BreathDebugPanel from './BreathDebugPanel.jsx'
import WaterTestPanel from './WaterTestPanel.jsx'
import RippleDebugPanel from './RippleDebugPanel.jsx'
import './devtools.css'

const urlFlag = (name) => new URLSearchParams(window.location.search).has(name)

// Development-only panels, opened with URL flags:
//   ?breath-debug  microphone detector readout
//   ?water-test    manual breathing signal for testing the water
//   ?ripple-debug  live signal path into the ring shader, with a ring boost
// App.jsx loads this module only when import.meta.env.DEV is true, so none
// of it (code or styles) is in the production build.
// The panels share one scrollable column on the right, clear of the
// breathing card (left) and the SOUND / MOTION buttons (bottom right).
function DevTools({ breathing, waterOverrideRef }) {
  // On narrow screens the panels would cover the centred breathing card, so
  // they start hidden behind the toggle (matches the media query in devtools.css).
  const [open, setOpen] = useState(() => !window.matchMedia('(max-width: 760px)').matches)
  const panels = ['breath-debug', 'water-test', 'ripple-debug'].filter(urlFlag)
  if (panels.length === 0) return null

  return (
    <div className="debug-dock">
      <button type="button" className="debug__button debug-dock__toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {open ? 'hide dev panels' : 'show dev panels'}
      </button>
      {/* Kept mounted while hidden, so the ripple panel's debug mode and boost stay applied. */}
      <div className="debug-dock__panels" hidden={!open}>
        {panels.includes('breath-debug') && <BreathDebugPanel readDetails={breathing.readDetails} readSignal={breathing.readSignal} />}
        {panels.includes('water-test') && <WaterTestPanel overrideRef={waterOverrideRef} />}
        {panels.includes('ripple-debug') && <RippleDebugPanel />}
      </div>
    </div>
  )
}

export default DevTools
