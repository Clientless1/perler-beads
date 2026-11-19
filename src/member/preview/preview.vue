<template>
  <view class="preview3d-page"><!-- #ifdef APP-PLUS --><AppImageRuntime/><!-- #endif -->
    <view class="preview-heading"><text>成品试烫</text><text>先看看，哪种质感更喜欢</text></view>
    <view class="scene" :style="{width:width+'px',height:stage+'px'}" @touchstart.stop="start" @touchmove.stop="move" @touchend.stop="end" @touchcancel.stop="end">
      <canvas type="2d" id="beadScene" canvas-id="beadScene" :style="{width:width+'px',height:stage+'px'}"/>
      <text v-if="error" class="scene-error">{{error}}</text><view v-else-if="loading" class="scene-error">正在准备预览…</view>
      <view v-else class="scene-badge">{{finish.name}}<text>{{work?.gridSize}} × {{work?.gridSize}}</text></view>
      <view class="scene-zoom"><button aria-label="缩小成品" @tap.stop="scale=Math.max(.5,scale-.25)">−</button><text>{{Math.round(scale*100)}}%</text><button aria-label="放大成品" @tap.stop="scale=Math.min(4,scale+.25)">＋</button></view>
    </view>
    <view class="view-tools"><text>单指转动 · 双指缩放</text><button @tap="reset">复位</button><button :class="{active:spinning}" @tap="spinning=!spinning">{{spinning?'停止旋转':'自动旋转'}}</button></view>
    <view class="finish-heading"><text>选择烫法</text><text>{{finish.detail}}</text></view>
    <scroll-view scroll-x :show-scrollbar="false" class="finish-scroll"><view class="finish-options"><button v-for="item in FINISHES" :key="item.id" :class="{selected:finishId===item.id}" @tap="finishId=item.id"><view class="finish-swatch" :class="'swatch-'+item.id"><view v-for="i in 4" :key="i"/></view><text>{{item.name}}</text><text v-if="finishId===item.id" class="finish-check">✓</text></button></view></scroll-view>
    <text class="preview-note">不同烫法的视觉模拟，实物效果取决于豆子、温度与时间。</text>
    <button class="primary-btn preview-save" :disabled="loading||saving||!!error" @tap="save">{{saving?'正在保存…':'保存这个效果'}}</button>
  </view>
</template>
<script setup>
// #ifdef APP-PLUS
import AppImageRuntime from '../../components/AppImageRuntime.vue'
import {appRequest} from '../../utils/app/bridge'
// #endif
import {ref,computed,watch,nextTick,getCurrentInstance} from 'vue'
import {onReady,onUnload,onHide,onShow} from '@dcloudio/uni-app'
import {getPreviewWork} from '../../utils/studioSession'
import {FINISHES,createBeadPreview,drawBeadPreview} from '../../utils/preview3d.mjs'
import {touchPoints,distance,clamp} from '../../utils/touchGeometry.mjs'
import {getCanvasNode,captureCanvas} from '../../utils/canvas'
import {createImageCanvas} from '../../utils/imageSource'
import {assertSafePattern} from '../../utils/contentSafety'
const work=getPreviewWork(),info=uni.getSystemInfoSync(),width=Math.min(info.windowWidth,480)-36,stage=Math.max(250,Math.min(width*1.15,(info.windowHeight||760)-360)),instance=getCurrentInstance()
const yaw=ref(-.18),pitch=ref(.3),scale=ref(1),finishId=ref('beads'),spinning=ref(false),saving=ref(false),error=ref(''),loading=ref(true),finish=computed(()=>FINISHES.find(f=>f.id===finishId.value))
let canvas,ctx,renderer,alive=true,visible=true,timer,frame,gesture,approved=false,drawing=false,dirty=false
const dpr=Math.min(2,info.pixelRatio||1)
onReady(async()=>{try{if(!work)throw Error('请先打开一份图纸');await assertSafePattern(work,{isCancelled:()=>!alive});if(!alive)return;await nextTick();canvas=await getCanvasNode('#beadScene',instance);if(!canvas)throw Error('画布未就绪')
// #ifdef APP-PLUS
await canvas.flush();await appRequest('previewInit',{pattern:work.pattern,selector:'#beadScene',canvasId:canvas.__appCanvas,width,height:stage,dpr,attribution:work.attribution})
// #endif
// #ifndef APP-PLUS
canvas.width=width*dpr;canvas.height=stage*dpr;ctx=canvas.getContext('2d');renderer=createBeadPreview(work.pattern,createImageCanvas)
// #endif
approved=true;await draw();loading.value=false}catch(e){error.value=e.message;loading.value=false}})
onShow(()=>{visible=true})
onUnload(()=>{alive=false;clearTimeout(frame);clearInterval(timer);renderer?.clear()});onHide(()=>{visible=false;spinning.value=false;gesture=null})
watch([yaw,pitch,scale,finishId],schedule)
watch(spinning,value=>{clearInterval(timer);if(value&&visible)timer=setInterval(()=>{yaw.value=Math.sin(Date.now()/2300)*.6},50)})
function schedule(){dirty=true;if(!frame&&!drawing)frame=setTimeout(()=>{frame=null;draw().catch(e=>{if(alive)error.value=e.message})},24)}
async function draw(){if(!alive||!approved)return;if(drawing){dirty=true;return}drawing=true;dirty=false
 try{
 const state={width,height:stage,yaw:yaw.value,pitch:pitch.value,scale:scale.value,dpr,finish:finishId.value,attribution:work.attribution}
 // #ifdef APP-PLUS
 await appRequest('previewDraw',{canvasId:canvas.__appCanvas,state},{isCancelled:()=>!alive})
 // #endif
 // #ifndef APP-PLUS
 drawBeadPreview(ctx,renderer.texture(finishId.value),state)
 // #endif
 }finally{drawing=false;if(dirty&&alive)schedule()}
}
function reset(){yaw.value=-.18;pitch.value=.3;scale.value=1;spinning.value=false}
function start(e){if(loading.value||saving.value)return;spinning.value=false;const p=touchPoints(e);if(!p.length)return;gesture={points:p,yaw:yaw.value,pitch:pitch.value,scale:scale.value}}
function move(e){if(!gesture)return;const p=touchPoints(e);if(!p.length)return;if(p.length!==gesture.points.length){start(e);return}if(p.length>=2){scale.value=clamp(gesture.scale*distance(p)/Math.max(1,distance(gesture.points)),.5,4)}else{yaw.value=clamp(gesture.yaw+(p[0].x-gesture.points[0].x)*.006,-1.15,1.15);pitch.value=clamp(gesture.pitch+(p[0].y-gesture.points[0].y)*.006,-1.05,1.05)}}
function end(e){if(e.touches?.length)start(e);else gesture=null}
async function save(){if(!canvas||saving.value||!approved)return;saving.value=true;spinning.value=false;try{while(drawing)await new Promise(r=>setTimeout(r,16));await draw();const path=await captureCanvas(canvas,'beadScene')
// #ifdef H5
const a=document.createElement('a');a.href=path;a.download=`${work.name}-${finish.value.name}.png`;a.click()
// #endif
// #ifdef MP-WEIXIN || APP-PLUS
await new Promise((resolve,reject)=>uni.saveImageToPhotosAlbum({filePath:path,success:resolve,fail:reject}))
// #endif
uni.showToast({title:'效果已保存',icon:'success'})}catch(e){uni.showToast({title:/auth|deny/.test(e.errMsg||'')?'请在设置中允许保存到相册':'保存失败，请重试',icon:'none'})}finally{saving.value=false}}
</script>
<style scoped>
.preview3d-page{min-height:100vh;background:#F6F5F8;padding:20rpx 36rpx calc(28rpx + env(safe-area-inset-bottom));color:#272332}.preview-heading{padding:6rpx 0 26rpx}.preview-heading>text{display:block;font-size:40rpx;font-weight:700}.preview-heading>text+text{font-size:24rpx;font-weight:400;color:#7C7487;margin-top:9rpx}.scene{position:relative;margin:0 auto;border-radius:30rpx;overflow:hidden;background:#22212A;touch-action:none}.scene canvas{touch-action:none;pointer-events:none}.scene-badge{position:absolute;top:24rpx;left:24rpx;font-size:25rpx;color:#fff;pointer-events:none}.scene-badge text{display:block;color:#ABA5B7;font-size:20rpx;margin-top:7rpx}.scene-error{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#DCD4EA;font-size:26rpx}.scene-zoom{position:absolute;bottom:20rpx;right:20rpx;display:flex;align-items:center;background:#FFFFFF16;border-radius:18rpx;color:#fff}.scene-zoom button{background:transparent;color:#fff;width:75rpx;height:75rpx;font-size:32rpx;line-height:75rpx}.scene-zoom text{font-size:22rpx;min-width:66rpx;text-align:center}.view-tools{display:flex;align-items:center;gap:16rpx;margin:12rpx 0 26rpx}.view-tools>text{flex:1;color:#8E8799;font-size:21rpx}.view-tools button{background:#EBE7F1;color:#6B5B83;border-radius:14rpx;padding:18rpx 22rpx;font-size:23rpx;line-height:1.3}.view-tools button.active{background:#7460A3;color:#fff}.finish-heading{display:flex;justify-content:space-between;align-items:center;margin:22rpx 0}.finish-heading>text{font-size:29rpx;font-weight:650}.finish-heading>text+text{font-size:21rpx;color:#7D728A;font-weight:400}.finish-scroll{white-space:nowrap}.finish-options{display:inline-flex;gap:14rpx;padding:2rpx}.finish-options>button{position:relative;display:flex;align-items:center;flex-direction:column;padding:16rpx 12rpx;background:#fff;border:2rpx solid #ECE9F1;border-radius:22rpx;width:146rpx;line-height:1.4;gap:16rpx;font-size:22rpx;color:#8E879A}.finish-options>button.selected{border-color:#8973B7;background:#F0EAF9;color:#594075}.finish-check{position:absolute;right:8rpx;top:6rpx;font-size:21rpx}.finish-swatch{display:grid;grid-template-columns:repeat(2,1fr);gap:3rpx;width:70rpx;height:70rpx}.finish-swatch>view{background:#B89FD6;border-radius:50%;position:relative;box-shadow:inset -3rpx -4rpx 0 #00000015}.finish-swatch>view:after{content:'';position:absolute;inset:35%;background:#F0EAF9;border-radius:50%}.swatch-light{gap:1rpx}.swatch-light>view:after{inset:38%}.swatch-round{gap:0}.swatch-round>view{border-radius:35%}.swatch-round>view:after{inset:44%}.swatch-flat{gap:0}.swatch-flat>view{border-radius:22%;box-shadow:none}.swatch-square{gap:0}.swatch-square>view{border-radius:3%;box-shadow:none}.swatch-flat>view:after,.swatch-square>view:after{display:none}.preview-note{display:block;font-size:21rpx;color:#81758F;line-height:1.6;margin:25rpx 0}.preview-save{height:96rpx;background:#776094;color:#fff;border-radius:22rpx}
</style>
