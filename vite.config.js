import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import { mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { brotliDecompressSync, gunzipSync } from 'node:zlib'
import { resolve } from 'node:path'
import { getReleaseInfo } from './scripts/release-info.mjs'
import { pruneWechatTemplateAssets } from './scripts/wechat-package.mjs'
import { buildSync } from 'esbuild'
import { buildAppImageAssets } from './scripts/app-image-assets.mjs'
const safetyInfo = JSON.parse(readFileSync(resolve('src/data/safety-model.json'), 'utf8'))
const safetyBinary = () => Buffer.concat(safetyInfo.parts.map(part => gunzipSync(readFileSync(resolve('src', part.path.slice(1))))))
// https://vitejs.dev/config/
export default defineConfig({
  server: { host: '127.0.0.1', port: 5173, proxy: { '/api': 'http://127.0.0.1:8788', '/assets/templates/': 'http://127.0.0.1:8788' } },
  plugins: [
    uni(),
    {
      name: 'local-release-provenance',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'release-info.json', source: JSON.stringify(getReleaseInfo(process.env.UNI_PLATFORM), null, 2) + '\n' })
        if (process.env.UNI_PLATFORM === 'mp-weixin') for (const part of safetyInfo.parts) {
          const encoded = readFileSync(resolve('src', part.path.slice(1))).toString('base64')
          this.emitFile({ type: 'asset', fileName: `${part.root}/resources.js`, source: `module.exports = ${JSON.stringify(encoded)};\n` })
        }
        if (process.env.UNI_PLATFORM === 'mp-weixin') {
          const worker = buildSync({ entryPoints: [resolve('src/utils/safety/wechatWorkerEntry.js')], bundle: true, write: false, format: 'iife', target: 'es2018', minify: true })
          this.emitFile({ type: 'asset', fileName: 'safetyWorkers/index.js', source: worker.outputFiles[0].text })
        }
      },
    },
    {
      name: 'guard-detached-resize-sensor',
      // uni-h5 calls onActivated after conditional canvases/images have been
      // removed when returning to a cached tab. Its sensor ref can be null.
      transform(code, id) {
        if (process.env.UNI_PLATFORM !== 'h5' || !id.replaceAll('\\', '/').includes('@dcloudio/uni-h5/dist/uni-h5.es.js')) return
        return code.replace('function useResizeSensorReset(rootRef) {\n  return () => {', 'function useResizeSensorReset(rootRef) {\n  return () => {\n    if (!rootRef.value?.firstElementChild || !rootRef.value?.lastElementChild) return;')
      },
    },
    {
      name: 'subject-h5-wasm',
      // Copy subpackage binary assets explicitly in dev too: uni's watcher can
      // miss new static files added after the development server starts.
      async writeBundle() {
        // HBuilderX's watch build also needs the complete local engine.
        if (['app', 'app-plus'].includes(process.env.UNI_PLATFORM)) {
          await buildAppImageAssets(resolve(process.env.UNI_OUTPUT_DIR || 'dist/build/app'))
          return
        }
        if (process.env.UNI_PLATFORM !== 'mp-weixin') return
        const directory = resolve(process.env.UNI_OUTPUT_DIR || 'dist/build/mp-weixin', 'subject/static')
        mkdirSync(directory, { recursive: true })
        rmSync(resolve(directory, 'subject-u2net.bin'), { force: true })
        copyFileSync(resolve('src/subject/static/subject-u2net.br'), resolve(directory, 'subject-u2net.br'))
        for (const part of safetyInfo.parts) {
          const destination = resolve(process.env.UNI_OUTPUT_DIR || 'dist/build/mp-weixin', part.path.slice(1))
          // The asynchronous JS module contains these bytes. Do not package a
          // second copy or depend on native code-package filesystem access.
          rmSync(destination, { force: true })
        }
      },
      // Browser runtime never enters the WeChat package. Serve the pinned local runtime.
      async closeBundle() {
        if (['app', 'app-plus'].includes(process.env.UNI_PLATFORM)) {
          await buildAppImageAssets(resolve(process.env.UNI_OUTPUT_DIR || 'dist/build/app'))
          return
        }
        if (process.env.UNI_PLATFORM === 'mp-weixin') {
          // uni's static copier finishes after writeBundle. Remove duplicate
          // binaries only after copying has settled so every package fits.
          for (const part of safetyInfo.parts) rmSync(resolve(process.env.UNI_OUTPUT_DIR || 'dist/build/mp-weixin', part.path.slice(1)), { force: true })
          // The live catalog uses server covers. Keep only the fixed homepage
          // examples; historical pattern data stays bundled for saved works.
          const examples = JSON.parse(readFileSync(resolve('src/data/examples.json'), 'utf8'))
          const pruned = pruneWechatTemplateAssets(resolve(process.env.UNI_OUTPUT_DIR || 'dist/build/mp-weixin'), examples)
          console.log(`[wechat-package] Removed ${pruned.removedFiles} unused template assets (${pruned.removedBytes} bytes); kept ${pruned.keptFiles} homepage covers.`)
          return
        }
        if (process.env.UNI_PLATFORM !== 'h5') return
        const directory = resolve(process.env.UNI_OUTPUT_DIR || 'dist/build/h5', 'static/onnx')
        mkdirSync(directory, { recursive: true })
        for (const file of ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs']) copyFileSync(resolve('node_modules/onnxruntime-web/dist', file), resolve(directory, file))
        const modelDirectory = resolve(directory, '../../subject/static')
        mkdirSync(modelDirectory, { recursive: true })
        writeFileSync(resolve(modelDirectory, 'subject-u2net.bin'), brotliDecompressSync(readFileSync(resolve('src/subject/static/subject-u2net.br'))))
        rmSync(resolve(modelDirectory, 'subject-u2net.br'), { force: true })
        const safetyDirectory = resolve(directory, '../../safety/static')
        mkdirSync(safetyDirectory, { recursive: true })
        writeFileSync(resolve(safetyDirectory, 'nsfw.bin'), safetyBinary())
        for (const part of safetyInfo.parts) rmSync(resolve(directory, '../..', part.path.slice(1)), { force: true })
      },
      configureServer(server) {
        if (process.env.UNI_PLATFORM !== 'h5') return
        server.middlewares.use('/safety/static/nsfw.bin', (req, res) => {
          res.setHeader('Content-Type', 'application/octet-stream')
          res.end(safetyBinary())
        })
        server.middlewares.use('/subject/static/subject-u2net.bin', async (req, res) => {
          const { readFile } = await import('node:fs/promises')
          res.setHeader('Content-Type', 'application/octet-stream')
          res.end(brotliDecompressSync(await readFile(resolve('src/subject/static/subject-u2net.br'))))
        })
        server.middlewares.use('/static/onnx', async (req, res, next) => {
          const file = req.url?.split('?')[0].slice(1)
          if (!['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs'].includes(file)) return next()
          const { readFile } = await import('node:fs/promises')
          res.setHeader('Content-Type', file.endsWith('.wasm') ? 'application/wasm' : 'application/javascript')
          res.end(await readFile(resolve('node_modules/onnxruntime-web/dist', file)))
        })
      },
    },
  ],
})
