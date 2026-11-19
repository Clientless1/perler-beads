import { isArrayBuffer } from './binary'

export const SAFETY_MESSAGE = '内容含违规信息'
export const SAFETY_POLICY_VERSION = 'nsfw-local-v1'

export function safetyError(code = 'unavailable') {
  const messages = {
    blocked: SAFETY_MESSAGE,
    unavailable: '图片检测未完成，请重试',
    timeout: '图片检测超时，请重试',
    unsupported: '当前微信不支持本地图片检测，请更新微信',
    resources: '检测资源读取失败，请重新打开小程序后重试',
    cancelled: '已取消图片检测',
  }
  return Object.assign(new Error(messages[code] || messages.unavailable), { safetyCode: code })
}

// Product thresholds; these do not claim calibrated accuracy or WeChat approval.
// Do not expose category names or probabilities in the user-facing message.
export function assertSafeScores(tensor) {
  const shape = tensor?.dims || tensor?.shape
  if (tensor?.type !== 'float32' || !Array.isArray(shape) || shape.length !== 2 || shape[0] !== 1 || shape[1] !== 5) throw safetyError()
  let scores = tensor.data
  if (isArrayBuffer(scores)) {
    if (scores.byteLength !== 20) throw safetyError()
    scores = new Float32Array(scores)
  }
  if (!ArrayBuffer.isView(scores) || Object.prototype.toString.call(scores) !== '[object Float32Array]' || scores.length !== 5) throw safetyError()
  scores = new Float32Array(scores)
  if (scores.some(value => !Number.isFinite(value) || value < 0 || value > 1)) throw safetyError()
  if (Math.abs(scores.reduce((sum, value) => sum + value, 0) - 1) > 0.01) throw safetyError()
  // NSFWJS order: Drawing, Hentai, Neutral, Porn, Sexy.
  if (scores[1] >= 0.3 || scores[3] >= 0.3 || scores[1] + scores[3] >= 0.4 || scores[4] >= 0.7) throw safetyError('blocked')
}

// Match upstream RGB/[0,1] normalization and alignCorners bilinear resize.
export function prepareSafetyTensor(rgba, width, height, crop = { x: 0, y: 0, width, height }, size = 224) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || rgba?.length !== width * height * 4) throw safetyError()
  const plane = size * size, values = new Float32Array(plane * 3)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const sx = crop.x + x * (crop.width - 1) / (size - 1), sy = crop.y + y * (crop.height - 1) / (size - 1)
    const left = Math.floor(sx), top = Math.floor(sy), right = Math.min(width - 1, left + 1), bottom = Math.min(height - 1, top + 1)
    const dx = sx - left, dy = sy - top, dest = y * size + x
    for (let c = 0; c < 3; c++) {
      const a = rgba[(top * width + left) * 4 + c] / 255, b = rgba[(top * width + right) * 4 + c] / 255
      const d = rgba[(bottom * width + left) * 4 + c] / 255, e = rgba[(bottom * width + right) * 4 + c] / 255
      values[c * plane + dest] = (a + (b - a) * dx) * (1 - dy) + (d + (e - d) * dx) * dy
    }
  }
  return { type: 'float32', shape: [1, 3, size, size], data: values.buffer }
}

export function safetyCrops(width, height) {
  const crops = [{ x: 0, y: 0, width, height }]
  if (Math.max(width, height) / Math.min(width, height) > 1.4) {
    const edge = Math.min(width, height), long = Math.max(width, height)
    const count = Math.min(4, Math.ceil(long / edge))
    for (let i = 0; i < count; i++) {
      const offset = Math.round(i * (long - edge) / (count - 1))
      crops.push({ x: width > height ? offset : 0, y: height > width ? offset : 0, width: edge, height: edge })
    }
  }
  return crops
}
