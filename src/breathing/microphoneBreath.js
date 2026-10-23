// Browser side of breathing mode: microphone -> Web Audio analyser ->
// features -> estimator. Audio is analysed in memory frame by frame and is
// never recorded, stored, played back, or sent anywhere.

import { createBreathEstimator } from './breathEstimator.js'

const ANALYSIS_INTERVAL_MS = 33

// Browser voice processing is designed to remove exactly the soft,
// noise-like sound that breathing makes, so it is switched off.
const AUDIO_CONSTRAINTS = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: 1,
}

const BANDS = {
  wind: [80, 300], // air hitting the mic, mostly on close exhales
  hiss: [300, 4000], // turbulent airflow through nose and mouth
}

export const IDLE_SIGNAL = Object.freeze({ status: 'idle', response: 0, confidence: 0 })

export function isBreathingSupported() {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext === true &&
    typeof navigator.mediaDevices?.getUserMedia === 'function' &&
    typeof (window.AudioContext || window.webkitAudioContext) === 'function'
  )
}

function statusForError(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'denied'
    case 'NotFoundError':
    case 'NotReadableError':
    case 'OverconstrainedError':
    case 'AbortError':
      return 'unavailable'
    default:
      return 'error'
  }
}

function createFeatureReader(analyser, sampleRate) {
  const time = new Float32Array(analyser.fftSize)
  const freq = new Float32Array(analyser.frequencyBinCount)
  const binHz = sampleRate / analyser.fftSize
  const bin = (hz) => Math.min(freq.length - 1, Math.round(hz / binHz))
  const power = (db) => 10 ** (Math.max(db, -160) / 10)

  const bandPower = ([lo, hi]) => {
    let sum = 0
    for (let i = bin(lo); i <= bin(hi); i++) sum += power(freq[i])
    return sum
  }

  return function read() {
    analyser.getFloatTimeDomainData(time)
    analyser.getFloatFrequencyData(freq)

    let sumSquares = 0
    for (let i = 0; i < time.length; i++) sumSquares += time[i] * time[i]
    const rms = Math.sqrt(sumSquares / time.length)

    // Spectral flatness: geometric / arithmetic mean of power. Near 0 for
    // tonal sound (voice, music), higher for noise-like sound (breath).
    const [lo, hi] = BANDS.hiss
    let logSum = 0
    let linSum = 0
    let n = 0
    for (let i = bin(lo); i <= bin(hi); i++) {
      const p = power(freq[i])
      logSum += Math.log(p)
      linSum += p
      n += 1
    }
    const flatness = n > 0 && linSum > 0 ? Math.exp(logSum / n) / (linSum / n) : 0

    return {
      levelDb: 20 * Math.log10(rms + 1e-10),
      flatness,
      windRatioDb: 10 * Math.log10((bandPower(BANDS.wind) + 1e-20) / (bandPower(BANDS.hiss) + 1e-20)),
    }
  }
}

export function createMicrophoneBreath({ onStatus, estimatorOptions } = {}) {
  let context = null
  let stream = null
  let nodes = []
  let timer = null
  let stopped = false
  let status = 'idle'
  let latest = IDLE_SIGNAL
  const estimator = createBreathEstimator(estimatorOptions)

  const setStatus = (next) => {
    if (next === status) return
    status = next
    onStatus?.(next)
  }

  function teardown() {
    clearInterval(timer)
    timer = null
    stream?.getTracks().forEach((track) => {
      track.removeEventListener('ended', onTrackEnded)
      track.stop()
    })
    stream = null
    nodes.forEach((node) => node.disconnect())
    nodes = []
    if (context && context.state !== 'closed') context.close().catch(() => {})
    context = null
  }

  function onTrackEnded() {
    teardown()
    latest = IDLE_SIGNAL
    setStatus('unavailable')
  }

  async function start() {
    setStatus('requesting')
    // Created before awaiting permission so it belongs to the user's click,
    // which Safari requires.
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    context = new AudioCtx()

    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS, video: false })
    } catch (err) {
      teardown()
      setStatus(statusForError(err))
      return false
    }
    if (stopped) {
      teardown()
      return false
    }

    try {
      await context.resume()
      const source = context.createMediaStreamSource(stream)
      const highpass = context.createBiquadFilter()
      highpass.type = 'highpass'
      highpass.frequency.value = 80 // mains hum and handling rumble
      const analyser = context.createAnalyser()
      analyser.fftSize = 2048
      analyser.smoothingTimeConstant = 0
      // A silent sink keeps the graph running in every browser without
      // ever playing the microphone through the speakers.
      const mute = context.createGain()
      mute.gain.value = 0

      source.connect(highpass)
      highpass.connect(analyser)
      analyser.connect(mute)
      mute.connect(context.destination)
      nodes = [source, highpass, analyser, mute]

      const readFeatures = createFeatureReader(analyser, context.sampleRate)
      stream.getAudioTracks().forEach((track) => track.addEventListener('ended', onTrackEnded))

      let lastTick = performance.now()
      timer = setInterval(() => {
        const now = performance.now()
        latest = estimator.update(readFeatures(), (now - lastTick) / 1000)
        lastTick = now
        setStatus(latest.status)
      }, ANALYSIS_INTERVAL_MS)
      setStatus('calibrating')
      return true
    } catch {
      teardown()
      setStatus('error')
      return false
    }
  }

  function stop() {
    stopped = true
    teardown()
    latest = IDLE_SIGNAL
    setStatus('idle')
  }

  return { start, stop, read: () => latest }
}
