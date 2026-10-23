// A calm still shown if a scene fails: a soft night-blue gradient with the
// title. Never blank, never white, no motion.
export function showFallback(container, title = 'Elsewhere, Within') {
  container.replaceChildren()
  const el = document.createElement('div')
  el.style.cssText =
    'position:absolute;inset:0;display:grid;place-items:center;' +
    'background:radial-gradient(ellipse at 50% 60%,#1d3a4f 0%,#0f2434 55%,#0b1a24 100%);' +
    'color:rgba(220,235,245,.55);font:300 clamp(18px,2.4vw,34px) Georgia,serif;letter-spacing:.12em;'
  el.textContent = title
  container.appendChild(el)
  container.style.opacity = '1'
}