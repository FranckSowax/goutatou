export function normalizeGabonPhone(input: string): string | null {
  const digits = input.replace(/\D/g, '')
  if (digits.startsWith('241') && digits.length >= 11 && digits.length <= 12) return digits
  if (digits.startsWith('0') && digits.length === 9) return `241${digits.slice(1)}`
  if (digits.length === 8) return `241${digits}`
  return null
}

export function buildWaLink(phone: string, text?: string): string {
  const digits = phone.replace(/\D/g, '')
  const base = `https://wa.me/${digits}`
  return text ? `${base}?text=${encodeURIComponent(text)}` : base
}
