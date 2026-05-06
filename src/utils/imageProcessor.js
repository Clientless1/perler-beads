function clampByte(v) {
  return Math.max(0, Math.min(255, Math.round(v)))
}

function normalizeGridSize(gridSize) {
  return Math.max(29, Number(gridSize) || 29)
}

function getSampleScale(gridSize) {
  if (gridSize <= 29) return 6
  if (gridSize <= 58) return 4
  return 3
}

function buildSampleBuffer(imageData, sampleSize) {
  const out = new Uint8ClampedArray(sampleSize * sampleSize * 4)
  out.set(imageData.data)
  return out
}

function averageBlock(data, width, x0, y0, x1, y1) {
  let r = 0
  let g = 0
  let b = 0
  let count = 0

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const idx = (y * width + x) * 4
      r += data[idx]
      g += data[idx + 1]
      b += data[idx + 2]
      count++
    }
  }

  if (!count) {
    return { r: 0, g: 0, b: 0 }
  }

  return {
    r: clampByte(r / count),
    g: clampByte(g / count),
    b: clampByte(b / count),
  }
}

function enhanceContrast(cells, factor) {
  let avgR = 0, avgG = 0, avgB = 0
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
      let blurR = 0, blurG = 0, blurB = 0, wt = 0

      for (let dy = -1; dy <= 1; dy++) {
        const y = row + dy
        if (y < 0 || y >= gridSize) continue
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          const x = col + dx
          if (x < 0 || x >= gridSize) continue
          const cell = cells[y * gridSize + x]
          blurR += cell.r
          blurG += cell.g
          blurB += cell.b
          wt++
        }
      }

      blurR /= wt
      blurG /= wt
      blurB /= wt

      const orig = cells[row * gridSize + col]
      out[row * gridSize + col] = {
        r: clampByte(orig.r + (orig.r - blurR) * strength),
        g: clampByte(orig.g + (orig.g - blurG) * strength),
        b: clampByte(orig.b + (orig.b - blurB) * strength),
      }
    }
  }

  return out
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

export function processImage(imagePath, gridSize) {
  return new Promise((resolve, reject) => {
    // #ifdef MP-WEIXIN
    const normalizedGrid = normalizeGridSize(gridSize)
    const sampleScale = getSampleScale(normalizedGrid)
    const sampleSize = normalizedGrid * sampleScale

    const offCanvas = wx.createOffscreenCanvas({ type: '2d', width: sampleSize, height: sampleSize })
    const ctx = offCanvas.getContext('2d', { willReadFrequently: true })
    const img = offCanvas.createImage()

    img.onload = () => {
      const srcWidth = img.width
      const srcHeight = img.height
      const cropSize = Math.min(srcWidth, srcHeight)
      const sx = (srcWidth - cropSize) / 2
      const sy = (srcHeight - cropSize) / 2

      offCanvas.width = sampleSize
      offCanvas.height = sampleSize
      ctx.clearRect(0, 0, sampleSize, sampleSize)
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, sx, sy, cropSize, cropSize, 0, 0, sampleSize, sampleSize)

      const imageData = ctx.getImageData(0, 0, sampleSize, sampleSize)
      const sampleBuffer = buildSampleBuffer(imageData, sampleSize)
      const cellSize = sampleSize / normalizedGrid
      const cells = []

      for (let row = 0; row < normalizedGrid; row++) {
        for (let col = 0; col < normalizedGrid; col++) {
          const x0 = Math.floor(col * cellSize)
          const y0 = Math.floor(row * cellSize)
          const x1 = Math.max(x0 + 1, Math.floor((col + 1) * cellSize))
          const y1 = Math.max(y0 + 1, Math.floor((row + 1) * cellSize))
          cells.push(averageBlock(sampleBuffer, sampleSize, x0, y0, x1, y1))
        }
      }

      const enhanced = sharpenCells(
        enhanceSaturation(enhanceContrast(cells, 1.25), 1.15),
        normalizedGrid,
        0.3,
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
