<template>
  <view class="templates-page">
    <view class="templates-nav" :style="{ paddingTop: nav.statusBar + 'px' }"><view class="templates-nav-inner" :style="{ height: nav.height + 'px' }"><text>灵感库</text><text class="gallery-wordmark">FIND YOUR NEXT</text></view></view>
    <view class="templates-content">
      <view v-if="cloudError" class="cloud-catalog-error">{{cloudError}}<button @tap="loadCatalog">重试</button></view><view class="gallery-intro"><text>下一颗，拼点什么？</text><text>挑一份喜欢的，直接开始</text></view><view class="gallery-collections"><button @tap="chooseCollection('治愈萌宠')"><text>软萌治愈</text><text>猫猫、兔兔与小动物</text></button><button @tap="chooseCollection('甜品小物')"><text>甜一点的日常</text><text>小挂件，也有大快乐</text></button></view>
      <view class="search-bar"><AppIcon name="search" :size="32" /><input v-model="query" placeholder="搜索图纸" confirm-type="search" placeholder-style="color:#969696" /><button v-if="query" aria-label="清空搜索" @tap="query = ''"><AppIcon name="close" :size="26" /></button></view>
      <scroll-view scroll-x class="theme-scroll"><view class="collection-tabs"><button v-for="theme in themes" :key="theme.id" :class="{active:collection===theme.id}" @tap="collection=theme.id">{{theme.title}}<text v-if="theme.id==='new'">NEW</text></button></view></scroll-view>
      <view class="catalog-heading"><text>{{ activeCategory === '全部' ? '全部图纸' : activeCategory }}<text class="catalog-count"> {{ total }}</text></text><button class="filter-button" :class="{ applied: beginnerOnly || activeCategory !== '全部' || sortIndex !== 0 }" @tap="filtersVisible = true">筛选<text v-if="beginnerOnly || activeCategory !== '全部' || sortIndex !== 0" class="filter-dot" /><AppIcon name="chevron" :size="22" /></button></view>
      <view v-if="loading&&!templates.length" class="skeleton-grid"><view v-for="n in 4" :key="n"/></view>
      <view v-if="templates.length" class="template-grid">
        <view v-for="item in templates" :key="item.id" class="template-card" @tap="openDetail(item)">
          <view class="template-art" :style="{ backgroundColor: categoryColors[item.category] }"><image :src="item.cover" mode="aspectFit" lazy-load /><button class="save-heart" :class="{saved:favoriteIds.includes(item.id)}" :aria-label="favoriteIds.includes(item.id)?'取消收藏':'收藏图纸'" @tap.stop="toggleFavorite(item)">{{favoriteIds.includes(item.id)?'♥':'♡'}}</button><text class="pattern-size">{{ item.gridSize }} × {{ item.gridSize }}</text></view>
          <view class="template-info"><text class="template-name">{{ item.name }}</text><view class="template-summary"><text class="template-meta">{{ item.colors }} 色 · {{ item.totalBeads }} 颗</text><text class="difficulty-chip">{{item.totalBeads<=350?'新手友好':'细节满满'}}</text></view></view>
        </view>
      </view>
      <button v-if="templates.length<total" class="load-more" :disabled="loading" @tap="loadMore">{{loading?'正在找更多灵感…':'加载更多图纸'}}</button><text v-else-if="templates.length" class="end-note">灵感先收藏，喜欢就开拼</text>
      <view v-if="!loading&&!templates.length&&!cloudError" class="empty-search"><AppIcon name="search" :size="60" /><text>{{collection==='favorites'&&!cloudSession.user?'登录后，收藏喜欢的图纸':collection==='favorites'?'把喜欢的图纸收藏在这里':'换个词，找找新灵感'}}</text><button v-if="collection==='favorites'&&!cloudSession.user" @tap="requireLogin">登录查看收藏</button><button @tap="resetFilters">查看全部</button></view>
      <button class="source-link" @tap="creditsVisible = true">素材来源</button>
    </view>
    <view v-if="filtersVisible" class="sheet-backdrop" @tap="filtersVisible = false"><view class="bottom-sheet" @tap.stop><view class="sheet-handle" /><view class="sheet-heading"><text class="section-title">找什么图纸？</text><button class="icon-button" aria-label="关闭筛选" @tap="filtersVisible = false"><AppIcon name="close" :size="30" /></button></view><text class="filter-label">分类</text><view class="category-list"><button v-for="category in categories" :key="category" :class="{ active: activeCategory === category }" @tap="activeCategory = category">{{ category }}</button></view><text class="filter-label">排序</text><view class="filter-sorts"><button v-for="(option, i) in sortOptions" :key="option.id" :class="{active:sortIndex===i}" @tap="sortIndex=i">{{option.title}}</button></view><view class="filter-switch"><view><text>适合新手</text><text>少量用豆，轻松完成</text></view><switch :checked="beginnerOnly" color="#242321" @change="beginnerOnly=$event.detail.value" /></view><view class="filter-actions"><button class="secondary-btn" @tap="resetFilters">重置</button><button class="primary-btn" @tap="filtersVisible=false">查看 {{ total }} 份图纸</button></view></view></view>
    <view v-if="selected" class="sheet-backdrop" @tap="selected = null"><view class="bottom-sheet template-sheet" @tap.stop><view class="sheet-handle" /><view class="sheet-heading"><text class="section-title">{{ selected.name }}</text><button class="icon-button" aria-label="关闭样板预览" @tap="selected = null"><AppIcon name="close" :size="30" /></button></view><view class="detail-art" :style="{ backgroundColor: categoryColors[selected.category] }"><image :src="selected.cover" mode="aspectFit" /></view><view class="detail-meta"><text>{{ selected.gridSize }} × {{ selected.gridSize }} 格</text><text>{{ selected.colors }} 色</text><text>{{ selected.totalBeads }} 颗</text></view><view class="detail-colors"><view v-for="color in selectedColors" :key="color.code" class="detail-color" :style="{ background: color.hex }" /><text>MARD</text></view><text class="detail-board">{{ Math.ceil(selected.gridSize / 29) ** 2 }} 块底板 · 约 {{ (selected.gridSize * .5).toFixed(1) }} cm（5mm 豆）</text><button v-if="selected.sourceInfo" class="detail-source" @tap="copySource(selected.sourceInfo.url)">{{ selected.sourceInfo.author }} · {{ selected.sourceInfo.licenseLabel || selected.sourceInfo.license }}<AppIcon name="copy" :size="22" /></button><text v-if="selected.sourceId === 'twemoji'" class="adaptation-note">图案已修改为 MARD 像素图纸 · CC BY 4.0</text><view v-if="detailError" class="detail-error">{{detailError}}<button @tap="openDetail(selected)">重试</button></view><view class="detail-actions"><button class="favorite-action" @tap="toggleFavorite(selected)">{{favoriteIds.includes(selected.id)?'♥ 已收藏':'♡ 收藏'}}</button><button class="primary-btn" :disabled="opening||detailLoading||(!selectedPattern&&!selected.premium)" @tap="useTemplate">{{ detailLoading?'正在准备…':opening?'正在打开…':!selectedPattern&&!selected.premium?'请重试加载':selected.premium?'Pro 图纸 · 开始制作':'开始制作' }}<AppIcon name="arrow-right" :size="30" light /></button></view></view></view>
    <view v-if="creditsVisible" class="sheet-backdrop" @tap="creditsVisible = false"><view class="bottom-sheet" @tap.stop><view class="sheet-handle" /><view class="sheet-heading"><text class="section-title">素材来源</text><button class="icon-button" aria-label="关闭素材来源" @tap="creditsVisible = false"><AppIcon name="close" :size="30" /></button></view><text class="credits-copy">网络素材采用 CC0、CC BY 4.0 或 Apache 2.0 许可，已转换为 MARD 图纸。每份改编图纸保留原作者与许可。</text><view v-for="source in sources" :key="source.id" class="credit-source"><text>{{ source.title }}</text><text>{{ source.author }} · {{ source.licenseLabel || source.license }}</text><text v-if="source.downloads">{{ source.downloads.toLocaleString() }} 次下载</text><text v-if="source.id === 'twemoji'">原图已修改：像素化、透明边缘处理与 MARD 配色</text><button @tap="copySource(source.url)">复制来源链接</button><button v-if="source.licenseUrl" @tap="copySource(source.licenseUrl)">复制许可链接</button></view><view class="credit-source"><text>16x16 Food · 87 份</text><text>ARoachIFoundOnMyPillow · CC0</text><button @tap="copySource()">复制来源链接</button></view><text class="credits-copy">另有豆物原创图案。生活灵感与精细萌物仅存云端。Noto SVG 固定版本，原图与校验值保留在后端。</text></view></view>
  </view>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { onShow, onHide, onReachBottom } from '@dcloudio/uni-app'
import AppIcon from '../../components/AppIcon.vue'
import BrandMark from '../../components/BrandMark.vue'
import { TEMPLATE_CATEGORIES } from '../../utils/templates'
import { request, assetUrl, requireLogin, cloudSession } from '../../utils/cloud'
import { setPending } from '../../utils/appState'
const info=uni.getSystemInfoSync(),nav={statusBar:info.statusBarHeight||0,height:56}
// #ifdef MP-WEIXIN
const capsule=uni.getMenuButtonBoundingClientRect();nav.height=(capsule.top-nav.statusBar)*2+capsule.height
// #endif
const templates=ref([]),categories=TEMPLATE_CATEGORIES,sources=ref([]),cloudError=ref(''),selectedPattern=ref(null),total=ref(0),loading=ref(false),discovery=ref({}),favoriteIds=ref([]),favoriteBusy=ref('')
const themes=[{id:'all',title:'精选'},{id:'new',title:'上新'},{id:'cute',title:'萌趣'},{id:'original',title:'原创'},{id:'favorites',title:'收藏'}]
const sortOptions=[{id:'recommended',title:'精选排序'},{id:'beads',title:'颗数从少到多'},{id:'colors',title:'颜色从少到多'},{id:'latest',title:'最近更新'}],sortIndex=ref(0)
const collection=ref('all'),query=ref(''),activeCategory=ref('全部'),beginnerOnly=ref(false),selected=ref(null),opening=ref(false),creditsVisible=ref(false),filtersVisible=ref(false),detailLoading=ref(false),detailError=ref('')
const categoryColors={动物:'#f4ebe5',花草:'#f4eddf',游戏:'#ebedf4',水果:'#f7ebe6',食物:'#f2eddf',甜点:'#f5e9ec',表情:'#f8f0d9',小物:'#f0eeea'}
let revision=0,detailRevision=0,timer,pageVisible=false
async function loadCatalog(reset=true){
  if(!reset&&loading.value)return
  const current=++revision;if(reset){templates.value=[];total.value=0}loading.value=true;cloudError.value=''
  try{
    if(collection.value==='favorites'&&!cloudSession.user){loading.value=false;return}
    const params=`limit=24&offset=${reset?0:templates.value.length}&q=${encodeURIComponent(query.value.trim())}&theme=${collection.value}&category=${encodeURIComponent(activeCategory.value)}&beginner=${beginnerOnly.value}&sort=${sortOptions[sortIndex.value].id}`
    const data=await request((collection.value==='favorites'?'/me/favorites?':'/catalog/templates?')+params)
    if(current!==revision)return
    templates.value=[...(reset?[]:templates.value),...data.items.map(item=>({...item,cover:assetUrl(item.cover)}))];total.value=data.total
  }catch(e){if(current===revision)cloudError.value=e.message}finally{if(current===revision)loading.value=false}
}
watch([collection,activeCategory,beginnerOnly,sortIndex],()=>loadCatalog())
watch(query,()=>{clearTimeout(timer);timer=setTimeout(()=>loadCatalog(),300)})
watch(()=>cloudSession.user?.id,()=>{favoriteIds.value=[];detailRevision++;selected.value=null;selectedPattern.value=null;detailLoading.value=false;detailError.value='';if(collection.value==='favorites')loadCatalog()})
function loadMore(){if(templates.value.length<total.value)loadCatalog(false)}
onReachBottom(loadMore)
const selectedColors=computed(()=>selectedPattern.value?.colorUsage||[]),modalOpen=computed(()=>!!selected.value||creditsVisible.value||filtersVisible.value)
function updateTabBar(hidden){const options={animation:false,fail:()=>{}};if(hidden)uni.hideTabBar(options);else uni.showTabBar(options)}
watch(modalOpen,visible=>{if(pageVisible)updateTabBar(visible)})
onShow(async()=>{pageVisible=true;opening.value=false;updateTabBar(modalOpen.value);const view=uni.getStorageSync('douwu_discovery_view');if(view){uni.removeStorageSync('douwu_discovery_view');collection.value=view}loadCatalog();try{const [d,s]=await Promise.all([request('/catalog/discovery'),request('/catalog/sources')]);discovery.value=d;sources.value=s;if(cloudSession.user)favoriteIds.value=await request('/me/favorite-ids')}catch(e){cloudError.value=e.message}})
onHide(()=>{pageVisible=false;clearTimeout(timer);updateTabBar(false)})
async function openDetail(item){const current=++detailRevision;selected.value=item;selectedPattern.value=null;opening.value=false;detailError.value='';detailLoading.value=true;try{const data=await request(`/catalog/templates/${item.id}`);if(current===detailRevision&&selected.value?.id===item.id)selectedPattern.value=data}catch(e){if(current===detailRevision){detailError.value=e.code==='PRO_REQUIRED'?'这份图纸需要 Pro 权益，可前往「我的」查看套餐。':e.message}}finally{if(current===detailRevision)detailLoading.value=false}}
async function toggleFavorite(item){if(favoriteBusy.value||!requireLogin())return;const owner=cloudSession.user.id;favoriteBusy.value=item.id;try{const exists=favoriteIds.value.includes(item.id);await request('/me/favorites/'+item.id,{method:exists?'DELETE':'PUT'});if(owner!==cloudSession.user?.id)return;favoriteIds.value=exists?favoriteIds.value.filter(id=>id!==item.id):[...favoriteIds.value,item.id];uni.showToast({title:exists?'已取消收藏':'已加入我的收藏',icon:'none'});if(collection.value==='favorites')loadCatalog()}catch(e){uni.showToast({title:e.message,icon:'none'})}finally{favoriteBusy.value=''}}
function resetFilters(){query.value='';collection.value='all';activeCategory.value='全部';beginnerOnly.value=false;sortIndex.value=0;loadCatalog()}
function useTemplate(){if(!selected.value||opening.value)return;if(!selectedPattern.value){if(selected.value.premium)uni.navigateTo({url:'/member/account/account?section=membership'});return}const t=selectedPattern.value;opening.value=true;setPending('',t.pattern,t.colorUsage,t.gridSize,{templateId:t.templateId,name:t.name,paletteName:t.paletteName,attribution:t.attribution});uni.navigateTo({url:'/pages/result/result',success:()=>{selected.value=null;opening.value=false},fail:()=>{opening.value=false;uni.showToast({title:'打开失败，请重试',icon:'none'})}})}
function chooseCollection(value){collection.value='all';query.value=value}
function copySource(url='https://opengameart.org/content/16x16-food'){uni.setClipboardData({data:url})}
</script>

<style scoped>
.theme-scroll{white-space:nowrap}.collection-tabs{width:max-content;gap:30rpx!important}.sort-picker{font-size:21rpx;padding:15rpx 4rpx;color:#686868}.save-heart{position:absolute;bottom:10rpx;right:10rpx;background:#fffdf3e8;width:80rpx;height:80rpx;line-height:78rpx;padding:0;border-radius:50%;font-size:40rpx;color:#777777;z-index:1}.save-heart.saved{color:#c47d73}.difficulty-chip{font-size:18rpx;background:#efece5;color:#848484;padding:5rpx 10rpx;border-radius:7rpx}.end-note{display:block;font-size:21rpx;color:#a2a2a2;text-align:center;margin:34rpx 0}.skeleton-grid{display:grid;grid-template-columns:1fr 1fr;gap:24rpx}.skeleton-grid>view{height:370rpx;border-radius:24rpx;background:linear-gradient(110deg,#f0ede7,#f6f4f0,#f0ede7);background-size:200% 100%;animation:shimmer 1.5s infinite}@keyframes shimmer{to{background-position:-200% 0}}.detail-actions{display:flex;gap:16rpx;align-items:stretch;margin-top:22rpx}.detail-actions .primary-btn{flex:1;margin:0}.favorite-action{background:#f0eee8;color:#5e5e5e;line-height:1.5;padding:25rpx 26rpx;border-radius:16rpx;font-size:25rpx}.detail-error{font-size:22rpx;color:#ad815e;background:#fff3e3;padding:16rpx;border-radius:10rpx}.detail-error button{display:inline;background:transparent;font-size:22rpx;color:#5e5e5e}

.cloud-catalog-error{font-size:24rpx;line-height:1.7;padding:24rpx;color:#b18d5c}.cloud-catalog-error button{background:transparent;color:#5e5e5e;font-size:23rpx}

.templates-page { min-height: 100vh; padding-bottom: 32rpx; background: #f6f5f3; }
.templates-nav-inner { display: flex; align-items: center; gap: 14rpx; margin: 0 36rpx; }
.templates-nav-inner > text { font-size: 46rpx; font-weight: 700; }
.templates-content { padding: 0 36rpx; }
.gallery-intro { display: flex; align-items: center; justify-content: space-between; margin: 20rpx 0 28rpx; }.gallery-title { display: block; font-size: 43rpx; font-weight: 700; letter-spacing: -1rpx; }.gallery-subtitle { display: block; margin-top: 12rpx; font-size: 23rpx; color: #909090; }.gallery-stamp { height: 74rpx; width: 74rpx; border-radius: 24rpx; background: #f2e7bb; display: flex; align-items: center; justify-content: center; transform: rotate(8deg); }
.search-bar { display: flex; align-items: center; gap: 14rpx; border: 1rpx solid #eae8e2; border-radius: 20rpx; background: #fff; padding: 22rpx; }
.search-bar input { font-size: 26rpx; color: #242321; flex: 1; min-width: 0; height: 40rpx; }
.search-bar button { display: flex; background: transparent; padding: 0 5rpx; }
.collection-tabs { display: flex; gap: 36rpx; margin: 26rpx 0 18rpx; border-bottom: 1rpx solid #e8e6e0; }.collection-tabs button { position: relative; display: flex; align-items: center; gap: 10rpx; background: transparent; color: #959595; font-size: 28rpx; padding: 16rpx 0 24rpx; line-height: 1.3; }.collection-tabs button.active { color: #242321; font-weight: 650; }.collection-tabs button.active::before { content: ''; position: absolute; bottom: -1rpx; left: 0; width: 46rpx; height: 5rpx; border-radius: 3rpx; background: #242321; }.collection-tabs button > text { color: #b78840; background: #f4e9cc; border-radius: 6rpx; padding: 4rpx 6rpx; font-size: 14rpx; letter-spacing: 1rpx; }
.category-list { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10rpx; margin: 18rpx 0 12rpx; }
.category-list button { padding: 16rpx 0; font-size: 23rpx; line-height: 1.3; border-radius: 12rpx; background: transparent; color: #8a8a8a; }
.category-list button.active { background: #eeebe5; color: #242321; font-weight: 650; }
.catalog-heading { display: flex; align-items: center; justify-content: space-between; margin: 12rpx 0 22rpx; color: #989898; font-size: 21rpx; }
.catalog-filters { display: flex; align-items: center; gap: 10rpx; }
.beginner-filter { display: flex; align-items: center; gap: 6rpx; padding: 11rpx 16rpx; color: #8b8b8b; border: 1rpx solid #e8e5df; border-radius: 11rpx; background: transparent; line-height: 1.3; font-size: 21rpx; }
.beginner-filter.active { color: #242321; background: #efece6; border-color: #dcd6c9; }
.template-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20rpx 18rpx; }
.template-card { min-width: 0; background: #fff; border-radius:24rpx; overflow:hidden; }
.template-art { height: 306rpx; background: #f1eee8; position: relative; border-radius: 24rpx 24rpx 0 0; overflow: hidden; }
.pattern-size { position: absolute; right: 13rpx; top: 13rpx; color: #7e7e7e; background: #fffdf6ce; border-radius: 8rpx; padding: 7rpx 9rpx; font-size: 18rpx; }
.template-art image { width: 100%; height: 100%; padding: 24rpx; }
.template-info { padding: 18rpx 18rpx 22rpx; }
.template-name { font-size: 26rpx; font-weight: 600; display: block; white-space: nowrap; text-overflow: ellipsis; overflow: hidden; }
.template-summary { display: flex; align-items: center; justify-content: space-between; gap: 8rpx; margin-top: 7rpx; }.card-arrow { width: 38rpx; height: 38rpx; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: #efece6; }
.template-meta { display: block; color: #969696; font-size: 21rpx; white-space: nowrap; }
.source-link { margin: 24rpx auto 0; background: transparent; color: #8e8e8e; font-size: 22rpx; padding: 20rpx; }
.load-more { margin: 28rpx auto 0; background: #efece5; color: #646464; border-radius: 12rpx; padding: 20rpx 48rpx; font-size: 25rpx; line-height: 1.4; }
.empty-search { min-height: 450rpx; display: flex; justify-content: center; align-items: center; flex-direction: column; gap: 28rpx; color: #8a8a8a; font-size: 28rpx; }
.empty-search button { border-radius: 12rpx; background: #eeebe5; padding: 18rpx 36rpx; line-height: 1.4; color: #5e5e5e; font-size: 25rpx; }
.template-sheet .sheet-heading { margin-bottom: 20rpx; }
.detail-art { height: 320rpx; background: #f1eee8; border-radius: 18rpx; display: flex; justify-content: center; align-items: center; }
.detail-art image { width: 340rpx; height: 340rpx; }
.detail-meta { display: flex; justify-content: space-around; margin: 28rpx 0 24rpx; font-size: 26rpx; }
.detail-colors { display: flex; align-items: center; flex-wrap: wrap; gap: 8rpx; }
.detail-color { height: 26rpx; width: 26rpx; border-radius: 6rpx; border: 1rpx solid #00000010; }
.detail-colors > text { margin-left: auto; color: #848484; font-size: 22rpx; }
.detail-board { display: block; color: #888888; font-size: 23rpx; margin: 24rpx 0 30rpx; }
.detail-source { background: transparent; color: #888888; font-size: 21rpx; line-height: 1.5; display: flex; align-items: center; gap: 12rpx; text-align: left; margin: -8rpx 0 24rpx; padding: 8rpx 0; }
.adaptation-note { display: block; font-size: 18rpx; line-height: 1.5; color: #989898; margin: -15rpx 0 24rpx; }
.credit-source { margin-bottom: 28rpx; padding-bottom: 24rpx; border-bottom: 1rpx solid #e9e5dd; }
.credit-source > text { display: block; font-size: 25rpx; line-height: 1.6; }
.credit-source > text:not(:first-child) { color: #848484; font-size: 22rpx; margin-top: 8rpx; }
.credit-source button { background: transparent; color: #505050; padding: 16rpx 0 0; font-size: 23rpx; line-height: 1.4; }
.credits-copy { display: block; font-size: 25rpx; color: #808080; line-height: 1.9; margin-bottom: 30rpx; }

.gallery-intro { margin:0 0 26rpx; color:#8a8a8a; font-size:23rpx; }
.search-bar { border:0; border-radius:18rpx; padding:22rpx; background:#edebe7; }
.search-bar input { font-size:26rpx; }
.collection-tabs { gap:36rpx!important; margin:20rpx 0 4rpx; border-bottom:0; }
.collection-tabs button { font-size:29rpx; padding:20rpx 0; min-height:80rpx; }
.collection-tabs button>text { display:none; }
.catalog-heading { margin:8rpx 0 14rpx; color:#5a5a5a; font-size:24rpx; }
.catalog-count { color:#9e9e9e; font-size:22rpx; margin-left:6rpx; }
.filter-button { display:flex; align-items:center; gap:8rpx; color:#838383; background:transparent; padding:20rpx 0 20rpx 24rpx; font-size:24rpx; line-height:1.4; }
.filter-button.applied { color:#242321; }.filter-dot { width:10rpx; height:10rpx; background:#242321; border-radius:50%; }
.filter-label { display:block; font-size:26rpx; font-weight:600; margin:24rpx 0 12rpx; }
.category-list { grid-template-columns:repeat(4,1fr); gap:12rpx; }
.category-list button { background:#f5f4f1; padding:24rpx 8rpx; font-size:25rpx; }.category-list button.active { background:#ece9e2; }
.filter-sorts { display:grid; grid-template-columns:1fr 1fr; gap:12rpx; }.filter-sorts button { padding:24rpx 10rpx; background:#f5f4f1; color:#818181; font-size:24rpx; border-radius:12rpx; line-height:1.4; }.filter-sorts button.active { background:#ece9e2; color:#242321; }
.filter-switch { display:flex; align-items:center; justify-content:space-between; padding:30rpx 0; margin:18rpx 0; }.filter-switch text { display:block; font-size:26rpx; }.filter-switch text+text { color:#909090; font-size:22rpx; margin-top:8rpx; }.filter-actions { display:flex; align-items:center; gap:16rpx; }.filter-actions .secondary-btn { width:150rpx; height:98rpx; }.filter-actions .primary-btn { flex:1; }
.detail-art { height:360rpx; }.detail-art image { width:100%; height:100%; padding:24rpx; }.detail-meta { font-size:25rpx; }.detail-board { font-size:23rpx; line-height:1.6; }.favorite-action { display:flex; align-items:center; justify-content:center; }
</style>

<style scoped>
.templates-nav-inner{gap:16rpx}.gallery-wordmark{font-size:16rpx!important;font-weight:500!important;letter-spacing:3rpx;color:#B2AA99;margin-left:auto}.gallery-intro{display:block;margin:24rpx 0 28rpx}.gallery-intro>text{display:block;font-size:42rpx;color:#242321;font-weight:700}.gallery-intro>text+text{font-size:24rpx;color:#A69D8B;font-weight:400;margin-top:12rpx}.gallery-collections{display:flex;gap:16rpx;margin-bottom:26rpx}.gallery-collections button{flex:1;min-width:0;text-align:left;background:#FFEBA5;border-radius:24rpx;padding:27rpx 22rpx;line-height:1.4}.gallery-collections button+button{background:#E8E0F3}.gallery-collections text{display:block;font-size:28rpx;font-weight:650;color:#61502A}.gallery-collections text+text{font-size:20rpx;font-weight:400;opacity:.6;margin-top:12rpx}.gallery-collections button+button text{color:#746080}.search-bar{background:#ECE8E0;border-radius:20rpx}.collection-tabs button{color:#A49D8E}.collection-tabs button.active{color:#242321}.collection-tabs button.active::before{background:#E6BF42;width:100%;height:8rpx;bottom:8rpx;opacity:.6}.template-card{border-radius:28rpx}.template-art{height:340rpx;border-radius:28rpx 28rpx 0 0;background:#F3EFE5!important}.template-art image{padding:16rpx;image-rendering:pixelated}.save-heart{background:#ffffffec;width:64rpx;height:64rpx;line-height:64rpx;font-size:35rpx;right:14rpx;bottom:14rpx;color:#C0B5A1}.save-heart.saved{color:#D39568}.pattern-size{background:#ffffffc9;color:#AD9D7B;font-size:18rpx;border-radius:10rpx;padding:8rpx 10rpx}.template-name{font-size:27rpx}.template-meta{font-size:20rpx;color:#ADA28D}.difficulty-chip{background:#FFF2BC;color:#AC8D39;font-size:18rpx}.template-info{padding:20rpx 20rpx 25rpx}.detail-art{background:#F3EFE5!important;border-radius:24rpx;height:400rpx}.detail-art image{image-rendering:pixelated}.favorite-action{background:#EEE8DC;color:#9A855E;border-radius:20rpx}.source-link{color:#B7AD98;font-size:21rpx}.filter-button{color:#9B8C70}
</style>
