export const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
export function touchPoints(event) {
  return Array.from(event.touches || []).map(t => ({ x: t.clientX ?? t.pageX ?? t.x, y: t.clientY ?? t.pageY ?? t.y })).filter(p => Number.isFinite(p.x) && Number.isFinite(p.y))
}
export const midpoint = points => ({ x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 })
export const distance = points => Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y)
// Preserve the image point under the pinch midpoint, including midpoint motion.
export function pinchView(start, from, to, min = 1, max = 8) {
  const a = midpoint(from), b = midpoint(to), scale = clamp(start.scale * distance(to) / Math.max(1, distance(from)), min, max), ratio = scale / start.scale
  return { scale, x: b.x - (a.x - start.x) * ratio, y: b.y - (a.y - start.y) * ratio }
}
export function constrainView(view, width, height, contentWidth = width, contentHeight = height) {
  const w = contentWidth * view.scale, h = contentHeight * view.scale
  return { ...view, x: w <= width ? (width - w) / 2 : clamp(view.x, width - w, 0), y: h <= height ? (height - h) / 2 : clamp(view.y, height - h, 0) }
}
export function lineCells(from, to) {
  let x = from.col, y = from.row
  const dx = Math.abs(to.col - x), dy = -Math.abs(to.row - y), sx = x < to.col ? 1 : -1, sy = y < to.row ? 1 : -1, result = []
  let error = dx + dy
  for (;;) { result.push({ row: y, col: x }); if (x === to.col && y === to.row) return result; const e = 2 * error; if (e >= dy) { error += dy; x += sx } if (e <= dx) { error += dx; y += sy } }
}
