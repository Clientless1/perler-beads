import { existsSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

const LIMIT = 2 * 1024 ** 2
// WeChat transforms and wraps source files after Vite. Raw byte totals alone
// are not upload sizes; reserve room instead of allowing builds at the limit.
const MAIN_BUDGET = LIMIT - 256 * 1024
const SUBPACKAGE_BUDGET = LIMIT - 16 * 1024

function filesIn(directory) {
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? filesIn(join(directory, entry.name)) : [join(directory, entry.name)])
}

export function pruneWechatTemplateAssets(outputRoot, examples) {
  const directory = resolve(outputRoot, 'static/templates')
  const keep = new Set(examples.map(example => {
    if (!/^\/static\/templates\/[^/]+\.png$/.test(example.cover)) throw new Error(`Unexpected example cover: ${example.cover}`)
    const path = resolve(outputRoot, example.cover.slice(1))
    if (!existsSync(path)) throw new Error(`Missing bundled example cover: ${example.cover}`)
    return path
  }))
  if (!keep.size) throw new Error('Bundled example covers must not be empty')
  let removedBytes = 0, removedFiles = 0
  for (const file of filesIn(directory)) if (!keep.has(file)) {
    removedBytes += statSync(file).size
    removedFiles++
    rmSync(file)
  }
  return { removedBytes, removedFiles, keptFiles: keep.size }
}

export function measureWechatPackages(outputRoot, app) {
  const roots = (app.subPackages || []).map(pack => pack.root.replace(/\/$/, ''))
  const packages = Object.fromEntries(['main', ...roots].map(name => [name, {
    sourceBytes: 0, limitBytes: LIMIT,
    budgetBytes: name === 'main' ? MAIN_BUDGET : SUBPACKAGE_BUDGET,
    files: [],
  }]))
  for (const file of filesIn(outputRoot)) {
    const path = relative(outputRoot, file).split(sep).join('/')
    const name = roots.find(root => path.startsWith(root + '/')) || 'main'
    const bytes = statSync(file).size
    packages[name].sourceBytes += bytes
    packages[name].files.push({ path, bytes })
  }
  for (const pack of Object.values(packages)) {
    pack.headroomBytes = pack.limitBytes - pack.sourceBytes
    pack.withinBudget = pack.sourceBytes <= pack.budgetBytes
    pack.files.sort((a, b) => b.bytes - a.bytes || a.path.localeCompare(b.path))
  }
  return { measurement: 'raw source bytes; verify final package with WeChat preview', packages }
}
