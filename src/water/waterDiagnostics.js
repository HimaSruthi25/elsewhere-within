// Development-only view into the live water signal path, filled by
// WaterCanvas each frame and shown by the ?ripple-debug panel. Every write
// is behind import.meta.env.DEV, so production builds never touch it.

// The ?ripple-debug boost is an extra multiplier on top of the production
// RING_STRENGTH (shaders.js). x1 is exactly what visitors see; the old x10
// setting is now the production strength itself.
export const DEFAULT_RING_BOOST = 1

export const waterDiagnostics = {
  ringBoost: DEFAULT_RING_BOOST,
  mode: 0, // DEBUG_MODES: 0 normal, 1 pattern without mask, 2 pattern on water
  probePoint: null, // { x, y } CSS px to sample; null = default below the newest ring's origin
  frame: null, // { at, signal, level, ringsStarted, ripples (drive output), sent (after boost), spots }
  probe: null, // { at, point, probeRgb, displayedRgb } read back from the drawn frame
  readUniforms: null, // () => what the GPU holds, read back with gl.getUniform
  info: null, // () => GPU / context facts
  rendererStatus: 'not started', // 'running', or why the renderer failed
}

// Scales the strength of each [radius, strength] pair in place.
export function applyRingBoost(ripples, boost) {
  if (boost === 1) return
  for (let i = 1; i < ripples.length; i += 2) ripples[i] *= boost
}

// Slot of the youngest active ring (smallest radius), or -1.
export function newestSlot(ripples) {
  let slot = -1
  for (let i = 0; i < ripples.length; i += 2) {
    if (ripples[i + 1] > 0 && (slot === -1 || ripples[i] < ripples[slot * 2])) slot = i / 2
  }
  return slot
}
