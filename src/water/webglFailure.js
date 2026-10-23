// Development-only: explains why canvas.getContext('webgl') returned null.
// statusMessage comes from the canvas's 'webglcontextcreationerror' event
// (Chromium's own reason); freshCanvasWorks is whether a separate, unused
// canvas could create a WebGL context at the same moment.

const KNOWN_REASONS = [
  [/blocked|caused context loss/i, 'Edge blocked WebGL for this site after a GPU reset; fully restart Edge (edge://restart)'],
  [/disabled|not allowed|blocklist/i, 'WebGL is disabled in this browser; check edge://gpu and edge://settings/system'],
  [/could not create|BindToCurrentSequence|GPU process/i, 'the GPU process could not create a context; check edge://gpu'],
]

export function describeContextFailure({ statusMessage = '', freshCanvasWorks }) {
  const detail = statusMessage ? ` - browser says: "${statusMessage}"` : ' - browser gave no reason'
  if (freshCanvasWorks) {
    return `canvas conflict: this canvas refused WebGL but a fresh canvas accepts it (the canvas already holds another context)${detail}`
  }
  const hint = KNOWN_REASONS.find(([pattern]) => pattern.test(statusMessage))?.[1]
  return `WebGL unavailable in this browser session (a fresh canvas fails too, so it is not a canvas conflict)${detail}${hint ? `. ${hint}` : ''}`
}

// Asks a throwaway canvas for WebGL and releases the context immediately.
export function freshCanvasAcceptsWebGL() {
  const gl = document.createElement('canvas').getContext('webgl')
  if (!gl) return false
  gl.getExtension('WEBGL_lose_context')?.loseContext()
  return true
}
