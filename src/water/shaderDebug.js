// Development-only shader diagnostics for ?ripple-debug. createWaterRenderer
// splices DEBUG_GLSL into the fragment shader only when import.meta.env.DEV
// is true, so production builds never include or compile any of this.

import { coverTransform, planeToImageUv, rippleOriginAt } from './lakeGeometry.js'

export const DEBUG_MODES = {
  normal: 0, // C. normal breath-driven ripples
  patternUnmasked: 1, // A. test pattern everywhere, ignoring the water mask
  patternMasked: 2, // B. test pattern on the water only, in water-plane coordinates
  probe: 3, // internal: encodes mask and ring offset for pixel readback
}

// Probe pixel encoding (mode 3): R = 0 on land, 0.2 + 0.8 * shoreFade on water;
// G, B = ring and total displacement in screen pixels / PROBE_PX_RANGE.
export const PROBE_PX_RANGE = 16

export const DEBUG_GLSL = {
  declarations: `
uniform float uDebugMode;
uniform float uViewPx; // drawing-buffer height in device pixels
uniform vec2 uRippleCenter; // test patterns are centred on the newest ring's origin

// Unmistakable animated bands, travelling outward as r grows.
vec3 debugBands(float phase) {
  float band = 0.5 + 0.5 * sin(phase - uTime * 3.0);
  return mix(vec3(1.0, 0.0, 0.85), vec3(0.0, 1.0, 1.0), band);
}
`,
  // After base is sampled, before the water mask is applied.
  beforeMask: `
  if (uDebugMode > 0.5 && uDebugMode < 1.5) {
    // A: screen-space rings round the ripple origin, everywhere.
    float oz = uRippleCenter.y;
    vec2 origin = vec2(0.5 + uRippleCenter.x / (uImageAspect * oz), uHorizon + 1.0 / oz);
    float r = length((uv - origin) * vec2(uImageAspect, 1.0));
    gl_FragColor = vec4(mix(base.rgb, debugBands(r * 60.0), 0.6), 1.0);
    return;
  }
  if (uDebugMode > 2.5 && uv.y - shoreAt(uv.x) <= 0.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); // probe: land
    return;
  }
`,
  // After the mask and the water-plane point p, before any waves.
  onWater: `
  if (uDebugMode > 1.5 && uDebugMode < 2.5) {
    // B: rings round the real ripple origin on the water plane (perspective
    // ellipses), only where the mask says water.
    float r = length(p - uRippleCenter);
    gl_FragColor = vec4(mix(base.rgb, debugBands(r * TAU / 0.5), 0.6), 1.0);
    return;
  }
`,
  // After the final offset is known, before the colour is written.
  beforeOutput: `
  if (uDebugMode > 2.5) {
    vec2 ringOffset = vec2(rings.x * 0.45, rings.y) * (RING_STRENGTH * uAmbient) * depth * shoreFade;
    float pxPerUv = uViewPx / uUvScale.y;
    gl_FragColor = vec4(
      0.2 + 0.8 * shoreFade,
      clamp(length(ringOffset) * pxPerUv / ${PROBE_PX_RANGE.toFixed(1)}, 0.0, 1.0),
      clamp(length(offset) * pxPerUv / ${PROBE_PX_RANGE.toFixed(1)}, 0.0, 1.0),
      1.0);
    return;
  }
`,
}

// Decodes a probe pixel read back with gl.readPixels (0..255 RGB).
export function decodeProbe([r, g, b]) {
  const water = r > 25
  return {
    water,
    shoreFade: water ? Math.min(1, Math.max(0, (r / 255 - 0.2) / 0.8)) : 0,
    ringPx: water ? (g / 255) * PROBE_PX_RANGE : 0,
    totalPx: water ? (b / 255) * PROBE_PX_RANGE : 0,
  }
}

// Default probe point, in CSS pixels of the viewport: straight below the
// origin of the ring at spot (breathDrive), where its near side passes
// about 3 s after the breath.
export function defaultProbePoint(width, height, spot = [0.5, 0.5]) {
  const t = coverTransform(width, height)
  const [x, z] = rippleOriginAt(t, spot)
  const [imageU, imageV] = planeToImageUv([x, z - 1]) // 1 plane unit in front of the origin
  return {
    x: ((imageU - t.offset[0]) / t.scale[0]) * width,
    y: ((imageV - t.offset[1]) / t.scale[1]) * height,
  }
}
