import { MASK_SIZE } from '../utils/subjectMask'
import { createImageCanvas, loadCanvasImage } from '../utils/imageSource'
import { INPUT_SIZE, prepareSubjectTensor, decodeSubjectOutput, extractFlatBackground } from './segmentation'
// #ifdef MP-WEIXIN
import { prepareWechatModel, loadWechatSession, inferenceError } from './wechatInference'
// #endif
// #ifdef H5
import { loadBrowserSession } from './browserInference'
// #endif

export function createSubjectExtractor() {
  let session = null, pending = null, disposed = false, cancelLoad = null
  let running = false, rebuildCache = false
  function ensureOpen() { if (disposed) throw new Error('已取消提取') }
  function release() {
    if (!session) return
    const previous = session
    session = null; pending = null
    // #ifdef MP-WEIXIN
    previous.destroy()
    // #endif
    // #ifdef H5
    Promise.resolve(previous.release()).catch(() => {})
    // #endif
  }
  async function load() {
    ensureOpen()
    if (!pending) pending = (async () => {
      // #ifdef MP-WEIXIN
      const platform = wx.getSystemInfoSync().platform
      if (platform === 'devtools') throw inferenceError(null, platform)
      if (typeof wx.createInferenceSession !== 'function') throw new Error('当前微信不支持模型推理，请更新微信')
      const path = await prepareWechatModel(wx, { force: rebuildCache })
      ensureOpen()
      session = await loadWechatSession(wx, path, callback => { cancelLoad = callback })
      // #endif
      // #ifdef H5
      const candidate = await loadBrowserSession(callback => { cancelLoad = callback })
      if (disposed) { await candidate.release(); ensureOpen() }
      session = candidate
      // #endif
      ensureOpen()
      return session
    })().catch(error => {
      pending = null
      // #ifdef MP-WEIXIN
      rebuildCache = true
      if (/当前微信/.test(error.message)) throw error
      if (!disposed) console.warn('[subject:model]', error.stage, error.detail || error.message)
      throw inferenceError(error, wx.getSystemInfoSync().platform)
      // #endif
      // #ifdef H5
      console.warn('[subject:model]', error)
      throw new Error('主体模型加载失败，请刷新页面后重试')
      // #endif
    })
    return pending
  }
  return {
    async extract(path, onProgress = () => {}) {
      if (running) throw new Error('正在提取主体，请稍候')
      running = true
      try {
        ensureOpen(); onProgress('正在分析图片…')
        const canvas = createImageCanvas(MASK_SIZE, MASK_SIZE), image = await loadCanvasImage(canvas, path)
        ensureOpen()
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        ctx.drawImage(image, 0, 0, MASK_SIZE, MASK_SIZE)
        const direct = extractFlatBackground(ctx.getImageData(0, 0, MASK_SIZE, MASK_SIZE).data)
        if (direct) return direct
        onProgress('正在加载主体识别…')
        const engine = await load()
        ensureOpen(); onProgress('正在提取主体…')
        canvas.width = canvas.height = INPUT_SIZE
        const inputCtx = canvas.getContext('2d', { willReadFrequently: true })
        // Composite onto white so transparent pixels cannot contaminate model RGB.
        inputCtx.fillStyle = '#fff'; inputCtx.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE)
        inputCtx.drawImage(image, 0, 0, INPUT_SIZE, INPUT_SIZE)
        const values = prepareSubjectTensor(inputCtx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE).data)
        const shape = [1, 3, INPUT_SIZE, INPUT_SIZE]
        let input = { type: 'float32', data: values.buffer, shape }
        let output, timer
        try {
          output = await Promise.race([
            engine.run({ rgb: input }),
            new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('主体识别超时，请重试')), 45000) }),
          ])
        } catch (error) {
          release()
          // #ifdef MP-WEIXIN
          throw inferenceError(error, wx.getSystemInfoSync().platform)
          // #endif
          // #ifdef H5
          console.warn('[subject:run]', error)
          throw new Error(/超时/.test(error.message) ? error.message : '主体识别失败，请刷新后重试')
          // #endif
        } finally { clearTimeout(timer) }
        ensureOpen()
        const tensor = output?.mask
        return decodeSubjectOutput({ type: tensor?.type, shape: tensor?.dims || tensor?.shape, data: tensor?.data })
      } finally { running = false }
    },
    dispose() { disposed = true; cancelLoad?.(); release() },
  }
}
