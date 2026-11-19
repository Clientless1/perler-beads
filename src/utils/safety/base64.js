const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const values = new Int16Array(128).fill(-1)
for (let i = 0; i < alphabet.length; i++) values[alphabet.charCodeAt(i)] = i

export function encodeBase64(buffer) {
  const bytes = new Uint8Array(buffer), parts = []
  for (let start = 0; start < bytes.length; start += 12288) {
    let result = ''
    const end = Math.min(bytes.length, start + 12288)
    for (let i = start; i < end; i += 3) {
      const a = bytes[i], b = bytes[i + 1] || 0, c = bytes[i + 2] || 0
      result += alphabet[a >>> 2] + alphabet[(a & 3) << 4 | b >>> 4] + (i + 1 < bytes.length ? alphabet[(b & 15) << 2 | c >>> 6] : '=') + (i + 2 < bytes.length ? alphabet[c & 63] : '=')
    }
    parts.push(result)
  }
  return parts.join('')
}

// Workers have no wx.base64ToArrayBuffer. Decode bounded string messages instead
// of sending a 10 MB ArrayBuffer through the native object-serialization bridge.
export function decodeBase64(encoded) {
  if (typeof encoded !== 'string' || encoded.length % 4) throw new Error('invalid base64')
  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0
  const output = new Uint8Array(encoded.length / 4 * 3 - padding)
  let offset = 0
  for (let i = 0; i < encoded.length; i += 4) {
    const last = i + 4 === encoded.length
    const a = values[encoded.charCodeAt(i)], b = values[encoded.charCodeAt(i + 1)]
    const c = last && padding === 2 ? 0 : values[encoded.charCodeAt(i + 2)]
    const d = last && padding ? 0 : values[encoded.charCodeAt(i + 3)]
    if (!(a >= 0 && b >= 0 && c >= 0 && d >= 0)) throw new Error('invalid base64')
    const word = (a << 18) | (b << 12) | (c << 6) | d
    output[offset++] = word >>> 16
    if (offset < output.length) output[offset++] = word >>> 8
    if (offset < output.length) output[offset++] = word
  }
  return output
}
