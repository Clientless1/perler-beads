<template><view class="app-image-runtime" :task="task" :change:task="imageRuntime.receive" /></template>
<script>
import { connectAppHost, activateAppHost, disconnectAppHost, settleAppReply, appProgress } from '../utils/app/bridge'
let serial = 0
export default {
  data: () => ({ task: null, hostId: `image_host_${++serial}`, outbox: [], sending: false }),
  mounted() { connectAppHost(this.hostId, task => { this.outbox.push(task); this.pump() }) },
  onShow() { activateAppHost(this.hostId) },
  beforeUnmount() { disconnectAppHost(this.hostId) },
  methods: {
    pump() {
      if (this.sending || !this.outbox.length) return
      this.sending = true; this.task = this.outbox.shift()
      // Wait for the WebView to receive this property before sending another.
      // Inference completion is independent, so cancellation stays immediate.
    },
    imageAccepted() { this.sending = false; this.$nextTick(() => this.pump()) },
    imageReply(reply) { reply.progress ? appProgress(reply) : settleAppReply(reply) },
  },
}
</script>
<script module="imageRuntime" lang="renderjs">
export default {
  methods: {
    async receive(task, previous, owner) {
      if (!task?.id) return
      owner.callMethod('imageAccepted')
      const reply = value => owner.callMethod('imageReply', { id: task.id, ...value })
      try {
        if (!window.__beadImageEngineReady) window.__beadImageEngineReady = new Promise((resolve, reject) => {
          const script = document.createElement('script')
          script.src = 'static/app-image/engine.js'
          script.onload = () => resolve(window.BeadImageEngine)
          script.onerror = () => { window.__beadImageEngineReady = null; reject(Object.assign(new Error('本地图像资源加载失败，请重新安装完整 App'), { stage: 'resources' })) }
          document.head.appendChild(script)
        })
        const engine = await window.__beadImageEngineReady
        const result = await engine.dispatch(task, value => reply({ progress: value }))
        reply({ result })
      } catch (error) {
        console.warn('[app:image]', task.type, error.stage || '', error.detail || error.message)
        reply({ error: { message: error.message || '图片处理失败，请重试', safetyCode: error.safetyCode || (task.type.startsWith('safe') ? 'unavailable' : undefined), name: error.name, stage: error.stage || task.type, detail: error.detail || error.message } })
      }
    },
  },
}
</script>
<style scoped>.app-image-runtime{position:absolute;width:0;height:0;overflow:hidden;pointer-events:none}</style>
