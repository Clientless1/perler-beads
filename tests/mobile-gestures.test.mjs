import {test} from 'node:test'
import assert from 'node:assert/strict'
import {pinchView,constrainView,lineCells} from '../src/utils/touchGeometry.mjs'
import {normalizeCrop,resizeCrop,fitImage,pinchCrop} from '../src/utils/cropGeometry.mjs'
import {paintCells} from '../src/utils/patternTools.mjs'
import {FINISHES,createBeadPreview,drawBeadPreview} from '../src/utils/preview3d.mjs'
test('two-finger zoom anchors the touched point and can return to the complete chart without feedback',()=>{
 const from=[{x:100,y:120},{x:200,y:120}],to=[{x:50,y:140},{x:250,y:140}],v=pinchView({x:0,y:0,scale:1},from,to)
 assert.equal(v.scale,2);assert.equal((150-v.x)/v.scale,150);assert.equal((140-v.y)/v.scale,120)
 const reset=constrainView(pinchView(v,to,from),300,300)
 assert.deepEqual(reset,{scale:1,x:0,y:0})
 const capped=constrainView(pinchView({scale:1,x:0,y:0},from,[{x:-1000,y:0},{x:3000,y:0}],1,8),300,300)
 assert.equal(capped.scale,8);assert.ok(capped.x<=0&&capped.x>=-2100)
})
test('brush joins fast touch samples without holes and does not modify undo snapshots',()=>{
 const a={code:'A1'},p=Array.from({length:12},()=>Array(12).fill(null)),points=lineCells({row:0,col:0},{row:11,col:11}),result=paintCells(p,points,a)
 assert.equal(result.patch.length,12);assert.ok(result.pattern.every((row,i)=>row[i]===a));assert.ok(p.every(row=>row.every(c=>c===null)))
 assert.equal(paintCells(result.pattern,points,a).pattern,result.pattern)
 const wide=paintCells(p,[{row:0,col:0}],a,'brush',3);assert.equal(wide.patch.length,4)
 assert.ok(p.every(row=>row.every(c=>c===null)))
})
test('album crop handles stay inside the image, preserve locked ratios, and sanitize saved regions',()=>{
 const bounds=fitImage(800,1200,300,400)
 const initial={...bounds},free=resizeCrop(initial,'se',-70,-50,bounds)
 assert.ok(free.width<initial.width&&free.height<initial.height)
 const square=resizeCrop(free,'nw',-400,-400,bounds,1)
 assert.equal(square.width,square.height);assert.ok(square.x>=bounds.x&&square.y>=bounds.y)
 const moved=resizeCrop(free,'move',400,-400,bounds)
 assert.ok(moved.x+moved.width<=bounds.x+bounds.width+.001);assert.ok(moved.y>=bounds.y)
 assert.deepEqual(normalizeCrop({x:-1,y:.2,width:2,height:2}),{x:0,y:.2,width:1,height:.8})
 assert.equal(normalizeCrop({x:NaN}),null)
})
test('finish preview builds once per material and gesture frames draw only cached surfaces',()=>{
 const calls=[],context=new Proxy({createLinearGradient:()=>({addColorStop(){}})},{get:(o,key)=>o[key]||((...args)=>calls.push([key,...args]))}),factory=(w,h)=>({width:w,height:h,getContext:()=>context})
 const p=Array.from({length:87},()=>Array(87).fill({hex:'#ffffff'})),renderer=createBeadPreview(p,factory)
 assert.equal(FINISHES.length,5);assert.equal(new Set(FINISHES.map(f=>[f.radius,f.hole,f.round].join())).size,5)
 const tex=renderer.texture('beads'),built=calls.length
 assert.equal(renderer.texture('beads'),tex);assert.equal(calls.length,built)
 for(let i=0;i<30;i++)drawBeadPreview(context,tex,{width:360,height:400,yaw:i*.01})
 assert.ok(calls.length-built<500,'gesture frames must not redraw thousands of beads')
 assert.ok(FINISHES.every(f=>renderer.texture(f.id).node.width<=1300))
})

test('crop zoom follows the finger midpoint, allows two-finger panning and never reveals empty edges',()=>{
 const image={x:-100,y:-100,width:600,height:600},frame={x:0,y:0,width:300,height:300},from=[{x:60,y:100},{x:140,y:100}]
 const zoom=pinchCrop(image,frame,from,[{x:50,y:120},{x:210,y:120}],2400)
 assert.equal(zoom.width,1200)
 assert.equal((130-zoom.x)/zoom.width,(100-image.x)/image.width)
 assert.equal((120-zoom.y)/zoom.height,(100-image.y)/image.height)
 const pan=pinchCrop(image,frame,from,[{x:80,y:130},{x:160,y:130}],2400)
 assert.deepEqual(pan,{...image,x:-80,y:-70})
 const edge=pinchCrop(image,frame,from,[{x:1000,y:1000},{x:1001,y:1000}],2400)
 assert.deepEqual(edge,{x:0,y:0,width:300,height:300})
})
