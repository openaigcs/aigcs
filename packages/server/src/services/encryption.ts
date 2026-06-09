import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const TAG_LENGTH = 16

function getKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || 'change-me-in-production'
  return createHash('sha256').update(secret).digest()
}

export function encrypt(plaintext: string): string {
  if (!plaintext) return plaintext
  const key = getKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  let encrypted = cipher.update(plaintext, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const tag = cipher.getAuthTag().toString('hex')
  return iv.toString('hex') + ':' + tag + ':' + encrypted
}

export function decrypt(ciphertext: string): string {
  if (!ciphertext || !ciphertext.includes(':')) return ciphertext
  const key = getKey()
  const parts = ciphertext.split(':')
  if (parts.length !== 3) return ciphertext
  const [ivHex, tagHex, encrypted] = parts
  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

export function mask(value: string, visibleChars = 4): string {
  if (!value || value.length <= visibleChars) return value
  return '*'.repeat(Math.min(value.length - visibleChars, 12)) + value.slice(-visibleChars)
}

export function isEncrypted(value: string): boolean {
  return typeof value === 'string' && value.includes(':') && value.length > 40
}
