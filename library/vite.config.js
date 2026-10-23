// Builds the scene library (library/) into screensaver/out/site, the folder
// the C# host serves. The website's and the old screensaver page's configs are separate.
import { existsSync, readdirSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { defineConfig } from 'vite'
import { DEFAULT_SCENE } from './core/default.js'

const here = (path) => fileURLToPath(new URL(path, import.meta.url))

// Writes site/scenes.json ({ default, scenes: [{ id, title }] }) from each
// scene's meta.js. screensaver\build.ps1 makes one .scr per entry, and the .scr
// finds its scene by its own file name, "Elsewhere - <title>.scr".
function scenesJson() {
  return {
    name: 'scenes-json',
    async generateBundle() {
      const dir = here('./scenes')
      const scenes = []
      for (const id of readdirSync(dir).sort()) {
        const meta = `${dir}/${id}/meta.js`
        if (!existsSync(meta) || !existsSync(`${dir}/${id}/scene.js`)) continue
        const { title } = (await import(pathToFileURL(meta).href)).default
        if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`scene id "${id}" must be lowercase letters, digits and dashes`)
        if (!title || /["\\/:*?<>|]/.test(title)) throw new Error(`scene "${id}": title "${title}" cannot be used in a file name`)
        scenes.push({ id, title })
      }
      if (!scenes.some((s) => s.id === DEFAULT_SCENE)) throw new Error(`default scene "${DEFAULT_SCENE}" not found`)
      this.emitFile({ type: 'asset', fileName: 'scenes.json', source: JSON.stringify({ default: DEFAULT_SCENE, scenes }, null, 2) + '\n' })
    },
  }
}

export default defineConfig({
  root: here('.'),
  base: './',
  publicDir: false,
  plugins: [scenesJson()],
  build: {
    outDir: here('../screensaver/out/site'),
    emptyOutDir: true,
  },
  test: {
    include: ['tests/**/*.spec.js'],
  },
})