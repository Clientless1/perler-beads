<template>
  <view class="library-page">
    <view class="library-nav" :style="{ paddingTop: nav.statusBar + 'px' }"><view class="library-nav-content" :style="{ height: nav.height + 'px', paddingRight: nav.right + 'px' }"><view class="library-brand"><text>作品</text></view><button class="new-button" @tap="createNew"><AppIcon name="plus" :size="28" /><text>新建</text></button></view></view>
    <view class="library-content"><view class="cloud-library-bar"><text>{{ cloudSession.user ? cloudSession.user.nickname + " 的云端作品" : "本机作品 · 登录后可迁移到云端" }}</text><button @tap="openAccount">{{ cloudSession.user ? "查看账号 →" : "登录云端 →" }}</button></view><view v-if="cloudError" class="cloud-error">{{cloudError}}<button @tap="reloadHistory">重试</button></view>
      <view v-if="list.length" class="library-filters"><button v-for="filter in filters" :key="filter.value" :class="{ active: activeFilter === filter.value }" @tap="activeFilter = filter.value">{{ filter.label }}<text>{{ filterCount(filter.value) }}</text></button></view>
      <view v-if="loading && !list.length" class="history-loading">正在整理你的作品…</view>
      <view v-else-if="!list.length" class="empty-state"><AppIcon name="folder" :size="84" /><text class="empty-title">{{ cloudSession.user ? "开始你的第一份作品" : "把喜欢的作品，存起来" }}</text><text class="empty-description">{{ cloudSession.user ? "做一张图纸，下次从这里继续" : "登录后保存图纸、同步拼豆进度" }}</text><button class="primary-btn" @tap="cloudSession.user ? createNew() : openAccount()">{{ cloudSession.user ? "选择照片" : "登录保存作品" }}</button><button v-if="!cloudSession.user" class="guest-create" @tap="createNew">先做一张图纸</button></view>
      <view v-else-if="!filtered.length" class="filter-empty"><text>暂无{{ activeFilter === 'done' ? '已完成' : '进行中' }}作品</text></view>
      <view v-else class="project-list"><view v-for="item in filtered" :key="item.id" class="project-card" @tap="openPattern(item)"><view class="project-preview"><PatternThumbnail :pattern-id="item.id" :size="thumbnailSize" :canvas-id="`thumb-${item.id}`" /></view><view class="project-info"><text class="project-title">{{ item.name }}</text><text class="project-meta">{{ item.gridSize }} × {{ item.gridSize }} · {{ item.colorUsage?.length || 0 }} 色</text><view class="project-progress"><view :style="{ width: itemProgress(item) + '%' }" /></view><view class="project-bottom"><text>{{ formatDate(item.updatedAt || item.createdAt) }}</text><text>{{ isDone(item) ? '已完成' : itemProgress(item) + '%' }}</text></view></view><button class="delete-project" :aria-label="`删除${item.name}`" @tap.stop="onDelete(item)"><AppIcon name="trash" :size="28" /></button></view></view>
      <button v-if="list.length < cloudTotal" class="secondary-btn" @tap="loadMoreCloud">加载更多作品</button><text v-if="list.length" class="storage-note">{{cloudSession.user?'保存在云端':'保存在本机'}} · {{list.length}} / {{cloudSession.user?cloudTotal:20}} 份</text>
    </view>
  </view>
</template>

<script setup>
import { ref, shallowRef, computed, watch } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import BrandMark from '../../components/BrandMark.vue'
import AppIcon from '../../components/AppIcon.vue'
import PatternThumbnail from '../../components/PatternThumbnail.vue'
import { getHistory, deletePattern } from '../../utils/storage'
import { listCloudWorks, deleteCloudWork } from '../../utils/cloudWorks'
import { cloudSession, isLoggedIn } from '../../utils/cloud'
import { setPending, requestNewProject } from '../../utils/appState'
const info = uni.getSystemInfoSync()
const nav = { statusBar: info.statusBarHeight || 0, height: 56, right: 0 }
// #ifdef MP-WEIXIN
const capsule = uni.getMenuButtonBoundingClientRect()
nav.height = (capsule.top - nav.statusBar) * 2 + capsule.height
nav.right = info.windowWidth - capsule.left + 4
// #endif
const thumbnailSize = Math.round(Math.min(info.windowWidth, 480) * .25)
const cloudError = ref(''), cloudTotal = ref(0), loading = ref(false)
const list = shallowRef([]), activeFilter = ref('all'), opening = ref(false)
let loadRevision=0
watch(()=>cloudSession.user?.id,()=>{loadRevision++;list.value=[];cloudTotal.value=0;cloudError.value='';opening.value=false;loading.value=false})
const filters = [{ value: 'all', label: '全部' }, { value: 'ongoing', label: '进行中' }, { value: 'done', label: '已完成' }]
const isDone = item => item.colorUsage?.length > 0 && item.colorUsage.every(color => (item.completedCodes || []).includes(color.code))
const completedCount = computed(() => list.value.filter(isDone).length)
const filtered = computed(() => list.value.filter(item => activeFilter.value === 'all' || (activeFilter.value === 'done' ? isDone(item) : !isDone(item))))
const filterCount = filter => filter === 'all' ? list.value.length : filter === 'done' ? completedCount.value : list.value.length - completedCount.value
async function reloadHistory() { const current=++loadRevision;cloudError.value = ''; if (!isLoggedIn()) { list.value=getHistory(); cloudTotal.value=0;loading.value=false;return } loading.value=true; try { const data = await listCloudWorks();if(current!==loadRevision)return;list.value = data.items; cloudTotal.value=data.total } catch(e) {if(current===loadRevision)cloudError.value=e.message } finally {if(current===loadRevision)loading.value=false } }
async function loadMoreCloud() { if(loading.value||!isLoggedIn())return;const current=loadRevision;loading.value=true;cloudError.value='';try { const data=await listCloudWorks(list.value.length);if(current!==loadRevision)return;const ids=new Set(list.value.map(item=>item.id));list.value=[...list.value,...data.items.filter(item=>!ids.has(item.id))]; cloudTotal.value=data.total } catch(e) {if(current===loadRevision)cloudError.value=e.message }finally{if(current===loadRevision)loading.value=false} }
function openAccount() { if(isLoggedIn())uni.switchTab({url:'/pages/profile/profile'});else uni.navigateTo({url:'/member/account/account'}) }
onShow(() => { opening.value = false; reloadHistory() })
function itemProgress(item) { const total = (item.colorUsage || []).reduce((sum, color) => sum + color.count, 0); return total ? Math.round(item.colorUsage.filter(color => (item.completedCodes || []).includes(color.code)).reduce((sum, color) => sum + color.count, 0) / total * 100) : 0 }
function formatDate(ts) { const date = new Date(ts); return `${date.getMonth() + 1} 月 ${date.getDate()} 日` }
function openPattern(item) {
  if (opening.value) return
  opening.value = true
  setPending('', item.pattern, item.colorUsage, item.gridSize, { ...item, id: item.id, templateId: item.templateId, name: item.name, paletteName: item.paletteName || 'Hama', attribution: item.attribution })
  uni.navigateTo({ url: '/pages/result/result', fail: () => { opening.value = false; uni.showToast({ title: '打开失败，请重试', icon: 'none' }) } })
}
function createNew() { requestNewProject(); uni.switchTab({ url: '/pages/index/index' }) }
function onDelete(item) {
  uni.showModal({ title: '移除这份作品？', content: '图纸和拼豆进度将一起删除。', confirmColor: '#8c654b', confirmText: '移除作品', success: async result => {
    if (result.confirm) { try { if(item.id.startsWith('pattern_'))deletePattern(item.id);else await deleteCloudWork(item); await reloadHistory() } catch { uni.showToast({ title: '移除失败，请重试', icon: 'none' }) } }
  } })
}
</script>

<style scoped>
.cloud-library-bar{display:flex;align-items:center;justify-content:space-between;gap:16rpx;background:#eeebe4;padding:20rpx;border-radius:14rpx;font-size:22rpx;margin:18rpx 0}.cloud-library-bar text{color:#868686}.cloud-library-bar button{background:transparent;color:#5e5e5e;font-size:22rpx;line-height:1.5}.cloud-error{padding:20rpx;color:#b08c60;font-size:23rpx}.cloud-error button{background:transparent;color:#5e5e5e;font-size:23rpx}

.library-page { min-height: 100vh; }
.library-nav-content { display: flex; justify-content: space-between; align-items: center; margin: 0 32rpx; }
.library-brand { display: flex; align-items: center; gap: 14rpx; font-size: 34rpx; font-weight: 650; }
.new-button { background: transparent; display: flex; align-items: center; gap: 4rpx; color: #636363; font-size: 25rpx; line-height: 1.4; padding: 18rpx 0 18rpx 12rpx; }
.library-content { padding: 0 32rpx 40rpx; }
.library-filters { display: flex; gap: 12rpx; margin: 24rpx 0 28rpx; }
.library-filters button { background: transparent; color: #868686; padding: 18rpx 24rpx; border-radius: 12rpx; font-size: 25rpx; line-height: 1.4; }
.library-filters button.active { background: #242321; color: #fff; }
.library-filters button > text { font-size: 20rpx; margin-left: 10rpx; opacity: .65; }
.project-list { display: flex; flex-direction: column; gap: 20rpx; }
.project-card { display: flex; position: relative; align-items: center; gap: 24rpx; padding: 20rpx; border: 1rpx solid #e9e6df; background: #fff; border-radius: 20rpx; }
.project-preview { overflow: hidden; flex-shrink: 0; border-radius: 14rpx; }
.project-info { flex: 1; min-width: 0; padding: 2rpx 20rpx 0 0; }
.project-title { display: block; font-size: 28rpx; font-weight: 600; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; padding-right: 28rpx; }
.project-meta { display: block; color: #868686; font-size: 22rpx; margin-top: 10rpx; }
.project-progress { height: 6rpx; background: #f1efe9; border-radius: 4rpx; margin-top: 26rpx; overflow: hidden; }
.project-progress view { height: 100%; background: #8c8c8c; border-radius: 4rpx; }
.project-bottom { display: flex; justify-content: space-between; font-size: 20rpx; color: #909090; margin-top: 12rpx; }
.delete-project { position: absolute; top: 12rpx; right: 10rpx; height: 64rpx; width: 64rpx; background: transparent; display: flex; align-items: center; justify-content: center; }
.storage-note { display: block; text-align: center; color: #949494; font-size: 22rpx; margin-top: 34rpx; }
.empty-state { min-height: 70vh; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
.empty-title { display: block; font-size: 34rpx; font-weight: 600; margin-top: 32rpx; }
.empty-description { display: block; color: #8b8b8b; font-size: 25rpx; margin-top: 16rpx; }
.empty-state .primary-btn { width: 320rpx; margin-top: 42rpx; }
.filter-empty { min-height: 400rpx; display: flex; justify-content: center; align-items: center; color: #8d8d8d; font-size: 26rpx; }

.library-nav-content { margin:0 36rpx; }.library-brand { font-size:46rpx; font-weight:700; }.new-button { border-radius:16rpx; color:#242321; font-size:25rpx; min-height:84rpx; }.library-content { padding:0 36rpx 40rpx; }.cloud-library-bar { background:transparent; padding:8rpx 0; margin:0 0 18rpx; }.cloud-library-bar text { color:#909090; }.cloud-library-bar button { padding:20rpx 0; }.empty-state { min-height:62vh; }.empty-title { font-size:34rpx; }.empty-description { font-size:25rpx; color:#929292; }.guest-create { background:transparent; color:#666666; font-size:25rpx; padding:30rpx; }.history-loading { padding:180rpx 0; text-align:center; color:#909090; font-size:25rpx; }
.library-filters { gap:8rpx; margin:16rpx 0 24rpx; }.library-filters button { border-radius:16rpx; padding:20rpx 24rpx; }.project-card { border:0; border-radius:26rpx; padding:22rpx; }.project-preview { border-radius:18rpx; }.project-title { font-size:28rpx; }.project-progress { height:8rpx; margin-top:24rpx; }.delete-project { width:80rpx; height:80rpx; right:0; top:0; }
</style>
