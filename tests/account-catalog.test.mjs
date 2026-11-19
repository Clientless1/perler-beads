import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'esbuild'

const require = createRequire(import.meta.url)
const root = new URL('..', import.meta.url).pathname
const vueRuntime = require.resolve('vue/dist/vue.runtime.esm-bundler.js')
const { initScopedPreContext } = require('@dcloudio/uni-cli-shared/dist/preprocess/context')
const { preprocess } = require('@dcloudio/uni-cli-shared/lib/preprocess')
let sequence = 0
async function fixture(platform = 'mp-weixin') {
  const state = { calls: [], hooks: {}, stops: [], memory: new Map() }
  globalThis.__accountCatalog = state
  globalThis.getCurrentPages=()=>[{},{}]
  globalThis.uni = {
    getStorageSync: key => state.memory.get(key),
    setStorageSync: (key, value) => state.memory.set(key, value),
    removeStorageSync: key => state.memory.delete(key),
    getSystemInfoSync: () => ({ windowWidth: 390 }),
    getMenuButtonBoundingClientRect: () => ({ top: 8, height: 32 }),
    setNavigationBarTitle() {}, hideTabBar() {}, showTabBar() {},
    navigateTo: options => state.calls.push(['navigate', options.url]),
    navigateBack: () => state.calls.push(['back']),
    switchTab: options => state.calls.push(['tab',options.url]),
    showToast: options => state.calls.push(['toast', options.title]),
    request: options => {
      const path = options.url.replace(/^.*\/api\/v1/, '')
      state.calls.push(['request', path])
      if (path === '/auth/logout') return options.fail({ errMsg: 'network disconnected' })
      options.success({ statusCode: 200, data: { data: { items: [], total: 0 } } })
    },
  }
  const context = initScopedPreContext(platform).preVueContext
  const processed = source => preprocess(source, context, { type: 'js' })
  const exposed = {
    catalog: 'collection,loadCatalog,selected,selectedPattern,detailLoading,loading',
    account: 'logout,importProject,error,config,canPurchase,canWechatPay,canTestPay,createOrder,pay,testPay,phoneLoggedIn,bindingPhone,bindAccepted',
  }
  const output = await build({
    stdin: { contents: `export * as catalog from 'page:catalog';export * as account from 'page:account';export * as cloud from './src/utils/cloud';export {nextTick} from 'vue';`, resolveDir: root },
    bundle: true, write: false, format: 'esm', platform: 'node',
    define: { 'import.meta.env.VITE_API_BASE_URL': '""' },
    plugins: [{ name: 'page-fixture', setup(api) {
      api.onResolve({ filter: /^page:/ }, args => ({ path: args.path.slice(5), namespace: 'page' }))
      api.onLoad({ filter: /.*/, namespace: 'page' }, async args => {
        const path = resolve(root, args.path === 'catalog' ? 'src/pages/templates/templates.vue' : 'src/member/account/account.vue')
        const source = (await readFile(path, 'utf8')).match(/<script setup>([\s\S]*?)<\/script>/)[1]
        return { contents: processed(source) + `\nexport {${exposed[args.path]}};`, resolveDir: resolve(path, '..') }
      })
      api.onLoad({ filter: /\.js$/, namespace: 'file' }, async args => args.path.startsWith(resolve(root, 'src') + '/') ? { contents: processed(await readFile(args.path, 'utf8')), resolveDir: resolve(args.path, '..') } : undefined)
      api.onResolve({ filter: /\.vue$/ }, args => ({ path: args.path, namespace: 'component' }))
      api.onLoad({ filter: /.*/, namespace: 'component' }, () => ({ contents: 'export default {}' }))
      api.onResolve({ filter: /^@dcloudio\/uni-app$/ }, () => ({ path: 'hooks', namespace: 'fixture' }))
      api.onLoad({ filter: /^hooks$/, namespace: 'fixture' }, () => ({ contents: `const s=globalThis.__accountCatalog;${['onShow','onHide','onLoad','onReachBottom'].map(name => `export const ${name}=callback=>{s.hooks.${name}=callback};`).join('')}` }))
      api.onResolve({ filter: /^vue$/ }, () => ({ path: 'vue', namespace: 'fixture' }))
      api.onLoad({ filter: /^vue$/, namespace: 'fixture' }, () => ({ resolveDir: root, contents: `import * as Vue from ${JSON.stringify(vueRuntime)};export const {ref,reactive,computed,nextTick}=Vue;export const watch=(...args)=>{const stop=Vue.watch(...args);globalThis.__accountCatalog.stops.push(stop);return stop};` }))
    } }],
  })
  const pages = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}#${++sequence}`)
  return { ...pages, state, dispose: () => state.stops.forEach(stop => stop()) }
}

test('anonymous favorites never reopen the login page when returning from it', async () => {
  const f = await fixture()
  try {
    f.catalog.collection.value = 'favorites'
    await f.nextTick()
    await f.catalog.loadCatalog()
    await f.catalog.loadCatalog()
    assert.equal(f.catalog.loading.value, false)
    assert.deepEqual(f.state.calls.filter(call => call[0] === 'navigate'), [])
    assert.deepEqual(f.state.calls.filter(call => call[1]?.startsWith('/me/favorites')), [])
  } finally { f.dispose() }
})

test('account switch removes the previous account template detail before it can be reused', async () => {
  const f = await fixture()
  try {
    f.cloud.setSession({ token: 'first', user: { id: 'first' } })
    await f.nextTick()
    f.catalog.selected.value = { id: 'private-template', premium: true }
    f.catalog.selectedPattern.value = { pattern: [[{ code: 'A1' }]] }
    f.catalog.detailLoading.value = true
    f.cloud.setSession({ token: 'second', user: { id: 'second' } })
    await f.nextTick()
    assert.equal(f.catalog.selected.value, null)
    assert.equal(f.catalog.selectedPattern.value, null)
    assert.equal(f.catalog.detailLoading.value, false)
  } finally { f.dispose() }
})

test('network failure during logout still removes the device session', async () => {
  const f = await fixture()
  try {
    f.cloud.setSession({ token: 'fixture', user: { id: 'fixture' } })
    await f.account.logout()
    assert.equal(f.cloud.isLoggedIn(), false)
    assert.equal(f.state.memory.has('douwu_cloud_session_v1'), false)
    assert.match(f.account.error.value, /网络/)
  } finally { f.dispose() }
})

test('unsupported native project import gives a clear message instead of parsing undefined', async () => {
  const f = await fixture('app')
  try {
    await f.account.importProject()
    assert.match(f.account.error.value, /暂不支持导入工程文件/)
    assert.equal(f.state.calls.some(call => call[1] === '/works'), false)
  } finally { f.dispose() }
})


test('checkout stays unavailable until both platform and service support payment', async () => {
  for (const platform of ['h5', 'mp-weixin', 'app']) {
    const f = await fixture(platform)
    try {
      assert.equal(f.account.canPurchase.value, false)
      f.account.createOrder({id:'disabled-plan'})
      f.account.pay({id:'disabled-order'})
      f.account.testPay({id:'disabled-order'})
      assert.equal(f.state.calls.some(call => call[0] === 'request'), false)
      f.account.config.value = {wechatPayment:true,testPayments:true}
      assert.equal(f.account.canPurchase.value, platform !== 'app')
      if(platform === 'app') {
        f.account.createOrder({id:'unsupported-plan'})
        f.account.pay({id:'unsupported-order'})
        f.account.testPay({id:'unsupported-order'})
        assert.equal(f.state.calls.some(call => call[0] === 'request'), false)
      }
      f.account.config.value = {wechatPayment:false,testPayments:false}
      assert.equal(f.account.canPurchase.value, false)
    } finally { f.dispose() }
  }
})


test('phone login finishing while reading SMS waits until the account page resumes before navigating', async () => {
  const f = await fixture()
  try {
    f.state.hooks.onHide()
    f.account.phoneLoggedIn({token:'phone-session',user:{id:'phone-user'}})
    assert.equal(f.cloud.cloudSession.user.id,'phone-user')
    assert.equal(f.state.calls.some(call=>call[0]==='back'),false)
    await f.state.hooks.onShow()
    assert.equal(f.state.calls.filter(call=>call[0]==='back').length,1)
  } finally { f.dispose() }
})

test('switching accounts closes the prior phone binding sheet and discards its consent', async () => {
  const f = await fixture()
  try {
    f.cloud.setSession({token:'first',user:{id:'first'}})
    await f.nextTick()
    f.account.bindingPhone.value=true;f.account.bindAccepted.value=true
    f.cloud.setSession({token:'second',user:{id:'second'}})
    await f.nextTick()
    assert.equal(f.account.bindingPhone.value,false)
    assert.equal(f.account.bindAccepted.value,false)
  } finally { f.dispose() }
})


test('opening phone login directly without a previous page returns to profile after success', async () => {
  const f=await fixture()
  try {
    globalThis.getCurrentPages=()=>[{}]
    f.account.phoneLoggedIn({token:'phone-session',user:{id:'phone-user'}})
    assert.deepEqual(f.state.calls.filter(call=>call[0]==='tab'),[['tab','/pages/profile/profile']])
    assert.equal(f.state.calls.some(call=>call[0]==='back'),false)
  } finally { f.dispose() }
})
