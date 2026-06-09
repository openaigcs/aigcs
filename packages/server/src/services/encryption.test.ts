import { describe, it, expect } from 'vitest'
import { encrypt, decrypt, mask, isEncrypted } from './encryption.js'

describe('encryption', () => {
  const testCases = [
    'hello world',
    'sk-abc123def456',
    '',
    'a',
    'very long string that should still work correctly with encryption and decryption',
  ]

  it('should encrypt and decrypt correctly', () => {
    for (const tc of testCases) {
      if (!tc) continue
      const encrypted = encrypt(tc)
      expect(encrypted).not.toBe(tc)
      expect(encrypted.includes(':')).toBe(true)
      const decrypted = decrypt(encrypted)
      expect(decrypted).toBe(tc)
    }
  })

  it('should return empty string for empty input', () => {
    expect(encrypt('')).toBe('')
    expect(decrypt('')).toBe('')
  })

  it('should return plaintext for non-encrypted input in decrypt', () => {
    expect(decrypt('plaintext')).toBe('plaintext')
  })

  it('mask should hide all but last N characters', () => {
    expect(mask('sk-abc123def456')).toContain('f456')
    expect(mask('sk-abc123def456')).not.toContain('sk-a')
    expect(mask('abc', 4)).toBe('abc')
    expect(mask('')).toBe('')
  })

  it('isEncrypted should detect encrypted format', () => {
    const encrypted = encrypt('test-key')
    expect(isEncrypted(encrypted)).toBe(true)
    expect(isEncrypted('plaintext')).toBe(false)
    expect(isEncrypted('')).toBe(false)
    expect(isEncrypted('short:no')).toBe(false)
  })

  it('should produce unique ciphertexts for same plaintext', () => {
    const e1 = encrypt('same-value')
    const e2 = encrypt('same-value')
    expect(e1).not.toBe(e2)
    expect(decrypt(e1)).toBe(decrypt(e2))
  })
})
