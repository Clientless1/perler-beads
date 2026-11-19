import { safetyError } from './policy'
import { encodeBase64 } from './base64'
import modelInfo from '../../data/safety-model.json'

// A single worker owns the compatibility model. Heavy JS never runs on the
// page thread when WeChat workers are available; cancellation terminates it.
export async function loadWechatWorker(api, binary, onCancel = () => {}) {
  if (typeof api.createWorker !== 'function') throw safetyError('unsupported')
  let worker
  try { worker = api.createWorker('safetyWorkers/index.js', { useExperimentalWorker: true }) }
  catch { /* Older runtimes may only support the regular worker. */ }
  if (!worker) worker = api.createWorker('safetyWorkers/index.js')
  if (!worker) throw safetyError('unsupported')
  let closed = false, sequence = 0
  const tasks = new Map()
  function destroy(code = 'cancelled') {
    if (closed) return
    closed = true
    try { worker.terminate() } catch { /* A killed worker may already be gone. */ }
    for (const task of tasks.values()) {
      clearTimeout(task.timer); clearInterval(task.cancellation); task.reject(safetyError(code))
    }
    tasks.clear()
  }
  worker.onMessage(message => {
    const task = tasks.get(message.id)
    if (!task) return
    if (message.progress) { task.onProgress(message.progress); return }
    tasks.delete(message.id); clearTimeout(task.timer); clearInterval(task.cancellation)
    if (message.error) task.reject(safetyError(message.error))
    else task.resolve(message)
  })
  worker.onError?.(() => destroy('unavailable'))
  worker.onProcessKilled?.(() => destroy('unavailable'))
  function request(type, payload, { isCancelled = () => false, onProgress = () => {} } = {}) {
    if (closed || isCancelled()) return Promise.reject(safetyError('cancelled'))
    return new Promise((resolve, reject) => {
      const id = ++sequence
      const timer = setTimeout(() => destroy('timeout'), 30000)
      const cancellation = setInterval(() => { if (isCancelled()) destroy() }, 50)
      tasks.set(id, { resolve, reject, timer, cancellation, onProgress })
      try { worker.postMessage({ id, type, ...payload }) }
      catch { destroy('unavailable') }
    })
  }
  onCancel(destroy)
  try {
    const encodedModel = typeof binary === 'string' ? binary : null
    const bytes = encodedModel ? modelInfo.bytes : binary.byteLength
    if (encodedModel && encodedModel.length !== Math.ceil(bytes / 3) * 4) throw safetyError('resources')
    await request('begin', { bytes })
    // Bound serialization work per frame and wait for each acknowledgment.
    // This also makes cancellation during the first model load responsive.
    for (let offset = 0; offset < bytes; offset += 768 * 1024) {
      if (closed) throw safetyError('cancelled')
      const encoded = encodedModel ? encodedModel.slice(offset / 3 * 4, (offset + 768 * 1024) / 3 * 4) : encodeBase64(binary.slice(offset, offset + 768 * 1024))
      await request('chunk', { offset, encoded })
    }
    await request('load', { background: api.getSystemInfoSync().platform !== 'devtools' })
    return {
      async run({ rgb }, options) {
        const result = await request('run', { shape: rgb.shape, tensorType: rgb.type, encoded: encodeBase64(rgb.data) }, options)
        const scores = result.probabilities
        if (!Array.isArray(scores?.data) || scores.data.length !== 5 || scores.data.some(value => typeof value !== 'number' || !Number.isFinite(value))) throw safetyError()
        return { probabilities: { ...scores, data: new Float32Array(scores.data) } }
      },
      destroy: () => destroy(),
    }
  } catch (error) { destroy(); throw error }
  finally { onCancel(null) }
}
