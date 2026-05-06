<template>
  <view class="color-list">
    <view class="list-header">
      <text class="title">所需颜色 ({{ colors.length }} 色，共 {{ totalCount }} 颗)</text>
    </view>
    <scroll-view scroll-y class="list-body">
      <view v-for="item in colors" :key="item.code" class="color-item">
        <view class="color-swatch" :style="{ background: item.hex }" />
        <text class="color-code">{{ item.code }}</text>
        <text class="color-name">{{ item.name }}</text>
        <text class="color-count">×{{ item.count }}</text>
      </view>
    </scroll-view>
  </view>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  colors: { type: Array, default: () => [] },
})

const totalCount = computed(() => props.colors.reduce((sum, c) => sum + c.count, 0))
</script>

<style scoped>
.color-list {
  background: #FFFFFF;
  border-radius: 24rpx;
  margin: 20rpx 30rpx;
  overflow: hidden;
  box-shadow: 0 4rpx 20rpx rgba(0, 0, 0, 0.06);
}

.list-header {
  padding: 24rpx 30rpx;
  border-bottom: 1rpx solid #F0F0F0;
}

.title {
  font-size: 28rpx;
  font-weight: 600;
  color: #333333;
}

.list-body {
  max-height: 500rpx;
}

.color-item {
  display: flex;
  align-items: center;
  padding: 18rpx 30rpx;
  gap: 16rpx;
}

.color-item + .color-item {
  border-top: 1rpx solid #F8F8F8;
}

.color-swatch {
  width: 40rpx;
  height: 40rpx;
  border-radius: 8rpx;
  border: 1rpx solid rgba(0, 0, 0, 0.1);
  flex-shrink: 0;
}

.color-code {
  font-size: 24rpx;
  color: #999999;
  width: 80rpx;
}

.color-name {
  font-size: 26rpx;
  color: #333333;
  flex: 1;
}

.color-count {
  font-size: 26rpx;
  color: #FF6B6B;
  font-weight: 600;
}
</style>
