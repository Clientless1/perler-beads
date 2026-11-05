// Keep photo paths and masks in memory; never put them in URLs or persistent storage.
let request = null, result = null, sequence = 0

export function beginSubjectEdit(imagePath, selection = null) {
  request = { id: ++sequence, imagePath, selection }
  result = null
  return request.id
}
export function getSubjectEdit() { return request }
export function finishSubjectEdit(id, selection) {
  if (!request || request.id !== id) return false
  result = { id, imagePath: request.imagePath, selection }
  return true
}
export function consumeSubjectEdit(imagePath) {
  const value = result
  result = null
  return value && request?.id === value.id && value.imagePath === imagePath ? value.selection : null
}
export function clearSubjectEdit() { request = null; result = null; sequence++ }
