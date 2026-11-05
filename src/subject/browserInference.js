// A dedicated bundle keeps uni-app's document-dependent runtime out of workers.
export async function loadBrowserSession(onCancel) {
  const worker = new Worker(new URL('./browserWorker.js', import.meta.url), { type: 'module' })
  const pending = new Map()
  let nextId = 0, closed = false
  function release() {
    if (closed) return
    closed = true; worker.terminate()
    for (const task of pending.values()) { clearTimeout(task.timer); task.reject(new Error('已取消提取')) }
    pending.clear()
  }
  function request(type, payload, transfer = []) {
    if (closed) return Promise.reject(new Error('已取消提取'))
    return new Promise((resolve, reject) => {
      const id = ++nextId
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('主体识别超时，请重试')); release() }, 45000)
      pending.set(id, { resolve, reject, timer })
      worker.postMessage({ id, type, ...payload }, transfer)
    })
  }
  worker.onmessage = ({ data }) => {
    const task = pending.get(data.id)
    if (!task) return
    pending.delete(data.id); clearTimeout(task.timer)
    if (data.error) task.reject(new Error(data.error)); else task.resolve(data)
  }
  worker.onerror = () => {
    for (const task of pending.values()) { clearTimeout(task.timer); task.reject(new Error('主体识别加载失败，请重试')) }
    pending.clear(); release()
  }
  onCancel(release)
  try {
    const base = new URL(import.meta.env.BASE_URL, location.href)
    await request('load', { paths: { runtime: new URL('static/onnx/', base).href, model: new URL('subject/static/subject-u2net.bin', base).href } })
    return { run: ({ rgb }) => request('run', { input: rgb }, [rgb.data]), release }
  } catch (error) { release(); throw error }
  finally { onCancel(null) }
}
