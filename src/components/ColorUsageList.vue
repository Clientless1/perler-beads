<template>
  <view class="color-list">
    <view class="list-heading"><text class="list-title">用豆清单</text><button class="copy-button" @tap="$emit('copy')"><AppIcon name="copy" :size="28" /><text>复制</text></button></view>
    <view class="color-search"><AppIcon name="palette" :size="30" /><input v-model="search" placeholder="搜索色号" placeholder-style="color:#a3ac98" /></view>
    <view class="list-columns"><text>{{ paletteName }} 色号</text><text>数量</text><text>完成</text></view>
    <view v-for="item in filtered" :key="item.code" class="color-row" :class="{ highlighted: selected === item.code, completed: completed.includes(item.code) }">
      <view class="color-main" @tap="$emit('select', item.code)"><view class="color-swatch" :style="{ background: item.hex }" /><view class="color-info"><text class="color-code">{{ item.code }}</text><text v-if="paletteName !== 'MARD'" class="color-name">{{ item.name }}</text></view></view>
      <text class="color-count" @tap="$emit('select', item.code)">{{ item.count }}<text class="count-unit"> 颗</text></text>
      <button class="check-button" :aria-label="`${completed.includes(item.code) ? '取消完成' : '完成'} ${item.code}`" @tap="$emit('complete', item.code)"><view class="checkbox" :class="{ checked: completed.includes(item.code) }"><AppIcon v-if="completed.includes(item.code)" name="check" :size="26" light /></view></button>
    </view>
    <view v-if="!filtered.length" class="no-colors">未找到色号</view>
    <text class="list-footnote">点颜色高亮 · 拼完打勾</text>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import AppIcon from './AppIcon.vue'
const props = defineProps({ paletteName: { type: String, default: 'Hama' }, colors: { type: Array, default: () => [] }, selected: { type: String, default: '' }, completed: { type: Array, default: () => [] } })
defineEmits(['select', 'complete', 'copy'])
const search = ref('')
const filtered = computed(() => props.colors.filter(color => `${color.code} ${color.name}`.toLowerCase().includes(search.value.toLowerCase().trim())))
</script>

<style scoped>
.color-list { background: #fff; border: 1rpx solid #e3e8da; border-radius: 22rpx; padding: 24rpx 22rpx 22rpx; margin-top: 26rpx; }
.list-heading { display: flex; align-items: center; justify-content: space-between; }.list-title { display: block; font-size: 29rpx; font-weight: 600; }.copy-button { display: flex; gap: 7rpx; align-items: center; background: #f1f5e9; border-radius: 12rpx; padding: 12rpx 16rpx; font-size: 21rpx; line-height: 1.3; color: #758a65; }
.color-search { display: flex; align-items: center; gap: 14rpx; padding: 19rpx; background: #f5f7f0; border-radius: 14rpx; margin-top: 26rpx; }.color-search input { flex: 1; min-width: 0; font-size: 24rpx; color: #567342; }
.list-columns { display: flex; font-size: 21rpx; color: #8b9a80; padding: 22rpx 0 12rpx; }.list-columns text:first-child { flex: 1; }.list-columns text:nth-child(2) { width: 122rpx; text-align: right; }.list-columns text:last-child { width: 90rpx; text-align: right; padding-right: 10rpx; }
.color-row { display: flex; align-items: center; padding: 10rpx 0; border-top: 1rpx solid #f0f3ea; border-radius: 8rpx; min-height: 92rpx; }.color-row.highlighted { background: #f1f6e9; }.color-main { flex: 1; min-width: 0; display: flex; align-items: center; gap: 17rpx; padding: 9rpx 0; }.color-swatch { width: 52rpx; height: 52rpx; border-radius: 13rpx; border: 1rpx solid #00000012; flex-shrink: 0; }.color-info { display: flex; flex-direction: column; gap: 5rpx; }.color-code { font-size: 25rpx; font-weight: 650; }.color-name { font-size: 20rpx; color: #97a18b; }.color-count { width: 122rpx; text-align: right; font-size: 27rpx; font-weight: 600; color: #5c744a; }.count-unit { font-size: 19rpx; color: #a0aa93; font-weight: 400; }.check-button { width: 90rpx; height: 75rpx; display: flex; align-items: center; justify-content: flex-end; padding-right: 9rpx; background: transparent; }.checkbox { width: 42rpx; height: 42rpx; border: 2rpx solid #dce4d1; border-radius: 11rpx; display: flex; align-items: center; justify-content: center; }.checkbox.checked { background: #6c9158; border-color: #6c9158; }.completed .color-name { text-decoration: line-through; }.list-footnote { display: block; text-align: center; color: #8b9a80; font-size: 22rpx; padding-top: 22rpx; }.no-colors { text-align: center; color: #9ca78e; font-size: 23rpx; padding: 40rpx 0; }
</style>
