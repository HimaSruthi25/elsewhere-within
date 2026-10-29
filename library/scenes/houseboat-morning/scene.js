// Houseboat Morning — a houseboat kitchen at misty dawn on a quiet backwater.
// Picture (AI illustration, 1920×1080) + live code layers:
//   WebGL: water ripples and glints, rippling water-light on the thatched ceiling,
//   palms swaying, mist drifting over the water, time-of-day grade (dawn/day/dusk/night,
//   stars and a brighter lamp at night).
//   2D: steam from the clay pot, the oil lamp's flame glow, a heron gliding past now and then.
// Live wallpaper: move your hand over the water in the window: rings spread where you touch
// and the reflected light on the ceiling shivers and brightens above that spot.
// With reducedMotion one still frame is drawn (redrawn when the time of day changes).

import imgUrl from './houseboat-morning.jpg'
import maskUrl from './houseboat-morning-mask.png'
import treesUrl from './houseboat-morning-trees.png'

const IW = 1920, IH = 1080
const LAMP = [1401, 378], POT = [492, 640]
const GRADE = {
  dawn: { mul: [1, 1, 1], add: [0, 0, 0], night: 0, warm: 0 },
  day: { mul: [1.04, 1.05, 1.03], add: [0.02, 0.025, 0.03], night: 0, warm: 0 },
  dusk: { mul: [1.1, 0.93, 0.8], add: [0.03, 0.0, -0.01], night: 0, warm: 0.4 },
  night: { mul: [0.26, 0.31, 0.46], add: [0, 0.005, 0.02], night: 1, warm: 1 },
}
const lerp = (a, b, t) => a + (b - a) * t
const rnd = (a, b) => a + Math.random() * (b - a)

const VS = 'attribute vec2 a;varying vec2 v;void main(){v=vec2(a.x*0.5+0.5,0.5-a.y*0.5);gl_Position=vec4(a,0.,1.);}'
const FS = `precision highp float;
varying vec2 v;
uniform sampler2D uImg, uMask, uTrees;
uniform vec2 uRes; uniform vec3 uCov; // scale, offX, offY (CSS px)
uniform float uT, uStir, uStirX, uNight, uWarm;
uniform vec3 uMul, uAdd;
uniform vec4 uRip[6];
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<4;i++){s+=a*vn(p);p=p*2.03+vec2(17.1,9.3);a*=.5;}return s;}
float caus(vec2 p,float t){vec2 q=p;float c=0.;for(int i=0;i<3;i++){float fi=float(i);q+=0.6*vec2(sin(q.y*1.21+t*0.55+fi*1.3),sin(q.x*1.07-t*0.47+fi*2.1));c+=abs(sin(q.x*0.9+q.y*0.4));}return pow(clamp(1.-c/3.,0.,1.),3.);}
// small wind waves on the backwater, seen in perspective (smaller and denser toward the far bank)
float wave(vec2 ip,float t){
  float dz=clamp((ip.y-548.)/265.,0.,1.);
  float z=1./(dz+0.06);
  vec2 w=vec2((ip.x-960.)*z/900., z*0.9);
  float h=0.;
  h+=sin(dot(w,vec2(0.20,1.00))*9.0 -t*1.6)*0.55;
  h+=sin(dot(w,vec2(-0.55,0.83))*13.0-t*2.1)*0.35;
  h+=sin(dot(w,vec2(0.70,0.71))*17.0-t*2.6)*0.25;
  h+=sin(dot(w,vec2(-0.15,0.99))*29.0-t*3.4)*0.14;
  h+=(vn(w*vec2(6.,3.)+vec2(t*0.25,-t*0.6))-0.5)*0.5;
  return h;
}
void main(){
  vec2 sp=v*uRes;
  vec2 ip=(sp-uCov.yz)/uCov.x;            // picture px
  vec2 uv=ip/vec2(${IW}.0,${IH}.0);
  vec3 m=texture2D(uMask,uv).rgb;         // r water, g ceiling, b window
  float tr=texture2D(uTrees,uv).r;
  // palms sway (more at the top)
  vec2 off=vec2(sin(uT*0.9+ip.y*0.012+ip.x*0.004)*2.2+sin(uT*2.3+ip.x*0.02)*0.6, 0.)*tr;
  // water: slow swell + rings from the hand
  float w=m.r;
  float dz=clamp((ip.y-548.)/265.,0.,1.);
  float h0=0.,hx=0.,hy=0.;
  if(w>0.01){ h0=wave(ip,uT); hx=wave(ip+vec2(1.5,0.),uT)-h0; hy=wave(ip+vec2(0.,1.5),uT)-h0; }
  vec2 wd=vec2(hx,hy)*(1.0+dz*9.0)*smoothstep(0.,0.2,dz);
  float ring=0.;
  for(int i=0;i<6;i++){
    vec4 r=uRip[i]; float age=uT-r.z; if(r.w<=0.||age<0.||age>4.) continue;
    vec2 d=(ip-r.xy)*vec2(1.,2.6); float L=length(d); float R=age*150.;
    float k=exp(-pow((L-R)/22.,2.))*r.w*(1.-age/4.);
    wd+=normalize(d+1e-3)*k*7.; ring+=k;
  }
  vec2 suv=(ip+off+wd*w)/vec2(${IW}.0,${IH}.0);
  vec3 col=texture2D(uImg,suv).rgb;
  // glints on the water
  float gl=smoothstep(0.955,1.0,vn(ip*vec2(0.05,0.22)+vec2(uT*0.5,uT*0.15)))*smoothstep(0.4,0.9,vn(ip*0.01+vec2(uT*0.05,0.)))*w;
  col+=vec3(1.,0.93,0.82)*(gl*0.55+ring*0.3*w)*(1.-uNight*0.6);
  // wave faces: tilted toward the sky catch light, the backs fall darker
  float tilt=clamp(-hy*(1.5+dz*2.5),-1.,1.)*smoothstep(0.,0.35,dz);
  col*=1.+w*tilt*0.22;
  col+=w*vec3(0.85,0.92,1.)*max(0.,tilt)*0.10*(1.-uNight*0.7);
  // water light on the ceiling: brighter near the window opening, stirred by the hand
  float near=(0.35+0.65*smoothstep(0.,300.,ip.y))*exp(-pow((ip.x-1050.)/800.,2.));
  float stirK=uStir*exp(-pow((ip.x-uStirX)/260.,2.));
  float cs=caus(ip*vec2(0.018,0.045)+vec2(0.,uT*0.1),uT*(0.9+stirK*3.0));
  float cl=m.g*cs*near*(0.85+stirK*2.6);
  col+=(col*1.7+vec3(0.05,0.06,0.05))*vec3(0.95,1.0,0.92)*cl*(1.-uNight*0.75);
  // mist drifting over the water and the far bank
  float band=smoothstep(380.,520.,ip.y)*(1.-smoothstep(640.,760.,ip.y));
  float fog=fbm(ip*vec2(0.004,0.012)+vec2(uT*0.025,0.))*band*m.b;
  col=mix(col,vec3(0.86,0.92,0.95)*(1.-uNight*0.7),clamp(fog*0.55,0.,0.6));
  // time of day
  col=col*uMul+uAdd;
  // night: stars in the open sky, warm lamp light inside
  float skyM=m.b*(1.-smoothstep(330.,520.,ip.y))*clamp(1.-tr*2.,0.,1.);
  float st=step(0.9975,h21(floor(ip/2.)))*(0.6+0.4*sin(uT*2.+h21(floor(ip/2.)+3.)*40.));
  col+=vec3(st)*skyM*uNight*0.9;
  float ld=length((ip-vec2(${LAMP[0]}.0,${LAMP[1]}.0))*vec2(1.,1.15));
  col+=vec3(1.,0.62,0.3)*uWarm*(0.35*exp(-ld*ld/(240.*240.))+0.2*exp(-ld*ld/(900.*900.)))*(1.-m.b*0.85);
  // soft vignette
  vec2 q=v-0.5; col*=1.-dot(q,q)*0.55;
  gl_FragColor=vec4(col,1.);
}`

export function mount(container, ctx) {
  const assets = { img: imgUrl, mask: maskUrl, trees: treesUrl }
  const glc = document.createElement('canvas'), ov = document.createElement('canvas')
  for (const c of [glc, ov]) c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;'
  container.replaceChildren(glc, ov)
  const gl = glc.getContext('webgl', { antialias: false, alpha: false })
  if (!gl) throw new Error('houseboat-morning: WebGL is not available')
  const oc = ov.getContext('2d')
  const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o }
  const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.bindAttribLocation(pr, 0, 'a'); gl.linkProgram(pr)
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr))
  gl.useProgram(pr)
  const U = {}; for (const n of ['uImg', 'uMask', 'uTrees', 'uRes', 'uCov', 'uT', 'uStir', 'uStirX', 'uNight', 'uWarm', 'uMul', 'uAdd', 'uRip']) U[n] = gl.getUniformLocation(pr, n)
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  function tex(img, unit) {
    const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
    for (const [p, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, p, v)
    return t
  }

  let W = 0, H = 0, DPR = 1, cov = { s: 1, x: 0, y: 0 }, T = 0, stir = 0, stirX = 1050, ready = false
  const rips = new Float32Array(24); let ripI = 0
  const L = structuredClone(GRADE[ctx.timeOfDay] || GRADE.dawn); let target = GRADE[ctx.timeOfDay] || GRADE.dawn
  const easeLight = (k) => { for (let i = 0; i < 3; i++) { L.mul[i] = lerp(L.mul[i], target.mul[i], k); L.add[i] = lerp(L.add[i], target.add[i], k) } L.night = lerp(L.night, target.night, k); L.warm = lerp(L.warm, target.warm, k) }
  let waterMask = null
  const steam = [], heron = { on: false, t: rnd(12, 25) }
  let steamT = 0, lastRip = 0

  function layout() {
    W = container.clientWidth || innerWidth; H = container.clientHeight || innerHeight; DPR = Math.min(2, devicePixelRatio || 1)
    glc.width = ov.width = Math.round(W * DPR); glc.height = ov.height = Math.round(H * DPR)
    const s = Math.max(W / IW, H / IH); cov = { s, x: (W - IW * s) / 2, y: (H - IH * s) / 2 }
  }
  const toImg = (x, y) => [(x - cov.x) / cov.s, (y - cov.y) / cov.s]
  const isWater = (ix, iy) => { if (!waterMask || ix < 0 || iy < 0 || ix >= IW || iy >= IH) return 0; return waterMask[((iy / 2) | 0) * 960 + ((ix / 2) | 0)] / 255 }

  function step(dt) {
    T += dt
    stir = Math.max(0, stir - dt * 0.45)
    // steam puffs from the clay pot
    steamT -= dt
    if (steamT <= 0) { steamT = rnd(0.25, 0.45); steam.push({ x: POT[0] + rnd(-30, 30), y: POT[1] + rnd(-6, 6), r: rnd(14, 22), a: 0, life: 0, max: rnd(4.5, 6.5), vx: rnd(-14, -4), vy: rnd(-34, -24), ph: rnd(0, 6) }) }
    for (const p of steam) { p.life += dt; p.x += (p.vx + Math.sin(T * 0.8 + p.ph) * 8) * dt; p.y += p.vy * dt; p.r += 9 * dt }
    while (steam.length && steam[0].life > steam[0].max) steam.shift()
    // heron crossing the window now and then
    if (!heron.on) { heron.t -= dt; if (heron.t <= 0) Object.assign(heron, { on: true, u: 0, dir: Math.random() < 0.5 ? 1 : -1, y0: rnd(250, 340), dur: rnd(16, 22) }) }
    else { heron.u += dt / heron.dur; if (heron.u >= 1) { heron.on = false; heron.t = rnd(35, 70) } }
  }
  function render() {
    if (!ready) return
    gl.viewport(0, 0, glc.width, glc.height)
    gl.uniform2f(U.uRes, W, H); gl.uniform3f(U.uCov, cov.s, cov.x, cov.y)
    gl.uniform1f(U.uT, T); gl.uniform1f(U.uStir, Math.min(1.2, stir)); gl.uniform1f(U.uStirX, stirX)
    gl.uniform1f(U.uNight, L.night); gl.uniform1f(U.uWarm, L.warm); gl.uniform3fv(U.uMul, L.mul); gl.uniform3fv(U.uAdd, L.add)
    gl.uniform4fv(U.uRip, rips)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    // 2D layers
    oc.setTransform(DPR * cov.s, 0, 0, DPR * cov.s, DPR * cov.x, DPR * cov.y)
    oc.clearRect(-cov.x / cov.s, -cov.y / cov.s, W / cov.s, H / cov.s)
    const dim = 1 - L.night * 0.55
    for (const p of steam) {
      const k = p.life / p.max, a = Math.sin(Math.PI * Math.min(1, k * 1.2)) * 0.16 * dim
      const g = oc.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r)
      g.addColorStop(0, `rgba(240,236,228,${a})`); g.addColorStop(1, 'rgba(240,236,228,0)')
      oc.fillStyle = g; oc.beginPath(); oc.arc(p.x, p.y, p.r, 0, 7); oc.fill()
    }
    // lamp flame glow
    const fl = 0.85 + 0.1 * Math.sin(T * 8.3) + 0.06 * Math.sin(T * 13.7 + 1) + 0.04 * Math.sin(T * 21)
    oc.globalCompositeOperation = 'lighter'
    const lr = 46 + 24 * L.warm
    const lg = oc.createRadialGradient(LAMP[0], LAMP[1], 0, LAMP[0], LAMP[1], lr)
    lg.addColorStop(0, `rgba(255,200,120,${(0.22 + 0.2 * L.warm) * fl})`); lg.addColorStop(1, 'rgba(255,170,90,0)')
    oc.fillStyle = lg; oc.beginPath(); oc.arc(LAMP[0], LAMP[1], lr, 0, 7); oc.fill()
    oc.globalCompositeOperation = 'source-over'
    // heron (soft silhouette, far away)
    if (heron.on) {
      const u = heron.u, x = heron.dir > 0 ? lerp(600, 1560, u) : lerp(1560, 600, u), y = heron.y0 + Math.sin(u * 6) * 6 - u * 30
      const fa = Math.sin(T * 3.2) * 0.9, sc = 1.1
      oc.save(); oc.translate(x, y); oc.scale(heron.dir * sc, sc)
      oc.globalAlpha = 0.55 * Math.min(1, u * 8, (1 - u) * 8) * (1 - L.night * 0.8)
      oc.fillStyle = '#5d6a70'; oc.strokeStyle = '#5d6a70'; oc.lineCap = 'round'
      oc.beginPath(); oc.ellipse(0, 0, 9, 2.6, 0, 0, 7); oc.fill()
      oc.lineWidth = 1.6; oc.beginPath(); oc.moveTo(8, -1); oc.quadraticCurveTo(13, -4, 15, -2); oc.stroke()
      oc.lineWidth = 1; oc.beginPath(); oc.moveTo(-8, 0); oc.lineTo(-17, 1.5); oc.stroke()
      oc.beginPath(); oc.moveTo(-3, -1); oc.quadraticCurveTo(0, -14 * fa, 7, -18 * fa); oc.lineTo(3, -1); oc.fill()
      oc.restore(); oc.globalAlpha = 1
    }
  }

  function onPointer(e) {
    if (ctx.reducedMotion || !W || e.type === 'up') return
    const [ix, iy] = toImg(e.x, e.y)
    const w = isWater(ix, iy)
    if (w < 0.3) return
    const now = T
    if (e.type === 'down' || now - lastRip > 0.14) {
      lastRip = now
      rips.set([ix, iy, T, e.type === 'down' ? 1.6 : 0.8], ripI * 4); ripI = (ripI + 1) % 6
    }
    stir = Math.min(1.4, stir + (e.type === 'down' ? 0.8 : 0.12))
    stirX = lerp(stirX, ix, 0.35)
  }

  let raf = 0, last = performance.now(), stopped = false
  function loop(t) { if (stopped) return; raf = requestAnimationFrame(loop); const dt = Math.min(0.05, (t - last) / 1000); last = t; easeLight(Math.min(1, dt / 20)); step(dt); render() }
  const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src })
  Promise.all([load(assets.img), load(assets.mask), load(assets.trees)]).then(([img, mask, trees]) => {
    if (stopped) return
    tex(img, 0); tex(mask, 1); tex(trees, 2)
    gl.uniform1i(U.uImg, 0); gl.uniform1i(U.uMask, 1); gl.uniform1i(U.uTrees, 2)
    const c = document.createElement('canvas'); c.width = 960; c.height = 540; const cx = c.getContext('2d'); cx.drawImage(mask, 0, 0)
    const d = cx.getImageData(0, 0, 960, 540).data; waterMask = new Uint8Array(960 * 540); for (let i = 0; i < waterMask.length; i++) waterMask[i] = d[i * 4]
    ready = true; layout()
    if (ctx.reducedMotion) { step(0.016); render() } else raf = requestAnimationFrame(loop)
    requestAnimationFrame(() => requestAnimationFrame(() => ctx.ready()))
  }).catch((err) => { console.error(err); ctx.ready() })
  layout()
  const offClock = ctx.subscribe?.(({ timeOfDay }) => { target = GRADE[timeOfDay] || GRADE.dawn; if (ctx.reducedMotion) { easeLight(1); render() } })
  const offPointer = ctx.onPointer?.(onPointer)
  let rz = 0
  const onResize = () => { clearTimeout(rz); rz = setTimeout(() => { layout(); render() }, 150) }
  addEventListener('resize', onResize)
  return { unmount() { stopped = true; cancelAnimationFrame(raf); clearTimeout(rz); removeEventListener('resize', onResize); offPointer?.(); offClock?.(); gl.getExtension('WEBGL_lose_context')?.loseContext(); container.replaceChildren() } }
}
