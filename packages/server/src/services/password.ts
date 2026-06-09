import * as argon2 from 'argon2'
import bcrypt from 'bcryptjs'

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id })
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (hash.startsWith('$2a$') || hash.startsWith('$2b$')) {
    return bcrypt.compare(password, hash)
  }
  try {
    return await argon2.verify(hash, password)
  } catch {
    return false
  }
}

export function isLegacyHash(hash: string): boolean {
  return hash.startsWith('$2a$') || hash.startsWith('$2b$')
}
