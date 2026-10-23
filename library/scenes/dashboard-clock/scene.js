// A large, quiet clock over slowly drifting colour. Local time and date only.
// With reducedMotion nothing moves: no drift, no fades, and the clock simply
// steps to its new spot. Nothing flashes.

const PALETTES = {
  dawn: { bg: '#2a2438', a: '#e9907a', b: '#f2c9a0', c: '#7a6fa8', text: '#fff4ea' },
  day: { bg: '#16384f', a: '#4f9bbd', b: '#9fd3d8', c: '#e8d9a8', text: '#f4fbff' },
  dusk: { bg: '#241d3b', a: '#c0597a', b: '#f09a6b', c: '#5a4a9a', text: '#fff0e6' },
  night: { bg: '#08121c', a: '#1b3a5c', b: '#27506b', c: '#2c2a5a', text: '#cfe0ee' },
}

const SHIFT_EVERY_MS = 4 * 60 * 1000 // move the clock a little, so nothing burns in
const SHIFT_RANGE = { x: 9, y: 8 } // percent of the screen, either way

const css = `
.dc { position:absolute; inset:0; overflow:hidden; background:var(--bg); transition:background-color 20s linear; font-family:"Segoe UI Light","Segoe UI",system-ui,sans-serif; }
.dc-blob { position:absolute; width:90vmax; height:90vmax; border-radius:50%; opacity:.55; will-change:transform; transition:background 20s linear; }
.dc-blob.a { left:-25vmax; top:-30vmax; background:radial-gradient(circle,var(--a) 0%,transparent 62%); animation:dc-a 110s ease-in-out infinite alternate; }
.dc-blob.b { right:-30vmax; bottom:-35vmax; background:radial-gradient(circle,var(--b) 0%,transparent 62%); opacity:.38; animation:dc-b 140s ease-in-out infinite alternate; }
.dc-blob.c { left:20vw; top:25vh; width:70vmax; height:70vmax; background:radial-gradient(circle,var(--c) 0%,transparent 62%); opacity:.35; animation:dc-c 170s ease-in-out infinite alternate; }
@keyframes dc-a { to { transform:translate(22vmax,14vmax) scale(1.12); } }
@keyframes dc-b { to { transform:translate(-20vmax,-12vmax) scale(1.08); } }
@keyframes dc-c { to { transform:translate(-16vmax,10vmax) scale(.92); } }
.dc-face { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%) translate(var(--dx,0%),var(--dy,0%)); text-align:center; color:var(--text); transition:transform 6s ease-in-out, color 20s linear; white-space:nowrap; }
.dc-time { font-size:clamp(72px,22vmin,300px); font-weight:200; letter-spacing:.02em; line-height:1.15; }
.dc-date { margin-top:3.4vmin; font-size:clamp(18px,3.4vmin,46px); font-weight:300; letter-spacing:.18em; text-transform:uppercase; opacity:.7; }
.dc.still, .dc.still * { animation:none !important; transition:none !important; }
`

export function mount(container, ctx) {
  const style = document.createElement('style')
  style.textContent = css
  const root = document.createElement('div')
  root.className = 'dc' + (ctx.reducedMotion ? ' still' : '')
  root.innerHTML =
    '<div class="dc-blob a"></div><div class="dc-blob b"></div><div class="dc-blob c"></div>' +
    '<div class="dc-face"><div class="dc-time"></div><div class="dc-date"></div></div>'
  container.replaceChildren(style, root)

  const face = root.querySelector('.dc-face')
  const timeEl = root.querySelector('.dc-time')
  const dateEl = root.querySelector('.dc-date')
  const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
  const dateFormat = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' })

  const paint = () => {
    const p = PALETTES[ctx.timeOfDay] || PALETTES.night
    root.style.setProperty('--bg', p.bg)
    root.style.setProperty('--a', p.a)
    root.style.setProperty('--b', p.b)
    root.style.setProperty('--c', p.c)
    root.style.setProperty('--text', p.text)
  }
  const tick = () => {
    const now = new Date()
    const t = timeFormat.format(now)
    if (timeEl.textContent !== t) timeEl.textContent = t
    const d = dateFormat.format(now)
    if (dateEl.textContent !== d) dateEl.textContent = d
  }
  const shift = () => {
    const r = (range) => ((Math.random() * 2 - 1) * range).toFixed(1) + '%'
    face.style.setProperty('--dx', r(SHIFT_RANGE.x))
    face.style.setProperty('--dy', r(SHIFT_RANGE.y))
  }

  paint()
  tick()
  const unsubscribe = ctx.subscribe?.(paint)
  const tickTimer = setInterval(tick, 1000)
  const shiftTimer = setInterval(shift, SHIFT_EVERY_MS)
  // Visible after the first frame has painted.
  requestAnimationFrame(() => requestAnimationFrame(() => ctx.ready()))

  return {
    unmount() {
      clearInterval(tickTimer)
      clearInterval(shiftTimer)
      unsubscribe?.()
      container.replaceChildren()
    },
  }
}