// #ifdef APP-PLUS
import { createAppCanvas } from './app/canvasProxy'
const appCanvases = new WeakMap()
// #endif
// Canvas 2D nodes are supported by WeChat; H5 uses the actual canvas element.
export function getCanvasNode(selector, instance) {
  // #ifdef APP-PLUS
  const proxy = instance?.proxy || instance
  if (!proxy) return Promise.reject(new Error('缺少画布页面'))
  if (!appCanvases.has(proxy)) appCanvases.set(proxy, new Map())
  const nodes = appCanvases.get(proxy)
  if (!nodes.has(selector)) nodes.set(selector, createAppCanvas(1, 1, selector))
  return Promise.resolve(nodes.get(selector))
  // #endif
  return new Promise(resolve => {
    // #ifdef H5
    const root = instance?.proxy?.$el
    const element = root?.querySelector ? (root.matches?.(selector) ? root : root.querySelector(selector)) : document.querySelector(selector)
    // uni-h5 owns the inner canvas backing dimensions and its resize sensor can
    // reset them after a high-resolution render, retaining only the top-left
    // pixels. Use a native canvas with the same display size for direct 2D I/O.
    if (element?.tagName === 'UNI-CANVAS') {
      let direct = element.querySelector('canvas[data-direct-2d]')
      if (!direct) {
        direct = document.createElement('canvas')
        direct.setAttribute('data-direct-2d', '')
        Object.assign(direct.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' })
        element.appendChild(direct)
      }
      resolve(direct)
      return
    }
    resolve(element?.tagName === 'CANVAS' ? element : element?.querySelector('canvas'))
    return
    // #endif
    // #ifdef MP-WEIXIN
    const timer = setTimeout(() => resolve(null), 5000)
    let query = uni.createSelectorQuery()
    if (instance) query = query.in(instance.proxy || instance)
    query.select(selector).fields({ node: true, size: true }).exec(result => {
      clearTimeout(timer)
      resolve(result?.[0]?.node || null)
    })
    // #endif
  })
}

export function captureCanvas(canvas, canvasId) {
  // #ifdef APP-PLUS
  return canvas.capture().then(saveAppCanvas)
  // #endif
  // #ifdef H5
  return Promise.resolve(canvas.toDataURL('image/png'))
  // #endif
  // #ifdef MP-WEIXIN
  return new Promise((resolve, reject) => {
    uni.canvasToTempFilePath({
      canvas, canvasId,
      width: canvas.width, height: canvas.height,
      destWidth: canvas.width, destHeight: canvas.height,
      fileType: 'png',
      success: result => resolve(result.tempFilePath),
      fail: reject,
    })
  })
  // #endif
}

// #ifdef APP-PLUS
function saveAppCanvas(data) {
  return new Promise((resolve, reject) => {
    const bitmap = new plus.nativeObj.Bitmap(`bead_export_${Date.now()}`)
    const fail = error => { bitmap.clear(); reject(error) }
    plus.io.resolveLocalFileSystemURL('_doc/', root => root.getDirectory('exports', { create: true }, () => {
      bitmap.loadBase64Data(data, () => bitmap.save(`_doc/exports/beads_${Date.now()}.png`, { overwrite: true, format: 'png' }, result => { bitmap.clear(); resolve(result.target) }, fail), fail)
    }, fail), fail)
  })
}
// #endif
