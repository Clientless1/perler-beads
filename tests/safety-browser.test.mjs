import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'

const bundled = await build({
  entryPoints: [new URL('../src/utils/safety/browser.js', import.meta.url).pathname],
  bundle: true, write: false, format: 'iife', globalName: 'browserSafety', logLevel: 'silent',
  define: { 'import.meta.env.BASE_URL': '"/"', 'import.meta.url': '"https://example.test/assets/safety.js"' },
})
function fixture() {
  const state = { requests: [], terminated: 0 }
  const context = { URL, location: { href: 'https://example.test/' }, setTimeout, clearTimeout,
    Worker: class {
      constructor() { state.worker = this }
      postMessage(value) { state.requests.push(value) }
      terminate() { state.terminated++ }
    },
  }
  runInNewContext(bundled.outputFiles[0].text, context)
  state.reply = data => state.worker.onmessage({ data })
  return { state, api: context.browserSafety }
}

test('browser resource progress cannot complete loading or inference before the worker result', async () => {
  const { state, api } = fixture(), progress = []
  let ready = false
  const pending = api.loadBrowserSafety(() => {}, message => progress.push(message)).then(session => { ready = true; return session })
  const load = state.requests[0]
  state.reply({ id: load.id, progress: '正在下载检测资源…' })
  await Promise.resolve()
  assert.equal(ready, false)
  assert.deepEqual(progress, ['正在下载检测资源…'])
  state.reply({ id: load.id })
  const session = await pending
  const running = session.run({ rgb: { data: new ArrayBuffer(4) } })
  const request = state.requests.at(-1)
  state.reply({ id: request.id, probabilities: { shape: [1, 5] } })
  assert.deepEqual((await running).probabilities.shape, [1, 5])
  session.destroy(); session.destroy()
  assert.equal(state.terminated, 1)
  await assert.rejects(session.run({ rgb: {} }), { safetyCode: 'cancelled' })
})

test('slow browser resources retain a bounded deadline and cancellation releases the worker', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { state, api } = fixture()
  const pending = api.loadBrowserSafety(() => {})
  const rejected = assert.rejects(pending, { safetyCode: 'timeout' })
  t.mock.timers.tick(30000)
  assert.equal(state.terminated, 0, 'first-time download has a longer budget than inference')
  t.mock.timers.tick(25000)
  await rejected
  assert.equal(state.terminated, 1)
  const next = fixture(); let cancel
  const cancelled = next.api.loadBrowserSafety(value => { if (value) cancel = value })
  cancel()
  await assert.rejects(cancelled, { safetyCode: 'cancelled' })
  assert.equal(next.state.terminated, 1)
})
