const byteLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength').get

// WeChat's native bridge and devtools can return buffers from another realm.
// Use the built-in brand check: instanceof rejects those valid buffers, while
// a byteLength property or a toString tag alone can also describe plain objects.
export function isArrayBuffer(value) {
  try { byteLength.call(value); return true }
  catch { return false }
}
