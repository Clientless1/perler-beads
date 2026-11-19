<template>
  <view class="phone-code-form">
    <text class="phone-label">手机号</text>
    <view class="phone-input">
      <text class="dial-code">+86</text>
      <input v-model="phone" @blur="phone = String($event.detail.value || '')" type="number" maxlength="11" placeholder="请输入手机号" :disabled="sending || submitting" :adjust-position="true" aria-label="手机号" />
    </view>
    <text class="phone-label">短信验证码</text>
    <view class="phone-input">
      <input v-model="code" @blur="code = String($event.detail.value || '')" type="number" maxlength="6" placeholder="6 位验证码" :disabled="submitting" confirm-type="go" @confirm="confirmCode" aria-label="短信验证码" />
      <button class="send-code" :disabled="!available || !validPhone || sending || submitting || remaining > 0" @tap="sendCode">{{ sending ? '发送中…' : remaining > 0 ? `${remaining}s 后重发` : '获取验证码' }}</button>
    </view>
    <text v-if="sentTo && !error" class="phone-hint">验证码已发送至 {{ sentTo }}，5 分钟内有效</text>
    <text v-if="!available" class="phone-hint">{{ loading ? '正在连接登录服务…' : '短信登录暂未开放，请稍后再试' }}</text>
    <text v-if="error" class="phone-error" role="alert">{{ error }}</text>
    <slot />
    <button class="primary-btn phone-submit" :disabled="!available || sending || submitting" @tap="submit">{{ submitting ? '正在验证…' : purpose === 'bind' ? '验证并绑定' : '验证并登录' }}</button>
    <text v-if="purpose === 'login'" class="phone-note">未注册的手机号验证后将自动创建账号</text>
  </view>
</template>

<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { request, cloudSession } from '../utils/cloud'
import { normalizePhone, validMobile, maskPhone } from '../utils/phoneAuth.mjs'
const props = defineProps({ purpose: { type: String, default: 'login' }, accepted: Boolean, available: Boolean, loading: Boolean })
const emit = defineEmits(['verified', 'busy'])
const phone = ref(''), code = ref(''), error = ref(''), sending = ref(false), submitting = ref(false)
const sentTo = ref(''), now = ref(Date.now()), cooldownPhone = ref(''), resendAt = ref(0)
const validPhone = computed(() => validMobile(phone.value))
const remaining = computed(() => normalizePhone(phone.value) === cooldownPhone.value ? Math.max(0, Math.ceil((resendAt.value - now.value) / 1000)) : 0)
let challenge = null, revision = 0, alive = true, ticker
watch(phone, () => { revision++; challenge = null; code.value = ''; error.value = ''; sentTo.value = '' }, { flush: 'sync' })
watch(() => cloudSession.user?.id, () => { revision++; challenge = null; code.value = '' }, { flush: 'sync' })
watch([sending, submitting], () => emit('busy', sending.value || submitting.value), { flush: 'sync' })
onBeforeUnmount(() => { alive = false; revision++; clearInterval(ticker) })
function startClock() {
  clearInterval(ticker); now.value = Date.now()
  ticker = setInterval(() => { now.value = Date.now(); if (now.value >= resendAt.value) { clearInterval(ticker); ticker = undefined } }, 500)
}
function validate() {
  if (!props.accepted) throw new Error('请先阅读并同意隐私与云端服务说明')
  if (!validPhone.value) throw new Error('请输入正确的中国大陆手机号')
  if (!props.available) throw new Error('短信登录暂未开放，请稍后再试')
}
async function sendCode() {
  now.value = Date.now()
  if (sending.value || submitting.value || remaining.value > 0) return
  error.value = ''
  try { validate() } catch (e) { error.value = e.message; return }
  const selectedPhone = normalizePhone(phone.value), current = ++revision, owner = cloudSession.user?.id
  sending.value = true
  try {
    const result = await request('/auth/sms/code', { method: 'POST', data: { phone: selectedPhone, purpose: props.purpose, acceptedPrivacy: true } })
    if (!alive || current !== revision || owner !== cloudSession.user?.id) return
    if (!result?.challengeId) throw new Error('验证码发送结果异常，请重试')
    const expiresIn = Math.max(1, Number(result.expiresIn) || 300)
    challenge = { id: result.challengeId, phone: selectedPhone, expiresAt: Date.now() + expiresIn * 1000 }
    code.value = ''; sentTo.value = maskPhone(selectedPhone)
    cooldownPhone.value = selectedPhone; resendAt.value = Date.now() + Math.max(1, Number(result.retryAfter) || 60) * 1000
    startClock()
  } catch (e) {
    if (alive && current === revision) {
      error.value = e.message || '验证码发送失败，请重试'
      if (e.retryAfter) { cooldownPhone.value = selectedPhone; resendAt.value = Date.now() + e.retryAfter * 1000; startClock() }
    }
  } finally { if (alive) sending.value = false }
}
// Native keyboard confirmation carries the latest value before v-model can flush.
function confirmCode(event) { code.value = String(event?.detail?.value ?? code.value); return submit() }
async function submit() {
  if (sending.value || submitting.value) return
  error.value = ''
  try {
    validate()
    if (!/^\d{6}$/.test(code.value)) throw new Error('请输入 6 位短信验证码')
    if (!challenge || challenge.phone !== normalizePhone(phone.value)) throw new Error('请先获取当前手机号的验证码')
    if (Date.now() >= challenge.expiresAt) throw new Error('验证码已过期，请重新获取')
  } catch (e) { error.value = e.message; return }
  const current = ++revision, owner = cloudSession.user?.id
  submitting.value = true
  try {
    const result = await request(props.purpose === 'bind' ? '/auth/phone' : '/auth/sms/login', { method: 'POST', data: { phone: challenge.phone, code: code.value, challengeId: challenge.id, acceptedPrivacy: true } })
    if (!alive || current !== revision || owner !== cloudSession.user?.id) return
    challenge = null; code.value = ''
    emit('verified', result)
  } catch (e) { if (alive && current === revision) error.value = e.message || '验证失败，请重试' }
  finally { if (alive) submitting.value = false }
}
</script>

<style scoped>
.phone-label{display:block;font-size:24rpx;color:#6F695F;font-weight:550;margin:24rpx 0 12rpx}.phone-input{display:flex;align-items:center;gap:18rpx;min-height:102rpx;background:#fff;border:2rpx solid #E8E3D9;border-radius:19rpx;padding:0 24rpx}.phone-input:focus-within{border-color:#9980AD}.dial-code{font-size:28rpx;color:#5E5167;padding-right:18rpx;border-right:1rpx solid #E8E3D9}.phone-input input{flex:1;min-width:0;width:0;height:100rpx;font-size:28rpx;background:transparent}.send-code{display:flex;align-items:center;justify-content:center;background:transparent;color:#79638F;flex-shrink:0;min-height:44px;min-width:158rpx;padding:0 4rpx;font-size:24rpx;line-height:1.4}.phone-submit{margin-top:24rpx;background:#79638F;color:#fff;border-radius:20rpx;height:102rpx;font-size:29rpx}.phone-hint,.phone-note,.phone-error{display:block;font-size:22rpx;line-height:1.7;margin-top:16rpx;color:#918797}.phone-note{text-align:center;font-size:20rpx}.phone-error{color:#B34F42}.phone-hint{color:#887995}
</style>
