import * as ort from 'onnxruntime-web/wasm'
let session
self.onmessage = async ({ data: { id, type, paths, input } }) => {
  try {
    if (type === 'load') {
      ort.env.wasm.numThreads = 1
      ort.env.wasm.proxy = false
      ort.env.wasm.wasmPaths = paths.runtime
      ort.env.wasm.initTimeout = 30000
      self.postMessage({id,progress:'首次使用，正在下载检测资源…'})
      const response=await fetch(paths.model)
      if(!response.ok)throw new Error('model unavailable')
      const reader=response.body.getReader(),chunks=[];let received=0
      for(;;){const {done,value}=await reader.read();if(done)break;chunks.push(value);received+=value.byteLength;self.postMessage({id,progress:`正在准备检测资源 · ${(received/1048576).toFixed(1)} MB`})}
      const model=new Uint8Array(received);let offset=0;for(const chunk of chunks){model.set(chunk,offset);offset+=chunk.length}
      self.postMessage({id,progress:'正在启动本地检测，请稍候…'})
      session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'] })
      self.postMessage({ id })
    } else {
      const result = await session.run({ rgb: new ort.Tensor('float32', new Float32Array(input.data), input.shape) })
      const output = result.probabilities
      self.postMessage({ id, probabilities: { type: output.type, shape: output.dims, data: output.data } }, [output.data.buffer])
    }
  } catch { self.postMessage({ id, error: true }) }
}
