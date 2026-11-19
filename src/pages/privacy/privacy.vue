<template>
  <view class="privacy-page">
    <text class="privacy-title">照片本机处理，作品云端保存</text>
    <text class="privacy-lead">图片检测、照片转换与主体提取在设备完成；账号、图纸、进度、豆盒、订单和工单通过网络保存到云端。</text>
    <view v-for="item in details" :key="item.title" class="privacy-item">
      <text class="item-title">{{ item.title }}</text>
      <text class="item-description">{{ item.description }}</text>
    </view>
    <!-- #ifdef MP-WEIXIN -->
    <button class="secondary-btn" @tap="openContract">查看微信隐私保护指引</button>
    <!-- #endif -->
    <text class="version-note">应用版本 {{ version }}</text>
  </view>
</template>

<script setup>
import manifest from '../../manifest.json'
const version = manifest.versionName
const details = [
  { title: '照片与拍照', description: '仅在你主动选图或拍照时获取所选图片，用于本机预览、主体提取和图纸生成。原始照片不上传；生成的逐格图纸可能反映照片内容，登录后保存图纸会将这部分内容上传至服务端。' },
  { title: '账号与云端服务', description: '手机号验证登录时，将手机号发送至服务端及阿里云短信服务，用于发送验证码和核验登录。服务端保存已验证手机号及昵称，界面展示脱敏号码；验证码仅保存校验摘要，5 分钟有效，成功验证后失效。短信请求摘要用于限制重复发送，后续发送请求会清理 7 天前的记录。未注册手机号验证后自动创建账号；旧账号可在登录后绑定手机号，作品和权益保留。原账号密码以哈希保存；微信登录由服务端交换登录凭据，并保存微信用户标识。登录凭据缓存在设备，退出账号后移除。生产运营方联系方式和服务条款须在正式发布时按实际主体填写。' },
  { title: '作品与进度', description: '登录后的作品名称、逐格图纸、来源署名、配色及制作进度保存到云端数据库，可跨设备恢复。你可以在作品库删除作品，也可导出工程文件自行备份；游客作品保存在当前设备（最多 20 份），不会自动上传；清理微信数据或卸载会丢失，请及时备份。' },
  { title: '旧作品迁移', description: '原版本的本机作品仅在你登录并点击迁移后上传至当前账号。迁移可重复重试，不会重复新增同一份旧作品；本机旧记录保留作为备份。请确认当前登录账号后再迁移。' },
  { title: '豆盒、订单和客服', description: '库存色号、数量和材料成本保存至当前账号。购买套餐会创建订单，真实付款由支付平台处理；系统不接收银行卡密码。客服工单内容向授权员工展示，内部备注不向其他客户公开。不要在工单中提交账号密码等敏感信息。' },
  { title: '图片检测与样板', description: '设备端模型用于拦截潜在违规图片，可能误判或漏判，不能替代平台要求的内容安全服务。样板及素材来源通过云端获取，保存和导出会保留适用的许可署名。' },
  { title: '相册与剪贴板', description: '点击 PNG 导出时申请保存相册权限；点击复制时写入用豆清单或素材来源，不读取剪贴板。PDF 与工程文件下载会在设备生成或保存文件。' },
  { title: '安全与数据处理', description: '客户端通过授权接口访问当前账号的数据。后台按岗位限制权限，重要操作记录审计日志。账号停用不等于数据删除；如需删除账号或处理订单数据，可通过客服工单提出申请，由运营人员核验后处理。' },
]

function openContract() {
  // #ifdef MP-WEIXIN
  if (typeof wx.openPrivacyContract !== 'function') { uni.showToast({ title: '请更新微信后查看', icon: 'none' }); return }
  wx.openPrivacyContract({ fail: () => uni.showToast({ title: '隐私保护指引暂未打开，请稍后重试', icon: 'none' }) })
  // #endif
}
</script>

<style scoped>
.privacy-page { min-height: 100vh; padding: 40rpx 36rpx calc(48rpx + env(safe-area-inset-bottom)); }
.privacy-title { display: block; font-size: 38rpx; font-weight: 650; }
.privacy-lead { display: block; margin-top: 16rpx; color: #767676; font-size: 25rpx; line-height: 1.7; }
.privacy-item { margin-top: 24rpx; padding: 26rpx; background: #fff; border: 1rpx solid #e8e5df; border-radius: 18rpx; }
.item-title { display: block; font-size: 28rpx; font-weight: 600; }
.item-description { display: block; margin-top: 12rpx; color: #767676; font-size: 25rpx; line-height: 1.8; }
.secondary-btn { margin-top: 32rpx; font-size: 25rpx; }
.version-note { display: block; margin-top: 28rpx; color: #8e8e8e; text-align: center; font-size: 22rpx; }
</style>
