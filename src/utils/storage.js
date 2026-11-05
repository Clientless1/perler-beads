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
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}
export function getHistory() {
  return getRawHistory().map(entry => ({ ...entry, name: entry.name || '我的小作品', completedCodes: entry.completedCodes || [], pattern: entry.compressed ? decompressPattern(entry.compressed) : entry.pattern })).filter(entry => entry.pattern?.length)
}
export function savePattern(entry) {
  const list = getRawHistory()
  const compressed = compressPattern(entry.pattern)
  // Compare every cell, so patterns that differ in small details stay separate.
  const signature = JSON.stringify(compressed.grid)
  const duplicate = list.find(item => (item.paletteName || 'Hama') === (entry.paletteName || 'Hama') && item.gridSize === entry.gridSize && JSON.stringify(item.compressed?.grid || item.pattern?.map(row => row.map(c => c?.code || null))) === signature)
  if (duplicate) return duplicate.id
  const record = { id: `pattern_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, name: entry.name || '我的小作品', gridSize: entry.gridSize, paletteName: entry.paletteName || 'Hama', attribution: entry.attribution || null, colorUsage: entry.colorUsage, compressed, completedCodes: [], createdAt: Date.now(), updatedAt: Date.now() }
  list.unshift(record)
  uni.setStorageSync(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_ENTRIES)))
  return record.id
}
export function updatePattern(id, changes) {
  const list = getRawHistory(), entry = list.find(item => item.id === id)
  if (!entry) throw new Error('图纸记录不存在，请重新生成')
  if (changes.name !== undefined) entry.name = changes.name
  if (changes.completedCodes !== undefined) entry.completedCodes = changes.completedCodes
  entry.updatedAt = Date.now()
  uni.setStorageSync(STORAGE_KEY, JSON.stringify(list))
}
export function getPatternById(id) {
  const entry = getRawHistory().find(item => item.id === id)
  if (!entry) return null
  return { ...entry, name: entry.name || '我的小作品', completedCodes: entry.completedCodes || [], pattern: entry.compressed ? decompressPattern(entry.compressed) : entry.pattern }
}
export function deletePattern(id) { uni.setStorageSync(STORAGE_KEY, JSON.stringify(getRawHistory().filter(entry => entry.id !== id))) }
export function clearHistory() { uni.removeStorageSync(STORAGE_KEY) }
