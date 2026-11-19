import { reactive } from 'vue'
const sessionKey='douwu_cloud_session_v1'
let initial={}
try{initial=uni.getStorageSync(sessionKey)||{};if(typeof initial==='string')initial=JSON.parse(initial)}catch{}
if(!initial||typeof initial!=='object'||Array.isArray(initial))initial={}
if(typeof initial.token!=='string'||!initial.user||typeof initial.user!=='object'||!initial.user.id)initial={}
export const cloudSession=reactive({token:initial.token||'',user:initial.user||null,entitlements:{isPro:false,exportCredits:0,proUntil:null}})
let apiOrigin=import.meta.env.VITE_API_BASE_URL||''
// #ifdef MP-WEIXIN
// Use the deployed service on phones; localhost would point at the phone itself.
// IP access is for debug mode. Set VITE_API_BASE_URL to the approved domain for release.
if(!apiOrigin)apiOrigin='https://1.92.110.111'
// #endif
// #ifdef APP-PLUS
// APKs have no same-origin API server. Use an absolute HTTPS endpoint for
// requests, catalog covers and downloads; WeChat's domain list does not apply.
if(!apiOrigin)apiOrigin='https://1.92.110.111'
// #endif
apiOrigin=apiOrigin.replace(/\/$/,'')
export const apiUrl=path=>`${apiOrigin}${path}`
export const assetUrl=path=>path?.startsWith('/')?apiUrl(path):path
export function isLoggedIn(){return !!cloudSession.token&&!!cloudSession.user}
export function setSession(session){if(!session||typeof session.token!=='string'||!session.token||!session.user?.id)throw new Error('登录信息异常，请重试');uni.setStorageSync(sessionKey,{token:session.token,user:session.user});cloudSession.token=session.token;cloudSession.user=session.user;cloudSession.entitlements={isPro:false,exportCredits:0,proUntil:null}}
export function updateSessionUser(user){if(!isLoggedIn()||!user?.id||user.id!==cloudSession.user.id)throw new Error('账号已切换，请重新登录');uni.setStorageSync(sessionKey,{token:cloudSession.token,user});cloudSession.user=user}
export function clearSession(){cloudSession.token='';cloudSession.user=null;cloudSession.entitlements={isPro:false,exportCredits:0,proUntil:null};uni.removeStorageSync(sessionKey)}
export function requireLogin(){if(isLoggedIn())return true;uni.navigateTo({url:'/member/account/account'});return false}
function networkError(error){
  const detail=error?.errMsg||error?.message||'request failed'
  let message='无法连接云端服务，请检查网络后重试'
  if(/url not in domain list|合法域名|not in.*domain/i.test(detail))message='服务器地址未通过微信域名校验，请联系开发者'
  else if(/ssl|tls|certificate|证书/i.test(detail))message='无法验证服务器安全证书，请检查手机日期或稍后重试'
  else if(/timeout|timed out|超时/i.test(detail))message='连接服务器超时，请稍后重试'
  return Object.assign(new Error(message),{code:'CLOUD_NETWORK_ERROR',detail,server:apiOrigin})
}
export async function request(path,options={}){
  const requestToken=cloudSession.token
  return new Promise((resolve,reject)=>uni.request({url:apiUrl(`/api/v1${path}`),method:options.method||'GET',data:options.data,timeout:20000,header:{'Content-Type':'application/json',...(cloudSession.token?{Authorization:`Bearer ${cloudSession.token}`}:{})},success:result=>{
    if(requestToken!==cloudSession.token)return reject(Object.assign(new Error('账号已切换，请重新打开页面'),{code:'SESSION_CHANGED'}))
    const body=result.data
    if(result.statusCode>=200&&result.statusCode<300){
      if(!body||typeof body!=='object'||!Object.prototype.hasOwnProperty.call(body,'data'))return reject(new Error('服务返回异常，请稍后重试'))
      return resolve(body.data)
    }
    if(result.statusCode===401)clearSession()
    reject(Object.assign(new Error(body?.message||'服务暂不可用，请重试'),{code:body?.code,status:result.statusCode,requestId:body?.requestId,retryAfter:Math.max(0,Math.min(86400,Number(body?.retryAfter||body?.details?.retryAfter||result.header?.['Retry-After'])||0))}))
  },fail:error=>reject(networkError(error))}))
}
export async function refreshSession(){if(!isLoggedIn())return null;const result=await request('/auth/me');cloudSession.user=result.user;cloudSession.entitlements=result.entitlements;return result}
export const newRequestKey=prefix=>`${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,12)}`
export async function saveDownload(path,name){
  // #ifdef H5
  const response=await fetch(apiUrl(path),{headers:{Authorization:`Bearer ${cloudSession.token}`}})
  if(!response.ok){const error=await response.json();throw new Error(error.message||'下载失败')}
  const url=URL.createObjectURL(await response.blob()),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),3000)
  return
  // #endif
  // #ifdef MP-WEIXIN || APP-PLUS
  const downloaded=await new Promise((resolve,reject)=>uni.downloadFile({url:apiUrl(path),header:{Authorization:`Bearer ${cloudSession.token}`},success:resolve,fail:error=>reject(networkError(error))}))
  if(downloaded.statusCode!==200)throw new Error('下载失败，请重试')
  await new Promise((resolve,reject)=>uni.openDocument({filePath:downloaded.tempFilePath,fileType:'pdf',showMenu:true,success:resolve,fail:reject}))
  // #endif
}
export async function saveTextFile(text,name){
  // #ifdef APP-PLUS
  throw new Error('当前 App 暂不支持工程文件备份，请使用微信小程序导出')
  // #endif
  // #ifdef H5
  const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),3000)
  return
  // #endif
  // #ifdef MP-WEIXIN
  const path=`${wx.env.USER_DATA_PATH}/${name.replace(/[^a-zA-Z0-9_.-]/g,'_')}`
  await new Promise((resolve,reject)=>wx.getFileSystemManager().writeFile({filePath:path,data:text,encoding:'utf8',success:resolve,fail:reject}))
  if(typeof wx.shareFileMessage==='function')await new Promise((resolve,reject)=>wx.shareFileMessage({filePath:path,fileName:name,success:resolve,fail:reject}))
  else throw new Error('请更新微信以导出工程文件')
  // #endif
}
