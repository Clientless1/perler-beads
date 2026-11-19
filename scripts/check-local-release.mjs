import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getReleaseInfo } from './release-info.mjs'
import { measureWechatPackages } from './wechat-package.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = path => readFileSync(join(root, path), 'utf8')
const json = path => JSON.parse(read(path))
function filesIn(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? filesIn(join(directory, entry.name)) : [join(directory, entry.name)])
}
const report = { checkedAt: new Date().toISOString(), version: getReleaseInfo('mp-weixin').version, checks: [], platformReview: 'pending', unresolved: ['云端版尚未接入微信内容安全 API，正式提审须按真实云端数据流核对平台要求；原本地场景复核文案不适用。', '后台隐私指引、服务类目、支付资质、最新上传包及微信真机体验未通过此脚本验证。'] }
function check(name, run) {
  try { report.checks.push({ name, status: 'pass', detail: run() }) }
  catch (error) { report.checks.push({ name, status: 'fail', detail: error.message }) }
}
function requireCheck(condition, message) { if (!condition) throw new Error(message) }
const project = json('project.config.json')
const nativeRoot = project.miniprogramRoot.replace(/\/$/, '')
check('微信项目指向生产构建且 AppID 一致', () => {
  requireCheck(nativeRoot === 'dist/build/mp-weixin', '项目未指向 dist/build/mp-weixin')
  requireCheck(project.appid === getReleaseInfo('mp-weixin').appid, '项目与源码 AppID 不一致')
  return nativeRoot
})
for (const platform of ['h5', 'mp-weixin']) check(`${platform} 构建与最新源码一致`, () => {
  const emitted = json(`dist/build/${platform}/release-info.json`), expected = getReleaseInfo(platform)
  requireCheck(emitted.sourceHash === expected.sourceHash && emitted.version === expected.version && emitted.appid === expected.appid && emitted.platform === platform, '构建指纹已过期，请重新构建后再上传')
  return { version: emitted.version, sourceHash: emitted.sourceHash, builtAt: emitted.builtAt }
})
check('云端访问统一入口、相片不直接上传且隐私说明一致', () => {
  const cloud = read('src/utils/cloud.js'), privacy=read('src/pages/privacy/privacy.vue')
  requireCheck(cloud.includes('/api/v1') && cloud.includes('Authorization') && cloud.includes('VITE_API_BASE_URL'), '云端入口或鉴权缺失')
  const uploads = filesIn(join(root,'src')).filter(file=>/\.(?:js|vue)$/.test(file)&&/\b(?:uni|wx)\s*\.\s*uploadFile\s*\(/.test(readFileSync(file,'utf8')))
  requireCheck(!uploads.length,'原始照片上传需另行核对隐私与安全处理')
  requireCheck(privacy.includes('云端数据库')&&privacy.includes('原始照片不上传'), '隐私说明未覆盖云端作品')
  return '登录和业务请求由 cloud.js 统一鉴权；图纸及进度上传，原始照片在设备处理。此项不代替网络抓取。'
})
check('产物不含旧检测拦截、服务端源码或明显凭据', () => {
  for (const platform of ['h5', 'mp-weixin']) for (const file of filesIn(join(root, 'dist/build', platform))) {
    requireCheck(!relative(join(root, 'dist/build', platform), file).startsWith('server/'), '服务端源码进入产物')
    if (!/\.(?:js|json|wxml|html)$/.test(file)) continue
    const source = readFileSync(file, 'utf8')
    requireCheck(!/内容检测服务未连接|VITE_CONTENT_SAFETY_URL|\/v1\/checks\/images|github_pat_[A-Za-z0-9_]{20,}|ghp_[A-Za-z0-9]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(source), `需核查产物：${relative(root, file)}`)
  }
  return '两个生产构建均通过静态检查。'
})
check('全部页面、隐私入口和底部导航资源存在', () => {
  const app = json(`${nativeRoot}/app.json`)
  const pages = [...app.pages, ...(app.subPackages || []).flatMap(pack => pack.pages.map(page => `${pack.root}/${page}`))]
  requireCheck(pages.includes('pages/privacy/privacy'), '隐私说明页未打包')
  for (const page of pages) for (const suffix of ['js', 'json', 'wxml']) read(`${nativeRoot}/${page}.${suffix}`)
  for (const item of app.tabBar.list) for (const icon of [item.iconPath, item.selectedIconPath]) readFileSync(join(root, nativeRoot, icon))
  return { pages: pages.length }
})
check('微信各包低于构建预算，主包预留至少 256 KiB', () => {
  const app = json(`${nativeRoot}/app.json`)
  const sizes = measureWechatPackages(join(root, nativeRoot), app)
  const output = join(root, 'output/wechat-package-size.json')
  mkdirSync(dirname(output), { recursive: true })
  writeFileSync(output, JSON.stringify(sizes, null, 2) + '\n')
  for (const [key, pack] of Object.entries(sizes.packages)) requireCheck(pack.withinBudget, `${key} 源文件 ${pack.sourceBytes} 字节超过预算 ${pack.budgetBytes}，文件明细见 output/wechat-package-size.json；需留出微信预处理余量`)
  return Object.fromEntries(Object.entries(sizes.packages).map(([key, pack]) => [key, { sourceBytes: pack.sourceBytes, headroomBytes: pack.headroomBytes }]))
})
check('微信仅携带首页封面，云端图库和旧作品数据保持可用', () => {
  const expected = json('src/data/examples.json').map(item => item.cover.slice(1)).sort()
  const actual = filesIn(join(root, nativeRoot, 'static/templates')).map(file => relative(join(root, nativeRoot), file)).sort()
  requireCheck(JSON.stringify(actual) === JSON.stringify(expected), '微信图库冗余资产未清理，或首页封面缺失')
  requireCheck(read('src/pages/templates/templates.vue').includes("request('/catalog"), '云端图库入口需复核')
  requireCheck(read(`${nativeRoot}/utils/templates.js`).includes('tw_1f431'), '旧作品规范图纸数据缺失')
  return { bundledCovers: expected.length, catalog: 'server', legacyPatterns: 'bundled' }
})
check('微信模型资源与源码相同', () => {
  const hash = path => createHash('sha256').update(readFileSync(join(root, path))).digest('hex')
  requireCheck(hash('src/subject/static/subject-u2net.br') === hash(`${nativeRoot}/subject/static/subject-u2net.br`), '模型产物不一致')
  for (const part of json('src/data/safety-model.json').parts) {
    const encoded = JSON.parse(read(`${nativeRoot}/${part.root}/resources.js`).trim().replace(/^module\.exports = /, '').replace(/;$/, ''))
    const checksum = createHash('sha256').update(Buffer.from(encoded, 'base64')).digest('hex')
    requireCheck(checksum === hash(`src${part.path}`), '图片检测模型模块产物不一致')
  }
  requireCheck(json(`${nativeRoot}/app.json`).workers === 'safetyWorkers', '本地检测 Worker 目录未配置')
  requireCheck(read(`${nativeRoot}/safetyWorkers/index.js`).length > 0, '本地检测 Worker 缺失')
  requireCheck(hash('src/static/safety/convolutions.wasm') === hash(`${nativeRoot}/static/safety/convolutions.wasm`), '检测加速内核不一致')
  return '压缩模型、加速内核一致，Worker 已打包；解压、推理及取消另有自动化测试，真机仍需验证。'
})
report.technicalChecksPassed = report.checks.every(item => item.status === 'pass')
if (read(`${nativeRoot}/utils/cloud.js`).includes('https://1.92.110.111')) report.unresolved.push('微信构建仍使用 IP 接口地址，须换成备案且配置为合法域名的 HTTPS 地址。')
if (read('src/pages/privacy/privacy.vue').includes('须在正式发布时按实际主体填写')) report.unresolved.push('隐私说明仍缺实际运营主体、联系方式和服务条款。')
report.readyForSubmission = report.technicalChecksPassed && report.unresolved.length === 0 && report.platformReview === 'approved'
const output = join(root, 'output/release-review.json')
mkdirSync(dirname(output), { recursive: true })
writeFileSync(output, JSON.stringify(report, null, 2) + '\n')
for (const item of report.checks) console.log(`${item.status.toUpperCase()} ${item.name}`)
console.log('上架结论：尚未满足正式提审条件；静态检查通过不等于可上架。')
for (const issue of report.unresolved) console.log(`待解决：${issue}`)
console.log('完整报告：output/release-review.json')
process.exitCode = report.checks.some(item => item.status === 'fail') ? 1 : 0
