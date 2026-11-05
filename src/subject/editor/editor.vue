<template>
  <view class="subject-page">
    <view class="subject-heading"><text>只拼你想留下的</text><text>背景留空，主体更清楚</text></view>
    <view class="subject-workspace" :style="{ width: (stageSize + 14) + 'px', maxWidth: '100%', margin: '0 auto' }">
      <view class="subject-stage" :style="{ height: stageSize + 'px' }">
        <canvas type="2d" id="subjectCanvas" canvas-id="subjectCanvas" :style="{ width: stageSize + 'px', height: stageSize + 'px' }" @touchstart.stop.prevent="startStroke" @touchmove.stop.prevent="moveStroke" @touchend.stop.prevent="endStroke" @touchcancel.stop.prevent="cancelStroke" />
        <view v-if="busy || loading" class="stage-loading"><view class="spinner" /><text>{{ status || '正在打开图片…' }}</text></view>
        <text v-else-if="!hasMask && !points.length" class="stage-hint">自动识别人物、宠物和物品</text>
      </view>
      <view class="view-options"><text>{{ hasMask ? '灰格区域不会生成豆子' : '照片仅在当前设备处理' }}</text><button :disabled="!hasMask || busy" @touchstart.stop.prevent="comparing = true; render()" @touchend.stop.prevent="comparing = false; render()" @touchcancel.stop.prevent="comparing = false; render()">按住看原图</button></view>
    </view>
    <view class="extract-actions"><button class="auto-extract" :disabled="busy || loading" @tap="autoExtract"><AppIcon name="image" :size="32" light /><text>{{ busy ? '正在提取…' : hasMask ? '重新识别' : '自动提取主体' }}</text></button><button class="outline-action" :class="{ active: tool === 'outline' }" :disabled="busy || loading" @tap="tool = 'outline'">手动圈选</button></view>
    <view class="correction-bar"><button :class="{ active: tool === 'erase' }" :disabled="!hasMask || busy" @tap="tool = 'erase'">擦除</button><button :class="{ active: tool === 'restore' }" :disabled="!hasMask || busy" @tap="tool = 'restore'">补回</button><button :disabled="!undoStack.length || busy" @tap="undo">撤销</button><view class="brush-options"><button v-for="size in [6, 14, 26]" :key="size" :aria-label="`${size} 像素画笔`" :class="{ chosen: brush === size }" @tap="brush = size"><view :style="{ width: (size + 5) + 'px', height: (size + 5) + 'px' }" /></button></view></view>
    <text class="tool-hint">{{ tool === 'outline' ? '沿要保留的主体画一圈，松手闭合选区' : tool === 'erase' ? '涂掉多余背景，画笔可选大小' : '涂回被误删的部分，画笔可选大小' }}</text>
    <view v-if="error" class="subject-error"><text>{{ error }}</text><view v-if="diagnostic" class="error-detail"><button @tap="showDiagnostic = !showDiagnostic">{{ showDiagnostic ? '收起详情' : '查看原因' }}</button><text v-if="showDiagnostic" selectable>{{ diagnostic }}</text></view></view>
    <view class="subject-bottom"><view class="center-option"><text>主体自动居中</text><switch :checked="autoFit" color="#285c49" style="transform:scale(.75);transform-origin:right center" @change="autoFit = $event.detail.value" /></view><button class="primary-btn" :disabled="!hasMask || busy || loading || saving" @tap="apply">{{ saving ? '正在应用…' : '使用这个主体' }}<AppIcon name="arrow-right" :size="30" light /></button></view>
  </view>
</template>

<script setup>
import { ref, shallowRef, nextTick, getCurrentInstance } from 'vue'
import { onReady, onUnload } from '@dcloudio/uni-app'
import AppIcon from '../../components/AppIcon.vue'
import { getCanvasNode } from '../../utils/canvas'
import { createImageCanvas, loadCanvasImage } from '../../utils/imageSource'
import { MASK_SIZE, applySubjectMask, polygonMask, paintMask, validateSubject } from '../../utils/subjectMask'
import { getSubjectEdit, finishSubjectEdit } from '../../utils/subjectSession'
import { createSubjectExtractor } from '../inference'

const instance = getCurrentInstance(), request = getSubjectEdit(), extractor = createSubjectExtractor()
const device = uni.getSystemInfoSync()
const stageSize = Math.floor(Math.min(Math.min(device.windowWidth, 480) - 48, Math.max(180, device.windowHeight - 330)))
const busy = ref(false), loading = ref(true), saving = ref(false), status = ref(''), error = ref('')
const diagnostic = ref(''), showDiagnostic = ref(false)
const hasMask = ref(false), comparing = ref(false), tool = ref('outline'), brush = ref(14), autoFit = ref(request?.selection?.autoFit !== false)
const undoStack = shallowRef([]), points = shallowRef([])
let mask = request?.selection ? new Uint8Array(request.selection.mask) : null
let canvas, context, source, cutout, originalData, rectangle, lastPoint, strokeBefore, alive = true, drawing = false
let imageRect = { x: 0, y: 0, width: stageSize, height: stageSize }, framePending = false

onReady(async () => {
  if (!request?.imagePath) { loading.value = false; error.value = '请先回到创作台选择图片'; return }
  try {
    await nextTick()
    canvas = await getCanvasNode('#subjectCanvas', instance)
    if (!alive) return
    if (!canvas) throw new Error('画布未准备好，请返回重试')
    canvas.width = canvas.height = stageSize * Math.min(2, uni.getSystemInfoSync().pixelRatio || 1)
    context = canvas.getContext('2d'); context.scale(canvas.width / stageSize, canvas.height / stageSize)
    const image = await loadCanvasImage(canvas, request.imagePath)
    if (!alive) return
    const ratio = Math.min(stageSize / image.width, stageSize / image.height)
    imageRect = { x: (stageSize - image.width * ratio) / 2, y: (stageSize - image.height * ratio) / 2, width: image.width * ratio, height: image.height * ratio }
    source = createImageCanvas(Math.max(1, Math.round(imageRect.width * 2)), Math.max(1, Math.round(imageRect.height * 2)))
    source.getContext('2d').drawImage(image, 0, 0, source.width, source.height)
    originalData = source.getContext('2d').getImageData(0, 0, source.width, source.height)
    cutout = createImageCanvas(source.width, source.height)
    hasMask.value = !!mask
    if (mask) { tool.value = 'erase'; updateCutout() }
    render()
  } catch (err) { if (alive) error.value = err.message || '图片打开失败，请返回重试' }
  finally {
    if (alive) {
      loading.value = false
      if (source && !mask && !error.value) autoExtract()
    }
  }
})
onUnload(() => { alive = false; extractor.dispose(); canvas = context = source = cutout = originalData = mask = null; undoStack.value = [] })

function updateCutout() {
  const ctx = cutout.getContext('2d'), data = ctx.createImageData(source.width, source.height)
  data.data.set(originalData.data)
  applySubjectMask(data.data, source.width, source.height, mask)
  ctx.putImageData(data, 0, 0)
}
function render() {
  if (!context || !source || !alive) return
  context.clearRect(0, 0, stageSize, stageSize)
  context.fillStyle = '#f0f1ec'; context.fillRect(0, 0, stageSize, stageSize)
  for (let y = 0; y < stageSize; y += 12) for (let x = 0; x < stageSize; x += 12) if ((x / 12 + y / 12) % 2 === 0) { context.fillStyle = '#e1e5dc'; context.fillRect(x, y, 12, 12) }
  context.drawImage(hasMask.value && !comparing.value ? cutout : source, imageRect.x, imageRect.y, imageRect.width, imageRect.height)
  if (points.value.length) {
    context.beginPath()
    points.value.forEach((p, i) => { const x = imageRect.x + p.x * imageRect.width, y = imageRect.y + p.y * imageRect.height; i ? context.lineTo(x, y) : context.moveTo(x, y) })
    context.lineWidth = 2; context.strokeStyle = '#e8aa41'; context.stroke()
  }
}
function renderMaskSoon() {
  if (framePending) return
  framePending = true
  setTimeout(() => { framePending = false; if (alive && mask) { updateCutout(); render() } }, 16)
}
async function autoExtract() {
  if (busy.value || loading.value || !source) return
  busy.value = true; error.value = ''; diagnostic.value = ''; showDiagnostic.value = false; drawing = false; points.value = []
  try {
    const extracted = await extractor.extract(request.imagePath, value => { if (alive) status.value = value })
    if (!alive) return
    remember(mask); mask = extracted; hasMask.value = true; tool.value = 'erase'
    updateCutout(); render()
  } catch (err) { if (alive) { error.value = err.message || '提取失败，请重试或手动圈选'; diagnostic.value = err.diagnostic || '' } }
  finally { if (alive) { busy.value = false; status.value = '' } }
}
function remember(value) { undoStack.value = [...undoStack.value.slice(-7), value ? new Uint8Array(value) : null] }
function undo() {
  if (!undoStack.value.length || busy.value) return
  mask = undoStack.value[undoStack.value.length - 1]
  undoStack.value = undoStack.value.slice(0, -1); hasMask.value = !!mask; points.value = []; error.value = ''
  if (mask) updateCutout()
  render()
}
function eventPoint(event) {
  const touch = event.touches?.[0] || event.changedTouches?.[0]
  if (!touch) return null
  // H5 uses viewport coordinates; WeChat canvas touches provide local x/y.
  let x = touch.x, y = touch.y
  if (x === undefined || y === undefined) { x = touch.clientX - rectangle.left; y = touch.clientY - rectangle.top }
  return { x: Math.max(0, Math.min(1, (x - imageRect.x) / imageRect.width)), y: Math.max(0, Math.min(1, (y - imageRect.y) / imageRect.height)) }
}
async function startStroke(event) {
  if (busy.value || loading.value || !source || (tool.value !== 'outline' && !hasMask.value)) return
  // #ifdef H5
  rectangle = canvas.getBoundingClientRect()
  // #endif
  // #ifndef H5
  rectangle = { left: 0, top: 0 }
  // #endif
  const point = eventPoint(event)
  if (!point) return
  error.value = ''; comparing.value = false; drawing = true; lastPoint = point
  strokeBefore = mask ? new Uint8Array(mask) : null
  if (tool.value === 'outline') { points.value = [point]; render() }
  else { paint(point, point); renderMaskSoon() }
}
function paint(from, to) { paintMask(mask, from, to, brush.value / imageRect.width, brush.value / imageRect.height, tool.value === 'restore' ? 255 : 0) }
function moveStroke(event) {
  if (!drawing) return
  const point = eventPoint(event)
  if (!point) return
  if (tool.value === 'outline') { points.value = [...points.value, point]; render() }
  else { paint(lastPoint, point); renderMaskSoon() }
  lastPoint = point
}
function endStroke(event) {
  if (!drawing) return
  moveStroke(event); drawing = false
  if (tool.value === 'outline') {
    const next = polygonMask(points.value)
    points.value = []
    try { validateSubject(next); remember(strokeBefore); mask = next; hasMask.value = true; tool.value = 'erase'; updateCutout() }
    catch (err) { error.value = err.message }
  } else {
    try { validateSubject(mask); remember(strokeBefore); updateCutout() }
    catch { mask = strokeBefore; updateCutout(); error.value = '主体已被全部擦掉，已恢复这一步' }
  }
  strokeBefore = null; render()
}
function cancelStroke() {
  if (!drawing) return
  drawing = false; mask = strokeBefore; strokeBefore = null; points.value = []; hasMask.value = !!mask
  if (mask) updateCutout()
  render()
}
function apply() {
  if (!mask || busy.value || saving.value) return
  try {
    validateSubject(mask); saving.value = true
    if (!finishSubjectEdit(request.id, { mask: new Uint8Array(mask), size: MASK_SIZE, autoFit: autoFit.value })) throw new Error('原图已更换，请返回重新提取')
    uni.navigateBack({ fail: () => { saving.value = false; error.value = '返回失败，请重试' } })
  } catch (err) { saving.value = false; error.value = err.message }
}
</script>

<style scoped>
.subject-page { min-height: 100vh; padding: 24rpx 32rpx calc(220rpx + env(safe-area-inset-bottom)); }
.subject-heading { padding: 8rpx 0 24rpx; }.subject-heading text { display: block; font-size: 36rpx; font-weight: 650; }.subject-heading text + text { font-size: 23rpx; color: #88917f; margin-top: 10rpx; font-weight: 400; }
.subject-workspace { background: #fff; padding: 12rpx; border: 1rpx solid #e3e8df; border-radius: 24rpx; }
.subject-stage { position: relative; overflow: hidden; border-radius: 16rpx; display: flex; justify-content: center; align-items: center; touch-action: none; }
.subject-stage canvas { touch-action: none; flex-shrink: 0; }.stage-loading { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 24rpx; background: #f5f6efcc; font-size: 26rpx; }
.spinner { width: 44rpx; height: 44rpx; border: 4rpx solid #d2ddc8; border-top-color: #285c49; border-radius: 50%; animation: spin .8s linear infinite; }@keyframes spin { to { transform: rotate(360deg); } }
.stage-hint { position: absolute; bottom: 22rpx; background: #ffffffdf; border-radius: 12rpx; padding: 12rpx 18rpx; font-size: 21rpx; color: #66785f; pointer-events: none; }
.view-options { display: flex; align-items: center; justify-content: space-between; padding: 18rpx 10rpx 8rpx; font-size: 20rpx; color: #929b87; }.view-options button { background: transparent; padding: 10rpx; font-size: 21rpx; color: #285c49; line-height: 1.4; touch-action: none; }
.extract-actions { display: flex; gap: 16rpx; margin-top: 24rpx; }.extract-actions button { display: flex; gap: 12rpx; align-items: center; justify-content: center; height: 84rpx; border-radius: 18rpx; font-size: 26rpx; }.auto-extract { flex: 1.25; background: #285c49; color: white; }.outline-action { flex: 1; background: #edf1e8; color: #64765e; border: 1rpx solid #e0e7d9; }.outline-action.active { border-color: #94ad8d; }
.correction-bar { display: flex; align-items: center; gap: 8rpx; margin-top: 22rpx; }.correction-bar > button { padding: 16rpx 19rpx; font-size: 24rpx; line-height: 1.4; background: #eff2eb; color: #74816c; border-radius: 14rpx; }.correction-bar > button.active { background: #dfebd9; color: #285c49; }
.brush-options { display: flex; margin-left: auto; align-items: center; gap: 3rpx; }.brush-options button { display: flex; align-items: center; justify-content: center; width: 53rpx; height: 64rpx; background: transparent; border-radius: 10rpx; }.brush-options view { background: #a8b39c; border-radius: 50%; transform: scale(.64); }.brush-options button.chosen { background: #e5ecde; }.brush-options button.chosen view { background: #285c49; }
.tool-hint { display: block; color: #909b85; font-size: 22rpx; margin-top: 20rpx; line-height: 1.5; }.subject-error { font-size: 23rpx; color: #986240; background: #fbefde; padding: 18rpx; border-radius: 12rpx; line-height: 1.5; margin-top: 18rpx; }
.error-detail button { padding: 12rpx 0 0; background: transparent; color: #715736; font-size: 23rpx; line-height: 1.5; text-align: left; }.error-detail text { display: block; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 21rpx; margin-top: 10rpx; }
.subject-bottom { position: fixed; bottom: 0; left: 0; right: 0; background: #fdfefa; padding: 4rpx 32rpx calc(24rpx + env(safe-area-inset-bottom)); border-top: 1rpx solid #e4e9df; }.center-option { display: flex; align-items: center; justify-content: space-between; min-height: 72rpx; font-size: 25rpx; }.subject-bottom .primary-btn { height: 88rpx; }
@media (max-height: 720px) { .subject-heading { padding-top: 0; padding-bottom: 14rpx; }.subject-heading text + text { display: none; }.extract-actions { margin-top: 14rpx; }.correction-bar { margin-top: 12rpx; }.subject-page { padding-top: 14rpx; } }
@media (min-width: 768px) { .subject-bottom { width: 480px; left: 50%; right: auto; transform: translateX(-50%); } }
</style>
