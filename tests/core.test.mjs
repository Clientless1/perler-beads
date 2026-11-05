import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

// Load the same framework-independent sources without changing the uni-app module setup.
const modules = new Map()
async function sourceModule(path) {
  if (modules.has(path)) return modules.get(path)
  const url = new URL(`../src/utils/${path}`, import.meta.url)
  const source = await readFile(url, 'utf8')
  const { build } = await import('esbuild')
  const result = await build({ stdin: { contents: source, resolveDir: new URL('.', url).pathname, loader: 'js' }, bundle: true, write: false, format: 'esm', platform: 'neutral' })
  const promise = import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
  modules.set(path, promise)
  return promise
}
const { HAMA_PALETTE, MARD_PALETTE } = await sourceModule('beadPalette.js')
const { matchAll } = await sourceModule('colorMatcher.js')
const { removeBorderWhite } = await sourceModule('imageProcessor.js')
const storage = await sourceModule('storage.js')
const { drawForExport, drawPattern } = await sourceModule('canvasRenderer.js')
const memory = new Map()
globalThis.uni = {
  getStorageSync: key => memory.get(key),
  setStorageSync: (key, value) => memory.set(key, value),
  removeStorageSync: key => memory.delete(key),
  getSystemInfoSync: () => ({ pixelRatio: 3 }),
}

test('white-background removal keeps enclosed white details and colored edges', () => {
  const pixels = new Uint8ClampedArray(5 * 5 * 4).fill(255)
  for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) {
    if (x === 2 && y === 2) continue
    pixels.set([30, 40, 30, 255], (y * 5 + x) * 4)
  }
  removeBorderWhite(pixels, 5)
  assert.equal(pixels[3], 0)
  assert.equal(pixels[(2 * 5 + 2) * 4 + 3], 255)
  assert.equal(pixels[(1 * 5 + 1) * 4 + 3], 255)
})

test('transparent images produce empty cells, with no extra beads in the material list', () => {
  const pixels = new Uint8ClampedArray(29 * 29 * 4)
  pixels.set([255, 230, 96, 255], (14 * 29 + 14) * 4)
  const result = matchAll(pixels, 29, HAMA_PALETTE, 8, { detailMode: false })
  assert.equal(result.pattern[0][0], null)
  assert.ok(result.pattern[14][14])
  assert.equal(result.colorUsage.reduce((n, c) => n + c.count, 0), 1)
  const empty = matchAll(new Uint8ClampedArray(pixels.length), 29, HAMA_PALETTE, 8)
  assert.equal(empty.colorUsage.length, 0)
  assert.ok(empty.pattern.every(row => row.every(cell => cell === null)))
})

test('color limits and bead counts hold for large, varied patterns', () => {
  const size = 87, pixels = new Uint8ClampedArray(size * size * 4)
  let visible = 0
  for (let i = 0; i < size * size; i++) {
    const color = HAMA_PALETTE[(i * 17 + Math.floor(i / size)) % HAMA_PALETTE.length]
    const alpha = i % 7 === 0 ? 0 : 255
    pixels.set([color.r, color.g, color.b, alpha], i * 4)
    if (alpha) visible++
  }
  const result = matchAll(pixels, size, HAMA_PALETTE, 8)
  assert.ok(result.colorUsage.length <= 8)
  assert.equal(result.pattern.length, size)
  assert.equal(result.colorUsage.reduce((n, c) => n + c.count, 0), visible)
  assert.equal(result.pattern.flat().filter(Boolean).length, visible)
})

test('storage preserves transparent cells, progress and distinct fine details', () => {
  memory.clear()
  const first = HAMA_PALETTE[0], second = HAMA_PALETTE[1]
  const pattern = Array.from({ length: 29 }, () => Array(29).fill(first))
  pattern[0][0] = null
  const entry = { pattern, gridSize: 29, colorUsage: [{ ...first, count: 840 }], name: '小作品' }
  const id = storage.savePattern(entry)
  assert.equal(storage.savePattern(entry), id)
  storage.updatePattern(id, { completedCodes: [first.code], name: '拼完了' })
  const restored = storage.getPatternById(id)
  assert.equal(restored.pattern[0][0], null)
  assert.equal(restored.pattern[1][1].code, first.code)
  assert.deepEqual(restored.completedCodes, [first.code])
  assert.equal(restored.name, '拼完了')
  pattern[1][1] = second
  const different = storage.savePattern({ ...entry, pattern })
  assert.notEqual(different, id)
  assert.equal(storage.getHistory().length, 2)
  storage.deletePattern(id)
  assert.equal(storage.getHistory().length, 1)
})

test('legacy records stay readable and history retains at most 20 entries', () => {
  memory.set('bead_history', JSON.stringify([{ id: 'old', gridSize: 29, pattern: [[HAMA_PALETTE[0]]], colorUsage: [] }]))
  assert.equal(storage.getHistory()[0].pattern[0][0].code, 'H01')
  memory.clear()
  for (const color of HAMA_PALETTE.slice(0, 22)) storage.savePattern({ pattern: [[color]], gridSize: 1, colorUsage: [{ ...color, count: 1 }] })
  assert.equal(storage.getHistory().length, 20)
  memory.set('bead_history', '{invalid')
  assert.deepEqual(storage.getHistory(), [])
})

test('export keeps H01 and H101 unambiguous and includes the materials legend', () => {
  const labels = []
  const ctx = new Proxy({}, { get: (_target, key) => key === 'fillText' ? text => labels.push(text) : () => {}, set: () => true })
  const canvas = { getContext: () => ctx }
  const one = HAMA_PALETTE.find(c => c.code === 'H01'), other = HAMA_PALETTE.find(c => c.code === 'H101')
  const usage = [{ ...one, count: 2 }, { ...other, count: 1 }]
  const result = drawForExport(canvas, [[one, other], [null, one]], 2, true, { name: '完整色号', colorUsage: usage })
  assert.ok(labels.includes('H01'))
  assert.ok(labels.includes('H101'))
  assert.ok(labels.includes('用豆清单 / BEAD LIST'))
  assert.ok(labels.includes('H101  × 1'))
  assert.equal(canvas.height, result.height)
})

test('zoomed canvas stays within a 4096 pixel texture on high-density phones', () => {
  const ctx = new Proxy({}, { get: () => () => {}, set: () => true })
  const canvas = { getContext: () => ctx }
  drawPattern(canvas, [[HAMA_PALETTE[0]]], 1, false, 1720)
  assert.ok(canvas.width <= 4096)
  assert.ok(canvas.height <= 4096)
})

const { ciede2000 } = await sourceModule('colorScience.js')
const { sampleGrid } = await sourceModule('imageProcessor.js')
const { TEMPLATES, TEMPLATE_CATEGORIES, TEMPLATE_SOURCES, getTemplatePattern } = await sourceModule('templates.js')

test('CIEDE2000 agrees with the published Sharma reference pairs', () => {
  const pairs = [
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
    [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
    [[50, 2.8361, -74.0200], [50, 0, -82.7485], 3.4412],
    [[50, -1.3802, -84.2814], [50, 0, -82.7485], 1.0000],
  ]
  const lab = ([L, a, b]) => ({ L, a, b })
  for (const [a, b, expected] of pairs) assert.ok(Math.abs(ciede2000(lab(a), lab(b)) - expected) < .0001)
})

test('MARD palette preserves all 221 exact source colors, including neutral and skin tones', () => {
  assert.equal(MARD_PALETTE.length, 221)
  assert.equal(new Set(MARD_PALETTE.map(c => c.code)).size, 221)
  const size = 15, pixels = new Uint8ClampedArray(size * size * 4)
  MARD_PALETTE.forEach((c, i) => pixels.set([c.r, c.g, c.b, 255], i * 4))
  const result = matchAll(pixels, size, MARD_PALETTE, 0)
  MARD_PALETTE.forEach((c, i) => assert.equal(result.pattern[Math.floor(i / size)][i % size].hex, c.hex))
})

test('limited palette keeps sparse black eyes and red accent among many similar background shades', () => {
  const size = 29, pixels = new Uint8ClampedArray(size * size * 4)
  const shades = HAMA_PALETTE.filter(c => ['H01','H77','H02','H27','H78','H105','H103','H95'].includes(c.code))
  for (let i = 0; i < size * size; i++) { const c = shades[i % shades.length]; pixels.set([c.r,c.g,c.b,255],i*4) }
  for (const i of [400,404]) pixels.set([46,47,49,255],i*4)
  pixels.set([182,49,54,255],450*4)
  const result = matchAll(pixels,size,HAMA_PALETTE,8)
  assert.equal(result.pattern.flat()[400].code, 'H18')
  assert.equal(result.pattern.flat()[450].code, 'H05')
  assert.ok(result.colorUsage.length <= 8)
})

test('illustration sampling avoids invented mixed colors; alpha cannot tint edge pixels', () => {
  const pixels = new Uint8ClampedArray(4*4*4)
  for (let i=0;i<16;i++) pixels.set(i<10 ? [240,20,30,255] : [20,30,240,255],i*4)
  assert.deepEqual(Array.from(sampleGrid(pixels,4,1,'illustration')), [240,20,30,255])
  const alpha = new Uint8ClampedArray(4*4*4)
  for(let i=0;i<9;i++) alpha.set([240,20,30,255],i*4)
  assert.deepEqual(Array.from(sampleGrid(alpha,4,1,'photo')), [240,20,30,255])
})

test('all 640 offline templates have unique grids, valid covers, exact counts and usable boards', async () => {
  assert.equal(TEMPLATES.length,640)
  assert.equal(TEMPLATES.filter(item=>item.sourceInfo).length,512)
  assert.equal(TEMPLATES.filter(item=>item.sourceId==='twemoji').length,256)
  assert.ok(TEMPLATE_SOURCES.every(source=>['CC0-1.0','CC-BY-4.0'].includes(source.license) && source.url.startsWith('https://') && source.licenseUrl.startsWith('https://')))
  assert.equal(new Set(TEMPLATES.map(item => item.id)).size,TEMPLATES.length)
  const signatures = new Set()
  for(const category of TEMPLATE_CATEGORIES.filter(category => category !== '全部')) {
    assert.ok(TEMPLATES.filter(item => item.category === category).length >= 6)
  }
  for(const meta of TEMPLATES) {
    const item = getTemplatePattern(meta.id)
    const signature = JSON.stringify(item.pattern.map(row=>row.map(cell=>cell?.code || '')))
    assert.ok(!signatures.has(signature),`${meta.id} duplicates another pattern`)
    signatures.add(signature)
    assert.ok(TEMPLATE_CATEGORIES.includes(meta.category))
    const cover = await readFile(new URL(`../src${meta.cover}`,import.meta.url))
    assert.equal(cover.subarray(1,4).toString(),'PNG')
    assert.equal(cover.readUInt32BE(16),348)
    assert.equal(cover.readUInt32BE(20),348)
    assert.equal(item.gridSize % 29,0)
    assert.equal(item.pattern.length,item.gridSize)
    assert.ok(item.pattern.every(row=>row.length===item.gridSize))
    assert.equal(item.pattern.flat().filter(Boolean).length,meta.totalBeads)
    assert.equal(item.colorUsage.reduce((n,c)=>n+c.count,0),meta.totalBeads)
    assert.equal(item.colorUsage.length,meta.colors)
    assert.ok(item.colorUsage.every(c=>MARD_PALETTE.some(p=>p.code===c.code && p.hex===c.hex)))
    const id=storage.savePattern(item), restored=storage.getPatternById(id)
    assert.equal(restored.paletteName,'MARD')
    assert.deepEqual(restored.pattern,item.pattern)
    if(meta.sourceId==='twemoji') {
      assert.equal(restored.attribution.license,'CC-BY-4.0')
      assert.equal(restored.attribution.modified,true)
      assert.ok(restored.attribution.url.includes('twitter/twemoji'))
    }
  }
  assert.equal(getTemplatePattern('missing'),null)
})

test('CC BY attribution survives export in both numbered and bead views', () => {
  const item=getTemplatePattern('tw_1f431')
  for(const numbered of [true,false]) {
    const labels=[],ctx=new Proxy({}, {get:(_t,k)=>k==='fillText'?text=>labels.push(text):()=>{},set:()=>true})
    drawForExport({getContext:()=>ctx},item.pattern,item.gridSize,numbered,{colorUsage:item.colorUsage,paletteName:item.paletteName,attribution:item.attribution})
    assert.ok(labels.some(text=>text.includes('Twitter, Inc and other contributors')))
    assert.ok(labels.some(text=>text.includes('creativecommons.org/licenses/by/4.0/')))
  }
})

test('palette brand survives save and export and does not merge different brands', () => {
  memory.clear()
  const color = HAMA_PALETTE[0], base={ pattern:[[color]], gridSize:1, colorUsage:[{...color,count:1}] }
  const hama=storage.savePattern({...base,paletteName:'Hama'}), mard=storage.savePattern({...base,paletteName:'MARD'})
  assert.notEqual(hama,mard)
  const labels=[],ctx=new Proxy({}, {get:(_t,k)=>k==='fillText'?text=>labels.push(text):()=>{},set:()=>true})
  drawForExport({getContext:()=>ctx},base.pattern,1,true,{paletteName:'MARD',colorUsage:base.colorUsage})
  assert.ok(labels.some(text=>text.includes('MARD 色卡')))
  assert.ok(!labels.some(text=>text.includes('Hama 色卡')))
})

const subjectMask = await sourceModule('subjectMask.js')
const subjectSession = await sourceModule('subjectSession.js')
test('portrait probabilities keep separate people, reject blank output and remove tiny isolated specks', () => {
  const size = 32, values = new Float32Array(size * size)
  for (let y = 4; y < 26; y++) for (let x = 4; x < 12; x++) values[y * size + x] = .95
  for (let y = 8; y < 28; y++) for (let x = 20; x < 29; x++) values[y * size + x] = .8
  values[0] = 1
  const mask = subjectMask.probabilitiesToMask(values, size)
  assert.equal(mask[0], 0)
  assert.equal(mask[10 * size + 6], 255)
  assert.equal(mask[10 * size + 23], 255)
  assert.equal(mask[10 * size + 15], 0)
  assert.throws(() => subjectMask.probabilitiesToMask(new Float32Array(size * size), size), /没有选中/)
  assert.throws(() => subjectMask.probabilitiesToMask(new Float32Array(size * size).fill(1), size), /没有分清/)
  assert.throws(() => subjectMask.probabilitiesToMask(new Float32Array(size * size).fill(NaN), size), /结果异常/)
})

test('subject masking maps a normalized silhouette onto rectangular photos without changing RGB or existing transparency', () => {
  const size = 4, mask = new Uint8Array(size * size)
  for (let y = 0; y < size; y++) for (let x = 0; x < 2; x++) mask[y * size + x] = 255
  const rgba = new Uint8ClampedArray(8 * 4 * 4)
  for (let i = 0; i < 32; i++) rgba.set([245, 245, 245, i === 8 ? 0 : 255], i * 4)
  subjectMask.applySubjectMask(rgba, 8, 4, mask, size)
  assert.equal(rgba[3], 255)
  assert.equal(rgba[7 * 4 + 3], 0)
  assert.equal(rgba[8 * 4 + 3], 0)
  assert.deepEqual(Array.from(rgba.slice(0, 3)), [245, 245, 245])
  assert.deepEqual(subjectMask.maskBounds(mask, size), { x: 0, y: 0, width: .5, height: 1, count: 8 })
})

test('freehand selection follows concave outlines and correction brushes leave no gaps', () => {
  const mask = subjectMask.polygonMask([{ x: .1, y: .1 }, { x: .9, y: .1 }, { x: .9, y: .4 }, { x: .4, y: .4 }, { x: .4, y: .9 }, { x: .1, y: .9 }], 100)
  assert.equal(mask[20 * 100 + 20], 255)
  assert.equal(mask[80 * 100 + 20], 255)
  assert.equal(mask[80 * 100 + 80], 0)
  subjectMask.paintMask(mask, { x: .15, y: .2 }, { x: .8, y: .2 }, .025, .05, 0, 100)
  for (let x = 15; x < 80; x++) assert.equal(mask[20 * 100 + x], 0)
  subjectMask.paintMask(mask, { x: .15, y: .2 }, { x: .8, y: .2 }, .025, .05, 255, 100)
  assert.equal(mask[20 * 100 + 50], 255)
  assert.throws(() => subjectMask.validateSubject(subjectMask.polygonMask([], 100), 100), /没有选中/)
})

test('replacing a photo invalidates extraction results and cancellations keep the original selection', () => {
  const first = subjectSession.beginSubjectEdit('first.jpg')
  const second = subjectSession.beginSubjectEdit('second.jpg')
  assert.equal(subjectSession.finishSubjectEdit(first, { mask: 'stale' }), false)
  assert.equal(subjectSession.consumeSubjectEdit('second.jpg'), null)
  assert.equal(subjectSession.finishSubjectEdit(second, { mask: 'current' }), true)
  assert.deepEqual(subjectSession.consumeSubjectEdit('second.jpg'), { mask: 'current' })
  assert.equal(subjectSession.consumeSubjectEdit('second.jpg'), null)
  subjectSession.clearSubjectEdit()
  assert.equal(subjectSession.finishSubjectEdit(second, { mask: 'late' }), false)
})

const segmentation = await sourceModule('../subject/segmentation.js')
const wechatInference = await sourceModule('../subject/wechatInference.js')
const modelInfo = JSON.parse(await readFile(new URL('../src/subject/modelInfo.json', import.meta.url), 'utf8'))
test('subject model normalization matches reference and validates native/H5 tensor outputs', () => {
  const count = segmentation.INPUT_SIZE ** 2, rgba = new Uint8ClampedArray(count * 4)
  for (let i = 0; i < count; i++) rgba.set([100, 200, 50, 255], i * 4)
  const tensor = segmentation.prepareSubjectTensor(rgba)
  assert.ok(Math.abs(tensor[0] - (.5 - .485) / .229) < 1e-6)
  assert.ok(Math.abs(tensor[count] - (1 - .456) / .224) < 1e-6)
  const data = new Float32Array(count).fill(.01)
  for (let y = 60; y < 250; y++) for (let x = 80; x < 240; x++) data[y * 320 + x] = .95
  const native = segmentation.decodeSubjectOutput({ type: 'float32', shape: [1, 1, 320, 320], data: data.buffer })
  const h5 = segmentation.decodeSubjectOutput({ type: 'float32', shape: [1, 1, 320, 320], data })
  assert.deepEqual(native, h5)
  assert.equal(h5[128 * 256 + 128], 255)
  assert.equal(h5[0], 0)
  assert.throws(() => segmentation.decodeSubjectOutput({ type: 'float32', shape: [1, 1, 320, 320], data: new Float32Array(count).fill(.501) }), /没有找到/)
  assert.throws(() => segmentation.decodeSubjectOutput({ type: 'float16', shape: [1, 1, 320, 320], data }), /格式/)
})

test('automatic flat-background extraction closes outline gaps and retains white subject interiors', () => {
  const size = 64, rgba = new Uint8ClampedArray(size * size * 4).fill(255)
  const black = (x, y) => rgba.set([20, 20, 20, 255], (y * size + x) * 4)
  for (let i = 12; i <= 51; i++) { black(i, 12); black(i, 51); black(12, i); black(51, i) }
  // A small break in an outline must not erase a white face/body.
  for (let y = 30; y <= 33; y++) rgba.set([255, 255, 255, 255], (y * size + 12) * 4)
  const mask = segmentation.extractFlatBackground(rgba, size)
  assert.ok(mask)
  assert.equal(mask[0], 0)
  assert.equal(mask[32 * size + 32], 255)
  assert.equal(segmentation.extractFlatBackground(new Uint8ClampedArray(rgba.length).fill(255), size), null)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) rgba.set([x * 4, y * 4, (x + y) * 2, 255], (y * size + x) * 4)
  assert.equal(segmentation.extractFlatBackground(rgba, size), null)
})

test('native model uses readable package binary and repairs incomplete cached model before inference', async () => {
  const calls = [], data = new ArrayBuffer(modelInfo.bytes)
  const fs = {
    getFileInfo: options => options.success({ size: 1 }),
    readCompressedFile: options => { calls.push(options.filePath); assert.equal(options.compressionAlgorithm, 'br'); options.success({ data }) },
    writeFile: options => { calls.push(options.filePath); assert.equal(options.data, data); options.success({}) },
  }
  const api = { env: { USER_DATA_PATH: 'wxfile://usr' }, getFileSystemManager: () => fs }
  const path = await wechatInference.prepareWechatModel(api)
  assert.equal(calls[0], '/subject/static/subject-u2net.br')
  assert.match(path, /^wxfile:\/\/usr\/.+\.onnx$/)
  fs.getFileInfo = options => options.success({ size: modelInfo.bytes })
  await wechatInference.prepareWechatModel(api)
  assert.equal(calls.length, 2, 'valid cache must not copy the model again')
  fs.getFileInfo = options => options.fail({})
  await wechatInference.prepareWechatModel(api, { force: true })
  assert.equal(calls.length, 4, 'failed native sessions can force cache reconstruction even when byte size matches')
  fs.readCompressedFile = options => options.success({ data: new ArrayBuffer(1) })
  await assert.rejects(wechatInference.prepareWechatModel(api), /不完整/)
})

test('native model failure settles once, preserves the runtime error and supports cancellation', async () => {
  let fail, ready, cancel, destroyed = 0, removed = 0
  const api = { createInferenceSession: () => ({
    onError: cb => { fail = cb }, onLoad: cb => { ready = cb },
    offError: () => removed++, offLoad: () => removed++, destroy: () => destroyed++,
  }) }
  const failure = wechatInference.loadWechatSession(api, 'wxfile://usr/model.onnx', cb => { cancel = cb }, 500)
  const runtimeError = { errMsg: 'createInferenceSession:fail 开发者工具暂时不支持此 API 调试' }
  fail(runtimeError); ready()
  await assert.rejects(failure, error => error.stage === 'load' && error.detail === runtimeError.errMsg)
  assert.equal(destroyed, 1)
  assert.equal(removed, 2)
  assert.match(wechatInference.inferenceError(runtimeError).message, /开发者工具.*真机/)
  const cancelled = wechatInference.loadWechatSession(api, 'local.onnx', cb => { cancel = cb }, 500)
  cancel()
  await assert.rejects(cancelled, /已取消/)
  assert.equal(destroyed, 2)
})

test('native model reports read, unpack, write and importer failures with actionable diagnostics', async () => {
  const calls = []
  const fs = {
    getFileInfo: options => options.fail({}),
    readCompressedFile: options => { calls.push(options.filePath); options.filePath.startsWith('/') ? options.fail({ errMsg: 'permission denied' }) : options.success({ data: new ArrayBuffer(modelInfo.bytes) }) },
    writeFile: options => options.success({}),
  }
  const api = { env: { USER_DATA_PATH: 'wxfile://usr' }, getFileSystemManager: () => fs }
  await wechatInference.prepareWechatModel(api)
  assert.deepEqual(calls, ['/subject/static/subject-u2net.br', 'subject/static/subject-u2net.br'])
  fs.writeFile = options => options.fail({ errMsg: 'maximum size exceeded' })
  await assert.rejects(wechatInference.prepareWechatModel(api), error => {
    const friendly = wechatInference.inferenceError(error)
    return /存储空间/.test(friendly.message) && /write.*\n模型：.*\n原因：maximum size exceeded/.test(friendly.diagnostic)
  })
  fs.readCompressedFile = options => options.fail({ errMsg: 'readCompressedFile:fail no such file' })
  await assert.rejects(wechatInference.prepareWechatModel(api), error => error.stage === 'read')
  fs.readCompressedFile = options => options.fail({ errMsg: 'brotli decompress fail' })
  await assert.rejects(wechatInference.prepareWechatModel(api), error => error.stage === 'unpack')
  const friendly = wechatInference.inferenceError(wechatInference.modelError('load', { errMsg: 'unsupported operator Resize', errno: 1 }))
  assert.match(friendly.diagnostic, /unsupported operator Resize/)
  assert.equal(wechatInference.inferenceError(friendly), friendly)
})

test('packaged subject model decompresses to the exact pinned float32 runtime', async () => {
  const { brotliDecompressSync } = await import('node:zlib')
  const { createHash } = await import('node:crypto')
  const compressed = await readFile(new URL('../src/subject/static/subject-u2net.br', import.meta.url))
  const decoded = brotliDecompressSync(compressed)
  assert.equal(compressed.length, modelInfo.compressedBytes)
  assert.equal(decoded.length, modelInfo.bytes)
  assert.equal(createHash('sha256').update(compressed).digest('hex'), modelInfo.compressedSha256)
  assert.equal(createHash('sha256').update(decoded).digest('hex'), modelInfo.sha256)
})

test('responsive color matching yields to navigation, preserves exact output and cancels superseded work', async () => {
  const { matchAllAsync } = await sourceModule('colorMatcher.js')
  const size = 58, pixels = new Uint8ClampedArray(size * size * 4)
  let seed = 42
  for (let i = 0; i < pixels.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; pixels[i] = i % 4 === 3 ? (i % 11 ? 255 : 0) : seed >>> 24 }
  const expected = matchAll(pixels, size, MARD_PALETTE, 16)
  let ticks = 0
  const timer = setInterval(() => ticks++, 0)
  const actual = await matchAllAsync(pixels, size, MARD_PALETTE, 16, { budget: 2 })
  clearInterval(timer)
  assert.deepEqual(actual, expected)
  assert.ok(ticks > 2, 'UI events must run while color matching is in progress')
  let stop = false
  const pending = matchAllAsync(pixels, size, MARD_PALETTE, 16, { isCancelled: () => stop, budget: 1 })
  setTimeout(() => { stop = true }, 0)
  await assert.rejects(pending, error => error.name === 'AbortError')
})

test('unlimited-color large-board export fits mobile canvas limits without dropping material codes', () => {
  const labels = [], ctx = new Proxy({}, { get: (_t, key) => key === 'fillText' ? text => labels.push(text) : () => {}, set: () => true })
  const canvas = { getContext: () => ctx }, pattern = Array.from({ length: 87 }, () => Array(87).fill(null))
  const usage = MARD_PALETTE.map(color => ({ ...color, count: 1 }))
  usage.forEach((color, i) => { pattern[Math.floor(i / 87)][i % 87] = color })
  const dimensions = drawForExport(canvas, pattern, 87, true, { colorUsage: usage, paletteName: 'MARD', attribution: true })
  assert.ok(dimensions.width <= 4096 && dimensions.height <= 4096)
  assert.ok(usage.every(color => labels.includes(`${color.code}  × 1`)))
})
