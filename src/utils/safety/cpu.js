import { safetyError } from './policy'

// Small interpreter for the pinned float32 MobileNetV2 only. It uses the same
// checked ONNX bytes as native inference, including every trained weight.
// No browser, native AI, network or optional GPU API is required.
function fields(bytes) {
  let pos = 0
  function uint() {
    let value = 0, factor = 1, next
    do {
      if (pos >= bytes.length || factor > 2 ** 49) throw safetyError()
      next = bytes[pos++]; value += (next & 127) * factor; factor *= 128
    } while (next & 128)
    return value
  }
  const result = []
  while (pos < bytes.length) {
    const tag = uint(), wire = tag % 8
    let value
    if (wire === 0) value = uint()
    else if (wire === 2) {
      const length = uint()
      if (pos + length > bytes.length) throw safetyError()
      value = bytes.subarray(pos, pos + length); pos += length
    } else if (wire === 5) {
      if (pos + 4 > bytes.length) throw safetyError()
      value = new DataView(bytes.buffer, bytes.byteOffset + pos, 4).getFloat32(0, true); pos += 4
    } else throw safetyError()
    result.push([Math.floor(tag / 8), value])
  }
  return result
}
const first = (values, number) => values.find(([key]) => key === number)?.[1]
const all = (values, number) => values.filter(([key]) => key === number).map(([, value]) => value)
const ascii = bytes => { if (!(bytes instanceof Uint8Array) || bytes.some(value => value > 127)) throw safetyError(); return Array.from(bytes, value => String.fromCharCode(value)).join('') }
function ints(value) {
  if (typeof value === 'number') return [value]
  const output = []
  let number = 0, factor = 1
  for (const byte of value) {
    number += (byte & 127) * factor
    if (byte & 128) factor *= 128
    else { output.push(number); number = 0; factor = 1 }
  }
  if (factor !== 1) throw safetyError()
  return output
}
function tensor(shape, data) {
  const length = shape.reduce((total, value) => total * value, 1)
  if (!shape.every(value => Number.isInteger(value) && value > 0) || length > 4e6) throw safetyError()
  if (data && length !== data.length) throw safetyError()
  return { shape, data: data || new Float32Array(length) }
}
function parseModel(binary) {
  const graph = fields(first(fields(new Uint8Array(binary)), 7)), weights = new Map()
  for (const value of all(graph, 5)) {
    const items = fields(value), raw = first(items, 9)
    if (first(items, 2) !== 1 || !raw || raw.length % 4) throw safetyError()
    const data = new Float32Array(raw.length / 4), view = new DataView(raw.buffer, raw.byteOffset, raw.length)
    for (let i = 0; i < data.length; i++) data[i] = view.getFloat32(i * 4, true)
    weights.set(ascii(first(items, 8)), tensor(all(items, 1).flatMap(ints), data))
  }
  const nodes = all(graph, 1).map(value => {
    const items = fields(value), attributes = {}
    for (const attribute of all(items, 5)) {
      const values = fields(attribute), name = ascii(first(values, 1))
      attributes[name] = first(values, 2) ?? first(values, 3) ?? (first(values, 4) ? ascii(first(values, 4)) : all(values, 8).flatMap(ints))
    }
    return { op: ascii(first(items, 4)), inputs: all(items, 1).map(ascii), outputs: all(items, 2).map(ascii), attributes }
  })
  if (nodes.length < 1 || nodes.length > 300 || nodes[nodes.length - 1].outputs[0] !== 'probabilities') throw safetyError()
  // Fold adjacent normalization/activation into the convolution's write. Keep
  // both float32 rounding points so this executes the same trained model.
  const uses = new Map(), optimized = []
  for (const node of nodes) for (const name of node.inputs) uses.set(name, (uses.get(name) || 0) + 1)
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i], normalization = nodes[i + 1]
    if (node.op === 'Conv' && normalization?.op === 'BatchNormalization' && normalization.inputs[0] === node.outputs[0] && uses.get(node.outputs[0]) === 1) {
      const [gamma, beta, mean, variance] = normalization.inputs.slice(1).map(name => weights.get(name)?.data)
      if (!gamma || !beta || !mean || !variance) throw safetyError()
      const scale = Float64Array.from(gamma, (value, c) => value / Math.sqrt(variance[c] + normalization.attributes.epsilon))
      const attributes = { ...node.attributes, normalization: { scale, beta, mean } }
      const activation = nodes[i + 2]
      let outputs = normalization.outputs
      i++
      if (activation?.op === 'Clip' && activation.inputs[0] === outputs[0] && uses.get(outputs[0]) === 1) {
        attributes.activation = activation.attributes; outputs = activation.outputs; i++
      }
      optimized.push({ ...node, attributes, outputs })
    } else optimized.push(node)
  }
  return { weights, nodes: optimized }
}

async function conv(input, weight, bias, attributes, pause, convolution) {
  const [, channels, height, width] = input.shape, [outputs, perGroup, kh, kw] = weight.shape
  const groups = attributes.group || 1, [sy, sx] = attributes.strides || [1, 1]
  if (input.shape[0] !== 1 || perGroup * groups !== channels || (groups !== 1 && (groups !== channels || outputs !== channels))) throw safetyError()
  const same = attributes.auto_pad === 'SAME_UPPER'
  const oh = same ? Math.ceil(height / sy) : Math.floor((height - kh) / sy) + 1
  const ow = same ? Math.ceil(width / sx) : Math.floor((width - kw) / sx) + 1
  const py = same ? Math.floor(Math.max(0, (oh - 1) * sy + kh - height) / 2) : 0
  const px = same ? Math.floor(Math.max(0, (ow - 1) * sx + kw - width) / 2) : 0
  const accelerated = convolution && !bias && ((kh === 1 && kw === 1 && sx === 1 && sy === 1 && groups === 1) || (kh === 3 && kw === 3))
    ? convolution(input.data, weight.data, outputs, channels, height, width, oh, ow, sy, sx, py, px, groups !== 1, kh === 3) : null
  const output = tensor([1, outputs, oh, ow], accelerated), source = input.data, kernel = weight.data, dest = output.data
  const plane = width * height, resultPlane = ow * oh
  for (let oc = 0; oc < outputs; oc++) {
    const offset = oc * resultPlane, initial = bias?.data[oc] || 0
    const normalization = attributes.normalization, activation = attributes.activation
    const scale = normalization?.scale[oc], mean = normalization?.mean[oc], beta = normalization?.beta[oc]
    const store = value => {
      let result = Math.fround(value)
      if (normalization) result = Math.fround((result - mean) * scale + beta)
      return activation ? Math.min(activation.max, Math.max(activation.min, result)) : result
    }
    if (accelerated) {
      for (let p = 0; p < resultPlane; p++) dest[offset + p] = store(dest[offset + p])
    } else if (kh === 3 && kw === 3 && groups === channels) {
      const base = oc * plane, k = oc * 9
      const k0 = kernel[k], k1 = kernel[k + 1], k2 = kernel[k + 2]
      const k3 = kernel[k + 3], k4 = kernel[k + 4], k5 = kernel[k + 5]
      const k6 = kernel[k + 6], k7 = kernel[k + 7], k8 = kernel[k + 8]
      for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
        const iy = y * sy - py, ix = x * sx - px, row = base + iy * width + ix
        let sum = initial
        if (iy >= 0 && ix >= 0 && iy + 2 < height && ix + 2 < width) {
          sum += source[row] * k0; sum += source[row + 1] * k1; sum += source[row + 2] * k2
          sum += source[row + width] * k3; sum += source[row + width + 1] * k4; sum += source[row + width + 2] * k5
          sum += source[row + width * 2] * k6; sum += source[row + width * 2 + 1] * k7; sum += source[row + width * 2 + 2] * k8
        } else {
          for (let ky = 0; ky < 3; ky++) for (let kx = 0; kx < 3; kx++) {
            if (iy + ky >= 0 && iy + ky < height && ix + kx >= 0 && ix + kx < width) sum += source[row + ky * width + kx] * kernel[k + ky * 3 + kx]
          }
        }
        dest[offset + y * ow + x] = store(sum)
      }
    } else if (kh === 1 && kw === 1 && sx === 1 && sy === 1 && groups === 1) {
      // Pointwise convolutions dominate MobileNet. Compute four pixels per
      // weight read, retaining double accumulators until float32 storage.
      let p = 0
      for (; p + 3 < resultPlane; p += 4) {
        let a = initial, b = initial, c = initial, d = initial
        for (let ic = 0; ic < channels; ic++) {
          const value = kernel[oc * channels + ic], index = ic * plane + p
          a += source[index] * value; b += source[index + 1] * value
          c += source[index + 2] * value; d += source[index + 3] * value
        }
        dest[offset + p] = store(a); dest[offset + p + 1] = store(b); dest[offset + p + 2] = store(c); dest[offset + p + 3] = store(d)
      }
      for (; p < resultPlane; p++) {
        let sum = initial
        for (let ic = 0; ic < channels; ic++) sum += source[ic * plane + p] * kernel[oc * channels + ic]
        dest[offset + p] = store(sum)
      }
    } else {
      const channelStart = groups === 1 ? 0 : oc
      for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
        let sum = initial
        for (let ic = 0; ic < perGroup; ic++) for (let ky = 0; ky < kh; ky++) {
          const iy = y * sy + ky - py
          if (iy < 0 || iy >= height) continue
          for (let kx = 0; kx < kw; kx++) {
            const ix = x * sx + kx - px
            if (ix >= 0 && ix < width) sum += source[(channelStart + ic) * plane + iy * width + ix] * kernel[((oc * perGroup + ic) * kh + ky) * kw + kx]
          }
        }
        dest[offset + y * ow + x] = store(sum)
      }
    }
    if (pause.due()) await pause.wait()
  }
  return output
}
async function execute(node, inputs, pause, convolution) {
  const [input, weight, bias] = inputs, a = node.attributes, data = input.data, shape = input.shape
  if (node.op === 'Identity') return input
  if (node.op === 'Conv') return conv(input, weight, bias, a, pause, convolution)
  if (node.op === 'Flatten') return tensor([1, data.length], data)
  if (node.op === 'Pad') {
    const [,, h, w] = shape, pads = a.pads
    if (a.mode !== 'constant' || a.value !== 0 || pads[0] || pads[1] || pads[4] || pads[5]) throw safetyError()
    const output = tensor([1, shape[1], h + pads[2] + pads[6], w + pads[3] + pads[7]]), oh = output.shape[2], ow = output.shape[3]
    for (let c = 0; c < shape[1]; c++) for (let y = 0; y < h; y++) output.data.set(data.subarray((c * h + y) * w, (c * h + y + 1) * w), (c * oh + y + pads[2]) * ow + pads[3])
    return output
  }
  if (node.op === 'Gemm') {
    if (shape[0] !== 1 || weight.shape[0] !== data.length) throw safetyError()
    const columns = weight.shape[1], output = tensor([1, columns])
    for (let x = 0; x < columns; x++) {
      let sum = bias.data[x]
      for (let k = 0; k < data.length; k++) sum += data[k] * weight.data[k * columns + x]
      output.data[x] = sum
    }
    return output
  }
  if (node.op === 'AveragePool') {
    const [,, h, w] = shape, [kh, kw] = a.kernel_shape, [sy, sx] = a.strides
    const oh = Math.floor((h - kh) / sy) + 1, ow = Math.floor((w - kw) / sx) + 1, output = tensor([1, shape[1], oh, ow])
    for (let c = 0; c < shape[1]; c++) for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
      let sum = 0
      for (let ky = 0; ky < kh; ky++) for (let kx = 0; kx < kw; kx++) sum += data[(c * h + y * sy + ky) * w + x * sx + kx]
      output.data[(c * oh + y) * ow + x] = sum / (kh * kw)
    }
    return output
  }
  const output = tensor(shape), dest = output.data
  if (node.op === 'BatchNormalization') {
    const [gamma, beta, mean, variance] = inputs.slice(1).map(value => value.data), plane = data.length / shape[1]
    for (let c = 0; c < shape[1]; c++) {
      const scale = gamma[c] / Math.sqrt(variance[c] + a.epsilon), offset = c * plane
      for (let p = 0; p < plane; p++) dest[offset + p] = (data[offset + p] - mean[c]) * scale + beta[c]
    }
  } else if (node.op === 'Clip') {
    for (let i = 0; i < data.length; i++) dest[i] = Math.min(a.max, Math.max(a.min, data[i]))
  } else if (node.op === 'Relu') {
    for (let i = 0; i < data.length; i++) dest[i] = Math.max(0, data[i])
  } else if (node.op === 'Add') {
    if (weight.data.length !== data.length) throw safetyError()
    for (let i = 0; i < data.length; i++) dest[i] = data[i] + weight.data[i]
  } else if (node.op === 'Softmax') {
    if (a.axis !== 1 || data.length !== 5) throw safetyError()
    const max = Math.max(...data)
    let total = 0
    for (let i = 0; i < data.length; i++) { dest[i] = Math.exp(data[i] - max); total += dest[i] }
    for (let i = 0; i < data.length; i++) dest[i] /= total
  } else throw safetyError()
  return output
}

export function createCpuSafetySession(binary, { convolution } = {}) {
  let model = parseModel(binary), disposed = false, running = false
  return {
    destroy() { disposed = true; model = null },
    async run({ rgb }, { isCancelled = () => false, onProgress = () => {}, background = false } = {}) {
      const guard = () => { if (disposed || isCancelled()) throw safetyError('cancelled') }
      guard()
      if (running || rgb?.type !== 'float32' || rgb.shape?.join(',') !== '1,3,224,224' || rgb.data?.byteLength !== 224 * 224 * 3 * 4) throw safetyError()
      running = true
      try {
        const { nodes, weights } = model, values = new Map(weights), uses = new Map()
        for (const node of nodes) for (const name of node.inputs) uses.set(name, (uses.get(name) || 0) + 1)
        values.set('rgb', tensor(rgb.shape, new Float32Array(rgb.data)))
        let deadline = Date.now() + 8
        const pause = { due: () => !background && Date.now() >= deadline, wait: async () => { guard(); await new Promise(resolve => setTimeout(resolve, 0)); guard(); deadline = Date.now() + 8 } }
        for (let i = 0; i < nodes.length; i++) {
          guard()
          const node = nodes[i], inputs = node.inputs.map(name => values.get(name))
          if (inputs.some(value => !value)) throw safetyError()
          values.set(node.outputs[0], await execute(node, inputs, pause, convolution))
          for (const name of node.inputs) {
            uses.set(name, uses.get(name) - 1)
            if (!uses.get(name) && !weights.has(name)) values.delete(name)
          }
          if (i % 15 === 0) onProgress(`正在本机检测…${Math.round(i / nodes.length * 100)}%`)
          if (pause.due()) await pause.wait()
        }
        guard()
        return { probabilities: { ...values.get('probabilities'), type: 'float32' } }
      } finally { running = false }
    },
  }
}
