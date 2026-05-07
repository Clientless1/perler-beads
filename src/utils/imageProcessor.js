function clampByte(v) {
  return Math.max(0, Math.min(255, Math.round(v)))
}

function normalizeGridSize(gridSize) {
  return Math.max(29, Number(gridSize) || 29)
}

function getSampleScale(gridSize, detailMode) {
  if (detailMode) {
    if (gridSize <= 29) return 16
    if (gridSize <= 58) return 12
    return 6
  }

  if (gridSize <= 29) return 6
  if (gridSize <= 58) return 5
  return 4
}

function getContainRect(srcWidth, srcHeight, destSize) {
  const scale = Math.min(destSize / srcWidth, destSize / srcHeight)
  const drawWidth = srcWidth * scale
  const drawHeight = srcHeight * scale

  return {
    x: (destSize - drawWidth) / 2,
    y: (destSize - drawHeight) / 2,
    width: drawWidth,
    height: drawHeight,
  }
}

function getCornerAverageColor(img) {
  const size = 8
  const previewCanvas = wx.createOffscreenCanvas({ type: '2d', width: size, height: size })
  const previewCtx = previewCanvas.getContext('2d', { willReadFrequently: true })

  previewCtx.drawImage(img, 0, 0, size, size)
  const { data } = previewCtx.getImageData(0, 0, size, size)

  const corners = []
  for (let dy = 0; dy < 2; dy++) {
    for (let dx = 0; dx < 2; dx++) {
      corners.push((dy * size + dx) * 4)
      corners.push((dy * size + (size - 1 - dx)) * 4)
      corners.push(((size - 1 - dy) * size + dx) * 4)
      corners.push(((size - 1 - dy) * size + (size - 1 - dx)) * 4)
    }
  }

  let r = 0
  let g = 0
  let b = 0

  for (const idx of corners) {
    r += data[idx]
    g += data[idx + 1]
    b += data[idx + 2]
  }

  return {
    r: clampByte(r / corners.length),
    g: clampByte(g / corners.length),
    b: clampByte(b / corners.length),
  }
}

function buildSampleBuffer(imageData, sampleSize) {
  const out = new Uint8ClampedArray(sampleSize * sampleSize * 4)
  out.set(imageData.data)
  return out
}

function mixColor(a, b, t) {
  return {
    r: clampByte(a.r + (b.r - a.r) * t),
    g: clampByte(a.g + (b.g - a.g) * t),
    b: clampByte(a.b + (b.b - a.b) * t),
  }
}

function shiftColorLuminance(color, targetLuma, amount) {
  const currentLuma = getLuminance(color.r, color.g, color.b)
  const nextLuma = currentLuma + (targetLuma - currentLuma) * amount
  const delta = nextLuma - currentLuma

  return {
    r: clampByte(color.r + delta),
    g: clampByte(color.g + delta),
    b: clampByte(color.b + delta),
  }
}

function colorDistanceSq(a, b) {
  const dr = a.r - b.r
  const dg = a.g - b.g
  const db = a.b - b.b
  return dr * dr + dg * dg + db * db
}

function getLuminance(r, g, b) {
  return r * 0.299 + g * 0.587 + b * 0.114
}

function getPixelGradient(data, width, x, y) {
  const base = (y * width + x) * 4
  const rightX = Math.min(width - 1, x + 1)
  const downY = Math.min(width - 1, y + 1)
  const right = (y * width + rightX) * 4
  const down = (downY * width + x) * 4

  const diffRight =
    Math.abs(data[base] - data[right]) +
    Math.abs(data[base + 1] - data[right + 1]) +
    Math.abs(data[base + 2] - data[right + 2])
  const diffDown =
    Math.abs(data[base] - data[down]) +
    Math.abs(data[base + 1] - data[down + 1]) +
    Math.abs(data[base + 2] - data[down + 2])

  return (diffRight + diffDown) / 6
}

function getSampleWeight(dx, dy) {
  const distSq = dx * dx + dy * dy
  if (distSq >= 1) return 1
  if (distSq >= 0.64) return 1.15
  if (distSq >= 0.36) return 1.32
  if (distSq >= 0.16) return 1.5
  return 1.72
}

function sampleBlockColor(data, width, x0, y0, x1, y1, gridSize, detailMode) {
  let r = 0
  let g = 0
  let b = 0
  let count = 0
  let lumaSum = 0
  let minLuma = 255
  let maxLuma = 0
  let centerLumaSum = 0
  let centerCount = 0

  const cx = (x0 + x1 - 1) / 2
  const cy = (y0 + y1 - 1) / 2
  const halfW = Math.max(1, (x1 - x0) / 2)
  const halfH = Math.max(1, (y1 - y0) / 2)
  let weightedR = 0
  let weightedG = 0
  let weightedB = 0
  let weightSum = 0

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const idx = (y * width + x) * 4
      const pr = data[idx]
      const pg = data[idx + 1]
      const pb = data[idx + 2]
      const dx = (x - cx) / halfW
      const dy = (y - cy) / halfH
      const weight = getSampleWeight(dx, dy)
      const luma = getLuminance(pr, pg, pb)

      r += pr
      g += pg
      b += pb
      lumaSum += luma
      minLuma = Math.min(minLuma, luma)
      maxLuma = Math.max(maxLuma, luma)
      if (Math.abs(x - cx) <= 1 && Math.abs(y - cy) <= 1) {
        centerLumaSum += luma
        centerCount++
      }
      weightedR += pr * weight
      weightedG += pg * weight
      weightedB += pb * weight
      weightSum += weight
      count++
    }
  }

  if (!count) {
    return { r: 0, g: 0, b: 0 }
  }

  const avg = {
    r: clampByte(r / count),
    g: clampByte(g / count),
    b: clampByte(b / count),
  }

  const weighted = {
    r: clampByte(weightedR / weightSum),
    g: clampByte(weightedG / weightSum),
    b: clampByte(weightedB / weightSum),
  }

  let sampled = mixColor(avg, weighted, 0.12)
  if (!(detailMode && gridSize <= 58)) {
    return sampled
  }

  const avgLuma = lumaSum / count
  const centerLuma = centerCount ? centerLumaSum / centerCount : avgLuma
  const lumaRange = maxLuma - minLuma
  if (lumaRange < 22) {
    return sampled
  }

  let edgeDarkR = 0
  let edgeDarkG = 0
  let edgeDarkB = 0
  let edgeDarkWeight = 0
  let edgeDarkCount = 0
  let edgeLightR = 0
  let edgeLightG = 0
  let edgeLightB = 0
  let edgeLightWeight = 0
  let edgeLightCount = 0
  const darkThreshold = avgLuma - Math.max(8, lumaRange * 0.17)
  const lightThreshold = avgLuma + Math.max(10, lumaRange * 0.17)

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const idx = (y * width + x) * 4
      const pr = data[idx]
      const pg = data[idx + 1]
      const pb = data[idx + 2]
      const luma = getLuminance(pr, pg, pb)
      const gradient = getPixelGradient(data, width, x, y)
      const centerBias = Math.max(0, 1 - Math.max(Math.abs(x - cx) / Math.max(1, halfW), Math.abs(y - cy) / Math.max(1, halfH)))

      if (gradient > 22 && luma < darkThreshold) {
        const weight = 1 + (gradient - 22) / 30 + (avgLuma - luma) / 40 + centerBias * 0.45
        edgeDarkR += pr * weight
        edgeDarkG += pg * weight
        edgeDarkB += pb * weight
        edgeDarkWeight += weight
        edgeDarkCount++
      }

      if (gradient > 24 && luma > lightThreshold) {
        const weight = 1 + (gradient - 24) / 32 + (luma - avgLuma) / 44 + centerBias * 0.3
        edgeLightR += pr * weight
        edgeLightG += pg * weight
        edgeLightB += pb * weight
        edgeLightWeight += weight
        edgeLightCount++
      }
    }
  }

  const darkShare = edgeDarkCount / count
  const lightShare = edgeLightCount / count

  if (edgeDarkWeight > count * 0.06) {
    const darkEdge = {
      r: clampByte(edgeDarkR / edgeDarkWeight),
      g: clampByte(edgeDarkG / edgeDarkWeight),
      b: clampByte(edgeDarkB / edgeDarkWeight),
    }
    const centerPrefersDark = centerLuma < avgLuma - 4
    const blend = centerPrefersDark || darkShare < 0.32
      ? (gridSize <= 29 ? 0.2 : 0.16)
      : (gridSize <= 29 ? 0.12 : 0.1)
    sampled = shiftColorLuminance(sampled, getLuminance(darkEdge.r, darkEdge.g, darkEdge.b), blend)
  }

  if (edgeLightWeight > count * 0.08) {
    const lightEdge = {
      r: clampByte(edgeLightR / edgeLightWeight),
      g: clampByte(edgeLightG / edgeLightWeight),
      b: clampByte(edgeLightB / edgeLightWeight),
    }
    const centerPrefersLight = centerLuma > avgLuma + 6
    const blend = centerPrefersLight && lightShare < 0.35
      ? (gridSize <= 29 ? 0.12 : 0.1)
      : (gridSize <= 29 ? 0.08 : 0.06)
    sampled = shiftColorLuminance(sampled, getLuminance(lightEdge.r, lightEdge.g, lightEdge.b), blend)
  }

  return sampled
}

function getSmoothSigma(gridSize, detailMode) {
  if (detailMode) {
    if (gridSize <= 29) return 9
    if (gridSize <= 58) return 11
    return 18
  }

  if (gridSize <= 58) return 20
  return 24
}

function bilateralSmoothCells(cells, gridSize, detailMode) {
  const out = new Array(cells.length)
  const spatialWeights = [
    0.8, 1, 0.8,
    1, 1.4, 1,
    0.8, 1, 0.8,
  ]
  const sigma = getSmoothSigma(gridSize, detailMode)
  const sigmaSq = 2 * sigma * sigma

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const center = cells[row * gridSize + col]
      let totalR = 0
      let totalG = 0
      let totalB = 0
      let totalW = 0
      let kernelIndex = 0

      for (let dy = -1; dy <= 1; dy++) {
        const y = row + dy
        for (let dx = -1; dx <= 1; dx++) {
          const x = col + dx
          const spatialWeight = spatialWeights[kernelIndex++]
          if (y < 0 || y >= gridSize || x < 0 || x >= gridSize) continue

          const neighbor = cells[y * gridSize + x]
          const rangeWeight = Math.exp(-colorDistanceSq(center, neighbor) / sigmaSq)
          const weight = spatialWeight * rangeWeight

          totalR += neighbor.r * weight
          totalG += neighbor.g * weight
          totalB += neighbor.b * weight
          totalW += weight
        }
      }

      out[row * gridSize + col] = {
        r: clampByte(totalR / totalW),
        g: clampByte(totalG / totalW),
        b: clampByte(totalB / totalW),
      }
    }
  }

  return out
}

function measureCellContrast(cells, gridSize) {
  const contrasts = new Array(cells.length).fill(0)

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
        diffSum += Math.sqrt(colorDistanceSq(current, cells[y * gridSize + x]))
        count++
      }

      contrasts[idx] = count ? diffSum / count : 0
    }
  }

  return contrasts
}

function normalizeContrast(contrast, gridSize, detailMode) {
  if (detailMode) {
    if (gridSize <= 29) return Math.min(1, contrast / 18)
    if (gridSize <= 58) return Math.min(1, contrast / 26)
    return Math.min(1, contrast / 32)
  }

  return Math.min(1, contrast / 36)
}

function blendCells(base, detail, contrasts, baseAmount, edgeBoost, gridSize, detailMode) {
  return base.map((cell, idx) => {
    const edgeWeight = normalizeContrast(contrasts[idx], gridSize, detailMode)
    const maxAmount = detailMode && gridSize <= 58 ? 0.97 : 0.92
    const amount = Math.min(maxAmount, baseAmount + edgeWeight * edgeBoost)
    return mixColor(cell, detail[idx], amount)
  })
}

function enhanceContrast(cells, factor) {
  let avgR = 0
  let avgG = 0
  let avgB = 0

  for (const cell of cells) {
    avgR += cell.r
    avgG += cell.g
    avgB += cell.b
  }

  avgR /= cells.length
  avgG /= cells.length
  avgB /= cells.length

  return cells.map(cell => ({
    r: clampByte(avgR + (cell.r - avgR) * factor),
    g: clampByte(avgG + (cell.g - avgG) * factor),
    b: clampByte(avgB + (cell.b - avgB) * factor),
  }))
}

function enhanceSaturation(cells, factor) {
  return cells.map(cell => {
    const gray = cell.r * 0.299 + cell.g * 0.587 + cell.b * 0.114
    return {
      r: clampByte(gray + (cell.r - gray) * factor),
      g: clampByte(gray + (cell.g - gray) * factor),
      b: clampByte(gray + (cell.b - gray) * factor),
    }
  })
}

function sharpenCells(cells, gridSize, strength) {
  const out = new Array(cells.length)

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      let blurR = 0
      let blurG = 0
      let blurB = 0
      let count = 0

      for (let dy = -1; dy <= 1; dy++) {
        const y = row + dy
        if (y < 0 || y >= gridSize) continue
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          const x = col + dx
          if (x < 0 || x >= gridSize) continue
          const neighbor = cells[y * gridSize + x]
          blurR += neighbor.r
          blurG += neighbor.g
          blurB += neighbor.b
          count++
        }
      }

      const blur = {
        r: blurR / count,
        g: blurG / count,
        b: blurB / count,
      }
      const original = cells[row * gridSize + col]

      out[row * gridSize + col] = {
        r: clampByte(original.r + (original.r - blur.r) * strength),
        g: clampByte(original.g + (original.g - blur.g) * strength),
        b: clampByte(original.b + (original.b - blur.b) * strength),
      }
    }
  }

  return out
}

function getEnhancementProfile(gridSize, detailMode) {
  if (detailMode) {
    if (gridSize <= 29) return { contrast: 1.0, saturation: 1.0, sharpen: 0.06, detailBlend: 0.54, edgeBoost: 0.3 }
    if (gridSize <= 58) return { contrast: 1.0, saturation: 1.0, sharpen: 0.05, detailBlend: 0.48, edgeBoost: 0.24 }
    return { contrast: 1.0, saturation: 1.0, sharpen: 0.03, detailBlend: 0.3, edgeBoost: 0.1 }
  }

  if (gridSize <= 29) return { contrast: 1.03, saturation: 1.01, sharpen: 0.05, detailBlend: 0.24, edgeBoost: 0.12 }
  if (gridSize <= 58) return { contrast: 1.02, saturation: 1.01, sharpen: 0.04, detailBlend: 0.2, edgeBoost: 0.1 }
  return { contrast: 1.01, saturation: 1.01, sharpen: 0.03, detailBlend: 0.18, edgeBoost: 0.08 }
}

function buildPixelData(cells) {
  const pixels = new Uint8ClampedArray(cells.length * 4)

  for (let i = 0; i < cells.length; i++) {
    const idx = i * 4
    pixels[idx] = cells[i].r
    pixels[idx + 1] = cells[i].g
    pixels[idx + 2] = cells[i].b
    pixels[idx + 3] = 255
  }

  return pixels
}

export function processImage(imagePath, gridSize, options = {}) {
  return new Promise((resolve, reject) => {
    // #ifdef MP-WEIXIN
    const normalizedGrid = normalizeGridSize(gridSize)
    const detailMode = options.detailMode !== false
    const sampleScale = getSampleScale(normalizedGrid, detailMode)
    const sampleSize = normalizedGrid * sampleScale

    const sampleCanvas = wx.createOffscreenCanvas({ type: '2d', width: sampleSize, height: sampleSize })
    const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true })
    const img = sampleCanvas.createImage()

    img.onload = () => {
      const background = getCornerAverageColor(img)
      const contain = getContainRect(img.width, img.height, sampleSize)

      sampleCanvas.width = sampleSize
      sampleCanvas.height = sampleSize
      sampleCtx.fillStyle = `rgb(${background.r}, ${background.g}, ${background.b})`
      sampleCtx.fillRect(0, 0, sampleSize, sampleSize)
      sampleCtx.imageSmoothingEnabled = true
      sampleCtx.imageSmoothingQuality = 'high'
      sampleCtx.drawImage(img, contain.x, contain.y, contain.width, contain.height)

      const imageData = sampleCtx.getImageData(0, 0, sampleSize, sampleSize)
      const sampleBuffer = buildSampleBuffer(imageData, sampleSize)
      const cellSize = sampleSize / normalizedGrid
      const cells = []

      for (let row = 0; row < normalizedGrid; row++) {
        for (let col = 0; col < normalizedGrid; col++) {
          const x0 = Math.floor(col * cellSize)
          const y0 = Math.floor(row * cellSize)
          const x1 = Math.max(x0 + 1, Math.floor((col + 1) * cellSize))
          const y1 = Math.max(y0 + 1, Math.floor((row + 1) * cellSize))
          cells.push(sampleBlockColor(sampleBuffer, sampleSize, x0, y0, x1, y1, normalizedGrid, detailMode))
        }
      }

      const smoothed = bilateralSmoothCells(cells, normalizedGrid, detailMode)
      const contrastMap = measureCellContrast(cells, normalizedGrid)
      const profile = getEnhancementProfile(normalizedGrid, detailMode)
      const balanced = blendCells(
        smoothed,
        cells,
        contrastMap,
        profile.detailBlend,
        profile.edgeBoost,
        normalizedGrid,
        detailMode,
      )
      const enhanced = sharpenCells(
        enhanceSaturation(enhanceContrast(balanced, profile.contrast), profile.saturation),
        normalizedGrid,
        profile.sharpen,
      )

      resolve(buildPixelData(enhanced))
    }

    img.onerror = () => {
      reject(new Error('图片加载失败'))
    }

    img.src = imagePath
    // #endif

    // #ifndef MP-WEIXIN
    reject(new Error('仅支持微信小程序'))
    // #endif
  })
}
