import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // The screensaver has its own build (screensaver/vite.config.js); its DLLs
  // are locked while it runs, which would crash this dev server's watcher.
  server: { watch: { ignored: ['**/screensaver/**'] } },
})
