<template>
  <view class="library-page">
    <view class="library-nav" :style="{ paddingTop: nav.statusBar + 'px' }"><view class="library-nav-content" :style="{ height: nav.height + 'px', paddingRight: nav.right + 'px' }"><view class="library-brand"><BrandMark /><text>我的作品</text></view><button class="new-button" @tap="createNew"><AppIcon name="plus" :size="28" /><text>新建</text></button></view></view>
    <view class="library-content">
      <view v-if="list.length" class="library-filters"><button v-for="filter in filters" :key="filter.value" :class="{ active: activeFilter === filter.value }" @tap="activeFilter = filter.value">{{ filter.label }}<text>{{ filterCount(filter.value) }}</text></button></view>
      <view v-if="!list.length" class="empty-state"><AppIcon name="folder" :size="84" /><text class="empty-title">还没有作品</text><text class="empty-description">生成的图纸会自动保存在这里</text><button class="primary-btn" @tap="createNew">新建图纸</button></view>
      <view v-else-if="!filtered.length" class="filter-empty"><text>暂无{{ activeFilter === 'done' ? '已完成' : '进行中' }}作品</text></view>
      <view v-else class="project-list"><view v-for="item in filtered" :key="item.id" class="project-card" @tap="openPattern(item)"><view class="project-preview"><PatternThumbnail :pattern-id="item.id" :size="thumbnailSize" :canvas-id="`thumb-${item.id}`" /></view><view class="project-info"><text class="project-title">{{ item.name }}</text><text class="project-meta">{{ item.gridSize }} × {{ item.gridSize }} · {{ item.colorUsage?.length || 0 }} 色</text><view class="project-progress"><view :style="{ width: itemProgress(item) + '%' }" /></view><view class="project-bottom"><text>{{ formatDate(item.updatedAt || item.createdAt) }}</text><text>{{ isDone(item) ? '已完成' : itemProgress(item) + '%' }}</text></view></view><button class="delete-project" :aria-label="`删除${item.name}`" @tap.stop="onDelete(item)"><AppIcon name="trash" :size="28" /></button></view></view>
      <text v-if="list.length" class="storage-note">保存在本机 · 最近 20 份</text>
    </view>
  </view>
</template>

<script setup>
import { ref, shallowRef, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import BrandMark from '../../components/BrandMark.vue'
import AppIcon from '../../components/AppIcon.vue'
import PatternThumbnail from '../../components/PatternThumbnail.vue'
import { getHistory, deletePattern } from '../../utils/storage'
import { setPending, requestNewProject } from '../../utils/appState'
const info = uni.getSystemInfoSync()
const nav = { statusBar: info.statusBarHeight || 0, height: 56, right: 0 }
// #ifdef MP-WEIXIN
const capsule = uni.getMenuButtonBoundingClientRect()
nav.height = (capsule.top - nav.statusBar) * 2 + capsule.height
nav.right = info.windowWidth - capsule.left + 4
// #endif
const thumbnailSize = Math.round(Math.min(info.windowWidth, 480) * .25)
const list = shallowRef([]), activeFilter = ref('all'), opening = ref(false)
const filters = [{ value: 'all', label: '全部' }, { value: 'ongoing', label: '进行中' }, { value: 'done', label: '已完成' }]
const isDone = item => item.colorUsage?.length > 0 && item.colorUsage.every(color => (item.completedCodes || []).includes(color.code))
const completedCount = computed(() => list.value.filter(isDone).length)
const filtered = computed(() => list.value.filter(item => activeFilter.value === 'all' || (activeFilter.value === 'done' ? isDone(item) : !isDone(item))))
const filterCount = filter => filter === 'all' ? list.value.length : filter === 'done' ? completedCount.value : list.value.length - completedCount.value
onShow(() => { opening.value = false; list.value = getHistory() })
function itemProgress(item) { const total = (item.colorUsage || []).reduce((sum, color) => sum + color.count, 0); return total ? Math.round(item.colorUsage.filter(color => (item.completedCodes || []).includes(color.code)).reduce((sum, color) => sum + color.count, 0) / total * 100) : 0 }
function formatDate(ts) { const date = new Date(ts); return `${date.getMonth() + 1} 月 ${date.getDate()} 日` }
function openPattern(item) {
  if (opening.value) return
  opening.value = true
  setPending('', item.pattern, item.colorUsage, item.gridSize, { id: item.id, name: item.name, paletteName: item.paletteName || 'Hama', attribution: item.attribution })
  uni.navigateTo({ url: '/pages/result/result', fail: () => { opening.value = false; uni.showToast({ title: '打开失败，请重试', icon: 'none' }) } })
}
function createNew() { requestNewProject(); uni.switchTab({ url: '/pages/index/index' }) }
function onDelete(item) {
  uni.showModal({ title: '移除这份作品？', content: `「${item.name}」的图纸和拼豆进度将一起删除。`, confirmColor: '#8c654b', confirmText: '移除作品', success: result => {
    if (result.confirm) { try { deletePattern(item.id); list.value = getHistory() } catch { uni.showToast({ title: '移除失败，请重试', icon: 'none' }) } }
  } })
}
</script>

<style scoped>
.library-page { min-height: 100vh; }
.library-nav-content { display: flex; justify-content: space-between; align-items: center; margin: 0 32rpx; }
.library-brand { display: flex; align-items: center; gap: 14rpx; font-size: 34rpx; font-weight: 650; }
.new-button { background: transparent; display: flex; align-items: center; gap: 4rpx; color: #58784e; font-size: 25rpx; line-height: 1.4; padding: 18rpx 0 18rpx 12rpx; }
.library-content { padding: 0 32rpx 40rpx; }
.library-filters { display: flex; gap: 12rpx; margin: 24rpx 0 28rpx; }
.library-filters button { background: transparent; color: #83917b; padding: 18rpx 24rpx; border-radius: 12rpx; font-size: 25rpx; line-height: 1.4; }
.library-filters button.active { background: #285c49; color: #fff; }
.library-filters button > text { font-size: 20rpx; margin-left: 10rpx; opacity: .65; }
.project-list { display: flex; flex-direction: column; gap: 20rpx; }
.project-card { display: flex; position: relative; align-items: center; gap: 24rpx; padding: 20rpx; border: 1rpx solid #e4e9df; background: #fff; border-radius: 20rpx; }
.project-preview { overflow: hidden; flex-shrink: 0; border-radius: 14rpx; }
.project-info { flex: 1; min-width: 0; padding: 2rpx 20rpx 0 0; }
.project-title { display: block; font-size: 28rpx; font-weight: 600; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; padding-right: 28rpx; }
.project-meta { display: block; color: #82917a; font-size: 22rpx; margin-top: 10rpx; }
.project-progress { height: 6rpx; background: #eef2e8; border-radius: 4rpx; margin-top: 26rpx; overflow: hidden; }
.project-progress view { height: 100%; background: #87a574; border-radius: 4rpx; }
.project-bottom { display: flex; justify-content: space-between; font-size: 20rpx; color: #8d9b84; margin-top: 12rpx; }
.delete-project { position: absolute; top: 12rpx; right: 10rpx; height: 64rpx; width: 64rpx; background: transparent; display: flex; align-items: center; justify-content: center; }
.storage-note { display: block; text-align: center; color: #929f89; font-size: 22rpx; margin-top: 34rpx; }
.empty-state { min-height: 70vh; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
.empty-title { display: block; font-size: 34rpx; font-weight: 600; margin-top: 32rpx; }
.empty-description { display: block; color: #88977e; font-size: 25rpx; margin-top: 16rpx; }
.empty-state .primary-btn { width: 320rpx; margin-top: 42rpx; }
.filter-empty { min-height: 400rpx; display: flex; justify-content: center; align-items: center; color: #8b9981; font-size: 26rpx; }
</style>
