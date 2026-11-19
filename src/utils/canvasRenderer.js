import { runNow, runInSlices } from './taskScheduler'

function textColor(bead) {
  return (bead.r * 299 + bead.g * 587 + bead.b * 114) / 1000 > 145 ? '#242321' : '#ffffff'
}

function roundedRect(ctx, x, y, size, radius) {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + size - radius, y)
  ctx.quadraticCurveTo(x + size, y, x + size, y + radius)
  ctx.lineTo(x + size, y + size - radius)
  ctx.quadraticCurveTo(x + size, y + size, x + size - radius, y + size)
  ctx.lineTo(x + radius, y + size)
  ctx.quadraticCurveTo(x, y + size, x, y + size - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

function* drawGrid(ctx, pattern, size, cell, labels, options = {}) {
  const total = size * cell, beads = options.mode === 'beads'
  const detailScale = Math.max(1, options.detailScale || 1)
  ctx.fillStyle = '#f9f8f5'
  ctx.fillRect(0, 0, total, total)
  for (let row = 0; row < size; row++) {
    yield
    for (let col = 0; col < size; col++) {
      const bead = pattern[row]?.[col]
      const x = col * cell, y = row * cell
      if (!bead) {
        ctx.fillStyle = (row + col) % 2 === 0 ? '#f1eee8' : '#f9f8f5'
        ctx.fillRect(x, y, cell, cell)
        continue
      }
      const faded = options.highlight && options.highlight !== bead.code
      ctx.globalAlpha = faded ? .12 : 1
      ctx.fillStyle = bead.hex
      if (beads && cell * detailScale >= 5) {
        const gap = Math.max(.6 / detailScale, cell * .07)
        roundedRect(ctx, x + gap, y + gap, cell - gap * 2, cell * .17)
        ctx.fill()
        ctx.beginPath()
        ctx.arc(x + cell / 2, y + cell / 2, Math.max(.5 / detailScale, cell * .11), 0, Math.PI * 2)
        ctx.fillStyle = '#00000024'
        ctx.fill()
      } else ctx.fillRect(x, y, cell, cell)
      if (labels && !faded && cell * detailScale >= 10) {
        // Full codes are essential: H01 and H101 must never look identical.
        ctx.font = `600 ${Math.max(5 / detailScale, cell * .25)}px sans-serif`
        ctx.fillStyle = textColor(bead)
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(bead.code, x + cell / 2, y + cell / 2, cell - 1)
      }
      ctx.globalAlpha = 1
    }
  }
  if (!beads || labels) {
    for (let i = 0; i <= size; i++) {
      const board = i > 0 && i < size && i % 29 === 0
      const major = i % 5 === 0 || i === size
      ctx.strokeStyle = board ? '#242321' : major ? '#58585870' : '#68686824'
      ctx.lineWidth = board ? 1.8 : major ? .85 : .4
      ctx.beginPath(); ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, total); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(0, i * cell); ctx.lineTo(total, i * cell); ctx.stroke()
    }
  }
  if (options.axis) {
    ctx.fillStyle = '#848484'
    ctx.font = `${Math.max(7, Math.min(12, cell * .4))}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (let i = 0; i < size; i++) {
      if (cell < 15 && i !== 0 && (i + 1) % 5 !== 0 && i !== size - 1) continue
      ctx.fillText(String(i + 1 + (options.colOffset || 0)), i * cell + cell / 2, -10)
      ctx.fillText(String(i + 1 + (options.rowOffset || 0)), -13, i * cell + cell / 2)
    }
  }
}

function preparePattern(canvas, pattern, size, labels, displaySize, options) {
  // Keep a fixed viewport while native scaling enlarges the canvas. Render
  // enough detail once, so pinching does not resize or redraw it every frame.
  const dpr = Math.min(Math.max(Math.min(uni.getSystemInfoSync().pixelRatio || 2, 3), options.detailScale || 1), 4096 / displaySize)
  canvas.width = Math.round(displaySize * dpr)
  canvas.height = Math.round(displaySize * dpr)
  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)
  ctx.fillStyle = '#f9f8f5'
  ctx.fillRect(0, 0, displaySize, displaySize)
  const inset = options.axis ? 24 : 0
  ctx.translate(inset, inset)
  return drawGrid(ctx, pattern, size, (displaySize - inset - (options.axis ? 6 : 0)) / size, labels, options)
}

export function drawPattern(canvas, pattern, size, labels, displaySize, options = {}) {
  const result = runNow(preparePattern(canvas, pattern, size, labels, displaySize, options))
  return canvas.flush ? canvas.flush().then(() => result) : result
}

export async function drawPatternAsync(canvas, pattern, size, labels, displaySize, options = {}) {
  const result = await runInSlices(preparePattern(canvas, pattern, size, labels, displaySize, options), options)
  await canvas.flush?.()
  return result
}

export function drawForExport(canvas, pattern, size, labels, options = {}) {
  const margin = 68, top = 160
  const usage = options.colorUsage || []
  let cell = 28, columns = 4
  // Unlimited colors can otherwise produce a >4096px canvas on a large board.
  while (top + size * cell + 64 + Math.ceil(usage.length / columns) * 66 + 100 + (options.attribution ? 60 : 0) > 4096 && cell > 16) {
    cell -= 2
    columns = Math.max(4, Math.floor(size * cell / 210))
  }
  const gridWidth = size * cell
  const width = Math.max(980, gridWidth + margin * 2)
  const legendTop = top + gridWidth + 64
  const height = legendTop + Math.ceil(usage.length / columns) * 66 + 100 + (options.attribution ? 60 : 0)
  canvas.width = width; canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fbfaf8'; ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#242321'; ctx.font = 'bold 38px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
  ctx.fillText(options.name || '我的拼豆图纸', margin, 38)
  ctx.font = '20px sans-serif'; ctx.fillStyle = '#868686'
  ctx.fillText(`${size} × ${size} 格   ·   ${usage.length} 色   ·   ${usage.reduce((n, c) => n + c.count, 0)} 颗豆   ·   ${options.paletteName || 'Hama'} 色卡`, margin, 94)
  ctx.save(); ctx.translate(margin, top)
  runNow(drawGrid(ctx, pattern, size, cell, labels, { axis: true, mode: labels ? 'grid' : 'beads' }))
  ctx.restore()
  ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = '#242321'; ctx.font = 'bold 25px sans-serif'
  ctx.fillText('用豆清单 / BEAD LIST', margin, legendTop - 8)
  usage.forEach((color, i) => {
    const x = margin + (i % columns) * ((width - margin * 2) / columns)
    const y = legendTop + 46 + Math.floor(i / columns) * 66
    ctx.fillStyle = color.hex; ctx.fillRect(x, y, 32, 32)
    ctx.strokeStyle = '#74747450'; ctx.lineWidth = 1; ctx.strokeRect(x, y, 32, 32)
    ctx.fillStyle = '#242321'; ctx.font = 'bold 20px sans-serif'; ctx.fillText(`${color.code}  × ${color.count}`, x + 43, y - 2)
    ctx.fillStyle = '#8b8b8b'; ctx.font = '16px sans-serif'; ctx.fillText(color.name, x + 43, y + 22)
  })
  ctx.fillStyle = '#9a9a9a'; ctx.font = '17px sans-serif'
  if (options.attribution) {
    ctx.font = '15px sans-serif'
    const a = options.attribution
    ctx.fillText(`${a.title} · ${a.author} · ${a.license} · Modified`, margin, height - 92)
    ctx.fillText(`${(a.url || '').replace(/^https?:\/\//, '')} · ${(a.licenseUrl || '').replace(/^https?:\/\//, '')}`, margin, height - 68, width-margin*2)
    ctx.font = '17px sans-serif'
  }
  ctx.fillText('豆物 · 拼豆工作室    每 5 格加粗，深色线为 29 格底板边界。空白格无需放豆。', margin, height - 38)
  return { width, height }
}
