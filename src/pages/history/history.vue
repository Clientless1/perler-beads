<template>
  <view class="page">
    <view v-if="list.length === 0" class="empty">
      <text class="empty-text">暂无历史记录</text>
      <text class="empty-sub">生成图纸后会自动保存在这里</text>
    </view>

    <view v-else class="list">
      <view v-for="item in list" :key="item.id" class="card" @tap="openPattern(item)">
        <view class="card-preview">
          <view class="mini-grid" :style="{ gridTemplateColumns: `repeat(${previewSize(item)}, 1fr)` }">
            <view
              v-for="(bead, idx) in getPreviewBeads(item)"
              :key="idx"
              class="mini-cell"
              :style="{ background: bead.hex }"
            />
          </view>
        </view>
        <view class="card-info">
          <text class="card-size">{{ item.gridSize }}×{{ item.gridSize }}</text>
          <text class="card-colors">{{ item.colorUsage ? item.colorUsage.length : 0 }} 色</text>
          <text class="card-time">{{ formatTime(item.createdAt) }}</text>
        </view>
        <view class="card-delete" @tap.stop="onDelete(item.id)">
          <text class="delete-icon">×</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { getHistory, deletePattern } from '../../utils/storage'
import { setPending } from '../../utils/appState'

const list = ref([])

onShow(() => {
  list.value = getHistory()
})

function previewSize(item) {
  return Math.min(item.gridSize, 16)
}

function getPreviewBeads(item) {
  if (!item.pattern) return []
  const size = previewSize(item)
  const step = Math.max(1, Math.floor(item.gridSize / size))
  const beads = []
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const srcR = Math.min(r * step, item.pattern.length - 1)
      const srcC = Math.min(c * step, (item.pattern[0] || []).length - 1)
      beads.push(item.pattern[srcR][srcC])
    }
  }
  return beads
}

function formatTime(ts) {
  const d = new Date(ts)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function openPattern(item) {
  setPending('', item.pattern, item.colorUsage, item.gridSize)
  uni.navigateTo({ url: '/pages/result/result' })
}

function onDelete(id) {
  uni.showModal({
    title: '确认删除',
    content: '删除后无法恢复',
    confirmColor: '#FF6B6B',
    success: (res) => {
      if (res.confirm) {
        deletePattern(id)
        list.value = getHistory()
      }
    },
  })
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #F5F5F5;
  padding: 20rpx 30rpx;
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 60vh;
  gap: 16rpx;
}

.empty-text {
  font-size: 32rpx;
  color: #999999;
}

.empty-sub {
  font-size: 24rpx;
  color: #CCCCCC;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.card {
  display: flex;
  align-items: center;
  background: #FFFFFF;
  border-radius: 20rpx;
  padding: 24rpx;
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.05);
  gap: 24rpx;
}

.card-preview {
  width: 160rpx;
  height: 160rpx;
  border-radius: 12rpx;
  overflow: hidden;
  flex-shrink: 0;
  background: #F5F5F5;
}

.mini-grid {
  width: 100%;
  height: 100%;
  display: grid;
}

.mini-cell {
  aspect-ratio: 1;
}

.card-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.card-size {
  font-size: 30rpx;
  font-weight: 600;
  color: #333333;
}

.card-colors {
  font-size: 24rpx;
  color: #666666;
}

.card-time {
  font-size: 22rpx;
  color: #BBBBBB;
}

.card-delete {
  width: 56rpx;
  height: 56rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.delete-icon {
  font-size: 40rpx;
  color: #CCCCCC;
  line-height: 1;
}
</style>
