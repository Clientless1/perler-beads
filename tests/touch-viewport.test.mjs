import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {resolve} from 'node:path'
import {build} from 'esbuild'
const require=createRequire(import.meta.url)
const {preprocess}=require('@dcloudio/uni-cli-shared/lib/preprocess')
const {initScopedPreContext}=require('@dcloudio/uni-cli-shared/dist/preprocess/context')
async function fixture(){
 const events=[],queries=[],source=readFileSync(new URL('../src/components/TouchViewport.vue',import.meta.url),'utf8').match(/<script setup>([\s\S]*?)<\/script>/)[1]
 globalThis.__touchFixture={events,props:{width:300,height:300,contentWidth:300,contentHeight:300,max:8,mode:'draw'}}
 globalThis.uni={createSelectorQuery:()=>{const q={in:()=>q,select:()=>q,boundingClientRect:f=>{queries.push(f);return q},exec:()=>{}};return q}}
 const result=await build({stdin:{contents:`const defineProps=()=>globalThis.__touchFixture.props,defineEmits=()=>((...e)=>globalThis.__touchFixture.events.push(e));\n${preprocess(source,initScopedPreContext('mp-weixin').preVueContext,{type:'js'})}\nexport {start,move,end,cancel,view};`,resolveDir:resolve('src/components')},bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'vue-lifecycle',setup(api){api.onResolve({filter:/^vue$/},()=>({path:'vue',namespace:'fixture'}));api.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const ref=value=>({value}),watch=()=>{},onMounted=()=>{},onBeforeUnmount=()=>{},nextTick=f=>f?.(),getCurrentInstance=()=>({uid:1,proxy:{}})'}))}}]})
 const api=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text+'\n//'+Math.random()).toString('base64')}`)
 return {...api,events,props:globalThis.__touchFixture.props,measure:()=>{const callback=queries.shift();assert.ok(callback);callback({left:20,top:150})}}
}
const touch=(...points)=>({touches:points.map(([x,y])=>({clientX:x,clientY:y}))})
test('a quick tap while native bounds are pending retains the correct cell position',async()=>{
 const f=await fixture();f.start(touch([35,175]));f.end(touch());assert.equal(f.events.length,0);f.measure()
 assert.deepEqual(f.events,[['drawStart',{x:15,y:25,scale:1}],['drawEnd']])
})
test('a second finger arriving during native measurement cancels the stroke and pinches without painting',async()=>{
 const f=await fixture();f.start(touch([100,240]));f.move(touch([110,240]));f.start(touch([110,240],[170,240]));f.move(touch([80,240],[200,240]));f.end(touch());f.measure()
 assert.deepEqual(f.events.map(e=>e[0]),['drawStart','drawMove','drawCancel','change']);assert.equal(f.view.value.scale,2)
 const before=f.events.length;f.start(touch([40,170]));f.cancel();f.measure();assert.equal(f.events.length,before,'cancelled native query must not create a late stroke')
})

test('disabling the editor while native measurement is pending does not strand later touches',async()=>{
 const f=await fixture();f.start(touch([35,175]));f.props.disabled=true;f.measure()
 assert.equal(f.events.length,0,'a delayed touch must not paint while saving')
 f.props.disabled=false;f.start(touch([55,195]));f.end(touch());f.measure()
 assert.deepEqual(f.events,[['drawStart',{x:35,y:45,scale:1}],['drawEnd']])
})
