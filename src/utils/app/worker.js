import { createCpuSafetySession } from '../safety/cpu'
import { createConvolutionKernel } from '../safety/wasm'
let safety, subject, ortReady, modelUrl
async function runtime(resources) {
  if (!ortReady) ortReady = (async () => {
    const ort = globalThis.ort
    ort.env.wasm.numThreads = 1; ort.env.wasm.proxy = false
    ort.env.wasm.wasmBinary = new Uint8Array(resources.wasm)
    modelUrl = URL.createObjectURL(new Blob([resources.module.replaceAll('import.meta.url', JSON.stringify(resources.moduleUrl))], { type: 'text/javascript' }))
    ort.env.wasm.wasmPaths = { mjs: modelUrl, wasm: resources.wasmUrl }
    ort.env.wasm.initTimeout = 25000
    return ort
  })()
  return ortReady
}
self.onmessage = async ({ data: { id, type, resources, input } }) => {
  try {
    let result
    if (type === 'loadSafety' || type === 'loadSubject') {
      const ort = await runtime(resources)
      let session
      try {
        session = await ort.InferenceSession.create(new Uint8Array(resources.model), { executionProviders: ['wasm'] })
        const native = session
        session = { run: async ({ rgb }) => native.run({ rgb: new ort.Tensor('float32', new Float32Array(rgb.data), rgb.shape) }) }
      } catch (error) {
        if (type !== 'loadSafety') throw error
        // Same trained model, in an isolated Worker; no heuristic/default pass.
        const kernel = await WebAssembly.instantiate(resources.convolution)
        session = createCpuSafetySession(resources.model, { convolution: createConvolutionKernel(kernel.instance.exports) })
      }
      if (type === 'loadSafety') safety = session; else subject = session
      result = { ready: true }
    } else {
      const output = await (type === 'safety' ? safety : subject).run({ rgb: input }, { background: true })
      const tensor = type === 'safety' ? output.probabilities : output.mask
      const data = tensor.data
      result = { tensor: { type: tensor.type || 'float32', shape: tensor.dims || tensor.shape, data } }
    }
    self.postMessage({ id, result })
  } catch (error) { self.postMessage({ id, error: { message: error.message || String(error), safetyCode: error.safetyCode } }) }
}
