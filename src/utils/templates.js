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
  return { pattern, colorUsage, gridSize: record.gridSize, name: record.name, paletteName: 'MARD', attribution }
}
