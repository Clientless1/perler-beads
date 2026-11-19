import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { measureWechatPackages, pruneWechatTemplateAssets } from '../scripts/wechat-package.mjs'

function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), 'perler-package-'))
  const write = (path, data) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), data) }
  try { run(root, write) } finally { rmSync(root, { recursive: true, force: true }) }
}

test('WeChat pruning keeps declared homepage covers and legacy patterns without changing source assets', () => fixture((root, write) => {
  write('static/templates/rabbit.png', 'cover')
  write('static/templates/old.png', 'unused cover')
  write('static/templates/sources/old.png', 'generation source')
  write('utils/templates.js', 'legacy patterns')
  write('static/examples/rabbit.png', 'sample image')
  write('subject/static/model.br', 'model')
  const result = pruneWechatTemplateAssets(root, [{ cover: '/static/templates/rabbit.png' }])
  assert.deepEqual(result, { removedFiles: 2, removedBytes: 29, keptFiles: 1 })
  assert.equal(readFileSync(join(root, 'static/templates/rabbit.png'), 'utf8'), 'cover')
  for (const [path, value] of [['utils/templates.js', 'legacy patterns'], ['static/examples/rabbit.png', 'sample image'], ['subject/static/model.br', 'model']]) assert.equal(readFileSync(join(root, path), 'utf8'), value)
  assert.throws(() => readFileSync(join(root, 'static/templates/old.png')), /ENOENT/)
  assert.throws(() => readFileSync(join(root, 'static/templates/sources/old.png')), /ENOENT/)
}))

test('missing homepage covers abort before pruning any output', () => fixture((root, write) => {
  write('static/templates/old.png', 'original')
  assert.throws(() => pruneWechatTemplateAssets(root, [{ cover: '/static/templates/missing.png' }]), /Missing/)
  assert.equal(readFileSync(join(root, 'static/templates/old.png'), 'utf8'), 'original')
}))

test('package budget rejects the reported near-limit main package and separates subpackage prefixes', () => fixture((root, write) => {
  write('app.js', Buffer.alloc(2062503))
  write('subject/static/model.br', Buffer.alloc(100))
  write('subjectExtra/static/model.br', Buffer.alloc(50))
  const report = measureWechatPackages(root, { subPackages: [{ root: 'subject' }] })
  assert.equal(report.packages.main.sourceBytes, 2062553)
  assert.equal(report.packages.main.withinBudget, false)
  assert.equal(report.packages.subject.sourceBytes, 100)
  assert.equal(report.packages.subject.withinBudget, true)
  assert.equal(report.packages.main.files[0].path, 'app.js')
  assert.equal(report.packages.main.headroomBytes, 2 * 1024 ** 2 - 2062553)
}))
