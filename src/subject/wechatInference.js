import modelInfo from './modelInfo.json'

const MODEL_FILE = '/subject/static/subject-u2net.br'
const MODEL_CACHE = `bead-subject-${modelInfo.version}.onnx`

function describe(error) {
  const detail = error?.detail || error
  if (typeof detail === 'string') return detail
  return detail?.errMsg || detail?.message || JSON.stringify(detail || {})
}
export function modelError(stage, error) {
  if (error?.stage) return error
  const result = new Error(describe(error))
  result.stage = stage
  result.detail = describe(error)
  return result
}
export function inferenceError(error, platform) {
  if (error?.diagnostic) return error
  const message = describe(error)
  let title = '主体识别失败，请重试或手动圈选'
  if (/开发者工具|不支持此 API/.test(message) || platform === 'devtools') title = '微信开发者工具不支持模型推理，请用微信真机预览'
  else if (/已取消/.test(message)) return new Error('已取消提取')
  else if (/timeout|超时/i.test(message)) title = '主体识别超时，请重试'
  else if (error?.stage === 'read') title = '识别资源读取失败，请重新编译预览'
  else if (error?.stage === 'unpack') title = '识别资源解压失败，请更新微信后重试'
  else if (error?.stage === 'write') title = '模型缓存写入失败，请检查手机存储空间'
  else if (error?.stage === 'load') title = '当前设备加载模型失败，可重试或手动圈选'
  const result = new Error(title)
  result.diagnostic = `阶段：${error?.stage || 'run'}\n模型：${modelInfo.version}\n原因：${message}`
  return result
}

// Only the transport is compressed; the native importer sees ordinary float32
// Conv constants, with storage casts/dequantization already folded offline.
export async function prepareWechatModel(api, { force = false } = {}) {
  const fs = api.getFileSystemManager(), path = `${api.env.USER_DATA_PATH}/${MODEL_CACHE}`
  if (!force) try {
    const info = await new Promise((resolve, reject) => fs.getFileInfo({ filePath: path, success: resolve, fail: reject }))
    if (info.size === modelInfo.bytes) return path
  } catch { /* first use */ }
  if (typeof fs.readCompressedFile !== 'function') throw modelError('unpack', new Error('当前微信不支持本地模型解压'))
  let source, failure
  for (const filePath of [MODEL_FILE, MODEL_FILE.slice(1)]) {
    try {
      source = await new Promise((resolve, reject) => fs.readCompressedFile({ filePath, compressionAlgorithm: 'br', success: resolve, fail: reject }))
      break
    } catch (error) { failure = error }
  }
  if (!source) throw modelError(/brotli|decompress|解压|1301111/i.test(describe(failure)) ? 'unpack' : 'read', failure)
  if (!source.data || source.data.byteLength !== modelInfo.bytes) throw modelError('unpack', new Error('主体模型文件不完整'))
  try { await new Promise((resolve, reject) => fs.writeFile({ filePath: path, data: source.data, success: resolve, fail: reject })) }
  catch (error) { throw modelError('write', error) }
  return path
}

export function loadWechatSession(api, model, onCancel, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    let candidate, settled = false, timer
    function cleanup() {
      clearTimeout(timer); onCancel(null)
      candidate?.offLoad?.(ready); candidate?.offError?.(fail)
    }
    function finish(error) {
      if (settled) return
      settled = true; cleanup()
      if (error) { candidate?.destroy?.(); reject(modelError('load', error)) } else resolve(candidate)
    }
    const ready = () => finish()
    const fail = error => finish(error || new Error('主体模型加载失败'))
    try {
      candidate = api.createInferenceSession({ model, precisionLevel: 4, allowNPU: false, allowQuantize: false })
      timer = setTimeout(() => finish(new Error('主体模型加载超时')), timeoutMs)
      onCancel(() => finish(new Error('已取消提取')))
      if (settled) return
      candidate.onError(fail); candidate.onLoad(ready)
    } catch (error) { finish(error) }
  })
}
