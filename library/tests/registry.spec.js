import { describe, expect, it } from 'vitest'
import { CATEGORIES, DEFAULT_SCENE, buildRegistry, resolveSceneId, scenes } from '../core/registry.js'

describe('scene registry', () => {
  it('finds the dashboard clock and every scene has valid meta', () => {
    expect(scenes[DEFAULT_SCENE]).toBeTruthy()
    for (const [id, { meta, load }] of Object.entries(scenes)) {
      expect(meta.id).toBe(id)
      expect(CATEGORIES).toContain(meta.category)
      expect(meta.title && meta.mood && meta.credits).toBeTruthy()
      expect(meta.title).toMatch(/^[^"\\/:*?<>|]+$/) // becomes "Elsewhere - <title>.scr"
      expect(id).toMatch(/^[a-z0-9-]+$/)
      expect(typeof load).toBe('function')
    }
  })
  it('falls back to the default for unknown, empty or missing ids', () => {
    for (const bad of ['nope', '', null, undefined, '__proto__', 'toString']) {
      expect(resolveSceneId(bad, scenes)).toBe(DEFAULT_SCENE)
    }
  })
  it('defaults to the rainy window', () => {
    expect(DEFAULT_SCENE).toBe('rainy-window')
  })
  it('keeps a known id', () => {
    expect(resolveSceneId('dashboard-clock', scenes)).toBe('dashboard-clock')
  })
  it('skips a scene folder with no scene.js', () => {
    const built = buildRegistry({ '../scenes/x/meta.js': { id: 'x' } }, {})
    expect(built).toEqual({})
  })
})
