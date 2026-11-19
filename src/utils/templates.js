import records from '../data/templates.json'
import sources from '../data/template-sources.json'
import { MARD_PALETTE } from './beadPalette'

export const TEMPLATE_CATEGORIES = ['全部', '动物', '花草', '游戏', '水果', '食物', '甜点', '表情', '小物']
export const TEMPLATE_SOURCES = sources
const sourceById = new Map(sources.map(item => [item.id, item]))
const cellCodes = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const paletteByCode = new Map(MARD_PALETTE.map(color => [color.code, color]))
const recordsById = new Map(records.map(item => [item.id, item]))
export const TEMPLATES = records.map(({ runs, palette, ...meta }) => ({
  ...meta, cover: `/static/templates/${meta.id}.png`,
  sourceInfo: sourceById.get(meta.sourceId) || null,
  difficulty: meta.totalBeads <= 240 ? '轻松入门' : meta.totalBeads <= 600 ? '慢慢享受' : '进阶挑战',
}))

export function getTemplatePattern(id) {
  const record = recordsById.get(id)
  if (!record) return null
  const counts = new Map()
  const cells = record.runs.match(/[A-Za-z.]\d*/g).map(run => run[0].repeat(run.length > 1 ? Number(run.slice(1)) : 1)).join('')
  const palette = record.palette.map(code => paletteByCode.get(code))
  const pattern = Array.from({ length: record.gridSize }, (_, y) => Array.from(cells.slice(y * record.gridSize, (y + 1) * record.gridSize), code => {
    const index = code === '.' ? -1 : cellCodes.indexOf(code)
    if (index < 0) return null
    const bead = { ...palette[index] }
    counts.set(bead.code, (counts.get(bead.code) || 0) + 1)
    return bead
  }))
  const colorUsage = palette.map(color => ({ ...color, count: counts.get(color.code) || 0 })).filter(c => c.count).sort((a, b) => b.count - a.count)
  const source = sourceById.get(record.sourceId)
  const attribution = source?.license === 'CC-BY-4.0' ? {
    title: 'Twemoji', author: source.author, license: source.license,
    url: source.url, licenseUrl: source.licenseUrl, modified: true,
  } : null
  return { templateId: id, pattern, colorUsage, gridSize: record.gridSize, name: record.name, paletteName: 'MARD', attribution }
}

// Only the exact content shipped with the app is a fixed developer-provided asset.
// Rebuild it from the package; a flag or a template ID alone never exempts user content.
export function resolvePackagedTemplate(entry) {
  if (!entry || entry.paletteName !== 'MARD') return null
  if (!entry.templateId) {
    for (const record of records.filter(item => item.name === entry.name && item.gridSize === entry.gridSize)) {
      const resolved = resolvePackagedTemplate({ ...entry, templateId: record.id })
      if (resolved) return resolved
    }
    return null
  }
  const record = recordsById.get(entry.templateId)
  if (!record || record.name !== entry.name || record.gridSize !== entry.gridSize) return null
  const canonical = getTemplatePattern(record.id)
  const sameColor = (a, b) => a && b && ['code', 'name', 'hex', 'r', 'g', 'b'].every(key => a[key] === b[key])
  if (!Array.isArray(entry.pattern) || entry.pattern.length !== canonical.pattern.length) return null
  if (!canonical.pattern.every((row, y) => Array.isArray(entry.pattern[y]) && entry.pattern[y].length === row.length && row.every((color, x) => color === null ? entry.pattern[y][x] === null : sameColor(color, entry.pattern[y][x])))) return null
  if (!Array.isArray(entry.colorUsage) || entry.colorUsage.length !== canonical.colorUsage.length) return null
  const usageByCode = new Map(entry.colorUsage.map(color => [color?.code, color]))
  if (usageByCode.size !== canonical.colorUsage.length || !canonical.colorUsage.every(color => sameColor(color, usageByCode.get(color.code)) && color.count === usageByCode.get(color.code).count)) return null
  if (canonical.attribution ? !entry.attribution || Object.keys(canonical.attribution).some(key => entry.attribution[key] !== canonical.attribution[key]) : entry.attribution) return null
  return canonical
}
