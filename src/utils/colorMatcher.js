import { ciede2000 } from './colorScience'
import { runNow, runInSlices } from './taskScheduler'

// D65 sRGB → CIELAB. Palette reduction minimizes perceptual error over the whole image.
export function rgbToLab(r, g, b) {
  const linear = v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4 }
  const R = linear(r), G = linear(g), B = linear(b)
  const f = v => v > .008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116
  const x = f((.4124564 * R + .3575761 * G + .1804375 * B) / .95047)
  const y = f(.2126729 * R + .7151522 * G + .072175 * B)
  const z = f((.0193339 * R + .119192 * G + .9503041 * B) / 1.08883)
  return { L: 116 * y - 16, a: 500 * (x - y), b: 200 * (y - z) }
}
const cache = new WeakMap()
function prepare(palette) {
  if (!cache.has(palette)) cache.set(palette, palette.map(c => ({ ...c, lab: rgbToLab(c.r, c.g, c.b) })))
  return cache.get(palette)
}
function nearest(lab, colors) {
  let best = 0, distance = Infinity
  for (let i = 0; i < colors.length; i++) {
    const d = ciede2000(lab, colors[i].lab)
    if (d < distance) { distance = d; best = i }
  }
  return best
}
function* selectPalette(histogram, colors, limit) {
  const used = Array.from(histogram, ([index, count]) => ({ index, count, weight: Math.sqrt(count) }))
  if (!limit || used.length <= limit) return used.map(c => colors[c.index])
  const n = used.length, distances = new Float32Array(n * n)
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      const d = ciede2000(colors[used[a].index].lab, colors[used[b].index].lab) ** 2
      distances[a * n + b] = distances[b * n + a] = d
    }
    yield
  }
  // Start with the medoid, then add the color which removes most remaining error.
  const selected = [], remaining = new Float32Array(n).fill(1e6)
  while (selected.length < limit) {
    let winner = -1, gain = -1
    for (let c = 0; c < n; c++) {
      if (selected.includes(c)) continue
      let score = 0
      for (let p = 0; p < n; p++) score += used[p].weight * Math.max(0, remaining[p] - distances[p * n + c])
      if (score > gain) { gain = score; winner = c }
      if (c % 16 === 0) yield
    }
    if (winner < 0) break
    selected.push(winner)
    for (let p = 0; p < n; p++) remaining[p] = Math.min(remaining[p], distances[p * n + winner])
  }
  return selected.map(c => colors[used[c].index])
}

function* matchSteps(pixels, size, palette, maxColors = 0) {
  if (!palette.length) throw new Error('色卡为空，请重新选择')
  const colors = prepare(palette), samples = new Map(), histogram = new Map(), indices = new Int32Array(size * size).fill(-1)
  // Cache repeated source colors; transparent cells never enter the quantizer.
  for (let i = 0; i < size * size; i++) {
    if (i % 8 === 0) yield
    const p = i * 4
    if (pixels[p + 3] < 128) continue
    const r = pixels[p], g = pixels[p + 1], b = pixels[p + 2], key = (r << 16) | (g << 8) | b
    if (!samples.has(key)) {
      const lab = rgbToLab(r, g, b), index = nearest(lab, colors)
      samples.set(key, { lab, index })
    }
    const sample = samples.get(key)
    indices[i] = sample.index
    histogram.set(sample.index, (histogram.get(sample.index) || 0) + 1)
  }
  const limit = Math.max(0, Math.floor(Number(maxColors) || 0))
  const selected = yield* selectPalette(histogram, colors, limit)
  const limited = limit && histogram.size > limit
  if (limited) {
    let count = 0
    for (const sample of samples.values()) {
      sample.match = selected[nearest(sample.lab, selected)]
      if (++count % 32 === 0) yield
    }
  }
  const pattern = Array.from({ length: size }, () => Array(size).fill(null)), counts = new Map()
  for (let i = 0; i < indices.length; i++) {
    if (i % size === 0) yield
    if (indices[i] < 0) continue
    const p = i * 4, key = (pixels[p] << 16) | (pixels[p + 1] << 8) | pixels[p + 2]
    const color = limited ? samples.get(key).match : colors[indices[i]]
    const { lab, ...bead } = color
    pattern[Math.floor(i / size)][i % size] = bead
    if (!counts.has(bead.code)) counts.set(bead.code, { ...bead, count: 0 })
    counts.get(bead.code).count++
  }
  return { pattern, colorUsage: Array.from(counts.values()).sort((a, b) => b.count - a.count) }
}

export function matchAll(pixels, size, palette, maxColors = 0) {
  return runNow(matchSteps(pixels, size, palette, maxColors))
}

export function matchAllAsync(pixels, size, palette, maxColors = 0, options = {}) {
  return runInSlices(matchSteps(pixels, size, palette, maxColors), options)
}
