// Area multisampling and dominant-color sampling follow the approach in
// Jett-Wu/Perler_Beads_Generator (MIT). Reimplemented for WeChat Canvas 2D.
import { createImageCanvas, loadCanvasImage } from './imageSource'
import { applySubjectMask, validateSubject } from './subjectMask'
import { runNow, runInSlices } from './taskScheduler'
const clamp = v => Math.max(0, Math.min(255, Math.round(v)))

// Work in premultiplied alpha: a transparent black/white border cannot tint the subject.
function* sampleSteps(data, sourceSize, size, style = 'photo') {
  const pixels = new Uint8ClampedArray(size * size * 4)
  const step = sourceSize / size
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (x === 0) yield
    const target = (y * size + x) * 4
    if (style === 'pixel') {
      const sx = Math.min(sourceSize - 1, Math.floor((x + .5) * step))
      const sy = Math.min(sourceSize - 1, Math.floor((y + .5) * step))
      pixels.set(data.subarray((sy * sourceSize + sx) * 4, (sy * sourceSize + sx) * 4 + 4), target)
      continue
    }
    let r = 0, g = 0, b = 0, alpha = 0, count = 0
    const buckets = new Map()
    for (let sy = Math.floor(y * step); sy < Math.floor((y + 1) * step); sy++) {
      for (let sx = Math.floor(x * step); sx < Math.floor((x + 1) * step); sx++) {
        const p = (sy * sourceSize + sx) * 4, a = data[p + 3] / 255
        alpha += a; count++
        r += data[p] * a; g += data[p + 1] * a; b += data[p + 2] * a
        if (style === 'illustration' && a > .1) {
          const key = (data[p] >> 5) * 64 + (data[p + 1] >> 5) * 8 + (data[p + 2] >> 5)
          if (!buckets.has(key)) buckets.set(key, { r: 0, g: 0, b: 0, weight: 0 })
          const c = buckets.get(key); c.r += data[p] * a; c.g += data[p + 1] * a; c.b += data[p + 2] * a; c.weight += a
        }
      }
    }
    if (alpha / count < .5) continue
    if (style === 'illustration' && buckets.size) {
      const dominant = Array.from(buckets.values()).sort((a, b) => b.weight - a.weight)[0]
      r = dominant.r; g = dominant.g; b = dominant.b; alpha = dominant.weight
    }
    pixels.set([clamp(r / alpha), clamp(g / alpha), clamp(b / alpha), 255], target)
  }
  return pixels
}

export function sampleGrid(data, sourceSize, size, style = 'photo') {
  return runNow(sampleSteps(data, sourceSize, size, style))
}

// Flood only from the border: white eyes and other enclosed details stay intact.
export function removeBorderWhite(pixels, size) {
  const queue = new Int32Array(size * size)
  const visited = new Uint8Array(size * size)
  let head = 0, tail = 0
  function visit(index) {
    if (visited[index]) return
    visited[index] = 1
    const i = index * 4
    const min = Math.min(pixels[i], pixels[i + 1], pixels[i + 2])
    const max = Math.max(pixels[i], pixels[i + 1], pixels[i + 2])
    if (pixels[i + 3] < 128 || (min >= 235 && max - min < 20)) queue[tail++] = index
  }
  for (let i = 0; i < size; i++) {
    visit(i); visit((size - 1) * size + i); visit(i * size); visit(i * size + size - 1)
  }
  while (head < tail) {
    const index = queue[head++]
    pixels[index * 4 + 3] = 0
    const x = index % size, y = Math.floor(index / size)
    if (x > 0) visit(index - 1)
    if (x < size - 1) visit(index + 1)
    if (y > 0) visit(index - size)
    if (y < size - 1) visit(index + size)
  }
  return pixels
}

export async function processImage(imagePath, gridSize, options = {}) {
    const size = Math.max(1, Number(gridSize) || 58)
    const style = options.style || (options.pixelArt ? 'pixel' : 'photo')
    const sampleSize = style === 'pixel' ? size : size * 7
    const canvas = createImageCanvas(sampleSize, sampleSize)
    const img = options.source || await loadCanvasImage(canvas, imagePath)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
      try {
        let source = img, sx = 0, sy = 0, sw = img.width, sh = img.height
        if (options.subject) {
          const selection = options.subject
          const bounds = validateSubject(selection.mask, selection.size)
          const scale = Math.min(1, Math.max(768, sampleSize) / Math.max(img.width, img.height))
          const layer = createImageCanvas(Math.max(1, Math.round(img.width * scale)), Math.max(1, Math.round(img.height * scale)))
          const layerCtx = layer.getContext('2d', { willReadFrequently: true })
          layerCtx.drawImage(img, 0, 0, layer.width, layer.height)
          const data = layerCtx.getImageData(0, 0, layer.width, layer.height)
          applySubjectMask(data.data, layer.width, layer.height, selection.mask, selection.size)
          layerCtx.putImageData(data, 0, 0)
          source = layer; sw = layer.width; sh = layer.height
          if (selection.autoFit) {
            // A little breathing room retains the full silhouette rather than clipping its edges.
            const x0 = Math.max(0, bounds.x - .035), y0 = Math.max(0, bounds.y - .035)
            sx = x0 * layer.width; sy = y0 * layer.height
            sw = (Math.min(1, bounds.x + bounds.width + .035) - x0) * layer.width
            sh = (Math.min(1, bounds.y + bounds.height + .035) - y0) * layer.height
          }
        }
        // Subject mode always contains the silhouette; cover would cut off head/limbs.
        const cover = options.fit === 'cover' && !options.subject
        const scale = cover ? Math.max(sampleSize / sw, sampleSize / sh) : Math.min(sampleSize / sw, sampleSize / sh)
        const width = sw * scale, height = sh * scale
        ctx.clearRect(0, 0, sampleSize, sampleSize)
        ctx.imageSmoothingEnabled = style !== 'pixel'
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(source, sx, sy, sw, sh, (sampleSize - width) / 2, (sampleSize - height) / 2, width, height)
        const pixels = await runInSlices(sampleSteps(ctx.getImageData(0, 0, sampleSize, sampleSize).data, sampleSize, size, style), options)
        return options.removeWhite && !options.subject ? removeBorderWhite(pixels, size) : pixels
      } catch (err) { throw new Error(err.message || '图片无法解析，请换成 JPG 或 PNG 图片重试') }
}
