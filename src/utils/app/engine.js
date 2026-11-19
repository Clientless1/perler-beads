// This bundle runs only in the App WebView. No DOM globals enter the Vue
// service bundle, and no photo/model is uploaded to the backend.
import { imageDecodeSource } from './resources'
import { processImage } from '../imageProcessor'
import { safetyCrops, prepareSafetyTensor, assertSafeScores, safetyError } from '../safety/policy'
import { prepareSubjectTensor, decodeSubjectOutput, extractFlatBackground, INPUT_SIZE } from '../../subject/segmentation'
import { MASK_SIZE, applySubjectMask } from '../subjectMask'
import { createBeadPreview, drawBeadPreview } from '../preview3d.mjs'
import { drawEditorGrid, drawEditorCell } from '../editorRenderer.mjs'
const subjectViews = new Map(), interruptions = new Map()
const previewViews = new Map(), editorViews = new Map()
const canvases = new Map(), images = new Map(), decoded = new Map(), cancelled = new Set(), workers = new Map()
let sequence = 0, safetyQueue = Promise.resolve()
const base = new URL('static/app-image/', document.baseURI).href
export function readLocal(url, text = false) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('GET', url); if (!text) xhr.responseType = 'arraybuffer'
    xhr.timeout = 20000
    xhr.onload = () => (xhr.status === 0 || xhr.status >= 200 && xhr.status < 300) && xhr.response ? resolve(xhr.response) : reject(new Error('本地图像资源读取失败'))
    xhr.onerror = xhr.ontimeout = () => reject(new Error('本地图像资源读取失败'))
    xhr.send()
  })
}
function normalizePath(path) {
  if (/^(data:|blob:|https?:|file:|content:)/.test(path)) return path
  if (/^\/(storage|sdcard|data)\//.test(path)) return 'file://' + path
  if (path.startsWith('_') && window.plus?.io) return window.plus.io.convertLocalFileSystemURL(path)
  return new URL(path.replace(/^\//, ''), document.baseURI).href
}
async function image(path) {
  path = normalizePath(path)
  if (!decoded.has(path)) {
    const promise = (async () => {
      const decodedSource = await imageDecodeSource(path, window.plus?.io)
      return new Promise((resolve, reject) => {
        const temporary = decodedSource !== path && decodedSource.startsWith('blob:')
        const cleanup = () => { if (temporary) URL.revokeObjectURL(decodedSource) }
        const img = new Image(), timer = setTimeout(() => { cleanup(); reject(Object.assign(new Error('图片打开超时，请重新选择'), { stage: 'image:decode' })) }, 20000)
        img.onload = () => { clearTimeout(timer); cleanup(); if (!img.naturalWidth) return reject(new Error('图片为空')); resolve(img) }
        img.onerror = () => { clearTimeout(timer); cleanup(); reject(Object.assign(new Error('图片打开失败，请选择 JPG 或 PNG 图片'), { stage: 'image:decode' })) }
        img.src = decodedSource
      })
    })().catch(error => { decoded.delete(path); throw error })
    decoded.set(path, promise)
    if (decoded.size > 4) decoded.delete(decoded.keys().next().value)
  }
  return decoded.get(path)
}
function canvas(width, height) { const node = document.createElement('canvas'); node.width = width; node.height = height; return node }
async function source(path, max = 1280) {
  const img = await image(path), scale = Math.min(1, max / Math.max(img.width, img.height)), node = canvas(Math.max(1, Math.round(img.width * scale)), Math.max(1, Math.round(img.height * scale)))
  node.getContext('2d').drawImage(img, 0, 0, node.width, node.height)
  return node
}
function guard(id) { if (cancelled.has(id)) throw Object.assign(new Error('任务已取消'), { name: 'AbortError', safetyCode: 'cancelled' }) }
let code
async function workerCode() {
  if (!code) code = Promise.all([readLocal(base + 'ort.js', true), readLocal(base + 'worker.js', true)]).then(parts => parts.join('\n'))
  return code
}
async function inference(id, kind, input, progress) {
  guard(id)
  let state = workers.get(kind)
  if (!state) {
    const blob = URL.createObjectURL(new Blob([await workerCode()], { type: 'text/javascript' }))
    guard(id)
    const worker = new Worker(blob), pending = new Map()
    URL.revokeObjectURL(blob)
    state = { worker, pending, owner: id, idle: null }
    workers.set(kind, state)
    const fail = error => { clearTimeout(state.idle); for (const item of pending.values()) { clearTimeout(item.timer); item.reject(error) }; pending.clear(); worker.terminate(); if (workers.get(kind) === state) workers.delete(kind) }
    state.close = fail
    worker.onmessage = ({ data }) => { const task = pending.get(data.id); if (!task) return; pending.delete(data.id); clearTimeout(task.timer); data.error ? task.reject(Object.assign(new Error(data.error.message), data.error)) : task.resolve(data.result) }
    worker.onerror = event => fail(new Error(event.message || '本机识别引擎启动失败'))
    state.request = (type, payload, transfer = []) => new Promise((resolve, reject) => {
      const key = ++sequence, timer = setTimeout(() => fail(new Error('本机识别超时，请重试')), 45000)
      pending.set(key, { resolve, reject, timer }); worker.postMessage({ id: key, type, ...payload }, transfer)
    })
    state.ready = (async () => {
      progress(kind === 'safety' ? '正在启动本机图片检测…' : '正在准备主体识别…')
      const [model, wasm, module, convolution] = await Promise.all([readLocal(base + (kind === 'safety' ? 'nsfw.bin' : 'subject.bin')), readLocal(base + 'ort.wasm'), readLocal(base + 'ort.mjs', true), readLocal(base + 'convolutions.wasm')])
      guard(id)
      return state.request(kind === 'safety' ? 'loadSafety' : 'loadSubject', { resources: { model, wasm, module, convolution, wasmUrl: base + 'ort.wasm', moduleUrl: base + 'ort.mjs' } }, [model, wasm, convolution])
    })().catch(error => { fail(error); throw error })
  }
  clearTimeout(state.idle); state.owner = id
  await state.ready; guard(id)
  progress(kind === 'safety' ? '正在检测图片…' : '正在提取主体…')
  try { return (await state.request(kind, { input }, [input.data])).tensor }
  finally { state.idle = setTimeout(() => state.close(new Error('识别引擎已休眠')), 120000) }
}
const checked = []
async function scan(id, node, progress) {
  const c = canvas(node.width, node.height), ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(node, 0, 0)
  const pixels = ctx.getImageData(0, 0, c.width, c.height).data
  for (const crop of safetyCrops(c.width, c.height)) {
    guard(id)
    const input = prepareSafetyTensor(pixels, c.width, c.height, crop), bytes = new Uint8Array(input.data)
    if (checked.some(previous => previous.length === bytes.length && previous.every((b, i) => b === bytes[i]))) continue
    const key = bytes.slice()
    const output = await inference(id, 'safety', input, progress)
    guard(id); assertSafeScores(output)
    checked.push(key); if (checked.length > 6) checked.shift()
  }
}
function directCanvas(selector) {
  const element = document.querySelector(selector)
  if (!element) throw new Error('画布尚未就绪，请重试')
  if (element.tagName === 'CANVAS') return element
  let node = element.querySelector('canvas[data-app-image]')
  if (!node) { node = canvas(1, 1); node.dataset.appImage = ''; Object.assign(node.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' }); element.appendChild(node) }
  return node
}
function render(payload) {
  let node = canvases.get(payload.id)
  if (node && payload.selector && !node.isConnected) { canvases.delete(payload.id); node = null }
  if (!node) { node = payload.selector ? directCanvas(payload.selector) : canvas(1, 1); canvases.set(payload.id, node) }
  const ctx = node.getContext('2d', { willReadFrequently: true })
  for (const [op, a, b, ...rest] of payload.commands) {
    if (op === 'width' || op === 'height') node[op] = a
    else if (op === 'set') ctx[a] = b
    else if (op === 'call') { if (typeof ctx[a] !== 'function') throw new Error(`画布指令不支持 ${a}`); ctx[a](...b) }
    else if (op === 'drawImage') { const src = images.get(a) || canvases.get(a); if (!src) throw new Error('图片尚未准备好'); ctx.drawImage(src, b, ...rest) }
    else if (op === 'putImageData') { const data = ctx.createImageData(a.width, a.height); data.data.set(a.data); ctx.putImageData(data, b, ...rest) }
  }
}
export async function dispatch({ id, type, payload = {} }, progress = () => {}) {
  if (type === 'cancel') {
    cancelled.add(payload.id)
    interruptions.get(payload.id)?.()
    if (cancelled.size > 100) cancelled.delete(cancelled.values().next().value)
    for (const state of workers.values()) if (state.owner === payload.id) state.close(Object.assign(new Error('已取消'), { safetyCode: 'cancelled' }))
    return
  }
  try {
    guard(id)
    if (type === 'safeImage' || type === 'safePattern') {
      let interrupt
      const interrupted = new Promise((_, reject) => { interrupt = () => reject(Object.assign(new Error('已取消图片检测'), { safetyCode: 'cancelled', name: 'AbortError' })) })
      interruptions.set(id, interrupt)
      const run = safetyQueue.catch(() => {}).then(async () => {
        guard(id); progress('正在打开图片…')
        let node
        if (type === 'safeImage') node = await source(payload.path)
        else { const colors = payload.colors; node = canvas(colors.length, colors.length); const ctx = node.getContext('2d'); colors.forEach((row, y) => row.forEach((hex, x) => { ctx.fillStyle = hex || '#fff'; ctx.fillRect(x, y, 1, 1) })) }
        guard(id); await scan(id, node, progress); guard(id)
        return { checked: true }
      })
      const bounded = Promise.race([run, interrupted])
      safetyQueue = bounded
      try { return await bounded } finally { interruptions.delete(id) }
    }
    if (type === 'process') {
      const pixels = await processImage(payload.path, payload.size, { ...payload.options, source: await source(payload.path), isCancelled: () => cancelled.has(id) })
      guard(id); return Array.from(pixels)
    }
    if (type === 'previewInit') {
      const node = directCanvas(payload.selector)
      for (const [key, previous] of previewViews) {
        previous.renderer.clear()
        if (key !== payload.canvasId) { canvases.delete(key); previous.node.width = previous.node.height = 1 }
      }
      previewViews.clear()
      node.width = payload.width * payload.dpr; node.height = payload.height * payload.dpr
      previewViews.set(payload.canvasId, { node, renderer: createBeadPreview(payload.pattern, canvas) })
      canvases.set(payload.canvasId, node)
      return true
    }
    if (type === 'previewDraw') {
      const view = previewViews.get(payload.canvasId)
      if (!view) throw new Error('预览已关闭，请重新打开')
      drawBeadPreview(view.node.getContext('2d'), view.renderer.texture(payload.state.finish), payload.state)
      return true
    }
    if (type === 'editorInit') {
      const node = directCanvas(payload.selector)
      for (const [key, previous] of editorViews) if (key !== payload.canvasId) {
        canvases.delete(key); previous.ctx.canvas.width = previous.ctx.canvas.height = 1
      }
      editorViews.clear()
      const ctx = drawEditorGrid(node, payload.pattern, payload.cell, payload.labels)
      editorViews.set(payload.canvasId, { ctx, cell: payload.cell, labels: payload.labels })
      canvases.set(payload.canvasId, node)
      return true
    }
    if (type === 'editorPatch') {
      const view = editorViews.get(payload.canvasId)
      if (!view) throw new Error('编辑画布已关闭，请重新打开')
      for (const item of payload.patch) drawEditorCell(view.ctx, item.row, item.col, item.color, view.cell, view.labels)
      return true
    }
    if (type === 'subject') {
      const img = await image(payload.path), node = canvas(MASK_SIZE, MASK_SIZE), ctx = node.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(img, 0, 0, MASK_SIZE, MASK_SIZE)
      const flat = extractFlatBackground(ctx.getImageData(0, 0, MASK_SIZE, MASK_SIZE).data)
      if (flat) { guard(id); return Array.from(flat) }
      node.width = node.height = INPUT_SIZE; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE); ctx.drawImage(img, 0, 0, INPUT_SIZE, INPUT_SIZE)
      const input = { type: 'float32', shape: [1, 3, INPUT_SIZE, INPUT_SIZE], data: prepareSubjectTensor(ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE).data).buffer }
      const output = await inference(id, 'subject', input, progress)
      guard(id); return Array.from(decodeSubjectOutput(output))
    }
    if (type === 'subjectRectangle') { const r = directCanvas(payload.selector).getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height } }
    if (type === 'subjectInit') {
      const img = await image(payload.path), stage = payload.stage
      const ratio = Math.min(stage / img.width, stage / img.height)
      const rect = { x: (stage - img.width * ratio) / 2, y: (stage - img.height * ratio) / 2, width: img.width * ratio, height: img.height * ratio }
      const src = canvas(Math.max(1, Math.round(rect.width * 2)), Math.max(1, Math.round(rect.height * 2)))
      src.getContext('2d').drawImage(img, 0, 0, src.width, src.height)
      const cutout = canvas(src.width, src.height)
      subjectViews.clear()
      subjectViews.set(payload.canvasId, { source: src, cutout, original: src.getContext('2d').getImageData(0, 0, src.width, src.height), rect, stage, dpr: payload.dpr })
      return rect
    }
    if (type === 'subjectRender') {
      const view = subjectViews.get(payload.canvasId)
      if (!view) throw new Error('主体画布已关闭，请重新打开')
      const node = directCanvas(payload.selector), { stage, dpr, rect } = view
      if (node.width !== Math.round(stage * dpr)) node.width = Math.round(stage * dpr)
      if (node.height !== Math.round(stage * dpr)) node.height = Math.round(stage * dpr)
      const ctx = node.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.fillStyle = '#f1efec'; ctx.fillRect(0, 0, stage, stage)
      for (let y = 0; y < stage; y += 12) for (let x = 0; x < stage; x += 12) if ((x / 12 + y / 12) % 2 === 0) { ctx.fillStyle = '#e5e2dc'; ctx.fillRect(x, y, 12, 12) }
      if (payload.mask) {
        const data = new ImageData(new Uint8ClampedArray(view.original.data), view.source.width, view.source.height)
        applySubjectMask(data.data, data.width, data.height, payload.mask)
        view.cutout.getContext('2d').putImageData(data, 0, 0)
      }
      ctx.drawImage(payload.mask && !payload.comparing ? view.cutout : view.source, rect.x, rect.y, rect.width, rect.height)
      if (payload.points?.length) { ctx.beginPath(); payload.points.forEach((p, i) => ctx[i ? 'lineTo' : 'moveTo'](rect.x + p.x * rect.width, rect.y + p.y * rect.height)); ctx.lineWidth = 2; ctx.strokeStyle = '#e8aa41'; ctx.stroke() }
      return true
    }
    if (type === 'loadImage') { const img = await image(payload.path), key = `img_${++sequence}`; images.set(key, img); if (images.size > 8) images.delete(images.keys().next().value); return { id: key, width: img.width, height: img.height } }
    if (type === 'canvas') { render(payload); return true }
    const node = canvases.get(payload.id)
    if (!node) throw new Error('画布不存在，请重新打开页面')
    if (type === 'pixels') { const pixels = node.getContext('2d').getImageData(...payload.args); return { width: pixels.width, height: pixels.height, data: Array.from(pixels.data) } }
    if (type === 'capture') return node.toDataURL('image/png')
    if (type === 'rectangle') { const r = node.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height } }
    throw new Error('未知图像任务')
  } catch (error) {
    error.stage ||= type
    console.warn('[app:image]', error.stage, error.message)
    if (type.startsWith('safe') && !error.safetyCode) { const safe = safetyError(); safe.stage = error.stage; safe.detail = error.detail || error.message; throw safe }
    throw error
  }
}
