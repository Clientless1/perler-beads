import { appRequest, appHost } from './bridge'
let serial = 0
export function createAppCanvas(width = 1, height = 1, selector = '') {
  const host = appHost(), id = `canvas_${++serial}`, commands = []
  let w = width, h = height, flushChain = Promise.resolve()
  const send = (type, payload) => appRequest(type, { id, ...payload }, { host })
  const flush = () => {
    if (!commands.length) return flushChain
    const batch = commands.splice(0)
    flushChain = flushChain.catch(() => {}).then(() => send('canvas', { selector, commands: batch }))
    return flushChain
  }
  commands.push(['width', width], ['height', height])
  const ctx = new Proxy({}, {
    set(_, property, value) { commands.push(['set', property, value]); return true },
    get(_, method) {
      if (method === 'flush') return flush
      if (method === 'createImageData') return (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) })
      if (method === 'getImageData') return async (...args) => { await flush(); const data = await send('pixels', { args }); return { ...data, data: new Uint8ClampedArray(data.data) } }
      if (method === 'putImageData') return (data, x, y) => commands.push(['putImageData', { width: data.width, height: data.height, data: Array.from(data.data) }, x, y])
      if (method === 'drawImage') return (source, ...args) => commands.push(['drawImage', source.__appImage || source.__appCanvas, ...args])
      return (...args) => commands.push(['call', method, args])
    },
  })
  return {
    __appCanvas: id, __appHost: host,
    get width() { return w }, set width(value) { w = value; commands.push(['width', value]) },
    get height() { return h }, set height(value) { h = value; commands.push(['height', value]) },
    getContext: () => ctx, flush,
    async capture() { await flush(); return send('capture', {}) },
    async rectangle() { await flush(); return send('rectangle', {}) },
  }
}
export async function loadAppImage(path, host) {
  const data = await appRequest('loadImage', { path }, { host })
  return { __appImage: data.id, width: data.width, height: data.height }
}
