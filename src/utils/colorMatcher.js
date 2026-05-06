function clampByte(v) {
  return Math.max(0, Math.min(255, Math.round(v)))
}

function srgbToLinear(c) {
  c = c / 255
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

const XN = 95.047
const YN = 100.000
const ZN = 108.883

function labF(t) {
  return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116
}

function rgbToLab(r, g, b) {
  const lr = srgbToLinear(r)
  const lg = srgbToLinear(g)
  const lb = srgbToLinear(b)

  const x = (0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb) * 100
  const y = (0.2126729 * lr + 0.7151522 * lg + 0.0721750 * lb) * 100
  const z = (0.0193339 * lr + 0.1191920 * lg + 0.9503041 * lb) * 100

  const fx = labF(x / XN)
  const fy = labF(y / YN)
  const fz = labF(z / ZN)

  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  }
}

function enrichPalette(palette) {
  return palette.map(color => {
    const lab = rgbToLab(color.r, color.g, color.b)
    return { ...color, L: lab.L, A: lab.a, B: lab.b }
  })
}

function colorDistance(L, a, b, target) {
  const dL = L - target.L
  const da = a - target.A
  const db = b - target.B
  return dL * dL + da * da + db * db
}

function findNearestIndex(L, a, b, palette) {
  let bestIndex = 0
  let bestDist = Infinity

  for (let i = 0; i < palette.length; i++) {
    const dist = colorDistance(L, a, b, palette[i])
    if (dist < bestDist) {
      bestDist = dist
      bestIndex = i
    }
  }

  return bestIndex
}

function buildLimitedPalette(pixelData, gridSize, palette, maxColors) {
  if (!(maxColors > 0 && maxColors < palette.length)) return palette

  const totalPixels = gridSize * gridSize
  const frequency = new Int32Array(palette.length)

  for (let i = 0; i < totalPixels; i++) {
    const offset = i * 4
    const lab = rgbToLab(pixelData[offset], pixelData[offset + 1], pixelData[offset + 2])
    const idx = findNearestIndex(lab.L, lab.a, lab.b, palette)
    frequency[idx]++
  }

  return Array.from(frequency)
    .map((count, idx) => ({ idx, count }))
    .filter(item => item.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, maxColors)
    .map(item => palette[item.idx])
}

function quantizeToPalette(pixelData, gridSize, palette) {
  const strength = 0.45
  const total = gridSize * gridSize
  const floatR = new Float32Array(total)
  const floatG = new Float32Array(total)
  const floatB = new Float32Array(total)

  for (let i = 0; i < total; i++) {
    const offset = i * 4
    floatR[i] = pixelData[offset]
    floatG[i] = pixelData[offset + 1]
    floatB[i] = pixelData[offset + 2]
  }

  const quantized = new Array(total)

  for (let row = 0; row < gridSize; row++) {
    const leftToRight = row % 2 === 0
    const startCol = leftToRight ? 0 : gridSize - 1
    const endCol = leftToRight ? gridSize : -1
    const step = leftToRight ? 1 : -1

    for (let col = startCol; col !== endCol; col += step) {
      const i = row * gridSize + col
      const r = clampByte(floatR[i])
      const g = clampByte(floatG[i])
      const b = clampByte(floatB[i])

      const lab = rgbToLab(r, g, b)
      const nearest = palette[findNearestIndex(lab.L, lab.a, lab.b, palette)]

      quantized[i] = {
        code: nearest.code,
        name: nearest.name,
        r: nearest.r,
        g: nearest.g,
        b: nearest.b,
        hex: nearest.hex,
      }

      const errR = (r - nearest.r) * strength
      const errG = (g - nearest.g) * strength
      const errB = (b - nearest.b) * strength

      const fwd = step
      const nextCol = col + fwd
      const prevCol = col - fwd

      if (nextCol >= 0 && nextCol < gridSize) {
        const j = row * gridSize + nextCol
        floatR[j] += errR * 7 / 16
        floatG[j] += errG * 7 / 16
        floatB[j] += errB * 7 / 16
      }
      if (row + 1 < gridSize) {
        if (prevCol >= 0 && prevCol < gridSize) {
          const j = (row + 1) * gridSize + prevCol
          floatR[j] += errR * 3 / 16
          floatG[j] += errG * 3 / 16
          floatB[j] += errB * 3 / 16
        }
        const j2 = (row + 1) * gridSize + col
        floatR[j2] += errR * 5 / 16
        floatG[j2] += errG * 5 / 16
        floatB[j2] += errB * 5 / 16
        if (nextCol >= 0 && nextCol < gridSize) {
          const j = (row + 1) * gridSize + nextCol
          floatR[j] += errR * 1 / 16
          floatG[j] += errG * 1 / 16
          floatB[j] += errB * 1 / 16
        }
      }
    }
  }

  return quantized
}

function removeIsolatedPixels(pattern, gridSize) {
  const smoothed = pattern.slice()

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const idx = row * gridSize + col
      const current = pattern[idx]
      const countMap = new Map()

      for (let dy = -1; dy <= 1; dy++) {
        const y = row + dy
        if (y < 0 || y >= gridSize) continue
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          const x = col + dx
          if (x < 0 || x >= gridSize) continue
          const neighbor = pattern[y * gridSize + x]
          countMap.set(neighbor.code, (countMap.get(neighbor.code) || 0) + 1)
        }
      }

      const selfCount = countMap.get(current.code) || 0
      if (selfCount >= 2) continue

      let bestCode = null
      let bestCount = 0
      for (const [code, count] of countMap.entries()) {
        if (count > bestCount) {
          bestCode = code
          bestCount = count
        }
      }

      if (bestCode && bestCount >= 5) {
        const replacement = pattern.find(b => b.code === bestCode)
        if (replacement) {
          smoothed[idx] = { ...replacement }
        }
      }
    }
  }

  return smoothed
}

function removeRareColors(pattern, gridSize, palette) {
  const total = gridSize * gridSize
  const minCount = Math.max(3, Math.ceil(total * 0.004))

  const frequency = new Map()
  for (const bead of pattern) {
    frequency.set(bead.code, (frequency.get(bead.code) || 0) + 1)
  }

  const rareColors = new Set()
  for (const [code, count] of frequency.entries()) {
    if (count < minCount) rareColors.add(code)
  }

  if (rareColors.size === 0) return pattern

  const labPalette = palette.filter(c => !rareColors.has(c.code))
  if (labPalette.length === 0) return pattern

  const enriched = enrichPalette(labPalette)

  return pattern.map(bead => {
    if (!rareColors.has(bead.code)) return bead
    const lab = rgbToLab(bead.r, bead.g, bead.b)
    const nearest = enriched[findNearestIndex(lab.L, lab.a, lab.b, enriched)]
    return {
      code: nearest.code,
      name: nearest.name,
      r: nearest.r,
      g: nearest.g,
      b: nearest.b,
      hex: nearest.hex,
    }
  })
}

function buildPatternRows(flatPattern, gridSize) {
  const rows = []
  for (let row = 0; row < gridSize; row++) {
    rows.push(flatPattern.slice(row * gridSize, (row + 1) * gridSize))
  }
  return rows
}

function buildColorUsage(flatPattern, palette) {
  const usageMap = new Map()

  for (const bead of flatPattern) {
    usageMap.set(bead.code, (usageMap.get(bead.code) || 0) + 1)
  }

  const colorUsage = []
  for (const [code, count] of usageMap.entries()) {
    const entry = palette.find(color => color.code === code)
    if (!entry) continue
    colorUsage.push({
      code: entry.code,
      name: entry.name,
      hex: entry.hex,
      count,
    })
  }

  colorUsage.sort((a, b) => b.count - a.count)
  return colorUsage
}

export function matchAll(pixelData, gridSize, fullPalette, maxColors) {
  const enriched = enrichPalette(fullPalette)
  const palette = buildLimitedPalette(pixelData, gridSize, enriched, maxColors)
  const quantized = quantizeToPalette(pixelData, gridSize, palette)
  const cleaned = removeRareColors(
    removeIsolatedPixels(quantized, gridSize),
    gridSize,
    palette,
  )

  return {
    pattern: buildPatternRows(cleaned, gridSize),
    colorUsage: buildColorUsage(cleaned, palette),
  }
}
