import modelInfo from '../../data/safety-model.json'
import { safetyError } from './policy'
import { isArrayBuffer } from './binary'
import { gunzipSync } from 'fflate'
import { decodeBase64, encodeBase64 } from './base64'

function timed(task, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(safetyError('timeout')), timeout)
    Promise.resolve().then(task).then(resolve, reject).finally(() => clearTimeout(timer))
  })
}

function importSafetyPackage(root) {
  // WeChat's asynchronous require downloads and mounts a normal subpackage.
  // Literal paths also let developer tools discover both cross-package modules.
  if (typeof require === 'undefined' || typeof require.async !== 'function') throw safetyError('unsupported')
  if (root === 'safety') return require.async('../../safety/resources.js')
  if (root === 'safetyExtra') return require.async('../../safetyExtra/resources.js')
  return require.async('../../safetyLast/resources.js')
}

export async function prepareSafetyModel(api, { force = false, importPackage = importSafetyPackage, isCancelled = () => false, onProgress = () => {} } = {}) {
  const guard = () => { if (isCancelled()) throw safetyError('cancelled') }
  guard()
  const fs = api.getFileSystemManager(), path = `${api.env.USER_DATA_PATH}/bead-safety-${modelInfo.version}.onnx`
  const infoFor = () => timed(() => new Promise((resolve, reject) => fs.getFileInfo({ filePath: path, digestAlgorithm: 'md5', success: resolve, fail: reject })))
  if (!force) try {
    const info = await infoFor()
    if (info.size === modelInfo.bytes && info.digest === modelInfo.md5) return path
  } catch { /* First use or invalid cache: rebuild from packaged resources. */ }
  // Package binary-file access differs across WeChat runtimes. Transport the
  // compressed bytes as JS module data so loading mounts the package and gets
  // the bytes atomically, without readCompressedFile or package-file reads.
  guard(); onProgress('正在加载检测资源…')
  const packedParts = await Promise.all(modelInfo.parts.map(part => timed(() => importPackage(part.root))))
  guard()
  const data = new Uint8Array(modelInfo.bytes)
  let offset = 0
  for (let i = 0; i < modelInfo.parts.length; i++) {
    onProgress(`正在准备检测资源…${i + 1}/${modelInfo.parts.length}`)
    await new Promise(resolve => setTimeout(resolve, 0)); guard()
    const part = modelInfo.parts[i], encoded = packedParts[i]
    if (typeof encoded !== 'string' || encoded.length !== Math.ceil(part.compressedBytes / 3) * 4) throw safetyError('resources')
    // Bound the output allocation to the pinned model part size.
    let unpacked
    try {
      const packed = decodeBase64(encoded)
      if (packed.byteLength !== part.compressedBytes) throw safetyError('resources')
      unpacked = gunzipSync(packed, { out: new Uint8Array(part.bytes) })
    }
    catch { throw safetyError('resources') }
    if (unpacked.byteLength !== part.bytes) throw safetyError('resources')
    data.set(unpacked, offset); offset += part.bytes
  }
  // Large native ArrayBuffers can be serialized byte-by-byte by the bridge.
  // A base64 string lets the filesystem decode directly without that stall.
  await new Promise(resolve => setTimeout(resolve, 0)); guard()
  const encoded = encodeBase64(data.buffer)
  await timed(() => new Promise((resolve, reject) => fs.writeFile({ filePath: path, data: encoded, encoding: 'base64', success: resolve, fail: reject })))
  guard()
  const info = await infoFor()
  if (info.size !== modelInfo.bytes || info.digest !== modelInfo.md5) throw safetyError()
  return path
}

export async function readSafetyModel(api, path, { base64 = false } = {}) {
  const fs = api.getFileSystemManager()
  if (typeof fs.readFile !== 'function') throw safetyError('unsupported')
  const result = await timed(() => new Promise((resolve, reject) => fs.readFile({ filePath: path, ...(base64 ? { encoding: 'base64' } : {}), success: resolve, fail: reject })))
  if (base64) {
    if (typeof result.data !== 'string' || result.data.length !== Math.ceil(modelInfo.bytes / 3) * 4) throw safetyError('resources')
    return result.data
  }
  if (!isArrayBuffer(result.data) || result.data.byteLength !== modelInfo.bytes) throw safetyError('resources')
  return result.data
}

export function loadSafetySession(api, model, onCancel, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    let session, settled = false, timer
    const ready = () => finish()
    const failure = () => finish(safetyError())
    function finish(error) {
      if (settled) return
      settled = true; clearTimeout(timer); onCancel(null)
      session?.offLoad?.(ready); session?.offError?.(failure)
      if (error) { session?.destroy?.(); reject(error) } else resolve(session)
    }
    try {
      session = api.createInferenceSession({ model, precisionLevel: 4, allowNPU: false, allowQuantize: false })
      timer = setTimeout(() => finish(safetyError('timeout')), timeoutMs)
      onCancel(() => finish(safetyError('cancelled')))
      if (!settled) { session.onError(failure); session.onLoad(ready) }
    } catch { failure() }
  })
}
