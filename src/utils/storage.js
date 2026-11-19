const STORAGE_KEY = 'bead_history'
const MAX_ENTRIES = 20

function compressPattern(pattern) {
  const palette = new Map()
  const grid = pattern.map(row => row.map(bead => {
    if (!bead) return null
    if (!palette.has(bead.code)) palette.set(bead.code, { code: bead.code, name: bead.name, hex: bead.hex, r: bead.r, g: bead.g, b: bead.b })
    return bead.code
  }))
  return { palette: Array.from(palette.values()), grid }
}
function decompressPattern(compressed) {
  if (!compressed?.grid) return null
  const lookup = new Map(compressed.palette.map(color => [color.code, color]))
  return compressed.grid.map(row => row.map(code => code ? lookup.get(code) || null : null))
}
function getRawHistory() {
  try {
    const raw = uni.getStorageSync(STORAGE_KEY)
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    return Array.isArray(parsed) ? parsed.filter(entry => entry && typeof entry === 'object' && !Array.isArray(entry)) : []
  } catch { return [] }
}
function restoreEntry(entry) {
  if (!entry || typeof entry.id !== 'string' || !entry.id) return null
  try {
    const pattern = entry.compressed ? decompressPattern(entry.compressed) : entry.pattern
    if (!Array.isArray(pattern) || !pattern.length || pattern.length > 87 || pattern.some(row => !Array.isArray(row) || row.length !== pattern.length || row.some(color => color !== null && (!color || typeof color.code !== 'string' || !color.code || !/^#[0-9a-f]{6}$/i.test(color.hex))))) return null
    return {
      ...entry, pattern, gridSize: pattern.length,
      name: typeof entry.name === 'string' && entry.name.trim() ? entry.name : '我的小作品',
      colorUsage: Array.isArray(entry.colorUsage) ? entry.colorUsage.filter(color => color && typeof color.code === 'string' && Number.isFinite(color.count) && color.count >= 0) : [],
      completedCodes: Array.isArray(entry.completedCodes) ? entry.completedCodes.filter(code => typeof code === 'string') : [],
    }
  } catch { return null }
}
export function getHistory() {
  return getRawHistory().map(restoreEntry).filter(Boolean)
}
export function savePattern(entry) {
  const list = getRawHistory()
  const compressed = compressPattern(entry.pattern)
  // Compare every cell, so patterns that differ in small details stay separate.
  const signature = JSON.stringify(compressed.grid)
  const duplicate = list.find(item => {
    const restored = restoreEntry(item)
    return restored && (item.paletteName || 'Hama') === (entry.paletteName || 'Hama') && item.gridSize === entry.gridSize && JSON.stringify(restored.pattern.map(row => row.map(c => c?.code || null))) === signature
  })
  if (duplicate) return duplicate.id
  const record = { id: `pattern_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, name: entry.name || '我的小作品', gridSize: entry.gridSize, paletteName: entry.paletteName || 'Hama', attribution: entry.attribution || null, templateId: entry.templateId || '', colorUsage: entry.colorUsage, compressed, completedCodes: entry.completedCodes || [], completedBoards: entry.completedBoards || [], beadSize: entry.beadSize || 5, createdAt: Date.now(), updatedAt: Date.now() }
  list.unshift(record)
  uni.setStorageSync(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_ENTRIES)))
  return record.id
}
export function updatePattern(id, changes) {
  const list = getRawHistory(), entry = list.find(item => item.id === id)
  if (!entry) throw new Error('图纸记录不存在，请重新生成')
  if (changes.name !== undefined) entry.name = changes.name
  if (changes.completedCodes !== undefined) entry.completedCodes = changes.completedCodes
  if (changes.templateId !== undefined) entry.templateId = changes.templateId
  if (changes.pattern !== undefined) { entry.compressed = compressPattern(changes.pattern); delete entry.pattern; entry.gridSize=changes.pattern.length }
  for (const key of ['paletteName','attribution','colorUsage','completedBoards','beadSize']) if (changes[key] !== undefined) entry[key]=changes[key]
  entry.updatedAt = Date.now()
  uni.setStorageSync(STORAGE_KEY, JSON.stringify(list))
}
export function getPatternById(id) {
  const entry = getRawHistory().find(item => item.id === id)
  return restoreEntry(entry)
}
export function deletePattern(id) { uni.setStorageSync(STORAGE_KEY, JSON.stringify(getRawHistory().filter(entry => entry.id !== id))) }
export function clearHistory() { uni.removeStorageSync(STORAGE_KEY) }
