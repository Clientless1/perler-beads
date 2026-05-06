const STORAGE_KEY = 'bead_history'
const MAX_ENTRIES = 20

function compressPattern(pattern) {
  const colorMap = new Map()
  const codes = []

  for (const row of pattern) {
    const rowCodes = []
    for (const bead of row) {
      if (!colorMap.has(bead.code)) {
        colorMap.set(bead.code, {
          code: bead.code,
          name: bead.name,
          hex: bead.hex,
          r: bead.r,
          g: bead.g,
          b: bead.b,
        })
      }
      rowCodes.push(bead.code)
    }
    codes.push(rowCodes)
  }

  return {
    palette: Array.from(colorMap.values()),
    grid: codes,
  }
}

function decompressPattern(compressed) {
  if (!compressed || !compressed.grid) return compressed

  const lookup = new Map()
  for (const color of compressed.palette) {
    lookup.set(color.code, color)
  }

  return compressed.grid.map(row =>
    row.map(code => ({ ...lookup.get(code) }))
  )
}

function computeFingerprint(pattern) {
  const sample = []
  const rows = pattern.length
  const cols = (pattern[0] || []).length
  const step = Math.max(1, Math.floor(Math.max(rows, cols) / 8))

  for (let r = 0; r < rows; r += step) {
    for (let c = 0; c < cols; c += step) {
      sample.push(pattern[r][c].code)
    }
  }

  return sample.join(',')
}

export function getHistory() {
  try {
    const raw = uni.getStorageSync(STORAGE_KEY)
    if (!raw) return []

    const list = JSON.parse(raw)
    return list.map(entry => ({
      ...entry,
      pattern: entry.compressed
        ? decompressPattern(entry.compressed)
        : entry.pattern,
    }))
  } catch {
    return []
  }
}

function getRawHistory() {
  try {
    const raw = uni.getStorageSync(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function savePattern(entry) {
  const list = getRawHistory()

  const fingerprint = computeFingerprint(entry.pattern)
  const duplicate = list.find(e =>
    e.gridSize === entry.gridSize && e.fingerprint === fingerprint
  )
  if (duplicate) return duplicate.id

  const compressed = compressPattern(entry.pattern)

  const record = {
    id: 'pattern_' + Date.now(),
    gridSize: entry.gridSize,
    colorUsage: entry.colorUsage,
    compressed,
    fingerprint,
    createdAt: Date.now(),
  }

  list.unshift(record)
  if (list.length > MAX_ENTRIES) {
    list.length = MAX_ENTRIES
  }

  uni.setStorageSync(STORAGE_KEY, JSON.stringify(list))
  return record.id
}

export function getPatternById(id) {
  return getHistory().find(e => e.id === id) || null
}

export function deletePattern(id) {
  const list = getRawHistory().filter(e => e.id !== id)
  uni.setStorageSync(STORAGE_KEY, JSON.stringify(list))
}

export function clearHistory() {
  uni.removeStorageSync(STORAGE_KEY)
}
