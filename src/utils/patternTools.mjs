export function summarizePattern(pattern) {
  const counts = new Map()
  for (const row of pattern) for (const color of row) if (color) {
    const value = counts.get(color.code) || { ...color, count: 0 }
    value.count++; counts.set(color.code, value)
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.code.localeCompare(b.code))
}
export function editCell(pattern, row, col, color, tool = 'brush') {
  if (!pattern[row] || col < 0 || col >= pattern[row].length) return pattern
  const next = pattern.map(line => line.slice()), original = pattern[row][col]?.code || null
  const replacement = tool === 'erase' ? null : color
  if (original === (replacement?.code || null)) return pattern
  if (tool === 'replace') {
    return next.map(line => line.map(cell => (cell?.code || null) === original ? replacement : cell))
  }
  if (tool !== 'fill') { next[row][col] = replacement; return next }
  const queue = [[row, col]], visited = new Set()
  while (queue.length) {
    const [y, x] = queue.pop(), key = `${y}:${x}`
    if (visited.has(key) || !next[y] || x < 0 || x >= next[y].length || (next[y][x]?.code || null) !== original) continue
    visited.add(key); next[y][x] = replacement
    queue.push([y - 1, x], [y + 1, x], [y, x - 1], [y, x + 1])
  }
  return next
}
export function reconcileProgress(before, after, completedCodes = [], completedBoards = []) {
  const affectedColors = new Set(), affectedBoards = new Set(), boardColumns = Math.ceil(after.length / 29)
  for (let row = 0; row < after.length; row++) for (let col = 0; col < after[row].length; col++) {
    const oldCode = before[row]?.[col]?.code, newCode = after[row][col]?.code
    if (oldCode === newCode) continue
    if (oldCode) affectedColors.add(oldCode)
    if (newCode) affectedColors.add(newCode)
    affectedBoards.add(Math.floor(row / 29) * boardColumns + Math.floor(col / 29))
  }
  const remaining = new Set(after.flat().filter(Boolean).map(color => color.code))
  return {
    completedCodes: completedCodes.filter(code => remaining.has(code) && !affectedColors.has(code)),
    completedBoards: completedBoards.filter(index => !affectedBoards.has(index)),
  }
}
export function inventoryReport(pattern, inventory, beadSize = 5, unitCostCents = 1) {
  const stock = new Map(inventory.map(item => [item.code, item]))
  const colors = summarizePattern(pattern).map(color => {
    const item = stock.get(color.code)
    return { ...color, stock: item?.quantity || 0, shortage: Math.max(0, color.count - (item?.quantity || 0)), costCents: color.count * (item?.unitCostCents ?? unitCostCents) }
  })
  return { colors, totalBeads: colors.reduce((sum, item) => sum + item.count, 0), shortage: colors.reduce((sum, item) => sum + item.shortage, 0), costCents: colors.reduce((sum, item) => sum + item.costCents, 0), widthCm: pattern.length * beadSize / 10, boardCount: Math.ceil(pattern.length / 29) ** 2 }
}
export function remapToInventory(pattern, palette) {
  if (!palette.length) throw new Error('请先在豆盒中添加有库存的色号')
  const cache = new Map()
  return pattern.map(row => row.map(color => {
    if (!color) return null
    if (!cache.has(color.code)) {
      let closest = palette[0], distance = Infinity
      for (const candidate of palette) {
        const d = 0.299 * (candidate.r - color.r) ** 2 + 0.587 * (candidate.g - color.g) ** 2 + 0.114 * (candidate.b - color.b) ** 2
        if (d < distance) { distance = d; closest = candidate }
      }
      cache.set(color.code, closest)
    }
    return cache.get(color.code)
  }))
}
export function encodeProject(entry) {
  const colorUsage = summarizePattern(entry.pattern)
  return JSON.stringify({ format: 'douwu-project', version: 1, exportedAt: new Date().toISOString(), work: { name: entry.name, pattern: entry.pattern, gridSize: entry.pattern.length, paletteName: entry.paletteName, attribution: entry.attribution || null, templateId: entry.templateId || '', completedCodes: entry.completedCodes || [], completedBoards: entry.completedBoards || [], beadSize: entry.beadSize || 5, unitCostCents: entry.unitCostCents ?? 1, colorUsage } })
}

export function transformPattern(pattern, operation) {
  const size=pattern.length
  if(operation==='mirror')return pattern.map(row=>row.slice().reverse())
  if(operation==='flip')return pattern.slice().reverse().map(row=>row.slice())
  if(operation==='rotate')return Array.from({length:size},(_,row)=>Array.from({length:size},(_,col)=>pattern[size-1-col][row]))
  throw new Error('不支持的图纸操作')
}
export function removeIsolatedBeads(pattern) {
  return pattern.map((line,row)=>line.map((color,col)=>{
    if(!color)return null
    // Remove disconnected single beads, retaining outline and facial details
    // connected to any neighboring bead, regardless of color.
    for(let y=row-1;y<=row+1;y++)for(let x=col-1;x<=col+1;x++)if((x!==col||y!==row)&&pattern[y]?.[x])return color
    return null
  }))
}

// A brush event copies each touched row once, and leaves previous undo snapshots intact.
export function paintCells(pattern, points, color, tool = 'brush', brush = 1) {
  const next = pattern.slice(), rows = new Set(), changed = new Map(), radius = Math.floor(brush / 2), replacement = tool === 'erase' ? null : color
  for (const point of points) for (let dy=-radius;dy<=radius;dy++) for (let dx=-radius;dx<=radius;dx++) {
    const row=point.row+dy,col=point.col+dx
    if(!pattern[row]||col<0||col>=pattern[row].length||(next[row][col]?.code||null)===(replacement?.code||null))continue
    if(!rows.has(row)){next[row]=next[row].slice();rows.add(row)}
    next[row][col]=replacement;changed.set(`${row}:${col}`,{row,col,color:replacement})
  }
  return {pattern:changed.size?next:pattern,patch:[...changed.values()]}
}
