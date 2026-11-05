<template>
  <view class="studio-page" :class="{ editing: imagePath }">
    <view class="studio-nav" :style="{ paddingTop: nav.statusBar + 'px' }">
      <view class="nav-content" :style="{ height: nav.height + 'px', paddingRight: nav.right + 'px' }">
        <view class="brand"><BrandMark /><text>豆物</text></view>
        <button class="help-button" aria-label="使用帮助" @tap="helpVisible = true"><AppIcon name="help" :size="36" /></button>
      </view>
    </view>
    <view class="page-content">
      <template v-if="!imagePath">
        <view class="create-hero">
          <view class="hero-copy"><text class="hero-label">图片转图纸</text><view class="hero-title"><text>把喜欢，</text><text>一颗颗拼好。</text></view><text class="hero-note">选一张图，开始你的下一件作品</text></view>
          <view class="hero-art"><view class="hero-orbit" /><view class="hero-paper"><image src="/static/templates/flower.png" mode="aspectFit" /></view><view class="hero-sticker"><image src="/static/templates/tw_1f431.png" mode="aspectFit" /></view><view class="hero-spark spark-one" /><view class="hero-spark spark-two" /></view>
          <button class="hero-upload" :disabled="choosing" @tap="chooseImage"><view class="hero-upload-icon"><AppIcon name="plus" :size="32" light /></view><text>{{ choosing ? '正在选图…' : '选择图片' }}</text><AppIcon name="arrow-right" :size="32" light /></button>
        </view>
        <view class="home-shortcuts"><button @tap="openTemplates"><view class="shortcut-icon"><AppIcon name="grid" :size="36" /></view><view><text>找图纸</text><text>{{ templateCount }} 款，直接开拼</text></view><AppIcon name="chevron" :size="26" /></button><button @tap="openLibrary"><view class="shortcut-icon peach"><AppIcon name="folder" :size="36" /></view><view><text>我的作品</text><text>接着上次拼</text></view><AppIcon name="chevron" :size="26" /></button></view>
        <view class="section-heading"><text>试试效果</text><text class="section-caption">点一下，看看怎么拼</text></view>
        <view class="example-list">
          <view v-for="example in examples" :key="example.id" class="example-card" @tap="useExample(example)">
            <view class="example-art" :style="{ background: example.background }"><image :src="`/static/examples/${example.id}-beads.png`" mode="aspectFit" /></view>
            <text>{{ example.label }}</text>
          </view>
        </view>
        <view class="section-heading picks-heading"><text>挑一个，今天拼</text><button @tap="openTemplates">全部图纸<AppIcon name="chevron" :size="24" /></button></view>
        <view class="home-picks"><view v-for="item in featuredTemplates" :key="item.id" class="home-pattern" @tap="useReadyTemplate(item)"><view class="home-pattern-art" :style="{ background: item.background }"><image :src="item.cover" mode="aspectFit" lazy-load /><text class="home-pattern-tag">{{ item.colors }} 色</text></view><text class="home-pattern-name">{{ item.name }}</text><text class="home-pattern-count">{{ item.totalBeads }} 颗 · {{ item.gridSize }} × {{ item.gridSize }}</text></view></view>
      </template>
      <template v-else>
        <view class="editor-heading"><view class="editor-title"><button aria-label="返回选图" @tap="resetImage"><AppIcon name="chevron" :size="30" /></button><text class="page-title">调整图纸</text></view><button class="text-button" :disabled="choosing" @tap="chooseImage">{{ choosing ? '正在选图…' : '换图' }}</button></view>
        <view class="preview-card">
          <view class="preview-toolbar"><view class="segment"><button :class="{ selected: previewMode === 'pattern' }" @tap="previewMode = 'pattern'">预览</button><button :class="{ selected: previewMode === 'source' }" @tap="previewMode = 'source'">原图</button></view><text class="preview-status">{{ processing ? processingStatus : `${paletteId === 'mard' ? 'MARD' : 'Hama'}` }}</text></view>
          <view class="preview-stage" :style="{ height: previewSize + 'px' }"><image v-if="previewMode === 'source'" :src="imagePath" mode="aspectFit" class="original-image" /><canvas v-show="previewMode === 'pattern'" type="2d" id="previewCanvas" canvas-id="previewCanvas" :style="{ width: previewSize + 'px', height: previewSize + 'px' }" /><view v-if="processing" class="preview-loading"><view class="spinner" /></view></view>
          <view class="preview-stats"><text>{{ gridSize }} × {{ gridSize }} 格</text><text>{{ colorUsage.length }} 色</text><text>{{ totalBeads.toLocaleString() }} 颗</text></view>
        </view>
        <view class="subject-card"><view class="subject-copy"><text>{{ subjectEnabled ? '已保留主体' : '只拼主体' }}</text><text>{{ subjectEnabled ? '背景留空 · 可继续修整边缘' : '人物、宠物、物品，自动去掉背景' }}</text></view><button v-if="subjectEnabled" class="restore-background" @tap="subjectEnabled = false">恢复背景</button><button class="subject-button" @tap="editSubject">{{ subjectEnabled ? '修整' : '提取主体' }}<AppIcon name="chevron" :size="24" /></button></view>
        <view class="settings-card">
          <view class="setting-row"><text class="setting-label">尺寸</text><view class="options"><button v-for="size in sizes" :key="size" :class="{ active: gridSize === size }" @tap="gridSize = size">{{ size }} × {{ size }}</button></view></view>
          <view class="setting-row"><text class="setting-label">类型</text><view class="options"><button v-for="style in imageStyles" :key="style.value" :class="{ active: imageStyle === style.value }" @tap="imageStyle = style.value">{{ style.label }}</button></view></view>
          <view class="setting-row"><text class="setting-label">颜色</text><view class="options"><button v-for="option in colorOptions" :key="option.value" :class="{ active: maxColors === option.value }" @tap="maxColors = option.value">{{ option.label }}</button></view></view>
          <button class="advanced-toggle" :aria-expanded="advanced" @tap="advanced = !advanced"><text>更多设置</text><AppIcon :name="advanced ? 'minus' : 'plus'" :size="26" /></button>
          <view v-if="advanced" class="advanced-body">
            <view class="setting-row"><text class="setting-label">色卡</text><view class="options"><button :class="{ active: paletteId === 'mard' }" @tap="paletteId = 'mard'">MARD 221</button><button :class="{ active: paletteId === 'hama' }" @tap="paletteId = 'hama'">Hama 53</button></view></view>
            <view v-if="!subjectEnabled" class="setting-row"><text class="setting-label">构图</text><view class="options"><button :class="{ active: fit === 'contain' }" @tap="fit = 'contain'">完整保留</button><button :class="{ active: fit === 'cover' }" @tap="fit = 'cover'">居中裁切</button></view></view>
            <view v-if="!subjectEnabled" class="switch-row"><text>去除外围白底</text><switch :checked="removeWhite" color="#285c49" style="transform:scale(.75);transform-origin:right center" @change="removeWhite = $event.detail.value" /></view>
          </view>
        </view>
        <view v-if="error" class="error-message">{{ error }}<button @tap="updatePreview">重试</button></view>
        <view class="editor-footer"><button class="primary-btn" :disabled="processing || !pattern || !!error || navigating" @tap="openResult">{{ processing ? '处理中…' : '生成图纸' }}<AppIcon name="arrow-right" :size="30" light /></button></view>
      </template>
    </view>
    <view v-if="helpVisible" class="sheet-backdrop" @tap="helpVisible = false"><view class="bottom-sheet" @tap.stop><view class="sheet-handle" /><view class="sheet-heading"><text class="section-title">使用帮助</text><button class="icon-button" aria-label="关闭帮助" @tap="helpVisible = false"><AppIcon name="close" :size="30" /></button></view><view v-for="(step, i) in helpSteps" :key="i" class="help-step"><text class="step-number">{{ i + 1 }}</text><view><text class="step-title">{{ step.title }}</text><text class="step-description">{{ step.description }}</text></view></view><text class="help-note">色卡品牌请与手里的豆子保持一致。</text><button class="primary-btn" @tap="helpVisible = false">知道了</button><button class="feedback-link" @tap="showFeedback">联系与反馈</button></view></view>
  </view>
</template>

<script setup>
import { ref, shallowRef, computed, watch, nextTick, getCurrentInstance, onBeforeUnmount } from 'vue'
import { onShow, onHide } from '@dcloudio/uni-app'
import AppIcon from '../../components/AppIcon.vue'
import BrandMark from '../../components/BrandMark.vue'
import { EXAMPLES } from '../../utils/examples'
import { processImage } from '../../utils/imageProcessor'
import { matchAllAsync } from '../../utils/colorMatcher'
import { createImageSourceLoader } from '../../utils/imageSource'
import { yieldToUI } from '../../utils/taskScheduler'
import { HAMA_PALETTE, MARD_PALETTE } from '../../utils/beadPalette'
import { drawPatternAsync } from '../../utils/canvasRenderer'
import { getCanvasNode } from '../../utils/canvas'
import { setPending, consumeNewProjectRequest } from '../../utils/appState'
import { TEMPLATES, getTemplatePattern } from '../../utils/templates'
import { beginSubjectEdit, consumeSubjectEdit, clearSubjectEdit } from '../../utils/subjectSession'

const instance = getCurrentInstance()
const info = uni.getSystemInfoSync()
const nav = { statusBar: info.statusBarHeight || 0, height: 56, right: 0 }
// #ifdef MP-WEIXIN
const capsule = uni.getMenuButtonBoundingClientRect()
nav.height = (capsule.top - nav.statusBar) * 2 + capsule.height
nav.right = info.windowWidth - capsule.left + 4
// #endif
const previewSize = Math.floor(Math.min(info.windowWidth, 480) * (1 - 104 / 750) - 2)
const imagePath = ref(''), projectName = ref('我的小作品'), gridSize = ref(58), maxColors = ref(16)
const paletteId = ref('mard')
const imageStyle = ref('illustration'), fit = ref('contain'), removeWhite = ref(false), advanced = ref(false)
const processing = ref(false), processingStatus = ref('正在打开图片…'), choosing = ref(false), pattern = shallowRef(null), colorUsage = shallowRef([]), previewMode = ref('pattern')
const error = ref(''), navigating = ref(false), helpVisible = ref(false)
const subject = shallowRef(null), subjectEnabled = ref(false)
const examples = EXAMPLES.map((item, index) => ({ ...item, label: ['花朵', '狐狸', '咖啡'][index] }))
const templateCount = TEMPLATES.length
const featuredTemplates = ['tw_1f430', 'tw_1f338', 'tw_1f98b', 'tw_1f353', 'tw_1f9f8', 'tw_1f308'].map((id, index) => ({ ...TEMPLATES.find(item => item.id === id), background: ['#f6ece9','#f9edf1','#eaf1f6','#f8eee9','#f7f0e3','#edf3ef'][index] })).filter(item => item.id)
const sizes = [29, 58, 87]
const colorOptions = [{ value: 8, label: '8 色' }, { value: 16, label: '16 色' }, { value: 24, label: '24 色' }, { value: 0, label: '不限' }]
const imageStyles = [{ value: 'illustration', label: '插画', icon: 'palette' }, { value: 'photo', label: '照片', icon: 'image' }, { value: 'pixel', label: '像素', icon: 'grid' }]
const helpSteps = [
  { title: '选图', description: '上传图片，或直接使用样板。' },
  { title: '调整', description: '选择尺寸、图片类型和颜色数量。' },
  { title: '开拼', description: '放大看色号，拼完一色打勾，再导出图纸。' },
]
const totalBeads = computed(() => colorUsage.value.reduce((sum, c) => sum + c.count, 0))
const sourceLoader = createImageSourceLoader()
let timer, revision = 0, pageVisible = false, needsPreview = false, alive = true
onShow(() => {
  pageVisible = true
  navigating.value = false
  if (consumeNewProjectRequest()) resetImage()
  const selection = consumeSubjectEdit(imagePath.value)
  if (selection) { subject.value = selection; subjectEnabled.value = true; previewMode.value = 'pattern' }
  if (helpVisible.value) uni.hideTabBar({ animation: false })
  if (needsPreview && imagePath.value) schedulePreview()
})
onHide(() => { pageVisible = false; revision++; clearTimeout(timer); uni.showTabBar({ animation: false, fail: () => {} }) })
watch(helpVisible, visible => visible ? uni.hideTabBar({ animation: false }) : uni.showTabBar({ animation: false }))
onBeforeUnmount(() => { alive = false; clearTimeout(timer); revision++; sourceLoader.clear(); releasePickedImage(imagePath.value) })
watch([imagePath, gridSize, maxColors, imageStyle, fit, removeWhite, paletteId, subject, subjectEnabled], schedulePreview, { flush: 'sync' })
function schedulePreview() {
  revision++
  clearTimeout(timer)
  needsPreview = !!imagePath.value
  if (!imagePath.value || !pageVisible) return
  processing.value = true
  processingStatus.value = '正在准备预览…'
  error.value = ''
  timer = setTimeout(updatePreview, 100)
}
function chooseImage() {
  if (choosing.value) return
  choosing.value = true
  uni.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'], success: result => {
    const path = result.tempFilePaths?.[0]
    if (!alive || !path) return
    sourceLoader.clear()
    releasePickedImage(imagePath.value, path)
    projectName.value = '我的小作品'
    clearSubject()
    imageStyle.value = 'illustration'
    fit.value = 'contain'; removeWhite.value = false; previewMode.value = 'pattern'
    pattern.value = null; colorUsage.value = []
    imagePath.value = path
    uni.pageScrollTo({ scrollTop: 0, duration: 0 })
  }, fail: err => { if (!/cancel/i.test(err.errMsg || '')) uni.showToast({ title: '暂时无法打开相册，请检查权限', icon: 'none' }) }, complete: () => { choosing.value = false } })
}
function releasePickedImage(path, replacement = '') {
  // #ifdef H5
  if (path?.startsWith('blob:') && path !== replacement) URL.revokeObjectURL(path)
  // #endif
}
function useExample(example) {
  sourceLoader.clear(); releasePickedImage(imagePath.value)
  clearSubject()
  projectName.value = example.name
  gridSize.value = 29
  imageStyle.value = 'pixel'
  removeWhite.value = false
  previewMode.value = 'pattern'
  imagePath.value = `/static/examples/${example.id}.png`
  uni.pageScrollTo({ scrollTop: 0, duration: 200 })
}
async function updatePreview() {
  clearTimeout(timer)
  const current = ++revision
  if (!imagePath.value || !pageVisible || !alive) return
  const path = imagePath.value, size = gridSize.value, palette = paletteId.value === 'mard' ? MARD_PALETTE : HAMA_PALETTE, limit = maxColors.value
  const isCancelled = () => current !== revision || !pageVisible || !alive
  const options = { style: imageStyle.value, fit: fit.value, removeWhite: removeWhite.value, subject: subjectEnabled.value ? subject.value : null, isCancelled }
  processing.value = true
  error.value = ''
  const watchdog = setTimeout(() => {
    if (isCancelled()) return
    revision++; processing.value = false
    error.value = '图片处理超时，请重试或换一张图片'
  }, 30000)
  try {
    processingStatus.value = '正在打开图片…'
    await yieldToUI()
    const source = await sourceLoader.load(path)
    if (isCancelled()) return
    processingStatus.value = '正在取样…'
    const pixels = await processImage(path, size, { ...options, source })
    if (isCancelled()) return
    processingStatus.value = '正在匹配颜色…'
    const result = await matchAllAsync(pixels, size, palette, limit, { isCancelled })
    if (isCancelled()) return
    if (!result.colorUsage.length) throw new Error('没有找到可拼的像素，请关闭去白底或换一张图片')
    await nextTick()
    const previewCanvas = await getCanvasNode('#previewCanvas', instance)
    if (isCancelled()) return
    if (!previewCanvas) throw new Error('预览画布未准备好，请重试')
    processingStatus.value = '正在绘制预览…'
    await drawPatternAsync(previewCanvas, result.pattern, size, false, previewSize, { mode: 'beads', isCancelled })
    if (isCancelled()) return
    pattern.value = result.pattern; colorUsage.value = result.colorUsage; needsPreview = false
  } catch (err) {
    if (current === revision) { pattern.value = null; colorUsage.value = []; error.value = err.message || '图片处理失败，请换一张图片试试' }
  } finally { clearTimeout(watchdog); if (current === revision) processing.value = false }
}
function openResult() {
  if (!pattern.value || processing.value || navigating.value) return
  navigating.value = true
  setPending(imagePath.value, pattern.value, colorUsage.value, gridSize.value, { name: projectName.value, paletteName: paletteId.value === 'mard' ? 'MARD' : 'Hama' })
  uni.navigateTo({ url: '/pages/result/result', fail: () => { navigating.value = false } })
}
function resetImage() {
  revision++; clearTimeout(timer); sourceLoader.clear(); releasePickedImage(imagePath.value)
  clearSubject()
  imagePath.value = ''; pattern.value = null; colorUsage.value = []
  error.value = ''; processing.value = false; gridSize.value = 58; maxColors.value = 16
  imageStyle.value = 'illustration'; fit.value = 'contain'; removeWhite.value = false
  advanced.value = false; previewMode.value = 'pattern'
}
function clearSubject() { subject.value = null; subjectEnabled.value = false; clearSubjectEdit() }
function editSubject() {
  if (!imagePath.value || navigating.value) return
  beginSubjectEdit(imagePath.value, subject.value)
  navigating.value = true
  uni.navigateTo({ url: '/subject/editor/editor', fail: () => { navigating.value = false; uni.showToast({ title: '提取页面打开失败，请重试', icon: 'none' }) } })
}
function openTemplates() { uni.switchTab({ url: '/pages/templates/templates' }) }
function openLibrary() { uni.switchTab({ url: '/pages/history/history' }) }
function useReadyTemplate(item) {
  if (navigating.value) return
  const template = getTemplatePattern(item.id)
  if (!template) return
  navigating.value = true
  setPending('', template.pattern, template.colorUsage, template.gridSize, { name: template.name, paletteName: template.paletteName, attribution: template.attribution })
  uni.navigateTo({ url: '/pages/result/result', fail: () => { navigating.value = false } })
}
function showFeedback() { uni.previewImage({ urls: ['/static/feedback/wechat-qr.jpg'] }) }
</script>

<style scoped>
.studio-page { min-height: 100vh; padding-bottom: 48rpx; }
.studio-page.editing { padding-bottom: 160rpx; }
.nav-content { display: flex; align-items: center; justify-content: space-between; margin: 0 32rpx; }
.brand { display: flex; align-items: center; gap: 14rpx; font-size: 36rpx; font-weight: 700; }
.help-button { display: flex; align-items: center; justify-content: center; width: 72rpx; height: 72rpx; background: transparent; }
.page-content { padding: 0 32rpx; }
.page-title { font-size: 38rpx; font-weight: 650; line-height: 1.4; }
.create-hero { position: relative; overflow: hidden; margin-top: 20rpx; background: #f6e9b9; border-radius: 32rpx; padding: 38rpx 32rpx 24rpx; }
.hero-copy { position: relative; z-index: 2; pointer-events: none; }
.hero-label { display: inline-block; font-size: 21rpx; font-weight: 600; color: #67734c; margin-bottom: 16rpx; }
.hero-title { font-size: 49rpx; line-height: 1.32; font-weight: 750; letter-spacing: -1rpx; color: #253e32; }.hero-title > text { display: block; }
.hero-note { display: block; margin-top: 18rpx; color: #7e8062; font-size: 21rpx; }
.hero-art { position: absolute; right: -5rpx; top: 18rpx; height: 290rpx; width: 300rpx; pointer-events: none; }
.hero-orbit { position: absolute; width: 264rpx; height: 264rpx; border: 1rpx solid #d9cc98; border-radius: 50%; right: 6rpx; top: 20rpx; }
.hero-paper { position: absolute; width: 226rpx; height: 250rpx; background-color: #fffdf1; background-image: radial-gradient(#d6d8c4 1rpx, transparent 1rpx); background-size: 12rpx 12rpx; border: 8rpx solid #fffdf1; border-radius: 18rpx; transform: rotate(12deg); right: 26rpx; top: 0; box-shadow: 0 14rpx 30rpx #6c673115; }
.hero-paper image { width: 100%; height: 100%; }
.hero-sticker { position: absolute; right: 10rpx; bottom: -10rpx; width: 120rpx; height: 120rpx; transform: rotate(-12deg); border-radius: 30rpx; background: #f6c7a8; border: 5rpx solid #fff8e9; }
.hero-sticker image { width: 100%; height: 100%; }
.hero-spark { position: absolute; width: 18rpx; height: 18rpx; background: #e9ae66; border-radius: 4rpx; transform: rotate(15deg); }
.spark-one { left: 1rpx; top: 10rpx; }.spark-two { right: 0; top: 180rpx; width: 12rpx; height: 12rpx; background: #779473; }
.hero-upload { display: flex; align-items: center; gap: 18rpx; position: relative; z-index: 3; width: 100%; margin-top: 34rpx; padding: 18rpx 24rpx 18rpx 18rpx; color: #fff; border-radius: 20rpx; background: #285c49; font-size: 28rpx; line-height: 1.4; text-align: left; }
.hero-upload > text { flex: 1; font-weight: 600; }.hero-upload-icon { width: 50rpx; height: 50rpx; display: flex; align-items: center; justify-content: center; border-radius: 12rpx; background: #ffffff18; }
.home-shortcuts { display: grid; grid-template-columns: 1fr 1fr; gap: 16rpx; margin-top: 20rpx; }
.home-shortcuts button { min-width: 0; display: flex; align-items: center; gap: 14rpx; background: #fff; border: 1rpx solid #ecece3; padding: 23rpx 16rpx; border-radius: 20rpx; text-align: left; line-height: 1.5; }
.shortcut-icon { display: flex; align-items: center; justify-content: center; width: 62rpx; height: 66rpx; border-radius: 16rpx; background: #edf2e9; flex-shrink: 0; }.shortcut-icon.peach { background: #faf0e6; }
.home-shortcuts button > view:nth-child(2) { flex: 1; min-width: 0; }.home-shortcuts text { display: block; white-space: nowrap; font-size: 25rpx; font-weight: 600; }.home-shortcuts text + text { font-size: 18rpx; color: #969b8e; font-weight: 400; margin-top: 4rpx; }
.section-heading { display: flex; align-items: center; justify-content: space-between; margin: 38rpx 0 22rpx; }
.section-heading > text { font-size: 30rpx; font-weight: 650; }.section-heading > .section-caption { font-size: 21rpx; font-weight: 400; color: #93998e; }
.section-heading button, .text-button { display: flex; align-items: center; gap: 4rpx; background: transparent; font-size: 25rpx; color: #647d69; line-height: 1.4; padding: 12rpx 0 12rpx 12rpx; }
.example-list { display: flex; gap: 18rpx; }
.example-card { flex: 1; min-width: 0; text-align: center; font-size: 25rpx; }
.example-art { height: 152rpx; border-radius: 20rpx; margin-bottom: 12rpx; overflow: hidden; }
.example-art image { width: 100%; height: 100%; padding: 6rpx; }
.example-card > text { font-size: 23rpx; color: #6d786b; }
.picks-heading { margin-top: 42rpx; }
.home-picks { display: grid; grid-template-columns: 1fr 1fr; gap: 28rpx 20rpx; }
.home-pattern { min-width: 0; }.home-pattern-art { position: relative; height: 280rpx; overflow: hidden; border-radius: 24rpx; }.home-pattern-art image { width: 100%; height: 100%; padding: 10rpx; }
.home-pattern-tag { position: absolute; right: 14rpx; top: 14rpx; background: #ffffffc9; color: #7b8274; border-radius: 10rpx; padding: 7rpx 10rpx; font-size: 19rpx; }
.home-pattern-name { display: block; margin: 14rpx 4rpx 0; font-size: 27rpx; font-weight: 600; }.home-pattern-count { display: block; margin: 7rpx 4rpx 0; color: #929a8a; font-size: 21rpx; }
.editor-heading { display: flex; align-items: center; justify-content: space-between; padding: 18rpx 0 22rpx; }
.editor-title { display: flex; align-items: center; gap: 10rpx; }
.editor-title button { background: transparent; display: flex; padding: 12rpx 6rpx 12rpx 0; transform: rotate(180deg); }
.preview-card { background: #fff; border: 1rpx solid #e3e8df; border-radius: 22rpx; padding: 20rpx; }
.preview-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18rpx; }
.segment { display: flex; background: #f0f3ed; padding: 4rpx; border-radius: 12rpx; }
.segment button { background: transparent; font-size: 24rpx; color: #7c887b; padding: 12rpx 28rpx; line-height: 1.3; border-radius: 9rpx; }
.segment button.selected { color: #285c49; background: #fff; }
.preview-status { color: #788675; font-size: 22rpx; }
.preview-stage { display: flex; align-items: center; justify-content: center; position: relative; background: #f3f5ef; border-radius: 12rpx; overflow: hidden; }
.original-image { width: 100%; height: 100%; }
.preview-loading { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: #f5f6ec99; }
.spinner { height: 48rpx; width: 48rpx; border: 4rpx solid #d2ddc8; border-top-color: #285c49; border-radius: 50%; animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.preview-stats { display: flex; justify-content: center; gap: 28rpx; color: #788575; font-size: 23rpx; padding-top: 18rpx; }
.settings-card { margin-top: 22rpx; padding: 8rpx 22rpx 0; border: 1rpx solid #e3e8df; border-radius: 22rpx; background: #fff; }
.subject-card { display: flex; align-items: center; gap: 12rpx; margin-top: 20rpx; padding: 24rpx 22rpx; border: 1rpx solid #dbe5d4; background: #edf3e7; border-radius: 22rpx; }.subject-copy { flex: 1; min-width: 0; }.subject-copy text { display: block; font-size: 26rpx; font-weight: 600; }.subject-copy text + text { font-size: 20rpx; color: #8a957f; font-weight: 400; margin-top: 8rpx; line-height: 1.4; }.subject-button { display: flex; align-items: center; gap: 2rpx; flex-shrink: 0; background: #fff; color: #285c49; border-radius: 14rpx; font-size: 23rpx; padding: 18rpx 14rpx; line-height: 1.4; }.restore-background { flex-shrink: 0; background: transparent; color: #7a896f; font-size: 21rpx; padding: 12rpx 2rpx; line-height: 1.4; }
.setting-row { display: flex; align-items: center; gap: 22rpx; padding: 18rpx 0; }
.setting-label { flex-shrink: 0; font-size: 25rpx; width: 54rpx; }
.options { display: flex; flex: 1; gap: 10rpx; min-width: 0; }
.options button { flex: 1; min-width: 0; background: #f3f5f0; color: #74816f; border: 1rpx solid transparent; border-radius: 12rpx; font-size: 23rpx; line-height: 1.4; padding: 18rpx 3rpx; white-space: nowrap; }
.options button.active { color: #285c49; background: #e8f0e6; border-color: #9eb49b; }
.advanced-toggle { display: flex; align-items: center; justify-content: space-between; width: 100%; background: transparent; color: #7d8978; padding: 23rpx 0; margin-top: 2rpx; border-top: 1rpx solid #edf0e9; font-size: 24rpx; line-height: 1.4; }
.advanced-body { border-top: 1rpx solid #edf0e9; padding-bottom: 8rpx; }
.switch-row { display: flex; align-items: center; justify-content: space-between; min-height: 90rpx; font-size: 25rpx; }
.editor-footer { position: fixed; z-index: 8; left: 0; right: 0; bottom: var(--window-bottom, 0px); padding: 18rpx 32rpx; border-top: 1rpx solid #e4e9df; background: #fdfefa; }
.editor-footer .primary-btn { height: 92rpx; }
.error-message { margin-top: 22rpx; padding: 22rpx; background: #fcf0df; color: #986240; font-size: 24rpx; line-height: 1.6; border-radius: 16rpx; }
.error-message button { background: transparent; color: #986240; font-size: 24rpx; display: inline; text-decoration: underline; margin-left: 12rpx; }
.help-step { display: flex; gap: 22rpx; margin: 30rpx 0; }
.step-number { background: #e9f0e4; border-radius: 50%; width: 48rpx; height: 48rpx; display: flex; align-items: center; justify-content: center; color: #66815c; font-size: 25rpx; flex-shrink: 0; }
.step-title { display: block; font-size: 29rpx; font-weight: 600; }
.step-description { display: block; color: #84907c; font-size: 24rpx; line-height: 1.7; margin-top: 8rpx; }
.help-note { display: block; color: #85917e; font-size: 23rpx; margin: 32rpx 0; }
.feedback-link { background: transparent; color: #7f8d77; padding: 26rpx 0 0; font-size: 23rpx; }
@media (min-width: 768px) { .editor-footer { width: 480px; left: 50%; right: auto; transform: translateX(-50%); } }
</style>
