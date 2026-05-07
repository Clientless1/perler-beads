<template>
  <view class="page">
    <view class="custom-nav" :style="{ paddingTop: navLayout.statusBarHeight + 'px' }">
      <view class="nav-bar" :style="{ height: navLayout.navBarHeight + 'px' }">
        <view class="nav-side" :style="{ width: navLayout.sideWidth + 'px' }">
          <view class="feedback-tag nav-feedback-tag" @tap="openFeedback">
            <text class="feedback-tag-text">反馈</text>
          </view>
        </view>
        <text class="nav-title">拼豆图纸生成器</text>
        <view class="nav-side" :style="{ width: navLayout.sideWidth + 'px' }" />
      </view>
    </view>

    <view class="preview-area" @tap="chooseImage">
      <image v-if="imagePath" :src="imagePath" mode="aspectFit" class="preview-img" />
      <view v-else class="placeholder">
        <text class="placeholder-icon">+</text>
        <text class="placeholder-text">点击选择图片开始生成</text>
      </view>
    </view>

    <view class="settings">
      <view class="setting-row">
        <text class="label">底板尺寸</text>
        <view class="grid-options">
          <view
            v-for="size in gridOptions"
            :key="size"
            class="grid-btn"
            :class="{ active: gridSize === size }"
            @tap="gridSize = size"
          >
            <text>{{ size }}×{{ size }}</text>
          </view>
        </view>
      </view>

      <view class="setting-row">
        <text class="label">限制颜色数量</text>
        <switch :checked="limitColors" @change="limitColors = $event.detail.value" color="#FF6B6B" />
      </view>

      <view v-if="limitColors" class="setting-row">
        <text class="label">最多颜色数</text>
        <view class="color-limit">
          <slider
            :value="maxColors"
            :min="3"
            :max="30"
            :step="1"
            activeColor="#FF6B6B"
            @change="maxColors = $event.detail.value"
            class="slider"
          />
          <text class="color-num">{{ maxColors }} 色</text>
        </view>
      </view>
    </view>

    <view class="bottom-action">
      <button class="generate-btn" :disabled="!imagePath || generating" @tap="onGenerate">
        <text v-if="generating" class="btn-content">
          <text class="spinner" />
          生成中...
        </text>
        <text v-else>生成图纸</text>
      </button>
    </view>

    <view v-if="feedbackVisible" class="feedback-modal" @tap="closeFeedback">
      <view class="feedback-dialog" @tap.stop>
        <text class="feedback-dialog-title">微信反馈</text>
        <image :src="feedbackQrImage" mode="widthFix" class="feedback-qr-image" />
        <text class="feedback-dialog-tip">扫一扫二维码，添加我为朋友</text>
        <button class="feedback-close-btn" @tap="closeFeedback">关闭</button>
      </view>
    </view>

    <view v-if="generating" class="loading-overlay">
      <view class="loading-card">
        <view class="loading-spinner" />
        <text class="loading-text">正在生成图纸...</text>
        <text class="loading-sub">{{ gridSize }}×{{ gridSize }} 底板</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { processImage } from '../../utils/imageProcessor'
import { matchAll } from '../../utils/colorMatcher'
import { HAMA_PALETTE } from '../../utils/beadPalette'
import { setPending } from '../../utils/appState'

const imagePath = ref('')
const gridSize = ref(58)
const limitColors = ref(false)
const maxColors = ref(24)
const generating = ref(false)
const gridOptions = [29, 58, 87]
const feedbackVisible = ref(false)
const feedbackQrImage = '/static/feedback/wechat-qr.jpg'
const navLayout = getNavLayout()

onShow(() => {
  generating.value = false
})

function getNavLayout() {
  const systemInfo = uni.getSystemInfoSync()
  const statusBarHeight = systemInfo.statusBarHeight || 20
  let navBarHeight = 44
  let sideWidth = 96

  // #ifdef MP-WEIXIN
  if (typeof uni.getMenuButtonBoundingClientRect === 'function') {
    const menuButton = uni.getMenuButtonBoundingClientRect()
    if (menuButton && menuButton.height) {
      navBarHeight = (menuButton.top - statusBarHeight) * 2 + menuButton.height
      sideWidth = Math.max(92, systemInfo.windowWidth - menuButton.left)
    }
  }
  // #endif

  return {
    statusBarHeight,
    navBarHeight,
    sideWidth,
  }
}

function openFeedback() {
  feedbackVisible.value = true
}

function closeFeedback() {
  feedbackVisible.value = false
}

function chooseImage() {
  uni.chooseImage({
    count: 1,
    sizeType: ['original'],
    sourceType: ['album', 'camera'],
    success: (res) => {
      imagePath.value = res.tempFilePaths[0]
    },
    fail: () => {},
  })
}

async function onGenerate() {
  if (!imagePath.value || generating.value) return
  generating.value = true

  await new Promise(resolve => setTimeout(resolve, 50))

  try {
    const detailMode = true
    const pixelData = await processImage(imagePath.value, gridSize.value, { detailMode })
    const colors = limitColors.value ? maxColors.value : 0
    const { pattern, colorUsage } = matchAll(pixelData, gridSize.value, HAMA_PALETTE, colors, { detailMode })

    setPending(imagePath.value, pattern, colorUsage, gridSize.value)
    uni.navigateTo({ url: '/pages/result/result' })
  } catch (err) {
    uni.showToast({ title: err.message || '生成失败', icon: 'none' })
    generating.value = false
  }
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: linear-gradient(180deg, #FFF0F0 0%, #F5F5F5 30%);
  padding-bottom: 120rpx;
}

.custom-nav {
  background: #FF6B6B;
}

.nav-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 18rpx 0 14rpx;
}

.nav-side {
  display: flex;
  align-items: center;
}

.nav-title {
  flex: 1;
  text-align: center;
  color: #FFFFFF;
  font-size: 30rpx;
  font-weight: 600;
  line-height: 1;
}

.nav-feedback-tag {
  box-shadow: 0 6rpx 16rpx rgba(176, 54, 54, 0.16);
}

.feedback-tag {
  min-width: 74rpx;
  height: 38rpx;
  padding: 0 16rpx;
  border-radius: 999rpx;
  background: rgba(255, 255, 255, 0.92);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1rpx solid rgba(255, 255, 255, 0.5);
}

.feedback-tag-text {
  font-size: 22rpx;
  color: #FF6B6B;
  font-weight: 700;
}

.preview-area {
  margin: 24rpx 30rpx 30rpx;
  height: 600rpx;
  border-radius: 24rpx;
  overflow: hidden;
  background: #FFFFFF;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4rpx 20rpx rgba(0, 0, 0, 0.06);
}

.preview-img {
  width: 100%;
  height: 100%;
}

.placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;
}

.placeholder-icon {
  font-size: 80rpx;
  color: #CCCCCC;
  line-height: 1;
}

.placeholder-text {
  font-size: 28rpx;
  color: #999999;
}

.settings {
  margin: 0 30rpx;
  padding: 30rpx;
  background: #FFFFFF;
  border-radius: 24rpx;
  box-shadow: 0 4rpx 20rpx rgba(0, 0, 0, 0.06);
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20rpx 0;
}

.setting-row + .setting-row {
  border-top: 1rpx solid #F0F0F0;
}

.label {
  font-size: 28rpx;
  color: #333333;
  flex-shrink: 0;
}

.grid-options {
  display: flex;
  gap: 16rpx;
}

.grid-btn {
  padding: 10rpx 24rpx;
  border-radius: 30rpx;
  background: #F5F5F5;
  font-size: 24rpx;
  color: #666666;
}

.grid-btn.active {
  background: #FF6B6B;
  color: #FFFFFF;
}

.color-limit {
  display: flex;
  align-items: center;
  flex: 1;
  margin-left: 20rpx;
}

.slider {
  flex: 1;
}

.color-num {
  font-size: 26rpx;
  color: #FF6B6B;
  width: 80rpx;
  text-align: right;
}

.bottom-action {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 20rpx 30rpx;
  padding-bottom: calc(20rpx + env(safe-area-inset-bottom));
  background: #FFFFFF;
  box-shadow: 0 -2rpx 10rpx rgba(0, 0, 0, 0.05);
}

.generate-btn {
  background: linear-gradient(135deg, #FF6B6B, #FF8E8E);
  color: #FFFFFF;
  border-radius: 50rpx;
  font-size: 32rpx;
  height: 88rpx;
  line-height: 88rpx;
  border: none;
}

.generate-btn[disabled] {
  opacity: 0.5;
}

.btn-content {
  display: inline-flex;
  align-items: center;
  gap: 12rpx;
}

.feedback-modal {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40rpx;
  background: rgba(0, 0, 0, 0.42);
}

.feedback-dialog {
  width: 100%;
  max-width: 620rpx;
  border-radius: 28rpx;
  background: #FFFFFF;
  padding: 28rpx;
  box-shadow: 0 16rpx 50rpx rgba(0, 0, 0, 0.18);
}

.feedback-dialog-title {
  display: block;
  text-align: center;
  font-size: 32rpx;
  color: #222222;
  font-weight: 600;
}

.feedback-qr-image {
  width: 100%;
  display: block;
  margin-top: 22rpx;
  border-radius: 20rpx;
  background: #F7F7F7;
}

.feedback-dialog-tip {
  display: block;
  margin-top: 18rpx;
  text-align: center;
  font-size: 24rpx;
  color: #8C8C8C;
}

.feedback-close-btn {
  margin-top: 24rpx;
  height: 80rpx;
  line-height: 80rpx;
  border: none;
  border-radius: 999rpx;
  background: linear-gradient(135deg, #FF6B6B, #FF8E8E);
  color: #FFFFFF;
  font-size: 28rpx;
}

.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
}

.loading-card {
  background: #FFFFFF;
  border-radius: 24rpx;
  padding: 60rpx 80rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24rpx;
  box-shadow: 0 8rpx 40rpx rgba(0, 0, 0, 0.12);
}

.loading-spinner {
  width: 64rpx;
  height: 64rpx;
  border: 6rpx solid #F0F0F0;
  border-top-color: #FF6B6B;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-text {
  font-size: 30rpx;
  color: #333333;
  font-weight: 600;
}

.loading-sub {
  font-size: 24rpx;
  color: #999999;
}
</style>
