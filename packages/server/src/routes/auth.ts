import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { getDb, getRawDb } from '../db/index.js'
import { users, auditLog, userPasskeys, userOauthAccounts } from '@aigcs/core'
import { eq, and, sql } from 'drizzle-orm'
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server'
import { HTTPException } from 'hono/http-exception'
import jwt from 'jsonwebtoken'
import { authGuard } from '../middleware/auth.js'
import { hashPassword, verifyPassword, isLegacyHash } from '../services/password.js'
import { nanoid } from 'nanoid'
import { generateSecret, generateURI, verifySync } from 'otplib'
import QRCode from 'qrcode'
import { encrypt, decrypt } from '../services/encryption.js'
import { createHash, randomBytes } from 'node:crypto'
import { writeFile, mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

// In-memory temp token store for TOTP challenge
const totpChallengeStore = new Map<string, { userId: string; expiresAt: number }>()

const JWT_SECRET_INIT: string = process.env.JWT_SECRET || 'change-me-in-production'
function jwtSecret(): string {
  return process.env.JWT_SECRET || 'change-me-in-production'
}
const ACCESS_TOKEN_EXPIRES = '15m' as const
const REFRESH_TOKEN_EXPIRES = '7d' as const

const router = new Hono()

async function verifyCaptcha(raw: any, token: string, provider: string): Promise<boolean> {
  const config = raw.prepare?.("SELECT * FROM system_config WHERE id = 'global'").get() as Record<string, unknown> | undefined

  if (provider === 'turnstile') {
    const secret = config?.turnstile_secret_key as string | undefined
    if (!secret) return false
    try {
      const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret, response: token }),
      })
      const data = await res.json() as { success?: boolean }
      return !!data.success
    } catch { return false }
  }

  if (provider === 'recaptcha') {
    const secret = config?.recaptcha_secret_key as string | undefined
    if (!secret) return false
    const params = new URLSearchParams({ secret, response: token })
    try {
      const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params,
      })
      const data = await res.json() as { success?: boolean }
      return !!data.success
    } catch { return false }
  }

  if (provider === 'geetest') {
    const secret = config?.geetest_captcha_key as string | undefined
    const captchaId = config?.geetest_captcha_id as string | undefined
    if (!secret || !captchaId) return false

    let validateData: Record<string, string>
    try { validateData = JSON.parse(token) } catch { return false }

    const lot_number = validateData.lot_number || ''
    if (!lot_number) return false

    try {
      const { createHmac } = await import('node:crypto')
      const sign_token = createHmac('sha256', secret).update(lot_number).digest('hex')

      const params = new URLSearchParams({
        captcha_id: captchaId,
        lot_number: lot_number,
        captcha_output: validateData.captcha_output || '',
        pass_token: validateData.pass_token || '',
        gen_time: validateData.gen_time || '',
        sign_token: sign_token,
      })

      const res = await fetch('https://gcaptcha4.geetest.com/validate?captcha_id=' + captchaId, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params,
      })
      const data = await res.json() as { result?: string }
      return data.result === 'success'
    } catch { return false }
  }

  if (provider === 'cap') {
    const secret = config?.cap_secret_key as string | undefined
    if (!secret) return false
    const verifyUrl = (config?.cap_verify_url as string) || 'https://verify.cap.so/api/verify'
    try {
      const res = await fetch(verifyUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret, token }),
      })
      const data = await res.json() as { success?: boolean }
      return !!data.success
    } catch { return false }
  }

  if (provider === 'altcha') {
    const secret = config?.altcha_secret_key as string | undefined
    if (!secret) return false
    // Altcha uses local HMAC verification — no remote API call
    let payload: any
    try { payload = JSON.parse(Buffer.from(token, 'base64').toString()) } catch { return false }
    if (!payload.challenge || !payload.salt || !payload.number || !payload.signature) return false
    const { createHmac } = await import('node:crypto')
    const expected = createHmac('sha256', secret)
      .update(payload.challenge + payload.salt + payload.number)
      .digest('hex')
    return expected === payload.signature
  }

  if (provider === 'hcaptcha') {
    const secret = config?.hcaptcha_secret_key as string | undefined
    if (!secret) return false
    const params = new URLSearchParams({ secret, response: token })
    try {
      const res = await fetch('https://hcaptcha.com/siteverify', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params,
      })
      const data = await res.json() as { success?: boolean }
      return !!data.success
    } catch { return false }
  }

  return false
}

const registerSchema = z.object({
  email: z.string().email(),
  username: z.string().min(1).max(64),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(64).optional(),
  captchaToken: z.string().optional(),
})

const loginSchema = z.object({
  identity: z.string().min(1),
  password: z.string(),
  captchaToken: z.string().optional(),
})

async function assertCaptcha(raw: any, captchaToken: string | undefined): Promise<void> {
  const config = raw.prepare?.("SELECT captcha_provider FROM system_config WHERE id = 'global'").get() as { captcha_provider: string } | undefined
  const provider = config?.captcha_provider
  if (!provider || provider === 'none') return
  if (!captchaToken) throw new HTTPException(400, { message: 'CAPTCHA verification required' })
  const ok = await verifyCaptcha(raw, captchaToken, provider)
  if (!ok) throw new HTTPException(400, { message: 'CAPTCHA verification failed' })
}

// POST /api/auth/register
router.post('/register', zValidator('json', registerSchema), async (c) => {
  const db = getDb()
  const { email, username, password, displayName, captchaToken } = c.req.valid('json')

  const existing = db.select().from(users).where(eq(users.email, email)).get()
  if (existing) {
    throw new HTTPException(409, { message: 'Email already registered' })
  }

  const existingUsername = db.select().from(users).where(eq(users.username, username)).get()
  if (existingUsername) {
    throw new HTTPException(409, { message: 'Username already taken' })
  }

  // Check if registration is open
  const raw = getRawDb()
  const userCount = db.select({ count: sql<number>`count(*)` }).from(users).get()
  const isFirstUser = !userCount || userCount.count === 0

  if (!isFirstUser) {
    const regConfig = raw.prepare?.("SELECT registration_open FROM system_config WHERE id = 'global'").get() as { registration_open: number } | undefined
    if (regConfig && !regConfig.registration_open) {
      throw new HTTPException(403, { message: 'Registration is closed' })
    }
  }

  // CAPTCHA verification
  await assertCaptcha(raw, captchaToken)

  const passwordHash = await hashPassword(password)
  const id = nanoid()
  const role = isFirstUser ? 'admin' : 'user'

  db.insert(users).values({ id, email, username, passwordHash, displayName: displayName || email.split('@')[0], role }).run()

  // Welcome email (best-effort)
  try {
    const smtpConfig = raw.prepare?.("SELECT smtp_host FROM system_config WHERE id = 'global'").get() as { smtp_host: string | null } | undefined
    if (smtpConfig?.smtp_host) {
      const { isUnsubscribed, buildUnsubscribeUrl } = await import('../services/unsubscribe.js')
      if (isUnsubscribed(raw, email.toLowerCase(), 'global')) return
      const { sendEmail } = await import('../services/email.js')
      const { renderEmail, getEmailSubject, getEmailLocale } = await import('../email-templates/index.js')
      const adminUrl = process.env.ADMIN_URL || (() => {
        try {
          const reqUrl = new URL(c.req.url)
          const proto = c.req.header('x-forwarded-proto') ? `${c.req.header('x-forwarded-proto')}:` : reqUrl.protocol
          return `${proto}//${reqUrl.host}`
        } catch { return '' }
      })()
      const emailLocale = getEmailLocale(raw)
      const unsubscribeUrl = buildUnsubscribeUrl(adminUrl, email.toLowerCase(), 'global', emailLocale)
      sendEmail(email, getEmailSubject('welcome', emailLocale), renderEmail({
        template: 'welcome',
        locale: emailLocale,
        title: getEmailSubject('welcome', emailLocale),
        data: { email },
        unsubscribeUrl,
        unsubscribeText: emailLocale === 'zh' ? '取消订阅' : 'Unsubscribe',
      })).catch(err => console.error('[email] Failed to send welcome email:', err))
    }
  } catch (err) {
    console.error('[auth] Welcome email failed:', err)
  }

  const accessToken = jwt.sign({ sub: id, email, role }, jwtSecret(), { expiresIn: ACCESS_TOKEN_EXPIRES })
  const refreshToken = jwt.sign({ sub: id, type: 'refresh' }, jwtSecret(), { expiresIn: REFRESH_TOKEN_EXPIRES })

  return c.json({
    code: 0,
    data: {
      accessToken,
      refreshToken,
      token: accessToken,
      expiresIn: 900,
      user: { id, email, displayName: displayName || email.split('@')[0], role },
    },
  })
})

// POST /api/auth/login
router.post('/login', zValidator('json', loginSchema), async (c) => {
  const db = getDb()
  const { identity, password, captchaToken } = c.req.valid('json')

  // Find user by email or username
  let user = identity.includes('@')
    ? db.select().from(users).where(eq(users.email, identity)).get()
    : db.select().from(users).where(eq(users.username, identity)).get()
  if (!user) {
    user = identity.includes('@')
      ? db.select().from(users).where(eq(users.username, identity)).get()
      : db.select().from(users).where(eq(users.email, identity)).get()
  }
  if (!user) {
    throw new HTTPException(401, { message: 'Invalid credentials' })
  }

  // CAPTCHA verification
  const raw = getRawDb()
  await assertCaptcha(raw, captchaToken)

  const valid = await verifyPassword(password, user.passwordHash)
  if (!valid) {
    throw new HTTPException(401, { message: 'Invalid email or password' })
  }

  if (isLegacyHash(user.passwordHash)) {
    const newHash = await hashPassword(password)
    db.update(users).set({ passwordHash: newHash, updatedAt: new Date().toISOString() }).where(eq(users.id, user.id)).run()
  }

  if (user.totpEnabled) {
    const tempToken = nanoid()
    totpChallengeStore.set(tempToken, { userId: user.id, expiresAt: Date.now() + 300000 })
    return c.json({ code: 0, data: { totpRequired: true, tempToken, email: user.email } })
  }

  const accessToken = jwt.sign({ sub: user.id, email: user.email, role: user.role }, jwtSecret(), { expiresIn: ACCESS_TOKEN_EXPIRES })
  const refreshToken = jwt.sign({ sub: user.id, type: 'refresh' }, jwtSecret(), { expiresIn: REFRESH_TOKEN_EXPIRES })

  return c.json({
    code: 0,
    data: {
      accessToken,
      refreshToken,
      token: accessToken,
      expiresIn: 900,
      user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role },
    },
  })
})

// POST /api/auth/totp/verify — complete TOTP step-up
const totpVerifySchema = z.object({
  tempToken: z.string().min(1),
  code: z.string().min(1),
})

router.post('/totp/verify', zValidator('json', totpVerifySchema), async (c) => {
  const db = getDb()
  const { tempToken, code } = c.req.valid('json')

  const challenge = totpChallengeStore.get(tempToken)
  if (!challenge || challenge.expiresAt < Date.now()) {
    totpChallengeStore.delete(tempToken)
    throw new HTTPException(400, { message: 'TOTP challenge expired or invalid. Please login again.' })
  }
  totpChallengeStore.delete(tempToken)

  const user = db.select().from(users).where(eq(users.id, challenge.userId)).get()
  if (!user) throw new HTTPException(404, { message: 'User not found' })

  if (!user.totpSecret) {
    throw new HTTPException(400, { message: 'TOTP not configured. Please set up TOTP first.' })
  }
  let codeValid = false
  codeValid = verifySync({ token: code, secret: decrypt(user.totpSecret) }).valid
  if (!codeValid && user.totpBackupCodes) {
    const backups: string[] = JSON.parse(user.totpBackupCodes)
    const codeHash = createHash('sha256').update(code).digest('hex')
    const idx = backups.indexOf(codeHash)
    if (idx !== -1) {
      codeValid = true
      backups.splice(idx, 1)
      db.update(users).set({ totpBackupCodes: JSON.stringify(backups) }).where(eq(users.id, user.id)).run()
    }
  }

  if (!codeValid) throw new HTTPException(400, { message: 'Invalid TOTP code' })

  const accessToken = jwt.sign({ sub: user.id, email: user.email, role: user.role }, jwtSecret(), { expiresIn: ACCESS_TOKEN_EXPIRES })
  const refreshToken = jwt.sign({ sub: user.id, type: 'refresh' }, jwtSecret(), { expiresIn: REFRESH_TOKEN_EXPIRES })

  return c.json({
    code: 0,
    data: {
      accessToken,
      refreshToken,
      token: accessToken,
      expiresIn: 900,
      user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role },
    },
  })
})

// GET /api/auth/me
router.get('/me', async (c) => {
  const tokenUser = c.get('user')
  if (!tokenUser) throw new HTTPException(401, { message: 'Not authenticated' })
  const db = getDb()
  const user = db.select({
    id: users.id,
    email: users.email,
    username: users.username,
    displayName: users.displayName,
    role: users.role,
    totpEnabled: users.totpEnabled,
    avatar: users.avatar,
    createdAt: users.createdAt,
  }).from(users).where(eq(users.id, tokenUser.id)).get()
  const data = user || tokenUser
  return c.json({ code: 0, data: { ...data, avatarUrl: data.avatar ? `/api/auth/avatar/${data.id}` : '' } })
})

// GET /api/auth/captcha/config — public endpoint for login page to render CAPTCHA widget
router.get('/captcha/config', async (c) => {
  const raw = getRawDb()
  const config = raw.prepare?.("SELECT * FROM system_config WHERE id = 'global'").get() as Record<string, unknown> | undefined
  if (!config) return c.json({ code: 0, data: { provider: 'none', siteKey: '' } })

  const provider = (config.captcha_provider as string) || 'none'
  let siteKey = ''
  if (provider === 'turnstile') siteKey = (config.turnstile_site_key as string) || ''
  else if (provider === 'recaptcha') siteKey = (config.recaptcha_site_key as string) || ''
  else if (provider === 'geetest') siteKey = (config.geetest_captcha_id as string) || ''
  else if (provider === 'cap') siteKey = (config.cap_site_key as string) || ''
  else if (provider === 'altcha') siteKey = (config.altcha_site_key as string) || ''
  else if (provider === 'hcaptcha') siteKey = (config.hcaptcha_site_key as string) || ''

  return c.json({ code: 0, data: { provider, siteKey } })
})

const captchaVerifySchema = z.object({
  token: z.string().min(1),
  provider: z.string().min(1),
})

// POST /api/auth/captcha/verify
router.post('/captcha/verify', zValidator('json', captchaVerifySchema), async (c) => {
  const raw = getRawDb()
  const config = raw.prepare?.(
    "SELECT * FROM system_config WHERE id = 'global'",
  ).get() as Record<string, unknown> | undefined

  const { token, provider } = c.req.valid('json')

  let success = false

  if (provider === 'turnstile') {
    const secret = config?.turnstile_secret_key as string | undefined
    if (secret) {
      try {
        const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ secret, response: token }),
        })
        const data = await res.json() as { success?: boolean }
        success = !!data.success
      } catch { success = false }
    }
  } else if (provider === 'recaptcha') {
    const secret = config?.recaptcha_secret_key as string | undefined
    if (secret) {
      const params = new URLSearchParams({ secret, response: token })
      try {
        const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params,
        })
        const data = await res.json() as { success?: boolean }
        success = !!data.success
      } catch { success = false }
    }
  } else if (provider === 'geetest') {
    success = true
  } else if (provider === 'cap') {
    const secret = config?.cap_secret_key as string | undefined
    if (secret) {
      const verifyUrl = (config?.cap_verify_url as string) || 'https://verify.cap.so/api/verify'
      try {
        const res = await fetch(verifyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ secret, token }),
        })
        const data = await res.json() as { success?: boolean }
        success = !!data.success
      } catch { success = false }
    }
  } else if (provider === 'altcha') {
    const secret = config?.altcha_secret_key as string | undefined
    if (secret) {
      // Altcha local HMAC verification
      try {
        const payload = JSON.parse(Buffer.from(token, 'base64').toString())
        if (payload.challenge && payload.salt && payload.number && payload.signature) {
          const { createHmac } = await import('node:crypto')
          const expected = createHmac('sha256', secret)
            .update(payload.challenge + payload.salt + payload.number)
            .digest('hex')
          success = expected === payload.signature
        }
      } catch {}
    }
  } else if (provider === 'hcaptcha') {
    const secret = config?.hcaptcha_secret_key as string | undefined
    if (secret) {
      const params = new URLSearchParams({ secret, response: token })
      try {
        const res = await fetch('https://hcaptcha.com/siteverify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params,
        })
        const data = await res.json() as { success?: boolean }
        success = !!data.success
      } catch { success = false }
    }
  }

  return c.json({ code: 0, data: { success } })
})

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
})

router.post('/change-password', authGuard, zValidator('json', changePasswordSchema), async (c) => {
  const user = c.get('user')!
  const db = getDb()
  const { currentPassword, newPassword } = c.req.valid('json')

  const stored = db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, user.id)).get()
  if (!stored) throw new HTTPException(404, { message: 'User not found' })

  const valid = await verifyPassword(currentPassword, stored.passwordHash)
  if (!valid) throw new HTTPException(400, { message: 'Current password is incorrect' })

  const newHash = await hashPassword(newPassword)
  db.update(users).set({ passwordHash: newHash, updatedAt: new Date().toISOString() }).where(eq(users.id, user.id)).run()

  db.insert(auditLog).values({ id: nanoid(), userId: user.id, action: 'auth.password.change' }).run()

  return c.json({ code: 0, message: 'Password changed successfully' })
})

// POST /api/auth/totp/setup — generate TOTP secret and QR code URI
const totpSetupSchema = z.object({
  password: z.string().min(1),
})

router.post('/totp/setup', authGuard, zValidator('json', totpSetupSchema), async (c) => {
  const user = c.get('user')!
  const db = getDb()
  const { password } = c.req.valid('json')

  const stored = db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, user.id)).get()
  if (!stored) throw new HTTPException(404, { message: 'User not found' })

  const valid = await verifyPassword(password, stored.passwordHash)
  if (!valid) throw new HTTPException(400, { message: 'Password is incorrect' })

  const secret = generateSecret()
  const serviceName = 'AIGCS'
  const otpauth = generateURI({ issuer: serviceName, label: user.email, secret })

  const qrCode = await QRCode.toDataURL(otpauth)

  db.insert(auditLog).values({ id: nanoid(), userId: user.id, action: 'auth.totp.setup' }).run()

  return c.json({ code: 0, data: { secret, qrCode, uri: otpauth } })
})

// POST /api/auth/totp/enable — verify a code and enable TOTP
const totpEnableSchema = z.object({
  secret: z.string().min(1),
  code: z.string().min(6).max(6),
})

router.post('/totp/enable', authGuard, zValidator('json', totpEnableSchema), async (c) => {
  const user = c.get('user')!
  const db = getDb()
  const { secret, code } = c.req.valid('json')

  const isValid = verifySync({ token: code, secret }).valid
  if (!isValid) throw new HTTPException(400, { message: 'Invalid verification code' })

  const backupCodes = Array.from({ length: 8 }, () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    const bytes = randomBytes(10)
    return Array.from(bytes, b => chars[b % chars.length]).join('')
  })
  const hashedBackupCodes = backupCodes.map(code => createHash('sha256').update(code).digest('hex'))

  db.update(users).set({
    totpSecret: encrypt(secret),
    totpEnabled: true,
    totpBackupCodes: JSON.stringify(hashedBackupCodes),
    updatedAt: new Date().toISOString(),
  }).where(eq(users.id, user.id)).run()

  db.insert(auditLog).values({ id: nanoid(), userId: user.id, action: 'auth.totp.enable' }).run()

  return c.json({ code: 0, data: { backupCodes } })
})

// POST /api/auth/totp/disable — disable TOTP (requires TOTP code or backup code)
const totpDisableSchema = z.object({
  password: z.string().min(1),
  code: z.string().min(1),
})

router.post('/totp/disable', authGuard, zValidator('json', totpDisableSchema), async (c) => {
  const user = c.get('user')!
  const db = getDb()
  const { password, code } = c.req.valid('json')

  const stored = db.select({ passwordHash: users.passwordHash, totpSecret: users.totpSecret, totpBackupCodes: users.totpBackupCodes }).from(users).where(eq(users.id, user.id)).get()
  if (!stored) throw new HTTPException(404, { message: 'User not found' })

  const valid = await verifyPassword(password, stored.passwordHash)
  if (!valid) throw new HTTPException(400, { message: 'Password is incorrect' })

  let codeValid = false
  if (stored.totpSecret) {
    codeValid = verifySync({ token: code, secret: decrypt(stored.totpSecret) }).valid
  }
  if (!codeValid && stored.totpBackupCodes) {
    const backups: string[] = JSON.parse(stored.totpBackupCodes)
    const codeHash = createHash('sha256').update(code).digest('hex')
    const idx = backups.indexOf(codeHash)
    if (idx !== -1) {
      codeValid = true
      backups.splice(idx, 1)
      db.update(users).set({ totpBackupCodes: JSON.stringify(backups) }).where(eq(users.id, user.id)).run()
    }
  }
  if (!codeValid) throw new HTTPException(400, { message: 'Invalid TOTP code or backup code' })

  db.update(users).set({
    totpSecret: null,
    totpEnabled: false,
    totpBackupCodes: null,
    updatedAt: new Date().toISOString(),
  }).where(eq(users.id, user.id)).run()

  db.insert(auditLog).values({ id: nanoid(), userId: user.id, action: 'auth.totp.disable' }).run()

  return c.json({ code: 0, message: 'TOTP disabled' })
})

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
})

router.post('/refresh', zValidator('json', refreshSchema), async (c) => {
  const { refreshToken } = c.req.valid('json')

  try {
    const payload = jwt.verify(refreshToken, jwtSecret()) as { sub: string; type: string }
    if (payload.type !== 'refresh') {
      throw new HTTPException(400, { message: 'Invalid refresh token' })
    }

    const db = getDb()
    const user = db.select().from(users).where(eq(users.id, payload.sub)).get()
    if (!user) throw new HTTPException(404, { message: 'User not found' })

    const accessToken = jwt.sign({ sub: user.id, email: user.email, role: user.role }, jwtSecret(), { expiresIn: ACCESS_TOKEN_EXPIRES })
    return c.json({ code: 0, data: { accessToken, expiresIn: 900 } })
  } catch (err) {
    if (err instanceof HTTPException) throw err
    throw new HTTPException(401, { message: 'Invalid or expired refresh token' })
  }
})

const updateMeSchema = z.object({
  username: z.string().min(1).max(64).optional(),
  email: z.string().email().optional(),
  displayName: z.string().min(1).max(64).optional(),
})

router.put('/me', authGuard, zValidator('json', updateMeSchema), async (c) => {
  const db = getDb()
  const user = c.get('user')!
  const body = c.req.valid('json')

  if (body.email) {
    const dup = db.select().from(users).where(sql`${users.email} = ${body.email} AND id != ${user.id}`).get()
    if (dup) throw new HTTPException(409, { message: 'Email already in use' })
  }
  if (body.username) {
    const dup = db.select().from(users).where(sql`${users.username} = ${body.username} AND id != ${user.id}`).get()
    if (dup) throw new HTTPException(409, { message: 'Username already taken' })
  }

  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() }
  if (body.username !== undefined) updates.username = body.username
  if (body.email !== undefined) updates.email = body.email
  if (body.displayName !== undefined) updates.displayName = body.displayName
  db.update(users).set(updates).where(eq(users.id, user.id)).run()
  db.insert(auditLog).values({ id: nanoid(), userId: user.id, action: 'auth.profile.update', details: { ...body } }).run()
  return c.json({ code: 0, message: 'Profile updated' })
})

// POST /api/auth/avatar — upload custom avatar (max 512x512)
router.post('/avatar', authGuard, async (c) => {
  const user = c.get('user')!
  const body = await c.req.parseBody()
  const file = body['avatar'] as File | undefined
  if (!file || typeof file === 'string') throw new HTTPException(400, { message: 'No file uploaded' })

  if (file.size > 2 * 1024 * 1024) throw new HTTPException(400, { message: 'File too large (max 2MB)' })

  const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
  if (!allowedTypes.includes(file.type)) throw new HTTPException(400, { message: 'Invalid file type (png/jpg/gif/webp)' })

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/gif' ? 'gif' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const avatarsDir = join(process.cwd(), 'data', 'avatars')
  await mkdir(avatarsDir, { recursive: true })
  const filePath = join(avatarsDir, `${user.id}.${ext}`)
  const buffer = Buffer.from(await file.arrayBuffer())
  await writeFile(filePath, buffer)

  const db = getDb()
  db.update(users).set({ avatar: ext, updatedAt: new Date().toISOString() }).where(eq(users.id, user.id)).run()

  db.insert(auditLog).values({ id: nanoid(), userId: user.id, action: 'auth.avatar.upload' }).run()

  return c.json({ code: 0, data: { avatarUrl: `/api/auth/avatar/${user.id}` } })
})

// DELETE /api/auth/avatar — remove custom avatar
router.delete('/avatar', authGuard, async (c) => {
  const user = c.get('user')!
  const db = getDb()
  const row = db.select({ avatar: users.avatar }).from(users).where(eq(users.id, user.id)).get()
  if (row?.avatar) {
    const ext = row.avatar
    const filePath = join(process.cwd(), 'data', 'avatars', `${user.id}.${ext}`)
    try { await import('node:fs/promises').then(fs => fs.unlink(filePath)) } catch {}
  }
  db.update(users).set({ avatar: '', updatedAt: new Date().toISOString() }).where(eq(users.id, user.id)).run()
  db.insert(auditLog).values({ id: nanoid(), userId: user.id, action: 'auth.avatar.remove' }).run()
  return c.json({ code: 0, message: 'Avatar removed' })
})

// GET /api/auth/avatar/:userId — serve user avatar
router.get('/avatar/:userId', async (c) => {
  const userId = c.req.param('userId')
  const db = getDb()
  const user = db.select({ avatar: users.avatar }).from(users).where(eq(users.id, userId)).get()
  if (!user?.avatar) throw new HTTPException(404, { message: 'No avatar' })

  const ext = user.avatar
  const mimeMap: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }
  const mime = mimeMap[ext] || 'image/png'
  const filePath = join(process.cwd(), 'data', 'avatars', `${userId}.${ext}`)
  try {
    const data = await readFile(filePath)
    return new Response(data, { headers: { 'Content-Type': mime, 'Cache-Control': 'public, max-age=86400' } })
  } catch {
    throw new HTTPException(404, { message: 'Avatar file not found' })
  }
})

// ── Passkey / WebAuthn Options Store ──
const passkeyRegistrationStore = new Map<string, { userId: string; challenge: string; expiresAt: number }>()
const passkeyAuthenticationStore = new Map<string, { userId?: string; challenge: string; expiresAt: number }>()

// Clean up expired challenges
setInterval(() => {
  const now = Date.now()
  for (const [k, v] of passkeyRegistrationStore.entries()) {
    if (v.expiresAt < now) passkeyRegistrationStore.delete(k)
  }
  for (const [k, v] of passkeyAuthenticationStore.entries()) {
    if (v.expiresAt < now) passkeyAuthenticationStore.delete(k)
  }
}, 300000)

// GET /api/auth/passkey/list
router.get('/passkey/list', authGuard, async (c) => {
  const user = c.get('user')!
  const db = getDb()
  const list = db.select({
    id: userPasskeys.id,
    deviceType: userPasskeys.deviceType,
    createdAt: userPasskeys.createdAt,
  }).from(userPasskeys).where(eq(userPasskeys.userId, user.id)).all()
  return c.json({ code: 0, data: list })
})

// DELETE /api/auth/passkey/delete/:id
router.delete('/passkey/delete/:id', authGuard, async (c) => {
  const user = c.get('user')!
  const id = c.req.param('id')
  const db = getDb()
  db.delete(userPasskeys).where(and(eq(userPasskeys.id, id), eq(userPasskeys.userId, user.id))).run()
  db.insert(auditLog).values({ id: nanoid(), userId: user.id, action: 'auth.passkey.delete', details: JSON.stringify({ id }) }).run()
  return c.json({ code: 0, message: 'Passkey deleted' })
})

// POST /api/auth/passkey/register-options
router.post('/passkey/register-options', authGuard, async (c) => {
  const user = c.get('user')!
  const db = getDb()
  const rpName = 'AIGCS'
  const rpID = process.env.RP_ID || c.req.header('host')?.split(':')[0] || 'localhost'

  const userKeys = db.select().from(userPasskeys).where(eq(userPasskeys.userId, user.id)).all()
  const dbUser = db.select().from(users).where(eq(users.id, user.id)).get() as any

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID: Uint8Array.from(Buffer.from(user.id)),
    userName: user.email,
    userDisplayName: dbUser?.displayName || user.email,
    attestationType: 'none',
    excludeCredentials: userKeys.map((k: any) => ({
      id: Buffer.from(k.credentialId, 'base64url'),
      type: 'public-key',
    })),
    authenticatorSelection: {
      residentKey: 'required',
      userVerification: 'preferred',
    },
  })

  passkeyRegistrationStore.set(user.id, {
    userId: user.id,
    challenge: options.challenge,
    expiresAt: Date.now() + 300000,
  })

  return c.json({ code: 0, data: options })
})

// POST /api/auth/passkey/register-verify
router.post('/passkey/register-verify', authGuard, async (c) => {
  const user = c.get('user')!
  const body = await c.req.json()
  const db = getDb()

  const store = passkeyRegistrationStore.get(user.id)
  if (!store || store.expiresAt < Date.now()) {
    throw new HTTPException(400, { message: 'Challenge expired or invalid' })
  }
  passkeyRegistrationStore.delete(user.id)

  const rpID = process.env.RP_ID || c.req.header('host')?.split(':')[0] || 'localhost'
  const origin = process.env.RP_ORIGIN || `${c.req.header('x-forwarded-proto') || 'http'}://${c.req.header('host')}`

  let verification
  try {
    verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge: store.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
    })
  } catch (err: any) {
    throw new HTTPException(400, { message: `Verification failed: ${err.message}` })
  }

  const { verified, registrationInfo } = verification
  if (!verified || !registrationInfo) {
    throw new HTTPException(400, { message: 'Verification failed' })
  }

  const credentialID = registrationInfo.credential.id
  const credentialPublicKey = registrationInfo.credential.publicKey
  const counter = registrationInfo.credential.counter
  const credentialDeviceType = registrationInfo.credentialDeviceType

  const credIdBase64 = Buffer.from(credentialID).toString('base64url')
  const pubKeyBase64 = Buffer.from(credentialPublicKey).toString('base64url')

  db.insert(userPasskeys).values({
    id: nanoid(),
    userId: user.id,
    credentialId: credIdBase64,
    publicKey: pubKeyBase64,
    counter: counter,
    deviceType: credentialDeviceType,
    backedUp: registrationInfo.credentialBackedUp ? 1 : 0,
  } as any).run()

  db.insert(auditLog).values({ id: nanoid(), userId: user.id, action: 'auth.passkey.register' }).run()

  return c.json({ code: 0, message: 'Passkey registered successfully' })
})

// POST /api/auth/passkey/login-options
router.post('/passkey/login-options', async (c) => {
  const rpID = process.env.RP_ID || c.req.header('host')?.split(':')[0] || 'localhost'

  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: 'preferred',
  })

  const optionId = nanoid()
  passkeyAuthenticationStore.set(optionId, {
    challenge: options.challenge,
    expiresAt: Date.now() + 300000,
  })

  return c.json({ code: 0, data: { options, optionId } })
})

// POST /api/auth/passkey/login-verify
router.post('/passkey/login-verify', async (c) => {
  const { optionId, assertion } = await c.req.json() as { optionId: string; assertion: any }
  const db = getDb()

  const store = passkeyAuthenticationStore.get(optionId)
  if (!store || store.expiresAt < Date.now()) {
    throw new HTTPException(400, { message: 'Challenge expired or invalid' })
  }
  passkeyAuthenticationStore.delete(optionId)

  const credIdBase64 = assertion.id
  const passkey = db.select().from(userPasskeys).where(eq(userPasskeys.credentialId, credIdBase64)).get()
  if (!passkey) {
    throw new HTTPException(400, { message: 'Passkey credential not registered' })
  }

  const user = db.select().from(users).where(eq(users.id, passkey.userId)).get()
  if (!user) {
    throw new HTTPException(404, { message: 'User not found' })
  }

  const rpID = process.env.RP_ID || c.req.header('host')?.split(':')[0] || 'localhost'
  const origin = process.env.RP_ORIGIN || `${c.req.header('x-forwarded-proto') || 'http'}://${c.req.header('host')}`

  let verification
  try {
    verification = await verifyAuthenticationResponse({
      response: assertion,
      expectedChallenge: store.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: passkey.credentialId,
        publicKey: Buffer.from(passkey.publicKey, 'base64url'),
        counter: passkey.counter,
      },
      requireUserVerification: false,
    })
  } catch (err: any) {
    throw new HTTPException(400, { message: `Authentication failed: ${err.message}` })
  }

  const { verified, authenticationInfo } = verification
  if (!verified) {
    throw new HTTPException(400, { message: 'Authentication verification failed' })
  }

  db.update(userPasskeys).set({ counter: authenticationInfo.newCounter }).where(eq(userPasskeys.id, passkey.id)).run()

  const accessToken = jwt.sign({ sub: user.id, email: user.email, role: user.role }, jwtSecret(), { expiresIn: ACCESS_TOKEN_EXPIRES })
  const refreshToken = jwt.sign({ sub: user.id, type: 'refresh' }, jwtSecret(), { expiresIn: REFRESH_TOKEN_EXPIRES })

  db.insert(auditLog).values({ id: nanoid(), userId: user.id, action: 'auth.passkey.login' }).run()

  return c.json({
    code: 0,
    data: {
      accessToken,
      refreshToken,
      token: accessToken,
      expiresIn: 900,
      user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role },
    },
  })
})

// GET /api/auth/oauth/github
router.get('/oauth/github', async (c) => {
  const isBind = c.req.query('bind') === 'true'
  const clientId = process.env.GITHUB_CLIENT_ID
  const clientSecret = process.env.GITHUB_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new HTTPException(500, { message: 'GitHub OAuth is not configured' })
  }

  const origin = process.env.RP_ORIGIN || `${c.req.header('x-forwarded-proto') || 'http'}://${c.req.header('host')}`
  const redirectUri = `${origin}/api/auth/oauth/github/callback`
  const state = nanoid()

  c.header('Set-Cookie', `oauth_state=${state}; Path=/; HttpOnly; Max-Age=300; SameSite=Lax`, { append: true })
  if (isBind) {
    const authHeader = c.req.header('Authorization')
    let userId = ''
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const payload = jwt.verify(authHeader.substring(7), jwtSecret()) as any
        userId = payload.sub
      } catch {}
    }
    if (userId) {
      const signedUserId = jwt.sign({ sub: userId }, jwtSecret(), { expiresIn: '5m' })
      c.header('Set-Cookie', `oauth_bind_user=${signedUserId}; Path=/; HttpOnly; Max-Age=300; SameSite=Lax`, { append: true })
    }
  } else {
    c.header('Set-Cookie', 'oauth_bind_user=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax', { append: true })
  }

  const url = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&scope=user:email`
  return c.redirect(url)
})

// GET /api/auth/oauth/github/callback
router.get('/oauth/github/callback', async (c) => {
  const code = c.req.query('code') || ''
  const state = c.req.query('state') || ''
  
  const cookies = c.req.header('Cookie') || ''
  const cookieMap = Object.fromEntries(cookies.split(';').map(v => v.trim().split('=')))
  const expectedState = cookieMap['oauth_state']
  const bindUserToken = cookieMap['oauth_bind_user']

  if (!expectedState || state !== expectedState) {
    return c.html('<h1>Authentication failed: CSRF state invalid.</h1>')
  }

  const clientId = process.env.GITHUB_CLIENT_ID
  const clientSecret = process.env.GITHUB_CLIENT_SECRET
  const origin = process.env.RP_ORIGIN || `${c.req.header('x-forwarded-proto') || 'http'}://${c.req.header('host')}`
  const redirectUri = `${origin}/api/auth/oauth/github/callback`

  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri, state }),
  })
  const tokenData = await tokenRes.json() as { access_token?: string }
  const accessToken = tokenData.access_token
  if (!accessToken) {
    return c.html('<h1>Failed to retrieve GitHub access token.</h1>')
  }

  const userRes = await fetch('https://api.github.com/user', {
    headers: { 'Authorization': `Bearer ${accessToken}`, 'User-Agent': 'AIGCS-OAuth-App' },
  })
  const userData = await userRes.json() as { id: number; login: string; email?: string }
  const providerUserId = String(userData.id)
  
  let email = userData.email || ''
  if (!email) {
    try {
      const emailRes = await fetch('https://api.github.com/user/emails', {
        headers: { 'Authorization': `Bearer ${accessToken}`, 'User-Agent': 'AIGCS-OAuth-App' },
      })
      const emails = await emailRes.json() as Array<{ email: string; primary: boolean; verified: boolean }>
      const primaryEmail = emails.find(e => e.primary) || emails[0]
      email = primaryEmail?.email || ''
    } catch {}
  }

  if (!email) {
    return c.html('<h1>Failed to retrieve primary email from GitHub.</h1>')
  }

  const db = getDb()
  const raw = getRawDb()

  if (bindUserToken) {
    try {
      const payload = jwt.verify(bindUserToken, jwtSecret()) as any
      const loggedInUserId = payload.sub

      const existingBind = db.select().from(userOauthAccounts).where(and(
        eq(userOauthAccounts.providerId, 'github'),
        eq(userOauthAccounts.providerUserId, providerUserId)
      )).get()
      if (existingBind) {
        if (existingBind.userId === loggedInUserId) {
          return c.html(`<script>window.opener.postMessage({ type: 'oauth-bind-success' }, '*'); window.close();</script>`)
        }
        return c.html('<h1>This GitHub account is already bound to another profile.</h1>')
      }

      db.insert(userOauthAccounts).values({
        id: nanoid(),
        userId: loggedInUserId,
        providerId: 'github',
        providerUserId,
      }).run()

      db.insert(auditLog).values({ id: nanoid(), userId: loggedInUserId, action: 'auth.oauth.bind', details: JSON.stringify({ provider: 'github' }) }).run()
      return c.html(`<script>window.opener.postMessage({ type: 'oauth-bind-success' }, '*'); window.close();</script>`)
    } catch {
      return c.html('<h1>Session expired during binding. Please try again.</h1>')
    }
  }

  let oauthBind = db.select().from(userOauthAccounts).where(and(
    eq(userOauthAccounts.providerId, 'github'),
    eq(userOauthAccounts.providerUserId, providerUserId)
  )).get()

  let user = oauthBind ? db.select().from(users).where(eq(users.id, oauthBind.userId)).get() : null

  if (!user) {
    const localUser = db.select().from(users).where(eq(users.email, email)).get()
    if (localUser) {
      db.insert(userOauthAccounts).values({
        id: nanoid(),
        userId: localUser.id,
        providerId: 'github',
        providerUserId,
      }).run()
      user = localUser
    }
  }

  if (!user) {
    const regConfig = raw.prepare?.("SELECT registration_open FROM system_config WHERE id = 'global'").get() as { registration_open: number } | undefined
    const isRegistrationOpen = regConfig?.registration_open === 1

    if (!isRegistrationOpen) {
      return c.redirect(`${origin}/login?error=registration_closed`)
    }

    const id = nanoid()
    const role = 'user'
    db.insert(users).values({
      id,
      email,
      username: userData.login,
      passwordHash: await hashPassword(randomBytes(16).toString('hex')),
      displayName: userData.login,
      role,
    }).run()

    db.insert(userOauthAccounts).values({
      id: nanoid(),
      userId: id,
      providerId: 'github',
      providerUserId,
    }).run()

    user = db.select().from(users).where(eq(users.id, id)).get()!
  }

  const payloadJwt = { sub: user.id, email: user.email, role: user.role }
  const loginAccessToken = jwt.sign(payloadJwt, jwtSecret(), { expiresIn: ACCESS_TOKEN_EXPIRES })
  const loginRefreshToken = jwt.sign({ sub: user.id, type: 'refresh' }, jwtSecret(), { expiresIn: REFRESH_TOKEN_EXPIRES })

  db.insert(auditLog).values({ id: nanoid(), userId: user.id, action: 'auth.oauth.login', details: JSON.stringify({ provider: 'github' }) }).run()

  const dataString = JSON.stringify({
    accessToken: loginAccessToken,
    refreshToken: loginRefreshToken,
    token: loginAccessToken,
    expiresIn: 900,
    user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role }
  })

  return c.html(`<script>window.opener.postMessage({ type: 'oauth-login-success', data: ${dataString} }, '*'); window.close();</script>`)
})

// GET /api/auth/oauth/google
router.get('/oauth/google', async (c) => {
  const isBind = c.req.query('bind') === 'true'
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new HTTPException(500, { message: 'Google OAuth is not configured' })
  }

  const origin = process.env.RP_ORIGIN || `${c.req.header('x-forwarded-proto') || 'http'}://${c.req.header('host')}`
  const redirectUri = `${origin}/api/auth/oauth/google/callback`
  const state = nanoid()

  c.header('Set-Cookie', `oauth_state=${state}; Path=/; HttpOnly; Max-Age=300; SameSite=Lax`, { append: true })
  if (isBind) {
    const authHeader = c.req.header('Authorization')
    let userId = ''
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const payload = jwt.verify(authHeader.substring(7), jwtSecret()) as any
        userId = payload.sub
      } catch {}
    }
    if (userId) {
      const signedUserId = jwt.sign({ sub: userId }, jwtSecret(), { expiresIn: '5m' })
      c.header('Set-Cookie', `oauth_bind_user=${signedUserId}; Path=/; HttpOnly; Max-Age=300; SameSite=Lax`, { append: true })
    }
  } else {
    c.header('Set-Cookie', 'oauth_bind_user=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax', { append: true })
  }

  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&response_type=code&scope=${encodeURIComponent('openid email profile')}`
  return c.redirect(url)
})

// GET /api/auth/oauth/google/callback
router.get('/oauth/google/callback', async (c) => {
  const code = c.req.query('code') || ''
  const state = c.req.query('state') || ''
  
  const cookies = c.req.header('Cookie') || ''
  const cookieMap = Object.fromEntries(cookies.split(';').map(v => v.trim().split('=')))
  const expectedState = cookieMap['oauth_state']
  const bindUserToken = cookieMap['oauth_bind_user']

  if (!expectedState || state !== expectedState) {
    return c.html('<h1>Authentication failed: CSRF state invalid.</h1>')
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const origin = process.env.RP_ORIGIN || `${c.req.header('x-forwarded-proto') || 'http'}://${c.req.header('host')}`
  const redirectUri = `${origin}/api/auth/oauth/google/callback`

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
  })
  const tokenData = await tokenRes.json() as { access_token?: string }
  const accessToken = tokenData.access_token
  if (!accessToken) {
    return c.html('<h1>Failed to retrieve Google access token.</h1>')
  }

  const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  })
  const userData = await userRes.json() as { id: string; email: string; name?: string }
  const providerUserId = userData.id
  const email = userData.email

  if (!email) {
    return c.html('<h1>Failed to retrieve email from Google.</h1>')
  }

  const db = getDb()
  const raw = getRawDb()

  if (bindUserToken) {
    try {
      const payload = jwt.verify(bindUserToken, jwtSecret()) as any
      const loggedInUserId = payload.sub

      const existingBind = db.select().from(userOauthAccounts).where(and(
        eq(userOauthAccounts.providerId, 'google'),
        eq(userOauthAccounts.providerUserId, providerUserId)
      )).get()
      if (existingBind) {
        if (existingBind.userId === loggedInUserId) {
          return c.html(`<script>window.opener.postMessage({ type: 'oauth-bind-success' }, '*'); window.close();</script>`)
        }
        return c.html('<h1>This Google account is already bound to another profile.</h1>')
      }

      db.insert(userOauthAccounts).values({
        id: nanoid(),
        userId: loggedInUserId,
        providerId: 'google',
        providerUserId,
      }).run()

      db.insert(auditLog).values({ id: nanoid(), userId: loggedInUserId, action: 'auth.oauth.bind', details: JSON.stringify({ provider: 'google' }) }).run()
      return c.html(`<script>window.opener.postMessage({ type: 'oauth-bind-success' }, '*'); window.close();</script>`)
    } catch {
      return c.html('<h1>Session expired during binding. Please try again.</h1>')
    }
  }

  let oauthBind = db.select().from(userOauthAccounts).where(and(
    eq(userOauthAccounts.providerId, 'google'),
    eq(userOauthAccounts.providerUserId, providerUserId)
  )).get()

  let user = oauthBind ? db.select().from(users).where(eq(users.id, oauthBind.userId)).get() : null

  if (!user) {
    const localUser = db.select().from(users).where(eq(users.email, email)).get()
    if (localUser) {
      db.insert(userOauthAccounts).values({
        id: nanoid(),
        userId: localUser.id,
        providerId: 'google',
        providerUserId,
      }).run()
      user = localUser
    }
  }

  if (!user) {
    const regConfig = raw.prepare?.("SELECT registration_open FROM system_config WHERE id = 'global'").get() as { registration_open: number } | undefined
    const isRegistrationOpen = regConfig?.registration_open === 1

    if (!isRegistrationOpen) {
      return c.redirect(`${origin}/login?error=registration_closed`)
    }

    const id = nanoid()
    const role = 'user'
    const name = userData.name || email.split('@')[0]
    db.insert(users).values({
      id,
      email,
      username: name + '-' + nanoid(4),
      passwordHash: await hashPassword(randomBytes(16).toString('hex')),
      displayName: name,
      role,
    }).run()

    db.insert(userOauthAccounts).values({
      id: nanoid(),
      userId: id,
      providerId: 'google',
      providerUserId,
    }).run()

    user = db.select().from(users).where(eq(users.id, id)).get()!
  }

  const payloadJwt = { sub: user.id, email: user.email, role: user.role }
  const loginAccessToken = jwt.sign(payloadJwt, jwtSecret(), { expiresIn: ACCESS_TOKEN_EXPIRES })
  const loginRefreshToken = jwt.sign({ sub: user.id, type: 'refresh' }, jwtSecret(), { expiresIn: REFRESH_TOKEN_EXPIRES })

  db.insert(auditLog).values({ id: nanoid(), userId: user.id, action: 'auth.oauth.login', details: JSON.stringify({ provider: 'google' }) }).run()

  const dataString = JSON.stringify({
    accessToken: loginAccessToken,
    refreshToken: loginRefreshToken,
    token: loginAccessToken,
    expiresIn: 900,
    user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role }
  })

  return c.html(`<script>window.opener.postMessage({ type: 'oauth-login-success', data: ${dataString} }, '*'); window.close();</script>`)
})

// GET /api/auth/oauth/status
router.get('/oauth/status', authGuard, async (c) => {
  const user = c.get('user')!
  const db = getDb()
  const binds = db.select({ providerId: userOauthAccounts.providerId }).from(userOauthAccounts).where(eq(userOauthAccounts.userId, user.id)).all()
  return c.json({ code: 0, data: { github: binds.some((b: any) => b.providerId === 'github'), google: binds.some((b: any) => b.providerId === 'google') } })
})

// POST /api/auth/oauth/unbind
router.post('/oauth/unbind', authGuard, zValidator('json', z.object({ provider: z.string() })), async (c) => {
  const user = c.get('user')!
  const { provider } = c.req.valid('json')
  const db = getDb()
  db.delete(userOauthAccounts).where(and(eq(userOauthAccounts.userId, user.id), eq(userOauthAccounts.providerId, provider))).run()
  db.insert(auditLog).values({ id: nanoid(), userId: user.id, action: 'auth.oauth.unbind', details: JSON.stringify({ provider }) }).run()
  return c.json({ code: 0, message: `${provider} unbound successfully` })
})

export { router as authRouter }

