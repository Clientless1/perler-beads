<template>
 <view class="photo-cropper">
  <view class="crop-header"><button @tap="emit('cancel')">取消</button><text>裁剪照片</text><button class="crop-done" :disabled="!ready" @tap="apply">完成</button></view>
  <view :id="stageId" class="crop-space" :style="{width:width+'px',height:height+'px'}" @touchstart.stop="start" @touchmove.stop="move" @touchend.stop="end" @touchcancel.stop="end">
   <image :src="src" mode="scaleToFill" :style="imageStyle"/>
   <view v-if="ready" class="crop-frame" :style="frameStyle"><view class="crop-thirds horizontal"/><view class="crop-thirds vertical"/><view v-for="corner in ['nw','ne','sw','se']" :key="corner" class="crop-handle" :class="corner" :data-handle="corner" @touchstart.stop="start($event,corner)" @touchmove.stop="move" @touchend.stop="end"/></view>
   <text v-if="error" class="crop-error">{{error}}</text>
  </view>
  <text class="crop-hint">拖动照片调整位置 · 拖四角裁剪 · 双指调整范围</text>
  <view class="crop-presets"><button v-for="item in ratios" :key="item.label" :class="{selected:ratio===item.value}" @tap="setRatio(item.value)">{{item.label}}</button></view>
  <button class="crop-reset" @tap="reset">重置裁剪</button>
 </view>
</template>
<script setup>
import {ref,computed,onMounted,onBeforeUnmount,getCurrentInstance,nextTick} from 'vue'
import {fitImage,normalizeCrop,resizeCrop,pinchCrop} from '../utils/cropGeometry.mjs'
import {touchPoints,clamp} from '../utils/touchGeometry.mjs'
const props=defineProps({src:String,composition:Object}),emit=defineEmits(['cancel','apply']),info=uni.getSystemInfoSync(),width=Math.min(info.windowWidth,480)-32,height=Math.max(250,Math.min(width*1.35,(info.windowHeight||760)-260))
const ready=ref(false),error=ref(''),image=ref({x:0,y:0,width,height}),frame=ref({x:0,y:0,width,height}),ratio=ref(0)
const ratios=[{label:'自由',value:0},{label:'原图',value:-1},{label:'1:1',value:1},{label:'3:4',value:.75},{label:'4:3',value:4/3},{label:'9:16',value:9/16}]
const imageStyle=computed(()=>({left:image.value.x+'px',top:image.value.y+'px',width:image.value.width+'px',height:image.value.height+'px'})),frameStyle=computed(()=>({left:frame.value.x+'px',top:frame.value.y+'px',width:frame.value.width+'px',height:frame.value.height+'px'}))
const instance=getCurrentInstance(),stageId=`photoCropStage${instance.uid}`
let gesture=null,originalImage,rectangle={left:0,top:0},alive=true
function measure(done){
 // #ifdef H5
 const r=instance.proxy.$el?.querySelector?.('.crop-space')?.getBoundingClientRect?.()
 if(r){const marker=document.createElement('div');marker.style.cssText='position:fixed;top:var(--window-top,0px);width:0;height:0;pointer-events:none';document.body.appendChild(marker);const top=marker.getBoundingClientRect().top;marker.remove();rectangle={left:r.left,top:r.top-top}}
 done();return
 // #endif
 uni.createSelectorQuery().in(instance.proxy).select('#'+stageId).boundingClientRect(r=>{if(!alive)return;if(r)rectangle=r;done()}).exec()
}
function points(event){return touchPoints(event).map(p=>({x:p.x-rectangle.left,y:p.y-rectangle.top}))}
onBeforeUnmount(()=>{alive=false;gesture=null})
onMounted(()=>uni.getImageInfo({src:props.src,success:result=>{if(!alive)return;image.value=fitImage(result.width,result.height,width,height);originalImage={...image.value};const c=normalizeCrop(props.composition?.crop);frame.value=c?{x:image.value.x+c.x*image.value.width,y:image.value.y+c.y*image.value.height,width:c.width*image.value.width,height:c.height*image.value.height}:{...image.value};nextTick(()=>{if(alive)measure(()=>{if(alive)ready.value=true})})},fail:()=>{if(alive)error.value='照片打开失败，请返回重试'}}))
function reset(){if(!ready.value)return;ratio.value=0;image.value={...originalImage};frame.value={...image.value}}
function setRatio(value){if(!ready.value)return;image.value={...originalImage};ratio.value=value;const r=value===-1?image.value.width/image.value.height:value;if(!r){frame.value={...image.value};return}let w=image.value.width,h=w/r;if(h>image.value.height){h=image.value.height;w=h*r}frame.value={x:image.value.x+(image.value.width-w)/2,y:image.value.y+(image.value.height-h)/2,width:w,height:h}}
function start(event,handle='photo'){if(!ready.value)return;const p=points(event);if(!p.length)return;gesture={points:p,frame:{...frame.value},image:{...image.value},handle}}
function move(event){if(!gesture)return;const p=points(event);if(!p.length)return;if(p.length!==gesture.points.length){start(event,gesture.handle);return}const b=gesture.image,r=gesture.frame
 if(p.length>=2){image.value=pinchCrop(b,r,gesture.points,p,originalImage.width*8);return}
 const dx=p[0].x-gesture.points[0].x,dy=p[0].y-gesture.points[0].y
 if(gesture.handle==='photo'){image.value={...b,x:clamp(b.x+dx,r.x+r.width-b.width,r.x),y:clamp(b.y+dy,r.y+r.height-b.height,r.y)};return}
 const x=Math.max(0,b.x),y=Math.max(0,b.y),bounds={x,y,width:Math.min(width,b.x+b.width)-x,height:Math.min(height,b.y+b.height)-y}
 frame.value=resizeCrop(r,gesture.handle,dx,dy,bounds,ratio.value===-1?originalImage.width/originalImage.height:ratio.value)
}
function end(event){if(event.touches?.length)start(event);else gesture=null}
function apply(){const b=image.value,r=frame.value;emit('apply',{...props.composition,ratio:0,crop:normalizeCrop({x:(r.x-b.x)/b.width,y:(r.y-b.y)/b.height,width:r.width/b.width,height:r.height/b.height})})}
</script>
<style scoped>
.photo-cropper{position:fixed;inset:0;top:var(--window-top,0px);z-index:70;background:#18171D;color:#fff;padding:12rpx 32rpx calc(26rpx + env(safe-area-inset-bottom));display:flex;flex-direction:column;align-items:center;overflow:hidden}.crop-header{display:flex;align-items:center;width:100%;min-height:100rpx;margin-bottom:24rpx}.crop-header text{flex:1;text-align:center;font-size:30rpx;font-weight:600}.crop-header button{background:transparent;color:#B7AFBF;padding:24rpx 8rpx;min-width:100rpx;font-size:28rpx;line-height:1.4}.crop-header .crop-done{color:#D6B7F5}.crop-space{position:relative;overflow:hidden;touch-action:none;flex-shrink:0;background:#121116}.crop-space>image{position:absolute;pointer-events:none}.crop-frame{position:absolute;border:1.5px solid #fff;box-shadow:0 0 0 1000px #0009;pointer-events:none;box-sizing:border-box}.crop-thirds{position:absolute;pointer-events:none}.horizontal{left:0;right:0;top:33.333%;height:33.333%;border-top:1px solid #FFFFFF75;border-bottom:1px solid #FFFFFF75}.vertical{top:0;bottom:0;left:33.333%;width:33.333%;border-left:1px solid #FFFFFF75;border-right:1px solid #FFFFFF75}.crop-handle{position:absolute;width:44px;height:44px;pointer-events:auto;touch-action:none}.crop-handle:after{content:'';position:absolute;width:20px;height:20px;border-color:#fff;border-style:solid}.nw{left:0;top:0}.ne{right:0;top:0}.sw{left:0;bottom:0}.se{right:0;bottom:0}.nw:after{left:-1px;top:-1px;border-width:3px 0 0 3px}.ne:after{right:-1px;top:-1px;border-width:3px 3px 0 0}.sw:after{left:-1px;bottom:-1px;border-width:0 0 3px 3px}.se:after{right:-1px;bottom:-1px;border-width:0 3px 3px 0}.crop-hint{display:block;color:#9C93A6;font-size:22rpx;text-align:center;margin:30rpx 0}.crop-presets{display:flex;justify-content:center;gap:10rpx;flex-wrap:wrap;width:100%}.crop-presets>button{background:#2B2732;border:1rpx solid #3B3445;color:#B5A7C4;border-radius:15rpx;padding:23rpx 22rpx;font-size:24rpx;line-height:1.2;min-height:70rpx}.crop-presets>button.selected{background:#D4B7EB;color:#40304F;border-color:#D4B7EB}.crop-reset{background:transparent;color:#9D8BAE;font-size:25rpx;padding:28rpx;line-height:1.4;margin-top:18rpx}.crop-error{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#C3B7CE;font-size:25rpx}
</style>
