function srgbToLinear(c) {
  c = c / 255
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

const XN = 95.047
const YN = 100.0
const ZN = 108.883

function labF(t) {
  return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116
}

function rgbToLab(r, g, b) {
  const lr = srgbToLinear(r)
  const lg = srgbToLinear(g)
  const lb = srgbToLinear(b)

  const x = (0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb) * 100
  const y = (0.2126729 * lr + 0.7151522 * lg + 0.072175 * lb) * 100
  const z = (0.0193339 * lr + 0.119192 * lg + 0.9503041 * lb) * 100

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
  return palette.map((color, paletteIndex) => {
    const lab = rgbToLab(color.r, color.g, color.b)
    const chroma = getChroma(lab.a, lab.b)
    return {
      ...color,
      paletteIndex,
      L: lab.L,
      A: lab.a,
      B: lab.b,
      chroma,
      warmth: getWarmth(lab.a, lab.b),
      hue: chroma > 8 ? Math.atan2(lab.b, lab.a) : 0,
      isGreenish: GREENISH_CODES.has(color.code) || (lab.a < -10 && lab.b > 6),
      isMutedGreen: color.code === 'H98' || color.code === 'H101' || (lab.L > 68 && lab.a < -8 && lab.b > 6),
      isPurpleish: PURPLEISH_CODES.has(color.code) || (lab.a > 4 && lab.b < -10),
    }
  })
}

const GREENISH_CODES = new Set(['H10', 'H11', 'H47', 'H84', 'H98', 'H101', 'H102', 'H104'])
const PURPLEISH_CODES = new Set(['H45', 'H70', 'H96', 'H106', 'H107'])

function getChroma(a, b) {
  return Math.sqrt(a * a + b * b)
}

function getWarmth(a, b) {
  return b - a * 0.18
}

function isGreenishSource(a, b) {
  return (a < -10 && b > 6) || (a < -6 && b > 18)
}

function isGreenishTarget(target) {
  return target.isGreenish || (target.A < -10 && target.B > 6)
}

function isMutedGreenTarget(target) {
  return target.isMutedGreen || (target.L > 68 && target.A < -8 && target.B > 6)
}

function isPurpleishTarget(target) {
  return target.isPurpleish || (target.A > 4 && target.B < -10)
}

function getColorBiasPenalty(source, target, sourceChroma) {
  if (typeof target?.A !== 'number' || typeof target?.B !== 'number') {
    return 0
  }

  const sourceWarmth = source.warmth
  const sourceGreen = source.isGreenish
  const sourceNeutralLight = source.L > 76 && sourceChroma < 11
  const sourceWarmLight = source.L > 60 && sourceChroma < 28 && sourceWarmth > 10 && source.B > 6
  const sourceSoftWarm = source.L > 52 && source.L < 86 && sourceChroma < 22 && sourceWarmth > 9 && source.B > 5

  let penalty = 0

  if (!sourceGreen && isGreenishTarget(target)) {
    penalty += isMutedGreenTarget(target) ? 90 : 45

    if (sourceWarmLight) {
      penalty += isMutedGreenTarget(target) ? 170 : 100
    }

    if (sourceNeutralLight) {
      penalty += isMutedGreenTarget(target) ? 220 : 120
    }

    if (sourceSoftWarm && target.L > source.L - 8 && target.A < -12) {
      penalty += 55
    }
  }

  if (isPurpleishTarget(target)) {
    if (sourceNeutralLight) {
      penalty += 110
    } else if (sourceWarmLight) {
      penalty += 70
    } else if (sourceSoftWarm && target.B < -14) {
      penalty += 40
    }
  }

  return penalty
}

function toPatternBead(color) {
  return {
    code: color.code,
    name: color.name,
    r: color.r,
    g: color.g,
    b: color.b,
    hex: color.hex,
    paletteIndex: color.paletteIndex,
    L: color.L,
    A: color.A,
    B: color.B,
    chroma: color.chroma,
    warmth: color.warmth,
    hue: color.hue,
    isGreenish: color.isGreenish,
    isMutedGreen: color.isMutedGreen,
    isPurpleish: color.isPurpleish,
  }
}

function computeColorDistance(source, target) {
  const dL = source.L - target.L
  const da = source.A - target.A
  const db = source.B - target.B
  const sourceChroma = source.chroma
  const targetChroma = target.chroma ?? getChroma(target.A, target.B)
  const chromaDiff = sourceChroma - targetChroma

  let distance = dL * dL * 1.08 + da * da + db * db
  distance += chromaDiff * chromaDiff * 0.45

  if (sourceChroma < 12 && targetChroma > sourceChroma + 8) {
    distance += Math.pow(targetChroma - sourceChroma, 2) * 1.8
  }

  if (source.L > 78 && sourceChroma < 14 && targetChroma > 18) {
    distance += 180
  }

  if (source.L < 48 && sourceChroma < 18 && targetChroma > 24) {
    distance += 120
  }

  if (sourceChroma > 8 && targetChroma > 8) {
    const sourceHue = source.hue
    const targetHue = target.hue ?? Math.atan2(target.B, target.A)
    let hueDiff = Math.abs(sourceHue - targetHue)
    if (hueDiff > Math.PI) {
      hueDiff = Math.PI * 2 - hueDiff
    }

    const huePenaltyWeight = sourceChroma < 20 ? 10 : 18
    distance += hueDiff * hueDiff * huePenaltyWeight
  }

  distance += getColorBiasPenalty(source, target, sourceChroma)

  return distance
}

function colorDistance(source, target) {
  const cacheKey = target.paletteIndex
  if (typeof cacheKey === 'number' && source.distanceCache) {
    const cached = source.distanceCache[cacheKey]
    if (cached !== undefined) {
      return cached
    }

    const distance = computeColorDistance(source, target)
    source.distanceCache[cacheKey] = distance
    return distance
  }

  return computeColorDistance(source, target)
}

function rgbDistance(a, b) {
  const dr = a.r - b.r
  const dg = a.g - b.g
  const db = a.b - b.b
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

function findNearestIndex(source, palette) {
  let bestIndex = 0
  let bestDist = Infinity

  for (let i = 0; i < palette.length; i++) {
    const dist = colorDistance(source, palette[i])
    if (dist < bestDist) {
      bestDist = dist
      bestIndex = i
    }
  }

  return bestIndex
}

function buildOriginalCells(pixelData, gridSize) {
  const total = gridSize * gridSize
  const cells = new Array(total)

  for (let i = 0; i < total; i++) {
    const offset = i * 4
    const r = pixelData[offset]
    const g = pixelData[offset + 1]
    const b = pixelData[offset + 2]
    const lab = rgbToLab(r, g, b)
    const chroma = getChroma(lab.a, lab.b)

    cells[i] = {
      r,
      g,
      b,
      L: lab.L,
      A: lab.a,
      B: lab.b,
      chroma,
      warmth: getWarmth(lab.a, lab.b),
      hue: chroma > 8 ? Math.atan2(lab.b, lab.a) : 0,
      isGreenish: isGreenishSource(lab.a, lab.b),
      contrast: 0,
      distanceCache: [],
    }
  }

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const idx = row * gridSize + col
      const current = cells[idx]
      let diffSum = 0
      let count = 0

      const neighbors = [
        [row - 1, col],
        [row + 1, col],
        [row, col - 1],
        [row, col + 1],
      ]

      for (const [y, x] of neighbors) {
        if (y < 0 || y >= gridSize || x < 0 || x >= gridSize) continue
        diffSum += rgbDistance(current, cells[y * gridSize + x])
        count++
      }

      current.contrast = count ? diffSum / count : 0
    }
  }

  return cells
}

function getAutoMaxColors(gridSize, detailMode) {
  if (detailMode) {
    if (gridSize <= 29) return 14
    if (gridSize <= 58) return 28
    return 32
  }

  if (gridSize <= 29) return 12
  if (gridSize <= 58) return 16
  return 20
}

function buildLimitedPalette(originalCells, gridSize, palette, maxColors, detailMode) {
  if (!(maxColors > 0 && maxColors < palette.length)) return palette

  const scores = new Float32Array(palette.length)

  for (const cell of originalCells) {
    const idx = findNearestIndex(cell, palette)
    const edgeBonus = gridSize <= 29
      ? Math.min(6, cell.contrast / 12)
      : Math.min(gridSize <= 58 ? 4.5 : 3.5, cell.contrast / (gridSize <= 58 ? 16 : 20))
    const detailBonus = detailMode && gridSize <= 29
      ? (cell.L < 62 && cell.contrast > 14 ? 2 : cell.contrast > 18 ? 0.8 : 0)
      : detailMode && gridSize <= 58 && cell.L < 58 && cell.contrast > 18
        ? 1.5
        : 0
    scores[idx] += 1 + edgeBonus * (detailMode ? 1.2 : 0.6) + detailBonus
  }

  return Array.from(scores)
    .map((score, idx) => ({ idx, score }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxColors)
    .map(item => palette[item.idx])
}

function quantizeToPalette(originalCells, palette) {
  return originalCells.map(cell => {
    const nearest = palette[findNearestIndex(cell, palette)]
    return toPatternBead(nearest)
  })
}

function correctHueFamily(pattern, originalCells, palette, gridSize) {
  const adjusted = pattern.slice()

  for (let i = 0; i < pattern.length; i++) {
    const original = originalCells[i]
    const current = pattern[i]
    const sourceWarm = original.B - original.A * 0.15
    const targetWarm = current.B - current.A * 0.15
    const sourceChroma = Math.sqrt(original.A * original.A + original.B * original.B)
    const targetChroma = Math.sqrt(current.A * current.A + current.B * current.B)

    const warmSkinLike = original.L > 58 && original.L < 92 && sourceWarm > 5
    const warmBrownLike = original.L > 38 && original.L < 72 && sourceWarm > 10
    const neutralLight = original.L > 78 && sourceChroma < 10

    let shouldCorrect = false
    if ((warmSkinLike || warmBrownLike) && targetWarm < sourceWarm - 6) {
      shouldCorrect = true
    }
    if (neutralLight && targetChroma > sourceChroma + 8) {
      shouldCorrect = true
    }
    if (!shouldCorrect) continue

    const currentError = colorDistance(original, current)
    let best = current
    let bestError = currentError

    for (const candidate of palette) {
      const candidateWarm = candidate.B - candidate.A * 0.15
      const candidateChroma = Math.sqrt(candidate.A * candidate.A + candidate.B * candidate.B)

      if ((warmSkinLike || warmBrownLike) && candidateWarm < sourceWarm - 4) continue
      if (neutralLight && candidateChroma > sourceChroma + 6) continue

      const error = colorDistance(original, candidate)
      if (error < bestError) {
        best = candidate
        bestError = error
      }
    }

    if (best.code !== current.code) {
      adjusted[i] = toPatternBead(best)
    }
  }

  return adjusted
}

function restoreFineDetails(pattern, originalCells, palette, gridSize, detailMode) {
  if (!(detailMode && gridSize <= 58)) {
    return pattern
  }

  const restored = pattern.slice()

  for (let i = 0; i < pattern.length; i++) {
    const original = originalCells[i]
    if (original.contrast < (gridSize <= 29 ? 14 : 18)) continue

    const current = pattern[i]
    const currentError = colorDistance(original, current)
    let best = current
    let bestError = currentError

    for (const candidate of palette) {
      const error = colorDistance(original, candidate)
      if (error >= bestError) continue

      const darkerLine = original.L < (gridSize <= 29 ? 72 : 65) && candidate.L < current.L - (gridSize <= 29 ? 4 : 6)
      const brighterEdge = original.L > (gridSize <= 29 ? 68 : 72) && candidate.L > current.L + (gridSize <= 29 ? 4 : 6)
      const chromaShift = Math.abs(candidate.A - current.A) + Math.abs(candidate.B - current.B)

      if (darkerLine || brighterEdge || chromaShift > 12) {
        best = candidate
        bestError = error
      }
    }

    const threshold = gridSize <= 29 ? 12 : 24
    if (best.code !== current.code && bestError + threshold < currentError) {
      restored[i] = toPatternBead(best)
    }
  }

  return restored
}

function preserveLocalContrast(pattern, originalCells, palette, gridSize, detailMode) {
  if (!(detailMode && gridSize <= 58)) {
    return pattern
  }

  const adjusted = pattern.slice()

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const idx = row * gridSize + col
      const original = originalCells[idx]
      if (original.contrast < (gridSize <= 29 ? 15 : 20)) continue

      let neighborLuma = 0
      let neighborCount = 0
      for (let dy = -1; dy <= 1; dy++) {
        const y = row + dy
        if (y < 0 || y >= gridSize) continue
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          const x = col + dx
          if (x < 0 || x >= gridSize) continue
          neighborLuma += originalCells[y * gridSize + x].L
          neighborCount++
        }
      }

      const avgNeighborLuma = neighborCount ? neighborLuma / neighborCount : original.L
      const isDarkFeature = original.L + (gridSize <= 29 ? 7 : 10) < avgNeighborLuma
      const isLightFeature = original.L - (gridSize <= 29 ? 7 : 10) > avgNeighborLuma
      if (!isDarkFeature && !isLightFeature) continue

      const current = adjusted[idx]
      const currentError = colorDistance(original, current)
      let best = current
      let bestError = currentError

      for (const candidate of palette) {
        const matchesFeature =
          (isDarkFeature && candidate.L + (gridSize <= 29 ? 3 : 6) < current.L) ||
          (isLightFeature && candidate.L - (gridSize <= 29 ? 3 : 6) > current.L)
        if (!matchesFeature) continue

        const error = colorDistance(original, candidate)
        if (error < bestError) {
          best = candidate
          bestError = error
        }
      }

      const threshold = gridSize <= 29 ? 10 : 18
      if (best.code !== current.code && bestError + threshold < currentError) {
        adjusted[idx] = toPatternBead(best)
      }
    }
  }

  return adjusted
}

function refineFlatNoise(pattern, originalCells, gridSize, paletteMap, passes) {
  let current = pattern

  for (let pass = 0; pass < passes; pass++) {
    const next = current.slice()

    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        const idx = row * gridSize + col
        const bead = current[idx]
        const original = originalCells[idx]
        const countMap = new Map()

        for (let dy = -1; dy <= 1; dy++) {
          const y = row + dy
          if (y < 0 || y >= gridSize) continue
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue
            const x = col + dx
            if (x < 0 || x >= gridSize) continue
            const neighbor = current[y * gridSize + x]
            countMap.set(neighbor.code, (countMap.get(neighbor.code) || 0) + 1)
          }
        }

        const selfCount = countMap.get(bead.code) || 0
        if (selfCount > 0) continue

        let majorityCode = ''
        let majorityCount = 0
        for (const [code, count] of countMap.entries()) {
          if (count > majorityCount) {
            majorityCode = code
            majorityCount = count
          }
        }

        const minMajority = gridSize <= 29 ? 7 : gridSize <= 58 ? 6 : 5
        const contrastLimit = gridSize <= 29 ? 14 : gridSize <= 58 ? 18 : 24
        if (!majorityCode || majorityCount < minMajority) continue
        if (original.contrast > contrastLimit) continue
        if (gridSize <= 29 && original.L < 68 && original.contrast > 9) continue
        if (gridSize > 29 && gridSize <= 58 && original.L < 62 && original.contrast > 12) continue

        const currentTarget = paletteMap.get(bead.code)
        const replacementTarget = paletteMap.get(majorityCode)
        if (!currentTarget || !replacementTarget) continue

        const currentError = colorDistance(original, currentTarget)
        const replacementError = colorDistance(original, replacementTarget)

        if (replacementError <= currentError * 1.2 + 80) {
          next[idx] = toPatternBead(replacementTarget)
        }
      }
    }

    current = next
  }

  return current
}

function buildPatternRows(flatPattern, gridSize) {
  const rows = []
  for (let row = 0; row < gridSize; row++) {
    rows.push(flatPattern.slice(row * gridSize, (row + 1) * gridSize))
  }
  return rows
}

function buildColorUsage(flatPattern, fullPalette) {
  const usageMap = new Map()

  for (const bead of flatPattern) {
    usageMap.set(bead.code, (usageMap.get(bead.code) || 0) + 1)
  }

  const colorUsage = []
  for (const [code, count] of usageMap.entries()) {
    const entry = fullPalette.find(color => color.code === code)
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

export function matchAll(pixelData, gridSize, fullPalette, maxColors, options = {}) {
  const detailMode = options.detailMode !== false
  const enriched = enrichPalette(fullPalette)
  const originalCells = buildOriginalCells(pixelData, gridSize)
  const effectiveMaxColors = maxColors > 0 ? maxColors : 0
  const palette = buildLimitedPalette(originalCells, gridSize, enriched, effectiveMaxColors, detailMode)
  const quantized = quantizeToPalette(originalCells, palette)
  const hueCorrected = correctHueFamily(quantized, originalCells, palette, gridSize)
  const restored = restoreFineDetails(hueCorrected, originalCells, palette, gridSize, detailMode)
  const contrasted = preserveLocalContrast(restored, originalCells, palette, gridSize, detailMode)
  const paletteMap = new Map(palette.map(color => [color.code, color]))
  const cleaned = refineFlatNoise(
    contrasted,
    originalCells,
    gridSize,
    paletteMap,
    detailMode && gridSize <= 58 ? 0 : detailMode ? 1 : 2,
  )

  return {
    pattern: buildPatternRows(cleaned, gridSize),
    colorUsage: buildColorUsage(cleaned, fullPalette),
  }
}
