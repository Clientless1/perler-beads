import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { Worker } from 'node:worker_threads'
import { build } from 'esbuild'

const root = new URL('../', import.meta.url).pathname
const bundled = await build({ entryPoints: [root + 'src/utils/safety/wechatWorker.js'], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' })
const { loadWechatWorker } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`)
const base64Bundle = await build({ entryPoints: [root + 'src/utils/safety/base64.js'], bundle: true, write: false, format: 'esm', logLevel: 'silent' })
const { encodeBase64, decodeBase64 } = await import(`data:text/javascript;base64,${Buffer.from(base64Bundle.outputFiles[0].text).toString('base64')}`)
const entry = (await build({ entryPoints: [root + 'src/utils/safety/wechatWorkerEntry.js'], bundle: true, write: false, format: 'iife', target: 'es2018', logLevel: 'silent' })).outputFiles[0].text
const info = JSON.parse(readFileSync(root + 'src/data/safety-model.json'))
const model = Buffer.concat(info.parts.map(part => gunzipSync(readFileSync(root + 'src' + part.path))))
const rgb = { type: 'float32', shape: [1, 3, 224, 224], data: new Float32Array(224 * 224 * 3).fill(1).buffer }

// Execute the actual bundled WeChat entry in a separate JS thread. Only the
// WeChat message transport and package-path WASM loader are adapted for Node.
function runtime({ wasm = true } = {}) {
  const live = new Set(), modes = [], backends = []
  const api = {
    getSystemInfoSync: () => ({ platform: 'android' }),
    createWorker(path, options) {
      assert.equal(path, 'safetyWorkers/index.js'); modes.push(options)
      const instance = new Worker(`
        const { parentPort } = require('node:worker_threads');
        const { readFileSync } = require('node:fs');
        globalThis.worker = { onMessage: cb => parentPort.on('message', cb), postMessage: value => parentPort.postMessage(value) };
        ${wasm ? `globalThis.WXWebAssembly = { instantiate: path => { if (path !== '/static/safety/convolutions.wasm') throw Error('invalid package path'); return WebAssembly.instantiate(readFileSync(${JSON.stringify(root + 'src/static/safety/convolutions.wasm')})) } };` : ''}
        ${entry}
      `, { eval: true })
      live.add(instance)
      return {
        postMessage: value => instance.postMessage(value),
        onMessage: callback => instance.on('message', value => { if (value.backend) backends.push(value.backend); callback(value) }),
        onError: callback => instance.on('error', callback),
        onProcessKilled: () => {},
        terminate: () => { live.delete(instance); return instance.terminate() },
      }
    },
  }
  return { api, modes, backends, live, dispose: async () => { await Promise.all([...live].map(worker => worker.terminate())); live.clear() } }
}

test('real worker reconstructs chunked model, runs WASM/CPU equivalently and releases resources', async () => {
  let expected
  for (const wasm of [true, false]) {
    const runtimeApi = runtime({ wasm })
    let session
    try {
      session = await loadWechatWorker(runtimeApi.api, model.toString('base64'))
      let ticks = 0
      const interval = setInterval(() => ticks++, 1)
      let result
      try { result = await session.run({ rgb }) } finally { clearInterval(interval) }
      assert.ok(ticks > 0, 'the page thread must remain available during inference')
      assert.deepEqual(result.probabilities.shape, [1, 5])
      const scores = Array.from(result.probabilities.data)
      assert.ok(scores.every(Number.isFinite))
      if (expected) assert.deepEqual(scores, expected)
      else expected = scores
      assert.deepEqual(runtimeApi.backends, [wasm ? 'wasm' : 'cpu'])
      session.destroy(); session.destroy()
      assert.equal(runtimeApi.live.size, 0)
      await assert.rejects(session.run({ rgb }), { safetyCode: 'cancelled' })
    } finally { session?.destroy(); await runtimeApi.dispose() }
  }
})

test('worker cancels active inference, terminates once and permits a new selection', async () => {
  const runtimeApi = runtime()
  let session
  try {
    session = await loadWechatWorker(runtimeApi.api, model.toString('base64'))
    let cancelled = false
    const pending = session.run({ rgb }, { isCancelled: () => cancelled, onProgress: () => { cancelled = true } })
    await assert.rejects(pending, { safetyCode: 'cancelled' })
    assert.equal(runtimeApi.live.size, 0)
    session = await loadWechatWorker(runtimeApi.api, model.toString('base64'))
    await session.run({ rgb })
  } finally { session?.destroy(); await runtimeApi.dispose() }
})

function transport(behavior = () => {}) {
  const state = { terminated: 0, sent: [] }
  const worker = {
    onMessage: cb => { state.reply = cb }, onError: cb => { state.error = cb }, onProcessKilled: cb => { state.killed = cb },
    postMessage: value => { state.sent.push(value); behavior(value, state) },
    terminate: () => { state.terminated++ },
  }
  return { state, api: { getSystemInfoSync: () => ({ platform: 'devtools' }), createWorker: () => worker } }
}
const flush = async () => { for (let i = 0; i < 150; i++) await Promise.resolve() }
const encodedModel = model.toString('base64')

test('base64 transport preserves bytes at padding and model chunk boundaries', () => {
  for (const size of [0, 1, 2, 3, 12287, 12288, 12289, 768 * 1024 + 1]) {
    const bytes = Uint8Array.from({ length: size }, (_, i) => i * 37 % 256)
    const encoded = encodeBase64(bytes.buffer)
    assert.equal(encoded, Buffer.from(bytes).toString('base64'))
    assert.deepEqual(decodeBase64(encoded), bytes)
  }
  for (const value of [null, 'abc', '!!!!', 'ab=c', '====', 'AA😀']) assert.throws(() => decodeBase64(value))
})

test('missing experimental worker falls back to regular worker without losing the model', async () => {
  const f = transport((request, state) => queueMicrotask(() => state.reply({ id: request.id })))
  const regular = f.api.createWorker, options = []
  f.api.createWorker = (path, experimental) => { options.push(experimental); return experimental ? undefined : regular(path) }
  const session = await loadWechatWorker(f.api, encodedModel)
  session.destroy()
  assert.deepEqual(options, [{ useExperimentalWorker: true }, undefined])
  assert.equal(f.state.terminated, 1)
})

test('cancel during model transport frees the worker and clears load cancellation callback', async t => {
  const f = transport(), registered = []
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
  const pending = loadWechatWorker(f.api, encodedModel, cancel => registered.push(cancel))
  await flush(); registered[0]()
  await assert.rejects(pending, { safetyCode: 'cancelled' })
  assert.equal(f.state.terminated, 1)
  assert.equal(registered.at(-1), null)
})

test('worker timeout and process death reject outstanding work and do not hang the next load', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
  for (const cause of ['timeout', 'killed', 'error']) {
    const f = transport()
    const pending = loadWechatWorker(f.api, encodedModel)
    await flush()
    if (cause === 'timeout') t.mock.timers.tick(30000)
    else f.state[cause]()
    await assert.rejects(pending, { safetyCode: cause === 'timeout' ? 'timeout' : 'unavailable' })
    assert.equal(f.state.terminated, 1)
  }
})

test('short model and malformed worker output cannot pass as checked content', async () => {
  const f = transport((request, state) => queueMicrotask(() => state.reply({ id: request.id, ...(request.type === 'run' ? { probabilities: { type: 'float32', shape: [1, 5], data: [1] } } : {}) })))
  await assert.rejects(loadWechatWorker(f.api, 'AAAA'), { safetyCode: 'resources' })
  const session = await loadWechatWorker(f.api, encodedModel)
  try { await assert.rejects(session.run({ rgb }), { safetyCode: 'unavailable' }) }
  finally { session.destroy() }
})
