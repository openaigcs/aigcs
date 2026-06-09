import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import { getDb } from '../db/index.js'
import { sql, eq } from 'drizzle-orm'
import { users } from '@aigcs/core'
import { createHash, timingSafeEqual } from 'node:crypto'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production'

export function getJwtSecret(): string {
  return process.env.JWT_SECRET || 'change-me-in-production'
}

export interface AuthUser {
  id: string
  email: string
  role: string
}

declare module 'hono' {
  interface ContextVariableMap {
    user: AuthUser | null
    userId: string | null
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export const authMiddleware = createMiddleware(async (c, next) => {
  const auth = c.req.header('Authorization')
  c.set('user', null)
  c.set('userId', null)

  if (!auth) return next()

  // Bearer token (JWT or API token)
  const [scheme, token] = auth.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !token) return next()

  // Try JWT first
  try {
    const payload = jwt.verify(token, getJwtSecret()) as { sub: string; role: string; email: string }
    c.set('user', { id: payload.sub, email: payload.email, role: payload.role })
    c.set('userId', payload.sub)
    return next()
  } catch {
    // Not a valid JWT, try API token
  }

  // Try API token
  const db = getDb()
  const prefix = token.slice(0, 8)
  const hashed = hashToken(token)

  const result = db
    .select({ userId: users.id, userRole: users.role, userEmail: users.email })
    .from(users)
    .where(
      sql`EXISTS (
        SELECT 1 FROM api_tokens
        WHERE api_tokens.user_id = users.id
        AND api_tokens.token_hash = ${hashed}
        AND api_tokens.token_prefix = ${prefix}
        AND (api_tokens.expires_at IS NULL OR api_tokens.expires_at > datetime('now'))
      )`,
    )
    .get()

  if (result) {
    // Update last_used_at
    db.run(
      sql`UPDATE api_tokens SET last_used_at = datetime('now') WHERE token_hash = ${hashed}`,
    )
    c.set('user', { id: result.userId, email: result.userEmail, role: result.userRole })
    c.set('userId', result.userId)
  }

  return next()
})

export function requireAuth(c: { get: (key: string) => unknown }): AuthUser {
  const user = c.get('user') as AuthUser | null
  if (!user) throw new HTTPException(401, { message: 'Authentication required' })
  return user
}

// Middleware version for use in app.use() or route middlewares
export const authGuard = createMiddleware(async (c, next) => {
  requireAuth(c)
  await next()
})

export function requireRole(...roles: string[]) {
  return createMiddleware(async (c, next) => {
    const user = requireAuth(c)
    if (!roles.includes(user.role)) {
      throw new HTTPException(403, { message: 'Insufficient permissions' })
    }
    return next()
  })
}
