import { request, isLoggedIn, cloudSession } from './cloud'
import { getHistory } from './storage'
const cache=new Map()
let owner=''
function checkOwner(){const current=cloudSession.user?.id||'';if(owner!==current){owner=current;cache.clear()}}
export function cachedCloudWork(id){checkOwner();return cache.get(id)||null}
export function cacheCloudWork(work){checkOwner();cache.set(work.id,work);return work}
export async function listCloudWorks(offset=0){checkOwner();if(!isLoggedIn())return{items:[],total:0};const data=await request(`/works?compact=true&limit=24&offset=${offset}`);data.items=data.items.map(item=>{const {preview,...work}=item;if(preview){const colors=new Map(work.colorUsage.map(c=>[c.code,c]));work.pattern=preview.map(row=>row.map(code=>code?colors.get(code):null))}return cacheCloudWork(work)});return data}
export async function getCloudWork(id){return cacheCloudWork(await request(`/works/${id}`))}
export async function saveCloudWork(work){const data=await request(work.id?`/works/${work.id}`:'/works',{method:work.id?'PUT':'POST',data:work});return cacheCloudWork(data)}
export async function deleteCloudWork(work){await request(`/works/${work.id}?version=${work.version}`,{method:'DELETE'});cache.delete(work.id)}
export async function migrateLocalWorks(){const entries=getHistory();if(!entries.length)return{items:[]};const data=await request('/works/migrate',{method:'POST',data:{entries:entries.map(work=>({localId:work.id,work}))}});data.items.forEach(item=>cacheCloudWork(item.work));return data}
