import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { build } from 'esbuild'
import * as ort from 'onnxruntime-web/wasm'

const root = new URL('../', import.meta.url).pathname
async function bundle(contents) {
  const built = await build({ stdin: { contents, resolveDir: root }, bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' })
  return import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`)
}
const { createCpuSafetySession } = await bundle("export { createCpuSafetySession } from './src/utils/safety/cpu.js'")
const { createConvolutionKernel } = await bundle("export { createConvolutionKernel } from './src/utils/safety/wasm.js'")
const source = readFileSync(root + 'src/utils/safety/detector.js', 'utf8')
  .replace(/\/\/ #ifdef H5[\s\S]*?\/\/ #endif/g, '')
  .replace(/\/\/ #ifndef MP-WEIXIN[\s\S]*?\/\/ #endif/g, '')
  .replaceAll("from './", "from './src/utils/safety/")
const { createSafetyDetector } = await bundle(source)
const info = JSON.parse(readFileSync(root + 'src/data/safety-model.json'))
const buffer = Buffer.concat(info.parts.map(part => gunzipSync(readFileSync(root + 'src' + part.path))))
const binary = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
const input = data => ({ rgb: { type: 'float32', shape: [1, 3, 224, 224], data: data.buffer } })

test('compatibility CPU runs every pinned-model layer and agrees with ONNX Runtime on varied inputs', async () => {
  ort.env.wasm.numThreads = 1
  const reference = await ort.InferenceSession.create(buffer, { executionProviders: ['wasm'] })
  const cpu = createCpuSafetySession(binary)
  const native = await WebAssembly.instantiate(readFileSync(root + 'src/static/safety/convolutions.wasm'))
  const accelerated = createCpuSafetySession(binary, { convolution: createConvolutionKernel(native.instance.exports) })
  try {
    for (const kind of ['white', 'gradient', 'seeded-noise']) {
      let seed = 16571
      const data = Float32Array.from({ length: 224 * 224 * 3 }, (_, i) => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
        return kind === 'white' ? 1 : kind === 'gradient' ? (i * 37 % 255) / 255 : seed / 2 ** 32
      })
      let ticks = 0
      const interval = setInterval(() => ticks++, 1)
      let actual
      try { actual = await cpu.run(input(data)) } finally { clearInterval(interval) }
      const expected = await reference.run({ rgb: new ort.Tensor('float32', data, [1, 3, 224, 224]) })
      const fast = await accelerated.run(input(data), { background: true })
      assert.deepEqual(actual.probabilities.shape, [1, 5])
      assert.ok(ticks > 0, 'large convolutions must yield to cancellation and page interaction')
      for (let i = 0; i < 5; i++) assert.ok(Math.abs(actual.probabilities.data[i] - expected.probabilities.data[i]) < 1e-5, `${kind}: class ${i}`)
      for (let i = 0; i < 5; i++) assert.equal(fast.probabilities.data[i], actual.probabilities.data[i], `${kind}: accelerated class ${i}`)
    }
  } finally { cpu.destroy(); accelerated.destroy(); await reference.release() }
})

test('CPU checks use the current cancellation callback, permit retry and release a destroyed model', async () => {
  const cpu = createCpuSafetySession(binary), data = new Float32Array(224 * 224 * 3).fill(1)
  let cancelled = false
  try {
    await cpu.run(input(data), { isCancelled: () => cancelled })
    cancelled = true
    await assert.rejects(cpu.run(input(data), { isCancelled: () => cancelled }), { safetyCode: 'cancelled' })
    await cpu.run(input(data), { isCancelled: () => false })
    let runningCancelled = false
    const pending = cpu.run(input(data), { isCancelled: () => runningCancelled, onProgress: () => { runningCancelled = true } })
    await assert.rejects(pending, { safetyCode: 'cancelled' })
  } finally { cpu.destroy() }
  await assert.rejects(cpu.run(input(data)), { safetyCode: 'cancelled' })
  assert.throws(() => createCpuSafetySession(binary.slice(0, 512)))
})

test('WeChat devtools, missing AI APIs and native load/run failures execute the real model locally', async () => {
  const previous = globalThis.wx
  try {
    for (const mode of ['devtools', 'missing', 'load-failed', 'run-failed']) {
      let nativeCalls = 0, reads = 0, destroyed = 0
      globalThis.wx = {
        env: { USER_DATA_PATH: 'wxfile://local' },
        getSystemInfoSync: () => ({ platform: mode === 'devtools' ? 'devtools' : 'android' }),
        getFileSystemManager: () => ({
          getFileInfo: options => options.success({ size: info.bytes, digest: info.md5 }),
          readFile: options => { reads++; options.success({ data: binary }) },
        }),
        ...(mode === 'missing' ? {} : { createInferenceSession: () => {
          nativeCalls++
          return {
            onError: callback => { if (mode === 'load-failed') queueMicrotask(callback) },
            onLoad: callback => { if (mode !== 'load-failed') queueMicrotask(callback) },
            run: async () => { throw new Error('native operator unsupported') },
            destroy: () => { destroyed++ },
          }
        } }),
      }
      const detector = createSafetyDetector(), progress = []
      try {
        await detector.check(new Uint8ClampedArray(16).fill(255), 2, 2, { onProgress: value => progress.push(value) })
        assert.equal(reads, 1, `${mode}: compatibility model must actually be read`)
        assert.ok(progress.some(value => value.includes('兼容检测')))
        assert.ok(progress.some(value => /正在本机检测…\d+%/.test(value)))
        assert.equal(nativeCalls, ['devtools', 'missing'].includes(mode) ? 0 : 1)
        if (nativeCalls) assert.equal(destroyed, 1)
      } finally { detector.dispose() }
    }
    globalThis.wx.getFileSystemManager = () => ({
      getFileInfo: options => options.success({ size: info.bytes, digest: info.md5 }),
      readFile: options => options.success({ data: new ArrayBuffer(4) }),
    })
    const detector = createSafetyDetector()
    try { await assert.rejects(detector.check(new Uint8ClampedArray(16).fill(255), 2, 2), { safetyCode: 'resources' }) }
    finally { detector.dispose() }
  } finally { globalThis.wx = previous }
})
