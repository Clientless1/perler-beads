// file:// photos (including bundled examples) display in Android WebView but
// taint Canvas when drawn directly. Read their bytes through HTML5+ IO first;
// a data URL decodes in the current document without disabling WebView security.
export function readNativeImage(path, io, timeout = 20000) {
  return new Promise((resolve, reject) => {
    let finished = false, reader
    const finish = (error, data) => {
      if (finished) return
      finished = true; clearTimeout(timer)
      if (error) reject(Object.assign(new Error('图片读取失败，请重新选择'), { stage: 'image:read', detail: error.message || 'native file read failed' }))
      else resolve(data)
    }
    const timer = setTimeout(() => { finish(new Error('native file read timed out')); reader?.abort?.() }, timeout)
    try {
      io.resolveLocalFileSystemURL(path, entry => {
        if (finished) return
        entry.file(file => {
          if (finished) return
          reader = new io.FileReader()
          reader.onloadend = event => {
            const result = event?.target?.result || reader.result
            if (typeof result !== 'string' || !/^data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/i.test(result)) return finish(new Error('invalid image file data'))
            finish(null, result)
          }
          reader.onerror = () => finish(new Error('native file reader failed'))
          reader.readAsDataURL(file)
        }, error => finish(new Error(error?.message || 'native file unavailable')))
      }, error => finish(new Error(error?.message || 'native path unavailable')))
    } catch (error) { finish(error) }
  })
}

export async function imageDecodeSource(path, io) {
  if (/^(data:|blob:)/i.test(path)) return path
  if (/^(file:|content:)/i.test(path)) {
    if (!io?.resolveLocalFileSystemURL || !io?.FileReader) throw Object.assign(new Error('本地文件服务尚未就绪，请重新打开页面'), { stage: 'image:read' })
    return readNativeImage(path, io)
  }
  // Network sources need an origin-clean Blob too. A failed CORS request must
  // fail rather than fall back to a display-only, unreadable Image element.
  const response = await fetch(path)
  if (!response.ok) throw Object.assign(new Error('图片读取失败，请重试'), { stage: 'image:read' })
  return URL.createObjectURL(await response.blob())
}
