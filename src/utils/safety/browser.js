import { safetyError } from './policy'
export async function loadBrowserSafety(onCancel,onProgress=()=>{}) {
  const worker = new Worker(new URL('./browserWorker.js', import.meta.url), { type: 'module' })
  const tasks = new Map()
  let id = 0, closed = false
  function destroy() {
    if (closed) return
    closed = true; worker.terminate()
    for (const task of tasks.values()) { clearTimeout(task.timer); task.reject(safetyError('cancelled')) }
    tasks.clear()
  }
  function request(type, payload, transfer = []) {
    if (closed) return Promise.reject(safetyError('cancelled'))
    return new Promise((resolve, reject) => {
      const next = ++id
      const timer = setTimeout(() => { tasks.delete(next); reject(safetyError('timeout')); destroy() }, type==='load'?55000:30000)
      tasks.set(next, { resolve, reject, timer })
      worker.postMessage({ id: next, type, ...payload }, transfer)
    })
  }
  worker.onmessage = ({ data }) => {
    const task = tasks.get(data.id)
    if (!task) return
    if(data.progress){onProgress(data.progress);return}
    tasks.delete(data.id); clearTimeout(task.timer)
    if (data.error) task.reject(safetyError()); else task.resolve(data)
  }
  worker.onerror = () => { for (const task of tasks.values()) task.reject(safetyError()); destroy() }
  onCancel(destroy)
  try {
    const base = new URL(import.meta.env.BASE_URL, location.href)
    await request('load', { paths: { model: new URL('safety/static/nsfw.bin', base).href, runtime: new URL('static/onnx/', base).href } })
    return { run: ({ rgb }) => request('run', { input: rgb }, [rgb.data]), destroy }
  } catch (error) { destroy(); throw error }
  finally { onCancel(null) }
}
