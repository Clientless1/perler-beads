import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { build } from 'esbuild'

const require = createRequire(import.meta.url)
const { initScopedPreContext } = require('@dcloudio/uni-cli-shared/dist/preprocess/context')
const { preprocess } = require('@dcloudio/uni-cli-shared/lib/preprocess')
let sequence = 0
async function client(platform, apiOrigin = '') {
  const context = initScopedPreContext(platform).preVueContext
  const source = preprocess(await readFile(new URL('../src/utils/cloud.js', import.meta.url), 'utf8'), context, { type: 'js' })
  const output = await build({
    stdin: { contents: source, resolveDir: new URL('..', import.meta.url).pathname },
    bundle: true, write: false, format: 'esm', platform: 'node',
    define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify(apiOrigin) },
  })
  return import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}#${++sequence}`)
}

test('native App and WeChat use absolute HTTPS while H5 keeps its same-origin proxy', async () => {
  for (const [platform, expected] of [['app', 'https://1.92.110.111'], ['mp-weixin', 'https://1.92.110.111'], ['h5', '']]) {
    const cloud = await client(platform)
    const calls = []
    globalThis.uni = { request: options => { calls.push(options); options.success({ statusCode: 200, data: { data: { items: [], total: 938 } } }) } }
    assert.equal(cloud.apiUrl('/api/v1/catalog/templates'), `${expected}/api/v1/catalog/templates`)
    assert.equal(cloud.assetUrl('/assets/templates/rabbit.png'), `${expected}/assets/templates/rabbit.png`)
    assert.equal(cloud.assetUrl('https://images.example.com/a.png'), 'https://images.example.com/a.png')
    assert.equal((await cloud.request('/catalog/templates')).total, 938)
    assert.equal(calls[0].url, `${expected}/api/v1/catalog/templates`)
    assert.notEqual(calls[0].sslVerify, false, 'certificate verification must remain enabled')
  }
})

test('native API override also applies to authorized PDF downloads and opens the actual file', async () => {
  const cloud = await client('app', 'https://api.example.com/')
  const calls = []
  globalThis.uni = {
    setStorageSync() {},
    downloadFile: options => { calls.push(options); options.success({ statusCode: 200, tempFilePath: '_downloads/pattern.pdf' }) },
    openDocument: options => { calls.push(options); options.success({}) },
  }
  cloud.setSession({ token: 'fixture-token', user: { id: 'fixture-user' } })
  assert.equal(cloud.assetUrl('/assets/templates/rabbit.png'), 'https://api.example.com/assets/templates/rabbit.png')
  await cloud.saveDownload('/api/v1/exports/fixture/download', '图纸.pdf')
  assert.equal(calls[0].url, 'https://api.example.com/api/v1/exports/fixture/download')
  assert.equal(calls[0].header.Authorization, 'Bearer fixture-token')
  assert.equal(calls[1].filePath, '_downloads/pattern.pdf')
  assert.equal(calls[1].fileType, 'pdf')
  calls.length = 0
  uni.downloadFile = options => options.success({ statusCode: 503, tempFilePath: 'error' })
  await assert.rejects(cloud.saveDownload('/api/v1/exports/fixture/download', '图纸.pdf'), /下载失败/)
  assert.equal(calls.length, 0, 'failed HTTP downloads must not open an error document')
})

test('network errors preserve the native failure reason and distinguish TLS, domain rules and timeouts', async () => {
  const cloud = await client('app')
  for (const [detail, message] of [
    ['request:fail java.security.cert.CertificateException', /安全证书/],
    ['request:fail timeout', /超时/],
    ['request:fail url not in domain list', /微信域名校验/],
    ['request:fail network disconnected', /检查网络/],
  ]) {
    globalThis.uni = { request: options => options.fail({ errMsg: detail }) }
    await assert.rejects(cloud.request('/catalog/templates'), error => {
      assert.match(error.message, message)
      assert.equal(error.detail, detail)
      assert.equal(error.code, 'CLOUD_NETWORK_ERROR')
      assert.equal(error.server, 'https://1.92.110.111')
      return true
    })
  }
})

test('corrupt stored sessions cannot prevent app startup or count as a signed-in user', async () => {
  for (const stored of ['null', '[]', '42', '{"token":"old-token","user":null}', '{"token":17,"user":{"id":"fixture-user"}}']) {
    globalThis.uni = { getStorageSync: () => stored }
    const cloud = await client('app')
    assert.equal(cloud.isLoggedIn(), false)
    assert.equal(cloud.cloudSession.user, null)
  }
})

test('new sessions reset previous account entitlements and a failed storage write preserves the current session', async () => {
  globalThis.uni = { getStorageSync: () => '', setStorageSync() {} }
  const cloud = await client('h5')
  cloud.setSession({ token: 'first-token', user: { id: 'first' } })
  cloud.cloudSession.entitlements = { isPro: true, exportCredits: 50, proUntil: '2099-01-01' }
  cloud.setSession({ token: 'second-token', user: { id: 'second' } })
  assert.deepEqual({ ...cloud.cloudSession.entitlements }, { isPro: false, exportCredits: 0, proUntil: null })
  uni.setStorageSync = () => { throw new Error('storage full') }
  assert.throws(() => cloud.setSession({ token: 'third-token', user: { id: 'third' } }), /storage full/)
  assert.equal(cloud.cloudSession.user.id, 'second')
  assert.equal(cloud.cloudSession.token, 'second-token')
})

test('native project backup cannot falsely report success when no file was written', async () => {
  globalThis.uni = { getStorageSync: () => '' }
  const cloud = await client('app')
  await assert.rejects(cloud.saveTextFile('{}', 'fixture.json'), /暂不支持工程文件备份/)
})


test('phone binding updates the same user while preserving session and purchased entitlements', async () => {
  const saved=[]
  globalThis.uni={getStorageSync:()=>'',setStorageSync:(key,value)=>saved.push(value)}
  const cloud=await client('h5')
  cloud.setSession({token:'old-token',user:{id:'old-user'}})
  cloud.cloudSession.entitlements={isPro:true,exportCredits:20,proUntil:'2099-01-01'}
  cloud.updateSessionUser({id:'old-user',phoneMasked:'138****8000'})
  assert.equal(cloud.cloudSession.token,'old-token')
  assert.equal(cloud.cloudSession.user.phoneMasked,'138****8000')
  assert.equal(cloud.cloudSession.entitlements.exportCredits,20)
  assert.equal(saved.at(-1).token,'old-token')
  assert.throws(()=>cloud.updateSessionUser({id:'another-user'}),/账号已切换/)
  uni.setStorageSync=()=>{throw new Error('storage full')}
  assert.throws(()=>cloud.updateSessionUser({id:'old-user',phoneMasked:'139****9000'}),/storage full/)
  assert.equal(cloud.cloudSession.user.phoneMasked,'138****8000')
})

test('SMS rate limits expose bounded retry time without clearing an authenticated session', async () => {
  globalThis.uni={getStorageSync:()=>'',setStorageSync(){},request:options=>options.success({statusCode:429,data:{code:'SMS_RATE_LIMIT',message:'请稍后重试',details:{retryAfter:60}}})}
  const cloud=await client('h5')
  cloud.setSession({token:'current',user:{id:'current'}})
  await assert.rejects(cloud.request('/auth/sms/code'),error=>error.retryAfter===60&&error.code==='SMS_RATE_LIMIT')
  assert.equal(cloud.isLoggedIn(),true)
})
