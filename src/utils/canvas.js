// Canvas 2D nodes are supported by WeChat; H5 uses the actual canvas element.
export function getCanvasNode(selector, instance) {
  return new Promise(resolve => {
    // #ifdef H5
    const root = instance?.proxy?.$el
    const element = root?.querySelector ? (root.matches?.(selector) ? root : root.querySelector(selector)) : document.querySelector(selector)
    resolve(element?.tagName === 'CANVAS' ? element : element?.querySelector('canvas'))
    return
    // #endif
    // #ifndef H5
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
  // #ifdef H5
  return Promise.resolve(canvas.toDataURL('image/png'))
  // #endif
  // #ifndef H5
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
