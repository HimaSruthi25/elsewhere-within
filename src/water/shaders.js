// GLSL ES 1.0 (WebGL 1) so the effect runs on as many devices as possible.

// How far breathing rings displace the photo. 0.7 is ten times the earlier
// 0.07: the strength confirmed in Edge with the ?ripple-debug boost at x10
// (that boost scaled each ring's strength, which this multiplies linearly).
export const RING_STRENGTH = 0.7

export const VERTEX_SHADER = `
attribute vec2 aPosition;
varying vec2 vUv;

void main() {
  // Screen UV with a top-left origin, matching image UV.
  vUv = vec2(aPosition.x * 0.5 + 0.5, 0.5 - aPosition.y * 0.5);
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`

// debug: development-only GLSL hooks (see shaderDebug.js). Without it the
// source is exactly the production shader.
export const fragmentShader = (shorePoints, maxRipples, debug = null) => `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

#define SHORE_POINTS ${shorePoints}
#define MAX_RIPPLES ${maxRipples}
#define TAU 6.28318530718

// Breathing ripples, in water-plane units. A ring is a soft wave packet:
// about one and a half gentle undulations under a smooth bell envelope.
#define RING_WIDTH 0.42
#define RING_WAVELENGTH 0.75
#define RING_STRENGTH ${RING_STRENGTH.toFixed(2)}
#define RING_SPREAD 1.5      // radius over which a ring loses ~30% to spreading

uniform sampler2D uImage;
uniform vec2 uUvScale;       // screen UV -> image UV (object-fit: cover)
uniform vec2 uUvOffset;
uniform vec2 uShore[SHORE_POINTS];
uniform float uHorizon;      // straight vanishing line of the water plane
uniform float uImageAspect;
uniform float uTime;
uniform float uAmbient;      // 0..1 overall strength (fades in on start)
uniform float uWaves;        // 0..1 ambient wind ripples (0 previews rings alone)
uniform float uBreath;       // 0..1 smoothed breathing level
uniform vec2 uRipples[MAX_RIPPLES]; // (radius, strength); strength 0 = unused
uniform vec2 uRippleCenters[MAX_RIPPLES]; // each ring's origin on the water plane

varying vec2 vUv;

float shoreAt(float u) {
  float y = uShore[0].y;
  for (int i = 0; i < SHORE_POINTS - 1; i++) {
    vec2 a = uShore[i];
    vec2 b = uShore[i + 1];
    if (u >= a.x) y = mix(a.y, b.y, clamp((u - a.x) / max(b.x - a.x, 1e-5), 0.0, 1.0));
  }
  return y;
}
${debug?.declarations ?? ''}
// Adds the surface slope of one travelling wave. p is a point on the water
// plane; wavelength and speed are in plane units.
void wave(inout vec2 g, vec2 p, vec2 dir, float wavelength, float speed, float slope) {
  float k = TAU / wavelength;
  g += dir * slope * cos(dot(dir, p) * k - uTime * speed * k);
}

// Surface slope of one expanding ring. The packet keeps its shape as it
// travels, so it glides outward rather than oscillating in place, and it
// thins out as it spreads.
vec2 ring(vec2 p, vec2 ripple, vec2 center) {
  vec2 d = p - center;
  float r = length(d) + 1e-4;
  float s = r - ripple.x;
  float w2 = RING_WIDTH * RING_WIDTH;
  float k = TAU / RING_WAVELENGTH;
  float envelope = exp(-s * s / w2);
  // Derivative of envelope * cos(k s), divided by k so its peak is ~1.
  float slope = envelope * (sin(k * s) + (2.0 * s / (w2 * k)) * cos(k * s));
  float spreading = inversesqrt(1.0 + ripple.x / RING_SPREAD);
  return (d / r) * slope * ripple.y * spreading;
}

void main() {
  vec2 uv = vUv * uUvScale + uUvOffset;
  vec4 base = texture2D(uImage, uv);
${debug?.beforeMask ?? ''}
  float belowShore = uv.y - shoreAt(uv.x); // mask: water only below the shoreline
  if (belowShore <= 0.0) {
    gl_FragColor = base;
    return;
  }

  // Perspective: rows near the horizon are far away, the bottom of the photo
  // is close. Waves live on the flat water plane, so they shrink and flatten
  // towards the horizon the way real ripples do.
  float depth = uv.y - uHorizon;
  float z = 1.0 / depth;
  vec2 p = vec2((uv.x - 0.5) * uImageAspect * z, z);
  p += 0.06 * vec2(sin(p.y * 2.7 + uTime * 0.21), sin(p.x * 1.9 - uTime * 0.17)); // break up regularity
${debug?.onWater ?? ''}
  vec2 g = vec2(0.0);
  wave(g, p, normalize(vec2(0.22, 1.0)), 0.55, 0.11, 0.34);
  wave(g, p, normalize(vec2(-0.45, 1.0)), 0.37, 0.09, 0.26);
  wave(g, p, normalize(vec2(0.9, 0.45)), 0.23, 0.07, 0.17);
  wave(g, p, normalize(vec2(-0.75, 0.62)), 0.16, 0.06, 0.12);
  wave(g, p, normalize(vec2(0.08, -1.0)), 0.93, 0.05, 0.22);
  g *= 1.0 + 0.5 * uBreath;

  // Breathing rings: they only displace the photo's reflections; nothing is
  // drawn on the water. They fade on their own schedule, independent of the
  // current breath level, so they finish expanding after the breath ends.
  vec2 rings = vec2(0.0);
  for (int i = 0; i < MAX_RIPPLES; i++) {
    if (uRipples[i].y > 0.0005) rings += ring(p, uRipples[i], uRippleCenters[i]);
  }

  float strength = (0.011 + 0.008 * uBreath) * uAmbient * uWaves;
  float shoreFade = smoothstep(0.0, 0.025, belowShore); // the waterline itself never moves
  vec2 slope = g * strength + rings * (RING_STRENGTH * uAmbient);
  vec2 offset = vec2(slope.x * 0.45, slope.y) * depth * shoreFade;
  offset.y = max(offset.y, -0.8 * belowShore); // never reach above the shoreline
${debug?.beforeOutput ?? ''}
  vec2 sampleUv = uv + offset;
  float sampleDepth = sampleUv.y - shoreAt(sampleUv.x);
  vec3 color = mix(base.rgb, texture2D(uImage, sampleUv).rgb, smoothstep(0.0, 0.002, sampleDepth));

  // Faint light variation from the surface slope.
  color *= 1.0 + clamp(slope.y * shoreFade * 1.6, -0.035, 0.035);

  gl_FragColor = vec4(color, 1.0);
}
`
