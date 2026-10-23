import { test } from 'node:test'
import assert from 'node:assert/strict'
import { describeContextFailure } from './webglFailure.js'

test('a fresh canvas that works points at a canvas conflict', () => {
  const text = describeContextFailure({ statusMessage: '', freshCanvasWorks: true })
  assert.match(text, /^canvas conflict/)
  assert.match(text, /browser gave no reason/)
})

test('a fresh canvas that fails points at the browser, with its own reason', () => {
  const text = describeContextFailure({ statusMessage: 'Web page caused context loss and was blocked', freshCanvasWorks: false })
  assert.match(text, /^WebGL unavailable in this browser session/)
  assert.match(text, /"Web page caused context loss and was blocked"/)
  assert.match(text, /edge:\/\/restart/)
})

test('an unknown browser reason is passed through without a guessed hint', () => {
  const text = describeContextFailure({ statusMessage: 'something new', freshCanvasWorks: false })
  assert.match(text, /"something new"$/)
})
