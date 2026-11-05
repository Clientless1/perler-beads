import * as ort from 'onnxruntime-web/wasm'

let session
self.onmessage = async ({ data: { id, type, paths, input } }) => {
  try {
    if (type === 'load') {
      ort.env.wasm.numThreads = 1
      ort.env.wasm.proxy = false
      ort.env.wasm.initTimeout = 30000
      ort.env.wasm.wasmPaths = paths.runtime
      session = await ort.InferenceSession.create(paths.model, { executionProviders: ['wasm'] })
      self.postMessage({ id })
    } else {
      const output = await session.run({ rgb: new ort.Tensor('float32', new Float32Array(input.data), input.shape) })
      const mask = output.mask
      self.postMessage({ id, mask: { type: mask.type, shape: mask.dims, data: mask.data } }, [mask.data.buffer])
    }
  } catch (error) { self.postMessage({ id, error: error.message || String(error) }) }
}
