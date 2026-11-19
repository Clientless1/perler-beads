export function createConvolutionKernel(exports) {
  const memory = new Float32Array(exports.memory.buffer)
  return (source, weights, outputs, channels, height, width, oh, ow, sy, sx, py, px, depthwise, spatial) => {
    const outputOffset = source.length + weights.length, length = outputs * oh * ow
    if (outputOffset + length > memory.length) throw new Error('kernel memory limit')
    memory.set(source, 0); memory.set(weights, source.length)
    if (spatial) exports.spatial(0, source.byteLength, outputOffset * 4, channels, height, width, outputs, oh, ow, sy, sx, py, px, depthwise ? 1 : 0)
    else exports.pointwise(0, source.byteLength, outputOffset * 4, channels, ow * oh, outputs)
    return memory.slice(outputOffset, outputOffset + length)
  }
}
