import { normalizeCrop } from './cropGeometry.mjs'
// Ratios describe the kept region; rotation happens after masking/cropping.
export function cropRectangle(width, height, ratio = 0, focusX = .5, focusY = .5) {
  if (!(width > 0 && height > 0)) throw new Error('图片尺寸无效')
  let w = width, h = height
  if (ratio > 0) { if (width / height > ratio) w = height * ratio; else h = width / ratio }
  return { x: (width - w) * Math.max(0, Math.min(1, focusX)), y: (height - h) * Math.max(0, Math.min(1, focusY)), width: w, height: h }
}
export function normalizeComposition(value = {}) {
  return { crop: normalizeCrop(value.crop), rotation: ((Math.round(Number(value.rotation) || 0) % 4) + 4) % 4, flipX: !!value.flipX, ratio: [0,1,.75,4/3].includes(value.ratio) ? value.ratio : 0, focusX: Math.max(0,Math.min(1,Number.isFinite(Number(value.focusX)) ? Number(value.focusX) : .5)), focusY: Math.max(0,Math.min(1,Number.isFinite(Number(value.focusY)) ? Number(value.focusY) : .5)) }
}
