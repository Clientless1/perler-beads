import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'esbuild'

// Exercise the actual page scripts, refs, storage, app state, templates and
// color matching. Native pickers, canvas I/O and image decoding are test doubles;
// these checks do not replace WeChat device or visual QA.
const require = createRequire(import.meta.url)
const root = new URL('../', import.meta.url).pathname
const vueRuntime = require.resolve('vue/dist/vue.runtime.esm-bundler.js')
const exposed = {
  index: 'chooseImage, cancelPickedImage, updatePreview, openResult, resetImage, editSubject, useExample, imagePath, pattern, colorUsage, choosing, checking, processing, error, navigating, subject, subjectEnabled, openPrivacy, helpVisible, nextStep, backStep, createStep, composition, rotatePhoto, mirrorPhoto',
  result: 'initialize, rename, copyList, saveImage, toggleCompleted, pattern, name, saved, recordId, completedCodes, exporting, renaming, zoom, touchCommand, scaleCommand, viewKey, showLabels, gridSize, boardIndex, toggleLabels, changeZoom, handleScale, resetView, selectBoard, persist, initializing, cloudSaving, cloudError, saveEdited, editing, editorSaving, togglePlaying, completeAndNext, playing, selectedCode, localRecordId, localSaved, currentSaved, saveStatus, loadError, printPdf',
  history: 'reloadHistory, loadMoreCloud, openPattern, list, loading',
  inventory: 'load, change, save, selectPalette, stock, dirty, busy, loading, error, paletteId',
  editor: 'cells, changed, tool, color, undo, redo, drawStart, drawMove, drawEnd, drawCancel, brush, save',
}
function wechatOnly(source) {
  const active = [true]
  return source.split('\n').filter(line => {
    const begin = line.match(/\/\/\s*#(ifdef|ifndef)\s+(\S+)/)
    if (begin) { const match = begin[2] === 'MP-WEIXIN'; active.push(active.at(-1) && (begin[1] === 'ifdef' ? match : !match)); return false }
    if (/\/\/\s*#endif/.test(line)) { active.pop(); return false }
    return active.at(-1)
  }).join('\n')
}
let sequence = 0
async function fixture(memory = new Map()) {
  if(!memory.has('douwu_cloud_session_v1'))memory.set('douwu_cloud_session_v1',{token:'test-token',user:{id:'test-customer',nickname:'测试用户',role:'customer'}})
  const state = { hooks: {}, stops: [], calls: [], memory, modals: [], clipboard: '', exports: [], picks: [], albumError: null, storageError: false, decodeError: false }
  state.canvasRect={left:20,top:180};state.editorProps={pattern:[[null,null],[null,null]],palette:[{code:'A1',name:'白',hex:'#ffffff',r:255,g:255,b:255}],saving:false};state.canvas={getContext:()=>new Proxy({},{get:(_,key)=>()=>{}})};
  globalThis.__localWorkflow = state
  const forbidden = api => () => { state.calls.push(api); throw new Error(`Local mode used ${api}`) }
  const modal = options => { state.modals.push(options); options.success?.(state.modalResult || { confirm: false }); options.complete?.() }
  globalThis.uni = {
    getSystemInfoSync: () => ({ windowWidth: 390, pixelRatio: 1 }),
    getMenuButtonBoundingClientRect: () => ({ top: 8, height: 32, left: 280 }),
    getStorageSync: key => state.memory.get(key),
    setStorageSync: (key, value) => { if (state.storageError) throw new Error('full'); state.memory.set(key, value) },
    removeStorageSync: key => state.memory.delete(key),
    chooseImage: options => state.picks.push(options),
    showModal: modal,
    showToast: options => state.calls.push(['toast', options.title]),
    showLoading: options => state.calls.push(['loading', options.title]), hideLoading: () => {},
    pageScrollTo: () => {}, hideTabBar: () => state.calls.push(['tabbar', 'hidden']), showTabBar: () => state.calls.push(['tabbar', 'visible']), openSetting: () => state.calls.push('settings'),
    navigateTo: options => state.calls.push(['navigate', options.url]), switchTab: options => state.calls.push(['tab', options.url]),
    setClipboardData: options => { state.clipboard = options.data },
    createSelectorQuery: () => { const query = { in: () => query, select: () => query, fields: () => query, boundingClientRect: callback => {callback(state.canvasRect);return query}, exec: callback => callback?.([{ node: state.canvas }]) }; return query },
    canvasToTempFilePath: options => options.success({ tempFilePath: `wxfile://local-export-${state.exports.length}.png` }),
    saveImageToPhotosAlbum: options => { state.calls.push(['album', options.filePath]); state.albumError ? options.fail(state.albumError) : options.success({}) },
    request: options => {
      state.calls.push(['request',options.url,options.method]); const path=options.url.replace(/^.*\/api\/v1/,'');
      if(state.holdRequest?.(path,options))return;
      const works=JSON.parse(state.memory.get('cloud_works')||'[]');
      const fail=(status,code,message)=>options.success({statusCode:status,data:{code,message}});
      const done=data=>options.success({statusCode:200,data:{data}});
      if(path.startsWith('/catalog/templates'))return done({items:[],total:0});
      if(path==='/inventory'){if(options.method==='PUT')state.inventory=[...(state.inventory||[]).filter(item=>item.paletteId!==options.data.paletteId),...options.data.items.map(item=>({...item,paletteId:options.data.paletteId}))];return done(state.inventory||[]);}
      if((path==='/works'||path.startsWith('/works?'))&&options.method==='GET')return done({items:works,total:works.length});
      if(path==='/works'&&options.method==='POST'){
        if(state.storageError)return fail(503,'UNAVAILABLE','云端暂不可用');
        const work={...options.data,id:`work_${works.length+1}`,version:1,createdAt:Date.now(),updatedAt:Date.now()};works.unshift(work);state.memory.set('cloud_works',JSON.stringify(works));return done(work);
      }
      if(path.startsWith('/works/')){
        const id=path.split('/')[2],index=works.findIndex(work=>work.id===id);if(index<0)return fail(404,'NOT_FOUND','作品不存在');
        if(options.method==='GET')return done(works[index]);
        if(options.method==='PUT'){
          if(state.storageError)return fail(503,'UNAVAILABLE','云端暂不可用');
          if(works[index].version!==options.data.version)return fail(409,'VERSION_CONFLICT','作品已在另一设备更新');
          const work={...options.data,id,version:works[index].version+1,updatedAt:Date.now()};works[index]=work;state.memory.set('cloud_works',JSON.stringify(works));return done(work);
        }
      }
      return fail(404,'NOT_FOUND','mock route missing');
    }, uploadFile: forbidden('uploadFile'), downloadFile: forbidden('downloadFile'), login: forbidden('login'),
  }
  globalThis.wx = { request: forbidden('wx.request'), uploadFile: forbidden('wx.uploadFile'), cloud: new Proxy({}, { get: (_, key) => forbidden(`cloud.${String(key)}`) }) }
  const built = await build({
    stdin: { contents: Object.keys(exposed).map(page => `export * as ${page} from 'page:${page}';`).join('\n') + `\nexport * as sessions from './src/utils/subjectSession'; export * as app from './src/utils/appState';export * as cloud from './src/utils/cloud';`, resolveDir: root },
    bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent', define: { 'import.meta.env.VITE_API_BASE_URL': '""' },
    plugins: [{ name: 'native-page-fixture', setup(api) {
      api.onLoad({ filter: /\.js$/, namespace: 'file' }, async args => {
        if (!args.path.startsWith(resolve(root, 'src') + '/')) return
        return { contents: wechatOnly(await readFile(args.path, 'utf8')), resolveDir: resolve(args.path, '..') }
      })
      api.onResolve({ filter: /^page:/ }, args => ({ path: args.path.slice(5), namespace: 'page' }))
      api.onLoad({ filter: /.*/, namespace: 'page' }, async args => {
        const file = args.path==='editor'?resolve(root,'src/components/PatternEditor.vue'):args.path==='inventory'?resolve(root,'src/member/inventory/inventory.vue'):resolve(root,'src/pages',args.path,`${args.path}.vue`)
        const directory=resolve(file,'..')
        const source = await readFile(file, 'utf8')
        const setup=args.path==='editor'?`const defineProps=()=>globalThis.__localWorkflow.editorProps;const defineEmits=()=>((...args)=>globalThis.__localWorkflow.calls.push(['emit',...args]));const defineExpose=()=>{};`:''
        return { contents: setup+wechatOnly(source.match(/<script setup>([\s\S]*?)<\/script>/)[1]) + `\nexport { ${exposed[args.path]} };`, resolveDir: directory }
      })
      api.onResolve({ filter: /\.vue$/ }, args => ({ path: args.path, namespace: 'component' }))
      api.onLoad({ filter: /.*/, namespace: 'component' }, () => ({ contents: 'export default {}' }))
      api.onResolve({ filter: /^(vue|@dcloudio\/uni-app)$/ }, args => ({ path: `${args.path === 'vue' ? 'vue' : 'hooks'}:${args.importer}`, namespace: 'framework' }))
      api.onLoad({ filter: /.*/, namespace: 'framework' }, args => {
        const [kind, page] = args.path.split(':')
        const prefix = `const state = globalThis.__localWorkflow; const hooks = state.hooks[${JSON.stringify(page)}] ||= {};`
        if (kind === 'hooks') return { contents: prefix + ['onLoad', 'onReady', 'onShow', 'onHide', 'onUnload'].map(hook => `export const ${hook} = cb => hooks.${hook} = cb;`).join('\n') }
        return { resolveDir: root, contents: `import * as Vue from ${JSON.stringify(vueRuntime)}; ${prefix}
          export const { ref, shallowRef, computed, nextTick, reactive } = Vue;
          export const watch = (...args) => { const stop = Vue.watch(...args); state.stops.push(stop); return stop };
          export const getCurrentInstance = () => ({ proxy: {} });
          export const onBeforeUnmount = cb => hooks.onBeforeUnmount = cb;export const onMounted=cb=>hooks.onMounted=cb;` }
      })
      api.onResolve({ filter: /utils\/contentSafety$/ }, args => ({ path: args.path, namespace: 'safety-io' }))
      api.onLoad({ filter: /.*/, namespace: 'safety-io' }, () => ({ contents: `
        async function check(kind, value, options) {
          const state = globalThis.__localWorkflow;
          state.calls.push(['safety', kind, value]);
          if (state.safetyWait) await state.safetyWait;
          if (options?.isCancelled?.()) throw Object.assign(new Error('已取消图片检测'), {safetyCode:'cancelled'});
          if (state.safetyError) throw Object.assign(new Error(state.safetyError === 'blocked' ? '内容含违规信息' : '图片检测未完成，请重试'), {safetyCode:state.safetyError});
        }
        export const assertSafeImage = (path, options) => check('image', path, options);
        export const assertSafePattern = (entry, options) => check('pattern', entry, options);
      ` }))
      api.onResolve({ filter: /utils\/(imageSource|imageProcessor|canvasRenderer)$/ }, args => ({ path: args.path.split('/').at(-1), namespace: 'io' }))
      api.onLoad({ filter: /.*/, namespace: 'io' }, args => {
        if (args.path === 'imageSource') return { contents: `export const createImageSourceLoader = () => ({ clear() {}, async load(path) { if (globalThis.__localWorkflow.decodeError) throw new Error('图片加载失败，请重新选择'); return { path } } });` }
        if (args.path === 'imageProcessor') return { contents: `export async function processImage(path, size, options) { globalThis.__localWorkflow.calls.push(['process', path, options.subject]); const data = new Uint8ClampedArray(size * size * 4); data.set([235, 90, 100, 255], (Math.floor(size / 2) * size + Math.floor(size / 2)) * 4); return data }` }
        return { contents: `export async function drawPatternAsync() {globalThis.__localWorkflow.calls.push(['draw']);} export function drawForExport(canvas, pattern, size, labels, options) { canvas.width = canvas.height = 100; globalThis.__localWorkflow.exports.push({ labels, name: options.name, pattern }); }` }
      })
    } }],
  })
  const pages = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}#${++sequence}`)
  const hooks = page => state.hooks[page]
  const select = async (path = 'wxfile://photo.jpg') => { const pending = pages.index.chooseImage(); state.picks.at(-1).success({ tempFilePaths: [path] }); await pending }
  const dispose = () => { for (const value of Object.values(state.hooks)) { value.onUnload?.(); value.onBeforeUnmount?.() } state.stops.forEach(stop => stop()) }
  return { state, pages, hooks, select, dispose }
}

test('first visit opens the studio directly and help keeps privacy accessible', async () => {
  const f = await fixture(new Map())
  try {
    const { index } = f.pages
    f.hooks('index').onShow()
    assert.equal(index.helpVisible.value, false)
    assert.deepEqual(f.state.calls.filter(call => call[0] === 'tabbar').at(-1), ['tabbar', 'visible'])
    await f.select(); await index.updatePreview()
    assert.ok(index.pattern.value)
    index.helpVisible.value = true
    index.openPrivacy()
    assert.equal(index.helpVisible.value, false)
    assert.deepEqual(f.state.calls.filter(call => call[0] === 'navigate').at(-1), ['navigate', '/pages/privacy/privacy'])
    f.hooks('index').onHide(); f.hooks('index').onShow()
    assert.deepEqual(f.state.calls.filter(call => call[0] === 'tabbar').at(-1), ['tabbar', 'visible'])
  } finally { f.dispose() }
})

test('photo conversion stays on device while rename and progress persist through cloud APIs', async () => {
  const f = await fixture(), { state, pages: { index, result, history, sessions } } = f
  try {
    f.hooks('index').onShow()
    await f.select()
    assert.equal(index.imagePath.value, 'wxfile://photo.jpg')
    assert.equal(index.choosing.value, false)
    await index.updatePreview()
    assert.equal(index.error.value, '')
    assert.equal(index.pattern.value.flat().filter(Boolean).length, 1)
    index.editSubject()
    const selection = { mask: new Uint8Array(4).fill(255), size: 2, autoFit: true }
    assert.ok(sessions.finishSubjectEdit(sessions.getSubjectEdit().id, selection))
    f.hooks('index').onShow()
    await index.updatePreview()
    assert.equal(index.subjectEnabled.value, true)
    assert.equal(state.calls.filter(call => call[0] === 'process').at(-1)[2], selection)
    index.openResult()
    assert.ok(state.calls.some(call => call[0] === 'navigate' && call[1] === '/pages/result/result'))
    f.hooks('result').onLoad(); await f.hooks('result').onReady()
    assert.ok(result.pattern.value)
    assert.equal(result.saved.value, true)
    assert.equal(JSON.parse(state.memory.get('cloud_works'))[0].safetyVersion, undefined)
    state.modalResult = { confirm: true, content: '我的本地照片' }
    result.rename()
    assert.equal(result.name.value, '我的本地照片')
    assert.equal(result.renaming.value, false)
    const code = result.pattern.value.flat().find(Boolean).code
    await result.toggleCompleted(code)
    await result.copyList()
    assert.match(state.clipboard, /我的本地照片/)
    await result.saveImage(true); await result.saveImage(false)
    assert.deepEqual(state.exports.map(item => item.labels), [true, false])
    assert.ok(state.exports.every(item => item.name === '我的本地照片'))
    assert.equal(state.calls.filter(call => call[0] === 'album').length, 2)
    f.hooks('history').onShow(); await history.reloadHistory()
    assert.equal(history.list.value[0].name, '我的本地照片')
    assert.deepEqual(history.list.value[0].completedCodes, [code])
    // Old unchecked records stay usable and retain their name and progress.
    const raw = JSON.parse(state.memory.get('cloud_works')); raw[0].safetyVersion = 0
    state.memory.set('cloud_works', JSON.stringify(raw)); await history.reloadHistory()
    assert.equal(history.list.value[0].name, '我的本地照片')
    history.openPattern(history.list.value[0]); f.hooks('result').onLoad(); await result.initialize()
    assert.equal(result.name.value, '我的本地照片')
    assert.deepEqual(result.completedCodes.value, [code])
    // A new generation is a separate work and cannot replace an existing work.
    index.resetImage(); f.hooks('index').onShow(); await f.select('wxfile://same-grid.jpg'); await index.updatePreview()
    index.openResult(); f.hooks('result').onLoad(); await result.initialize()
    assert.equal(result.name.value, '我的小作品')
    assert.deepEqual(result.completedCodes.value, [])
    assert.equal(JSON.parse(state.memory.get('cloud_works')).length, 2, 'new generations are independent cloud works')
    assert.equal(state.modals.length, 1, 'only the rename dialog is needed')
    assert.ok(state.calls.some(call => Array.isArray(call) && call[0] === 'request')); assert.ok(!state.calls.some(call => typeof call === 'string' && /upload/.test(call)))
  } finally { f.dispose() }
})

test('color labels preserve the view and pinch/button zoom can always return to the full chart', async () => {
  const f = await fixture(), { result } = f.pages
  try {
    for (const size of [29, 58, 87]) {
      result.gridSize.value = size
      result.resetView()
      const key = result.viewKey.value
      result.toggleLabels({ detail: { value: true } })
      assert.equal(result.zoom.value, 1, `${size}-cell chart stays fully visible after enabling codes`)
      assert.equal(result.viewKey.value, key, 'enabling labels does not remount or recenter a panned chart')
      result.handleScale({ detail: { scale: 2.35 } })
      result.toggleLabels({ detail: { value: false } })
      result.toggleLabels({ detail: { value: true } })
      assert.equal(result.zoom.value, 2.35, 'labels preserve the current pinch zoom')
      result.changeZoom(-.5)
      assert.equal(result.zoom.value, 1.85, 'minus works from the actual pinch zoom')
      for (let i = 0; i < 8; i++) result.changeZoom(-.5)
      assert.equal(result.zoom.value, 1, 'minus reaches the full chart')
      result.handleScale({ detail: { scale: 3.2 } })
      result.resetView()
      assert.equal(result.zoom.value, 1)
      assert.ok(result.viewKey.value > key, 'full view resets drag position too')
    }
    result.handleScale({ detail: { scale: 3.9 } }); result.changeZoom(.5)
    assert.equal(result.zoom.value, 4.4)
    result.handleScale({ detail: { scale: NaN } })
    assert.equal(result.zoom.value, 4.4)
    result.selectBoard(0)
    assert.equal(result.boardIndex.value, 0)
    assert.equal(result.zoom.value, 1)
    assert.equal(result.showLabels.value, true)
  } finally { f.dispose() }
})

test('native scale reports cannot issue more scale commands, including delayed and imprecise frames', async () => {
  const f = await fixture(), { result } = f.pages
  try {
    const source = await readFile(resolve(root, 'src/pages/result/result.vue'), 'utf8')
    assert.match(source, /:command="touchCommand"/, 'button commands are independent from observed gesture scale')
    await result.changeZoom(.5)
    assert.equal(result.scaleCommand.value, 1.5)
    const key = result.viewKey.value
    for (const scale of [1.01, 1.07, 1.03999996, 1.02, 1.06, 2.35, 2.3499999]) {
      result.handleScale({ detail: { scale }, currentTarget: { dataset: { viewKey: key } } })
      await Promise.resolve()
      assert.equal(result.zoom.value, scale)
      assert.equal(result.scaleCommand.value, 1.5, 'a gesture report never echoes through the native scale input')
      assert.equal(result.viewKey.value, key, 'gesture reports never remount the canvas')
    }
    await result.changeZoom(-.5)
    assert.equal(result.scaleCommand.value, 1.85, 'button commands start from the observed pinch scale')
    result.resetView()
    result.handleScale({ detail: { scale: 2.35 }, currentTarget: { dataset: { viewKey: String(key) } } })
    assert.equal(result.zoom.value, 1, 'a delayed event from the discarded view cannot undo full view')
    for (const scale of [0, -1, Infinity, NaN]) result.handleScale({ detail: { scale } })
    assert.equal(result.zoom.value, 1)
    assert.equal(result.scaleCommand.value, 1)
  } finally { f.dispose() }
})

test('buttons can repeat their previous target after pinching without a feedback loop or stale reset', async () => {
  const f = await fixture(), { result } = f.pages
  try {
    await result.changeZoom(.5)
    result.handleScale({ detail: { scale: 2 } })
    await result.changeZoom(-.5)
    assert.equal(result.zoom.value, 1.5)
    assert.equal(result.scaleCommand.value, 1.5, 'repeated target is delivered after syncing the native current scale')
    result.handleScale({ detail: { scale: 2 } })
    const pending = result.changeZoom(-.5)
    result.resetView()
    await pending
    assert.equal(result.zoom.value, 1, 'reset cancels a pending two-tick command')
    assert.equal(result.scaleCommand.value, 1)
    result.handleScale({ detail: { scale: 2 } })
    await result.changeZoom(-.5)
    result.handleScale({ detail: { scale: 2 } })
    const cancelled = result.changeZoom(-.5)
    f.hooks('result').onUnload()
    const lastCommand = result.scaleCommand.value
    await cancelled
    assert.equal(result.scaleCommand.value, lastCommand, 'unload cancels a pending scale command')
  } finally { f.dispose() }
})

test('cancel, empty picker, permission failure and a late picker result do not leave selection stuck', async () => {
  const f = await fixture(), { index } = f.pages
  try {
    f.hooks('index').onShow()
    for (const outcome of ['cancel', 'deny', 'privacy permission is not authorized', 'empty']) {
      const pending = index.chooseImage(), picker = f.state.picks.at(-1)
      if (outcome === 'empty') picker.success({ tempFilePaths: [] }); else picker.fail({ errMsg: `chooseImage:fail ${outcome}` })
      await pending
      assert.equal(index.choosing.value, false)
      assert.equal(index.imagePath.value, '')
    }
    assert.ok(f.state.calls.some(call => call[0] === 'toast' && /隐私/.test(call[1])))
    const pending = index.chooseImage(), picker = f.state.picks.at(-1), count = f.state.picks.length
    await index.chooseImage(); assert.equal(f.state.picks.length, count)
    index.resetImage(); picker.success({ tempFilePaths: ['wxfile://late.jpg'] }); await pending
    assert.equal(index.imagePath.value, '')
    await f.select('wxfile://broken.jpg'); f.state.decodeError = true; await index.updatePreview()
    assert.match(index.error.value, /图片加载失败/); assert.equal(index.processing.value, false)
    f.state.decodeError = false; await f.select('wxfile://broken.jpg')
    assert.equal(index.processing.value, true, 'reselecting the same path schedules a new preview')
    assert.equal(index.error.value, '')
    await index.updatePreview()
    assert.equal(index.error.value, ''); assert.ok(index.pattern.value); assert.equal(index.choosing.value, false)
    assert.ok(!f.state.calls.some(call => call[0] === 'tab'))
  } finally { f.dispose() }
})

test('cloud save failure and denied album access remain recoverable without losing the working chart', async () => {
  const f = await fixture(), { index, result } = f.pages
  try {
    f.hooks('index').onShow(); await f.select(); await index.updatePreview(); index.openResult()
    f.state.storageError = true; f.hooks('result').onLoad(); await f.hooks('result').onReady()
    assert.ok(result.pattern.value); assert.equal(result.saved.value, false)
    f.state.albumError = { errMsg: 'saveImageToPhotosAlbum:fail privacy authorization denied' }
    await result.saveImage(true)
    assert.equal(result.exporting.value, false)
    assert.ok(f.state.calls.some(call => call[0] === 'toast' && /隐私/.test(call[1])))
    assert.ok(!f.state.modals.some(modal => modal.title === '需要相册权限'), 'privacy refusal must not open the unrelated album settings flow')
    f.state.albumError = { errMsg: 'saveImageToPhotosAlbum:fail auth deny' }
    await result.saveImage(true)
    assert.equal(result.exporting.value, false)
    assert.equal(f.state.modals.at(-1).title, '需要相册权限')
    assert.ok(!f.state.calls.some(call => call[0] === 'toast' && call[1] === '高清图纸已保存'))
    f.state.albumError = null; await result.saveImage(true)
    assert.equal(result.exporting.value, false)
    assert.ok(f.state.calls.some(call => call[0] === 'toast' && call[1] === '高清图纸已保存'))
    f.state.storageError = false
    await result.toggleCompleted(result.pattern.value.flat().find(Boolean).code)
    assert.equal(result.saved.value, true)
  } finally { f.dispose() }
})

test('unapproved photos stay out of preview, subject editing and generation; failure remains retryable', async () => {
  const f = await fixture(), { index } = f.pages
  try {
    f.hooks('index').onShow()
    for (const code of ['blocked', 'unavailable', 'timeout']) {
      f.state.safetyError = code
      await f.select(`wxfile://${code}.jpg`)
      assert.equal(index.imagePath.value, '')
      assert.equal(index.pattern.value, null)
      assert.equal(index.choosing.value, false)
      assert.equal(index.checking.value, false)
      index.openResult(); index.editSubject()
      assert.ok(!f.state.calls.some(call => ['process', 'navigate'].includes(call[0])))
    }
    assert.equal(f.state.modals[0].content, '内容含违规信息')
    f.state.safetyError = null
    await f.select('wxfile://normal.jpg'); await index.updatePreview()
    assert.ok(index.pattern.value)
    f.state.safetyError = 'blocked'; await f.select('wxfile://rejected-replacement.jpg')
    assert.equal(index.imagePath.value, 'wxfile://normal.jpg', 'failed replacement preserves the earlier checked image')
  } finally { f.dispose() }
})

test('a cancelled or hidden-page check cannot install its image after a newer selection', async () => {
  const f = await fixture(), { index } = f.pages
  try {
    f.hooks('index').onShow()
    for (const cancel of [() => index.cancelPickedImage(), () => f.hooks('index').onHide()]) {
      let finish
      f.state.safetyWait = new Promise(resolve => { finish = resolve })
      const pending = f.select('wxfile://late-detection.jpg')
      await Promise.resolve(); await Promise.resolve()
      assert.equal(index.checking.value, true)
      assert.equal(index.imagePath.value, '')
      cancel(); f.state.safetyWait = null
      await f.select('wxfile://newer.jpg')
      finish(); await pending
      assert.equal(index.imagePath.value, 'wxfile://newer.jpg')
      index.resetImage(); f.hooks('index').onShow()
    }
  } finally { f.dispose() }
})

test('unchecked old records and both export formats cannot bypass a failed pattern check', async () => {
  const f = await fixture(), { index, result } = f.pages
  try {
    f.hooks('index').onShow(); await f.select(); await index.updatePreview(); index.openResult()
    f.state.safetyError = 'blocked'
    f.hooks('result').onLoad(); await f.hooks('result').onReady()
    assert.equal(result.pattern.value, null)
    assert.equal(result.saved.value, false)
    assert.equal(f.state.memory.has('cloud_works'), false)
    f.state.safetyError = null; await result.initialize()
    assert.ok(result.pattern.value)
    for (const labels of [true, false]) {
      f.state.safetyError = 'blocked'; await result.saveImage(labels)
      assert.equal(result.exporting.value, false)
      assert.equal(f.state.calls.filter(call => call[0] === 'album').length, 0)
      assert.equal(f.state.exports.length, 0)
      assert.equal(f.state.modals.at(-1).content, '内容含违规信息')
    }
    f.state.safetyError = null; await result.saveImage(true)
    assert.equal(f.state.calls.filter(call => call[0] === 'album').length, 1)
  } finally { f.dispose() }
})

async function eventually(predicate) {
  for(let i=0;i<100;i++){if(predicate())return;await new Promise(resolve=>setImmediate(resolve))}
  assert.fail('The expected async operation did not start')
}

test('continuous brush strokes interpolate cells, cancel for pinch and undo as one action',async()=>{
 const f=await fixture(),{editor}=f.pages
 try{
  editor.drawStart({x:20,y:20});editor.drawMove({x:240,y:20});editor.drawEnd()
  assert.equal(editor.cells.value[0][0]?.code,'A1');assert.equal(editor.cells.value[0][1]?.code,'A1')
  editor.undo();assert.equal(editor.changed.value,false);editor.redo();assert.equal(editor.changed.value,true)
  const before=editor.cells.value
  editor.tool.value='erase';editor.drawStart({x:20,y:20});editor.drawMove({x:240,y:20});editor.drawCancel()
  assert.equal(editor.cells.value,before,'second finger cancels pending stroke before the pinch')
  editor.drawStart({x:20,y:20});editor.drawEnd();assert.equal(editor.cells.value[0][0],null)
  editor.undo();assert.equal(editor.cells.value,before)
  editor.tool.value='pick';editor.drawStart({x:20,y:20});const picked=editor.cells.value;editor.drawMove({x:240,y:240});editor.drawEnd()
  assert.equal(editor.tool.value,'brush');assert.equal(editor.cells.value,picked,'dragging after picking must not paint until a new stroke')
  editor.tool.value='brush';editor.drawStart({x:20,y:240});editor.drawEnd();assert.equal(editor.cells.value[1][0]?.code,'A1')
  f.state.editorProps.saving=true;const saving=editor.cells.value;editor.drawStart({x:240,y:240});editor.drawEnd();assert.equal(editor.cells.value,saving)
 }finally{f.dispose()}
})

test('the chart renders before slow cloud calls, and edits during the first save are retained',async()=>{
  const f=await fixture(),{index,result}=f.pages
  try{
    f.hooks('index').onShow();await f.select();await index.updatePreview();index.openResult();f.hooks('result').onLoad()
    const held=[]
    f.state.holdRequest=(path,options)=>{if(path==='/inventory'||(path.startsWith('/works')&&options.method!=='GET')){held.push({path,options});return true}}
    const opening=result.initialize()
    await eventually(()=>held.some(item=>item.path==='/works'))
    assert.ok(f.state.calls.some(call=>call[0]==='draw'),'cloud calls cannot leave the chart blank')
    assert.equal(result.initializing.value,false)
    const code=result.colorUsage?.value?.[0]?.code||result.pattern.value.flat().find(Boolean).code
    const changed=result.toggleCompleted(code)
    f.state.holdRequest=(path,options)=>{if(path.startsWith('/works/')&&options.method==='PUT'){held.push({path,options});return true}}
    const first=held.find(item=>item.path==='/works');uni.request(first.options)
    await eventually(()=>held.some(item=>item.options.method==='PUT'))
    assert.equal(result.saved.value,false,'an old acknowledgement cannot mark newer edits as saved')
    assert.equal(result.cloudSaving.value,true)
    const second=held.find(item=>item.options.method==='PUT');f.state.holdRequest=null;uni.request(second.options)
    await changed
    uni.request(held.find(item=>item.path==='/inventory').options);await opening
    assert.equal(result.saved.value,true);assert.equal(result.cloudSaving.value,false)
    assert.deepEqual(JSON.parse(f.state.memory.get('cloud_works'))[0].completedCodes,[code])
  }finally{f.dispose()}
})

test('inventory failure does not prevent a new chart from saving',async()=>{
  const f=await fixture(),{index,result}=f.pages
  try{
    f.hooks('index').onShow();await f.select();await index.updatePreview();index.openResult();f.hooks('result').onLoad()
    f.state.holdRequest=(path,options)=>{if(path==='/inventory'){options.fail({});return true}}
    await result.initialize()
    assert.ok(result.pattern.value);assert.equal(result.saved.value,true)
    assert.equal(JSON.parse(f.state.memory.get('cloud_works')).length,1)
  }finally{f.dispose()}
})

test('resuming the inventory page preserves unsaved quantities and saving freezes the submitted values',async()=>{
  const f=await fixture(),{inventory}=f.pages
  try{
    await f.hooks('inventory').onShow();inventory.change('A1','quantity','23')
    await f.hooks('inventory').onShow()
    assert.equal(inventory.stock.value.A1.quantity,23);assert.equal(inventory.dirty.value,true)
    let held
    f.state.holdRequest=(path,options)=>{if(path==='/inventory'&&options.method==='PUT'){held=options;return true}}
    const saving=inventory.save();assert.equal(inventory.busy.value,true)
    inventory.change('A1','quantity','99');inventory.selectPalette('hama')
    assert.equal(inventory.stock.value.A1.quantity,23);assert.equal(inventory.paletteId.value,'mard')
    f.state.holdRequest=null;uni.request(held);await saving
    assert.equal(inventory.dirty.value,false);assert.equal(f.state.inventory[0].quantity,23)
    await inventory.load();assert.equal(inventory.stock.value.A1.quantity,23)
  }finally{f.dispose()}
})

test('an obsolete works reload cannot replace the latest page or duplicate a loaded card',async()=>{
  const f=await fixture(),{history}=f.pages
  try{
    const held=[];f.state.holdRequest=(path,options)=>{if(path.startsWith('/works?')){held.push(options);return true}}
    const first=history.reloadHistory(),second=history.reloadHistory()
    const work={id:'latest',name:'最新图纸',colorUsage:[]}
    held[1].success({statusCode:200,data:{data:{items:[work],total:2}}});await second
    held[0].success({statusCode:200,data:{data:{items:[{...work,id:'old'}],total:1}}});await first
    assert.deepEqual(history.list.value.map(item=>item.id),['latest'])
    const more=history.loadMoreCloud();held[2].success({statusCode:200,data:{data:{items:[work,{...work,id:'next'}],total:2}}});await more
    assert.deepEqual(history.list.value.map(item=>item.id),['latest','next'])
  }finally{f.dispose()}
})

test('late guest responses cannot clear a new login, and invalid API envelopes are recoverable errors',async()=>{
  const f=await fixture(),{cloud}=f.pages
  try{
    cloud.clearSession();let held
    f.state.holdRequest=(_path,options)=>{held=options;return true}
    const guest=cloud.request('/config')
    cloud.setSession({token:'new-session',user:{id:'new-user'}})
    held.success({statusCode:401,data:{message:'expired'}})
    await assert.rejects(guest,error=>error.code==='SESSION_CHANGED')
    assert.equal(cloud.cloudSession.token,'new-session')
    const invalid=cloud.request('/config');held.success({statusCode:200,data:'<!doctype html>'})
    await assert.rejects(invalid,/服务返回异常/)
    assert.equal(cloud.cloudSession.user.id,'new-user')
  }finally{f.dispose()}
})


test('creation wizard has reversible steps, composition tools and opens only after confirmation',async()=>{
 const f=await fixture(),{index}=f.pages
 try{f.hooks('index').onShow();await f.select();await index.updatePreview();assert.equal(index.createStep.value,1)
 index.rotatePhoto();index.mirrorPhoto();assert.equal(index.composition.value.rotation,1);assert.equal(index.composition.value.flipX,true)
 await index.updatePreview();index.nextStep();assert.equal(index.createStep.value,2);index.nextStep();assert.equal(index.createStep.value,3)
 index.backStep();assert.equal(index.createStep.value,2);assert.ok(!f.state.calls.some(c=>c[0]==='navigate'&&c[1]==='/pages/result/result'))
 index.nextStep();index.nextStep();assert.ok(f.state.calls.some(c=>c[0]==='navigate'&&c[1]==='/pages/result/result'))
 }finally{f.dispose()}
})
test('guest work and completed color survive leaving and reopening without a cloud account',async()=>{
 const f=await fixture(),{index,result,history,cloud}=f.pages
 try{cloud.cloudSession.user=null;f.hooks('index').onShow();await f.select();await index.updatePreview();index.openResult();f.hooks('result').onLoad();await result.initialize()
 assert.match(result.localRecordId.value,/^pattern_/);const code=f.pages.app.getPending().colorUsage[0].code
 result.togglePlaying();assert.equal(result.playing.value,true);assert.equal(result.selectedCode.value,code)
 await result.completeAndNext();assert.deepEqual(result.completedCodes.value,[code]);assert.ok(f.state.modals.some(m=>m.title==='每一颗，都拼好了'))
 await history.reloadHistory();assert.equal(history.list.value.length,1);assert.deepEqual(history.list.value[0].completedCodes,[code])
 history.openPattern(history.list.value[0]);f.hooks('result').onLoad();await result.initialize();assert.deepEqual(result.completedCodes.value,[code]);assert.equal(history.list.value[0].id,result.localRecordId.value)
 assert.ok(!f.state.calls.some(c=>c[0]==='request'&&c[1].includes('/works')))
 }finally{f.dispose()}
})

test('a failed local update stays unsaved even when a local record already exists, then retries',async()=>{
 const f=await fixture(),{index,result,cloud}=f.pages
 try{
  cloud.clearSession();f.hooks('index').onShow();await f.select();await index.updatePreview();index.openResult();f.hooks('result').onLoad();await result.initialize()
  assert.equal(result.saveStatus.value,'已保存在本机');assert.equal(result.currentSaved.value,true)
  const record=result.localRecordId.value,before=f.state.memory.get('bead_history'),code=result.pattern.value.flat().find(Boolean).code
  f.state.storageError=true
  assert.equal(await result.toggleCompleted(code),false)
  assert.equal(result.localRecordId.value,record);assert.equal(result.localSaved.value,false);assert.equal(result.currentSaved.value,false)
  assert.equal(result.saveStatus.value,'待保存本机');assert.match(result.cloudError.value,/本机存储/)
  assert.equal(f.state.memory.get('bead_history'),before);assert.deepEqual(result.completedCodes.value,[code])
  f.state.storageError=false
  assert.equal(await result.persist(),true)
  assert.equal(result.saveStatus.value,'已保存在本机');assert.equal(result.cloudError.value,'')
  assert.deepEqual(JSON.parse(f.state.memory.get('bead_history'))[0].completedCodes,[code])
 }finally{f.dispose()}
})

for(const guest of [true,false])test(`${guest?'local':'cloud'} editor save failure keeps the edit retryable and only commits after storage succeeds`,async()=>{
 const f=await fixture(),{index,result,cloud}=f.pages
 try{
  if(guest)cloud.clearSession()
  f.hooks('index').onShow();await f.select();await index.updatePreview();index.openResult();f.hooks('result').onLoad();await result.initialize()
  const before=result.pattern.value,bead=before.flat().find(Boolean),cells=before.map(row=>row.slice())
  cells[0][0]=bead
  await result.toggleCompleted(bead.code)
  const previousProgress=[...result.completedCodes.value],storageKey=guest?'bead_history':'cloud_works',stored=f.state.memory.get(storageKey)
  result.editing.value=true;f.state.storageError=true
  await result.saveEdited(cells)
  assert.equal(result.pattern.value,before,'unchanged editor input preserves its dirty state, cells and undo history')
  assert.equal(result.editing.value,true);assert.equal(result.editorSaving.value,false)
  assert.deepEqual(result.completedCodes.value,previousProgress);assert.equal(f.state.memory.get(storageKey),stored)
  assert.equal(result.currentSaved.value,false);assert.ok(result.cloudError.value)
  assert.ok(f.state.calls.some(call=>call[0]==='toast'&&call[1]===result.cloudError.value),'save failure is visible over the fullscreen editor')
  f.state.storageError=false
  await result.saveEdited(cells)
  assert.equal(result.pattern.value,cells);assert.equal(result.editing.value,false);assert.equal(result.editorSaving.value,false)
  assert.equal(result.currentSaved.value,true);assert.deepEqual(result.completedCodes.value,[])
  const saved=JSON.parse(f.state.memory.get(storageKey))[0]
  assert.equal(guest?saved.compressed.grid[0][0]:saved.pattern[0][0].code,bead.code)
  assert.deepEqual(saved.completedCodes,[])
 }finally{f.dispose()}
})

for(const interruption of ['account switch','unload'])test(`a late save after ${interruption} cannot commit edits or send queued saves`,async()=>{
 const f=await fixture(),{index,result,cloud}=f.pages
 try{
  f.hooks('index').onShow();await f.select();await index.updatePreview();index.openResult();f.hooks('result').onLoad();await result.initialize()
  const before=result.pattern.value,cells=before.map(row=>row.slice());cells[0][0]=before.flat().find(Boolean)
  const held=[]
  f.state.holdRequest=(path,options)=>{if(path.startsWith('/works/')&&options.method==='PUT'){held.push(options);return true}}
  result.editing.value=true
  const editing=result.saveEdited(cells)
  await eventually(()=>held.length===1)
  const queued=result.persist({name:'排队中的旧作品'})
  if(interruption==='account switch')cloud.setSession({token:'other-token',user:{id:'other-customer'}})
  else f.hooks('result').onUnload()
  const stateAfterInterruption={pattern:result.pattern.value,id:result.recordId.value,saved:result.saved.value,error:result.cloudError.value,editing:result.editing.value,calls:f.state.calls.length}
  held[0].success({statusCode:200,data:{data:{...held[0].data,id:'late-result',version:99}}})
  await editing;assert.equal(await queued,false)
  assert.equal(held.length,1,'discarded queued work must not issue an authenticated write')
  assert.equal(result.pattern.value,stateAfterInterruption.pattern);assert.equal(result.recordId.value,stateAfterInterruption.id)
  assert.equal(result.saved.value,stateAfterInterruption.saved);assert.equal(result.cloudError.value,stateAfterInterruption.error)
  assert.equal(result.editing.value,stateAfterInterruption.editing);assert.equal(f.state.calls.length,stateAfterInterruption.calls)
  assert.equal(result.cloudSaving.value,false);assert.equal(result.editorSaving.value,false)
  if(interruption==='account switch'){assert.equal(result.pattern.value,null);assert.match(result.loadError.value,/账号已切换/)}
 }finally{f.dispose()}
})

for(const interruption of ['account switch','unload'])test(`a late editor safety check after ${interruption} cannot change or save the chart`,async()=>{
 const f=await fixture(),{index,result,cloud}=f.pages
 try{
  f.hooks('index').onShow();await f.select();await index.updatePreview();index.openResult();f.hooks('result').onLoad();await result.initialize()
  const cells=result.pattern.value.map(row=>row.slice());cells[0][0]=result.pattern.value.flat().find(Boolean)
  let finish;f.state.safetyWait=new Promise(resolve=>{finish=resolve})
  result.editing.value=true;const editing=result.saveEdited(cells)
  if(interruption==='account switch')cloud.setSession({token:'other-token',user:{id:'other-customer'}})
  else f.hooks('result').onUnload()
  const before={pattern:result.pattern.value,calls:f.state.calls.length,stored:f.state.memory.get('cloud_works')}
  finish();await editing
  assert.equal(result.pattern.value,before.pattern);assert.equal(f.state.calls.length,before.calls)
  assert.equal(f.state.memory.get('cloud_works'),before.stored);assert.equal(result.editorSaving.value,false)
 }finally{f.dispose()}
})

test('switching accounts while opening a chart cannot install or save the previous account draft',async()=>{
 const f=await fixture(),{index,result,cloud}=f.pages
 try{
  f.hooks('index').onShow();await f.select();await index.updatePreview();index.openResult();f.hooks('result').onLoad()
  let finish;f.state.safetyWait=new Promise(resolve=>{finish=resolve})
  const opening=result.initialize()
  cloud.setSession({token:'other-token',user:{id:'other-customer'}})
  finish();await opening
  assert.equal(result.pattern.value,null);assert.equal(result.initializing.value,false);assert.match(result.loadError.value,/账号已切换/)
  assert.ok(!f.state.calls.some(call=>call[0]==='request'&&call[1].includes('/works')))
 }finally{f.dispose()}
})

test('finishing a color retries unsaved progress before announcing completion',async()=>{
 const f=await fixture(),{index,result,cloud}=f.pages
 try{
  cloud.clearSession();f.hooks('index').onShow();await f.select();await index.updatePreview();index.openResult();f.hooks('result').onLoad();await result.initialize()
  result.togglePlaying();const selected=result.selectedCode.value
  f.state.storageError=true;await result.completeAndNext()
  assert.equal(result.selectedCode.value,selected);assert.equal(result.localSaved.value,false)
  assert.ok(!f.state.modals.some(modal=>modal.title==='每一颗，都拼好了'))
  f.state.storageError=false;await result.completeAndNext()
  assert.equal(result.localSaved.value,true);assert.deepEqual(JSON.parse(f.state.memory.get('bead_history'))[0].completedCodes,[selected])
  assert.equal(f.state.modals.filter(modal=>modal.title==='每一颗，都拼好了').length,1)
 }finally{f.dispose()}
})

for(const action of ['completeAndNext','printPdf'])for(const interruption of ['account switch','unload'])test(`${action} cannot continue after a save interrupted by ${interruption}`,async()=>{
 const f=await fixture(),{index,result,cloud}=f.pages
 try{
  f.hooks('index').onShow();await f.select();await index.updatePreview();index.openResult();f.hooks('result').onLoad();await result.initialize()
  if(action==='completeAndNext')result.togglePlaying()
  let held;f.state.holdRequest=(path,options)=>{if(path.startsWith('/works/')&&options.method==='PUT'){held=options;return true}}
  const pending=result[action](false);await eventually(()=>held)
  if(interruption==='account switch')cloud.setSession({token:'other-token',user:{id:'other-customer'}})
  else f.hooks('result').onUnload()
  const before={calls:f.state.calls.length,modals:f.state.modals.length,selected:result.selectedCode.value}
  held.success({statusCode:200,data:{data:{...held.data,version:2}}});await pending
  assert.equal(f.state.calls.length,before.calls);assert.equal(f.state.modals.length,before.modals)
  assert.equal(result.selectedCode.value,before.selected);assert.equal(result.exporting.value,false)
 }finally{f.dispose()}
})
