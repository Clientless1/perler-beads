import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import { mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { brotliDecompressSync } from 'node:zlib'
import { resolve } from 'node:path'
// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    uni(),
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
      writeBundle() {
        if (process.env.UNI_PLATFORM !== 'mp-weixin') return
        const directory = resolve(process.env.UNI_OUTPUT_DIR || 'dist/build/mp-weixin', 'subject/static')
        mkdirSync(directory, { recursive: true })
        rmSync(resolve(directory, 'subject-u2net.bin'), { force: true })
        copyFileSync(resolve('src/subject/static/subject-u2net.br'), resolve(directory, 'subject-u2net.br'))
      },
      // Browser runtime never enters the WeChat package. Serve the pinned local runtime.
      closeBundle() {
        if (process.env.UNI_PLATFORM !== 'h5') return
        const directory = resolve(process.env.UNI_OUTPUT_DIR || 'dist/build/h5', 'static/onnx')
        mkdirSync(directory, { recursive: true })
        for (const file of ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs']) copyFileSync(resolve('node_modules/onnxruntime-web/dist', file), resolve(directory, file))
        const modelDirectory = resolve(directory, '../../subject/static')
        mkdirSync(modelDirectory, { recursive: true })
        writeFileSync(resolve(modelDirectory, 'subject-u2net.bin'), brotliDecompressSync(readFileSync(resolve('src/subject/static/subject-u2net.br'))))
        rmSync(resolve(modelDirectory, 'subject-u2net.br'), { force: true })
      },
      configureServer(server) {
        if (process.env.UNI_PLATFORM !== 'h5') return
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
