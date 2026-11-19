import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import { normalizePhone, validMobile, maskPhone } from '../src/utils/phoneAuth.mjs'
const require = createRequire(import.meta.url)
const vueRuntime = require.resolve('vue/dist/vue.runtime.esm-bundler.js')
const root = new URL('..', import.meta.url).pathname
let sequence = 0
async function fixture(overrides = {}) {
  const state = { props: { purpose: 'login', accepted: true, available: true, ...overrides }, calls: [], events: [], stops: [], user: null }
  globalThis.__phoneTest = state
  const source = (await readFile(new URL('../src/components/PhoneCodeForm.vue', import.meta.url), 'utf8')).match(/<script setup>([\s\S]*?)<\/script>/)[1]
  const result = await build({ stdin: { contents: `const defineProps=()=>globalThis.__phoneTest.props;const defineEmits=()=>((...a)=>globalThis.__phoneTest.events.push(a));${source}\nexport {phone,code,error,sending,submitting,remaining,sentTo,sendCode,submit,confirmCode};`, resolveDir: root + '/src/components' }, bundle: true, write: false, format: 'esm', platform: 'node', plugins: [{name:'fixture',setup(api){
    api.onResolve({filter:/utils\/cloud$/},()=>({path:'cloud',namespace:'test'}))
    api.onLoad({filter:/cloud/,namespace:'test'},()=>({contents:`import {reactive} from 'vue';export const cloudSession=reactive({user:null});export const request=(path,options)=>{const s=globalThis.__phoneTest;s.calls.push({path,...options});return s.respond?s.respond(path,options):Promise.resolve({challengeId:'test-challenge',retryAfter:60,expiresIn:300})}`,resolveDir:root}))
    api.onResolve({filter:/^vue$/},()=>({path:'vue',namespace:'test'}))
    api.onLoad({filter:/vue/,namespace:'test'},()=>({contents:`import * as V from ${JSON.stringify(vueRuntime)};export const {ref,computed,reactive}=V;export const watch=(...a)=>{const stop=V.watch(...a);globalThis.__phoneTest.stops.push(stop);return stop};export const onBeforeUnmount=fn=>globalThis.__phoneTest.cleanup=fn;`,resolveDir:root}))
  }}] })
  const form = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}#${++sequence}`)
  return { state, form, dispose(){state.cleanup();state.stops.forEach(stop=>stop())} }
}

test('mobile input validates mainland numbers and masks display without changing identity',()=>{
  assert.equal(normalizePhone(' 13800138000 '),'13800138000')
  assert.equal(validMobile('13800138000'),true)
  for(const value of ['1380013800','12800138000','13800138000x','','+8613800138000'])assert.equal(validMobile(value),false)
  assert.equal(maskPhone('13800138000'),'138****8000')
})

test('SMS sending requires consent, a valid mobile and configured service',async()=>{
  const f=await fixture({accepted:false})
  try{
    f.form.phone.value='13800138000';await f.form.sendCode();assert.match(f.form.error.value,/同意/)
    f.state.props.accepted=true;f.form.phone.value='123';await f.form.sendCode();assert.match(f.form.error.value,/手机号/)
    f.form.phone.value='13800138000';f.state.props.available=false;await f.form.sendCode();assert.match(f.form.error.value,/暂未开放/)
    assert.equal(f.state.calls.length,0)
  }finally{f.dispose()}
})

test('concurrent send and resend cooldown issue just one request and never expose the code',async()=>{
  const f=await fixture();let finish
  try{
    f.form.phone.value='13800138000';f.state.respond=()=>new Promise(resolve=>{finish=resolve})
    const first=f.form.sendCode();await f.form.sendCode();assert.equal(f.state.calls.length,1)
    finish({challengeId:'one',retryAfter:60,expiresIn:300});await first
    assert.ok(f.form.remaining.value>=59);assert.equal(f.form.sentTo.value,'138****8000');assert.equal(f.form.code.value,'')
    await f.form.sendCode();assert.equal(f.state.calls.length,1)
  }finally{f.dispose()}
})

test('changing phone discards its previous challenge and late send results',async()=>{
  const f=await fixture();let finish
  try{
    f.form.phone.value='13800138000';f.state.respond=()=>new Promise(resolve=>{finish=resolve})
    const pending=f.form.sendCode();f.form.phone.value='13900139000'
    finish({challengeId:'old',retryAfter:60,expiresIn:300});await pending
    assert.equal(f.form.sentTo.value,'');f.form.code.value='123456';await f.form.submit()
    assert.match(f.form.error.value,/先获取当前手机号/);assert.equal(f.state.calls.length,1)
  }finally{f.dispose()}
})

test('verified login submits challenge once and only emits the real API result',async()=>{
  const f=await fixture();let finish
  try{
    f.form.phone.value='13800138000';await f.form.sendCode();f.form.code.value='123456'
    f.state.respond=()=>new Promise(resolve=>{finish=resolve})
    const first=f.form.submit();await f.form.submit()
    assert.deepEqual(f.state.calls[1],{path:'/auth/sms/login',method:'POST',data:{phone:'13800138000',code:'123456',challengeId:'test-challenge',acceptedPrivacy:true}})
    const session={token:'session',user:{id:'one'}};finish(session);await first
    assert.deepEqual(f.state.events.filter(e=>e[0]==='verified'),[['verified',session]])
    assert.equal(f.form.code.value,'');assert.equal(f.form.submitting.value,false)
  }finally{f.dispose()}
})

test('failed send and verification stay retryable without a false success event',async()=>{
  const f=await fixture()
  try{
    f.form.phone.value='13800138000';f.state.respond=()=>Promise.reject(new Error('短信发送失败'))
    await f.form.sendCode();assert.match(f.form.error.value,/发送失败/);assert.equal(f.form.remaining.value,0)
    f.state.respond=undefined;await f.form.sendCode();f.form.code.value='654321';f.state.respond=()=>Promise.reject(new Error('验证码错误'))
    await f.form.submit();assert.match(f.form.error.value,/验证码错误/);assert.equal(f.form.code.value,'654321')
    assert.equal(f.state.events.some(e=>e[0]==='verified'),false)
  }finally{f.dispose()}
})

test('server rate limit countdown applies to the specific phone',async()=>{
  const f=await fixture()
  try{
    f.form.phone.value='13800138000';f.state.respond=()=>Promise.reject(Object.assign(new Error('请稍后重试'),{retryAfter:120}))
    await f.form.sendCode();assert.ok(f.form.remaining.value>=119)
    f.form.phone.value='13900139000';assert.equal(f.form.remaining.value,0)
  }finally{f.dispose()}
})

test('unmount during verification cannot install a late session',async()=>{
  const f=await fixture();let finish
  try{
    f.form.phone.value='13800138000';await f.form.sendCode();f.form.code.value='123456'
    f.state.respond=()=>new Promise(resolve=>{finish=resolve});const pending=f.form.submit();f.state.cleanup()
    finish({token:'late',user:{id:'late'}});await pending;assert.equal(f.state.events.some(e=>e[0]==='verified'),false)
  }finally{f.dispose()}
})

test('binding uses a separate challenge purpose and never calls the login endpoint',async()=>{
  const f=await fixture({purpose:'bind'})
  try{
    f.form.phone.value='13800138000';await f.form.sendCode();assert.equal(f.state.calls[0].data.purpose,'bind')
    f.form.code.value='123456';await f.form.submit();assert.equal(f.state.calls[1].path,'/auth/phone')
  }finally{f.dispose()}
})


test('keyboard confirmation uses the latest six digits and preserves a leading zero',async()=>{
  const f=await fixture()
  try {
    f.form.phone.value='13800138000';await f.form.sendCode();f.form.code.value='999999'
    f.state.respond=()=>Promise.resolve({token:'session',user:{id:'one'}})
    await f.form.confirmCode({detail:{value:'004271'}})
    assert.equal(f.state.calls[1].data.code,'004271')
  } finally { f.dispose() }
})
