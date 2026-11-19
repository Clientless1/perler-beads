// App Vue's service layer has no DOM. Each page owns a renderjs endpoint;
// pixel buffers and inference stay in that endpoint's WebView/Worker.
const hosts = new Map(), pending = new Map()
let active = '', sequence = 0
function pageKey() {
  try { const stack = getCurrentPages(), page = stack[stack.length - 1]; return page?.$page?.id ?? page?.route ?? '' } catch { return '' }
}
const pages = new Map()
export function connectAppHost(id, send) { hosts.set(id, send); pages.set(id, pageKey()); active = id }
export function activateAppHost(id) { if (hosts.has(id)) active = id }
export function disconnectAppHost(id) {
  hosts.delete(id); pages.delete(id)
  if (active === id) { const remaining = [...hosts.keys()]; active = remaining[remaining.length - 1] || '' }
  for (const [key, task] of pending) if (task.host === id) settleAppReply({ id: key, error: { message: '页面已关闭', name: 'AbortError' } })
}
export function settleAppReply(reply) {
  const task = pending.get(reply.id)
  if (!task) return
  if (reply.progress) { task.onProgress?.(reply.progress); return }
  pending.delete(reply.id); clearTimeout(task.timer); clearInterval(task.cancellation)
  if (reply.error) task.reject(Object.assign(new Error(reply.error.message), reply.error))
  else task.resolve(reply.result)
}
export function appProgress(reply) { pending.get(reply.id)?.onProgress?.(reply.progress) }
export function appRequest(type, payload = {}, options = {}) {
  const host = options.host || appHost()
  if (!hosts.has(host)) return Promise.reject(new Error('图像引擎尚未就绪，请重新打开页面'))
  if (options.isCancelled?.()) return Promise.reject(Object.assign(new Error('任务已取消'), { name: 'AbortError', safetyCode: 'cancelled' }))
  const id = `image_${++sequence}`
  return new Promise((resolve, reject) => {
    const stop = error => {
      hosts.get(host)?.({ id: `${id}_cancel`, type: 'cancel', payload: { id } })
      settleAppReply({ id, error })
    }
    const timer = setTimeout(() => stop({ message: '本机图片处理超时，请重试', stage: type, safetyCode: type.startsWith('safe') ? 'timeout' : undefined }), options.timeout || 60000)
    const cancellation = setInterval(() => { if (options.isCancelled?.()) stop({ message: '任务已取消', name: 'AbortError', safetyCode: 'cancelled', stage: type }) }, 100)
    pending.set(id, { host, resolve, reject, timer, cancellation, onProgress: options.onProgress })
    hosts.get(host)({ id, type, payload })
  })
}
export function appHost() {
  const current = pageKey()
  return [...pages.keys()].reverse().find(id => pages.get(id) === current) || active
}
