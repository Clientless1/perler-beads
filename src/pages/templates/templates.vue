<template>
  <view class="templates-page">
    <view class="templates-nav" :style="{ paddingTop: nav.statusBar + 'px' }"><view class="templates-nav-inner" :style="{ height: nav.height + 'px' }"><BrandMark /><text>拼豆样板</text></view></view>
    <view class="templates-content">
      <view class="gallery-intro"><view><text class="gallery-title">下一件，拼什么？</text><text class="gallery-subtitle">{{ templates.length }} 款图纸，挑喜欢的直接开拼</text></view><view class="gallery-stamp"><AppIcon name="sparkles" :size="38" /></view></view>
      <view class="search-bar"><AppIcon name="search" :size="32" /><input v-model="query" placeholder="搜索图纸" confirm-type="search" placeholder-style="color:#929e8e" /><button v-if="query" aria-label="清空搜索" @tap="query = ''"><AppIcon name="close" :size="26" /></button></view>
      <view class="collection-tabs"><button :class="{ active: collection === 'all' }" @tap="collection = 'all'">全部图纸</button><button :class="{ active: collection === 'cute' }" @tap="collection = 'cute'">可爱挂件<text>NEW</text></button></view>
      <view class="category-list"><button v-for="category in categories" :key="category" :class="{ active: activeCategory === category }" @tap="activeCategory = category">{{ category }}</button></view>
      <view class="catalog-heading"><text>{{ filtered.length }} 份图纸</text><view class="catalog-filters"><button class="beginner-filter" :class="{ active: networkOnly }" @tap="networkOnly = !networkOnly"><AppIcon v-if="networkOnly" name="check" :size="21" /><text>网络精选</text></button><button class="beginner-filter" :class="{ active: beginnerOnly }" @tap="beginnerOnly = !beginnerOnly"><AppIcon v-if="beginnerOnly" name="check" :size="21" /><text>新手</text></button></view></view>
      <view v-if="filtered.length" class="template-grid">
        <view v-for="item in visibleTemplates" :key="item.id" class="template-card" @tap="openDetail(item)">
          <view class="template-art" :style="{ backgroundColor: categoryColors[item.category] }"><image :src="item.cover" mode="aspectFit" lazy-load /><text class="pattern-size">{{ item.gridSize }} × {{ item.gridSize }}</text></view>
          <view class="template-info"><text class="template-name">{{ item.name }}</text><view class="template-summary"><text class="template-meta">{{ item.colors }} 色 · {{ item.totalBeads }} 颗</text><view class="card-arrow"><AppIcon name="arrow-right" :size="23" /></view></view></view>
        </view>
      </view>
      <button v-if="visibleTemplates.length < filtered.length" class="load-more" @tap="loadMore">加载更多</button>
      <view v-if="!filtered.length" class="empty-search"><AppIcon name="search" :size="60" /><text>没有找到图纸</text><button @tap="resetFilters">查看全部</button></view>
      <button class="source-link" @tap="creditsVisible = true">素材来源</button>
    </view>
    <view v-if="selected" class="sheet-backdrop" @tap="selected = null"><view class="bottom-sheet template-sheet" @tap.stop><view class="sheet-handle" /><view class="sheet-heading"><text class="section-title">{{ selected.name }}</text><button class="icon-button" aria-label="关闭样板预览" @tap="selected = null"><AppIcon name="close" :size="30" /></button></view><view class="detail-art" :style="{ backgroundColor: categoryColors[selected.category] }"><image :src="selected.cover" mode="aspectFit" /></view><view class="detail-meta"><text>{{ selected.gridSize }} × {{ selected.gridSize }} 格</text><text>{{ selected.colors }} 色</text><text>{{ selected.totalBeads }} 颗</text></view><view class="detail-colors"><view v-for="color in selectedColors" :key="color.code" class="detail-color" :style="{ background: color.hex }" /><text>MARD</text></view><text class="detail-board">{{ (selected.gridSize / 29) ** 2 }} 块底板 · 约 {{ (selected.gridSize * .5).toFixed(1) }} cm（5mm 豆）</text><button v-if="selected.sourceInfo" class="detail-source" @tap="copySource(selected.sourceInfo.url)">{{ selected.sourceInfo.author }} · {{ selected.sourceInfo.licenseLabel || 'CC0' }}<AppIcon name="copy" :size="22" /></button><text v-if="selected.sourceId === 'twemoji'" class="adaptation-note">图案已修改为 MARD 像素图纸 · CC BY 4.0</text><button class="primary-btn" :disabled="opening" @tap="useTemplate">{{ opening ? '正在打开…' : '使用图纸' }}<AppIcon name="arrow-right" :size="30" light /></button></view></view>
    <view v-if="creditsVisible" class="sheet-backdrop" @tap="creditsVisible = false"><view class="bottom-sheet" @tap.stop><view class="sheet-handle" /><view class="sheet-heading"><text class="section-title">素材来源</text><button class="icon-button" aria-label="关闭素材来源" @tap="creditsVisible = false"><AppIcon name="close" :size="30" /></button></view><text class="credits-copy">网络素材采用 CC0 或 CC BY 4.0 许可，已转换为 MARD 图纸。下载量指素材集，记录于 2026-11-03。</text><view v-for="source in sources" :key="source.id" class="credit-source"><text>{{ source.title }}</text><text>{{ source.author }} · {{ source.licenseLabel || 'CC0' }}</text><text v-if="source.downloads">{{ source.downloads.toLocaleString() }} 次下载</text><text v-if="source.id === 'twemoji'">原图已修改：像素化、透明边缘处理与 MARD 配色</text><button @tap="copySource(source.url)">复制来源链接</button><button v-if="source.id === 'twemoji'" @tap="copySource(source.licenseUrl)">复制许可链接</button></view><view class="credit-source"><text>16x16 Food · 87 份</text><text>ARoachIFoundOnMyPillow · CC0</text><button @tap="copySource()">复制来源链接</button></view><text class="credits-copy">另有 41 份豆物原创图案。</text></view></view>
  </view>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { onShow, onHide, onReachBottom } from '@dcloudio/uni-app'
import AppIcon from '../../components/AppIcon.vue'
import BrandMark from '../../components/BrandMark.vue'
import { TEMPLATES, TEMPLATE_CATEGORIES, TEMPLATE_SOURCES, getTemplatePattern } from '../../utils/templates'
import { setPending } from '../../utils/appState'
const info = uni.getSystemInfoSync(), nav = { statusBar: info.statusBarHeight || 0, height: 56 }
// #ifdef MP-WEIXIN
const capsule = uni.getMenuButtonBoundingClientRect()
nav.height = (capsule.top - nav.statusBar) * 2 + capsule.height
// #endif
const templates = TEMPLATES, categories = TEMPLATE_CATEGORIES, sources = TEMPLATE_SOURCES
const collection = ref('all')
const categoryColors = { 动物: '#f4ebe5', 花草: '#f4eddf', 游戏: '#ebedf4', 水果: '#f7ebe6', 食物: '#f2eddf', 甜点: '#f5e9ec', 表情: '#f8f0d9', 小物: '#eaf0ed' }
const query = ref(''), activeCategory = ref('全部'), beginnerOnly = ref(false), networkOnly = ref(false), selected = ref(null), opening = ref(false), creditsVisible = ref(false)
const filtered = computed(() => templates.filter(item => (collection.value === 'all' || item.sourceId === 'twemoji') && (activeCategory.value === '全部' || item.category === activeCategory.value) && (!networkOnly.value || item.sourceInfo) && (!beginnerOnly.value || item.totalBeads <= 240) && `${item.name} ${item.category} ${item.difficulty} ${item.tags || ''}`.includes(query.value.trim())))
const visibleCount = ref(24)
const visibleTemplates = computed(() => filtered.value.slice(0, visibleCount.value))
watch([query, collection, activeCategory, beginnerOnly, networkOnly], () => { visibleCount.value = 24 })
watch(collection, () => { activeCategory.value = '全部' })
function loadMore() { visibleCount.value = Math.min(visibleCount.value + 24, filtered.value.length) }
onReachBottom(loadMore)
const selectedColors = computed(() => selected.value ? getTemplatePattern(selected.value.id).colorUsage : [])
const modalOpen = computed(() => !!selected.value || creditsVisible.value)
let pageVisible = false
function updateTabBar(hidden) {
  // Navigation can finish before a modal watcher runs; the destination has no tabbar.
  const options = { animation: false, fail: () => {} }
  if (hidden) uni.hideTabBar(options)
  else uni.showTabBar(options)
}
watch(modalOpen, visible => { if (pageVisible) updateTabBar(visible) })
onShow(() => { pageVisible = true; opening.value = false; updateTabBar(modalOpen.value) })
onHide(() => { pageVisible = false; updateTabBar(false) })
function openDetail(item) { selected.value = item; opening.value = false }
function resetFilters() { query.value = ''; collection.value = 'all'; activeCategory.value = '全部'; beginnerOnly.value = false; networkOnly.value = false }
function useTemplate() {
  if (!selected.value || opening.value) return
  const template = getTemplatePattern(selected.value.id)
  if (!template) return
  opening.value = true
  setPending('', template.pattern, template.colorUsage, template.gridSize, { name: template.name, paletteName: template.paletteName, attribution: template.attribution })
  uni.navigateTo({ url: '/pages/result/result', success: () => { selected.value = null; opening.value = false }, fail: () => { opening.value = false; uni.showToast({ title: '打开失败，请重试', icon: 'none' }) } })
}
function copySource(url = 'https://opengameart.org/content/16x16-food') { uni.setClipboardData({ data: url }) }
</script>

<style scoped>
.templates-page { min-height: 100vh; padding-bottom: 32rpx; background: #faf9f5; }
.templates-nav-inner { display: flex; align-items: center; gap: 14rpx; margin: 0 32rpx; }
.templates-nav-inner > text { font-size: 34rpx; font-weight: 650; }
.templates-content { padding: 0 32rpx; }
.gallery-intro { display: flex; align-items: center; justify-content: space-between; margin: 20rpx 0 28rpx; }.gallery-title { display: block; font-size: 43rpx; font-weight: 700; letter-spacing: -1rpx; }.gallery-subtitle { display: block; margin-top: 12rpx; font-size: 23rpx; color: #929789; }.gallery-stamp { height: 74rpx; width: 74rpx; border-radius: 24rpx; background: #f2e7bb; display: flex; align-items: center; justify-content: center; transform: rotate(8deg); }
.search-bar { display: flex; align-items: center; gap: 14rpx; border: 1rpx solid #eaeae2; border-radius: 20rpx; background: #fff; padding: 22rpx; }
.search-bar input { font-size: 26rpx; color: #38533e; flex: 1; min-width: 0; height: 40rpx; }
.search-bar button { display: flex; background: transparent; padding: 0 5rpx; }
.collection-tabs { display: flex; gap: 36rpx; margin: 26rpx 0 18rpx; border-bottom: 1rpx solid #e8e8e0; }.collection-tabs button { position: relative; display: flex; align-items: center; gap: 10rpx; background: transparent; color: #979b90; font-size: 28rpx; padding: 16rpx 0 24rpx; line-height: 1.3; }.collection-tabs button.active { color: #263d32; font-weight: 650; }.collection-tabs button.active::before { content: ''; position: absolute; bottom: -1rpx; left: 0; width: 46rpx; height: 5rpx; border-radius: 3rpx; background: #285c49; }.collection-tabs button > text { color: #b78840; background: #f4e9cc; border-radius: 6rpx; padding: 4rpx 6rpx; font-size: 14rpx; letter-spacing: 1rpx; }
.category-list { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10rpx; margin: 18rpx 0 12rpx; }
.category-list button { padding: 16rpx 0; font-size: 23rpx; line-height: 1.3; border-radius: 12rpx; background: transparent; color: #8a9282; }
.category-list button.active { background: #e7eee5; color: #285c49; font-weight: 650; }
.catalog-heading { display: flex; align-items: center; justify-content: space-between; margin: 12rpx 0 22rpx; color: #9a9e91; font-size: 21rpx; }
.catalog-filters { display: flex; align-items: center; gap: 10rpx; }
.beginner-filter { display: flex; align-items: center; gap: 6rpx; padding: 11rpx 16rpx; color: #8b9481; border: 1rpx solid #e5e8df; border-radius: 11rpx; background: transparent; line-height: 1.3; font-size: 21rpx; }
.beginner-filter.active { color: #285c49; background: #eaf0e5; border-color: #cedcc9; }
.template-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 28rpx 20rpx; }
.template-card { min-width: 0; background: transparent; }
.template-art { height: 306rpx; background: #eef1e8; position: relative; border-radius: 24rpx; overflow: hidden; }
.pattern-size { position: absolute; right: 13rpx; top: 13rpx; color: #808875; background: #fffdf6ce; border-radius: 8rpx; padding: 7rpx 9rpx; font-size: 18rpx; }
.template-art image { width: 100%; height: 100%; padding: 16rpx; }
.template-info { padding: 16rpx 4rpx 0; }
.template-name { font-size: 27rpx; font-weight: 600; display: block; white-space: nowrap; text-overflow: ellipsis; overflow: hidden; }
.template-summary { display: flex; align-items: center; justify-content: space-between; gap: 8rpx; margin-top: 7rpx; }.card-arrow { width: 38rpx; height: 38rpx; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: #eaf0e5; }
.template-meta { display: block; color: #989e8f; font-size: 21rpx; white-space: nowrap; }
.source-link { margin: 24rpx auto 0; background: transparent; color: #8b9883; font-size: 22rpx; padding: 20rpx; }
.load-more { margin: 28rpx auto 0; background: #eaf0e4; color: #5d7751; border-radius: 12rpx; padding: 20rpx 48rpx; font-size: 25rpx; line-height: 1.4; }
.empty-search { min-height: 450rpx; display: flex; justify-content: center; align-items: center; flex-direction: column; gap: 28rpx; color: #87967d; font-size: 28rpx; }
.empty-search button { border-radius: 12rpx; background: #e9f0e3; padding: 18rpx 36rpx; line-height: 1.4; color: #567448; font-size: 25rpx; }
.template-sheet .sheet-heading { margin-bottom: 20rpx; }
.detail-art { height: 320rpx; background: #eef1e8; border-radius: 18rpx; display: flex; justify-content: center; align-items: center; }
.detail-art image { width: 340rpx; height: 340rpx; }
.detail-meta { display: flex; justify-content: space-around; margin: 28rpx 0 24rpx; font-size: 26rpx; }
.detail-colors { display: flex; align-items: center; flex-wrap: wrap; gap: 8rpx; }
.detail-color { height: 26rpx; width: 26rpx; border-radius: 6rpx; border: 1rpx solid #00000010; }
.detail-colors > text { margin-left: auto; color: #829376; font-size: 22rpx; }
.detail-board { display: block; color: #87957b; font-size: 23rpx; margin: 24rpx 0 30rpx; }
.detail-source { background: transparent; color: #87957b; font-size: 21rpx; line-height: 1.5; display: flex; align-items: center; gap: 12rpx; text-align: left; margin: -8rpx 0 24rpx; padding: 8rpx 0; }
.adaptation-note { display: block; font-size: 18rpx; line-height: 1.5; color: #9ca38e; margin: -15rpx 0 24rpx; }
.credit-source { margin-bottom: 28rpx; padding-bottom: 24rpx; border-bottom: 1rpx solid #e3e9dd; }
.credit-source > text { display: block; font-size: 25rpx; line-height: 1.6; }
.credit-source > text:not(:first-child) { color: #819474; font-size: 22rpx; margin-top: 8rpx; }
.credit-source button { background: transparent; color: #43663a; padding: 16rpx 0 0; font-size: 23rpx; line-height: 1.4; }
.credits-copy { display: block; font-size: 25rpx; color: #7d8f70; line-height: 1.9; margin-bottom: 30rpx; }
</style>
