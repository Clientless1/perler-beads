import { mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { gunzipSync, brotliDecompressSync } from 'node:zlib'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { preprocess } = require('@dcloudio/uni-cli-shared/lib/preprocess')
const { initScopedPreContext } = require('@dcloudio/uni-cli-shared/dist/preprocess/context')
// Compile the WebView bundle as DOM code, independently of the App service
// bundle. APP-PLUS wrappers must not recursively call the service bridge here.
export function buildAppImageAssets(output) {
  const directory = resolve(output, 'static/app-image')
  mkdirSync(directory, { recursive: true })
  const preprocessPlugin = {
    name: 'app-webview-h5-code', setup(build) {
      build.onLoad({ filter: /\.(js|mjs)$/ }, args => {
        if (!args.path.includes(resolve('src'))) return
        return { contents: preprocess(readFileSync(args.path, 'utf8'), initScopedPreContext('h5').preVueContext, { type: 'js' }), loader: 'js' }
      })
    },
  }
  // The async builder is returned so Vite waits for both complete local bundles.
  return import('esbuild').then(async ({ build }) => {
    for (const [entry, file, globalName] of [['src/utils/app/engine.js', 'engine.js', 'BeadImageEngine'], ['src/utils/app/worker.js', 'worker.js', undefined]]) {
      const result = await build({ entryPoints: [resolve(entry)], bundle: true, write: false, format: 'iife', globalName, minify: true, target: 'es2020', plugins: [preprocessPlugin] })
      writeFileSync(resolve(directory, file), result.outputFiles[0].contents)
    }
    for (const [source, target] of [['ort.wasm.min.js', 'ort.js'], ['ort-wasm-simd-threaded.mjs', 'ort.mjs'], ['ort-wasm-simd-threaded.wasm', 'ort.wasm']]) copyFileSync(resolve('node_modules/onnxruntime-web/dist', source), resolve(directory, target))
    copyFileSync(resolve('src/static/safety/convolutions.wasm'), resolve(directory, 'convolutions.wasm'))
    const info = JSON.parse(readFileSync(resolve('src/data/safety-model.json'), 'utf8'))
    writeFileSync(resolve(directory, 'nsfw.bin'), Buffer.concat(info.parts.map(part => gunzipSync(readFileSync(resolve('src', part.path.slice(1)))))))
    writeFileSync(resolve(directory, 'subject.bin'), brotliDecompressSync(readFileSync(resolve('src/subject/static/subject-u2net.br'))))
    // Avoid bundling the same trained weights twice in the APK.
    for (const part of info.parts) rmSync(resolve(output, part.path.slice(1)), { force: true })
    rmSync(resolve(output, 'subject/static/subject-u2net.br'), { force: true })
  })
}
