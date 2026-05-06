let pendingImagePath = ''
let pendingPattern = null
let pendingColorUsage = null
let pendingGridSize = 29

export function setPending(path, pattern, colorUsage, gridSize) {
  pendingImagePath = path
  pendingPattern = pattern
  pendingColorUsage = colorUsage
  pendingGridSize = gridSize
}

export function getPending() {
  return {
    imagePath: pendingImagePath,
    pattern: pendingPattern,
    colorUsage: pendingColorUsage,
    gridSize: pendingGridSize,
  }
}

export function clearPending() {
  pendingImagePath = ''
  pendingPattern = null
  pendingColorUsage = null
  pendingGridSize = 29
}
