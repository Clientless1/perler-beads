export const normalizePhone = value => String(value || '').trim()
export const validMobile = value => /^1[3-9]\d{9}$/.test(normalizePhone(value))
export const maskPhone = value => validMobile(value) ? `${normalizePhone(value).slice(0, 3)}****${normalizePhone(value).slice(-4)}` : ''
