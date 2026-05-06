<template>
  <view class="page">
    <view v-if="!pattern" class="loading">
      <text>加载中...</text>
    </view>

    <template v-else>
      <view v-if="sourceImagePath" class="source-preview">
        <image :src="sourceImagePath" mode="aspectFit" class="source-image" />
      </view>

      <view class="canvas-wrapper">
        <movable-area class="movable-area" :style="{ height: areaHeight + 'px' }">
          <movable-view
            direction="all"
            :scale="true"
            :scale-min="0.5"
            :scale-max="5"
            :scale-value="1"
            class="movable-view"
            :style="{ width: canvasDisplaySize + 'px', height: canvasDisplaySize + 'px' }"
          >
            <canvas
              type="2d"
              id="patternCanvas"
              canvas-id="patternCanvas"
              class="pattern-canvas"
              :style="{ width: canvasDisplaySize + 'px', height: canvasDisplaySize + 'px' }"
            />
          </movable-view>
        </movable-area>
      </view>

      <canvas
        type="2d"
        id="exportCanvas"
        canvas-id="exportCanvas"
        class="export-canvas"
      />

      <view class="controls">
        <view class="control-item">
          <text class="control-label">显示色号</text>
          <switch :checked="showLabels" @change="onToggleLabels" color="#FF6B6B" />
        </view>
        <view v-if="gridSize > 29" class="control-tip">
          <text>大尺寸底板请双指放大后查看色号</text>
        </view>
      </view>

      <ColorUsageList :colors="colorUsage" />

      <view class="actions">
        <button class="action-btn save-btn" @tap="saveToAlbum">保存到相册</button>
        <button class="action-btn share-btn" open-type="share">分享</button>
      </view>
    </template>
  </view>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import { onLoad, onReady, onShareAppMessage } from '@dcloudio/uni-app'
import { getPending } from '../../utils/appState'
import { drawPattern, drawForExport } from '../../utils/canvasRenderer'
import { savePattern } from '../../utils/storage'
import ColorUsageList from '../../components/ColorUsageList.vue'

const pattern = ref(null)
const colorUsage = ref([])
const gridSize = ref(29)
const showLabels = ref(false)
const savedTempPath = ref('')
const sourceImagePath = ref('')

const viewportSize = computed(() => {
  const info = uni.getSystemInfoSync()
  return Math.floor(info.windowWidth - 60)
})

const canvasDisplaySize = computed(() => {
  if (!showLabels.value || gridSize.value <= 29) {
    return viewportSize.value
  }

  return Math.max(viewportSize.value, gridSize.value * 10)
})

const areaHeight = computed(() => viewportSize.value)

let canvasNode = null
let exportCanvasNode = null

onLoad(() => {
  const pending = getPending()
  if (pending.pattern) {
    sourceImagePath.value = pending.imagePath || ''
    pattern.value = pending.pattern
    colorUsage.value = pending.colorUsage
    gridSize.value = pending.gridSize
  }
})

onReady(() => {
  nextTick(() => {
    setTimeout(initCanvas, 100)
  })
})

function getCanvasNode(selector) {
  return new Promise((resolve) => {
    const query = uni.createSelectorQuery()
    query.select(selector).fields({ node: true, size: true }).exec((res) => {
      if (res && res[0] && res[0].node) {
        resolve(res[0].node)
      } else {
        resolve(null)
      }
    })
  })
}

async function initCanvas() {
  if (!pattern.value) return

  canvasNode = await getCanvasNode('#patternCanvas')
  exportCanvasNode = await getCanvasNode('#exportCanvas')

  if (canvasNode) {
    renderPattern()
  }

  saveToHistory()
}

function renderPattern() {
  if (!canvasNode || !pattern.value) return
  drawPattern(canvasNode, pattern.value, gridSize.value, showLabels.value, canvasDisplaySize.value)
}

async function onToggleLabels(e) {
  showLabels.value = e.detail.value
  await nextTick()
  renderPattern()
}

function captureCanvas(canvas, canvasId, exportSize) {
  return new Promise((resolve, reject) => {
    uni.canvasToTempFilePath({
      canvas,
      canvasId,
      x: 0,
      y: 0,
      width: exportSize,
      height: exportSize,
      destWidth: exportSize,
      destHeight: exportSize,
      fileType: 'png',
      success: (res) => resolve(res.tempFilePath),
      fail: reject,
    })
  })
}

async function generateExportImage() {
  if (!exportCanvasNode || !pattern.value) {
    throw new Error('export canvas not ready')
  }

  const exportSize = gridSize.value * 30
  drawForExport(exportCanvasNode, pattern.value, gridSize.value, showLabels.value)
  await new Promise(resolve => setTimeout(resolve, 100))

  const tempPath = await captureCanvas(exportCanvasNode, 'exportCanvas', exportSize)
  savedTempPath.value = tempPath
  return tempPath
}

async function saveToAlbum() {
  if (!canvasNode || !exportCanvasNode || !pattern.value) {
    uni.showToast({ title: '画布未就绪，请稍后重试', icon: 'none' })
    return
  }

  uni.showLoading({ title: '生成高清图...' })

  try {
    const tempPath = await generateExportImage()

    await new Promise((resolve, reject) => {
      uni.saveImageToPhotosAlbum({
        filePath: tempPath,
        success: resolve,
        fail: (err) => {
          if (err.errMsg && err.errMsg.includes('deny')) {
            uni.showModal({
              title: '需要相册权限',
              content: '请在设置中开启相册权限',
              confirmText: '去设置',
              success: (res) => {
                if (res.confirm) {
                  uni.openSetting()
                }
              },
            })
            reject(err)
          } else {
            reject(err)
          }
        },
      })
    })

    uni.hideLoading()
    uni.showToast({ title: '已保存到相册', icon: 'success' })
  } catch (err) {
    uni.hideLoading()
    if (!err.errMsg || !err.errMsg.includes('deny')) {
      uni.showToast({ title: '保存失败，请重试', icon: 'none' })
    }
  }
}

function getSharePayload(imageUrl = savedTempPath.value || '') {
  return {
    title: '我用拼豆做了一幅像素画！',
    path: '/pages/index/index',
    imageUrl,
  }
}

function saveToHistory() {
  if (!pattern.value) return
  try {
    savePattern({
      gridSize: gridSize.value,
      pattern: pattern.value,
      colorUsage: colorUsage.value,
    })
  } catch {
    // storage full or unavailable — non-critical
  }
}

onShareAppMessage(() => {
  return {
    ...getSharePayload(),
    promise: (!savedTempPath.value && exportCanvasNode && pattern.value)
      ? generateExportImage()
        .then(imageUrl => getSharePayload(imageUrl))
        .catch(() => getSharePayload())
      : Promise.resolve(getSharePayload()),
  }
})
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #F5F5F5;
  padding-bottom: calc(40rpx + env(safe-area-inset-bottom));
}

.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 60vh;
  font-size: 30rpx;
  color: #999999;
}

.canvas-wrapper {
  margin: 20rpx 30rpx;
  background: #FFFFFF;
  border-radius: 24rpx;
  padding: 20rpx;
  box-shadow: 0 4rpx 20rpx rgba(0, 0, 0, 0.06);
  overflow: hidden;
}

.source-preview {
  margin: 20rpx 30rpx 0;
  background: #FFFFFF;
  border-radius: 24rpx;
  padding: 20rpx;
  box-shadow: 0 4rpx 20rpx rgba(0, 0, 0, 0.06);
}

.source-image {
  width: 100%;
  height: 320rpx;
  display: block;
  border-radius: 12rpx;
  background: #FAFAFA;
}

.movable-area {
  width: 100%;
  overflow: hidden;
  border-radius: 12rpx;
  background: #FAFAFA;
}

.movable-view {
  display: flex;
  align-items: center;
  justify-content: center;
}

.pattern-canvas {
  display: block;
}

.export-canvas {
  position: fixed;
  left: -2000px;
  top: -2000px;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.controls {
  margin: 0 30rpx;
  padding: 20rpx 30rpx;
  background: #FFFFFF;
  border-radius: 24rpx;
  box-shadow: 0 4rpx 20rpx rgba(0, 0, 0, 0.06);
}

.control-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.control-label {
  font-size: 28rpx;
  color: #333333;
}

.control-tip {
  margin-top: 10rpx;
}

.control-tip text {
  font-size: 22rpx;
  color: #BBBBBB;
}

.actions {
  display: flex;
  gap: 20rpx;
  margin: 20rpx 30rpx;
}

.action-btn {
  flex: 1;
  height: 80rpx;
  line-height: 80rpx;
  border-radius: 40rpx;
  font-size: 28rpx;
  text-align: center;
  border: none;
}

.save-btn {
  background: linear-gradient(135deg, #FF6B6B, #FF8E8E);
  color: #FFFFFF;
}

.share-btn {
  background: #FFFFFF;
  color: #FF6B6B;
  border: 2rpx solid #FF6B6B;
}
</style>
