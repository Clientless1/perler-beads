<template><view class="thumbnail-wrap" :style="{ width: size + 'px', height: size + 'px' }"><!-- #ifdef APP-PLUS --><AppImageRuntime/><!-- #endif --><canvas v-if="approved" type="2d" :id="canvasId" :canvas-id="canvasId" class="thumbnail" :style="{ width: size + 'px', height: size + 'px' }" /><text v-else class="thumbnail-status">{{ status }}</text></view></template>
<script setup>
// #ifdef APP-PLUS
import AppImageRuntime from '../components/AppImageRuntime.vue'
// #endif
import { onMounted, onBeforeUnmount, ref, nextTick, getCurrentInstance, watch } from 'vue'
import { getCanvasNode } from '../utils/canvas'
import { drawPattern } from '../utils/canvasRenderer'
import { getPatternById } from '../utils/storage'
import { cachedCloudWork } from '../utils/cloudWorks'
import { isPatternApproved } from '../utils/contentSafety'
// Pass an ID across the mini-program component bridge, rather than thousands of cells.
const props = defineProps({ patternId: { type: String, required: true }, size: { type: Number, default: 120 }, canvasId: { type: String, required: true } })
const instance = getCurrentInstance()
const approved = ref(false), status = ref('点开查看')
let revision = 0
onBeforeUnmount(() => { revision++ })
async function render() {
  const current = ++revision
  approved.value = false; status.value = '点开查看'
  const entry = props.patternId.startsWith('pattern_') ? getPatternById(props.patternId) : cachedCloudWork(props.patternId)
  try {
    if (!isPatternApproved(entry)) return
    if (current !== revision) return
    approved.value = true
    await nextTick()
    const pattern = entry?.pattern
    const canvas = await getCanvasNode(`#${props.canvasId}`, instance)
    if (current === revision && canvas && pattern?.length) await drawPattern(canvas, pattern, pattern.length, false, props.size, { mode: 'beads' })
  } catch (error) { if (current === revision) status.value = error.safetyCode === 'blocked' ? '内容含违规信息' : '点开重试检测' }
}
onMounted(render)
watch(() => props.patternId, render)
</script>
<style scoped>.thumbnail-wrap { display: flex; align-items: center; justify-content: center; background: #f1efe9; border-radius: 16rpx; overflow: hidden; }.thumbnail { display: block; }.thumbnail-status { padding: 12rpx; text-align: center; font-size: 21rpx; color: #818181; }</style>
