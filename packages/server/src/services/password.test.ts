import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword, isLegacyHash } from './password.js'

describe('password', () => {
  it('should hash and verify password', async () => {
    const password = 'test-password-123'
    const hash = await hashPassword(password)
    expect(hash).toBeTruthy()
    expect(hash.startsWith('$argon2id$')).toBe(true)

    const valid = await verifyPassword(password, hash)
    expect(valid).toBe(true)

    const invalid = await verifyPassword('wrong-password', hash)
    expect(invalid).toBe(false)
  })

  it('should detect legacy bcrypt hashes', () => {
    expect(isLegacyHash('$2a$12$abcdefghijklmnopqrstuvwxyz1234567890ABCDEFG')).toBe(true)
    expect(isLegacyHash('$2b$12$abcdefghijklmnopqrstuvwxyz1234567890ABCDEFG')).toBe(true)
    expect(isLegacyHash('$argon2id$v=19$m=65536,t=3,p=4$...')).toBe(false)
    expect(isLegacyHash('')).toBe(false)
  })

  it('should handle empty password', async () => {
    const hash = await hashPassword('')
    const valid = await verifyPassword('', hash)
    expect(valid).toBe(true)
  })
})
