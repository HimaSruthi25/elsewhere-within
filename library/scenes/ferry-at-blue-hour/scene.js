// Ferry at Blue Hour — the open stern deck of a small wooden ferry crossing a
// calm bay; a hillside harbour town lights up on the far shore.
// The illustration is drawn through a small WebGL shader that adds:
//   - the boat rocking: the deck, rail and lamp roll and heave gently against
//     a level horizon (a "far" plate with the deck and wake painted out fills
//     what the moving rail uncovers);
//   - the boat moving: the water surface and its waves slide away from the
//     stern toward the horizon, in perspective;
//   - a live foam wake drawn in code (churning near the stern, lacy trails
//     further out) streaming away behind the boat;
//   - sparse glints on the water, twinkling town lights, stars (more at night);
//   - a colour grade that follows the PC clock (dusk = the painting).
// A 2D canvas on top adds the deck lamp's flicker and warm pool of light and
// gulls gliding over the bay (drawn in code; the painted gulls were removed).
// The shores (town, headland, middle hill) are separate layers cut from the
// painting over a background plate (sky continued behind them, water refilled):
// see travel() for the crossing.
// Live wallpaper: move across the sky and a gull comes to glide alongside the
// hand; rest still and it circles it; leave it and it drifts back out over
// the bay. A click makes it flap and lift.
// With reducedMotion one still frame is drawn (again when the time of day changes).
// Mask (640×360, made from the picture): R = water, G = where the wake runs,
// B = everything beyond the rail (not part of the boat), A = warm lights.
import photoUrl from './ferry-at-blue-hour.jpg'
import maskUrl from './ferry-at-blue-hour-mask.png'
import bgUrl from './ferry-at-blue-hour-bg.jpg'
import landUrl from './ferry-at-blue-hour-land.png'

const IW = 1920
const IH = 1080
const LAMP = [0.6693, 0.4922]
const FPS = 30
const HORIZON = 0.352
const SPEED = 0.22 // how fast the water slides away (perspective depth units / s)
const PIVOT = [0.5, 1.08] // the deck rolls about a point below the frame
const OVER = 1.045 // deck overscan so the rolling corners never show an edge

// The journey. One crossing lasts CROSSING seconds: the shores slowly shrink
// toward their far ends as the ferry sails out of the bay (nearer shores
// shrink faster), the course wanders so the shores glide sideways at
// different speeds (parallax), and at the end a sea mist rolls in on the
// horizon, the next crossing starts behind it, and the mist clears.
const CROSSING = 480
const DIST = [1.0, 1.7, 2.6] // town, headland, middle hill (relative distance)
const AWAY = 0.6 // how much farther everything is at the end of a crossing
const STILL_T = 60 // reduced motion: one moment early in a crossing
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
function travel(t) {
  const j = (t % CROSSING) / CROSSING
  const k = DIST.map((d) => d / (d + j * AWAY))
  const side = 0.035 * Math.sin(t * 2 * Math.PI / 170) + 0.018 * Math.sin(t * 2 * Math.PI / 73 + 1.0)
  const shift = DIST.map((d, i) => side * k[i] / d)
  const yaw = 0.012 * Math.sin(t * 2 * Math.PI / 130 + 0.5)
  const fog = Math.max(smooth(0.93, 0.995, j), 1 - smooth(0.0, 0.06, j))
  return { j, k, shift, yaw, fog }
}

// The boat's roll (radians) and heave (fraction of the height) at time t.
function rock(t) {
  return {
    roll: 0.0095 * Math.sin(t * 0.41) + 0.004 * Math.sin(t * 0.73 + 1.1),
    heave: 0.0062 * Math.sin(t * 0.53 + 0.4) + 0.0024 * Math.sin(t * 0.97 + 2.0),
  }
}

// grade: mul rgb, add rgb, saturation, night (stars), lights
const GRADES = {
  dawn: [1.08, 1.02, 1.0, 0.03, 0.02, 0.02, 0.95, 0.35, 0.7],
  day: [1.3, 1.32, 1.24, 0.06, 0.08, 0.1, 0.85, 0.0, 0.25],
  dusk: [1.0, 1.0, 1.0, 0, 0, 0, 1.0, 0.6, 1.0],
  night: [0.6, 0.66, 0.85, 0.0, 0.0, 0.015, 0.85, 1.0, 1.25],
}
const GRADE_NAMES = ['uMul0', 'uMul1', 'uMul2', 'uAdd0', 'uAdd1', 'uAdd2', 'uSat', 'uNight', 'uLights']

const VS = 'attribute vec2 a;varying vec2 v;uniform vec2 uS;void main(){v=(a*vec2(0.5,-0.5))*uS+0.5;gl_Position=vec4(a,0.,1.);}'
const FS = `precision highp float;
varying vec2 v;
uniform sampler2D uImg, uMask, uBg, uLand;
uniform float uT, uAsp, uRoll, uHeave, uYaw, uFog, uMul0, uMul1, uMul2, uAdd0, uAdd1, uAdd2, uSat, uNight, uLights;
uniform vec3 uK, uShift; // per shore (town, headland, middle hill): apparent size, sideways shift
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<4;i++){ s+=a*vn(p); p*=2.03; a*=0.5; } return s; }
vec3 grade(vec3 c){
  float l = dot(c, vec3(0.3, 0.59, 0.11));
  c = mix(vec3(l), c, uSat);
  return c * vec3(uMul0, uMul1, uMul2) + vec3(uAdd0, uAdd1, uAdd2);
}
// screen -> picture position of a shore that recedes toward its anchor;
// beyond the picture's side edges the shore continues as a mirror image
vec2 shoreSrc(vec2 uv, vec2 anchor, float k, float sh){
  vec2 s = anchor + (uv - anchor - vec2(sh + uYaw, 0.0)) / k;
  s.x = s.x < 0.0 ? -s.x : (s.x > 1.0 ? 2.0 - s.x : s.x);
  return s;
}
void main(){
  vec2 uv = v;
  float t = uT;
  // ---- the boat: where does this pixel land on the rolling deck?
  vec2 piv = vec2(${PIVOT[0]}, ${PIVOT[1]});
  vec2 d = (uv - piv - vec2(0.0, uHeave)) * vec2(uAsp, 1.0);
  float cr = cos(-uRoll), sr = sin(-uRoll);
  d = vec2(d.x * cr - d.y * sr, d.x * sr + d.y * cr);
  vec2 duv = piv + d / vec2(uAsp, 1.0) / ${OVER};
  float deck = 1.0 - texture2D(uMask, duv).b;
  vec3 deckCol = texture2D(uImg, duv).rgb;
  float deckLight = texture2D(uMask, duv).a;
  // ---- the world beyond the rail (level horizon)
  vec4 m = texture2D(uMask, uv);
  float water = m.r;
  float H = ${HORIZON};
  float p = clamp((uv.y - H) / (1.0 - H), 0.0, 1.0);
  float z = 1.0 / (p + 0.04);
  float X = (uv.x - 0.5) * z, Z = z - t * ${SPEED}; // the water slides away from the stern
  vec2 wp = vec2(X * 9.0, Z * 2.2);
  float w1 = vn(wp + vec2(t * 0.15, 0.0)), w2 = vn(wp * 2.3 + vec2(-t * 0.25, t * 0.2));
  float wave = w1 * 0.65 + w2 * 0.35 - 0.5;
  vec2 off = vec2(wave * 0.0016, (vn(wp * 1.7 + vec2(3.0, 0.0)) - 0.5) * 0.0045) * (0.15 + p) * water;
  vec2 buv = uv + vec2(-uYaw, 0.0);
  vec3 base = texture2D(uBg, buv + off).rgb;
  vec3 col = base;
  float lightAmt = 0.0;
  float landA = 0.0;
  float vis = 1.0 - uFog;
  // shores: middle hill (farthest), headland, town (nearest)
  vec2 A0 = vec2(1.0, H), A1 = vec2(0.0, H), A2 = vec2(0.42, H);
  vec2 s2 = shoreSrc(uv, A2, uK.z, uShift.z);
  float a2 = texture2D(uLand, s2).b * vis;
  col = mix(col, texture2D(uImg, s2).rgb, a2); landA = max(landA, a2);
  vec2 s1 = shoreSrc(uv, A1, uK.y, uShift.y);
  float a1 = texture2D(uLand, s1).g * vis;
  col = mix(col, texture2D(uImg, s1).rgb, a1); landA = max(landA, a1);
  vec2 s0 = shoreSrc(uv, A0, uK.x, uShift.x);
  float a0 = texture2D(uLand, s0).r * vis;
  col = mix(col, texture2D(uImg, s0).rgb, a0); landA = max(landA, a0);
  lightAmt = mix(lightAmt, texture2D(uMask, s0).a, a0);
  // reflections of the shores in the water (stretched, broken by the waves)
  if (water > 0.01) {
    vec2 wob = vec2(off.x * 5.0 + (vn(vec2(X * 30.0, Z * 8.0)) - 0.5) * 0.004, 0.0);
    // town
    float shore0 = 0.354 + clamp((s0.x - 0.443) / 0.557, 0.0, 1.0) * 0.029;
    float dy0 = s0.y - shore0;
    if (dy0 > 0.0) {
      vec2 r = vec2(s0.x, shore0 - dy0 * 0.32) + wob / uK.x;
      float ra = texture2D(uLand, r).r * vis * (1.0 - smoothstep(0.0, 0.2, dy0));
      vec3 rc = texture2D(uImg, r).rgb;
      col = mix(col, rc * vec3(0.6, 0.66, 0.8) + base * 0.25, ra * 0.55 * water);
      float rl = texture2D(uMask, r).a * ra * water;
      col += rc * rl * 0.7; // lit windows stretch into long streaks
      lightAmt = max(lightAmt, rl * 0.9);
    }
    // headland
    float dy1 = s1.y - H;
    if (dy1 > 0.0) {
      vec2 r = vec2(s1.x, H - dy1 * 0.5) + wob / uK.y;
      float ra = texture2D(uLand, r).g * vis * (1.0 - smoothstep(0.0, 0.07, dy1));
      col = mix(col, texture2D(uImg, r).rgb * vec3(0.62, 0.68, 0.82) + base * 0.25, ra * 0.45 * water);
    }
  }
  // live foam wake: keeps the painted wake's shape, its foam texture streams
  // away from the stern (streaks run along the wake, broken lace between)
  vec3 painted = texture2D(uImg, uv + off * 0.5).rgb;
  float env = smoothstep(0.0, 0.1, dot(painted - base, vec3(0.33))) * smoothstep(0.01, 0.35, m.g) * water;
  if (env > 0.001) {
    float churn = smoothstep(0.6, 0.95, p);
    float streak = fbm(vec2(X * 16.0, Z * 0.9) + vec2(0.0, -t * 0.05));
    float cells = fbm(vec2(X * 9.0 + 3.0, Z * 2.6));
    float boil = fbm(vec2(X * 7.0 - 2.0, Z * 2.2 - t * 0.8) + vec2(t * 0.1, 0.0));
    float lace = smoothstep(0.38, 0.72, streak * 0.5 + cells * 0.5 + churn * (boil - 0.5) * 0.9);
    float a = env * (0.62 + 0.38 * lace);
    vec3 fcol = painted * (0.82 + 0.4 * lace) + vec3(0.04, 0.045, 0.06) * lace;
    col = mix(col, fcol, clamp(a, 0.0, 1.0));
  }
  // glints
  vec2 gid = floor(vec2(X * 60.0, Z * 18.0));
  float g = step(0.985, h21(gid)) * pow(max(0.0, sin(t * (1.5 + h21(gid + 2.0) * 2.0) + h21(gid) * 40.0)), 14.0);
  vec3 gcol = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.8, 0.5), smoothstep(0.0, 0.3, lightAmt));
  col += gcol * g * water * smoothstep(0.0, 0.25, p) * 0.35 * (0.5 + uNight * 0.5);
  // sea mist on the horizon (thick at the end of a crossing, then it clears)
  vec3 fogC = vec3(0.0);
  for (int i = 0; i < 5; i++) fogC += texture2D(uBg, vec2(buv.x + (float(i) - 2.0) * 0.07, H - 0.012)).rgb;
  fogC *= 0.21;
  float fz = exp(-abs(uv.y - H) / (0.03 + 0.09 * uFog)) * (0.12 + 0.88 * uFog);
  col = mix(col, fogC, clamp(fz, 0.0, 0.97));
  lightAmt *= vis;
  // town lights breathe and stay lit at night
  float lf = 0.9 + 0.1 * sin(t * 1.3 + uv.x * 90.0) * sin(t * 0.7 + uv.y * 60.0);
  vec3 lit = col * (lf + (uLights - 1.0) * 0.6);
  vec3 farC = mix(grade(col), lit * mix(1.0, 1.15, uNight), clamp(lightAmt * 1.4, 0.0, 1.0) * clamp(uLights, 0.0, 1.0));
  // stars in the open sky
  vec3 raw = texture2D(uBg, buv).rgb;
  float skyish = (1.0 - water) * (1.0 - landA) * smoothstep(0.32, 0.18, uv.y) * smoothstep(0.02, 0.12, raw.b - raw.r);
  vec2 sp = buv * vec2(uAsp, 1.0) * 160.0;
  vec2 cid = floor(sp), cf = fract(sp) - 0.5 - (vec2(h21(cid + 7.0), h21(cid + 9.0)) - 0.5) * 0.6;
  float st = step(1.0 - 0.012 * (0.3 + uNight), h21(cid)) * smoothstep(0.2, 0.04, length(cf));
  st *= 0.55 + 0.45 * sin(t * (1.0 + h21(cid + 4.0) * 2.0) + h21(cid + 3.0) * 30.0);
  farC += vec3(0.85, 0.9, 1.0) * st * skyish * (0.25 + 0.75 * uNight);
  // the deck (lamp glass stays bright)
  vec3 deckC = mix(grade(deckCol), deckCol * mix(1.0, 1.1, uNight), clamp(deckLight * 1.4, 0.0, 1.0) * clamp(uLights, 0.0, 1.0));
  vec3 outc = mix(farC, deckC, deck);
  vec2 q = v - 0.5; outc *= 1.0 - dot(q, q) * 0.5;
  gl_FragColor = vec4(outc, 1.0);
}`

const rnd = (a, b) => a + Math.random() * (b - a)
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const im = new Image()
    im.onload = () => resolve(im)
    im.onerror = () => reject(new Error(`ferry-at-blue-hour: ${src} failed to load`))
    im.src = src
  })
}

export function mount(container, ctx) {
  const glc = document.createElement('canvas')
  const fxc = document.createElement('canvas')
  for (const c of [glc, fxc]) c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;'
  container.replaceChildren(glc, fxc)
  const gl = glc.getContext('webgl', { antialias: false, alpha: false })
  if (!gl) throw new Error('ferry-at-blue-hour: WebGL is not available')
  const fx = fxc.getContext('2d')

  let tod = ctx.timeOfDay in GRADES ? ctx.timeOfDay : 'dusk'
  const G = GRADES[tod].slice()
  let GT = GRADES[tod]
  let W = 0, H = 0, DPR = 1, sx = 1, sy = 1
  let ready = false, stopped = false, frame = 0, last = 0, tNow = 0
  const hand = { x: -1e4, y: -1e4, inside: false, still: 99, moved: 0, vx: 0 }
  const gulls = []
  let boat = rock(0)
  const tStart = 40 + Math.random() * 120 // start a little into a crossing (past the mist)

  // ---- WebGL
  function sh(type, src) {
    const s = gl.createShader(type)
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`ferry-at-blue-hour: ${gl.getShaderInfoLog(s)}`)
    return s
  }
  const prog = gl.createProgram()
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS))
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS))
  gl.linkProgram(prog)
  gl.useProgram(prog)
  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  const aLoc = gl.getAttribLocation(prog, 'a')
  gl.enableVertexAttribArray(aLoc)
  gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0)
  const U = {}
  for (const n of ['uImg', 'uMask', 'uBg', 'uLand', 'uT', 'uAsp', 'uS', 'uRoll', 'uHeave', 'uYaw', 'uFog', 'uK', 'uShift', ...GRADE_NAMES]) U[n] = gl.getUniformLocation(prog, n)
  const textures = []
  function tex(im, unit) {
    const t = gl.createTexture()
    textures.push(t)
    gl.activeTexture(gl.TEXTURE0 + unit)
    gl.bindTexture(gl.TEXTURE_2D, t)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im)
  }

  // ---- layout: cover-fit the picture
  function layout() {
    DPR = Math.min(1.5, window.devicePixelRatio || 1)
    W = container.clientWidth || window.innerWidth
    H = container.clientHeight || window.innerHeight
    for (const c of [glc, fxc]) { c.width = Math.round(W * DPR); c.height = Math.round(H * DPR) }
    gl.viewport(0, 0, glc.width, glc.height)
    const ia = IW / IH, sa = W / H
    sx = sa > ia ? 1 : sa / ia
    sy = sa > ia ? ia / sa : 1
  }
  const toUV = (x, y) => [0.5 + (x / W - 0.5) * sx, 0.5 + (y / H - 0.5) * sy]
  const toScr = (u, v) => [((u - 0.5) / sx + 0.5) * W, ((v - 0.5) / sy + 0.5) * H]
  const pxScale = () => W / sx / IW

  // ---- gulls (u, v in picture space; size in picture px)
  function newGull(i, enter) {
    const dir = Math.random() < 0.5 ? 1 : -1
    return {
      u: enter ? (dir > 0 ? -0.06 : 1.06) : rnd(0.15, 0.9), v: rnd(0.07, 0.24), vu: dir * rnd(0.012, 0.02), vv: 0,
      size: rnd(46, 64), ph: rnd(0, 6.28), flap: 0, bank: 0, face: dir,
      cu: rnd(0.25, 0.85), cv: rnd(0.08, 0.22), cr: rnd(0.06, 0.14), ca: rnd(0, 6.28), cs: dir * rnd(0.05, 0.09),
      mode: 'wander', modeT: rnd(10, 30), id: i,
    }
  }
  function seedGulls() {
    gulls.length = 0
    for (let i = 0; i < 3; i++) gulls.push(newGull(i, false))
  }
  let companion = null
  const inSky = () => { const [, v] = toUV(hand.x, hand.y); return hand.inside && v < HORIZON - 0.02 }

  function stepGull(gu, dt) {
    let tu, tv, k = 0.55
    if (gu === companion) {
      const [hu, hv] = toUV(hand.x, hand.y)
      if (hand.still < 1.2) {
        const side = hand.vx >= 0 ? -1 : 1 // fly a little behind, beside the hand
        tu = hu + side * 0.055; tv = hv - 0.03 + Math.sin(tNow * 0.9 + gu.ph) * 0.012
        k = 1.4
      } else { // resting hand: slow circles round it
        gu.ca += dt * 0.7 * (gu.face || 1)
        tu = hu + Math.cos(gu.ca) * 0.075; tv = hv + Math.sin(gu.ca) * 0.035
        k = 1.0
      }
      tv = clamp(tv, 0.03, HORIZON - 0.04)
    } else if (gu.mode === 'leave') {
      tu = gu.face > 0 ? 1.15 : -0.15; tv = gu.v - 0.02
      k = 0.6
      if (gu.u > 1.1 || gu.u < -0.1) { Object.assign(gu, newGull(gu.id, true)); return }
    } else { // wander: lazy circles over the bay, drifting
      gu.ca += gu.cs * dt
      gu.cu += Math.sin(tNow * 0.03 + gu.id * 2) * 0.004 * dt
      tu = gu.cu + Math.cos(gu.ca) * gu.cr; tv = gu.cv + Math.sin(gu.ca) * gu.cr * 0.35
      gu.modeT -= dt
      if (gu.modeT < 0) { gu.mode = 'leave'; gu.face = Math.random() < 0.5 ? 1 : -1 }
    }
    // steering with a speed limit: glide, never jitter
    const au = (tu - gu.u) * k - gu.vu * 0.9, av = (tv - gu.v) * k - gu.vv * 0.9
    gu.vu += au * dt; gu.vv += av * dt
    const sp = Math.hypot(gu.vu, gu.vv), max = gu === companion ? 0.22 : 0.05
    if (sp > max) { gu.vu *= max / sp; gu.vv *= max / sp }
    gu.u += gu.vu * dt; gu.v += gu.vv * dt
    if (Math.abs(gu.vu) > 0.004) gu.face += ((gu.vu > 0 ? 1 : -1) - gu.face) * Math.min(1, dt * 2.5)
    gu.bank += (clamp(-av * 6, -0.5, 0.5) - gu.bank) * Math.min(1, dt * 2)
    // flaps: climbing, speeding up, or now and then
    const want = av < -0.02 || sp > max * 0.8 ? 1 : 0
    gu.flap = Math.max(gu.flap - dt * 0.6, want ? 1 : gu.flap)
    if (Math.random() < dt * 0.04) gu.flap = 1
    gu.ph += dt * (gu.flap > 0.05 ? 7.5 : 1.2)
  }

  function drawGull(gu) {
    const [x, y] = toScr(gu.u, gu.v)
    const s = gu.size * pxScale() * 0.6
    const night = G[7]
    const beat = gu.flap > 0.05 ? Math.sin(gu.ph) * Math.min(1, gu.flap * 2) : Math.sin(gu.ph) * 0.12
    const f = clamp(gu.face, -1, 1)
    const c = (r, g, b, a) => `rgba(${Math.round(r * (1 - night * 0.3))},${Math.round(g * (1 - night * 0.3))},${Math.round(b * (1 - night * 0.22))},${a})`
    fx.save()
    fx.translate(x, y)
    fx.rotate(gu.bank * 0.4)
    // wings: an "M" seen from slightly below; each wing = shoulder, elbow, tip
    for (const side of [-1, 1]) {
      const near = side * f >= 0 ? 1 : 0.86
      const span = s * (0.62 + 0.38 * Math.abs(f)) * near
      const elbowY = -s * (0.18 + beat * 0.42)
      const tipY = elbowY * 0.6 + s * (0.04 - beat * 0.5)
      const ex = side * span * 0.48, tx = side * span * 1.08
      fx.fillStyle = near < 1 ? c(140, 150, 170, 0.92) : c(170, 180, 198, 0.96)
      fx.beginPath()
      fx.moveTo(side * s * 0.06, -s * 0.02)
      fx.quadraticCurveTo(ex * 0.6, elbowY - s * 0.1, ex, elbowY)
      fx.quadraticCurveTo(ex + (tx - ex) * 0.5, elbowY + (tipY - elbowY) * 0.3 - s * 0.04, tx, tipY)
      fx.quadraticCurveTo(ex + (tx - ex) * 0.4, elbowY + s * 0.14, ex * 0.9, elbowY + s * 0.12)
      fx.quadraticCurveTo(ex * 0.5, elbowY + s * 0.12, side * s * 0.06, s * 0.08)
      fx.closePath(); fx.fill()
      fx.fillStyle = c(40, 44, 54, 0.95)
      fx.beginPath()
      fx.moveTo(tx, tipY)
      fx.lineTo(tx - side * span * 0.24, tipY + (elbowY - tipY) * 0.2 - s * 0.02)
      fx.lineTo(tx - side * span * 0.2, tipY + (elbowY - tipY) * 0.25 + s * 0.07)
      fx.closePath(); fx.fill()
    }
    // body + head, pointing the way it flies
    fx.scale(f >= 0 ? 1 : -1, 1)
    const bl = 0.15 + 0.85 * Math.abs(f)
    fx.fillStyle = c(232, 236, 244, 0.97)
    fx.beginPath(); fx.ellipse(0, s * 0.03, s * (0.1 + 0.26 * bl), s * 0.1, 0, 0, 7); fx.fill()
    fx.beginPath(); fx.arc(s * 0.33 * bl, -s * 0.01, s * 0.085, 0, 7); fx.fill()
    fx.fillStyle = c(232, 186, 80, 0.9)
    fx.beginPath(); fx.moveTo(s * (0.33 * bl + 0.07), -s * 0.025); fx.lineTo(s * (0.33 * bl + 0.07 + 0.12 * bl), 0); fx.lineTo(s * (0.33 * bl + 0.07), s * 0.025); fx.fill()
    fx.restore()
  }

  // a point on the deck (picture uv) -> where the rolling deck shows it now
  function onDeck(u, v) {
    const a = IW / IH
    let dx = (u - PIVOT[0]) * OVER * a, dy = (v - PIVOT[1]) * OVER
    const c = Math.cos(boat.roll), s = Math.sin(boat.roll)
    ;[dx, dy] = [dx * c - dy * s, dx * s + dy * c]
    return toScr(PIVOT[0] + dx / a, PIVOT[1] + dy + boat.heave)
  }
  function drawLamp() {
    const [x, y] = onDeck(LAMP[0], LAMP[1])
    const ps = pxScale()
    const fl = 0.9 + 0.06 * Math.sin(tNow * 9.1) * Math.sin(tNow * 3.7) + 0.04 * Math.sin(tNow * 23.0 + Math.sin(tNow * 2.1) * 3)
    const k = (0.55 + 0.45 * G[8]) * fl
    fx.globalCompositeOperation = 'lighter'
    let g = fx.createRadialGradient(x, y, 0, x, y, 70 * ps)
    g.addColorStop(0, `rgba(255,200,120,${0.38 * k})`)
    g.addColorStop(1, 'rgba(255,170,90,0)')
    fx.fillStyle = g
    fx.beginPath(); fx.arc(x, y, 70 * ps, 0, 7); fx.fill()
    // warm pool on the rail, bench and deck (sways a touch with the flame)
    const px = x + Math.sin(tNow * 1.3) * 3 * ps, py = y + 260 * ps
    g = fx.createRadialGradient(px, py, 0, px, py, 380 * ps)
    g.addColorStop(0, `rgba(255,170,90,${0.12 * k})`)
    g.addColorStop(1, 'rgba(255,150,80,0)')
    fx.fillStyle = g
    fx.save(); fx.translate(px, py); fx.scale(1.5, 0.75); fx.translate(-px, -py)
    fx.beginPath(); fx.arc(px, py, 380 * ps, 0, 7); fx.fill()
    fx.restore()
    fx.globalCompositeOperation = 'source-over'
  }

  function draw(dt) {
    for (let i = 0; i < G.length; i++) G[i] += (GT[i] - G[i]) * Math.min(1, dt * 1.2)
    hand.still += dt
    hand.moved = Math.max(0, hand.moved - dt)
    gl.uniform1i(U.uImg, 0); gl.uniform1i(U.uMask, 1); gl.uniform1i(U.uBg, 2); gl.uniform1i(U.uLand, 3)
    const tr = travel(ctx.reducedMotion ? STILL_T : tStart + tNow)
    gl.uniform3f(U.uK, ...tr.k); gl.uniform3f(U.uShift, ...tr.shift)
    gl.uniform1f(U.uYaw, tr.yaw); gl.uniform1f(U.uFog, tr.fog)
    boat = rock(tNow)
    gl.uniform1f(U.uRoll, boat.roll); gl.uniform1f(U.uHeave, boat.heave)
    gl.uniform1f(U.uT, tNow); gl.uniform1f(U.uAsp, IW / IH); gl.uniform2f(U.uS, sx, sy)
    GRADE_NAMES.forEach((n, i) => gl.uniform1f(U[n], G[i]))
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    fx.setTransform(1, 0, 0, 1, 0, 0)
    fx.clearRect(0, 0, fxc.width, fxc.height)
    fx.setTransform(DPR, 0, 0, DPR, 0, 0)
    drawLamp()
    // companion: the nearest gull comes when the hand moves in the sky
    if (companion && (!inSky() || hand.still > 9)) { companion.mode = 'leave'; companion.face = companion.u > 0.5 ? 1 : -1; companion = null }
    if (!companion && inSky() && hand.moved > 0) {
      const [hu, hv] = toUV(hand.x, hand.y)
      let best = null, bd = 1e9
      for (const gu of gulls) { const d = Math.hypot(gu.u - hu, gu.v - hv); if (d < bd) { bd = d; best = gu } }
      if (best) { companion = best; best.mode = 'follow' }
    }
    if (dt > 0) for (const gu of gulls) stepGull(gu, dt)
    if (tod !== 'night' || G[7] < 0.95) for (const gu of gulls) drawGull(gu)
    else for (const gu of gulls) if (gu === companion) drawGull(gu)
  }

  function loop(now) {
    if (stopped) return
    frame = requestAnimationFrame(loop)
    if (now - last < 1000 / FPS - 2) return
    const dt = Math.min((now - last) / 1000, 0.1)
    last = now
    tNow += dt
    draw(dt)
  }

  function onPointer(e) {
    const d = Math.hypot(e.x - hand.x, e.y - hand.y)
    if (hand.inside && d > 1) hand.vx = hand.vx * 0.7 + (e.x - hand.x) * 0.3
    hand.x = e.x
    hand.y = e.y
    hand.inside = true
    if (d > 2) { hand.still = 0; hand.moved = 1.5 }
    if (e.type === 'down') {
      hand.moved = 1.5
      const g = companion
      if (g) { g.flap = 1.6; g.vv -= 0.12 }
    }
  }

  const offPointer = ctx.onPointer?.(onPointer)
  const offClock = ctx.subscribe?.(({ timeOfDay }) => {
    if (!(timeOfDay in GRADES)) return
    tod = timeOfDay
    GT = GRADES[tod]
    if (ctx.reducedMotion && ready) { for (let i = 0; i < G.length; i++) G[i] = GT[i]; draw(0) }
  })
  let rz = 0
  const onResize = () => { clearTimeout(rz); rz = setTimeout(() => { if (!ready) return; layout(); draw(0) }, 150) }
  window.addEventListener('resize', onResize)

  Promise.all([loadImage(photoUrl), loadImage(maskUrl), loadImage(bgUrl), loadImage(landUrl)]).then(([img, mimg, bimg, limg]) => {
    if (stopped) return
    tex(img, 0); tex(mimg, 1); tex(bimg, 2); tex(limg, 3)
    layout()
    seedGulls()
    ready = true
    tNow = 6
    draw(0)
    if (!ctx.reducedMotion) { last = performance.now(); frame = requestAnimationFrame(loop) }
    requestAnimationFrame(() => requestAnimationFrame(() => ctx.ready()))
  })

  return {
    unmount() {
      stopped = true
      cancelAnimationFrame(frame)
      clearTimeout(rz)
      window.removeEventListener('resize', onResize)
      offPointer?.()
      offClock?.()
      for (const t of textures) gl.deleteTexture(t)
      gl.deleteBuffer(buf)
      gl.deleteProgram(prog)
      container.replaceChildren()
    },
  }
}
