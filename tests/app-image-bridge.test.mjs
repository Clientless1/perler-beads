import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { preprocess } = require('@dcloudio/uni-cli-shared/lib/preprocess')
const { initScopedPreContext } = require('@dcloudio/uni-cli-shared/dist/preprocess/context')
async function load(entry, platform = 'app') {
  const result = await build({ entryPoints: [new URL('../' + entry, import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'node', plugins: [{ name: 'uni-platform', setup(api) { api.onLoad({ filter: /\.js$/ }, args => ({ contents: preprocess(readFileSync(args.path, 'utf8'), initScopedPreContext(platform).preVueContext, { type: 'js' }), loader: 'js' })) } }] })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
}
const bridge = await load('src/utils/app/bridge.js')
test('App service without Array.at still routes and restores the correct page host', async () => {
  const originalAt = Array.prototype.at, originalPages = globalThis.getCurrentPages
  let current = 1
  const sent = []
  let pending
  try {
    Array.prototype.at = undefined
    globalThis.getCurrentPages = () => [{ $page: { id: current } }]
    bridge.connectAppHost('old-service-a', task => sent.push(task))
    current = 2
    bridge.connectAppHost('old-service-b', () => {})
    current = 1
    assert.equal(bridge.appHost(), 'old-service-a')
    bridge.disconnectAppHost('old-service-b')
    pending = bridge.appRequest('pixels')
    bridge.settleAppReply({ id: sent[0].id, result: [255, 0, 0, 255] })
    bridge.disconnectAppHost('old-service-a')
  } finally {
    Array.prototype.at = originalAt
    if (originalPages) globalThis.getCurrentPages = originalPages
    else delete globalThis.getCurrentPages
  }
  assert.deepEqual(await pending, [255, 0, 0, 255])
})
test('App bridge scopes tasks to their page and rejects late replies, cancellation, and closed pages', async () => {
  const a = [], b = [], progress = []
  bridge.connectAppHost('a', task => a.push(task))
  const first = bridge.appRequest('safeImage', { path: 'file://photo' }, { onProgress: text => progress.push(text) })
  bridge.connectAppHost('b', task => b.push(task))
  const second = bridge.appRequest('safePattern')
  assert.equal(a.length, 1); assert.equal(b.length, 1)
  bridge.appProgress({ id: a[0].id, progress: 'checking' }); assert.deepEqual(progress, ['checking'])
  bridge.settleAppReply({ id: a[0].id, result: { checked: true } }); assert.equal((await first).checked, true)
  bridge.disconnectAppHost('b'); await assert.rejects(second, { name: 'AbortError' })
  bridge.settleAppReply({ id: b[0].id, result: { checked: true } })
  let cancelled = false
  const pending = bridge.appRequest('safeImage', {}, { isCancelled: () => cancelled })
  cancelled = true
  await assert.rejects(pending, { safetyCode: 'cancelled' })
  assert.equal(a.at(-1).type, 'cancel')
  bridge.disconnectAppHost('a')
  await assert.rejects(bridge.appRequest('safeImage'), /尚未就绪/)
})
test('official App condition compilation uses async image tasks and keeps DOM out of the service path', async () => {
  for (const [file, token] of [['src/utils/contentSafety.js', "appRequest('safeImage'"], ['src/utils/imageProcessor.js', "appRequest('process'"], ['src/subject/inference.js', "appRequest('subject'"], ['src/utils/canvas.js', 'createAppCanvas']]) {
    const source = preprocess(readFileSync(new URL('../' + file, import.meta.url), 'utf8'), initScopedPreContext('app').preVueContext, { type: 'js' })
    assert.ok(source.includes(token), file)
    assert.ok(!/document\.|new Image\(|new Worker\(/.test(source), file)
  }
})
