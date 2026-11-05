<template><view class="brand-mark"><view v-for="n in 9" :key="n" class="brand-dot" :class="{ faint: n === 3 || n === 7 }" /></view></template>
<style scoped>
.brand-mark { width: 44rpx; height: 44rpx; display: grid; grid-template-columns: repeat(3, 1fr); gap: 4rpx; transform: rotate(-6deg); }
.brand-dot { border-radius: 4rpx; background: #25634b; }
.brand-dot.faint { background: #c2d7a8; }
</style>
