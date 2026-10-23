// WebGL renderer that redraws the lake photo with the water distorted.
// Returns null when WebGL or the shader is unavailable, so callers can keep
// showing the still image.

import { HORIZON, PHOTO_ASPECT, SHORELINE, coverTransform, rippleOriginAt, rippleStrengthAt } from './lakeGeometry.js'
import { MAX_RIPPLES } from './breathDrive.js'
import { VERTEX_SHADER, fragmentShader } from './shaders.js'
import { describeContextFailure, freshCanvasAcceptsWebGL } from './webglFailure.js'

const MAX_DEVICE_PIXEL_RATIO = 2
const MAX_PIXELS = 3_000_000 // keeps large/high-DPI screens within budget

function compile(gl, type, source, fail) {
  const shader = gl.createShader(type)
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    console.warn('Water shader failed to compile:', log)
    fail(`shader compile failed: ${log}`)
    gl.deleteShader(shader)
    return null
  }
  return shader
}

// options.debugGlsl: development-only shader hooks (shaderDebug.js).
// options.onFail(reason): told why the renderer could not be created.
export function createWaterRenderer(canvas, image, { debugGlsl = null, onFail = () => {} } = {}) {
  // Development-only: Chromium reports why context creation failed on this event.
  let creationError = ''
  const onCreationError = (event) => (creationError = event.statusMessage || '')
  if (import.meta.env.DEV) canvas.addEventListener('webglcontextcreationerror', onCreationError)
  const gl = canvas.getContext('webgl', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
  })
  const fail = (reason) => {
    onFail(reason)
    return null
  }
  if (import.meta.env.DEV) canvas.removeEventListener('webglcontextcreationerror', onCreationError)
  if (!gl) {
    if (import.meta.env.DEV) {
      return fail(`getContext returned null: ${describeContextFailure({ statusMessage: creationError, freshCanvasWorks: freshCanvasAcceptsWebGL() })}`)
    }
    return fail('WebGL unavailable (getContext returned null)')
  }
  if (gl.isContextLost()) return fail('WebGL context lost at creation (this canvas was already used and released, or the GPU reset)')
  if (Math.max(image.naturalWidth, image.naturalHeight) > gl.getParameter(gl.MAX_TEXTURE_SIZE)) {
    return fail(`photo ${image.naturalWidth}px exceeds MAX_TEXTURE_SIZE`)
  }

  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER, onFail)
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentShader(SHORELINE.length, MAX_RIPPLES, debugGlsl), onFail)
  if (!vertex || !fragment) return null

  const program = gl.createProgram()
  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program)
    console.warn('Water shader failed to link:', log)
    return fail(`shader link failed: ${log}`)
  }
  gl.useProgram(program)

  // One triangle covering the screen.
  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const aPosition = gl.getAttribLocation(program, 'aPosition')
  gl.enableVertexAttribArray(aPosition)
  gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0)

  const texture = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image)

  const u = (name) => gl.getUniformLocation(program, name)
  const uniforms = {
    uvScale: u('uUvScale'),
    uvOffset: u('uUvOffset'),
    time: u('uTime'),
    ambient: u('uAmbient'),
    waves: u('uWaves'),
    breath: u('uBreath'),
    ripples: u('uRipples[0]'),
    rippleCenters: u('uRippleCenters[0]'),
  }
  // Development-only uniforms; import.meta.env.DEV lets production builds drop them.
  const debugUniforms =
    import.meta.env.DEV && debugGlsl ? { mode: u('uDebugMode'), viewPx: u('uViewPx'), patternCenter: u('uRippleCenter') } : null
  gl.uniform1i(u('uImage'), 0)
  gl.uniform1f(u('uImageAspect'), PHOTO_ASPECT)
  gl.uniform1f(u('uHorizon'), HORIZON)
  gl.uniform2fv(u('uShore[0]'), SHORELINE.flat())

  let cssWidth = 0
  let cssHeight = 0
  let transform = null
  const centers = new Float32Array(MAX_RIPPLES * 2)
  const placed = new Float32Array(MAX_RIPPLES * 2) // ripples with strength evened out by origin depth

  function resize() {
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    if (width === cssWidth && height === cssHeight) return
    cssWidth = width
    cssHeight = height
    let ratio = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO)
    ratio = Math.min(ratio, Math.sqrt(MAX_PIXELS / Math.max(1, width * height)))
    canvas.width = Math.max(1, Math.round(width * ratio))
    canvas.height = Math.max(1, Math.round(height * ratio))
    gl.viewport(0, 0, canvas.width, canvas.height)
    transform = coverTransform(width, height)
    gl.uniform2f(uniforms.uvScale, transform.scale[0], transform.scale[1])
    gl.uniform2f(uniforms.uvOffset, transform.offset[0], transform.offset[1])
    if (import.meta.env.DEV && debugUniforms) gl.uniform1f(debugUniforms.viewPx, canvas.height)
  }

  // Development-only: draws in the chosen debug mode and, with a probe point
  // (CSS px from the canvas top-left), reads back what the shader produced.
  const renderDebug = import.meta.env.DEV
    ? ({ mode, probe, patternSpot }) => {
        gl.uniform2fv(debugUniforms.patternCenter, rippleOriginAt(transform, patternSpot))
        const readPixel = ({ x, y }) => {
          const px = new Uint8Array(4)
          const sx = Math.round((x / cssWidth) * canvas.width)
          const sy = canvas.height - 1 - Math.round((y / cssHeight) * canvas.height)
          gl.readPixels(sx, sy, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)
          return Array.from(px.slice(0, 3))
        }
        let probeRgb = null
        if (probe) {
          gl.uniform1f(debugUniforms.mode, 3)
          gl.drawArrays(gl.TRIANGLES, 0, 3)
          probeRgb = readPixel(probe)
        }
        gl.uniform1f(debugUniforms.mode, mode)
        gl.drawArrays(gl.TRIANGLES, 0, 3)
        return probe ? { probeRgb, displayedRgb: readPixel(probe) } : null
      }
    : null

  return {
    // time in seconds; ambient, breath, waves 0..1; ripples: [radius,
    // strength] pairs and spots: [across, down] pairs, from
    // createBreathDrive(). debug (development only): { mode, probe: {x, y} |
    // null, patternSpot }; with a probe it returns { probeRgb, displayedRgb }
    // read back from what the shader drew.
    render({ time, ambient, breath, ripples, spots, waves = 1, debug = null }) {
      if (gl.isContextLost()) return null
      resize()
      for (let i = 0; i < MAX_RIPPLES; i++) {
        const spot = [spots[i * 2], spots[i * 2 + 1]]
        const [x, z] = rippleOriginAt(transform, spot)
        centers[i * 2] = x
        centers[i * 2 + 1] = z
        placed[i * 2] = ripples[i * 2]
        placed[i * 2 + 1] = ripples[i * 2 + 1] * rippleStrengthAt(transform, spot)
      }
      gl.uniform1f(uniforms.time, time % 3600)
      gl.uniform1f(uniforms.ambient, ambient)
      gl.uniform1f(uniforms.waves, waves)
      gl.uniform1f(uniforms.breath, breath)
      gl.uniform2fv(uniforms.ripples, placed)
      gl.uniform2fv(uniforms.rippleCenters, centers)
      if (import.meta.env.DEV && debugUniforms && debug) return renderDebug(debug)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      return null
    },
    // Development-only: driver and context facts for the diagnostics panel.
    info:
      import.meta.env.DEV && debugGlsl
        ? () => {
            const ext = gl.getExtension('WEBGL_debug_renderer_info')
            const high = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT)
            return {
              gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
              buffer: [canvas.width, canvas.height],
              highp: high.precision > 0,
              lost: gl.isContextLost(),
            }
          }
        : undefined,
    // Development-only: the ring and breath uniforms as the GPU holds them.
    readUniforms: import.meta.env.DEV
      ? () => {
          if (gl.isContextLost()) return null
          const ripples = []
          for (let i = 0; i < MAX_RIPPLES; i++) ripples.push(...gl.getUniform(program, u(`uRipples[${i}]`)))
          return { ripples, breath: gl.getUniform(program, uniforms.breath), ambient: gl.getUniform(program, uniforms.ambient), waves: gl.getUniform(program, uniforms.waves) }
        }
      : undefined,
    dispose() {
      gl.deleteTexture(texture)
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
      gl.deleteShader(vertex)
      gl.deleteShader(fragment)
      // Each activation gets a fresh canvas, so the context can be released.
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    },
  }
}
