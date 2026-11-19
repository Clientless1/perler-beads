import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { preprocess } = require('@dcloudio/uni-cli-shared/lib/preprocess')
const { initScopedPreContext } = require('@dcloudio/uni-cli-shared/dist/preprocess/context')

const source = preprocess(readFileSync(new URL('../src/utils/canvas.js', import.meta.url), 'utf8'), initScopedPreContext('h5').preVueContext, { type: 'js' })
const { getCanvasNode } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)

test('H5 direct renderer canvas survives framework backing-size resets and is reused', async () => {
  const previous = globalThis.document
  let appended = 0, direct
  const managed = { tagName: 'CANVAS', width: 333, height: 333 }
  const wrapper = {
    tagName: 'UNI-CANVAS',
    querySelector: selector => selector === 'canvas[data-direct-2d]' ? direct : managed,
    appendChild: child => { direct = child; appended++ },
  }
  const root = { matches: () => false, querySelector: () => wrapper }
  globalThis.document = {
    querySelector: () => wrapper,
    createElement: () => ({ tagName: 'CANVAS', style: {}, setAttribute(name, value) { this[name] = value } }),
  }
  try {
    const canvas = await getCanvasNode('#patternCanvas', { proxy: { $el: root } })
    assert.notEqual(canvas, managed)
    canvas.width = canvas.height = 1332
    managed.width = managed.height = 333
    assert.equal(await getCanvasNode('#patternCanvas', { proxy: { $el: root } }), canvas)
    assert.equal(canvas.width, 1332)
    assert.equal(appended, 1)
    assert.equal(canvas.style.pointerEvents, 'none', 'movable-view must keep receiving gestures')
    globalThis.document.querySelector = () => managed
    assert.equal(await getCanvasNode('#native'), managed)
  } finally { globalThis.document = previous }
})
