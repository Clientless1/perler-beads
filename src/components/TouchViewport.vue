<template>
  <view class="touch-viewport" :id="viewportId" :style="{width:width+'px',height:height+'px'}" @touchstart.stop="start" @touchmove.stop="move" @touchend.stop="end" @touchcancel.stop="cancel">
    <view class="touch-content" :style="{width:contentWidth+'px',height:contentHeight+'px',transform:`translate(${view.x}px,${view.y}px) scale(${view.scale})`}"><slot/></view>
    <slot name="overlay"/>
  </view>
</template>
<script setup>
import {ref,watch,onMounted,onBeforeUnmount,getCurrentInstance,nextTick} from 'vue'
import {touchPoints,pinchView,constrainView,clamp} from '../utils/touchGeometry.mjs'
const props=defineProps({width:Number,height:Number,contentWidth:Number,contentHeight:Number,mode:{type:String,default:'pan'},max:{type:Number,default:10},command:Object,disabled:Boolean})
const emit=defineEmits(['change','drawStart','drawMove','drawEnd','drawCancel'])
const instance=getCurrentInstance(),viewportId=`touchViewport${instance.uid}`
const initial=()=>constrainView({x:0,y:0,scale:1},props.width,props.height,props.contentWidth,props.contentHeight)
const view=ref(initial())
let gesture=null,rectangle={left:0,top:0},timer,alive=true,measurement=0,pending=null
function bounded(value){return constrainView(value,props.width,props.height,props.contentWidth,props.contentHeight)}
function update(value){view.value=bounded(value);emit('change',view.value)}
function measure(done){
  // #ifdef H5
  const r=instance.proxy.$el?.getBoundingClientRect?.()
  // uni-h5 touch coordinates exclude its page header. DOM rectangles include
  // it, so use the same coordinate system before mapping to a grid cell.
  if(r){const marker=document.createElement('div');marker.style.cssText='position:fixed;top:var(--window-top,0px);width:0;height:0;pointer-events:none';document.body.appendChild(marker);const top=marker.getBoundingClientRect().top;marker.remove();rectangle={left:r.left,top:r.top-top}}
  done?.();return
  // #endif
  uni.createSelectorQuery().in(instance.proxy).select('#'+viewportId).boundingClientRect(r=>{if(!alive)return;if(r)rectangle=r;done?.()}).exec()
}
function points(event){return touchPoints(event).map(p=>({x:p.x-rectangle.left,y:p.y-rectangle.top}))}
function position(p){return {x:(p.x-view.value.x)/view.value.scale,y:(p.y-view.value.y)/view.value.scale,scale:view.value.scale}}
function start(event){
  if(props.disabled)return
  if(pending){pending.push(['start',event]);return}
  const revision=++measurement
  pending=[['start',event]]
  measure(()=>{if(!alive||revision!==measurement)return;if(props.disabled){cancel();return}const events=pending;pending=null;for(const [kind,e] of events||[]){if(kind==='start')begin(e);else if(kind==='move')move(e);else end(e)}})
}
function begin(event){
  const p=points(event);if(!p.length)return
  if(p.length>=2){if(gesture?.drawing)emit('drawCancel');gesture={pinch:true,points:p.slice(0,2),view:{...view.value}};return}
  if(gesture?.pinch)return
  gesture={points:p,view:{...view.value},drawing:props.mode==='draw'}
  if(gesture.drawing)emit('drawStart',position(p[0]))
}
function move(event){
  if(pending){pending.push(['move',event]);return}
  if(!gesture||props.disabled)return
  const p=points(event)
  if(p.length>=2){
    if(gesture.pinch&&!gesture.points){gesture={pinch:true,points:p.slice(0,2),view:{...view.value}};return}
    if(!gesture.pinch){if(gesture.drawing)emit('drawCancel');gesture={pinch:true,points:p.slice(0,2),view:{...view.value}};return}
    update(pinchView(gesture.view,gesture.points,p.slice(0,2),1,props.max));return
  }
  if(!p.length||gesture.pinch)return
  if(gesture.drawing)emit('drawMove',position(p[0]))
  else update({...gesture.view,x:gesture.view.x+p[0].x-gesture.points[0].x,y:gesture.view.y+p[0].y-gesture.points[0].y})
}
function end(event){if(pending){pending.push(['end',event]);return}if(!gesture)return;if(gesture.drawing)emit('drawEnd');if(event.touches?.length){gesture={pinch:true};return}gesture=null}
function cancel(){measurement++;pending=null;if(gesture?.drawing)emit('drawCancel');gesture=null}
function command(value){if(!value)return;cancel();if(value.reset){update(initial());return}const scale=clamp(value.scale,1,props.max),ratio=scale/view.value.scale;update({scale,x:props.width/2-(props.width/2-view.value.x)*ratio,y:props.height/2-(props.height/2-view.value.y)*ratio})}
watch(()=>props.command,command)
watch(()=>props.disabled,value=>{if(value)cancel()})
watch(()=>[props.width,props.height,props.contentWidth,props.contentHeight],()=>{update(initial());nextTick(measure)})
onMounted(()=>{measure();timer=setTimeout(()=>{if(alive)measure()},200);emit('change',view.value)})
onBeforeUnmount(()=>{alive=false;clearTimeout(timer);cancel()})
</script>
<style scoped>
.touch-viewport{position:relative;overflow:hidden;touch-action:none;flex-shrink:0;user-select:none;-webkit-user-select:none}.touch-content{position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform;pointer-events:none}.touch-content :deep(canvas){pointer-events:none}
</style>
