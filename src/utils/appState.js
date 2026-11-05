let pendingImagePath = ''
let pendingPattern = null
let pendingColorUsage = null
let pendingGridSize = 29
let pendingMetadata = {}
let newProjectRequested = false

export function requestNewProject() { newProjectRequested = true }
export function consumeNewProjectRequest() {
  const requested = newProjectRequested
  newProjectRequested = false
  return requested
}

export function setPending(path, pattern, colorUsage, gridSize, metadata = {}) {
  pendingImagePath = path
  pendingPattern = pattern
  pendingColorUsage = colorUsage
  pendingGridSize = gridSize
  pendingMetadata = metadata
}

export function getPending() {
  return {
    imagePath: pendingImagePath,
    pattern: pendingPattern,
    colorUsage: pendingColorUsage,
    gridSize: pendingGridSize,
    ...pendingMetadata,
  }
}

export function clearPending() {
  pendingImagePath = ''
  pendingPattern = null
  pendingColorUsage = null
  pendingGridSize = 29
  pendingMetadata = {}
}
