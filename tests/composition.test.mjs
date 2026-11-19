import {test} from 'node:test'
import assert from 'node:assert/strict'
import {cropRectangle,normalizeComposition} from '../src/utils/composition.mjs'
import {transformPattern,removeIsolatedBeads} from '../src/utils/patternTools.mjs'
import {projectBeads} from '../src/utils/preview3d.mjs'
test('cropping preserves the desired ratio and clamps the chosen subject position',()=>{
 assert.deepEqual(cropRectangle(400,200,1,1,.5),{x:200,y:0,width:200,height:200})
 assert.deepEqual(cropRectangle(200,400,1,.5,-1),{x:0,y:0,width:200,height:200})
 assert.equal(normalizeComposition({rotation:-1,ratio:8}).rotation,3)
 assert.equal(normalizeComposition({ratio:8}).ratio,0)
 assert.equal(normalizeComposition({focusX:0,focusY:1}).focusX,0)
})
test('rotations and mirrors are reversible and never mutate an editable snapshot',()=>{
 const p=[[1,2],[3,4]],once=transformPattern(p,'rotate')
 assert.deepEqual(once,[[3,1],[4,2]])
 let n=p;for(let i=0;i<4;i++)n=transformPattern(n,'rotate');assert.deepEqual(n,p)
 assert.deepEqual(transformPattern(transformPattern(p,'mirror'),'mirror'),p)
 assert.deepEqual(p,[[1,2],[3,4]])
})
test('isolated-bead cleanup keeps connected small facial details',()=>{
 const a={code:'A1'},b={code:'H7'},p=[[a,b,null,null],[null,null,null,null],[null,null,null,a],[null,null,null,null]]
 const clean=removeIsolatedBeads(p);assert.equal(clean[0][1],b);assert.equal(clean[2][3],null);assert.equal(p[2][3],a)
})
test('3D bead projection keeps every occupied cell and provides finite depth ordering',()=>{
 const p=[[{code:'A1'},null],[{code:'H7'},{code:'A1'}]]
 for(const yaw of [0,1,Math.PI]){const points=projectBeads(p,{yaw,pitch:.8});assert.equal(points.length,3);assert.ok(points.every(p=>Number.isFinite(p.x+p.y+p.depth)));assert.ok(points.every((p,i)=>!i||p.depth>=points[i-1].depth))}
})
