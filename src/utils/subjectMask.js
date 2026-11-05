// A single normalized 256 × 256 mask works for both source aspect ratios and grid sizes.
export const MASK_SIZE = 256

export function maskBounds(mask, size = MASK_SIZE) {
  let left = size, top = size, right = -1, bottom = -1, count = 0
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (mask[y * size + x] < 128) continue
    left = Math.min(left, x); right = Math.max(right, x)
    top = Math.min(top, y); bottom = Math.max(bottom, y); count++
  }
  return count ? { x: left / size, y: top / size, width: (right - left + 1) / size, height: (bottom - top + 1) / size, count } : null
}

export function validateSubject(mask, size = MASK_SIZE) {
  if (!mask || mask.length !== size * size) throw new Error('主体选区已失效，请重新提取')
  const bounds = maskBounds(mask, size)
  if (!bounds || bounds.count < size * size * .002) throw new Error('没有选中主体，请圈选或补回要保留的部分')
  return bounds
}

// Model probabilities stay soft until final grid sampling. Drop only tiny isolated specks.
export function probabilitiesToMask(probabilities, size = MASK_SIZE) {
  if (probabilities.length !== size * size) throw new Error('主体识别结果异常，请重试')
  const mask = new Uint8Array(size * size)
  for (let i = 0; i < mask.length; i++) {
    const p = probabilities[i]
    if (!Number.isFinite(p)) throw new Error('主体识别结果异常，请重试')
    mask[i] = Math.round(Math.max(0, Math.min(1, (p - .35) / .3)) * 255)
  }
  const visited = new Uint8Array(mask.length), queue = new Int32Array(mask.length)
  for (let start = 0; start < mask.length; start++) {
    if (visited[start] || mask[start] < 128) continue
    let head = 0, tail = 1; queue[0] = start; visited[start] = 1
    while (head < tail) {
      const i = queue[head++], x = i % size, y = Math.floor(i / size)
      const neighbors = [x ? i - 1 : -1, x < size - 1 ? i + 1 : -1, y ? i - size : -1, y < size - 1 ? i + size : -1]
      for (const n of neighbors) if (n >= 0 && !visited[n] && mask[n] >= 128) { visited[n] = 1; queue[tail++] = n }
    }
    if (tail < 12) for (let j = 0; j < tail; j++) mask[queue[j]] = 0
  }
  validateSubject(mask, size)
  if (maskBounds(mask, size).count > size * size * .985) throw new Error('没有分清主体和背景，请换张图片或手动圈选')
  return mask
}

export function applySubjectMask(pixels, width, height, mask, size = MASK_SIZE) {
  if (!mask || mask.length !== size * size) throw new Error('主体选区已失效，请重新提取')
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const sx = Math.max(0, Math.min(size - 1, (x + .5) / width * size - .5))
    const sy = Math.max(0, Math.min(size - 1, (y + .5) / height * size - .5))
    const x0 = Math.floor(sx), y0 = Math.floor(sy), x1 = Math.min(size - 1, x0 + 1), y1 = Math.min(size - 1, y0 + 1)
    const dx = sx - x0, dy = sy - y0
    const alpha = (mask[y0 * size + x0] * (1 - dx) + mask[y0 * size + x1] * dx) * (1 - dy) + (mask[y1 * size + x0] * (1 - dx) + mask[y1 * size + x1] * dx) * dy
    pixels[(y * width + x) * 4 + 3] = Math.round(pixels[(y * width + x) * 4 + 3] * alpha / 255)
  }
  return pixels
}

export function polygonMask(points, size = MASK_SIZE) {
  const mask = new Uint8Array(size * size)
  if (points.length < 3) return mask
  // Scanline fill: a closed freehand outline, including concave silhouettes.
  for (let y = 0; y < size; y++) {
    const sy = (y + .5) / size, intersections = []
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[i], b = points[j]
      if ((a.y > sy) !== (b.y > sy)) intersections.push((a.x + (sy - a.y) * (b.x - a.x) / (b.y - a.y)) * size)
    }
    intersections.sort((a, b) => a - b)
    for (let i = 0; i + 1 < intersections.length; i += 2) {
      for (let x = Math.max(0, Math.ceil(intersections[i] - .5)); x < Math.min(size, intersections[i + 1] - .5); x++) mask[y * size + x] = 255
    }
  }
  return mask
}

// Radius is measured in displayed pixels; using separate x/y radii avoids oval brushes.
export function paintMask(mask, from, to, radiusX, radiusY, value, size = MASK_SIZE) {
  const steps = Math.max(1, Math.ceil(Math.hypot((to.x - from.x) / radiusX, (to.y - from.y) / radiusY) * 2))
  for (let step = 0; step <= steps; step++) {
    const cx = (from.x + (to.x - from.x) * step / steps) * size, cy = (from.y + (to.y - from.y) * step / steps) * size
    const rx = radiusX * size, ry = radiusY * size
    for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(size - 1, Math.ceil(cy + ry)); y++) {
      for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(size - 1, Math.ceil(cx + rx)); x++) {
        if (((x + .5 - cx) / rx) ** 2 + ((y + .5 - cy) / ry) ** 2 <= 1) mask[y * size + x] = value
      }
    }
  }
}
