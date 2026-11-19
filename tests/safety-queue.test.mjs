import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { preprocess } = require('@dcloudio/uni-cli-shared/lib/preprocess')
const { initScopedPreContext } = require('@dcloudio/uni-cli-shared/dist/preprocess/context')

// Use the real queue, content validation and cache; only decoding, canvas I/O
// and inference are controlled so a genuinely stalled device task is testable.
const bundled = await build({
  entryPoints: [new URL('../src/utils/contentSafety.js', import.meta.url).pathname],
  bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent',
  plugins: [{ name: 'queue-device-io', setup(api) {
    api.onLoad({ filter: /contentSafety\.js$/ }, args => ({ contents: preprocess(readFileSync(args.path, 'utf8'), initScopedPreContext('mp-weixin').preVueContext, { type: 'js' }), loader: 'js' }))
    api.onResolve({ filter: /safety\/detector$|\/imageSource$|\/templates$/ }, args => ({ path: args.path, namespace: 'device' }))
    api.onLoad({ filter: /.*/, namespace: 'device' }, args => {
      if (args.path.endsWith('/templates')) return { contents: 'export const resolvePackagedTemplate = () => null' }
      if (args.path.endsWith('/detector')) return { contents: `
        const state = globalThis.__safetyQueue;
        export function createSafetyDetector() {
          let disposed = false;
          return {
            dispose() { if (!disposed) state.destroyed++; disposed = true },
            async check(pixels, width, height, options) {
              if (disposed || options.isCancelled()) throw Object.assign(new Error('cancelled'), { safetyCode: 'cancelled' });
              state.checks.push({ width, height });
              await state.inferences.shift();
              if (disposed || options.isCancelled()) throw Object.assign(new Error('cancelled'), { safetyCode: 'cancelled' });
            },
          };
        }` }
      return { contents: `
        const state = globalThis.__safetyQueue;
        export const createImageCanvas = (width = 2, height = 2) => ({ width, height, getContext: () => ({
          fillRect() {}, drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(width * height * 4) }),
        }) });
        export const createImageSourceLoader = () => ({
          load(path) { state.loads.push(path); return state.decodes.get(path) || Promise.resolve(createImageCanvas()) },
          clear() { state.cleared++ },
        });` }
    })
  } }],
})
let sequence = 0
async function fixture(t) {
  const state = { destroyed: 0, cleared: 0, checks: [], loads: [], decodes: new Map(), inferences: [] }
  globalThis.__safetyQueue = state
  const api = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}#${++sequence}`)
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
  return { state, api }
}
const flush = async () => { for (let i = 0; i < 24; i++) await Promise.resolve() }
function deferred() { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
function observe(promise) { const result = {}; promise.then(() => { result.status = 'pass' }, error => { result.status = error.safetyCode }); return result }

test('cancelling a stalled decode releases the next photo and ignores the late decode', async t => {
  const { state, api } = await fixture(t), decode = deferred()
  state.decodes.set('slow', decode.promise)
  let cancelled = false
  const pending = api.assertSafeImage('slow', { isCancelled: () => cancelled }), result = observe(pending)
  await flush(); assert.deepEqual(state.loads, ['slow'])
  cancelled = true; t.mock.timers.tick(100); await flush()
  assert.equal(result.status, 'cancelled')
  await assert.rejects(pending, { safetyCode: 'cancelled' })
  await api.assertSafeImage('next')
  assert.equal(state.checks.length, 1)
  decode.resolve({ width: 2, height: 2 }); await flush()
  assert.equal(state.checks.length, 1, 'late image must not reach canvas or inference')
  assert.equal(state.cleared, 2)
})

test('the full check deadline includes decoding and a timed-out task cannot block retry', async t => {
  const { state, api } = await fixture(t)
  state.decodes.set('stalled', new Promise(() => {}))
  const pending = api.assertSafeImage('stalled'), result = observe(pending)
  await flush(); t.mock.timers.tick(60000); await flush()
  assert.equal(result.status, 'timeout')
  await assert.rejects(pending, { safetyCode: 'timeout' })
  await api.assertSafeImage('retry')
  assert.deepEqual(state.loads, ['stalled', 'retry'])
  assert.equal(state.checks.length, 1)
})

test('cancelling a queued request settles promptly without interrupting another active check', async t => {
  const { state, api } = await fixture(t), inference = deferred()
  state.inferences.push(inference.promise)
  const first = api.assertSafeImage('first')
  await flush(); assert.equal(state.checks.length, 1)
  let cancelled = false
  const queued = api.assertSafeImage('cancelled', { isCancelled: () => cancelled }), result = observe(queued)
  cancelled = true; t.mock.timers.tick(100); await flush()
  assert.equal(result.status, 'cancelled')
  await assert.rejects(queued, { safetyCode: 'cancelled' })
  assert.equal(state.destroyed, 0)
  inference.resolve(); await first
  await api.assertSafeImage('third')
  assert.deepEqual(state.loads, ['first', 'third'])
  assert.equal(state.checks.length, 2)
})

test('stored approval flags and template IDs cannot approve changed cells in the memory cache', async t => {
  const { state, api } = await fixture(t)
  const entry = { templateId: 'fake', safetyPassed: true, pattern: [[{ hex: '#ffffff' }, null], [null, { hex: '#000000' }]] }
  assert.equal(api.isPatternApproved(entry), false)
  await api.assertSafePattern(entry); await api.assertSafePattern(entry)
  assert.equal(api.isPatternApproved(entry), true)
  assert.equal(state.checks.length, 1, 'unchanged actual content may reuse its in-memory decision')
  entry.pattern[0][0].hex = '#ff0000'
  assert.equal(api.isPatternApproved(entry), false)
  await api.assertSafePattern(entry)
  assert.equal(state.checks.length, 2, 'changing the image invalidates approval regardless of saved flags')
})

test('a short editing pause retains the model, and the idle deadline still releases it', async t => {
  const { state, api } = await fixture(t)
  await api.assertSafeImage('first')
  t.mock.timers.tick(20000); await flush()
  assert.equal(state.destroyed, 0, 'editing longer than 15 seconds must not reload the model')
  await api.assertSafeImage('next')
  t.mock.timers.tick(119999); await flush(); assert.equal(state.destroyed, 0)
  t.mock.timers.tick(1); await flush(); assert.equal(state.destroyed, 1)
})
