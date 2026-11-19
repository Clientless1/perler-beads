<template><view class="inventory-page"><view class="inventory-heading"><text class="title">我的豆盒</text><text class="subtitle">记录已有色号，生成时优先使用手里的豆子。</text></view><view v-if="!cloudSession.user" class="inventory-empty"><text>登录后，你的豆盒可以跨设备使用。</text><button class="primary-btn" @tap="login">登录云端</button></view><template v-else><view class="palette-tabs"><button :class="{active:paletteId==='mard'}" @tap="selectPalette('mard')">MARD 221</button><button :class="{active:paletteId==='hama'}" @tap="selectPalette('hama')">Hama 53</button></view><view class="inventory-summary"><view><text>{{stockColors}}</text><text>种已有颜色</text></view><view><text>{{totalStock.toLocaleString()}}</text><text>颗库存豆子</text></view><view><text>¥{{(totalValue/100).toFixed(2)}}</text><text>估算材料价值</text></view></view><view class="inventory-search"><input v-model.trim="search" placeholder="搜索色号，如 H7"/><button :class="{active:stockOnly}" @tap="stockOnly=!stockOnly">{{stockOnly?'仅看库存':'全部色号'}}</button></view><text class="unit-note">数量按颗填写，单颗成本按分填写。修改后点击保存。</text><view class="inventory-table-heading"><text>色号</text><text>库存（颗）</text><text>成本（分／颗）</text></view><view v-for="color in visible" :key="color.code" class="inventory-row"><view class="color-cell"><view :style="{background:color.hex}"/><text>{{color.code}}</text></view><input type="number" :disabled="busy||loading" :value="stock[color.code]?.quantity||0" @input="change(color.code,'quantity',$event.detail.value)"/><input type="digit" :disabled="busy||loading" :value="stock[color.code]?.unitCostCents??1" @input="change(color.code,'unitCostCents',$event.detail.value)"/></view><button v-if="visible.length<filtered.length" class="more-btn" @tap="limit+=40">加载更多色号</button><text v-if="!filtered.length" class="unit-note">没有符合条件的色号。</text><view class="inventory-footer"><text>{{loading?'正在加载豆盒…':dirty?'有未保存的修改':error?'豆盒尚未同步':'豆盒已与云端同步'}}</text><button class="primary-btn" :disabled="busy||loading||!dirty" @tap="save">{{busy?'保存中…':'保存豆盒'}}</button></view></template><text v-if="error" class="inventory-error">{{error}}</text></view></template>
<script setup>
import {ref,computed,watch} from 'vue'
import {onShow} from '@dcloudio/uni-app'
import {cloudSession,request} from '../../utils/cloud'
import {MARD_PALETTE,HAMA_PALETTE} from '../../utils/beadPalette'
const paletteId=ref('mard'),stock=ref({}),all=ref([]),search=ref(''),stockOnly=ref(false),limit=ref(40),dirty=ref(false),busy=ref(false),loading=ref(false),error=ref('')
const palette=computed(()=>paletteId.value==='mard'?MARD_PALETTE:HAMA_PALETTE)
const filtered=computed(()=>palette.value.filter(color=>(!stockOnly.value||(stock.value[color.code]?.quantity||0)>0)&&color.code.toLowerCase().includes(search.value.toLowerCase())))
const visible=computed(()=>filtered.value.slice(0,limit.value)),stockColors=computed(()=>Object.values(stock.value).filter(item=>item.quantity>0).length),totalStock=computed(()=>Object.values(stock.value).reduce((sum,item)=>sum+item.quantity,0)),totalValue=computed(()=>Object.values(stock.value).reduce((sum,item)=>sum+item.quantity*item.unitCostCents,0))
watch([search,stockOnly],()=>limit.value=40)
function applyStock(){stock.value=Object.fromEntries(all.value.filter(item=>item.paletteId===paletteId.value).map(item=>[item.code,{quantity:item.quantity,unitCostCents:item.unitCostCents}]));dirty.value=false;limit.value=40}
let stockOwner='',loadRevision=0
async function load(){
  const owner=cloudSession.user?.id||''
  if(owner!==stockOwner){loadRevision++;stockOwner=owner;all.value=[];stock.value={};dirty.value=false;error.value=''}
  if(!owner||dirty.value||busy.value)return
  const current=++loadRevision;loading.value=true;error.value=''
  try{const items=await request('/inventory');if(current===loadRevision&&owner===cloudSession.user?.id){all.value=items;applyStock()}}
  catch(e){if(current===loadRevision)error.value=e.message}
  finally{if(current===loadRevision)loading.value=false}
}
onShow(load)
function selectPalette(id){if(busy.value||loading.value)return;if(dirty.value){uni.showModal({title:'先保存豆盒',content:'当前色卡有未保存的修改，保存后再切换。',showCancel:false});return}paletteId.value=id;applyStock()}
function change(code,key,value){if(busy.value||loading.value)return;stock.value[code]={quantity:0,unitCostCents:1,...stock.value[code],[key]:Number(value)};dirty.value=true}
async function save(){
  if(busy.value||loading.value||!dirty.value)return
  busy.value=true;error.value=''
  const owner=cloudSession.user?.id,palette=paletteId.value
  try{
    const items=Object.entries(stock.value).map(([code,item])=>({code,...item}))
    if(items.some(item=>!Number.isInteger(item.quantity)||item.quantity<0||item.quantity>10000000||!Number.isInteger(item.unitCostCents)||item.unitCostCents<0||item.unitCostCents>100000))throw new Error('数量和成本需为有效的非负整数')
    await request('/inventory',{method:'PUT',data:{paletteId:palette,items}})
    if(owner!==cloudSession.user?.id)return
    all.value=[...all.value.filter(item=>item.paletteId!==palette),...items.map(item=>({...item,paletteId:palette}))];dirty.value=false
    uni.showToast({title:'豆盒已保存',icon:'success'})
  }catch(e){error.value=e.message}finally{busy.value=false}
}
function login(){uni.navigateTo({url:'/member/account/account'})}
</script>
<style scoped>.inventory-page{padding:32rpx 32rpx 180rpx}.title{display:block;font-size:42rpx;font-weight:650}.subtitle{display:block;font-size:23rpx;color:#989898;line-height:1.8;margin-top:14rpx}.palette-tabs{display:flex;gap:16rpx;margin:30rpx 0}.palette-tabs button,.inventory-search button{background:#efede7;color:#898989;font-size:24rpx;border-radius:12rpx;padding:18rpx 30rpx;line-height:1.4}.palette-tabs button.active,.inventory-search button.active{background:#242321;color:#fff}.inventory-summary{display:flex;justify-content:space-between;background:#ede9e2;border-radius:20rpx;padding:28rpx 24rpx}.inventory-summary>view{display:flex;flex-direction:column;gap:12rpx}.inventory-summary text:first-child{font-size:32rpx;font-weight:600;color:#626262}.inventory-summary text:last-child{font-size:20rpx;color:#909090}.inventory-search{display:flex;gap:16rpx;margin:28rpx 0 20rpx}.inventory-search input{flex:1;background:#fff;border:1rpx solid #e7e3da;border-radius:12rpx;padding:20rpx;height:80rpx;font-size:25rpx;min-width:0}.inventory-search button{font-size:21rpx;flex-shrink:0;padding:20rpx}.unit-note{display:block;font-size:21rpx;color:#9a9a9a;line-height:1.8;margin:16rpx 0}.inventory-table-heading,.inventory-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:20rpx;align-items:center;padding:20rpx;background:#fff;border-bottom:1rpx solid #f0ede7}.inventory-table-heading{background:#f2efea;color:#8f8f8f;font-size:20rpx;border-radius:16rpx 16rpx 0 0}.color-cell{display:flex;gap:14rpx;align-items:center;font-size:25rpx}.color-cell>view{width:34rpx;height:34rpx;border-radius:8rpx;border:1rpx solid #00000010}.inventory-row input{width:100%;background:#f7f6f3;border:1rpx solid #ebe7df;border-radius:8rpx;padding:14rpx 12rpx;height:64rpx;font-size:23rpx}.more-btn{background:#ede9e2;color:#7e7e7e;font-size:24rpx;margin-top:22rpx;padding:20rpx;border-radius:12rpx;line-height:1.5}.inventory-footer{position:fixed;bottom:0;left:0;right:0;padding:22rpx 32rpx calc(22rpx + env(safe-area-inset-bottom));background:#fcfbfaf5;border-top:1rpx solid #e6e2d8;display:flex;align-items:center;justify-content:space-between;gap:24rpx}.inventory-footer>text{font-size:22rpx;color:#919191}.inventory-footer .primary-btn{height:80rpx;padding:0 40rpx;font-size:25rpx}.inventory-error{display:block;margin-top:24rpx;color:#b47f5e;font-size:23rpx}.inventory-empty{padding:70rpx 0;font-size:25rpx;color:#909090}.inventory-empty .primary-btn{margin-top:30rpx}@media(min-width:768px){.inventory-footer{max-width:480px;margin:auto}}
.inventory-page { padding:28rpx 36rpx 180rpx; }.title { font-size:38rpx; }.subtitle { font-size:23rpx; line-height:1.7; }.inventory-summary { background:#fff; border-radius:24rpx; }.inventory-summary text:first-child { color:#242321; }.palette-tabs button { min-height:84rpx; border-radius:16rpx; }.inventory-search input { border:0; background:#fff; height:88rpx; border-radius:16rpx; }.inventory-search button { font-size:23rpx; border-radius:16rpx; }.inventory-table-heading { background:#eeece7; color:#7a7a7a; }.inventory-row input { min-height:76rpx; background:#f5f4f0; border:0; border-radius:12rpx; font-size:24rpx; }.inventory-row { padding:18rpx; }.inventory-footer { background:#ffffffee; padding-left:36rpx; padding-right:36rpx; }.inventory-footer .primary-btn { height:88rpx; font-size:27rpx; }
</style>
