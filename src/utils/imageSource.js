export function createImageCanvas(width, height) {
  let canvas
  // #ifdef MP-WEIXIN
  if (typeof wx.createOffscreenCanvas !== 'function') throw new Error('请更新微信后重试')
  canvas = wx.createOffscreenCanvas({ type: '2d', width, height })
  // #endif
  // #ifdef H5
  canvas = document.createElement('canvas')
  canvas.width = width; canvas.height = height
  // #endif
  if (!canvas) throw new Error('当前环境不支持图片处理')
  return canvas
}

export function loadCanvasImage(canvas, path) {
  return new Promise((resolve, reject) => {
    let img
    // #ifdef MP-WEIXIN
    img = canvas.createImage()
    // #endif
    // #ifdef H5
    img = new Image()
    // #endif
    const timer = setTimeout(() => { img.onload = img.onerror = null; reject(new Error('图片加载超时，请重试')) }, 20000)
    img.onload = () => { clearTimeout(timer); resolve(img) }
    img.onerror = () => { clearTimeout(timer); reject(new Error('图片加载失败，请重新选择')) }
    img.src = path
  })
}

// Decode a photo once per editor session. Parameter changes reuse a bounded
// canvas, rather than repeatedly decoding a full-resolution camera photo.
export function createImageSourceLoader(maxEdge = 1280) {
  let currentPath = '', pending = null, version = 0
  return {
    load(path) {
      if (path === currentPath && pending) return pending
      currentPath = path
      const current = ++version
      pending = (async () => {
        const canvas = createImageCanvas(1, 1)
        let image, bitmap
        try {
          // Decode the Blob in the browser's image task, rather than forcing a
          // full camera JPEG decode from drawImage/createImageBitmap(img).
          // #ifdef H5
          if (typeof createImageBitmap === 'function') {
            try {
              const response = await fetch(path)
              if (!response.ok) throw new Error('图片打开失败')
              bitmap = await createImageBitmap(await response.blob())
              image = bitmap
            } catch { /* Fall back for formats unsupported by ImageBitmap. */ }
          }
          // #endif
          if (!image) image = await loadCanvasImage(canvas, path)
          if (current !== version) throw new Error('图片已更换')
          const scale = Math.min(1, maxEdge / Math.max(image.width, image.height))
          canvas.width = Math.max(1, Math.round(image.width * scale))
          canvas.height = Math.max(1, Math.round(image.height * scale))
          // #ifdef H5
          if (scale < 1 && typeof createImageBitmap === 'function') {
            try {
              const resized = await createImageBitmap(image, { resizeWidth: canvas.width, resizeHeight: canvas.height, resizeQuality: 'high' })
              bitmap?.close(); bitmap = resized; image = resized
            } catch { /* Canvas resizing remains available on older browsers. */ }
          }
          // #endif
          if (current !== version) throw new Error('图片已更换')
          canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
        } finally { bitmap?.close() }
        return canvas
      })().catch(error => { if (current === version) pending = null; throw error })
      return pending
    },
    clear() { version++; currentPath = ''; pending = null },
  }
}
