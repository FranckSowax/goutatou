import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

function key(keyHex: string): Buffer {
  const buf = Buffer.from(keyHex, 'hex')
  if (buf.length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY doit faire 32 octets hex (64 caractères)')
  return buf
}

/** Format de sortie : base64(iv[12]) . base64(tag[16]) . base64(ciphertext), séparés par ':' */
export function encryptToken(plain: string, keyHex: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(keyHex), iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), enc.toString('base64')].join(':')
}

export function decryptToken(payload: string, keyHex: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(':')
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('payload chiffré invalide')
  const decipher = createDecipheriv('aes-256-gcm', key(keyHex), Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8')
}
