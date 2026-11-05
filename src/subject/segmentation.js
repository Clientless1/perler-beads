import { MASK_SIZE, probabilitiesToMask } from '../utils/subjectMask'

export const INPUT_SIZE = 320
const MEAN = [.485, .456, .406], STD = [.229, .224, .225]

// Match U2Net/rembg's RGB, max-intensity normalization and NCHW layout.
export function prepareSubjectTensor(rgba) {
  const count = INPUT_SIZE * INPUT_SIZE, values = new Float32Array(count * 3)
  if (rgba.length !== count * 4) throw new Error('图片数据不完整，请重新选图')
  let max = 1
  for (let i = 0; i < count; i++) for (let c = 0; c < 3; c++) max = Math.max(max, rgba[i * 4 + c])
  for (let i = 0; i < count; i++) for (let c = 0; c < 3; c++) values[c * count + i] = (rgba[i * 4 + c] / max - MEAN[c]) / STD[c]
  return values
}

export function decodeSubjectOutput(tensor) {
  if (!tensor || tensor.type !== 'float32' || tensor.shape?.join(',') !== '1,1,320,320') throw new Error('主体识别结果格式异常，请重试')
  const data = tensor.data instanceof Float32Array ? tensor.data : new Float32Array(tensor.data)
  if (data.length !== INPUT_SIZE * INPUT_SIZE) throw new Error('主体识别结果不完整，请重试')
  let min = 1, max = 0
  for (const p of data) { if (!Number.isFinite(p)) throw new Error('主体识别结果异常，请重试'); min = Math.min(min, p); max = Math.max(max, p) }
  // Do not amplify numerical noise on a blank or uniform image into a fake subject.
  if (max - min < .1 || max < .2) throw new Error('没有找到清晰主体，请换张图片或手动圈选')
  const resized = new Float32Array(MASK_SIZE * MASK_SIZE)
  for (let y = 0; y < MASK_SIZE; y++) for (let x = 0; x < MASK_SIZE; x++) {
    const sx = (x + .5) * INPUT_SIZE / MASK_SIZE - .5, sy = (y + .5) * INPUT_SIZE / MASK_SIZE - .5
    const x0 = Math.floor(sx), y0 = Math.floor(sy), dx = sx - x0, dy = sy - y0
    const a = data[y0 * INPUT_SIZE + x0] * (1 - dx) + data[y0 * INPUT_SIZE + x0 + 1] * dx
    const b = data[(y0 + 1) * INPUT_SIZE + x0] * (1 - dx) + data[(y0 + 1) * INPUT_SIZE + x0 + 1] * dx
    resized[y * MASK_SIZE + x] = ((a * (1 - dy) + b * dy) - min) / (max - min)
  }
  return probabilitiesToMask(resized)
}

// Transparent artwork and clearly uniform backgrounds need no neural inference.
// Only exterior-connected background is removed, preserving white faces/clothes.
export function extractFlatBackground(rgba, size = MASK_SIZE) {
  if (rgba.length !== size * size * 4) throw new Error('图片数据不完整')
  const existing = new Uint8Array(size * size)
  let transparent = 0, visible = 0
  for (let i = 0; i < existing.length; i++) {
    existing[i] = rgba[i * 4 + 3]
    if (existing[i] < 128) transparent++; else visible++
  }
  if (transparent > size * size * .01 && visible > size * size * .002) return existing
  const border = [], buckets = new Map()
  for (let x = 0; x < size; x++) border.push(x, (size - 1) * size + x)
  for (let y = 1; y < size - 1; y++) border.push(y * size, y * size + size - 1)
  for (const i of border) {
    const p = i * 4, key = (rgba[p] >> 4) * 256 + (rgba[p + 1] >> 4) * 16 + (rgba[p + 2] >> 4)
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key).push(i)
  }
  const dominant = [...buckets.values()].sort((a, b) => b.length - a.length)[0]
  if (dominant.length < border.length * .7) return null
  const rgb = [0, 1, 2].map(c => dominant.reduce((n, i) => n + rgba[i * 4 + c], 0) / dominant.length)
  const background = i => rgba[i * 4 + 3] < 128 || Math.max(...rgb.map((v, c) => Math.abs(v - rgba[i * 4 + c]))) <= 24
  if (border.filter(background).length < border.length * .88) return null
  // Drawn outlines often have 1–5 px gaps. Close these gaps before flooding so
  // the character's white body is not mistaken for the surrounding white page.
  const foreground = Uint8Array.from(existing, (_, i) => background(i) ? 0 : 1)
  function morph(input, dilate) {
    const horizontal = new Uint8Array(input.length), output = new Uint8Array(input.length), radius = 3
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      let value = dilate ? 0 : 1
      for (let dx = -radius; dx <= radius; dx++) {
        const other = input[y * size + Math.max(0, Math.min(size - 1, x + dx))]
        value = dilate ? Math.max(value, other) : Math.min(value, other)
      }
      horizontal[y * size + x] = value
    }
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      let value = dilate ? 0 : 1
      for (let dy = -radius; dy <= radius; dy++) {
        const other = horizontal[Math.max(0, Math.min(size - 1, y + dy)) * size + x]
        value = dilate ? Math.max(value, other) : Math.min(value, other)
      }
      output[y * size + x] = value
    }
    return output
  }
  const barrier = morph(morph(foreground, true), false)
  const mask = new Uint8Array(size * size).fill(255), seen = new Uint8Array(size * size), queue = new Int32Array(size * size)
  let head = 0, tail = 0
  function visit(i) { if (!seen[i]) { seen[i] = 1; if (!barrier[i] && background(i)) queue[tail++] = i } }
  border.forEach(visit)
  while (head < tail) {
    const i = queue[head++], x = i % size, y = Math.floor(i / size)
    mask[i] = 0
    if (x) visit(i - 1)
    if (x < size - 1) visit(i + 1)
    if (y) visit(i - size)
    if (y < size - 1) visit(i + size)
  }
  const count = size * size - tail
  return count > size * size * .005 && count < size * size * .96 ? mask : null
}
