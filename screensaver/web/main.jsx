import { createRoot } from 'react-dom/client'
import '../../src/index.css'
import './screensaver.css'
import ScreensaverApp from './ScreensaverApp.jsx'
import { exitOnInput, notifyHost } from './host.js'

exitOnInput()
window.addEventListener('error', (e) => notifyHost(`page error: ${e.message}`))

createRoot(document.getElementById('root')).render(<ScreensaverApp />)
