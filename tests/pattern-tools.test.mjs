import {test} from 'node:test'
import assert from 'node:assert/strict'
import {editCell,inventoryReport,remapToInventory,encodeProject} from '../src/utils/patternTools.mjs'
const black={code:'H7',hex:'#000000',name:'黑',r:0,g:0,b:0},white={code:'H1',hex:'#FDFBFF',name:'白',r:253,g:251,b:255}
test('flood fill preserves enclosed disconnected regions and source snapshots for undo',()=>{
  const input=[[black,white,black],[black,white,white],[white,black,black]]
  const filled=editCell(input,0,0,white,'fill');assert.equal(filled[1][0],white);assert.equal(filled[0][2],black);assert.equal(input[0][0],black)
  const replaced=editCell(input,0,0,white,'replace');assert.ok(replaced.flat().every(cell=>cell===white));assert.equal(editCell(input,0,0,black),input)
  assert.equal(editCell(input,1,1,null,'erase')[1][1],null)
})
test('inventory shortages, physical dimensions and costs use stock quantity and palette cost',()=>{
  const report=inventoryReport([[black,black],[white,null]],[{code:'H7',quantity:1,unitCostCents:3}],2.6,1)
  assert.equal(report.shortage,2);assert.equal(report.totalBeads,3);assert.equal(report.costCents,7);assert.equal(report.widthCm,.52)
  const remapped=remapToInventory([[black,white,null]],[black]);assert.deepEqual(remapped,[[black,black,null]])
  assert.throws(()=>remapToInventory([[black]],[]))
})
test('project backups keep editable cells, progress and source attribution',()=>{
  const attribution={title:'Twemoji',license:'CC-BY-4.0'}
  const backup=JSON.parse(encodeProject({name:'小猫',pattern:[[black]],paletteName:'MARD',completedCodes:['H7'],completedBoards:[0],attribution}))
  assert.equal(backup.version,1);assert.equal(backup.format,'douwu-project');assert.equal(backup.work.attribution.license,'CC-BY-4.0');assert.equal(backup.work.colorUsage[0].count,1);assert.deepEqual(backup.work.completedBoards,[0])
})

test('editing resets only the affected color and board progress',async()=>{
  const {reconcileProgress}=await import('../src/utils/patternTools.mjs')
  const red={code:'F1',hex:'#ff0000'},before=Array.from({length:58},()=>Array(58).fill(black))
  before[0][30]=white;before[40][40]=red
  const after=editCell(before,0,0,white)
  assert.deepEqual(reconcileProgress(before,after,['H7','H1','F1'],[0,1,2,3]),{completedCodes:['F1'],completedBoards:[1,2,3]})
  assert.deepEqual(reconcileProgress(before,before,['H7','H1','F1'],[0,1]),{completedCodes:['H7','H1','F1'],completedBoards:[0,1]})
})
