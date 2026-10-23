// Builds the screensaver page (screensaver/web) into screensaver/out/site.
// The website's own build (vite.config.js at the project root) is separate.
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const here = (path) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  root: here('./web'),
  publicDir: here('../public'),
  plugins: [react()],
  build: {
    outDir: here('./out/site'),
    emptyOutDir: true,
  },
})
