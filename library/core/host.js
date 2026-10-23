// Messages to and from the C# screensaver host (WebView2). Outside the host,
// for example in a normal browser, they do nothing.

export function notifyHost(message) {
  window.chrome?.webview?.postMessage(message)
}

export function inHost() {
  return Boolean(window.chrome?.webview)
}

// Calls handler(text) for each message the host sends. Returns a stop function.
export function onHostMessage(handler) {
  const webview = window.chrome?.webview
  if (!webview) return () => {}
  const listener = (e) => handler(typeof e.data === 'string' ? e.data : '')
  webview.addEventListener('message', listener)
  return () => webview.removeEventListener('message', listener)
}
