<template>
  <view class="result-page">
    <view v-if="!pattern" class="empty-result"><AppIcon name="grid" :size="80" /><text>还没有打开图纸</text><button class="primary-btn" @tap="goHome">去创作</button></view>
    <template v-else>
      <view class="result-heading"><button class="project-name" @tap="rename"><text>{{ name }}</text><AppIcon name="edit" :size="28" /></button><text class="saved-state" :class="{ unsaved: !saved }">{{ saved ? '已保存' : '未保存' }}</text></view>
      <view class="project-meta"><text>{{ gridSize }} × {{ gridSize }} 格</text><text>{{ colorUsage.length }} 色</text><text>{{ totalBeads.toLocaleString() }} 颗</text></view>
      <view class="pattern-card">
        <view class="pattern-top"><view class="result-segment"><button :class="{ selected: viewMode === 'grid' }" @tap="viewMode = 'grid'">图纸</button><button :class="{ selected: viewMode === 'beads' }" @tap="viewMode = 'beads'">成品</button></view><button class="reset-button" aria-label="重置缩放" @tap="resetView"><AppIcon name="expand" :size="30" /></button></view>
        <scroll-view v-if="boardCount > 1" scroll-x class="board-scroll"><view class="board-list"><button :class="{ active: boardIndex === -1 }" @tap="selectBoard(-1)">全部</button><button v-for="(board, i) in boards" :key="i" :class="{ active: boardIndex === i }" @tap="selectBoard(i)">{{ board.label }}</button></view></scroll-view>
        <movable-area class="pattern-viewport" :style="{ height: viewport + 'px' }"><movable-view :key="viewKey" direction="all" :inertia="false" :out-of-bounds="false" scale :scale-min="1" :scale-max="3" :scale-value="1" :x="0" :y="0" :style="{ width: canvasSize + 'px', height: canvasSize + 'px' }" @scale="gestureScale = $event.detail.scale"><canvas type="2d" id="patternCanvas" canvas-id="patternCanvas" :style="{ width: canvasSize + 'px', height: canvasSize + 'px' }" /></movable-view></movable-area>
        <view class="canvas-controls"><view v-if="viewMode === 'grid'" class="label-control"><text>色号</text><switch :checked="showLabels" color="#285c49" style="transform:scale(.65);transform-origin:left center" @change="toggleLabels" /></view><text v-else class="beads-label">成品预览</text><view class="zoom-controls"><button aria-label="缩小图纸" :disabled="zoom <= 1" @tap="changeZoom(-.5)"><AppIcon name="minus" :size="26" /></button><text>{{ Math.round(zoom * gestureScale * 100) }}%</text><button aria-label="放大图纸" :disabled="zoom >= 4" @tap="changeZoom(.5)"><AppIcon name="plus" :size="26" /></button></view></view>
      </view>
      <view v-if="selectedColor" class="selected-banner"><view class="selected-dot" :style="{ background: selectedColor.hex }" /><text>{{ selectedColor.code }}</text><text class="selected-count">{{ selectedColor.count }} 颗</text><button aria-label="取消颜色高亮" @tap="selectedCode = ''"><AppIcon name="close" :size="28" /></button></view>
      <view class="progress-card"><view class="progress-heading"><text>完成 {{ completedCodes.length }} / {{ colorUsage.length }} 色</text><text>{{ progress }}%</text></view><view class="progress-track"><view :style="{ width: progress + '%' }" /></view></view>
      <ColorUsageList :palette-name="paletteName" :colors="colorUsage" :selected="selectedCode" :completed="completedCodes" @select="selectColor" @complete="toggleCompleted" @copy="copyList" />
      <text class="result-note">5mm 豆 · 约 {{ (gridSize * .5).toFixed(1) }} × {{ (gridSize * .5).toFixed(1) }} cm</text>
      <button v-if="attribution" class="result-attribution" @tap="copyAttribution">Twemoji · Twitter 及贡献者 · CC BY 4.0 · 已修改<AppIcon name="copy" :size="21" /></button>
      <view class="bottom-actions"><button class="secondary-btn" @tap="openLibrary"><AppIcon name="folder" :size="30" /><text>作品</text></button><button class="primary-btn" :disabled="exporting" @tap="exportVisible = true"><AppIcon name="download" :size="30" light /><text>{{ exporting ? '导出中…' : '导出图纸' }}</text></button></view>
      <canvas type="2d" id="exportCanvas" canvas-id="exportCanvas" class="hidden-canvas" />
    </template>
    <view v-if="exportVisible" class="sheet-backdrop" @tap="exportVisible = false"><view class="bottom-sheet" @tap.stop><view class="sheet-handle" /><view class="sheet-heading"><text class="section-title">导出图片</text><button class="icon-button" aria-label="关闭导出" @tap="exportVisible = false"><AppIcon name="close" :size="30" /></button></view><button class="export-option" @tap="saveImage(true)"><AppIcon name="grid" :size="40" /><view><text class="export-title">色号图纸</text><text class="export-sub">坐标、色号、用豆清单</text></view><AppIcon name="chevron" :size="28" /></button><button class="export-option" @tap="saveImage(false)"><AppIcon name="sparkles" :size="40" /><view><text class="export-title">成品效果</text><text class="export-sub">拼豆效果图</text></view><AppIcon name="chevron" :size="28" /></button></view></view>
  </view>
</template>

<script setup>
import { ref, shallowRef, computed, nextTick, watch, getCurrentInstance } from 'vue'
import { onLoad, onReady, onUnload } from '@dcloudio/uni-app'
import AppIcon from '../../components/AppIcon.vue'
import ColorUsageList from '../../components/ColorUsageList.vue'
import { getPending } from '../../utils/appState'
import { drawPatternAsync, drawForExport } from '../../utils/canvasRenderer'
import { getCanvasNode, captureCanvas } from '../../utils/canvas'
import { savePattern, updatePattern, getPatternById } from '../../utils/storage'

const paletteName = ref('Hama')
const attribution = ref(null)
const instance = getCurrentInstance()
const pattern = shallowRef(null), gridSize = ref(29), colorUsage = shallowRef([]), name = ref('我的小作品')
const recordId = ref(''), completedCodes = ref([]), saved = ref(false)
const viewMode = ref('grid'), showLabels = ref(false), selectedCode = ref(''), boardIndex = ref(-1)
const zoom = ref(1), gestureScale = ref(1), viewKey = ref(0), exportVisible = ref(false), exporting = ref(false)
const viewport = Math.floor(Math.min(uni.getSystemInfoSync().windowWidth, 480) * (1 - 104 / 750) - 2)
const canvasSize = computed(() => Math.round(viewport * zoom.value))
const totalBeads = computed(() => colorUsage.value.reduce((n, c) => n + c.count, 0))
const completedBeads = computed(() => colorUsage.value.filter(c => completedCodes.value.includes(c.code)).reduce((n, c) => n + c.count, 0))
const progress = computed(() => totalBeads.value ? Math.round(completedBeads.value / totalBeads.value * 100) : 0)
const selectedColor = computed(() => colorUsage.value.find(c => c.code === selectedCode.value))
const boardCount = computed(() => Math.ceil(gridSize.value / 29) ** 2)
const boards = computed(() => {
  const count = Math.ceil(gridSize.value / 29), list = []
  for (let r = 0; r < count; r++) for (let c = 0; c < count; c++) list.push({ row: r * 29, col: c * 29, label: `${String.fromCharCode(65 + r)}${c + 1} 底板` })
  return list
})
let canvasNode = null, renderRevision = 0, renderTimer, alive = true

onLoad(() => {
  const pending = getPending()
  if (!pending.pattern) return
  pattern.value = pending.pattern; gridSize.value = pending.gridSize; colorUsage.value = pending.colorUsage || []
  name.value = pending.name || '我的小作品'
  paletteName.value = pending.paletteName || 'Hama'
  attribution.value = pending.attribution || null
  try {
    recordId.value = pending.id || savePattern({ pattern: pattern.value, gridSize: gridSize.value, colorUsage: colorUsage.value, name: name.value, paletteName: paletteName.value, attribution: attribution.value })
    const stored = getPatternById(recordId.value)
    if (stored) { paletteName.value = stored.paletteName || 'Hama'; attribution.value = stored.attribution || attribution.value; name.value = stored.name; completedCodes.value = stored.completedCodes.filter(code => colorUsage.value.some(c => c.code === code)); saved.value = true }
  } catch { uni.showToast({ title: '本地空间不足，图纸未保存，请先导出', icon: 'none' }) }
})
onReady(async () => { await nextTick(); await render() })
function scheduleRender() { renderRevision++; clearTimeout(renderTimer); renderTimer = setTimeout(() => nextTick(render), 16) }
watch([viewMode, showLabels, selectedCode, boardIndex, zoom, viewKey], scheduleRender)
onUnload(() => { alive = false; renderRevision++; clearTimeout(renderTimer) })

async function render() {
  const current = ++renderRevision
  if (!pattern.value || !alive) return
  canvasNode = await getCanvasNode('#patternCanvas', instance)
  if (!canvasNode || !alive || current !== renderRevision) return
  let cells = pattern.value, size = gridSize.value, offsets = {}
  if (boardIndex.value >= 0) {
    const board = boards.value[boardIndex.value]
    cells = cells.slice(board.row, board.row + 29).map(row => row.slice(board.col, board.col + 29))
    size = cells.length; offsets = { rowOffset: board.row, colOffset: board.col }
  }
  try {
    await drawPatternAsync(canvasNode, cells, size, showLabels.value && viewMode.value === 'grid', canvasSize.value, { mode: viewMode.value, highlight: selectedCode.value, axis: viewMode.value === 'grid', ...offsets, isCancelled: () => !alive || current !== renderRevision })
  } catch (error) { if (error.name !== 'AbortError') uni.showToast({ title: '图纸绘制失败，请重试', icon: 'none' }) }
}
function resetView() { zoom.value = 1; gestureScale.value = 1; viewKey.value++ }
function changeZoom(amount) { zoom.value = Math.max(1, Math.min(4, zoom.value + amount)); gestureScale.value = 1; viewKey.value++ }
function selectBoard(index) { boardIndex.value = index; resetView() }
function toggleLabels(event) {
  showLabels.value = event.detail.value
  if (showLabels.value) {
    const cells = boardIndex.value < 0 ? gridSize.value : 29
    zoom.value = Math.max(zoom.value, Math.min(4, Math.ceil((cells * 18 + 30) / viewport * 2) / 2))
    gestureScale.value = 1; viewKey.value++
  }
}
function selectColor(code) { selectedCode.value = selectedCode.value === code ? '' : code }
function persist(changes) {
  try {
    if (!recordId.value) recordId.value = savePattern({ pattern: pattern.value, gridSize: gridSize.value, colorUsage: colorUsage.value, name: name.value, paletteName: paletteName.value, attribution: attribution.value })
    updatePattern(recordId.value, changes); saved.value = true
  } catch { saved.value = false; uni.showToast({ title: '保存失败，请检查本地存储空间', icon: 'none' }) }
}
function toggleCompleted(code) {
  completedCodes.value = completedCodes.value.includes(code) ? completedCodes.value.filter(c => c !== code) : [...completedCodes.value, code]
  persist({ completedCodes: completedCodes.value })
}
function rename() {
  uni.showModal({ title: '给作品起个名字', editable: true, placeholderText: name.value, confirmText: '保存', confirmColor: '#285c49', success: result => {
    if (result.confirm && result.content?.trim()) { name.value = result.content.trim().slice(0, 24); persist({ name: name.value }) }
  } })
}
function copyList() {
  const lines = [`${name.value} · ${gridSize.value} × ${gridSize.value}`, `${paletteName.value} 色卡 / 共 ${totalBeads.value} 颗`, ...colorUsage.value.map(c => `${c.code} ${c.name} × ${c.count}`)]
  uni.setClipboardData({ data: lines.join('\n') })
}
function copyAttribution() {
  const source = attribution.value
  if (source) uni.setClipboardData({ data: `${source.title} · ${source.author}\n${source.url}\n${source.license}: ${source.licenseUrl}\n已修改为 MARD 像素图纸` })
}
async function saveImage(labels) {
  if (exporting.value || !pattern.value) return
  exportVisible.value = false; exporting.value = true
  uni.showLoading({ title: '正在生成高清图' })
  try {
    const canvas = await getCanvasNode('#exportCanvas', instance)
    if (!canvas) throw new Error('画布未就绪，请重试')
    drawForExport(canvas, pattern.value, gridSize.value, labels, { name: name.value, colorUsage: colorUsage.value, paletteName: paletteName.value, attribution: attribution.value })
    const path = await captureCanvas(canvas, 'exportCanvas')
    // #ifdef H5
    const link = document.createElement('a'); link.href = path; link.download = `${name.value}-${labels ? '色号图纸' : '成品效果'}.png`; link.click()
    // #endif
    // #ifdef MP-WEIXIN
    await new Promise((resolve, reject) => uni.saveImageToPhotosAlbum({ filePath: path, success: resolve, fail: reject }))
    // #endif
    uni.hideLoading(); uni.showToast({ title: '高清图纸已保存', icon: 'success' })
  } catch (err) {
    uni.hideLoading()
    if (/auth|deny|denied/i.test(err.errMsg || '')) {
      uni.showModal({ title: '需要相册权限', content: '在设置中允许保存到相册，就能把图纸带走。', confirmText: '去设置', confirmColor: '#285c49', success: result => { if (result.confirm) uni.openSetting() } })
    } else if (!/cancel/i.test(err.errMsg || '')) uni.showToast({ title: err.message || '保存失败，请重试', icon: 'none' })
  } finally { exporting.value = false }
}
function goHome() { uni.switchTab({ url: '/pages/index/index' }) }
function openLibrary() { uni.switchTab({ url: '/pages/history/history' }) }
</script>

<style scoped>
.result-page { padding: 28rpx 32rpx calc(170rpx + env(safe-area-inset-bottom)); min-height: 100vh; }
.result-heading { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; margin: 4rpx 0 16rpx; }
.project-name { display: flex; align-items: center; gap: 14rpx; background: transparent; min-width: 0; line-height: 1.4; padding: 8rpx 0; text-align: left; color: #263d32; }
.project-name > text { font-size: 36rpx; font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.saved-state { font-size: 22rpx; color: #819573; flex-shrink: 0; }
.saved-state.unsaved { color: #a16b42; }
.project-meta { display: flex; gap: 24rpx; color: #819175; font-size: 24rpx; margin-bottom: 28rpx; }
.pattern-card { background: #fff; border: 1rpx solid #e3e8df; border-radius: 22rpx; padding: 20rpx; overflow: hidden; }
.pattern-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18rpx; }
.result-segment { display: flex; background: #f0f3ed; padding: 4rpx; border-radius: 12rpx; }
.result-segment button { background: transparent; font-size: 24rpx; line-height: 1.3; border-radius: 9rpx; padding: 12rpx 28rpx; color: #83917a; }
.result-segment button.selected { background: #fff; color: #285c49; }
.reset-button { background: transparent; display: flex; align-items: center; justify-content: center; height: 62rpx; width: 62rpx; }
.pattern-viewport { width: 100%; overflow: hidden; background: #f5f7f1; border-radius: 12rpx; touch-action: none; }
.canvas-controls { display: flex; align-items: center; justify-content: space-between; margin-top: 16rpx; min-height: 68rpx; }
.label-control { display: flex; align-items: center; gap: 12rpx; font-size: 24rpx; color: #7c8d70; }
.label-control switch { width: 80rpx; }
.beads-label { font-size: 23rpx; color: #849577; }
.zoom-controls { display: flex; align-items: center; border: 1rpx solid #e5eadf; border-radius: 12rpx; }
.zoom-controls button { width: 66rpx; height: 66rpx; display: flex; align-items: center; justify-content: center; background: transparent; }
.zoom-controls > text { font-size: 22rpx; color: #748b63; width: 78rpx; text-align: center; }
.board-scroll { white-space: nowrap; margin-bottom: 18rpx; }
.board-list { display: inline-flex; gap: 10rpx; }
.board-list button { flex-shrink: 0; background: #f3f6ef; border: 1rpx solid #e5ebdc; border-radius: 10rpx; padding: 15rpx 18rpx; font-size: 22rpx; line-height: 1.3; color: #879b76; }
.board-list button.active { background: #e8f0e3; color: #4e743d; border-color: #adc09d; }
.selected-banner { margin-top: 18rpx; padding: 12rpx 18rpx; border-radius: 14rpx; background: #eaf1e3; display: flex; align-items: center; gap: 12rpx; color: #648251; font-size: 25rpx; }
.selected-dot { width: 30rpx; height: 30rpx; border-radius: 7rpx; border: 1rpx solid #00000010; }
.selected-count { margin-left: auto; font-size: 23rpx; }
.selected-banner button { background: transparent; display: flex; padding: 10rpx; }
.progress-card { margin-top: 26rpx; padding: 6rpx 2rpx; }
.progress-heading { display: flex; justify-content: space-between; font-size: 24rpx; color: #7c8e70; }
.progress-track { height: 8rpx; border-radius: 6rpx; background: #e2e9d9; margin-top: 16rpx; overflow: hidden; }
.progress-track view { height: 100%; background: #87a571; border-radius: 6rpx; transition: width .3s; }
.result-note { display: block; margin: 26rpx 0; font-size: 22rpx; text-align: center; color: #919e85; }
.result-attribution { display: flex; align-items: center; justify-content: center; gap: 8rpx; background: transparent; color: #929c86; font-size: 18rpx; line-height: 1.6; padding: 0 0 20rpx; }
.bottom-actions { position: fixed; z-index: 10; left: 0; right: 0; bottom: 0; background: #fdfefa; border-top: 1rpx solid #e4e9de; padding: 18rpx 32rpx calc(18rpx + env(safe-area-inset-bottom)); display: flex; gap: 18rpx; }
.bottom-actions .secondary-btn { flex: 0 0 190rpx; height: 92rpx; }
.bottom-actions .primary-btn { flex: 1; height: 92rpx; font-size: 28rpx; }
.export-option { display: flex; align-items: center; gap: 24rpx; background: #f1f5eb; padding: 28rpx; margin-top: 18rpx; border-radius: 18rpx; line-height: 1.4; width: 100%; text-align: left; }
.export-option > view { flex: 1; }
.export-title { display: block; font-size: 29rpx; color: #526f41; font-weight: 600; }
.export-sub { display: block; font-size: 23rpx; color: #889b7a; margin-top: 8rpx; }
.empty-result { min-height: 70vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 32rpx; font-size: 32rpx; }
.empty-result .primary-btn { padding: 0 70rpx; margin-top: 8rpx; }
@media (min-width: 768px) { .bottom-actions { width: 480px; left: 50%; right: auto; transform: translateX(-50%); } }
</style>
