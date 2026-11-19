<template>
  <view class="studio-page" :class="{ editing: imagePath }"><!-- #ifdef APP-PLUS --><AppImageRuntime/><!-- #endif -->
    <view class="studio-nav" :style="{ paddingTop: nav.statusBar + 'px' }"><view class="nav-content" :style="{ height: nav.height + 'px', paddingRight: nav.right + 'px' }"><view class="brand"><BrandMark/><text>豆物</text><text class="brand-tag">BEAD STUDIO</text></view><button class="help-button" aria-label="使用帮助" @tap="helpVisible=true"><AppIcon name="help" :size="38"/></button></view></view>
    <view class="page-content">
      <template v-if="!imagePath">
        <view class="home-heading"><view><text class="home-kicker">MAKE SOMETHING YOU LOVE</text><text class="home-title">今天，拼点喜欢的。</text></view></view>
        <view class="create-card">
          <view class="hero-copy"><text class="hero-tag">从照片开始</text><view class="hero-title">把喜欢的照片，<text>变成你的拼豆。</text></view><text class="hero-detail">选图 · 去背景 · 配色 · 开拼</text></view>
          <view class="hero-art"><view class="hero-photo"><image src="/static/examples/original_rabbit.png" mode="aspectFit"/><text>照片</text></view><view class="hero-beads"><image src="/static/templates/original_rabbit.png" mode="aspectFit"/><view class="hero-beads-label"><AppIcon name="sparkles" :size="20"/><text>你的图纸</text></view></view><view class="hero-spark">✦</view></view>
          <button class="primary-btn choose-photo" aria-label="选择照片，开始制作拼豆图纸" :disabled="choosing" @tap="chooseImage"><AppIcon name="plus" :size="34" light/><text>{{choosing?'正在打开相册…':'选照片，开始创作'}}</text><AppIcon name="arrow-right" :size="28" light/></button>
          <view class="hero-footnote"><AppIcon name="shield" :size="22"/><text>照片本机处理</text><view/><text>免费做图</text></view>
        </view>
        <view class="home-shortcuts"><button @tap="openLibrary"><view class="shortcut-icon"><AppIcon name="folder" :size="36"/></view><view><text>我的作品</text><text>继续上一次创作</text></view><AppIcon name="chevron" :size="24"/></button><button @tap="openGuide"><view class="shortcut-icon"><AppIcon name="help" :size="36"/></view><view><text>新手入门</text><text>从第一颗豆开始</text></view><AppIcon name="chevron" :size="24"/></button></view>
        <view class="section-heading"><view><text class="section-title">试试这几个</text><text class="section-sub">小小一幅，也很有成就感</text></view><button @tap="openTemplates">更多灵感<AppIcon name="chevron" :size="23"/></button></view>
        <view class="example-list"><button v-for="example in examples" :key="example.id" class="example-card" @tap="useExample(example)"><view class="example-art" :style="{background:example.background}"><image :src="example.cover" mode="aspectFit"/></view><view class="example-label"><text>{{example.label}}</text><AppIcon name="arrow-right" :size="23"/></view></button></view>
        <view class="home-local-note"><text>一张照片，一份亲手做的喜欢。</text></view>
      </template>
      <template v-else>
        <view class="editor-heading"><view class="editor-title"><button aria-label="返回选图" @tap="backStep"><AppIcon name="arrow-left" :size="34"/></button><text class="page-title">{{createStep===1?'整理照片':createStep===2?'设置图纸':'确认效果'}}</text></view><button class="text-button" :disabled="choosing" @tap="chooseImage">换照片</button></view>
        <view class="wizard-progress"><view v-for="(title,i) in ['整理照片','尺寸配色','确认开拼']" :key="title" :class="{current:createStep===i+1,done:createStep>i+1}"><text>{{createStep>i+1?'✓':i+1}}</text><text>{{title}}</text></view></view>
        <view v-if="createStep===1" class="step-caption"><text>先留下，你真正想拼的部分</text><text>完整照片也可以直接使用</text></view>
        <view v-if="createStep===1" class="subject-card" :class="{'subject-applied':subjectEnabled}"><button class="subject-action" :disabled="choosing||navigating" @tap="editSubject"><view class="subject-icon"><AppIcon :name="subjectEnabled?'check':'sparkles'" :size="42"/></view><view class="subject-copy"><text>{{subjectEnabled?'已提取主体':'智能去背景'}}</text><text>{{subjectEnabled?'只拼主体，点此修整边缘':'人物、宠物、物品，留下主角'}}</text></view><view class="subject-cta"><text>{{subjectEnabled?'修整':'去背景'}}</text><AppIcon name="chevron" :size="25" light/></view></button><button v-if="subjectEnabled" class="restore-background" @tap="subjectEnabled=false">恢复整张照片</button></view>
        <view class="preview-card"><view class="preview-toolbar"><view class="segment"><button :class="{selected:previewMode==='pattern'}" @tap="previewMode='pattern'">拼豆效果</button><button :class="{selected:previewMode==='source'}" @tap="previewMode='source'">原照片</button></view><text class="preview-status">{{processing?processingStatus:paletteId==='mard'?'MARD 221':'Hama 53'}}</text></view><view class="preview-stage" :style="{height:previewSize+'px'}"><image v-if="previewMode==='source'" :src="imagePath" mode="aspectFit" class="original-image"/><canvas v-show="previewMode==='pattern'" type="2d" id="previewCanvas" canvas-id="previewCanvas" :style="{width:previewSize+'px',height:previewSize+'px'}"/><view v-if="processing" class="preview-loading"><view class="spinner"/></view></view><view class="preview-stats"><text>{{gridSize}} × {{gridSize}} 格</text><text>{{colorUsage.length}} 色</text><text>{{totalBeads.toLocaleString()}} 颗</text></view></view>
        <view v-if="createStep===1" class="composition-tools"><button @tap="rotatePhoto"><AppIcon name="refresh" :size="34"/><text>旋转</text></button><button @tap="mirrorPhoto"><text class="mirror-icon">↔</text><text>镜像</text></button><button :disabled="subjectEnabled" @tap="cropVisible=true"><AppIcon name="expand" :size="34"/><text>裁剪构图</text></button><button @tap="resetComposition"><AppIcon name="undo" :size="34"/><text>还原</text></button></view>
        <view v-if="createStep===2" class="settings-card"><view class="settings-heading"><text>作品做多大？</text><text>{{(gridSize*.5).toFixed(1)}} cm · 5mm 豆</text></view><view class="size-presets"><button v-for="(size,i) in sizes" :key="size" :class="{active:gridSize===size}" @tap="gridSize=size"><text>{{size}} × {{size}}</text><text>{{['小挂件','桌面摆件','大幅作品'][i]}}</text></button></view><view class="size-slider"><button aria-label="减少格数" @tap="gridSize=Math.max(16,gridSize-1)">−</button><slider :value="gridSize" :min="16" :max="87" :step="1" activeColor="#B096C3" backgroundColor="#E7E4DD" :block-size="22" @change="gridSize=Number($event.detail.value)"/><button aria-label="增加格数" @tap="gridSize=Math.min(87,gridSize+1)">＋</button></view><view class="setting-row"><text class="setting-label">风格</text><view class="options"><button v-for="style in imageStyles" :key="style.value" :class="{active:imageStyle===style.value}" @tap="imageStyle=style.value">{{style.label}}</button></view></view><view class="setting-row"><text class="setting-label">用色</text><view class="options"><button v-for="option in colorOptions" :key="option.value" :class="{active:maxColors===option.value}" @tap="maxColors=option.value">{{option.label}}</button></view></view><view class="setting-row"><text class="setting-label">色卡</text><view class="options"><button :class="{active:paletteId==='mard'}" @tap="paletteId='mard'">MARD 221</button><button :class="{active:paletteId==='hama'}" @tap="paletteId='hama'">Hama 53</button></view></view><text class="inline-tip">色卡选你手里豆子的品牌，颜色才对得上。</text><view v-if="!subjectEnabled" class="switch-row"><text>去除外围白底</text><switch :checked="removeWhite" color="#B096C3" @change="removeWhite=$event.detail.value"/></view></view>
        <view v-if="createStep===3" class="review-card"><text class="review-title">你的图纸，准备好了</text><view class="review-metrics"><view><text>{{Math.ceil(gridSize/29)**2}}</text><text>块底板</text></view><view><text>{{colorUsage.length}}</text><text>种颜色</text></view><view><text>{{totalBeads}}</text><text>颗豆子</text></view></view><text class="inline-tip">接下来可以逐格编辑，也可以备好豆子直接开拼。</text><button class="review-settings" @tap="createStep=2">再调一下尺寸配色<AppIcon name="chevron" :size="23"/></button></view>
        <view v-if="error" class="error-message">{{error}}<button @tap="updatePreview">重试</button></view>
        <view class="editor-footer"><button v-if="createStep>1" class="wizard-back" @tap="backStep">上一步</button><button class="primary-btn" :disabled="processing||!pattern||!!error||navigating||choosing" @tap="nextStep">{{processing?'正在生成预览…':createStep===1?'下一步 · 尺寸配色':createStep===2?'下一步 · 确认效果':'生成图纸，开始拼'}}<AppIcon name="arrow-right" :size="30"/></button></view>
      </template>
    </view>
    <PhotoCropper v-if="cropVisible" :src="imagePath" :composition="composition" @cancel="cropVisible=false" @apply="applyCrop"/>
    <view v-if="helpVisible" class="sheet-backdrop" @tap="helpVisible=false"><view class="bottom-sheet" @tap.stop><view class="sheet-heading"><text class="section-title">从照片，到亲手拼好</text><button class="icon-button" @tap="helpVisible=false"><AppIcon name="close" :size="30"/></button></view><view v-for="(step,i) in helpSteps" :key="i" class="help-step"><text class="step-number">{{i+1}}</text><view><text class="step-title">{{step.title}}</text><text class="step-description">{{step.description}}</text></view></view><button class="primary-btn" @tap="openGuide">看完整新手教程</button><button class="feedback-link" @tap="openPrivacy">隐私与云端服务</button><button class="feedback-link" @tap="showFeedback">联系与反馈</button></view></view>
    <view v-if="checking" class="sheet-backdrop" @touchmove.stop><view class="bottom-sheet safety-progress"><view class="spinner"/><text>{{checkStatus}}</text><text class="help-note">在本机检测，照片不会上传</text><button class="secondary-btn" @tap="cancelPickedImage">取消</button></view></view>
  </view>
</template>
<script setup>
// #ifdef APP-PLUS
import AppImageRuntime from '../../components/AppImageRuntime.vue'
// #endif
import { ref, shallowRef, computed, watch, nextTick, getCurrentInstance, onBeforeUnmount } from 'vue'
import { onShow, onHide } from '@dcloudio/uni-app'
import AppIcon from '../../components/AppIcon.vue'
import PhotoCropper from '../../components/PhotoCropper.vue'
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
import { beginSubjectEdit, consumeSubjectEdit, clearSubjectEdit } from '../../utils/subjectSession'
import { assertSafeImage } from '../../utils/contentSafety'

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
const error = ref(''), navigating = ref(false), helpVisible = ref(false), learnVisible = ref(false)
const checking = ref(false), checkStatus = ref('正在检测图片…')
const createStep=ref(1),cropVisible=ref(false),composition=ref({rotation:0,flipX:false,ratio:0,focusX:.5,focusY:.5})
const cropRatios=[{label:'原比例',value:0},{label:'正方形',value:1},{label:'竖向 3:4',value:.75},{label:'横向 4:3',value:4/3}]
const homeModalOpen = computed(() => helpVisible.value || checking.value || cropVisible.value)
const subject = shallowRef(null), subjectEnabled = ref(false)
const examples = EXAMPLES
const sizes = [29, 58, 87]
const colorOptions = [{ value: 8, label: '8 色' }, { value: 16, label: '16 色' }, { value: 24, label: '24 色' }, { value: 0, label: '不限' }]
const imageStyles = [{ value: 'illustration', label: '插画', icon: 'palette' }, { value: 'photo', label: '照片', icon: 'image' }, { value: 'pixel', label: '像素', icon: 'grid' }]
const helpSteps = [
  { title: '选图', description: '从相册选择照片，或直接使用样板。' },
  { title: '调整', description: '点「智能去背景」去掉背景，再调整尺寸和颜色。' },
  { title: '开拼', description: '放大看色号，拼完一色打勾，再导出图纸。' },
]
const totalBeads = computed(() => colorUsage.value.reduce((sum, c) => sum + c.count, 0))
const sourceLoader = createImageSourceLoader()
let pickRevision = 0
let timer, revision = 0, pageVisible = false, needsPreview = false, alive = true
onShow(() => {
  pageVisible = true
  navigating.value = false
  if (consumeNewProjectRequest()) resetImage()
  const selection = consumeSubjectEdit(imagePath.value)
  if (selection) { subject.value = selection; subjectEnabled.value = true; previewMode.value = 'pattern' }
  updateHomeTabBar(homeModalOpen.value)
  if (needsPreview && imagePath.value) schedulePreview()
})
onHide(() => { pageVisible = false; if (checking.value) cancelPickedImage(); revision++; clearTimeout(timer); uni.showTabBar({ animation: false, fail: () => {} }) })
watch(homeModalOpen, visible => { if (pageVisible) updateHomeTabBar(visible) }, { flush: 'sync' })
onBeforeUnmount(() => { alive = false; cancelPickedImage(); clearTimeout(timer); revision++; sourceLoader.clear(); releasePickedImage(imagePath.value) })
watch([composition,imagePath, gridSize, maxColors, imageStyle, fit, removeWhite, paletteId, subject, subjectEnabled], schedulePreview, { flush: 'sync' })
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
async function chooseImage() {
  if (choosing.value || navigating.value) return
  const selection = ++pickRevision
  choosing.value = true
  let pickedPath = ''
  try {
    const result = await new Promise((resolve, reject) => uni.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'], success: resolve, fail: reject }))
    const path = result.tempFilePaths?.[0]
    pickedPath = path || ''
    if (!path) return
    if (!alive || selection !== pickRevision) { releasePickedImage(path, imagePath.value); return }
    checking.value = true; checkStatus.value = '正在检测图片…'
    await assertSafeImage(path, { isCancelled: () => !alive || selection !== pickRevision, onProgress: status => { if (selection === pickRevision) checkStatus.value = status } })
    if (!alive || selection !== pickRevision) return
    checking.value = false
    sourceLoader.clear()
    releasePickedImage(imagePath.value, path)
    createStep.value=1;resetComposition()
    projectName.value = '我的小作品'
    clearSubject()
    imageStyle.value = 'illustration'
    fit.value = 'contain'; removeWhite.value = false; previewMode.value = 'pattern'
    pattern.value = null; colorUsage.value = []
    imagePath.value = path
    schedulePreview()
    uni.pageScrollTo({ scrollTop: 0, duration: 0 })
  } catch (err) {
    if (alive && selection === pickRevision && err.safetyCode && err.safetyCode !== 'cancelled') {
      uni.showModal({ title: '提示', content: err.message, showCancel: false, confirmColor: '#242321' })
    } else if (alive && selection === pickRevision && !err.safetyCode && !/cancel/i.test(err.errMsg || '')) {
      const privacy = /privacy|隐私/i.test(err.errMsg || '')
      uni.showToast({ title: privacy ? '选图需要微信隐私授权，请查看隐私指引' : '暂时无法打开相册，请检查权限', icon: 'none' })
    }
  } finally {
    releasePickedImage(pickedPath, imagePath.value)
    if (selection === pickRevision) { choosing.value = false; checking.value = false }
  }
}
function cancelPickedImage() {
  pickRevision++
  choosing.value = false
  checking.value = false
}
function releasePickedImage(path, replacement = '') {
  // #ifdef H5
  if (path?.startsWith('blob:') && path !== replacement) URL.revokeObjectURL(path)
  // #endif
}
function useExample(example) {
  if (choosing.value) return
  cancelPickedImage()
  sourceLoader.clear(); releasePickedImage(imagePath.value)
  clearSubject()
  createStep.value=2;resetComposition()
  projectName.value = example.name
  gridSize.value = 29
  paletteId.value = 'mard'; maxColors.value = 8; fit.value = 'contain'
  imageStyle.value = 'pixel'
  removeWhite.value = false
  previewMode.value = 'pattern'
  imagePath.value = `/static/examples/${example.id}.png`
  schedulePreview()
  uni.pageScrollTo({ scrollTop: 0, duration: 200 })
}
async function updatePreview() {
  clearTimeout(timer)
  const current = ++revision
  if (!imagePath.value || !pageVisible || !alive) return
  const path = imagePath.value, size = gridSize.value, palette = paletteId.value === 'mard' ? MARD_PALETTE : HAMA_PALETTE, limit = maxColors.value
  const isCancelled = () => current !== revision || !pageVisible || !alive
  const options = { composition:composition.value,style: imageStyle.value, fit: fit.value, removeWhite: removeWhite.value, subject: subjectEnabled.value ? subject.value : null, isCancelled }
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
  if (!pattern.value || processing.value || navigating.value || choosing.value || error.value) return
  navigating.value = true
  setPending(imagePath.value, pattern.value, colorUsage.value, gridSize.value, { name: projectName.value, paletteName: paletteId.value === 'mard' ? 'MARD' : 'Hama' })
  uni.navigateTo({ url: '/pages/result/result', fail: () => { navigating.value = false } })
}
function resetImage() {
  cancelPickedImage()
  revision++; clearTimeout(timer); sourceLoader.clear(); releasePickedImage(imagePath.value)
  clearSubject()
  imagePath.value = ''; pattern.value = null; colorUsage.value = []
  createStep.value=1;resetComposition()
  error.value = ''; processing.value = false; gridSize.value = 58; maxColors.value = 16
  imageStyle.value = 'illustration'; fit.value = 'contain'; removeWhite.value = false
  advanced.value = false; previewMode.value = 'pattern'
}
function clearSubject() { subject.value = null; subjectEnabled.value = false; clearSubjectEdit() }
function editSubject() {
  if (!imagePath.value || navigating.value || choosing.value) return
  beginSubjectEdit(imagePath.value, subject.value)
  navigating.value = true
  uni.navigateTo({ url: '/subject/editor/editor', fail: () => { navigating.value = false; uni.showToast({ title: '提取页面打开失败，请重试', icon: 'none' }) } })
}
function nextStep(){if(processing.value||error.value||!pattern.value)return;if(createStep.value<3){createStep.value++;uni.pageScrollTo({scrollTop:0,duration:150})}else openResult()}
function backStep(){if(createStep.value>1){createStep.value--;uni.pageScrollTo({scrollTop:0,duration:150})}else uni.showModal({title:'重新选择照片？',content:'当前的照片调整会被清除。',confirmText:'重新选择',success:result=>{if(result.confirm)resetImage()}})}
function applyCrop(value){composition.value=value;cropVisible.value=false;previewMode.value='pattern'}
function rotatePhoto(){composition.value={...composition.value,rotation:(composition.value.rotation+1)%4};previewMode.value='pattern'}
function mirrorPhoto(){composition.value={...composition.value,flipX:!composition.value.flipX};previewMode.value='pattern'}
function resetComposition(){composition.value={rotation:0,flipX:false,ratio:0,focusX:.5,focusY:.5}}
function openGuide(){helpVisible.value=false;uni.navigateTo({url:'/member/guide/guide'})}
function openTemplates() { uni.switchTab({ url: '/pages/templates/templates' }) }
function openLibrary() { uni.switchTab({ url: '/pages/history/history' }) }
function openAccount() { uni.switchTab({ url: '/pages/profile/profile' }) }

function showFeedback() { helpVisible.value = false; openAccount() }
function updateHomeTabBar(hidden) {
  const options = { animation: false, fail: () => {} }
  if (hidden) uni.hideTabBar(options)
  else uni.showTabBar(options)
}
function openPrivacy() { helpVisible.value = false; uni.navigateTo({ url: '/pages/privacy/privacy' }) }
</script>

<style scoped>
.studio-page{min-height:100vh;background:#F7F6F9;padding-bottom:35rpx;color:#312B39}.studio-page.editing{padding-bottom:190rpx}.nav-content{display:flex;align-items:center;justify-content:space-between;margin:0 36rpx}.brand{display:flex;align-items:center;gap:12rpx;font-size:32rpx;font-weight:700}.brand-tag{font-size:14rpx;letter-spacing:2rpx;color:#B0A6B9;margin-left:3rpx;font-weight:500}.help-button{width:72rpx;height:72rpx;display:flex;align-items:center;justify-content:center;background:#fff;border-radius:50%}.help-button .app-icon{opacity:.6}.page-content{padding:0 36rpx}.home-heading{padding:30rpx 0}.home-kicker{display:block;color:#95839F;font-size:16rpx;letter-spacing:2rpx;margin-bottom:12rpx}.home-title{display:block;font-size:43rpx;font-weight:700;letter-spacing:-1rpx;line-height:1.35}.create-card{position:relative;overflow:hidden;background:#EEE7F6;border-radius:34rpx;padding:32rpx 28rpx 20rpx}.hero-copy{position:relative;z-index:2}.hero-tag{display:block;font-size:21rpx;color:#806292;margin-bottom:15rpx}.hero-title{font-size:36rpx;font-weight:650;line-height:1.5;display:block;color:#4F3E61;letter-spacing:-1rpx}.hero-title>text{display:block}.hero-detail{display:block;color:#7B608D;font-size:21rpx;margin-top:14rpx}.hero-art{position:relative;height:238rpx;margin-top:14rpx}.hero-photo{position:absolute;left:22rpx;top:5rpx;transform:rotate(-9deg);width:207rpx;height:207rpx;background:#FFFFFFC9;padding:12rpx 12rpx 31rpx;border-radius:18rpx;box-shadow:0 9rpx 15rpx #63487B0A}.hero-photo image{width:100%;height:100%}.hero-photo>text{position:absolute;left:0;right:0;bottom:9rpx;text-align:center;font-size:17rpx;color:#B2A6BA}.hero-beads{position:absolute;right:27rpx;top:-18rpx;transform:rotate(7deg);width:257rpx;height:239rpx;border-radius:20rpx;background:#FFFCF7;padding:14rpx 24rpx 36rpx;box-shadow:0 10rpx 22rpx #63487B12;background-image:radial-gradient(#CDC3D880 .8rpx,transparent .8rpx);background-size:12rpx 12rpx}.hero-beads image{width:100%;height:100%}.hero-beads-label{display:flex;align-items:center;justify-content:center;gap:7rpx;position:absolute;left:0;right:0;bottom:12rpx;color:#9D88AB;font-size:18rpx}.hero-beads-label .app-icon{opacity:.45}.hero-spark{position:absolute;right:7rpx;top:-9rpx;color:#B59CCB;font-size:48rpx}.choose-photo{height:98rpx;border-radius:21rpx;background:#79638F;color:#fff;font-size:29rpx;gap:13rpx;padding:0 25rpx}.choose-photo>.app-icon{filter:none}.choose-photo>text{flex:1;text-align:left;font-weight:600}.hero-footnote{display:flex;align-items:center;justify-content:center;gap:10rpx;color:#786189;font-size:19rpx;margin-top:21rpx}.hero-footnote .app-icon{opacity:.35}.hero-footnote>view{width:4rpx;height:4rpx;border-radius:50%;background:#C7B7D2;margin:0 7rpx}.home-shortcuts{display:flex;gap:16rpx;margin-top:22rpx}.home-shortcuts>button{flex:1;min-width:0;display:flex;align-items:center;gap:14rpx;border-radius:24rpx;padding:24rpx 17rpx;background:#fff;line-height:1.4;text-align:left}.shortcut-icon{width:44rpx;display:flex;align-items:center;justify-content:center;flex-shrink:0}.shortcut-icon .app-icon{opacity:.5}.home-shortcuts>button>view:nth-child(2){flex:1;min-width:0}.home-shortcuts text{display:block;white-space:nowrap;font-size:24rpx;color:#665A70;font-weight:600}.home-shortcuts text+text{font-size:18rpx;color:#80718B;font-weight:400;margin-top:8rpx}.home-shortcuts>button>.app-icon{opacity:.35}.section-heading{display:flex;align-items:center;justify-content:space-between;margin:34rpx 0 23rpx}.section-title{display:block;font-size:31rpx;font-weight:650;color:#4C4059}.section-sub{display:block;font-size:20rpx;color:#81708D;margin-top:9rpx}.section-heading>button{display:flex;align-items:center;background:transparent;color:#7F6A8D;font-size:22rpx;padding:18rpx 0;line-height:1.4}.section-heading>button .app-icon{opacity:.35}.example-list{display:flex;gap:14rpx}.example-card{flex:1;min-width:0;background:transparent;text-align:left;line-height:1.4}.example-art{height:185rpx;border-radius:24rpx;overflow:hidden}.example-art image{width:100%;height:100%;padding:16rpx}.example-label{display:flex;justify-content:space-between;align-items:center;padding:16rpx 4rpx;font-size:22rpx;color:#796785}.example-label .app-icon{opacity:.3}.home-local-note{text-align:center;color:#9786A1;font-size:19rpx;margin-top:18rpx;letter-spacing:1rpx}
.editor-heading{display:flex;align-items:center;justify-content:space-between;padding:12rpx 0}.editor-title{display:flex;align-items:center;gap:12rpx}.editor-title>button{display:flex;background:transparent;padding:18rpx 8rpx 18rpx 0}.page-title{font-size:35rpx;font-weight:650}.text-button{background:transparent;color:#9C88AC;font-size:25rpx;padding:22rpx 0;line-height:1.4}.wizard-progress{display:flex;justify-content:space-between;margin:8rpx 0 26rpx;gap:10rpx}.wizard-progress>view{display:flex;align-items:center;gap:10rpx;flex:1;color:#BFB4C6;font-size:22rpx}.wizard-progress>view>text:first-child{width:38rpx;height:38rpx;border-radius:50%;background:#EBE5F0;display:flex;align-items:center;justify-content:center;font-size:20rpx}.wizard-progress .current{color:#7A608F}.wizard-progress .current>text:first-child{background:#D8C8E5;color:#694D81}.wizard-progress .done{color:#9B86AC}.step-caption{margin:12rpx 0 24rpx}.step-caption text{display:block;font-size:29rpx;font-weight:650}.step-caption text+text{font-size:22rpx;font-weight:400;color:#8A7995;margin-top:9rpx}.subject-card{background:#EBE2F3;border-radius:24rpx;overflow:hidden}.subject-action{width:100%;display:flex;align-items:center;gap:18rpx;padding:20rpx;text-align:left;background:transparent;line-height:1.4}.subject-icon{width:62rpx;height:64rpx;background:#DFD1EB;border-radius:18rpx;display:flex;align-items:center;justify-content:center;flex-shrink:0}.subject-copy{flex:1;min-width:0}.subject-copy text{display:block;font-size:29rpx;color:#785D8A;font-weight:650}.subject-copy text+text{font-size:20rpx;color:#826694;font-weight:400;margin-top:8rpx}.subject-cta{display:flex;align-items:center;gap:6rpx;padding:18rpx;background:#957AA8;color:#fff;font-size:22rpx;border-radius:15rpx}.restore-background{background:transparent;font-size:21rpx;color:#A08BAE;padding:13rpx;line-height:1.4;border-top:1rpx solid #DACBE5}.preview-card{padding:22rpx;margin-top:20rpx;background:#fff;border-radius:26rpx}.preview-toolbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:16rpx}.segment{display:flex;background:#F4F1F6;border-radius:15rpx;padding:4rpx}.segment>button{padding:14rpx 20rpx;font-size:22rpx;background:transparent;color:#8C799B;line-height:1.3;border-radius:12rpx}.segment>button.selected{background:#fff;color:#7F6B90}.preview-status{color:#897C94;font-size:20rpx}.preview-stage{position:relative;display:flex;align-items:center;justify-content:center;border-radius:16rpx;overflow:hidden;background:#F6F4F8}.original-image{width:100%;height:100%}.preview-loading{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#F6F4F8AA}.preview-stats{display:flex;justify-content:center;gap:30rpx;padding-top:18rpx;color:#887595;font-size:22rpx}.composition-tools{display:flex;gap:12rpx;margin-top:20rpx}.composition-tools button{flex:1;display:flex;align-items:center;flex-direction:column;gap:12rpx;background:#fff;border-radius:20rpx;padding:24rpx 6rpx;font-size:23rpx;line-height:1.4;color:#80698E}.composition-tools .app-icon{opacity:.5}.mirror-icon{font-size:38rpx;line-height:34rpx;height:34rpx}.settings-card{background:#fff;padding:28rpx;border-radius:26rpx;margin-top:20rpx}.settings-heading{display:flex;justify-content:space-between;align-items:center;font-size:28rpx;font-weight:600}.settings-heading text+text{font-size:20rpx;color:#887594;font-weight:400}.size-presets{display:flex;gap:12rpx;margin:22rpx 0 8rpx}.size-presets>button{flex:1;border:2rpx solid #F0EBF4;padding:23rpx 4rpx;background:#fff;border-radius:20rpx;line-height:1.4}.size-presets text{display:block;font-size:26rpx;font-weight:650;color:#80668F}.size-presets text+text{font-size:20rpx;font-weight:400;color:#8E7B9A;margin-top:8rpx}.size-presets>button.active{border-color:#B99BD0;background:#F2EAF8}.size-slider{display:flex;align-items:center;margin:14rpx 0}.size-slider slider{flex:1;min-width:0}.size-slider button{width:70rpx;height:72rpx;line-height:72rpx;background:transparent;font-size:36rpx;color:#A28BAF}.setting-row{display:flex;align-items:center;gap:18rpx;padding:14rpx 0}.setting-label{font-size:23rpx;width:52rpx;flex-shrink:0;color:#8A719C}.options{display:flex;gap:8rpx;flex:1;min-width:0}.options button{flex:1;min-width:0;padding:18rpx 2rpx;font-size:23rpx;background:#F6F3F8;color:#8A719A;line-height:1.3;border:1rpx solid transparent;border-radius:13rpx;white-space:nowrap}.options button.active{background:#EDE3F5;border-color:#D8C4E6;color:#8F6FA5}.inline-tip{display:block;font-size:22rpx;line-height:1.6;color:#A08EAB;margin:18rpx 0}.switch-row{display:flex;align-items:center;justify-content:space-between;font-size:23rpx;min-height:84rpx;color:#AC99BA}.editor-footer{position:fixed;bottom:var(--window-bottom,0px);left:0;right:0;z-index:8;padding:16rpx 36rpx calc(16rpx + env(safe-area-inset-bottom));display:flex;gap:20rpx;align-items:center;background:#FAF8FCEE;border-top:1rpx solid #EEE7F3}.editor-footer .primary-btn{flex:1;min-width:0;height:98rpx;background:#89719C;color:#fff;font-size:27rpx}.editor-footer .app-icon{filter:none}.wizard-back{background:transparent;color:#AA95B8;padding:24rpx 8rpx;font-size:25rpx}.error-message{padding:22rpx;border-radius:16rpx;margin-top:20rpx;background:#F9ECE9;color:#B48A80;font-size:23rpx}.error-message button{background:transparent;color:inherit;display:inline;font-size:23rpx;margin-left:15rpx}.review-card{padding:30rpx;background:#fff;border-radius:26rpx;margin-top:20rpx}.review-title{font-size:31rpx;font-weight:650}.review-metrics{display:flex;margin:30rpx 0}.review-metrics>view{flex:1;text-align:center}.review-metrics text{display:block;font-size:41rpx;color:#9677AB}.review-metrics text+text{font-size:21rpx;color:#8D739F;margin-top:9rpx}.review-settings{width:100%;display:flex;align-items:center;justify-content:space-between;background:#F4EEF8;padding:24rpx;border-radius:16rpx;font-size:23rpx;color:#80618F;line-height:1.3}.spinner{width:42rpx;height:42rpx;border:4rpx solid #E8DFEF;border-top-color:#AA8FC0;border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.safety-progress{display:flex;flex-direction:column;align-items:center;gap:24rpx;text-align:center}.safety-progress>.secondary-btn{width:100%}.help-step{display:flex;gap:20rpx;margin:28rpx 0}.step-number{display:flex;align-items:center;justify-content:center;width:48rpx;height:48rpx;background:#EDE5F4;border-radius:50%;font-size:23rpx;flex-shrink:0;color:#9E80B5}.step-title{display:block;font-size:28rpx;font-weight:600}.step-description{display:block;font-size:23rpx;color:#8C759B;line-height:1.6;margin-top:8rpx}.help-note{font-size:22rpx;color:#9681A3}.feedback-link{background:transparent;color:#9681A3;font-size:23rpx;padding:22rpx 0 0}
@media(min-width:768px){.editor-footer{width:480px;left:50%;right:auto;transform:translateX(-50%)}}@media(max-width:350px){.home-title{font-size:40rpx}.hero-art{height:224rpx}.hero-photo{width:180rpx;height:180rpx;left:5rpx}.hero-beads{width:227rpx;height:217rpx;right:12rpx}.home-shortcuts{gap:10rpx}.home-shortcuts>button{padding:23rpx 12rpx;gap:7rpx}.home-shortcuts text{font-size:23rpx}.home-shortcuts text+text{font-size:17rpx}.home-shortcuts>button>.app-icon{display:none}.example-art{height:166rpx}.choose-photo{font-size:27rpx}.subject-copy text+text{font-size:18rpx}}
</style>
