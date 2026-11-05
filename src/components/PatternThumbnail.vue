<template><canvas type="2d" :id="canvasId" :canvas-id="canvasId" class="thumbnail" :style="{ width: size + 'px', height: size + 'px' }" /></template>
<script setup>
import { onMounted, nextTick, getCurrentInstance, watch } from 'vue'
import { getCanvasNode } from '../utils/canvas'
import { drawPattern } from '../utils/canvasRenderer'
import { getPatternById } from '../utils/storage'
// Pass an ID across the mini-program component bridge, rather than thousands of cells.
const props = defineProps({ patternId: { type: String, required: true }, size: { type: Number, default: 120 }, canvasId: { type: String, required: true } })
const instance = getCurrentInstance()
async function render() {
  await nextTick()
  const pattern = getPatternById(props.patternId)?.pattern
  const canvas = await getCanvasNode(`#${props.canvasId}`, instance)
  if (canvas && pattern?.length) drawPattern(canvas, pattern, pattern.length, false, props.size, { mode: 'beads' })
}
onMounted(render)
watch(() => props.patternId, render)
</script>
<style scoped>.thumbnail { display: block; border-radius: 16rpx; overflow: hidden; }</style>
