import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
function filesIn(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? filesIn(join(directory, entry.name)) : [join(directory, entry.name)])
}
export function getReleaseInfo(platform) {
  const files = [...filesIn(join(root, 'src')), ...['index.html', 'package.json', 'package-lock.json', 'vite.config.js', 'project.config.json', 'scripts/release-info.mjs', 'scripts/check-local-release.mjs', 'scripts/wechat-package.mjs', 'scripts/build-safety-wasm.mjs', 'scripts/app-image-assets.mjs'].map(file => join(root, file))].sort()
  const hash = createHash('sha256')
  for (const file of files) { hash.update(relative(root, file)); hash.update('\0'); hash.update(readFileSync(file)); hash.update('\0') }
  const manifest = JSON.parse(readFileSync(join(root, 'src/manifest.json'), 'utf8'))
  return { version: manifest.versionName, versionCode: manifest.versionCode, appid: manifest['mp-weixin'].appid, platform, sourceHash: hash.digest('hex'), builtAt: new Date().toISOString() }
}
