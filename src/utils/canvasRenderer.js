function getTextColor(bead) {
  const brightness = (bead.r * 299 + bead.g * 587 + bead.b * 114) / 1000
  return brightness > 128 ? '#000000' : '#FFFFFF'
}

function getShortCode(bead, compact) {
  const shortCode = bead.code.replace(/^H/, '')
  if (!compact || shortCode.length <= 2) return shortCode
  return shortCode.slice(-2)
}

function roundRectPath(ctx, x, y, w, h, r) {
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, r)
  } else {
    ctx.moveTo(x + r, y)
    ctx.lineTo(x + w - r, y)
    ctx.arcTo(x + w, y, x + w, y + r, r)
    ctx.lineTo(x + w, y + h - r)
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
    ctx.lineTo(x + r, y + h)
    ctx.arcTo(x, y + h, x, y + h - r, r)
    ctx.lineTo(x, y + r)
    ctx.arcTo(x, y, x + r, y, r)
    ctx.closePath()
  }
}

function drawDetailedBead(ctx, x, y, size, hex, radius) {
  const cx = x + size / 2
  const cy = y + size / 2

  ctx.beginPath()
  roundRectPath(ctx, x, y, size, size, radius)
  ctx.fillStyle = hex
  ctx.fill()

  const grad = ctx.createRadialGradient(
    cx - size * 0.22, cy - size * 0.22, size * 0.04,
    cx + size * 0.05, cy + size * 0.05, size * 0.6,
  )
  grad.addColorStop(0, 'rgba(255,255,255,0.28)')
  grad.addColorStop(0.45, 'rgba(255,255,255,0.04)')
  grad.addColorStop(1, 'rgba(0,0,0,0.14)')
  ctx.beginPath()
  roundRectPath(ctx, x, y, size, size, radius)
  ctx.fillStyle = grad
  ctx.fill()

  const holeR = Math.max(0.8, size * 0.055)
  ctx.beginPath()
  ctx.arc(cx, cy, holeR, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(0,0,0,0.13)'
  ctx.fill()

  ctx.beginPath()
  ctx.arc(cx - holeR * 0.3, cy - holeR * 0.3, holeR * 0.4, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.15)'
  ctx.fill()
}

function drawSimpleBead(ctx, x, y, size, hex) {
  ctx.fillStyle = hex
  ctx.fillRect(x, y, size, size)
}

function drawBeadGrid(ctx, pattern, gridSize, cellPx, showLabels, isExport) {
  const totalSize = gridSize * cellPx
  const detailed = cellPx >= 7

  const gap = detailed
    ? Math.max(0.8, cellPx * 0.07)
    : (cellPx >= 4 ? 0.5 : 0)
  const radius = detailed ? Math.min(cellPx * 0.17, 5) : 0

  ctx.fillStyle = detailed ? '#D8D4CF' : '#E8E5E0'
  ctx.fillRect(0, 0, totalSize, totalSize)

  if (detailed) {
    const pegR = Math.max(0.6, cellPx * 0.04)
    ctx.fillStyle = '#C8C4BF'
    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        ctx.beginPath()
        ctx.arc(col * cellPx + cellPx / 2, row * cellPx + cellPx / 2, pegR, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const bead = pattern[row][col]
      const x = col * cellPx + gap / 2
      const y = row * cellPx + gap / 2
      const size = cellPx - gap

      if (detailed) {
        drawDetailedBead(ctx, x, y, size, bead.hex, radius)
      } else {
        drawSimpleBead(ctx, x, y, size, bead.hex)
      }
    }
  }

  if (!detailed && gap > 0) {
    ctx.strokeStyle = 'rgba(0,0,0,0.06)'
    ctx.lineWidth = 0.5
    for (let i = 1; i < gridSize; i++) {
      ctx.beginPath()
      ctx.moveTo(i * cellPx, 0)
      ctx.lineTo(i * cellPx, totalSize)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(0, i * cellPx)
      ctx.lineTo(totalSize, i * cellPx)
      ctx.stroke()
    }
  }

  if (showLabels) {
    const compact = cellPx < 12
    const fontSize = compact
      ? Math.max(4, Math.floor(cellPx * 0.36))
      : Math.max(6, Math.floor(cellPx * 0.32))

    ctx.font = `bold ${fontSize}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        const bead = pattern[row][col]
        const cx = col * cellPx + cellPx / 2
        const cy = row * cellPx + cellPx / 2

        ctx.fillStyle = 'rgba(0,0,0,0.25)'
        ctx.fillText(getShortCode(bead, compact), cx + 0.5, cy + 0.5)

        ctx.fillStyle = getTextColor(bead)
        ctx.fillText(getShortCode(bead, compact), cx, cy)
      }
    }
  }

  if (isExport) {
    for (let i = 1; i < gridSize; i++) {
      const major = i % 5 === 0
      ctx.strokeStyle = major ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.08)'
      ctx.lineWidth = major ? 1.5 : 0.5
      ctx.beginPath()
      ctx.moveTo(i * cellPx, 0)
      ctx.lineTo(i * cellPx, totalSize)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(0, i * cellPx)
      ctx.lineTo(totalSize, i * cellPx)
      ctx.stroke()
    }
  }
}

export function drawPattern(canvasNode, pattern, gridSize, showLabels, displaySize) {
  const dpr = uni.getSystemInfoSync().pixelRatio
  canvasNode.width = displaySize * dpr
  canvasNode.height = displaySize * dpr

  const ctx = canvasNode.getContext('2d')
  ctx.clearRect(0, 0, canvasNode.width, canvasNode.height)
  ctx.save()
  ctx.scale(dpr, dpr)

  const cellPx = displaySize / gridSize
  drawBeadGrid(ctx, pattern, gridSize, cellPx, showLabels, false)

  ctx.restore()
}

export function drawForExport(canvasNode, pattern, gridSize, showLabels) {
  const exportCellPx = 30
  const size = gridSize * exportCellPx

  canvasNode.width = size
  canvasNode.height = size
  const ctx = canvasNode.getContext('2d')
  ctx.clearRect(0, 0, size, size)

  drawBeadGrid(ctx, pattern, gridSize, exportCellPx, showLabels, true)
}
