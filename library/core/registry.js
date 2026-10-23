// The scene registry: every library/scenes/<id>/meta.js, and the scene.js
// next to it loaded on demand.
import { DEFAULT_SCENE } from './default.js'
export { DEFAULT_SCENE }
export const CATEGORIES = ['cozy-spaces', 'dreamscapes', 'anime-illustrated', 'pixel-retro', 'seasons', 'dashboard']

const metas = import.meta.glob('../scenes/*/meta.js', { eager: true, import: 'default' })
const loaders = import.meta.glob('../scenes/*/scene.js')

export function buildRegistry(metaModules, loaderModules) {
  const scenes = {}
  for (const [path, meta] of Object.entries(metaModules)) {
    const dir = path.replace(/\/meta\.js$/, '')
    const load = loaderModules[`${dir}/scene.js`]
    if (meta && meta.id && load) scenes[meta.id] = { meta, load }
  }
  return scenes
}

// Unknown, missing or empty ids fall back to the default scene.
export function resolveSceneId(id, scenes, fallback = DEFAULT_SCENE) {
  return id && Object.prototype.hasOwnProperty.call(scenes, id) ? id : fallback
}

export const scenes = buildRegistry(metas, loaders)