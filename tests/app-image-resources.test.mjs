import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
const built = await build({ entryPoints: [new URL('../src/utils/app/resources.js', import.meta.url).pathname], bundle: true, write: false, format: 'esm' })
const { readNativeImage, imageDecodeSource } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`)
const image = 'data:image/png;base64,aGVsbG8='
function nativeReader({ data = image, failure, late = false } = {}) {
  const calls = []
  return { calls, resolveLocalFileSystemURL(path, success, fail) { calls.push(path); if (failure === 'path') return fail({ message: 'missing' }); success({ file(resolve) { resolve({ path }) } }) }, FileReader: class {
    readAsDataURL(file) { calls.push(file); if (late) return; if (failure === 'read') return this.onerror(); this.onloadend({ target: { result: data } }) }
    abort() { calls.push('abort') }
  } }
}
test('Android file and content URIs are decoded from native bytes rather than drawn directly', async () => {
  for (const path of ['file:///storage/emulated/0/photo.jpg', 'content://media/photo/42']) {
    const io = nativeReader()
    assert.equal(await imageDecodeSource(path, io), image)
    assert.equal(io.calls[0], path)
    assert.equal(io.calls.length, 2)
  }
  assert.equal(await imageDecodeSource(image), image)
  assert.equal(await imageDecodeSource('blob:already-origin-clean'), 'blob:already-origin-clean')
})
test('native file errors and invalid bytes never reach the detector as checked content', async () => {
  for (const options of [{ failure: 'path' }, { failure: 'read' }, { data: 'file:///not-bytes' }, { data: '' }]) await assert.rejects(readNativeImage('file:///photo', nativeReader(options)), { stage: 'image:read' })
  await assert.rejects(imageDecodeSource('file:///photo'), { stage: 'image:read' })
})
test('native file read has a deadline and aborts an unresponsive reader', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const io = nativeReader({ late: true }), pending = readNativeImage('file:///photo', io, 50)
  const checked = assert.rejects(pending, { stage: 'image:read' })
  t.mock.timers.tick(50); await checked
  assert.equal(io.calls.at(-1), 'abort')
})
