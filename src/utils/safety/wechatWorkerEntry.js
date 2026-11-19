import { createCpuSafetySession } from './cpu'
import { decodeBase64 } from './base64'
import modelInfo from '../../data/safety-model.json'
import { createConvolutionKernel } from './wasm'

let session, binary, received = 0, background = true
worker.onMessage(async ({ id, type, bytes, offset, encoded, shape, tensorType, background: isolated }) => {
  try {
    if (type === 'begin') {
      if (bytes !== modelInfo.bytes) throw new Error('invalid model length')
      binary = new Uint8Array(bytes); received = 0
      worker.postMessage({ id })
    } else if (type === 'chunk') {
      const chunk = decodeBase64(encoded)
      if (!binary || offset !== received || !chunk.length || chunk.length > 768 * 1024 || received + chunk.length > binary.length) throw new Error('invalid model chunk')
      binary.set(chunk, offset); received += chunk.length
      worker.postMessage({ id })
    } else if (type === 'load') {
      if (!binary || received !== binary.length) throw new Error('incomplete model')
      session?.destroy()
      let convolution
      try {
        if (typeof WXWebAssembly !== 'undefined') convolution = createConvolutionKernel((await WXWebAssembly.instantiate('/static/safety/convolutions.wasm', {})).instance.exports)
      } catch { /* The same model still runs on worker CPU if WASM is unavailable. */ }
      session = createCpuSafetySession(binary.buffer, { convolution })
      background = isolated
      binary = null
      worker.postMessage({ id, backend: convolution ? 'wasm' : 'cpu' })
    } else if (type === 'run' && session) {
      // The page can terminate this isolated worker at any point. Avoid the
      // main-thread timer yields here, which add substantial bridge overhead.
      const rgb = { shape, type: tensorType, data: decodeBase64(encoded).buffer }
      const result = await session.run({ rgb }, { background, onProgress: progress => worker.postMessage({ id, progress }) })
      worker.postMessage({ id, probabilities: { type: 'float32', shape: [1, 5], data: Array.from(result.probabilities.data) } })
    } else throw new Error('invalid worker request')
  } catch (error) { worker.postMessage({ id, error: error.safetyCode || 'unavailable' }) }
})
