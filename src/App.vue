<script>
export default {
  onLaunch() {},
  onShow() {},
  onHide() {},
}
</script>

<style>
page {
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif;
  background: #f6f5f3;
  color: #242321;
  font-size: 28rpx;
}

view, button, input, scroll-view, image { box-sizing: border-box; }
button, button[class] { font-family: inherit; margin: 0; padding: 0; font-weight: 500; border: none; }
button::after, button[class]::after { border: none; }
/* #ifdef H5 */
uni-view, uni-button, uni-input, uni-scroll-view, uni-image { box-sizing: border-box; }
uni-button[class] { font-family: inherit; margin: 0; padding: 0; font-weight: 500; border: none; }
uni-button[class]::after { border: none; }
html { scrollbar-width: none; }
html::-webkit-scrollbar { display: none; }
body::after { animation: none !important; }
[class*="uni-page-head-shadow-"]::after { background-image: linear-gradient(135deg, transparent, rgba(40,92,73,.06)) !important; }
/* #endif */
button[disabled] { opacity: .5; }
.primary-btn { display: flex; align-items: center; justify-content: center; gap: 16rpx; background: #242321; color: #fff; border-radius: 22rpx; height: 98rpx; font-size: 29rpx; font-weight: 600; line-height: 1.4; }
.secondary-btn { display: flex; align-items: center; justify-content: center; gap: 10rpx; border: 1rpx solid #e5e2dc; background: #fff; color: #242321; border-radius: 20rpx; height: 88rpx; font-size: 27rpx; line-height: 1.4; }
.section-title { font-size: 32rpx; font-weight: 650; letter-spacing: 0; }
.muted { color: #929292; }
.eyebrow { font-size: 19rpx; letter-spacing: 4rpx; color: #848484; font-weight: 600; }
.sheet-backdrop { position: fixed; inset: 0; z-index: 60; background: rgba(27,44,33,.35); display: flex; align-items: flex-end; }
.bottom-sheet { width: 100%; padding: 22rpx 36rpx calc(36rpx + env(safe-area-inset-bottom)); border-radius: 38rpx 38rpx 0 0; background: #fff; max-height: 86vh; overflow-y: auto; }
.sheet-handle { width: 64rpx; height: 7rpx; border-radius: 6rpx; background: #dddad4; margin: 0 auto 34rpx; }
.sheet-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: 28rpx; }
.icon-button { display: flex; align-items: center; justify-content: center; width: 76rpx; height: 76rpx; border-radius: 50%; background: #f3f0eb; flex-shrink: 0; }
.hidden-canvas { position: fixed; left: -9999px; top: 0; width: 1px; height: 1px; pointer-events: none; }
@media (min-width: 768px) { uni-page-body { max-width: 480px; margin: auto; } }
</style>

<style>
/* Product foundations shared by every mini-program screen. */
page { --ink:#242321; --accent:#FFD44D; --paper:#F7F6F2; --muted:#918D84; background:#F7F6F2; color:#242321; }
.primary-btn { background:#FFD44D; color:#242321; border-radius:24rpx; font-weight:700; }
.primary-btn .app-icon { filter:brightness(.16); }
.secondary-btn { color:#242321; background:#fff; border-color:#E9E6DE; }
.bottom-sheet { background:#FBFAF6; border-radius:36rpx 36rpx 0 0; }
.section-title { color:#242321; }
</style>
