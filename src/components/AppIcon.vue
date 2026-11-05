<template>
  <image class="app-icon" :src="`/static/ui/${name}${light ? '-light' : ''}.png`" :style="{ width: size + 'rpx', height: size + 'rpx' }" mode="aspectFit" />
</template>

<script setup>
defineProps({ name: { type: String, required: true }, size: { type: Number, default: 36 }, light: Boolean })
</script>

<style scoped>
.app-icon { display: inline-block; flex-shrink: 0; vertical-align: middle; }
</style>
