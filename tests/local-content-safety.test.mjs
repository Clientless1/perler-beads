import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'

async function load(path) {
  const result = await build({ entryPoints: [new URL(`../src/utils/safety/${path}`, import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
}
const { assertSafeScores, safetyError, prepareSafetyTensor, safetyCrops } = await load('policy.js')
const { prepareSafetyModel, readSafetyModel, loadSafetySession } = await load('wechat.js')
const nativeSource = readFileSync(new URL('../src/utils/safety/detector.js', import.meta.url), 'utf8')
  .replace(/\/\/ #ifdef H5[\s\S]*?\/\/ #endif/g, '')
  .replace(/\/\/ #ifndef MP-WEIXIN[\s\S]*?\/\/ #endif/g, '')
const nativeBundle = await build({ stdin: { contents: nativeSource, resolveDir: new URL('../src/utils/safety/', import.meta.url).pathname }, bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' })
const { createSafetyDetector } = await import(`data:text/javascript;base64,${Buffer.from(nativeBundle.outputFiles[0].text).toString('base64')}`)
const info = JSON.parse(readFileSync(new URL('../src/data/safety-model.json', import.meta.url)))
const tensor = scores => ({ type: 'float32', shape: [1, 5], data: new Float32Array(scores) })

test('local policy blocks explicit, illustrated explicit and combined risks without exposing categories', () => {
  for (const scores of [[.01,.01,.01,.96,.01], [.01,.96,.01,.01,.01], [.25,.21,.28,.21,.05], [.1,.01,.1,.01,.78]]) {
    assert.throws(() => assertSafeScores(tensor(scores)), error => error.safetyCode === 'blocked' && error.message === '内容含违规信息')
  }
  for (const scores of [[.01,.01,.96,.01,.01], [.96,.01,.01,.01,.01]]) assert.doesNotThrow(() => assertSafeScores(tensor(scores)))
})

test('missing, malformed, non-probability and NaN results never count as a safe decision', () => {
  const valid = tensor([.01,.01,.96,.01,.01])
  for (const result of [null, {}, { ...valid, type: 'int32' }, { ...valid, shape: [5] }, { ...valid, shape: [1, 6] }, { ...valid, data: [] }, tensor([0,0,0,0,0]), tensor([0,0,NaN,0,0]), tensor([0,0,Infinity,0,0]), tensor([-.1,0,1.1,0,0]), { ...valid, data: new ArrayBuffer(24) }]) {
    assert.throws(() => assertSafeScores(result), error => error.safetyCode === 'unavailable')
  }
  assert.doesNotThrow(() => assertSafeScores({ ...valid, data: valid.data.buffer }))
})

test('native bridge buffers and float32 scores from another realm are accepted without bypassing risk checks', async () => {
  const makeScores = (values, buffer = false) => runInNewContext(`new Float32Array(${JSON.stringify(values)})${buffer ? '.buffer' : ''}`)
  for (const buffer of [true, false]) {
    assert.doesNotThrow(() => assertSafeScores({ type: 'float32', shape: [1, 5], data: makeScores([.01,.01,.96,.01,.01], buffer) }))
    assert.throws(() => assertSafeScores({ type: 'float32', shape: [1, 5], data: makeScores([.01,.01,.01,.96,.01], buffer) }), { safetyCode: 'blocked' })
  }
  let data = runInNewContext(`new ArrayBuffer(${info.bytes})`)
  assert.equal(data instanceof ArrayBuffer, false, 'reproduce WeChat native bridge realm mismatch')
  const api = { getFileSystemManager: () => ({ readFile: options => options.success({ data }) }) }
  assert.equal((await readSafetyModel(api, 'local.onnx')).byteLength, info.bytes)
  for (data of [runInNewContext('new ArrayBuffer(4)'), { byteLength: info.bytes, [Symbol.toStringTag]: 'ArrayBuffer' }, new Uint8Array(info.bytes), null]) {
    await assert.rejects(readSafetyModel(api, 'local.onnx'), { safetyCode: 'resources' })
  }
})

test('local preprocessing preserves RGB channels and bilinear endpoints; wide images get bounded crop checks', () => {
  const rgba = new Uint8ClampedArray([255,0,0,255, 0,255,0,255, 0,0,255,255, 255,255,255,255])
  const input = prepareSafetyTensor(rgba, 2, 2, undefined, 3), values = new Float32Array(input.data)
  assert.deepEqual(input.shape, [1,3,3,3])
  assert.equal(values[0], 1); assert.equal(values[2], 0)
  assert.equal(values[4], .5); assert.equal(values[13], .5); assert.equal(values[22], .5)
  assert.equal(values[26], 1)
  assert.throws(() => prepareSafetyTensor(rgba, 0, 2))
  assert.equal(safetyCrops(800,800).length,1)
  for (const [width,height] of [[1600,400],[300,2400]]) {
    const crops = safetyCrops(width,height)
    assert.ok(crops.length > 1 && crops.length <= 5)
    assert.ok(crops.every(crop => crop.x >= 0 && crop.y >= 0 && crop.x+crop.width <= width && crop.y+crop.height <= height))
  }
})

function resources() {
  return info.parts.map(part => {
    const compressed = readFileSync(new URL(`../src${part.path}`, import.meta.url))
    assert.equal(createHash('sha256').update(compressed).digest('hex'),part.sha256)
    const binary = gunzipSync(compressed)
    assert.equal(binary.byteLength,part.bytes)
    assert.ok(compressed.byteLength < 2*1024**2)
    return binary
  })
}
test('all packaged model parts restore the pinned ONNX with exact length and integrity', () => {
  const binary = Buffer.concat(resources())
  assert.equal(binary.byteLength,info.bytes)
  assert.equal(createHash('sha256').update(binary).digest('hex'),info.sha256)
  assert.equal(createHash('md5').update(binary).digest('hex'),info.md5)
})

const base64ToArrayBuffer = encoded => {
  const bytes = Buffer.from(encoded, 'base64')
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
}
const packedResource = root => readFileSync(new URL(`../src${info.parts.find(part => part.root === root).path}`, import.meta.url))

test('model loader works without mini-game or package-file APIs and repairs a corrupt same-size cache', async () => {
  let valid = false, corrupt = false, wrote = 0
  const imported = [], options = { importPackage: async root => {
    imported.push(root)
    return corrupt ? 'broken' : packedResource(root).toString('base64')
  } }
  const api = {
    env: { USER_DATA_PATH: 'wxfile://local' }, base64ToArrayBuffer,
    getFileSystemManager: () => ({
      getFileInfo: options => options.success({size:info.bytes,digest: valid ? info.md5 : 'wrong'}),
      readFile: () => { throw new Error('package file access denied') },
      writeFile: options => {
        assert.equal(options.encoding, 'base64')
        const actual = Buffer.from(options.data, 'base64')
        assert.equal(actual.byteLength, info.bytes)
        assert.equal(createHash('md5').update(actual).digest('hex'), info.md5)
        wrote++; valid = true; options.success()
      },
    }),
  }
  assert.match(await prepareSafetyModel(api,options),new RegExp(info.version))
  assert.deepEqual(imported.sort(), info.parts.map(part => part.root).sort())
  assert.equal(wrote,1)
  await prepareSafetyModel(api,options); assert.equal(wrote,1,'verified cache needs no additional unpack')
  assert.equal(imported.length, info.parts.length, 'cached model does not import resources again')
  valid = false; corrupt = true
  await assert.rejects(prepareSafetyModel(api,options), { safetyCode: 'resources' })
  assert.equal(wrote,1)
})

test('async module loader refuses damaged gzip, incomplete resources, failed downloads and invalid restored checksums', async () => {
  let writes = 0, damaged = false
  const api = {
    env: { USER_DATA_PATH: 'wxfile://local' }, base64ToArrayBuffer,
    getFileSystemManager: () => ({
      getFileInfo: options => writes ? options.success({ size: info.bytes, digest: 'invalid' }) : options.fail({ errMsg: 'not cached' }),
      writeFile: options => { writes++; options.success() },
    }),
  }
  const options = { importPackage: async root => {
    const part = Buffer.from(packedResource(root))
    if (damaged) part[0] = 0
    return part.toString('base64')
  } }
  await assert.rejects(prepareSafetyModel(api,options), { safetyCode: 'unavailable' })
  assert.equal(writes, 1, 'a decoded model still needs final MD5 verification')
  damaged = true
  await assert.rejects(prepareSafetyModel(api,options), { safetyCode: 'resources' })
  assert.equal(writes, 1, 'damaged gzip must not be written or passed to inference')
  await assert.rejects(prepareSafetyModel(api,{ importPackage: async () => ({}) }), { safetyCode: 'resources' })
  await assert.rejects(prepareSafetyModel(api,{ importPackage: async () => { throw new Error('download failed') } }))
  assert.equal(writes, 1)
})

test('cancelling first-use resource loading cannot write or approve a late model', async () => {
  let cancelled = false, writes = 0
  const api = {
    env: { USER_DATA_PATH: 'wxfile://local' },
    getFileSystemManager: () => ({
      getFileInfo: options => options.fail({ errMsg: 'not cached' }),
      writeFile: () => { writes++ },
    }),
  }
  await assert.rejects(prepareSafetyModel(api, {
    isCancelled: () => cancelled,
    importPackage: async root => { cancelled = true; return packedResource(root).toString('base64') },
  }), { safetyCode: 'cancelled' })
  assert.equal(writes, 0)
})

test('native importer cancels and destroys failed sessions without releasing an approval', async () => {
  let ready, failure, destroyed = 0, cancel
  const session = {onLoad:cb=>{ready=cb},onError:cb=>{failure=cb},destroy:()=>{destroyed++}}
  const api={createInferenceSession:()=>session}
  let pending=loadSafetySession(api,'local.onnx',cb=>{cancel=cb})
  cancel(); await assert.rejects(pending,error=>error.safetyCode==='cancelled'); ready()
  assert.equal(destroyed,1)
  pending=loadSafetySession(api,'local.onnx',cb=>{cancel=cb})
  failure(new Error('native failure')); await assert.rejects(pending,error=>error.safetyCode==='unavailable')
  assert.equal(destroyed,2)
  pending=loadSafetySession(api,'local.onnx',cb=>{cancel=cb});ready()
  assert.equal(await pending,session); assert.equal(cancel,null)
})

test('native detector consumes real protocol output and rejects a risk in a later wide-image crop', async () => {
  let calls = 0, destroyed = 0
  const api = {
    env: { USER_DATA_PATH: 'wxfile://local' },
    getSystemInfoSync: () => ({ platform: 'ios' }),
    getFileSystemManager: () => ({ getFileInfo: options => options.success({ size: info.bytes, digest: info.md5 }) }),
    createInferenceSession: () => ({
      onError: () => {}, onLoad: callback => queueMicrotask(callback), destroy: () => { destroyed++ },
      run: async ({ rgb }) => {
        assert.deepEqual(rgb.shape, [1,3,224,224])
        assert.equal(rgb.data.byteLength, 224*224*3*4)
        calls++
        return { probabilities: tensor(calls === 3 ? [.01,.01,.01,.96,.01] : [.01,.01,.96,.01,.01]) }
      },
    }),
  }
  const previous = globalThis.wx
  globalThis.wx = api
  const detector = createSafetyDetector()
  try {
    await detector.check(new Uint8ClampedArray(4*4*4).fill(255),4,4)
    const varied = new Uint8ClampedArray(16*4*4).fill(128)
    for (let y = 0; y < 4; y++) for (let x = 0; x < 16; x++) varied[(y * 16 + x) * 4] = x * 15
    await assert.rejects(detector.check(varied,16,4), error => error.safetyCode === 'blocked')
    assert.equal(calls, 3, 'the full view is followed by crop checks, stopping at the first risk')
    assert.equal(destroyed, 1)
  } finally { detector.dispose(); globalThis.wx = previous }
})

test('exact repeated model inputs skip inference, changed pixels and fresh detectors still check', async () => {
  const previous = globalThis.wx
  let calls = 0
  globalThis.wx = {
    env: { USER_DATA_PATH: 'wxfile://local' },
    getSystemInfoSync: () => ({ platform: 'ios' }),
    getFileSystemManager: () => ({ getFileInfo: options => options.success({ size: info.bytes, digest: info.md5 }) }),
    createInferenceSession: () => ({
      onError() {}, onLoad: callback => queueMicrotask(callback), destroy() {},
      run: async () => { calls++; return { probabilities: tensor([.01,.01,.96,.01,.01]) } },
    }),
  }
  const first = createSafetyDetector(), second = createSafetyDetector()
  try {
    const pixels = new Uint8ClampedArray(16).fill(255)
    await first.check(pixels, 2, 2); await first.check(pixels.slice(), 2, 2)
    assert.equal(calls, 1)
    pixels[0] = 100; await first.check(pixels, 2, 2)
    assert.equal(calls, 2, 'a changed rendered pixel must invalidate reuse')
    await second.check(pixels, 2, 2)
    assert.equal(calls, 3, 'no approvals are persisted between detector sessions')
  } finally { first.dispose(); second.dispose(); globalThis.wx = previous }
})

test('native detector rejects missing model access and cancellation of an in-flight inference', async () => {
  const previous = globalThis.wx
  const pixels = new Uint8ClampedArray(16).fill(255)
  const detectors = []
  try {
    globalThis.wx = { getSystemInfoSync: () => ({ platform: 'devtools' }) }
    let detector = createSafetyDetector(); detectors.push(detector)
    await assert.rejects(detector.check(pixels,2,2), error => error.safetyCode === 'unavailable')
    let finish, destroyed = 0, cancelled = false
    const started = new Promise(resolve => { finish = resolve })
    globalThis.wx = {
      env: { USER_DATA_PATH: 'wxfile://local' },
      getSystemInfoSync: () => ({ platform: 'android' }),
      getFileSystemManager: () => ({ getFileInfo: options => options.success({ size: info.bytes, digest: info.md5 }) }),
      createInferenceSession: () => ({ onError:()=>{}, onLoad:callback=>queueMicrotask(callback), destroy:()=>{destroyed++}, run: () => { finish(); return new Promise(()=>{}) } }),
    }
    detector = createSafetyDetector(); detectors.push(detector)
    const pending = detector.check(pixels,2,2,{isCancelled:()=>cancelled})
    await started; cancelled = true
    await assert.rejects(pending, error => error.safetyCode === 'cancelled')
    assert.equal(destroyed,1)
  } finally { detectors.forEach(detector=>detector.dispose()); globalThis.wx = previous }
})
