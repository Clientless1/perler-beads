import { assertSafeScores, prepareSafetyTensor, safetyCrops, safetyError } from './policy'
// #ifdef MP-WEIXIN
import { prepareSafetyModel, loadSafetySession, readSafetyModel } from './wechat'
import { createCpuSafetySession } from './cpu'
import { loadWechatWorker } from './wechatWorker'
// #endif
// #ifdef H5
import { loadBrowserSafety } from './browser'
// #endif

export function createSafetyDetector() {
  let session = null, cancelLoad = null, disposed = false
  // Cache actual model inputs, never file paths or stored approval flags.
  // Re-selecting identical content still decodes it and checks every crop.
  const checkedInputs = []
  const sameInput = data => checkedInputs.some(previous => {
    const actual = new Uint32Array(data), expected = new Uint32Array(previous)
    return actual.length === expected.length && actual.every((value, i) => value === expected[i])
  })
  // #ifdef MP-WEIXIN
  let modelPath = '', compatible = false
  async function loadCompatible(guard, onProgress) {
    guard(); onProgress('正在准备兼容检测…')
    let candidate
    try {
      if (typeof wx.createWorker !== 'function') throw safetyError('unsupported')
      const encoded = await readSafetyModel(wx, modelPath, { base64: true })
      guard()
      candidate = await loadWechatWorker(wx, encoded, cancel => { cancelLoad = cancel })
    }
    catch {
      guard()
      const binary = await readSafetyModel(wx, modelPath)
      guard(); candidate = createCpuSafetySession(binary)
    }
    if (disposed) { candidate.destroy(); guard() }
    session?.destroy(); session = candidate; compatible = true
  }
  // #endif
  function dispose() { disposed = true; cancelLoad?.(); session?.destroy(); session = null; checkedInputs.length = 0 }
  return {
    async check(pixels, width, height, { isCancelled = () => false, onProgress = () => {} } = {}) {
      const guard = () => { if (disposed || isCancelled()) throw safetyError('cancelled') }
      let timer, cancellation
      try {
        guard()
        return await Promise.race([
          (async () => {
            if (!session) {
              onProgress('正在准备本地检测…')
              // #ifdef MP-WEIXIN
              modelPath = await prepareSafetyModel(wx, { isCancelled: () => disposed || isCancelled(), onProgress })
              guard()
              if (wx.getSystemInfoSync().platform !== 'devtools' && typeof wx.createInferenceSession === 'function') {
                try { session = await loadSafetySession(wx, modelPath, cancel => { cancelLoad = cancel }, 10000) }
                catch { guard() }
              }
              if (!session) await loadCompatible(guard, onProgress)
              // #endif
              // #ifdef H5
              const candidate = await loadBrowserSafety(cancel => { cancelLoad = cancel },onProgress)
              if (disposed) { candidate.destroy(); guard() }
              session = candidate
              // #endif
            }
            guard(); onProgress('正在检测图片…')
            for (const crop of safetyCrops(width, height)) {
              guard()
              const input = { rgb: prepareSafetyTensor(pixels, width, height, crop) }
              if (sameInput(input.rgb.data)) continue
              const checkedInput = input.rgb.data.slice(0)
              let output
              try { output = await session.run(input, { isCancelled: () => disposed || isCancelled(), onProgress }) }
              catch (error) {
                guard()
                // #ifdef MP-WEIXIN
                if (compatible) throw error
                await loadCompatible(guard, onProgress)
                output = await session.run(input, { isCancelled: () => disposed || isCancelled(), onProgress })
                // #endif
                // #ifndef MP-WEIXIN
                throw error
                // #endif
              }
              guard(); assertSafeScores(output?.probabilities)
              if (checkedInputs.length >= 6) checkedInputs.shift()
              checkedInputs.push(checkedInput)
            }
          })(),
          new Promise((_, reject) => {
            timer = setTimeout(() => { reject(safetyError('timeout')); dispose() }, 60000)
            cancellation = setInterval(() => { if (isCancelled()) { reject(safetyError('cancelled')); dispose() } }, 100)
          }),
        ])
      } catch (error) {
        dispose()
        throw error?.safetyCode ? error : safetyError()
      } finally { clearTimeout(timer); clearInterval(cancellation) }
    },
    dispose,
  }
}
