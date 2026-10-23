import { Suspense, lazy, useCallback, useRef, useState } from 'react'
import LakeBackground from './components/LakeBackground.jsx'
import Controls from './components/Controls.jsx'
import BreathingControl from './components/BreathingControl.jsx'
import { useBreathingMode } from './breathing/useBreathingMode.js'
import './App.css'

// Developer panels (?breath-debug, ?water-test). import.meta.env.DEV is the
// constant false in production builds, so this import is removed entirely
// and visitors never download the panels or their styles.
const DevTools = import.meta.env.DEV ? lazy(() => import('./components/DevTools.jsx')) : null

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

function App() {
  // Sound only drives its label so far; audio playback comes in a later stage.
  const [soundOn, setSoundOn] = useState(false)
  const [motionOn, setMotionOn] = useState(() => !prefersReducedMotion())
  const breathing = useBreathingMode()
  const { readSignal } = breathing

  // In development the water test panel can override the microphone signal.
  const waterOverrideRef = useRef(null)
  const getWaterSignal = useCallback(() => waterOverrideRef.current ?? readSignal(), [readSignal])

  return (
    <main className="scene">
      <LakeBackground motionOn={motionOn} getWaterSignal={DevTools ? getWaterSignal : readSignal} />

      <header className="title-block">
        <h1 className="title">Elsewhere, Within</h1>
        <p className="tagline">A little closer to the natural world</p>
      </header>

      <BreathingControl breathing={breathing} motionOn={motionOn} />

      <Controls
        soundOn={soundOn}
        motionOn={motionOn}
        onToggleSound={() => setSoundOn((on) => !on)}
        onToggleMotion={() => setMotionOn((on) => !on)}
      />

      {DevTools && (
        <Suspense fallback={null}>
          <DevTools breathing={breathing} waterOverrideRef={waterOverrideRef} />
        </Suspense>
      )}
    </main>
  )
}

export default App
