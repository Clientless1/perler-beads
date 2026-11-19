// #ifdef APP-PLUS
import { appRequest } from './app/bridge'
// #endif
import { createSafetyDetector } from './safety/detector'
import { safetyError, SAFETY_POLICY_VERSION } from './safety/policy'
import modelInfo from '../data/safety-model.json'
import { createImageCanvas, createImageSourceLoader } from './imageSource'
import { resolvePackagedTemplate } from './templates'

// Memory-only decisions use every rendered cell plus the model and policy.
// Stored flags or a template ID never mark arbitrary user content as safe.
const approved = new Set()
let queue = Promise.resolve(), engine = null, idleTimer
function enqueue(run, options) {
  let finished = false, timeout, cancellation, interrupt
  const isCancelled = () => finished || options.isCancelled?.()
  const interrupted = new Promise((_, reject) => {
    interrupt = code => { finished = true; reject(safetyError(code)) }
    cancellation = setInterval(() => { if (options.isCancelled?.()) interrupt('cancelled') }, 100)
  })
  const task = queue.catch(() => {}).then(async () => {
    if (isCancelled()) throw safetyError('cancelled')
    clearTimeout(idleTimer)
    if (!engine) engine = createSafetyDetector()
    const detector = engine
    // Include decoding in the deadline. A stalled image must not hold every
    // later image or old-work check in the serial inference queue.
    timeout = setTimeout(() => interrupt('timeout'), 60000)
    try { return await Promise.race([run(detector, { ...options, isCancelled }), interrupted]) }
    catch (error) { detector.dispose(); engine = null; throw error?.safetyCode ? error : safetyError() }
    finally { idleTimer = setTimeout(() => { engine?.dispose(); engine = null }, 120000) }
  })
  queue = task
  // Queued cancellations settle immediately without disposing the detector
  // that is still checking a different request.
  return Promise.race([task, interrupted]).finally(() => {
    finished = true; clearTimeout(timeout); clearInterval(cancellation)
  })
}
function remember(key) {
  if (approved.size >= 40) approved.delete(approved.values().next().value)
  approved.add(key)
}
function scanCanvas(detector, source, options) {
  const canvas = createImageCanvas(source.width, source.height), ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(source, 0, 0)
  return detector.check(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, options)
}
export function assertSafeImage(path, options = {}) {
  // #ifdef APP-PLUS
  return appRequest('safeImage', { path }, options)
  // #endif
  return enqueue(async (detector, checkOptions) => {
    const loader = createImageSourceLoader(1280)
    try {
      const source = await loader.load(path)
      if (checkOptions.isCancelled()) throw safetyError('cancelled')
      return await scanCanvas(detector, source, checkOptions)
    }
    catch (error) { throw error?.safetyCode ? error : safetyError() }
    finally { loader.clear() }
  }, options)
}
// Background thumbnails may reuse checks already completed in this session.
// Unchecked old works are checked when opened, without a 20-image startup queue.
export function isPatternApproved(entry) {
  if (resolvePackagedTemplate(entry)) return true
  const colors = patternColors(entry)
  return !!colors && approved.has(patternKey(colors))
}
function patternColors(entry) {
  const cells = entry?.pattern, size = cells?.length
  if (!Array.isArray(cells) || !size || size > 87 || cells.some(row => !Array.isArray(row) || row.length !== size || row.some(color => color !== null && !/^#[0-9a-f]{6}$/i.test(color?.hex)))) return null
  return cells.map(row => row.map(color => color?.hex || null))
}
const patternKey = colors => `${modelInfo.version}:${SAFETY_POLICY_VERSION}:${JSON.stringify(colors)}`
export async function assertSafePattern(entry, options = {}) {
  if (options.isCancelled?.()) throw safetyError('cancelled')
  if (resolvePackagedTemplate(entry)) return
  const colors = patternColors(entry), size = colors?.length
  if (!colors) throw safetyError()
  const key = patternKey(colors)
  if (approved.has(key)) return
  // #ifdef APP-PLUS
  await appRequest('safePattern', { colors }, options)
  if (options.isCancelled?.()) throw safetyError('cancelled')
  remember(key)
  return
  // #endif
  return enqueue(async (detector, checkOptions) => {
    if (approved.has(key)) return
    const canvas = createImageCanvas(size, size), ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size)
    colors.forEach((row, y) => row.forEach((hex, x) => { if (hex) { ctx.fillStyle = hex; ctx.fillRect(x, y, 1, 1) } }))
    await detector.check(ctx.getImageData(0, 0, size, size).data, size, size, checkOptions)
    if (checkOptions.isCancelled()) throw safetyError('cancelled')
    remember(key)
  }, options)
}
