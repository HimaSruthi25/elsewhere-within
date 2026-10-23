import { useEffect, useRef, useState } from 'react'
import { DEFAULT_RING_BOOST, newestSlot, waterDiagnostics } from '../water/waterDiagnostics.js'
import { DRIVE_DEFAULTS } from '../water/breathDrive.js'
import { DEBUG_MODES, decodeProbe } from '../water/shaderDebug.js'

const fmt = (v, digits = 2) => (Number.isFinite(v) ? v.toFixed(digits) : '–')

const MODES = [
  [DEBUG_MODES.patternUnmasked, 'A  test pattern, no mask'],
  [DEBUG_MODES.patternMasked, 'B  test pattern, water mask'],
  [DEBUG_MODES.normal, 'C  normal breath ripples'],
]

// Is the water canvas actually what is shown at this point of the page?
function compositing(point) {
  const canvas = document.querySelector('canvas.lake__water')
  if (!canvas) return 'no water canvas in the page'
  const style = getComputedStyle(canvas)
  const top = point && document.elementsFromPoint(point.x, point.y).find((el) => !el.closest('.debug-dock, .debug-probe'))
  const covered = top && top !== canvas ? ` — covered by <${top.tagName.toLowerCase()} class="${top.className}">` : ''
  const hidden = style.opacity === '0' ? ' (kept hidden until a first frame is drawn; the photo shows instead)' : ''
  return `opacity ${style.opacity}${hidden}, ${style.visibility}, ${canvas.clientWidth}x${canvas.clientHeight}${covered}`
}

// Development-only (?ripple-debug): the live path from breathing.readSignal()
// through the ring trigger to the shader, with direct visual tests that
// bypass the microphone, plus a pixel probe of what the shader drew.
function RippleDebugPanel() {
  const [view, setView] = useState(null)
  const [boost, setBoost] = useState(DEFAULT_RING_BOOST)
  const [mode, setMode] = useState(DEBUG_MODES.normal)
  const history = useRef({ started: 0, lastEventAt: null, peakSent: 0, peakRingPx: 0 })

  useEffect(() => {
    waterDiagnostics.ringBoost = boost
  }, [boost])
  useEffect(() => {
    waterDiagnostics.mode = mode
  }, [mode])

  // Click anywhere on the lake (outside the panels and controls) to move the probe.
  useEffect(() => {
    const onClick = (e) => {
      if (e.target.closest('.debug-dock, button, .consent')) return
      waterDiagnostics.probePoint = { x: e.clientX, y: e.clientY }
      history.current.peakRingPx = 0
    }
    window.addEventListener('click', onClick)
    return () => window.removeEventListener('click', onClick)
  }, [])

  useEffect(() => {
    const id = setInterval(() => {
      const f = waterDiagnostics.frame
      const p = waterDiagnostics.probe
      const h = history.current
      const decoded = p?.probeRgb ? decodeProbe(p.probeRgb) : null
      if (f && f.ringsStarted > h.started) {
        h.started = f.ringsStarted
        h.lastEventAt = f.at
        h.peakSent = 0
      }
      if (f) h.peakSent = Math.max(h.peakSent, ...f.sent.filter((_, i) => i % 2 === 1))
      if (decoded) h.peakRingPx = Math.max(h.peakRingPx, decoded.ringPx)
      const gpu = waterDiagnostics.readUniforms?.() ?? null
      const slot = f ? newestSlot(f.ripples) : -1
      setView({
        status: waterDiagnostics.rendererStatus,
        info: waterDiagnostics.info?.() ?? null,
        frameAgeMs: f ? performance.now() - f.at : null,
        compositing: compositing(p?.point),
        signal: f?.signal,
        level: f?.level,
        started: f?.ringsStarted ?? 0,
        sinceEvent: f && h.lastEventAt !== null ? (f.at - h.lastEventAt) / 1000 : null,
        active: f ? f.sent.filter((s, i) => i % 2 === 1 && s > 0).length : 0,
        newestAge: slot === -1 ? null : (f.ripples[slot * 2] - DRIVE_DEFAULTS.rippleStartRadius) / DRIVE_DEFAULTS.rippleSpeed,
        newestSent: slot === -1 ? null : f.sent[slot * 2 + 1],
        newestSpot: slot === -1 ? null : f.spots.slice(slot * 2, slot * 2 + 2),
        gpuStrengths: gpu ? gpu.ripples.filter((_, i) => i % 2 === 1) : null,
        peakSent: h.peakSent,
        probe: p,
        decoded,
        peakRingPx: h.peakRingPx,
      })
    }, 200)
    return () => {
      clearInterval(id)
      waterDiagnostics.ringBoost = DEFAULT_RING_BOOST
      waterDiagnostics.mode = DEBUG_MODES.normal
      waterDiagnostics.probePoint = null
    }
  }, [])

  const row = (label, value) => (
    <div className="debug__row">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
  const v = view
  const running = v && v.status === 'running' && v.frameAgeMs !== null && v.frameAgeMs < 500

  return (
    <>
      {v?.probe?.point && (
        <div className="debug-probe" style={{ left: v.probe.point.x, top: v.probe.point.y }} aria-hidden="true" />
      )}
      <aside className="debug"aria-label="Ripple rendering diagnostics (development only)">
        <strong>ripple rendering diagnostics</strong>
        <fieldset className="debug__modes">
          {MODES.map(([value, label]) => (
            <label key={value}>
              <input type="radio" name="ripple-debug-mode" checked={mode === value} onChange={() => setMode(value)} /> {label}
            </label>
          ))}
        </fieldset>
        {!v ? null : (
          <>
            {row('renderer', running ? 'running' : v.frameAgeMs !== null && v.status === 'running' ? `STALLED ${fmt(v.frameAgeMs / 1000, 1)} s` : v.status)}
            {v.info && row('gpu', v.info.gpu)}
            {v.info && row('buffer / highp', `${v.info.buffer.join('x')} / ${v.info.highp ? 'yes' : 'NO'}`)}
            {row('canvas', v.compositing)}
            {row('probe mask', v.decoded ? (v.decoded.water ? `water (shore fade ${fmt(v.decoded.shoreFade)})` : 'land / sky') : '–')}
            {row('probe ring offset', v.decoded ? `${fmt(v.decoded.ringPx, 2)} px (peak ${fmt(v.peakRingPx, 2)})` : '–')}
            {row('probe total offset', v.decoded ? `${fmt(v.decoded.totalPx, 2)} px` : '–')}
            {row('probe shown rgb', v.probe?.displayedRgb ? v.probe.displayedRgb.join(' ') : '–')}
            {row('breath source', v.signal?.active === undefined ? (v.signal ? 'test override' : '–') : v.signal.active ? 'microphone' : 'breathing off')}
            {row('status / resp / conf', v.signal ? `${v.signal.status} / ${fmt(v.signal.response)} / ${fmt(v.signal.confidence)}` : '–')}
            {row('ring events', `${v.started}${v.sinceEvent === null ? '' : ` (last ${fmt(v.sinceEvent, 1)} s ago)`}`)}
            {row('active rings / newest', `${v.active} / ${v.newestAge === null ? '–' : `${fmt(v.newestAge, 1)} s, ${fmt(v.newestSent, 3)}`}`)}
            {row('newest origin', v.newestSpot ? `across ${fmt(v.newestSpot[0])}, down ${fmt(v.newestSpot[1])}` : '–')}
            {row('GPU uRipples', v.gpuStrengths ? v.gpuStrengths.map((s) => fmt(s, 2)).join(' ') : '–')}
          </>
        )}
        <label className="debug__row">
          <span>extra boost x{boost}{boost === DEFAULT_RING_BOOST ? ' (= public site)' : ''}</span>
          <input type="range" min="1" max="10" step="1" value={boost} onChange={(e) => setBoost(Number(e.target.value))} />
        </label>
        <small>Click the lake to move the probe (+).</small>
      </aside>
    </>
  )
}

export default RippleDebugPanel
