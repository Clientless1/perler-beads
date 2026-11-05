export function cancelled() {
  const error = new Error('任务已取消')
  error.name = 'AbortError'
  return error
}

export const yieldToUI = () => new Promise(resolve => setTimeout(resolve, 0))

export function runNow(steps) {
  let next
  do { next = steps.next() } while (!next.done)
  return next.value
}

// Keep touch events, navigation and loading indicators responsive on slower phones.
export async function runInSlices(steps, { isCancelled = () => false, budget = 8 } = {}) {
  const now = () => typeof performance !== 'undefined' ? performance.now() : Date.now()
  await yieldToUI()
  let start = now()
  while (true) {
    if (isCancelled()) { steps.return?.(); throw cancelled() }
    const next = steps.next()
    if (next.done) return next.value
    if (now() - start >= budget) { await yieldToUI(); start = now() }
  }
}
