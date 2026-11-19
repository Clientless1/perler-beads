<template>
  <view class="pixel-editor" :class="{fullscreen}"><!-- #ifdef APP-PLUS --><AppImageRuntime/><!-- #endif -->
    <view class="workspace-heading"><button :disabled="saving" @tap="emit('close')">取消</button><view><text>精修图纸</text><text>{{size}} × {{size}} · {{usage.length}} 色</text></view><button class="save-edit" :disabled="!changed||saving" @tap="save">{{saving?'保存中…':'保存'}}</button></view>
    <view class="editor-tools"><button v-for="item in tools" :key="item.id" :class="{active:tool===item.id}" :disabled="saving" @tap="tool=item.id"><AppIcon :name="item.icon" :size="29"/><text>{{item.name}}</text></button></view>
    <view class="editor-controls"><button :disabled="!undoStack.length||saving" @tap="undo">↶ 撤销</button><button :disabled="!redoStack.length||saving" @tap="redo">↷ 重做</button><text/><button :disabled="zoom<=1||saving" aria-label="缩小编辑画布" @tap="setZoom(zoom-.5)">−</button><button :disabled="saving" @tap="setZoom(1,true)">{{Math.round(zoom*100)}}%</button><button :disabled="zoom>=10||saving" aria-label="放大编辑画布" @tap="setZoom(zoom+.5)">＋</button></view>
    <view class="editor-stage"><TouchViewport :width="viewportWidth" :height="viewportHeight" :content-width="editorSide" :content-height="editorSide" :mode="tool==='hand'?'pan':'draw'" :max="10" :command="viewCommand" :disabled="saving" @change="zoom=$event.scale" @draw-start="drawStart" @draw-move="drawMove" @draw-end="drawEnd" @draw-cancel="drawCancel"><canvas type="2d" :id="canvasId" :canvas-id="canvasId" :style="{width:editorSide+'px',height:editorSide+'px'}"/></TouchViewport></view>
    <view class="editor-hint"><text>{{tool==='hand'?'单指移动 · 双指缩放':tool==='brush'||tool==='erase'?'单指连续涂画 · 双指缩放移动':'点选格子 · 双指缩放移动'}}</text><text>{{cursor}}</text></view>
    <view class="brush-row"><view class="brush-sizes"><text>笔触</text><button v-for="n in [1,3,5]" :key="n" :class="{chosen:brush===n}" :disabled="saving" @tap="brush=n">{{n}} 格</button></view><button class="more-tools" @tap="toolsVisible=!toolsVisible">更多 {{toolsVisible?'⌃':'⌄'}}</button></view>
    <view v-if="toolsVisible" class="extra-tools"><button @tap="transform('rotate')">旋转</button><button @tap="transform('mirror')">镜像</button><button @tap="transform('flip')">翻转</button><button @tap="clean">清理孤点</button><button :class="{selected:tool==='replace'}" @tap="tool='replace'">整图换色</button></view>
    <view class="palette-search"><view class="current-color"><view :style="{background:color?.hex||'#fff'}"/><text>{{color?.code||'选颜色'}}</text></view><input v-model.trim="query" placeholder="搜索色号"/><button @tap="allColors=!allColors">{{allColors?'图中颜色':'全部色卡'}}</button></view>
    <scroll-view scroll-x class="color-scroll"><view class="color-options"><button v-for="item in visibleColors" :key="item.code" :class="{selected:color?.code===item.code}" @tap="color=item"><view :style="{background:item.hex}"/><text>{{item.code}}</text></button></view></scroll-view>
    <text v-if="error" class="editor-error">{{error}}</text>
  </view>
</template>
<script setup>
// #ifdef APP-PLUS
import AppImageRuntime from './AppImageRuntime.vue'
import {appRequest} from '../utils/app/bridge'
// #endif
import {ref,shallowRef,computed,watch,nextTick,onMounted,onBeforeUnmount,getCurrentInstance} from 'vue'
import AppIcon from './AppIcon.vue'
import TouchViewport from './TouchViewport.vue'
import {getCanvasNode} from '../utils/canvas'
import {editCell,paintCells,transformPattern,removeIsolatedBeads,summarizePattern} from '../utils/patternTools.mjs'
import {lineCells,clamp} from '../utils/touchGeometry.mjs'
import {drawEditorGrid,drawEditorCell} from '../utils/editorRenderer.mjs'
const props=defineProps({pattern:{type:Array,required:true},palette:{type:Array,required:true},saving:Boolean,fullscreen:Boolean})
const emit=defineEmits(['save','close'])
const info=uni.getSystemInfoSync(),viewportWidth=Math.min(info.windowWidth,480)-28,viewportHeight=ref(Math.max(140,Math.min(viewportWidth+70,(info.windowHeight||740)-390)))
const editorSide=computed(()=>Math.min(viewportWidth,viewportHeight.value))
const cells=shallowRef(props.pattern),tool=ref('brush'),color=ref(props.pattern.flat().find(Boolean)||props.palette[0]),undoStack=shallowRef([]),redoStack=shallowRef([]),zoom=ref(1),query=ref(''),cursor=ref(''),error=ref(''),brush=ref(1),allColors=ref(false),viewCommand=ref(null),toolsVisible=ref(false)
const changed=computed(()=>cells.value!==props.pattern),size=computed(()=>cells.value.length),usage=computed(()=>summarizePattern(cells.value))
defineExpose({hasUnsavedChanges:changed})
const visibleColors=computed(()=>{const list=allColors.value||query.value?props.palette:usage.value;return list.filter(c=>c.code.toLowerCase().includes(query.value.toLowerCase()))})
const tools=[{id:'brush',name:'画笔',icon:'edit'},{id:'erase',name:'橡皮',icon:'trash'},{id:'pick',name:'取色',icon:'palette'},{id:'fill',name:'填色',icon:'grid'},{id:'hand',name:'移动',icon:'expand'}]
const instance=getCurrentInstance(),canvasId='pixelEditorCanvas',textureCell=24
let canvas,ctx,alive=true,stroke=null,frame,rendering=false,fullRender=true,patches=new Map(),mountRenderTimer
async function fitStage(){await nextTick();if(!alive)return;uni.createSelectorQuery().in(instance.proxy).select('.editor-stage').boundingClientRect(r=>{if(alive&&r?.height>80)viewportHeight.value=Math.floor(r.height)}).exec()}
function setZoom(value,reset=false){viewCommand.value={scale:clamp(value,1,10),reset,serial:Date.now()}}
function schedule(full=false,patch=[]){if(full){fullRender=true;patches.clear()}else for(const item of patch)patches.set(`${item.row}:${item.col}`,item);if(!frame&&!rendering)frame=setTimeout(()=>{frame=null;render()},16)}
async function render(){if(!alive)return;if(rendering){fullRender=true;return}rendering=true
 try{await nextTick();if(!canvas)canvas=await getCanvasNode('#'+canvasId,instance);if(!canvas)throw Error('画布暂未就绪，请退出后重试');const full=fullRender,patch=[...patches.values()];fullRender=false;patches.clear()
 // #ifdef APP-PLUS
 if(full){await canvas.flush();await appRequest('editorInit',{selector:'#'+canvasId,canvasId:canvas.__appCanvas,pattern:cells.value,cell:textureCell,labels:true},{isCancelled:()=>!alive})}
 else if(patch.length)await appRequest('editorPatch',{canvasId:canvas.__appCanvas,patch},{isCancelled:()=>!alive})
 // #endif
 // #ifndef APP-PLUS
 if(full)ctx=drawEditorGrid(canvas,cells.value,textureCell,true)
 else if(ctx)for(const item of patch)drawEditorCell(ctx,item.row,item.col,item.color,textureCell,true)
 // #endif
 }catch(e){if(alive)error.value=e.message}finally{rendering=false;if(alive&&(fullRender||patches.size))schedule()}
}
watch(()=>props.pattern,value=>{cells.value=value;undoStack.value=[];redoStack.value=[];schedule(true)})
watch(toolsVisible,fitStage)
onMounted(()=>{schedule(true);fitStage();mountRenderTimer=setTimeout(()=>{schedule(true);fitStage()},200)})
onBeforeUnmount(()=>{alive=false;clearTimeout(frame);clearTimeout(mountRenderTimer);stroke=null})
function location(p){const col=Math.floor(p.x/(editorSide.value/size.value)),row=Math.floor(p.y/(editorSide.value/size.value));return row>=0&&col>=0&&row<size.value&&col<size.value?{row,col}:null}
function drawStart(p){if(props.saving)return;const at=location(p);if(!at)return;stroke={before:cells.value,last:at,tool:tool.value};applyPoint(at,at)}
function drawMove(p){if(!stroke||!['brush','erase'].includes(stroke.tool))return;const at=location(p);if(!at){stroke.last=null;return}applyPoint(stroke.last||at,at);stroke.last=at}
function applyPoint(from,to){cursor.value=`${to.row+1} 行 ${to.col+1} 列`;if(tool.value==='hand')return;if(tool.value==='pick'){if(cells.value[to.row][to.col]){color.value=cells.value[to.row][to.col];tool.value='brush'}return}
 if(['brush','erase'].includes(tool.value)){const result=paintCells(cells.value,lineCells(from,to),color.value,tool.value,brush.value);cells.value=result.pattern;if(result.patch.length)schedule(false,result.patch)}else{const next=editCell(cells.value,to.row,to.col,color.value,tool.value);if(next!==cells.value){cells.value=next;schedule(true)}}
}
function drawEnd(){if(!stroke)return;const before=stroke.before;stroke=null;if(before!==cells.value){undoStack.value=[...undoStack.value.slice(-29),before];redoStack.value=[];error.value=''}}
function drawCancel(){if(!stroke)return;const before=stroke.before;stroke=null;if(cells.value!==before){cells.value=before;schedule(true)}}
function commit(next){if(props.saving||next===cells.value)return;drawEnd();undoStack.value=[...undoStack.value.slice(-29),cells.value];redoStack.value=[];cells.value=next;error.value='';schedule(true)}
function undo(){if(props.saving||!undoStack.value.length)return;drawEnd();redoStack.value=[...redoStack.value,cells.value];cells.value=undoStack.value[undoStack.value.length-1];undoStack.value=undoStack.value.slice(0,-1);schedule(true)}
function redo(){if(props.saving||!redoStack.value.length)return;drawEnd();undoStack.value=[...undoStack.value,cells.value];cells.value=redoStack.value[redoStack.value.length-1];redoStack.value=redoStack.value.slice(0,-1);schedule(true)}
function transform(operation){commit(transformPattern(cells.value,operation))}
function clean(){const next=removeIsolatedBeads(cells.value);if(!next.some(row=>row.some(Boolean))){error.value='图纸至少保留一颗豆子';return}commit(next)}
function save(){drawEnd();if(props.saving||!changed.value)return;if(!cells.value.some(row=>row.some(Boolean))){error.value='图纸至少保留一颗豆子';return}emit('save',cells.value)}
</script>
<style scoped>
.pixel-editor{background:#F6F4F8;color:#302838;padding:18rpx 28rpx}.fullscreen{position:fixed;inset:0;top:var(--window-top,0px);z-index:40;padding:16rpx 28rpx calc(18rpx + env(safe-area-inset-bottom));display:flex;flex-direction:column;overflow:hidden}.workspace-heading{display:flex;align-items:center;gap:22rpx;flex-shrink:0;margin:0 0 18rpx;min-height:82rpx}.workspace-heading>view{flex:1;text-align:center}.workspace-heading text{display:block;font-size:31rpx;font-weight:650}.workspace-heading text+text{font-size:20rpx;color:#82738D;font-weight:400;margin-top:6rpx}.workspace-heading>button{min-width:98rpx;min-height:74rpx;background:transparent;color:#72627E;font-size:27rpx;padding:18rpx 14rpx;line-height:1.4}.workspace-heading>.save-edit{border-radius:18rpx;background:#7C659A;color:#fff}.workspace-heading>.save-edit[disabled]{opacity:.4}.editor-tools{display:flex;gap:10rpx;flex-shrink:0}.editor-tools>button{flex:1;display:flex;flex-direction:column;align-items:center;gap:10rpx;padding:17rpx 0;background:#EEE9F2;color:#7B6987;border-radius:18rpx;font-size:22rpx;line-height:1.2}.editor-tools>button.active{background:#DCCFEA;color:#62477A;font-weight:600}.editor-tools .app-icon{opacity:.7}.editor-controls{display:flex;align-items:center;gap:6rpx;min-height:74rpx;margin:7rpx 0;flex-shrink:0}.editor-controls>text{flex:1}.editor-controls button{background:transparent;color:#766284;font-size:22rpx;padding:18rpx 14rpx;line-height:1.3}.editor-controls button[disabled]{opacity:.3}.editor-stage{background:#E6E1EA;border-radius:18rpx;overflow:hidden;align-self:center;flex-shrink:0;touch-action:none}.editor-hint{display:flex;justify-content:space-between;gap:10rpx;min-height:46rpx;align-items:center;color:#82718E;font-size:19rpx;flex-shrink:0}.brush-row{display:flex;justify-content:space-between;align-items:center;gap:16rpx;flex-shrink:0}.brush-sizes{display:flex;align-items:center;gap:8rpx;font-size:22rpx;color:#82708F}.brush-sizes>text{padding-right:12rpx}.brush-sizes>button,.more-tools{background:#EEE8F3;color:#79618C;border-radius:12rpx;padding:16rpx 23rpx;line-height:1.2;font-size:22rpx}.brush-sizes>button.chosen{background:#DCCFEA;color:#62477A}.extra-tools{display:flex;gap:8rpx;flex-shrink:0;flex-wrap:wrap;margin-top:12rpx}.extra-tools button{background:#E8E0EF;color:#857094;font-size:20rpx;line-height:1.3;padding:14rpx 18rpx;border-radius:10rpx}.palette-search{display:flex;align-items:center;gap:15rpx;margin:18rpx 0;flex-shrink:0}.current-color{display:flex;gap:9rpx;align-items:center;font-size:23rpx;color:#7F708B}.current-color>view{width:40rpx;height:40rpx;border:1rpx solid #00000012;border-radius:10rpx}.palette-search input{flex:1;min-width:0;background:#ECE6F1;border-radius:16rpx;font-size:22rpx;height:68rpx;padding:12rpx 18rpx}.palette-search>button{background:transparent;color:#7C638D;padding:10rpx 0;font-size:22rpx;line-height:1.3}.color-scroll{white-space:nowrap;flex-shrink:0}.color-options{display:inline-flex;gap:12rpx;padding:3rpx 2rpx 8rpx}.color-options>button{width:76rpx;padding:6rpx;border:2rpx solid transparent;border-radius:16rpx;background:transparent;line-height:1.4}.color-options>button.selected{background:#E6DCEE;border-color:#8E74A8}.color-options>button>view{height:48rpx;width:100%;border:1rpx solid #0000000D;border-radius:11rpx}.color-options>button>text{font-size:19rpx;color:#766284}.editor-error{font-size:21rpx;color:#AC6D62;margin-top:6rpx}
@media(max-height:700px){.workspace-heading{margin-bottom:10rpx;min-height:64rpx}.editor-tools>button{padding:12rpx 0;gap:6rpx}.editor-controls{min-height:60rpx}.palette-search{margin:12rpx 0}.editor-hint{min-height:35rpx}}
.fullscreen{padding-left:14px;padding-right:14px}.fullscreen .editor-stage{flex:1;min-height:120px;width:100%}.fullscreen .color-scroll{height:66px}.editor-stage{max-width:100%}.color-options>button{width:44px;min-height:58px}.color-options>button>view{height:28px}.color-options>button>text{font-size:11px}.editor-tools>button{min-height:48px}.workspace-heading>button{min-height:44px}.editor-controls button{min-height:40px}.brush-sizes>button,.more-tools{min-height:36px}.palette-search input{min-height:38px}
/* #ifdef H5 */
.fullscreen{top:44px}
/* #endif */
</style>
