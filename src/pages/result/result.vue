<template>
  <view class="result-page" :class="{'focus-mode':playing}"><!-- #ifdef APP-PLUS --><AppImageRuntime/><!-- #endif -->
    <view v-if="!pattern" class="empty-result"><AppIcon name="grid" :size="80" /><text>{{ initializing ? loadStatus : loadError || '还没有打开图纸' }}</text><button v-if="loadError" class="primary-btn" :disabled="initializing" @tap="initialize">重新打开</button><button class="secondary-btn" @tap="goHome">返回创作台</button></view>
    <template v-else>
      <view class="result-heading"><button class="project-name" @tap="rename"><text>{{ name }}</text><AppIcon name="edit" :size="28" /></button><text class="saved-state" :class="{ unsaved: !currentSaved }">{{ saveStatus }}</text></view>
      <view class="project-meta"><text>{{ gridSize }} × {{ gridSize }} 格</text><text>{{ colorUsage.length }} 色</text><text>{{ totalBeads.toLocaleString() }} 颗</text></view>
      <view class="creation-complete" v-if="!playing"><text>图纸已就绪</text><text>① 精修图纸　② 备好豆子　③ 开始拼</text></view><view class="cloud-work-toolbar"><button :class="{active:editing}" :disabled="editorSaving" @tap="toggleEditing">{{editing?'返回图纸':'逐格编辑'}}</button><button @tap="open3d">成品预览</button><button @tap="openInventory">我的豆盒</button><button class="play-toggle" :class="{active:playing}" @tap="togglePlaying">{{playing?'退出开拼':'开始拼'}}</button><button class="login-save" v-if="!cloudSession.user" @tap="openAccount">登录保存</button></view>
      <view v-if="cloudError" class="cloud-save-error">{{cloudError}}<button @tap="retryCloudSave">重试保存</button></view>
      <PatternEditor v-if="editing" ref="pixelEditor" :pattern="pattern" :palette="activePalette" :saving="editorSaving" fullscreen @close="toggleEditing" @save="saveEdited" />
      <view v-show="!editing" class="pattern-card">
        <view class="pattern-top"><view class="result-segment"><button :class="{ selected: viewMode === 'grid' }" @tap="viewMode = 'grid'">图纸</button><button :class="{ selected: viewMode === 'beads' }" @tap="viewMode = 'beads'">成品</button></view><button class="reset-button" aria-label="看全图" @tap="resetView"><AppIcon name="expand" :size="28" /><text>看全图</text></button></view>
        <scroll-view v-if="boardCount > 1" scroll-x class="board-scroll"><view class="board-list"><button :class="{ active: boardIndex === -1 }" @tap="selectBoard(-1)">全部</button><button v-for="(board, i) in boards" :key="i" :class="{ active: boardIndex === i }" @tap="selectBoard(i)">{{ board.label }}</button></view></scroll-view>
        <TouchViewport :key="viewKey" :width="viewport" :height="viewport" :content-width="viewport" :content-height="viewport" :max="8" :command="touchCommand" @change="zoom=$event.scale"><canvas type="2d" id="patternCanvas" canvas-id="patternCanvas" :style="{width:viewport+'px',height:viewport+'px'}"/></TouchViewport>
        <view class="canvas-controls"><view v-if="viewMode === 'grid'" class="label-control"><text>显示色号</text><switch :checked="showLabels" color="#242321" style="transform:scale(.75);transform-origin:left center" @change="toggleLabels" /></view><text v-else class="beads-label">成品预览</text><view class="zoom-controls"><button aria-label="缩小图纸" :disabled="zoom <= 1" @tap="changeZoom(-.5)"><AppIcon name="minus" :size="28" /></button><text>{{ Math.round(zoom * 100) }}%</text><button aria-label="放大图纸" :disabled="zoom >= 8" @tap="changeZoom(.5)"><AppIcon name="plus" :size="28" /></button></view></view>
        <text class="canvas-hint">{{ showLabels && viewMode === 'grid' && boardCount > 1 && boardIndex < 0 ? '色号较密，可选上方底板分块查看' : '双指缩放 · 放大后可拖动 · 点「看全图」还原' }}</text>
      </view>
      <view v-if="playing" class="focus-color-panel"><scroll-view scroll-x class="focus-color-scroll"><view class="focus-colors"><button v-for="color in colorUsage" :key="color.code" :class="{active:selectedCode===color.code,done:completedCodes.includes(color.code)}" @tap="selectedCode=color.code"><view :style="{background:color.hex}"/><text>{{color.code}}</text><text>{{completedCodes.includes(color.code)?'✓':color.count+' 颗'}}</text></button></view></scroll-view><button v-if="selectedColor" class="primary-btn finish-color" @tap="completeAndNext">{{completedCodes.includes(selectedCode)?'已完成这色 · 下一色':'拼完 '+selectedCode+'，标记完成'}}</button><text class="focus-tip">只高亮当前色号 · 拼完一种，再接着下一种</text></view><view v-if="!playing&&selectedColor" class="selected-banner"><view class="selected-dot" :style="{ background: selectedColor.hex }" /><text>{{ selectedColor.code }}</text><text class="selected-count">{{ selectedColor.count }} 颗</text><button aria-label="取消颜色高亮" @tap="selectedCode = ''"><AppIcon name="close" :size="28" /></button></view>
      <view class="progress-card"><view class="progress-heading"><text>完成 {{ completedCodes.length }} / {{ colorUsage.length }} 色</text><text>{{ progress }}%</text></view><view class="progress-track"><view :style="{ width: progress + '%' }" /></view></view>
      <view class="material-card"><view class="material-heading"><button class="material-disclosure" :aria-expanded="materialsExpanded" @tap="materialsExpanded=!materialsExpanded">材料与底板 <text>{{materialsExpanded ? "收起" : "展开"}}</text></button><button @tap="beadSize=beadSize===5?2.6:5;persist({beadSize})">{{beadSize}}mm 豆 ▾</button></view><view v-if="materialsExpanded"><text class="material-summary">约 {{report.widthCm.toFixed(1)}} × {{report.widthCm.toFixed(1)}} cm · {{report.boardCount}} 块底板 · 材料约 ¥{{(report.costCents/100).toFixed(2)}}</text><view class="material-actions"><button @tap="showShortage=!showShortage">缺豆 {{report.shortage}} 颗 {{showShortage?'▴':'▾'}}</button><button :disabled="!inventory.length" @tap="previewInventoryMapping">尝试库存配色</button></view><view v-if="showShortage" class="shortage-list"><text v-for="color in report.colors.filter(item=>item.shortage>0)" :key="color.code">{{color.code}}：需要 {{color.count}}，库存 {{color.stock}}，缺 {{color.shortage}}</text><text v-if="!report.shortage">已有库存足够完成这份作品。</text></view><view class="board-progress"><button v-for="(board,index) in boards" :key="index" :class="{done:completedBoards.includes(index)}" @tap="toggleBoard(index)">{{completedBoards.includes(index)?'✓':'○'}} {{board.label}}</button></view><text class="material-note">底板与逐色进度分别记录。费用按豆盒中的单颗成本估算。</text></view></view>
      <ColorUsageList v-if="!playing" :palette-name="paletteName" :colors="colorUsage" :selected="selectedCode" :completed="completedCodes" @select="selectColor" @complete="toggleCompleted" @copy="copyList" />
      <text class="result-note">{{beadSize}}mm 豆 · 约 {{report.widthCm.toFixed(1)}} × {{report.widthCm.toFixed(1)}} cm</text>
      <button v-if="attribution" class="result-attribution" @tap="copyAttribution">{{ attribution.title }} · {{ attribution.author }} · {{ attribution.license }} · 已修改<AppIcon name="copy" :size="21" /></button>
      <view v-if="!editing&&!playing" class="bottom-actions"><button class="secondary-btn" @tap="openLibrary"><AppIcon name="folder" :size="30" /><text>作品</text></button><button class="primary-btn" :disabled="exporting" @tap="exportVisible = true"><AppIcon name="download" :size="30" light /><text>{{ exporting ? '导出中…' : '导出图纸' }}</text></button></view>
    </template>
    <canvas type="2d" id="exportCanvas" canvas-id="exportCanvas" class="hidden-canvas" />
    <view v-if="exportVisible" class="sheet-backdrop" @tap="exportVisible = false"><view class="bottom-sheet" @tap.stop><view class="sheet-handle" /><view class="sheet-heading"><text class="section-title">导出图片</text><button class="icon-button" aria-label="关闭导出" @tap="exportVisible = false"><AppIcon name="close" :size="30" /></button></view><button class="export-option" @tap="saveImage(true)"><AppIcon name="grid" :size="40" /><view><text class="export-title">色号图纸</text><text class="export-sub">坐标、色号、用豆清单</text></view><AppIcon name="chevron" :size="28" /></button><button class="export-option" @tap="printPdf(false)"><AppIcon name="grid" :size="40"/><view><text class="export-title">A4 分页 PDF · 彩色</text><text class="export-sub">按底板打印，包含校准尺与用豆清单</text></view></button><button class="export-option" @tap="printPdf(true)"><AppIcon name="grid" :size="40"/><view><text class="export-title">A4 分页 PDF · 省墨</text><text class="export-sub">黑白色号版，需要打印次数或 Pro</text></view></button><!-- #ifndef APP-PLUS --><button class="export-option" @tap="backupProject"><AppIcon name="folder" :size="40"/><view><text class="export-title">可编辑工程备份</text><text class="export-sub">保留图纸、来源署名与制作进度</text></view></button><!-- #endif --><button class="export-option" @tap="saveImage(false)"><AppIcon name="sparkles" :size="40" /><view><text class="export-title">成品效果</text><text class="export-sub">拼豆效果图</text></view><AppIcon name="chevron" :size="28" /></button></view></view>
  </view>
</template>

<script setup>
// #ifdef APP-PLUS
import AppImageRuntime from '../../components/AppImageRuntime.vue'
// #endif
import { ref, shallowRef, computed, nextTick, watch, getCurrentInstance } from 'vue'
import { onLoad, onReady, onUnload, onShow } from '@dcloudio/uni-app'
import AppIcon from '../../components/AppIcon.vue'
import PatternEditor from '../../components/PatternEditor.vue'
import TouchViewport from '../../components/TouchViewport.vue'
import ColorUsageList from '../../components/ColorUsageList.vue'
import { setPreviewWork } from '../../utils/studioSession'
import { getPatternById, savePattern, updatePattern } from '../../utils/storage'
import { getPending } from '../../utils/appState'
import { drawPatternAsync, drawForExport } from '../../utils/canvasRenderer'
import { getCanvasNode, captureCanvas } from '../../utils/canvas'
import { getCloudWork, saveCloudWork, cachedCloudWork } from '../../utils/cloudWorks'
import { cloudSession, request, isLoggedIn, requireLogin, newRequestKey, saveDownload, saveTextFile } from '../../utils/cloud'
import { summarizePattern, inventoryReport, remapToInventory, encodeProject, reconcileProgress } from '../../utils/patternTools.mjs'
import { MARD_PALETTE, HAMA_PALETTE } from '../../utils/beadPalette'
import { resolvePackagedTemplate } from '../../utils/templates'
import { assertSafePattern } from '../../utils/contentSafety'

const paletteName = ref('Hama')
const attribution = ref(null)
const instance = getCurrentInstance()
const pattern = shallowRef(null), gridSize = ref(29), colorUsage = shallowRef([]), name = ref('我的小作品')
const playing=ref(false)
const localRecordId=ref(''),localSaved=ref(false)
const recordId = ref(''), completedCodes = ref([]), saved = ref(false)
const workVersion=ref(0),cloudSaving=ref(false),cloudError=ref(''),editing=ref(false),editorSaving=ref(false),pixelEditor=ref(null),inventory=ref([]),beadSize=ref(5),completedBoards=ref([]),showShortage=ref(false),materialsExpanded=ref(false)
const currentSaved=computed(()=>isLoggedIn()?saved.value:localSaved.value)
const saveStatus=computed(()=>cloudSaving.value?'云端保存中…':isLoggedIn()?(saved.value?'已保存云端':'待保存'):(localSaved.value?'已保存在本机':'待保存本机'))
const activePalette=computed(()=>paletteName.value==='MARD'?MARD_PALETTE:HAMA_PALETTE)
const report=computed(()=>inventoryReport(pattern.value||[],inventory.value,beadSize.value))
let saveQueue=Promise.resolve(),pdfRequestKey='',workCreateKey=newRequestKey('work')
let contentRevision=0,pendingSaves=0,initializationRunning=false,inventoryRevision=0,workRevision=0
let workOwner='', ready=false
const viewMode = ref('grid'), showLabels = ref(false), selectedCode = ref(''), boardIndex = ref(-1)
// Gesture state is display-only; button/reset commands enter TouchViewport separately.
const touchCommand=ref(null)
const zoom = ref(1), scaleCommand = ref(1), viewKey = ref(0), exportVisible = ref(false), exporting = ref(false)
const loadStatus=ref('正在打开图纸…')
const initializing = ref(false), loadError = ref(''), renaming = ref(false), templateId = ref('')
const viewport = Math.floor(Math.min(uni.getSystemInfoSync().windowWidth, 480) * (1 - 104 / 750) - 2)
const totalBeads = computed(() => colorUsage.value.reduce((n, c) => n + c.count, 0))
const completedBeads = computed(() => colorUsage.value.filter(c => completedCodes.value.includes(c.code)).reduce((n, c) => n + c.count, 0))
const progress = computed(() => totalBeads.value ? Math.round(completedBeads.value / totalBeads.value * 100) : 0)
const selectedColor = computed(() => colorUsage.value.find(c => c.code === selectedCode.value))
const boardCount = computed(() => Math.ceil(gridSize.value / 29) ** 2)
const boards = computed(() => {
  const count = Math.ceil(gridSize.value / 29), list = []
  for (let r = 0; r < count; r++) for (let c = 0; c < count; c++) list.push({ row: r * 29, col: c * 29, label: `${String.fromCharCode(65 + r)}${c + 1} 底板` })
  return list
})
let canvasNode = null, renderRevision = 0, renderTimer, alive = true, zoomCommandRevision = 0
let draft = null
const exportPaths = new Map()

function workContext(){return{revision:workRevision,owner:cloudSession.user?.id||'',token:cloudSession.token}}
function isCurrentWork(context){return alive&&context.revision===workRevision&&context.owner===(cloudSession.user?.id||'')&&context.token===cloudSession.token}
function cancelPendingWork(){
  workRevision++;inventoryRevision++;renderRevision++
  saveQueue=Promise.resolve();pendingSaves=0;cloudSaving.value=false;editorSaving.value=false;exporting.value=false;initializing.value=false;initializationRunning=false
}
function invalidateAccountWork(){
  cancelPendingWork();pattern.value=null;draft=null;saved.value=false;localSaved.value=false;editing.value=false;inventory.value=[]
  recordId.value='';localRecordId.value='';workVersion.value=0
  loadError.value='账号已切换，请从当前账号的作品库重新打开'
}
watch(()=>cloudSession.user?.id||'',owner=>{if(alive&&workOwner&&owner!==workOwner)invalidateAccountWork()},{flush:'sync'})
onLoad(() => {
  const pending = getPending()
  if (!pending.pattern) return
  cancelPendingWork();workOwner=cloudSession.user?.id||''
  const stored = pending.id?.startsWith('pattern_') ? getPatternById(pending.id) : pending.id ? cachedCloudWork(pending.id) : null
  draft = { ...pending, ...stored, name: stored?.name || pending.name || '我的小作品', paletteName: stored?.paletteName || pending.paletteName || 'Hama' }
})
onReady(()=>{ready=true;return initialize()})
onShow(async()=>{
  if(!alive||!ready||!pattern.value)return
  const owner=cloudSession.user?.id||''
  if(workOwner&&owner!==workOwner){invalidateAccountWork();return}
  if(owner){workOwner=owner;await Promise.all([loadInventory(),!saved.value&&!cloudSaving.value?persist():Promise.resolve()])}
})
async function loadInventory(){
  const current=++inventoryRevision,owner=cloudSession.user?.id
  if(!owner)return
  try{const items=await request('/inventory');if(alive&&current===inventoryRevision&&owner===cloudSession.user?.id)inventory.value=items.filter(item=>item.paletteId===paletteName.value.toLowerCase())}
  catch(e){if(alive&&current===inventoryRevision&&owner===cloudSession.user?.id)uni.showToast({title:'豆盒暂未加载，可稍后重新打开',icon:'none'})}
}
async function initialize() {
  if (!alive || !draft || initializationRunning) return
  const context=workContext()
  let openingDraft=draft
  initializationRunning=true
  initializing.value = true; loadError.value = '';loadStatus.value='正在打开图纸…'
  pattern.value = null; saved.value = false;localSaved.value=false
  try {
    if (openingDraft.id && !openingDraft.id.startsWith('pattern_') && isLoggedIn()) openingDraft = { ...openingDraft, ...await getCloudWork(openingDraft.id) }
    if(!isCurrentWork(context))return
    const fixed = resolvePackagedTemplate(openingDraft)
    if (fixed) openingDraft = { ...openingDraft, ...fixed }
    await assertSafePattern(openingDraft, { isCancelled: () => !isCurrentWork(context),onProgress:message=>{if(isCurrentWork(context))loadStatus.value=message} })
    if (!isCurrentWork(context)) return
    draft=openingDraft
    pattern.value = draft.pattern; gridSize.value = draft.gridSize; colorUsage.value = draft.colorUsage || []
    name.value = draft.name; paletteName.value = draft.paletteName; attribution.value = draft.attribution || null; templateId.value = fixed?.templateId || draft.templateId || ''
    completedCodes.value=draft.completedCodes||[];completedBoards.value=draft.completedBoards||[];beadSize.value=draft.beadSize||5
    localRecordId.value=draft.id?.startsWith('pattern_')?draft.id:''
    recordId.value=localRecordId.value?'':draft.id||'';workVersion.value=draft.version||0
    saved.value=!!recordId.value
    initializing.value=false
    await nextTick(); await render()
    if(!isCurrentWork(context))return
    if(!isLoggedIn())await persist()
    if(isLoggedIn()&&isCurrentWork(context)){workOwner=cloudSession.user.id;await Promise.all([loadInventory(),!recordId.value?persist():Promise.resolve()])}
  } catch (error) { if (isCurrentWork(context)) loadError.value = error.safetyCode ? error.message : '图纸打开失败，请重试' }
  finally { if(alive&&context.revision===workRevision){initializing.value = false;initializationRunning=false} }
}
function scheduleRender() { renderRevision++; clearTimeout(renderTimer); renderTimer = setTimeout(() => nextTick(render), 16) }
watch([viewMode, showLabels, selectedCode, boardIndex, viewKey], scheduleRender)
watch(editing,value=>{if(!value)scheduleRender()})
onUnload(() => { alive = false; cancelPendingWork(); zoomCommandRevision++; clearTimeout(renderTimer) })

async function render() {
  const current = ++renderRevision
  if (!pattern.value || !alive || editing.value) return
  canvasNode = await getCanvasNode('#patternCanvas', instance)
  if (!canvasNode || !alive || current !== renderRevision) return
  let cells = pattern.value, size = gridSize.value, offsets = {}
  if (boardIndex.value >= 0) {
    const board = boards.value[boardIndex.value]
    cells = cells.slice(board.row, board.row + 29).map(row => row.slice(board.col, board.col + 29))
    size = cells.length; offsets = { rowOffset: board.row, colOffset: board.col }
  }
  try {
    await drawPatternAsync(canvasNode, cells, size, showLabels.value && viewMode.value === 'grid', viewport, { mode: viewMode.value, highlight: selectedCode.value, axis: viewMode.value === 'grid', detailScale: 4, ...offsets, isCancelled: () => !alive || current !== renderRevision })
  } catch (error) { if (error.name !== 'AbortError') uni.showToast({ title: '图纸绘制失败，请重试', icon: 'none' }) }
}
function resetView() { zoomCommandRevision++; zoom.value = 1; scaleCommand.value = 1; touchCommand.value={reset:true,serial:Date.now()}; viewKey.value++ }
function changeZoom(amount) {
  if(!alive)return
  const target=Math.max(1,Math.min(8,Math.round((zoom.value+amount)*100)/100))
  if(target===zoom.value)return
  scaleCommand.value=target
  touchCommand.value={scale:target,serial:++zoomCommandRevision}
  zoom.value=target
}
function handleScale(event) {
  const sourceView = event.currentTarget?.dataset?.viewKey
  if (sourceView !== undefined && Number(sourceView) !== viewKey.value) return
  const scale = Number(event.detail?.scale)
  if (Number.isFinite(scale) && scale > 0) zoom.value = Math.max(1, Math.min(8, scale))
}
function selectBoard(index) { boardIndex.value = index; resetView() }
function toggleLabels(event) {
  showLabels.value = event.detail.value
}
function selectColor(code) { selectedCode.value = selectedCode.value === code ? '' : code }
function currentContent() { return { createKey:workCreateKey,templateId: templateId.value, pattern: pattern.value, gridSize: gridSize.value, colorUsage: colorUsage.value, name: name.value, paletteName: paletteName.value, attribution: attribution.value, completedCodes:completedCodes.value, completedBoards:completedBoards.value, beadSize:beadSize.value, unitCostCents:draft?.unitCostCents??1 } }
function persist(changes = {}) {
  if (!alive || !pattern.value || initializing.value) return Promise.resolve(false)
  if(workOwner&&(cloudSession.user?.id||'')!==workOwner){cloudError.value='账号已切换，请重新打开作品';return Promise.resolve(false)}
  const change=++contentRevision
  saved.value=false;localSaved.value=false
  if(!isLoggedIn()){
    try{const snapshot={...currentContent(),...changes};if(localRecordId.value)updatePattern(localRecordId.value,snapshot);else localRecordId.value=savePattern(snapshot);localSaved.value=true;cloudError.value='';return Promise.resolve(true)}catch{cloudError.value='本机存储空间不足，请先导出工程备份';return Promise.resolve(false)}
  }
  workOwner=cloudSession.user.id
  const snapshot={...currentContent(),...changes},context=workContext()
  pendingSaves++;cloudSaving.value=true
  saveQueue=saveQueue.catch(()=>{}).then(async()=>{
    try {
      if(!isCurrentWork(context))return false
      cloudError.value=''
      const stored=await saveCloudWork({...snapshot,...(recordId.value?{id:recordId.value,version:workVersion.value}:{})})
      if(!isCurrentWork(context))return false
      recordId.value=stored.id;workVersion.value=stored.version;saved.value=change===contentRevision
      return true
    }
    catch(e){if(isCurrentWork(context)){saved.value=false;cloudError.value=e.message}return false}
    finally{if(alive&&context.revision===workRevision){pendingSaves--;cloudSaving.value=pendingSaves>0}}
  })
  return saveQueue
}
function retryCloudSave(){persist()}
function toggleEditing(){
  if(editorSaving.value)return
  if(editing.value&&pixelEditor.value?.hasUnsavedChanges){uni.showModal({title:'放弃这次编辑？',content:'尚未保存的格子修改会丢失。',confirmText:'放弃修改',success:result=>{if(alive&&result.confirm)editing.value=false}});return}
  editing.value=!editing.value
}
function openAccount(){uni.navigateTo({url:'/member/account/account'})}
function open3d(){setPreviewWork(currentContent());uni.navigateTo({url:'/member/preview/preview'})}
function togglePlaying(){playing.value=!playing.value;if(playing.value){showLabels.value=true;viewMode.value='grid';selectedCode.value=colorUsage.value.find(color=>!completedCodes.value.includes(color.code))?.code||colorUsage.value[0]?.code||''}else selectedCode.value='';resetView();uni.pageScrollTo({scrollTop:0,duration:0})}
async function completeAndNext(){
  const code=selectedCode.value,context=workContext()
  if(!alive||!code)return
  const stored=!completedCodes.value.includes(code)?await toggleCompleted(code):currentSaved.value||await persist()
  if(!stored||!isCurrentWork(context))return
  const next=colorUsage.value.find(color=>!completedCodes.value.includes(color.code))
  if(next)selectedCode.value=next.code
  else uni.showModal({title:'每一颗，都拼好了',content:'所有颜色已标记完成。核对图纸后，按豆子厂商说明熨烫定型。',showCancel:false})
}
function openInventory(){uni.navigateTo({url:'/member/inventory/inventory'})}
function toggleBoard(index){completedBoards.value=completedBoards.value.includes(index)?completedBoards.value.filter(value=>value!==index):[...completedBoards.value,index];persist({completedBoards:completedBoards.value})}
async function saveEdited(cells){
  if(!alive||!pattern.value||editorSaving.value)return
  const context=workContext()
  editorSaving.value=true
  try{
    const content={...currentContent(),pattern:cells,colorUsage:summarizePattern(cells)}
    await assertSafePattern(content,{isCancelled:()=>!isCurrentWork(context)})
    if(!isCurrentWork(context))return
    const progress=reconcileProgress(pattern.value,cells,completedCodes.value,completedBoards.value)
    const stored=await persist({...content,...progress,templateId:''})
    if(!isCurrentWork(context))return
    if(!stored){uni.showToast({title:cloudError.value||'保存失败，请重试',icon:'none'});return}
    pattern.value=cells;colorUsage.value=content.colorUsage
    completedCodes.value=progress.completedCodes;completedBoards.value=progress.completedBoards
    if(!content.colorUsage.some(color=>color.code===selectedCode.value))selectedCode.value=''
    templateId.value='';exportPaths.clear();pdfRequestKey='';editing.value=false
  }
  catch(e){if(isCurrentWork(context)&&e.safetyCode!=='cancelled')uni.showToast({title:e.message,icon:'none'})}
  finally{if(alive&&context.revision===workRevision)editorSaving.value=false}
}
async function previewInventoryMapping(){
  try{const available=new Set(inventory.value.filter(item=>item.quantity>0).map(item=>item.code));const mapped=remapToInventory(pattern.value,activePalette.value.filter(color=>available.has(color.code)));const before=colorUsage.value.length,after=summarizePattern(mapped).length;uni.showModal({title:'使用库存中的颜色',content:`将 ${before} 种颜色映射为库存中的 ${after} 种颜色。颜色可能有明显变化；应用后可在逐格编辑中继续调整。`,confirmText:'应用配色',success:result=>{if(result.confirm)saveEdited(mapped)}})}catch(e){uni.showToast({title:e.message,icon:'none'})}
}
async function backupProject(){try{await saveTextFile(encodeProject(currentContent()),`douwu-${Date.now()}.json`);exportVisible.value=false}catch(e){uni.showToast({title:e.message||'备份失败',icon:'none'})}}
async function printPdf(monochrome){
  if(!requireLogin())return
  if(!alive||!pattern.value||exporting.value)return
  const context=workContext()
  exporting.value=true;exportVisible.value=false
  try{
    await assertSafePattern(currentContent(),{isCancelled:()=>!isCurrentWork(context)})
    if(!isCurrentWork(context))return
    const stored=await persist()
    if(!isCurrentWork(context))return
    if(!stored||!saved.value||!recordId.value)throw new Error('请先把作品保存到云端')
    if(!pdfRequestKey)pdfRequestKey=newRequestKey('pdf')
    const job=await request(`/works/${recordId.value}/exports`,{method:'POST',data:{idempotencyKey:`${pdfRequestKey}-${monochrome}-${beadSize.value}`,monochrome,beadSize:beadSize.value}})
    if(isCurrentWork(context))await saveDownload(job.downloadPath,`${name.value}.pdf`)
  }catch(e){if(isCurrentWork(context)&&e.safetyCode!=='cancelled')uni.showModal({title:'分页打印',content:e.message,showCancel:false})}
  finally{if(alive&&context.revision===workRevision)exporting.value=false}
}

function toggleCompleted(code) {
  completedCodes.value = completedCodes.value.includes(code) ? completedCodes.value.filter(c => c !== code) : [...completedCodes.value, code]
  return persist({ completedCodes: completedCodes.value })
}
function rename() {
  if (renaming.value || exporting.value) return
  renaming.value = true
  uni.showModal({ title: '给作品起个名字', editable: true, placeholderText: name.value, confirmText: '保存', confirmColor: '#242321', success: result => {
    if (!result.confirm || !result.content?.trim()) return
    const value = result.content.trim().slice(0, 24)
    if (alive) { name.value = value; persist({ name: value }) }
  }, complete: () => { renaming.value = false } })
}
function copyList() {
  if (renaming.value) return
  const title = name.value
  if (!alive) return
  const lines = [`${title} · ${gridSize.value} × ${gridSize.value}`, `${paletteName.value} 色卡 / 共 ${totalBeads.value} 颗`, ...colorUsage.value.map(c => `${c.code} ${c.name} × ${c.count}`)]
  uni.setClipboardData({ data: lines.join('\n') })
}
function copyAttribution() {
  const source = attribution.value
  if (source) uni.setClipboardData({ data: `${source.title} · ${source.author}\n${source.url}\n${source.license}: ${source.licenseUrl}\n已修改为 MARD 像素图纸` })
}
async function saveImage(labels) {
  if (exporting.value || renaming.value || !pattern.value) return
  exportVisible.value = false; exporting.value = true
  let loadingVisible = true
  const hideProgress = () => { if (loadingVisible) { uni.hideLoading(); loadingVisible = false } }
  uni.showLoading({ title: '正在生成高清图' })
  try {
    await assertSafePattern(currentContent(), { isCancelled: () => !alive })
    if (!alive) return
    const key = `${labels}:${name.value}`
    let path = exportPaths.get(key)
    if (!path) {
      const canvas = await getCanvasNode('#exportCanvas', instance)
      if (!canvas) throw new Error('画布未就绪，请重试')
      drawForExport(canvas, pattern.value, gridSize.value, labels, { name: name.value, colorUsage: colorUsage.value, paletteName: paletteName.value, attribution: attribution.value })
      path = await captureCanvas(canvas, 'exportCanvas')
      exportPaths.set(key, path)
    }
    if (!alive) return
    // #ifdef H5
    const link = document.createElement('a'); link.href = path; link.download = `${name.value}-${labels ? '色号图纸' : '成品效果'}.png`; link.click()
    // #endif
    // #ifdef MP-WEIXIN || APP-PLUS
    await new Promise((resolve, reject) => uni.saveImageToPhotosAlbum({ filePath: path, success: resolve, fail: reject }))
    // #endif
    hideProgress(); uni.showToast({ title: '高清图纸已保存', icon: 'success' })
  } catch (err) {
    hideProgress()
    if (err.safetyCode) {
      if (alive && err.safetyCode !== 'cancelled') uni.showModal({ title: '提示', content: err.message, showCancel: false, confirmColor: '#242321' })
    } else if (/privacy|隐私/i.test(err.errMsg || '')) {
      uni.showToast({ title: '保存需要微信隐私授权，请查看隐私指引', icon: 'none' })
    } else if (/auth|deny|denied/i.test(err.errMsg || '')) {
      uni.showModal({ title: '需要相册权限', content: '在设置中允许保存到相册，就能把图纸带走。', confirmText: '去设置', confirmColor: '#242321', success: result => { if (result.confirm) uni.openSetting() } })
    } else if (!/cancel/i.test(err.errMsg || '')) uni.showToast({ title: '保存失败，请重试', icon: 'none' })
  } finally { exporting.value = false; hideProgress() }
}
function goHome() { uni.switchTab({ url: '/pages/index/index' }) }
function openLibrary() { uni.switchTab({ url: '/pages/history/history' }) }
</script>

<style scoped>
.cloud-work-toolbar{display:flex;gap:10rpx;flex-wrap:wrap;margin:0 0 22rpx}.cloud-work-toolbar button{background:#eeebe4;color:#7b7b7b;font-size:22rpx;padding:16rpx 20rpx;border-radius:10rpx;line-height:1.4}.cloud-work-toolbar button.active{background:#242321;color:#fff}.cloud-save-error{font-size:22rpx;line-height:1.7;padding:18rpx;background:#fbefd9;color:#aa8a58;border-radius:12rpx;margin-bottom:20rpx}.cloud-save-error button{display:inline;background:transparent;color:#5e5e5e;font-size:22rpx;padding-left:16rpx}.material-card{background:#fff;border:1rpx solid #e7e3da;border-radius:20rpx;padding:24rpx;margin:24rpx 0}.material-heading{display:flex;align-items:center;justify-content:space-between;font-size:26rpx;font-weight:600}.material-heading button{background:#f0ede7;color:#8b8b8b;font-size:21rpx;padding:12rpx 18rpx;border-radius:9rpx;line-height:1.5}.material-summary{display:block;font-size:21rpx;color:#8e8e8e;line-height:1.9;margin-top:16rpx}.material-actions{display:flex;gap:18rpx;margin:20rpx 0}.material-actions button{background:#f3f1ec;color:#848484;font-size:22rpx;padding:15rpx 20rpx;border-radius:10rpx;line-height:1.5}.shortage-list text{display:block;font-size:22rpx;color:#9b9b9b;line-height:1.9}.board-progress{display:flex;flex-wrap:wrap;gap:10rpx;margin:22rpx 0 15rpx}.board-progress button{font-size:21rpx;background:#f2f0eb;color:#929292;padding:12rpx 18rpx;border-radius:9rpx;line-height:1.5}.board-progress button.done{background:#e6e2d8;color:#5b5b5b}.material-note{font-size:19rpx;line-height:1.8;color:#a4a4a4}

.result-page { padding: 28rpx 32rpx calc(170rpx + env(safe-area-inset-bottom)); min-height: 100vh; }
.result-heading { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; margin: 4rpx 0 16rpx; }
.project-name { display: flex; align-items: center; gap: 14rpx; background: transparent; min-width: 0; line-height: 1.4; padding: 8rpx 0; text-align: left; color: #242321; }
.project-name > text { font-size: 36rpx; font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.saved-state { font-size: 22rpx; color: #848484; flex-shrink: 0; }
.saved-state.unsaved { color: #a16b42; }
.project-meta { display: flex; gap: 24rpx; color: #838383; font-size: 24rpx; margin-bottom: 28rpx; }
.pattern-card { background: #fff; border: 1rpx solid #e8e5df; border-radius: 22rpx; padding: 20rpx; overflow: hidden; }
.pattern-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18rpx; }
.result-segment { display: flex; background: #f3f1ed; padding: 4rpx; border-radius: 12rpx; }
.result-segment button { background: transparent; font-size: 24rpx; line-height: 1.3; border-radius: 9rpx; padding: 12rpx 28rpx; color: #868686; }
.result-segment button.selected { background: #fff; color: #242321; }
.reset-button { background: #f2efea; color: #242321; display: flex; align-items: center; justify-content: center; gap: 8rpx; min-height: 44px; padding: 12rpx 18rpx; font-size: 24rpx; border-radius: 14rpx; line-height: 1.4; }
.pattern-viewport { width: 100%; overflow: hidden; background: #f6f5f2; border-radius: 12rpx; touch-action: none; }
.canvas-controls { display: flex; align-items: center; justify-content: space-between; margin-top: 16rpx; min-height: 68rpx; }
.label-control { display: flex; align-items: center; gap: 8rpx; font-size: 24rpx; color: #5b5b5b; }
.label-control switch { width: 80rpx; }
.beads-label { font-size: 23rpx; color: #868686; }
.zoom-controls { display: flex; align-items: center; border: 1rpx solid #eae7df; border-radius: 12rpx; }
.zoom-controls button { width: 80rpx; height: 84rpx; min-width: 44px; min-height: 44px; display: flex; align-items: center; justify-content: center; background: transparent; }
.zoom-controls > text { font-size: 22rpx; color: #777777; width: 78rpx; text-align: center; }
.canvas-hint { display: block; margin-top: 14rpx; font-size: 21rpx; color: #7e7e7e; text-align: center; line-height: 1.5; }
.board-scroll { white-space: nowrap; margin-bottom: 18rpx; }
.board-list { display: inline-flex; gap: 10rpx; }
.board-list button { flex-shrink: 0; background: #f5f4f0; border: 1rpx solid #eae6dd; border-radius: 10rpx; padding: 15rpx 18rpx; font-size: 22rpx; line-height: 1.3; color: #888888; }
.board-list button.active { background: #eeebe5; color: #585858; border-color: #aeaeae; }
.selected-banner { margin-top: 18rpx; padding: 12rpx 18rpx; border-radius: 14rpx; background: #efece5; display: flex; align-items: center; gap: 12rpx; color: #6a6a6a; font-size: 25rpx; }
.selected-dot { width: 30rpx; height: 30rpx; border-radius: 7rpx; border: 1rpx solid #00000010; }
.selected-count { margin-left: auto; font-size: 23rpx; }
.selected-banner button { background: transparent; display: flex; padding: 10rpx; }
.progress-card { margin-top: 26rpx; padding: 6rpx 2rpx; }
.progress-heading { display: flex; justify-content: space-between; font-size: 24rpx; color: #7f7f7f; }
.progress-track { height: 8rpx; border-radius: 6rpx; background: #e8e4da; margin-top: 16rpx; overflow: hidden; }
.progress-track view { height: 100%; background: #8b8b8b; border-radius: 6rpx; transition: width .3s; }
.result-note { display: block; margin: 26rpx 0; font-size: 22rpx; text-align: center; color: #929292; }
.result-attribution { display: flex; align-items: center; justify-content: center; gap: 8rpx; background: transparent; color: #919191; font-size: 18rpx; line-height: 1.6; padding: 0 0 20rpx; }
.bottom-actions { position: fixed; z-index: 10; left: 0; right: 0; bottom: 0; background: #fdfcfb; border-top: 1rpx solid #e9e6de; padding: 18rpx 32rpx calc(18rpx + env(safe-area-inset-bottom)); display: flex; gap: 18rpx; }
.bottom-actions .secondary-btn { flex: 0 0 190rpx; height: 92rpx; }
.bottom-actions .primary-btn { flex: 1; height: 92rpx; font-size: 28rpx; }
.export-option { display: flex; align-items: center; gap: 24rpx; background: #f3f1ed; padding: 28rpx; margin-top: 18rpx; border-radius: 18rpx; line-height: 1.4; width: 100%; text-align: left; }
.export-option > view { flex: 1; }
.export-title { display: block; font-size: 29rpx; color: #585858; font-weight: 600; }
.export-sub { display: block; font-size: 23rpx; color: #8a8a8a; margin-top: 8rpx; }
.empty-result { min-height: 70vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 32rpx; font-size: 30rpx; text-align: center; line-height: 1.6; padding: 0 24rpx; }
.empty-result .primary-btn { padding: 0 70rpx; margin-top: 8rpx; }
@media (min-width: 768px) { .bottom-actions { width: 480px; left: 50%; right: auto; transform: translateX(-50%); } }

.result-heading { margin-top:12rpx; }.project-name { font-size:33rpx; }.saved-state { font-size:21rpx; }.project-meta { color:#8f8f8f; font-size:23rpx; }
.cloud-work-toolbar { display:flex; gap:12rpx; margin:22rpx 0; }.cloud-work-toolbar button { min-height:82rpx; border-radius:16rpx; background:#eeece7; font-size:24rpx; padding:22rpx 20rpx; color:#606060; line-height:1.4; }
.pattern-card { border:0; border-radius:28rpx; background:#fff; }.pattern-top { padding-bottom:18rpx; }.result-segment { border-radius:14rpx; }.reset-button { min-height:76rpx; font-size:23rpx; }.canvas-controls { padding-top:16rpx; }.zoom-controls button { width:76rpx; height:76rpx; }.canvas-hint { font-size:21rpx; color:#979797; line-height:1.6; }
.progress-card { border:0; border-radius:22rpx; background:#fff; }.progress-heading { font-size:24rpx; }.material-card { border:0; border-radius:22rpx; padding:24rpx; }.material-disclosure { display:flex; align-items:center; gap:18rpx; color:#242321; background:transparent; font-size:27rpx!important; font-weight:600; padding:10rpx 0!important; }.material-disclosure text { font-size:21rpx; color:#929292; font-weight:400; }.material-summary { font-size:23rpx; line-height:1.7; padding-top:18rpx; }.bottom-actions { background:#ffffffee; }.bottom-actions .primary-btn { height:98rpx; }
.cloud-work-toolbar .login-save{grid-column:1/-1;font-size:22rpx;padding:12rpx;min-height:44px;background:transparent;color:#968975}
</style>

<style scoped>
.creation-complete{display:flex;align-items:center;justify-content:space-between;margin-bottom:22rpx;font-size:22rpx;color:#AEA491}.creation-complete text:first-child{color:#AA8731;background:#FFF2BC;padding:9rpx 16rpx;border-radius:10rpx;font-size:21rpx}.cloud-work-toolbar{display:grid;grid-template-columns:repeat(4,1fr);gap:12rpx}.cloud-work-toolbar button{font-size:23rpx;border-radius:16rpx;padding:23rpx 0;min-height:86rpx;background:#EEEAE1;color:#81745C}.cloud-work-toolbar button.play-toggle{background:#FFD44D;color:#242321;font-weight:650}.project-name>text{font-size:35rpx}.pattern-card{border:0;border-radius:28rpx;padding:22rpx}.result-segment{background:#F1EEE7}.result-segment button.selected{color:#242321}.reset-button{background:#F4EFE2;color:#81745C}.bottom-actions{background:#FBFAF6F5}.bottom-actions .primary-btn{background:#FFD44D;color:#242321}.progress-card{background:#fff;border:0;border-radius:24rpx}.progress-track>view{background:#E7BE40}.material-card{border:0;border-radius:24rpx}.material-heading button{color:#8F7A45;background:#F6F1E4}.result-note{color:#ADA391}.focus-color-panel{background:#fff;border-radius:24rpx;padding:24rpx;margin-top:20rpx}.focus-color-scroll{white-space:nowrap}.focus-colors{display:inline-flex;gap:12rpx}.focus-colors button{display:flex;flex-direction:column;align-items:center;gap:9rpx;border:2rpx solid #E9E5DC;border-radius:18rpx;padding:16rpx 20rpx;min-width:110rpx;background:#fff;line-height:1.3}.focus-colors button.active{border-color:#D9B13B;background:#FFF5CE}.focus-colors button.done{opacity:.5}.focus-colors button>view{width:46rpx;height:46rpx;border-radius:12rpx;border:1rpx solid #00000016}.focus-colors text{font-size:24rpx}.focus-colors text+text{font-size:20rpx;color:#A59B87}.finish-color{margin-top:24rpx;font-size:27rpx}.focus-tip{display:block;font-size:21rpx;color:#B0A797;text-align:center;margin-top:16rpx}.focus-mode{padding:20rpx 24rpx 30rpx;min-height:100vh;background:#EEEAE1}.focus-mode .cloud-work-toolbar{display:flex;justify-content:flex-end;margin-bottom:14rpx}.focus-mode .cloud-work-toolbar button{display:none}.focus-mode .cloud-work-toolbar button.play-toggle{display:block;padding:14rpx 24rpx;min-height:60rpx}.focus-mode .project-meta,.focus-mode .progress-card,.focus-mode .material-card,.focus-mode .color-list,.focus-mode .result-note,.focus-mode .result-attribution{display:none}.focus-mode .result-heading{margin-bottom:8rpx}.focus-mode .canvas-hint{font-size:21rpx}.focus-mode .pattern-card{padding:16rpx}.focus-mode .saved-state{font-size:20rpx}.focus-mode .project-name>text{font-size:30rpx}
.cloud-work-toolbar .login-save{grid-column:1/-1;font-size:22rpx;padding:12rpx;min-height:44px;background:transparent;color:#968975}
</style>
