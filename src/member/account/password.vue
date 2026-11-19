<template><view class="password-page"><text class="title">修改登录密码</text><input v-model="current" password placeholder="当前密码" maxlength="128"/><input v-model="next" password placeholder="新密码，至少 10 位" maxlength="128"/><input v-model="confirm" password placeholder="再次输入新密码" maxlength="128"/><text v-if="error" class="error">{{error}}</text><button class="primary-btn" :disabled="busy" @tap="save">保存新密码</button><text class="note">修改后将退出所有设备，需要重新登录。</text></view></template>
<script setup>
import {ref} from 'vue'
import {request,clearSession} from '../../utils/cloud'
const current=ref(''),next=ref(''),confirm=ref(''),busy=ref(false),error=ref('')
async function save(){if(busy.value)return;busy.value=true;error.value='';try{if(next.value!==confirm.value)throw new Error('两次输入的新密码不一致');await request('/auth/password',{method:'POST',data:{currentPassword:current.value,newPassword:next.value}});clearSession();uni.redirectTo({url:'/member/account/account'})}catch(e){error.value=e.message}finally{busy.value=false}}
</script>
<style scoped>.password-page{padding:40rpx 32rpx}.title{display:block;font-size:36rpx;font-weight:600;margin-bottom:34rpx}input{background:#fff;border:1rpx solid #e6e2d9;border-radius:14rpx;padding:24rpx;height:90rpx;margin-bottom:24rpx;font-size:25rpx}.note{display:block;color:#989898;font-size:22rpx;line-height:1.8;margin-top:28rpx}.error{display:block;color:#b17854;font-size:23rpx;margin-bottom:24rpx}</style>
