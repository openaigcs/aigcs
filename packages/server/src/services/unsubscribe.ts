import { createHash } from 'node:crypto'

const SECRET = process.env.JWT_SECRET || process.env.APP_SECRET || 'aigcs-unsubscribe-secret'

export function generateUnsubscribeToken(email: string, context: string): string {
  const hmac = createHash('sha256')
  hmac.update(`${email}:${context}:${SECRET}`)
  return hmac.digest('hex').slice(0, 16)
}

export function verifyUnsubscribeToken(email: string, context: string, token: string): boolean {
  return token === generateUnsubscribeToken(email, context)
}

export function buildUnsubscribeUrl(adminUrl: string, email: string, context: string, locale?: string): string {
  const token = generateUnsubscribeToken(email, context)
  let url = `${adminUrl.replace(/\/+$/, '')}/api/unsubscribe?email=${encodeURIComponent(email)}&ctx=${encodeURIComponent(context)}&token=${token}`
  if (locale) url += `&locale=${locale}`
  return url
}

export function resolveAdminUrl(envAdminUrl: string | undefined, siteDomain: string): string {
  let base = (envAdminUrl || '').trim()
  if (!base) return `https://${siteDomain}`
  try {
    const parsed = new URL(base)
    if (parsed.hostname === 'api' || parsed.hostname === 'localhost' || !parsed.hostname.includes('.')) {
      return `https://${siteDomain}`
    }
    if (parsed.protocol === 'http:' && !['127.0.0.1', 'localhost', '0.0.0.0'].includes(parsed.hostname)) {
      base = base.replace(/^http:/i, 'https:')
    }
    return base
  } catch {
    return `https://${siteDomain}`
  }
}

export function isUnsubscribed(rawDb: any, email: string, context: string): boolean {
  const row = rawDb.prepare('SELECT id FROM email_unsubscribes WHERE email = ? AND context = ?').get(email.toLowerCase(), context) as any
  return !!row
}
