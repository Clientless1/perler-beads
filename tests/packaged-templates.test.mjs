import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

async function sourceModule(file) {
  const result = await build({ entryPoints: [new URL(`../src/utils/${file}`, import.meta.url).pathname], bundle: true, write: false, format: 'esm' })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
}
const { TEMPLATES, getTemplatePattern, resolvePackagedTemplate } = await sourceModule('templates.js')
const storage = await sourceModule('storage.js')

test('every packaged template and unchanged legacy sample resolves to fresh canonical content', () => {
  for (const { id } of TEMPLATES) {
    const sample = getTemplatePattern(id)
    const fixed = resolvePackagedTemplate(sample)
    assert.deepEqual(fixed, sample)
    assert.notEqual(fixed.pattern, sample.pattern)
    assert.deepEqual(resolvePackagedTemplate({ ...sample, templateId: undefined }), fixed)
  }
})

test('template IDs and legacy flags cannot identify modified content as a packaged original', () => {
  const sample = getTemplatePattern('tw_1f430')
  const mutations = [
    item => { item.name = '自定义名称' },
    item => { item.gridSize++ },
    item => { item.paletteName = 'Hama' },
    item => { item.templateId = 'missing' },
    item => { item.templateId = 'fox' },
    item => { item.pattern[0][0] = item.pattern.flat().find(Boolean) },
    item => { item.pattern.flat().find(Boolean).hex = '#000000' },
    item => { item.pattern.flat().find(Boolean).name = '自定义色名' },
    item => { item.pattern[0].pop() },
    item => { item.colorUsage[0].count++ },
    item => { item.colorUsage[0].name = '自定义色名' },
    item => { item.attribution.author = '自定义署名' },
  ]
  for (const mutate of mutations) {
    const item = structuredClone(sample)
    item.safetyVersion = 1; item.isTemplate = true
    mutate(item)
    assert.equal(resolvePackagedTemplate(item), null)
  }
  assert.equal(resolvePackagedTemplate({ templateId: 'fox', isTemplate: true, safetyVersion: 1 }), null)
})

test('database object ordering and equal-count material sorting do not change canonical content', () => {
  const sample = getTemplatePattern('tw_1f431')
  const restored = structuredClone(sample)
  restored.colorUsage.sort((a,b) => b.count-a.count || a.code.localeCompare(b.code))
  restored.attribution = Object.fromEntries(Object.entries(restored.attribution).reverse())
  assert.deepEqual(resolvePackagedTemplate(restored), sample)
  restored.attribution.author = '伪造署名'
  assert.equal(resolvePackagedTemplate(restored), null)
})

test('sample provenance and progress survive storage without claiming a WeChat approval', () => {
  const memory = new Map()
  globalThis.uni = { getStorageSync: key => memory.get(key), setStorageSync: (key, value) => memory.set(key, value) }
  const sample = getTemplatePattern('fox')
  const id = storage.savePattern(sample)
  storage.updatePattern(id, { completedCodes: [sample.colorUsage[0].code] })
  const restored = storage.getPatternById(id)
  assert.equal(restored.safetyVersion, undefined)
  assert.deepEqual(restored.completedCodes, [sample.colorUsage[0].code])
  assert.deepEqual(resolvePackagedTemplate(restored), sample)
  assert.equal(storage.savePattern(sample), id)
  storage.updatePattern(id, { name: '改过名字的狐狸' })
  assert.equal(resolvePackagedTemplate(storage.getPatternById(id)), null)
})
