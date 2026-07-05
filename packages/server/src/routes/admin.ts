import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { getDb, getRawDb } from '../db/index.js'
import {
  sites, providers, promptTemplates, webhooks, auditLog, pageCache,
  reactionTypes, commentReactions, reactionVotes, comments, apiTokens, users, plugins,
  visitorComments, systemConfig,
} from '@aigcs/core'
import { eq, and, like, sql } from 'drizzle-orm'
import { createHash, randomBytes } from 'node:crypto'
import { HTTPException } from 'hono/http-exception'
import { nanoid } from 'nanoid'
import { requireAuth, authGuard, requireRole } from '../middleware/auth.js'
import { fireWebhook } from '../services/webhook.js'
import { encrypt, decrypt, mask } from '../services/encryption.js'
import { JSDOM } from 'jsdom'

const router = new Hono()
router.use('*', authGuard)

function md5(s: string): string {
  return createHash('md5').update(s).digest('hex')
}

function insertAuditLog(db: any, values: Record<string, any>) {
  db.insert(auditLog).values({ ...values, createdAt: values.createdAt || new Date().toISOString() }).run()
}

function toSnakeCase(s: string): string {
  return s.replace(/([A-Z])/g, '_$1').toLowerCase()
}

// ── Helpers ──

function requireSiteOwnership(c: any, siteId: string) {
  const user = requireAuth(c)
  const db = getDb()
  const site = db.select().from(sites).where(and(eq(sites.id, siteId), eq(sites.userId, user.id))).get()
  if (!site) throw new HTTPException(404, { message: 'Site not found' })
  return site
}

const ALLOWED_CONFIG_KEYS = new Set([
  'smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass',
  'smtp_from_email', 'smtp_from_name',
  'captcha_provider', 'turnstile_site_key', 'turnstile_secret_key',
  'recaptcha_site_key', 'recaptcha_secret_key',
  'geetest_captcha_id', 'geetest_captcha_key',
  'cap_site_key', 'cap_secret_key',
  'cap_verify_url',
  'altcha_site_key', 'altcha_secret_key',
  'hcaptcha_site_key', 'hcaptcha_secret_key',
  'rate_limit_max', 'rate_limit_window',
  'registration_open', 'notify_new_registration',
  'global_system_prompt', 'allowed_origins',
  'provider_defaults',
  'site_title', 'site_favicon',
  'email_notify_comments',
  'email_locale',
])

const SENSITIVE_CONFIG_KEYS = new Set([
  'jwt_secret', 'smtp_pass', 'turnstile_secret_key',
  'recaptcha_secret_key', 'geetest_captcha_key',
  'cap_secret_key', 'altcha_secret_key', 'hcaptcha_secret_key',
  'cap_verify_url',
])

function maskSensitiveConfig(config: Record<string, unknown>) {
  const result = { ...config }
  for (const key of SENSITIVE_CONFIG_KEYS) {
    if (result[key]) result[key] = '******'
  }
  return result
}

// ── Sites ──

router.get('/sites', async (c) => {
  const user = c.get('user')!
  const db = getDb()
  const list = db.select().from(sites).where(eq(sites.userId, user.id)).all()
  return c.json({ code: 0, data: list })
})

router.post('/sites', zValidator('json', z.object({
  domain: z.string().min(1),
  name: z.string().optional(),
})), async (c) => {
  const user = c.get('user')!
  const db = getDb()
  const { domain, name } = c.req.valid('json')

  const existing = db.select().from(sites).where(and(eq(sites.domain, domain), eq(sites.userId, user.id))).get()
  if (existing) throw new HTTPException(409, { message: 'Site already exists' })

  const id = nanoid()
  db.insert(sites).values({ id, userId: user.id, domain, name: name || domain }).run()

  // Auto-add domain to CORS allowed_origins
  try {
    const configRow = db.select().from(systemConfig).where(eq(systemConfig.id, 'global')).get() as any
    if (configRow) {
      const origins: string[] = configRow.allowedOrigins || []
      const httpOrigin = `http://${domain}`
      const httpsOrigin = `https://${domain}`
      let changed = false
      if (!origins.includes(httpOrigin)) { origins.push(httpOrigin); changed = true }
      if (!origins.includes(httpsOrigin)) { origins.push(httpsOrigin); changed = true }
      if (changed) db.update(systemConfig).set({ allowedOrigins: origins }).where(eq(systemConfig.id, 'global')).run()
    }
  } catch {}

  insertAuditLog(db, {
    id: nanoid(),
    userId: user.id,
    action: 'site.create',
    details: { domain, name },
  })

  return c.json({ code: 0, data: { id, domain, name: name || domain } })
})

router.delete('/sites/:id', async (c) => {
  const user = c.get('user')!
  const db = getDb()
  const id = c.req.param('id')

  const site = db.select().from(sites).where(and(eq(sites.id, id), eq(sites.userId, user.id))).get()
  if (!site) throw new HTTPException(404, { message: 'Site not found' })

  db.delete(sites).where(eq(sites.id, id)).run()

  insertAuditLog(db, {
    id: nanoid(),
    userId: user.id,
    action: 'site.delete',
    details: { domain: site.domain },
  })

  return c.json({ code: 0 })
})

router.get('/sites/:siteId', async (c) => {
  const user = c.get('user')!
  const db = getDb()
  const siteId = c.req.param('siteId')

  const site = db.select().from(sites).where(and(eq(sites.id, siteId), eq(sites.userId, user.id))).get()
  if (!site) throw new HTTPException(404, { message: 'Site not found' })

  return c.json({ code: 0, data: site })
})

router.put('/sites/:siteId', zValidator('json', z.object({
  name: z.string().optional(),
  domain: z.string().optional(),
  settings: z.object({
    contentSelector: z.string().optional(),
    autoGenerate: z.boolean().nullable().optional(),
    theme: z.string().optional(),
    lightTheme: z.string().optional(),
    darkTheme: z.string().optional(),
    commentPlugin: z.union([z.string(), z.array(z.string())]).optional(),
    showAiBadge: z.boolean().optional(),
    aiBadgePosition: z.string().optional(),
    showReactions: z.boolean().optional(),
    emailNotifyComments: z.boolean().optional(),
    commentGeneratedTemplate: z.string().optional(),
  }).optional(),
})), async (c) => {
  const user = c.get('user')!
  const db = getDb()
  const siteId = c.req.param('siteId')
  const body = c.req.valid('json')

  const site = db.select().from(sites).where(and(eq(sites.id, siteId), eq(sites.userId, user.id))).get()
  if (!site) throw new HTTPException(404, { message: 'Site not found' })

  const updateData: Record<string, any> = {}
  if (body.name !== undefined) updateData.name = body.name
  if (body.domain !== undefined) updateData.domain = body.domain
  if (body.settings !== undefined) {
    const currentSettings = (site as any).settings || {}
    updateData.settings = { ...currentSettings, ...body.settings }
  }
  db.update(sites).set(updateData as any).where(eq(sites.id, siteId)).run()

  // Auto-add domain to CORS allowed_origins if domain changed
  if (body.domain && body.domain !== (site as any).domain) {
    try {
      const configRow = db.select().from(systemConfig).where(eq(systemConfig.id, 'global')).get() as any
      if (configRow) {
        const origins: string[] = configRow.allowedOrigins || []
        const httpOrigin = `http://${body.domain}`
        const httpsOrigin = `https://${body.domain}`
        let changed = false
        if (!origins.includes(httpOrigin)) { origins.push(httpOrigin); changed = true }
        if (!origins.includes(httpsOrigin)) { origins.push(httpsOrigin); changed = true }
        if (changed) db.update(systemConfig).set({ allowedOrigins: origins }).where(eq(systemConfig.id, 'global')).run()
      }
    } catch {}
  }

  insertAuditLog(db, {
    id: nanoid(), userId: user.id, action: 'site.update',
    details: { siteId, ...body },
  })

  const updated = db.select().from(sites).where(eq(sites.id, siteId)).get()
  return c.json({ code: 0, data: updated })
})

// ── Providers ──

router.get('/sites/:siteId/providers', async (c) => {
  const siteId = c.req.param('siteId')
  requireSiteOwnership(c, siteId)
  const db = getDb()
  const list = db.select().from(providers).where(eq(providers.siteId, siteId)).all()
  const masked = (list as any[]).map(p => ({ ...p, apiKey: mask(p.apiKey) }))
  return c.json({ code: 0, data: masked })
})

router.post('/sites/:siteId/providers', zValidator('json', z.object({
  name: z.string().min(1),
  displayName: z.string().min(1),
  providerType: z.string().default('openai-compatible'),
  apiKey: z.string().default(''),
  apiEndpoint: z.string().default(''),
  model: z.string().default(''),
  enabled: z.boolean().default(true),
  showOnFrontend: z.boolean().default(true),
  sortWeight: z.number().default(0),
  promptTemplateId: z.string().optional(),
})), async (c) => {
  const user = c.get('user')!
  const db = getDb()
  const siteId = c.req.param('siteId')
  const body = c.req.valid('json')

  const site = db.select().from(sites).where(and(eq(sites.id, siteId), eq(sites.userId, user.id))).get()
  if (!site) throw new HTTPException(404, { message: 'Site not found' })

  // Normalize: set empty promptTemplateId to null to avoid FK error
  if (!body.promptTemplateId) (body as any).promptTemplateId = null

  const raw = getRawDb() as any
  const id = nanoid()

  // If apiKey/model not provided, try to get from global provider-defaults
  let apiKey = body.apiKey
  let model = body.model
  if (!apiKey || !model) {
    const row = raw.prepare("SELECT provider_defaults FROM system_config WHERE id = 'global'").get() as { provider_defaults: string | null } | undefined
    if (row?.provider_defaults) {
      try {
        const defaults = JSON.parse(row.provider_defaults)
        const def = defaults[body.name]
        if (def) {
          if (!apiKey && def.apiKey) apiKey = def.apiKey
          if (!model && def.model) model = def.model
        }
      } catch {}
    }
  }

  db.insert(providers).values({
    ...body,
    id,
    siteId,
    apiKey: encrypt(apiKey),
    enabled: Number(body.enabled),
    showOnFrontend: Number(body.showOnFrontend),
  } as any).run()

  insertAuditLog(db, {
    id: nanoid(),
    userId: user.id,
    action: 'provider.create',
    details: { siteId, name: body.name },
  })

  try {
    fireWebhook(siteId, 'provider.created', { site: siteId, providerId: id, name: body.name, providerType: body.providerType })
  } catch (err) {
    console.error('[webhook] Failed to fire provider.created:', err)
  }

  return c.json({ code: 0, data: { id } })
})

router.patch('/sites/:siteId/providers/:providerId', async (c) => {
  const user = c.get('user')!
  const db = getDb()
  const siteId = c.req.param('siteId')
  const providerId = c.req.param('providerId')
  const body = await c.req.json() as Record<string, unknown>

  const site = db.select().from(sites).where(and(eq(sites.id, siteId), eq(sites.userId, user.id))).get()
  if (!site) throw new HTTPException(404, { message: 'Site not found' })

  if (body.apiKey !== undefined && typeof body.apiKey === 'string' && !body.apiKey.startsWith('****')) body.apiKey = encrypt(body.apiKey as string)
  db.update(providers).set(body).where(and(eq(providers.id, providerId), eq(providers.siteId, siteId))).run()

  insertAuditLog(db, {
    id: nanoid(),
    userId: user.id,
    action: 'provider.update',
    details: { siteId, providerId },
  })

  try {
    fireWebhook(siteId, 'provider.updated', { site: siteId, providerId, name: (body.displayName || body.name) as string })
  } catch (err) {
    console.error('[webhook] Failed to fire provider.updated:', err)
  }

  return c.json({ code: 0 })
})

router.post('/sites/:siteId/providers/:providerId/test', async (c) => {
  const db = getDb()
  const siteId = c.req.param('siteId')
  const providerId = c.req.param('providerId')
  requireSiteOwnership(c, siteId)
  const provider = db.select().from(providers).where(and(eq(providers.id, providerId), eq(providers.siteId, siteId))).get()
  if (!provider) throw new HTTPException(404, { message: 'Provider not found' })

  try {
    const { getProvider } = await import('../providers/index.js')
    const impl = getProvider(provider.name)
    if (!impl) throw new Error(`Provider implementation not found: ${provider.name}`)

    const result = await impl.generate({
      pageTitle: 'Test',
      pageContent: 'This is a test article.',
      pageUrl: '/test',
      model: provider.model,
      apiKey: decrypt(provider.apiKey),
      apiEndpoint: provider.apiEndpoint,
    })

    return c.json({ code: 0, data: { content: result.content, model: result.model } })
  } catch (err) {
    return c.json({ code: 1, message: String(err) })
  }
})

// DELETE /admin/sites/:siteId/providers/:providerId — delete a provider
router.delete('/sites/:siteId/providers/:providerId', async (c) => {
  const db = getDb()
  const siteId = c.req.param('siteId')
  const providerId = c.req.param('providerId')
  requireSiteOwnership(c, siteId)
  const provider = db.select().from(providers).where(and(eq(providers.id, providerId), eq(providers.siteId, siteId))).get()
  if (!provider) throw new HTTPException(404, { message: 'Provider not found' })
  db.delete(providers).where(eq(providers.id, providerId)).run()
  const user = c.get('user')!
  insertAuditLog(db, { id: nanoid(), userId: user.id, action: 'provider.delete', details: { siteId, providerId, name: provider.name } })
  return c.json({ code: 0 })
})

// ── Built-in Providers ──

router.get('/builtin-providers', async (c) => {
  const providers = [
    { name: 'gemini', displayName: 'Gemini', type: 'native', endpoint: 'https://generativelanguage.googleapis.com/v1', auth: 'API Key (URL param)', defaultModel: 'gemini-2.5-flash', weight: 10 },
    { name: 'openai', displayName: 'OpenAI', type: 'native', endpoint: 'https://api.openai.com/v1', auth: 'Bearer Token', defaultModel: 'gpt-4o-mini', weight: 20 },
    { name: 'claude', displayName: 'Claude', type: 'native', endpoint: 'https://api.anthropic.com/v1', auth: 'x-api-key Header', defaultModel: 'claude-sonnet-4', weight: 30 },
    { name: 'qrok', displayName: 'Qrok', type: 'native', endpoint: 'https://api.x.ai/v1', auth: 'Bearer Token', defaultModel: 'grok-2-latest', weight: 40 },
    { name: 'deepseek', displayName: 'DeepSeek', type: 'openai-compatible', endpoint: 'https://api.deepseek.com', auth: 'Bearer Token', defaultModel: 'deepseek-chat', weight: 50 },
    { name: 'doubao', displayName: '豆包', type: 'openai-compatible', endpoint: 'https://ark.cn-beijing.volces.com/api/v3', auth: 'Bearer Token', defaultModel: 'doubao-1.5-pro', weight: 60 },
    { name: 'hunyuan', displayName: '混元', type: 'openai-compatible', endpoint: 'https://api.hunyuan.cloud.tencent.com/v1', auth: 'Bearer Token', defaultModel: 'hunyuan-turbo', weight: 70 },
    { name: 'quark', displayName: '夸克', type: 'openai-compatible', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1', auth: 'Bearer Token', defaultModel: 'qwen-turbo', weight: 80 },
    { name: 'qwen', displayName: '千问', type: 'openai-compatible', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1', auth: 'Bearer Token', defaultModel: 'qwen-turbo', weight: 90 },
    { name: 'glm', displayName: '智谱GLM', type: 'openai-compatible', endpoint: 'https://open.bigmodel.cn/api/paas/v4', auth: 'Bearer Token', defaultModel: 'glm-4-plus', weight: 100 },
    { name: 'minimax', displayName: 'MiniMax', type: 'openai-compatible', endpoint: 'https://api.minimax.ai/v1', auth: 'Bearer Token', defaultModel: 'minimax-text-01', weight: 110 },
    { name: 'kimi', displayName: 'Kimi', type: 'openai-compatible', endpoint: 'https://api.moonshot.cn/v1', auth: 'Bearer Token', defaultModel: 'kimi-latest', weight: 120 },
    { name: 'ollama', displayName: 'Ollama', type: 'ollama', endpoint: 'http://localhost:11434/v1', auth: 'None (local)', defaultModel: 'llama3', weight: 999 },
  ]
  return c.json({ code: 0, data: providers })
})

// ── Provider Defaults ──

// GET /admin/provider-defaults — get global provider defaults
router.get('/provider-defaults', async (c) => {
  const raw = getRawDb() as any
  const row = raw.prepare("SELECT provider_defaults FROM system_config WHERE id = 'global'").get() as { provider_defaults: string | null } | undefined
  let defaults: Record<string, { apiKey?: string; apiEndpoint?: string; model?: string }> = {}
  if (row?.provider_defaults) {
    try { defaults = JSON.parse(row.provider_defaults) } catch {}
  }
  return c.json({ code: 0, data: defaults })
})

// PUT /admin/provider-defaults — save global provider defaults
const providerDefaultsSchema = z.object({
  name: z.string().min(1),
  displayName: z.string().optional(),
  type: z.string().optional(),
  apiKey: z.string().optional(),
  apiEndpoint: z.string().optional(),
  model: z.string().optional(),
  avatarSvg: z.string().optional(),
})

router.put('/provider-defaults', requireRole('admin'), zValidator('json', providerDefaultsSchema), async (c) => {
  const raw = getRawDb() as any
  const body = c.req.valid('json')

  const row = raw.prepare("SELECT provider_defaults FROM system_config WHERE id = 'global'").get() as { provider_defaults: string | null } | undefined
  let defaults: Record<string, any> = {}
  if (row?.provider_defaults) {
    try { defaults = JSON.parse(row.provider_defaults) } catch {}
  }

  defaults[body.name] = {
    displayName: body.displayName || defaults[body.name]?.displayName || body.name,
    type: body.type || defaults[body.name]?.type || 'custom',
    apiKey: body.apiKey || defaults[body.name]?.apiKey || '',
    apiEndpoint: body.apiEndpoint || defaults[body.name]?.apiEndpoint || '',
    model: (body.model || defaults[body.name]?.model || '').trim(),
    avatarSvg: body.avatarSvg || defaults[body.name]?.avatarSvg || '',
  }

  raw.prepare("UPDATE system_config SET provider_defaults = ?, updated_at = datetime('now') WHERE id = 'global'").run(JSON.stringify(defaults))
  const user = c.get('user')!
  insertAuditLog(getDb(), { id: nanoid(), userId: user.id, action: 'provider-defaults.update', details: body })
  return c.json({ code: 0 })
})

// DELETE /admin/provider-defaults/:name — remove a custom provider default
router.delete('/provider-defaults/:name', requireRole('admin'), async (c) => {
  const raw = getRawDb() as any
  const name = c.req.param('name')

  const row = raw.prepare("SELECT provider_defaults FROM system_config WHERE id = 'global'").get() as { provider_defaults: string | null } | undefined
  if (!row?.provider_defaults) {
    const user = c.get('user')!
    insertAuditLog(getDb(), { id: nanoid(), userId: user.id, action: 'provider-defaults.delete', details: { name } })
    return c.json({ code: 0 })
  }
  let defaults: Record<string, any> = {}
  try { defaults = JSON.parse(row.provider_defaults) } catch {}

  delete defaults[name]
  raw.prepare("UPDATE system_config SET provider_defaults = ?, updated_at = datetime('now') WHERE id = 'global'").run(JSON.stringify(defaults))
  const user = c.get('user')!
  insertAuditLog(getDb(), { id: nanoid(), userId: user.id, action: 'provider-defaults.delete', details: { name } })
  return c.json({ code: 0 })
})

// ── Prompt Templates ──

router.get('/prompts', async (c) => {
  const db = getDb()
  const list = db.select().from(promptTemplates).all()
  return c.json({ code: 0, data: list })
})

router.post('/prompts', zValidator('json', z.object({
  name: z.string().min(1),
  content: z.string().min(1),
  lang: z.string().default('zh'),
  category: z.string().default('general'),
})), async (c) => {
  const db = getDb()
  const body = c.req.valid('json')
  const id = nanoid()

  db.insert(promptTemplates).values({ ...body, id } as any).run()

  const user = c.get('user')!
  insertAuditLog(db, { id: nanoid(), userId: user.id, action: 'prompt.create', details: body })
  return c.json({ code: 0, data: { id } })
})

router.put('/prompts/:id', zValidator('json', z.object({
  name: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  lang: z.string().optional(),
  category: z.string().optional(),
})), async (c) => {
  const db = getDb()
  const id = c.req.param('id')
  const body = c.req.valid('json')

  const existing = db.select().from(promptTemplates).where(eq(promptTemplates.id, id)).get()
  if (!existing) throw new HTTPException(404, { message: 'Prompt template not found' })

  db.update(promptTemplates).set(body).where(eq(promptTemplates.id, id)).run()

  const user = c.get('user')!
  insertAuditLog(db, { id: nanoid(), userId: user.id, action: 'prompt.update', details: { id, ...body } })
  return c.json({ code: 0 })
})

router.delete('/prompts/:id', async (c) => {
  const db = getDb()
  const id = c.req.param('id')

  const existing = db.select().from(promptTemplates).where(eq(promptTemplates.id, id)).get()
  if (!existing) throw new HTTPException(404, { message: 'Prompt template not found' })

  db.delete(promptTemplates).where(eq(promptTemplates.id, id)).run()

  const user = c.get('user')!
  insertAuditLog(db, { id: nanoid(), userId: user.id, action: 'prompt.delete', details: { id } })
  return c.json({ code: 0 })
})

// POST /api/admin/prompts/import — import from GitHub raw JSON
router.post('/prompts/import', zValidator('json', z.object({
  url: z.string().url(),
})), async (c) => {
  const db = getDb()
  const raw = getRawDb() as import('better-sqlite3').Database
  const { url } = c.req.valid('json')

  let remote: unknown
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    remote = await res.json()
  } catch (e) {
    throw new HTTPException(400, { message: `Failed to fetch URL: ${(e as Error).message}` })
  }

  if (!Array.isArray(remote)) {
    throw new HTTPException(400, { message: 'Import file must be a JSON array' })
  }

  let imported = 0
  let skipped = 0
  const errors: string[] = []

  for (const item of remote) {
    if (!item.name || !item.content || !item.lang) {
      errors.push(`Invalid entry: missing name/content/lang`)
      continue
    }

    const existing = raw.prepare(
      'SELECT id FROM prompt_templates WHERE name = ? AND lang = ?',
    ).get(item.name, item.lang)

    if (existing) {
      skipped++
      continue
    }

    const id = nanoid()
    const category = item.category || 'general'
    raw.prepare(
      'INSERT INTO prompt_templates (id, name, content, lang, category, is_system) VALUES (?, ?, ?, ?, ?, 0)',
    ).run(id, item.name, item.content, item.lang, category)
    imported++
  }

  const user = c.get('user')!
  insertAuditLog(db, { id: nanoid(), userId: user.id, action: 'prompt.import', details: { url, imported, skipped } })
  return c.json({ code: 0, data: { imported, skipped, errors } })
})

// ── Webhooks ──

router.get('/sites/:siteId/webhooks', async (c) => {
  const siteId = c.req.param('siteId')
  requireSiteOwnership(c, siteId)
  const db = getDb()
  const list = db.select().from(webhooks).where(eq(webhooks.siteId, siteId)).all()
  return c.json({ code: 0, data: list })
})

router.post('/sites/:siteId/webhooks', zValidator('json', z.object({
  name: z.string().min(1),
  url: z.string().url(),
  events: z.array(z.string()).min(1),
  secret: z.string().optional(),
})), async (c) => {
  const user = c.get('user')!
  const db = getDb()
  const siteId = c.req.param('siteId')
  requireSiteOwnership(c, siteId)
  const body = c.req.valid('json')

  const id = nanoid()
  db.insert(webhooks).values({ ...body, id, siteId }).run()

  insertAuditLog(db, {
    id: nanoid(),
    userId: user.id,
    action: 'webhook.create',
    details: { siteId, name: body.name },
  })

  return c.json({ code: 0, data: { id } })
})

router.delete('/sites/:siteId/webhooks/:id', async (c) => {
  const siteId = c.req.param('siteId')
  const id = c.req.param('id')
  requireSiteOwnership(c, siteId)
  const db = getDb()
  const existing = db.select().from(webhooks).where(and(eq(webhooks.id, id), eq(webhooks.siteId, siteId))).get()
  if (!existing) throw new HTTPException(404, { message: 'Webhook not found' })
  db.delete(webhooks).where(eq(webhooks.id, id)).run()
  insertAuditLog(db, {
    id: nanoid(),
    userId: c.get('user')!.id,
    action: 'webhook.delete',
    details: { siteId, name: existing.name },
  })
  return c.json({ code: 0 })
})

router.patch('/sites/:siteId/webhooks/:id', zValidator('json', z.object({
  name: z.string().min(1),
  url: z.string().url(),
  events: z.array(z.string()).min(1),
  secret: z.string().optional(),
})), async (c) => {
  const siteId = c.req.param('siteId')
  const id = c.req.param('id')
  requireSiteOwnership(c, siteId)
  const db = getDb()
  const existing = db.select().from(webhooks).where(and(eq(webhooks.id, id), eq(webhooks.siteId, siteId))).get()
  if (!existing) throw new HTTPException(404, { message: 'Webhook not found' })
  const body = c.req.valid('json')
  db.update(webhooks).set(body).where(eq(webhooks.id, id)).run()
  insertAuditLog(db, {
    id: nanoid(),
    userId: c.get('user')!.id,
    action: 'webhook.update',
    details: { siteId, name: body.name },
  })
  return c.json({ code: 0 })
})

// ── Cache ──

router.get('/sites/:siteId/cache', async (c) => {
  requireSiteOwnership(c, c.req.param('siteId'))
  const db = getDb()
  const siteId = c.req.param('siteId')
  const filterPath = c.req.query('path') || ''
  const filterQ = c.req.query('q') || ''
  const filterStatus = c.req.query('status') || ''
  const filterProvider = c.req.query('provider') || ''
  const sortBy = c.req.query('sortBy') || 'updatedAt'
  const sortOrder = c.req.query('sortOrder') || 'desc'

  let conditions = [eq(pageCache.siteId, siteId)]
  if (filterPath) conditions.push(sql`(${pageCache.path} LIKE '%' || ${filterPath} || '%' OR ${pageCache.title} LIKE '%' || ${filterPath} || '%')`)
  if (filterQ) {
    const keywords = filterQ.split(/\s+/).filter(Boolean)
    for (const kw of keywords) {
      conditions.push(sql`(${pageCache.path} LIKE '%' || ${kw} || '%' OR ${pageCache.title} LIKE '%' || ${kw} || '%')`)
    }
  }
  if (filterStatus === 'unfetched') {
    conditions.push(sql`${pageCache.contentSource} IS NULL`)
  } else if (filterStatus === 'missing') {
    // missing is provider-level status, skip page-level status filter
  } else if (filterStatus) {
    conditions.push(eq(pageCache.status, filterStatus))
  }
  if (filterProvider) {
    if (filterStatus === 'pending' || filterStatus === 'unfetched') {
    } else if (filterStatus === 'ready') {
      conditions.push(sql`EXISTS (SELECT 1 FROM comments WHERE site_id = ${pageCache.siteId} AND path = ${pageCache.path} AND provider_name = ${filterProvider})`)
    } else if (filterStatus === 'missing' || filterStatus === 'failed') {
      conditions.push(sql`NOT EXISTS (SELECT 1 FROM comments WHERE site_id = ${pageCache.siteId} AND path = ${pageCache.path} AND provider_name = ${filterProvider})`)
    }
  }

  const baseCondition = conditions.length === 1 ? conditions[0] : and(...conditions as [any, ...any[]])

  const total = db.select({ count: sql<number>`count(*)` }).from(pageCache).where(baseCondition).get()
  const byStatus = db.select({ status: pageCache.status, count: sql<number>`count(*)` })
    .from(pageCache).where(baseCondition)
    .groupBy(pageCache.status).all()

  const page = parseInt(c.req.query('page') || '1')
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 200)
  const offset = (page - 1) * limit

  const sortColumn: Record<string, any> = {
    path: pageCache.path, title: pageCache.title, status: pageCache.status,
    generatedAt: pageCache.generatedAt, updatedAt: pageCache.updatedAt,
  }
  const order = sortColumn[sortBy] || pageCache.updatedAt

  const items = db.select({
    path: pageCache.path, status: pageCache.status, title: pageCache.title,
    createdAt: pageCache.createdAt, updatedAt: pageCache.updatedAt,
    generatedAt: pageCache.generatedAt, etag: pageCache.etag,
  }).from(pageCache).where(baseCondition)
    .orderBy(sortOrder === 'asc' ? sql`${order} ASC` : sql`${order} DESC`)
    .limit(limit).offset(offset).all()

  // Per-provider status for current page
  let providerStatusMap: Record<string, Record<string, string>> = {}
  const paths = items.map((i: any) => i.path)
  if (paths.length > 0) {
    const enabledProviders: { id: string; displayName: string }[] = db.select({
      id: providers.id, displayName: providers.displayName,
    }).from(providers)
      .where(and(eq(providers.siteId, siteId), eq(providers.enabled, 1 as any)))
      .all() as any[]
    if (enabledProviders.length > 0) {
      const raw = getRawDb() as import('better-sqlite3').Database
      const placeholders = paths.map(() => '?').join(',')
      const commentRows = raw.prepare(`
        SELECT path, provider_name FROM comments
        WHERE site_id = ? AND path IN (${placeholders})
      `).all(siteId, ...paths) as Array<{ path: string; provider_name: string }>
      const pathComments = new Map<string, Set<string>>()
      for (const row of commentRows) {
        if (!pathComments.has(row.path)) pathComments.set(row.path, new Set())
        pathComments.get(row.path)!.add(row.provider_name)
      }
      for (const path of paths) {
        const existing = pathComments.get(path) || new Set()
        const status: Record<string, string> = {}
        for (const p of enabledProviders) {
          status[p.displayName] = existing.has(p.displayName) ? 'ready' : 'missing'
        }
        providerStatusMap[path] = status
      }
    }
  }

  return c.json({ code: 0, data: { total: total?.count ?? 0, byStatus, items, page, limit, providerStatusMap } })
})

router.post('/sites/:siteId/cache/clear', async (c) => {
  const user = c.get('user')!
  const db = getDb()
  const siteId = c.req.param('siteId')
  requireSiteOwnership(c, siteId)

  const path = c.req.query('path')
  if (path) {
    db.delete(comments).where(and(eq(comments.siteId, siteId), eq(comments.path, path))).run()
  } else {
    db.delete(comments).where(eq(comments.siteId, siteId)).run()
  }

  insertAuditLog(db, {
    id: nanoid(),
    userId: user.id,
    action: 'cache.clear',
    details: { siteId, path: path || 'all' },
  })

  // Fire webhook
  try {
    fireWebhook(siteId, 'cache.cleared', { site: siteId, path: path || undefined })
  } catch (err) {
    console.error('[webhook] Failed to fire cache.cleared:', err)
  }

  return c.json({ code: 0 })
})

// ── Batch delete cache entries ──

router.post('/sites/:siteId/cache/delete', zValidator('json', z.object({
  paths: z.array(z.string()),
})), async (c) => {
  const user = c.get('user')!
  const db = getDb()
  const siteId = c.req.param('siteId')
  requireSiteOwnership(c, siteId)
  const { paths } = c.req.valid('json')

  const entries: Array<{ path: string; title: string | null }> = []

  for (const path of paths) {
    const cacheHash = createHash('md5').update(`${siteId}:${path}`).digest('hex')
    const existing = db.select({ path: pageCache.path, title: pageCache.title })
      .from(pageCache).where(eq(pageCache.id, cacheHash)).get()
    if (existing) {
      entries.push({ path: existing.path, title: existing.title })
    }
    db.delete(pageCache).where(eq(pageCache.id, cacheHash)).run()
    db.delete(comments).where(and(eq(comments.siteId, siteId), eq(comments.path, path))).run()
  }

  insertAuditLog(db, {
    id: nanoid(),
    userId: user.id,
    action: 'cache.delete',
    details: { siteId, paths },
  })

  return c.json({ code: 0, data: { deleted: paths.length, entries } })
})

// ── Restore deleted cache entries ──

router.post('/sites/:siteId/cache/restore', zValidator('json', z.object({
  entries: z.array(z.object({
    path: z.string(),
    title: z.string().nullable().optional(),
  })),
})), async (c) => {
  const db = getDb()
  const siteId = c.req.param('siteId')
  requireSiteOwnership(c, siteId)
  const { entries } = c.req.valid('json')

  let restored = 0
  const now = new Date().toISOString()
  for (const entry of entries) {
    const cacheHash = createHash('md5').update(`${siteId}:${entry.path}`).digest('hex')
    db.insert(pageCache).values({
      id: cacheHash, siteId, path: entry.path, status: 'pending',
      title: entry.title || null,
      createdAt: now, updatedAt: now,
    }).onConflictDoNothing().run()
    restored++
  }

  return c.json({ code: 0, data: { restored } })
})

// ── Delete all cache entries (with undo data) ──

router.post('/sites/:siteId/cache/delete-all', async (c) => {
  const user = c.get('user')!
  const db = getDb()
  const siteId = c.req.param('siteId')
  requireSiteOwnership(c, siteId)

  const entries = db.select({ path: pageCache.path, title: pageCache.title })
    .from(pageCache).where(eq(pageCache.siteId, siteId)).all()

  db.delete(pageCache).where(eq(pageCache.siteId, siteId)).run()

  insertAuditLog(db, {
    id: nanoid(),
    userId: user.id,
    action: 'cache.delete_all',
    details: { siteId, count: entries.length },
  })

  return c.json({ code: 0, data: { deleted: entries.length, entries } })
})

// ── RSS Settings ──

router.get('/sites/:siteId/rss', async (c) => {
  const siteId = c.req.param('siteId')
  requireSiteOwnership(c, siteId)
  const db = getDb()
  const site = db.select({ settings: sites.settings }).from(sites).where(eq(sites.id, siteId)).get() as any
  if (!site) throw new HTTPException(404, { message: 'Site not found' })
  const settings = site.settings || {}
  return c.json({ code: 0, data: settings.rss || {} })
})

router.put('/sites/:siteId/rss', zValidator('json', z.object({
  url: z.string().optional(),
  auto_generate: z.boolean().optional(),
  concurrency: z.number().optional(),
  interval: z.number().optional(),
  notify_email: z.boolean().optional(),
  cron_schedule: z.string().optional(),
  cron_expr: z.string().optional(),
})), async (c) => {
  const siteId = c.req.param('siteId')
  requireSiteOwnership(c, siteId)
  const db = getDb()
  const body = c.req.valid('json')
  const site = db.select({ settings: sites.settings }).from(sites).where(eq(sites.id, siteId)).get() as any
  if (!site) throw new HTTPException(404, { message: 'Site not found' })
  const existing = site.settings || {}
  const rss = { ...(existing.rss || {}), ...body }
  if (!body.url) delete rss.url
  if (!body.cron_expr) delete rss.cron_expr
  db.update(sites).set({ settings: { ...existing, rss } }).where(eq(sites.id, siteId)).run()
  return c.json({ code: 0 })
})

// ── Ping Webhook Settings ──

router.get('/sites/:siteId/ping', async (c) => {
  const site = requireSiteOwnership(c, c.req.param('siteId'))
  const settings = (site.settings || {}) as any
  return c.json({ code: 0, data: settings.ping || { rss: null, cache: null } })
})

const pingItemSchema = z.union([
  z.boolean(),
  z.object({ enabled: z.boolean(), token: z.string().optional() }),
])

router.put('/sites/:siteId/ping', zValidator('json', z.object({
  rss: pingItemSchema.optional(),
  cache: pingItemSchema.optional(),
})), async (c) => {
  const siteId = c.req.param('siteId')
  requireSiteOwnership(c, siteId)
  const db = getDb()
  const body = c.req.valid('json')
  const row = db.select({ settings: sites.settings }).from(sites).where(eq(sites.id, siteId)).get() as any
  const existing = (row.settings || {}) as any
  const currentPing = existing.ping || {}
  const ping: any = { ...currentPing }

  function resolvePing(val: any): any {
    if (typeof val === 'object') {
      return { enabled: val.enabled, token: val.token || randomBytes(16).toString('hex') }
    }
    if (val === true) {
      return { enabled: true, token: randomBytes(16).toString('hex') }
    }
    return null
  }

  const rss = resolvePing(body.rss)
  if (rss) ping.rss = rss
  else delete ping.rss

  const cache = resolvePing(body.cache)
  if (cache) ping.cache = cache
  else delete ping.cache

  db.update(sites).set({ settings: { ...existing, ping } }).where(eq(sites.id, siteId)).run()
  return c.json({ code: 0, data: ping })
})

// ── RSS Import ──

router.post('/sites/:siteId/import-rss', zValidator('json', z.object({
  url: z.string().url(),
})), async (c) => {
  const user = c.get('user')!
  const db = getDb()
  const siteId = c.req.param('siteId')
  const { url } = c.req.valid('json')

  const site = requireSiteOwnership(c, siteId)

  const response = await fetch(url)
  if (!response.ok) throw new HTTPException(400, { message: `Failed to fetch RSS/Sitemap: ${response.status}` })

  const xml = await response.text()
  const dom = new JSDOM(xml, { contentType: 'text/xml' })
  const doc = dom.window.document

  const entries: Array<{ title: string; link: string; content: string }> = []

  // Try RSS items
  const items = doc.querySelectorAll('item')
  items.forEach((item: Element) => {
    let link = item.querySelector('link')?.textContent || ''
    link = link.trim()
    const title = item.querySelector('title')?.textContent || ''
    const desc = item.querySelector('description')?.textContent || ''
    const encoded = item.querySelector('encoded')?.textContent || item.querySelector('content\\:encoded')?.textContent || ''
    const content = encoded || desc
    if (link) entries.push({ title, link, content })
  })

  // Try Atom entries
  const atomEntries = doc.querySelectorAll('entry')
  atomEntries.forEach((entry: Element) => {
    const title = entry.querySelector('title')?.textContent || ''
    let link = ''
    const linkEl = entry.querySelector('link')
    if (linkEl) {
      link = linkEl.getAttribute('href') || linkEl.textContent || ''
    }
    link = link.trim()
    const summary = entry.querySelector('summary')?.textContent || ''
    const contentEl = entry.querySelector('content')?.textContent || ''
    const content = contentEl || summary
    if (link) entries.push({ title, link, content })
  })

  // Try sitemap urls (if no RSS/Atom entries found)
  if (entries.length === 0) {
    const urlElements = doc.querySelectorAll('url')
    urlElements.forEach((urlEl: Element) => {
      const loc = urlEl.querySelector('loc')?.textContent || ''
      const title = urlEl.querySelector('news\\:title')?.textContent || urlEl.querySelector('image\\:title')?.textContent || ''
      if (loc) entries.push({ title, link: loc.trim(), content: '' })
    })
  }

  if (entries.length === 0) {
    return c.json({ code: 0, data: { total: 0, imported: 0, entries: [] } })
  }

  const siteDomain = (site as any).domain
  let imported = 0
  const results: Array<{ url: string; title: string; path: string; status: string }> = []

  for (const entry of entries) {
    let path = entry.link
    try {
      const parsed = new URL(entry.link)
      path = parsed.pathname + parsed.search
    } catch {
      // entry.link is already a path
    }

    const cacheHash = createHash('md5').update(`${siteId}:${path}`).digest('hex')
    const existing = db.select().from(pageCache).where(eq(pageCache.id, cacheHash)).get()
    if (!existing) {
      const now = new Date().toISOString()
      db.insert(pageCache).values({ id: cacheHash, siteId, path, status: 'pending', title: entry.title, contentSource: entry.content || null, createdAt: now, updatedAt: now }).run()
      imported++
      results.push({ url: entry.link, title: entry.title, path, status: 'imported' })
    } else {
      results.push({ url: entry.link, title: entry.title, path, status: 'exists' })
    }
  }

  insertAuditLog(db, {
    id: nanoid(), userId: user.id, action: 'rss.import',
    details: { siteId, url, entries: entries.length, imported },
  })

  try {
    fireWebhook(siteId, 'rss.import_completed', { site: siteId, url, total: entries.length, imported })
  } catch (err) {
    console.error('[webhook] Failed to fire rss.import_completed:', err)
  }

  return c.json({ code: 0, data: { total: entries.length, imported, entries: results } })
})

// ── Cache Warm ──

router.post('/sites/:siteId/cache/warm', zValidator('json', z.object({
  providerIds: z.array(z.string()).optional(),
  concurrency: z.number().int().min(1).max(20).optional(),
  interval: z.number().int().min(0).optional(),
  selector: z.string().optional(),
}).optional()), async (c) => {
  const db = getDb()
  const siteId = c.req.param('siteId')
  requireSiteOwnership(c, siteId)
  const body = c.req.valid('json')

  const opts = body || {}
  const raw = getRawDb() as import('better-sqlite3').Database

  let entries: any[]
  if (opts.providerIds && opts.providerIds.length > 0) {
    const providerNames = db.select({ displayName: providers.displayName })
      .from(providers)
      .where(and(
        eq(providers.siteId, siteId),
        sql`${providers.id} IN (${opts.providerIds.join(',')})`
      )).all() as any[]
    const names = providerNames.map((p: any) => p.displayName)

    if (names.length > 0) {
      const placeholders = names.map(() => '?').join(',')
      entries = raw.prepare(`
        SELECT * FROM page_cache
        WHERE site_id = ?
        AND (
          status = 'pending'
          OR (
            status = 'ready'
            AND NOT EXISTS (
              SELECT 1 FROM comments
              WHERE site_id = page_cache.site_id AND path = page_cache.path AND provider_name IN (${placeholders})
            )
          )
        )
      `).all(siteId, ...names) as any[]
    } else {
      entries = db.select().from(pageCache)
        .where(and(eq(pageCache.siteId, siteId), eq(pageCache.status, 'pending')))
        .all()
    }
  } else {
    entries = db.select().from(pageCache)
      .where(and(eq(pageCache.siteId, siteId), eq(pageCache.status, 'pending')))
      .all()
  }

  if (entries.length === 0) {
    return c.json({ code: 0, data: { total: 0, message: 'No entries need generation' } })
  }

  const site = db.select().from(sites).where(eq(sites.id, siteId)).get() as any

  warmCacheAsync(siteId, site.domain, entries as any[], {
    providerIds: opts.providerIds,
    concurrency: opts.concurrency || 1,
    interval: opts.interval ?? 10,
    selector: opts.selector,
    }).catch((err: unknown) => {
    console.error('[warm] background error:', err)
  })

  const user = c.get('user')!
  insertAuditLog(db, { id: nanoid(), userId: user.id, action: 'cache.warm', details: { siteId, path: undefined, selector: opts.selector } })
  return c.json({ code: 0, data: { total: entries.length, message: `Warming ${entries.length} entries` } })
})

async function warmCacheAsync(siteId: string, domain: string, entries: any[], options?: { providerIds?: string[]; concurrency?: number; interval?: number; selector?: string }) {
  const { generateComments } = await import('../routes/widget.js')

  const concurrency = options?.concurrency || 1
  const interval = options?.interval ?? 10
  let successCount = 0
  let failCount = 0

  for (let i = 0; i < entries.length; i += concurrency) {
    const batch = entries.slice(i, i + concurrency)
    const results = await Promise.allSettled(
      batch.map((entry) =>
        generateComments(siteId, entry.path, domain, undefined, undefined, { providerIds: options?.providerIds, userSelector: options?.selector }),
      ),
    )
    for (const r of results) {
      if (r.status === 'rejected') {
        failCount++
        console.error(`[warm] Failed:`, r.reason)
      } else {
        successCount++
      }
    }
    if (i + concurrency < entries.length && interval > 0) {
      await new Promise((resolve) => setTimeout(resolve, interval * 1000))
    }
  }

  try {
    fireWebhook(siteId, 'cache.warm_completed', { site: siteId, total: entries.length, success: successCount, fail: failCount })
  } catch (err) {
    console.error('[webhook] Failed to fire cache.warm_completed:', err)
  }
}

// ── Fetch single page content (no comment generation) ──

router.post('/sites/:siteId/cache/fetch', zValidator('json', z.object({
  paths: z.array(z.string()),
})), async (c) => {
  const siteId = c.req.param('siteId')
  requireSiteOwnership(c, siteId)
  const db = getDb()
  const { paths } = c.req.valid('json')
  const site = db.select({ domain: sites.domain }).from(sites).where(eq(sites.id, siteId)).get() as any
  if (!site) throw new HTTPException(404, { message: 'Site not found' })

  const { extractPageContent, extractPageTitle } = await import('../lib/extract-content.js')
  let fetched = 0

  for (const path of paths) {
    try {
      const pageUrl = `https://${site.domain}${path}`
      const resp = await fetch(pageUrl, { signal: AbortSignal.timeout(10000) })
      if (!resp.ok) continue
      const html = await resp.text()
      const title = extractPageTitle(html) || path
      const content = extractPageContent(html) || ''
      const cacheHash = createHash('md5').update(`${siteId}:${path}`).digest('hex')
      db.update(pageCache).set({
        title, contentSource: content,
        status: 'ready',
        updatedAt: new Date().toISOString(),
      }).where(eq(pageCache.id, cacheHash)).run()
      fetched++
    } catch {
      // skip failed
    }
  }

  return c.json({ code: 0, data: { fetched } })
})

// ── Generate comments for selected entries ──

router.post('/sites/:siteId/cache/generate', zValidator('json', z.object({
  paths: z.array(z.string()),
  providerIds: z.array(z.string()).optional(),
})), async (c) => {
  const siteId = c.req.param('siteId')
  requireSiteOwnership(c, siteId)
  const db = getDb()
  const { paths, providerIds } = c.req.valid('json')
  const site = db.select({ domain: sites.domain }).from(sites).where(eq(sites.id, siteId)).get() as any
  if (!site) throw new HTTPException(404, { message: 'Site not found' })

  const { generateComments } = await import('../routes/widget.js')
  let generated = 0

  for (const path of paths) {
    try {
      const result = await generateComments(siteId, path, site.domain, undefined, undefined, { providerIds })
      generated += result.success
    } catch {
      // skip failed
    }
  }

  return c.json({ code: 0, data: { generated } })
})

// ── Get comments for a specific path ──

router.get('/sites/:siteId/paths/:path/comments', async (c) => {
  const db = getDb()
  const raw = getRawDb() as import('better-sqlite3').Database
  const siteId = c.req.param('siteId')
  const path = c.req.param('path')
  requireSiteOwnership(c, siteId)

  const aiComments = db.select().from(comments)
    .where(and(eq(comments.siteId, siteId), eq(comments.path, path)))
    .orderBy(comments.generatedAt).all()

  const visitorRows = raw.prepare(
    'SELECT * FROM visitor_comments WHERE site_id = ? AND path = ? ORDER BY created_at DESC'
  ).all(siteId, path) as any[]

  const visitorComments = visitorRows.map((r: any) => ({
    id: r.id,
    providerName: 'visitor',
    model: '',
    authorName: r.author_name,
    authorAvatar: '',
    content: r.content,
    generatedAt: r.created_at,
    authorEmail: r.author_email || '',
    authorUrl: r.author_url || '',
    avatarHash: r.author_email ? md5(r.author_email.toLowerCase().trim()) : '',
    showModel: false,
    parentId: r.parent_id || '',
    editedAt: r.edited_at || '',
  }))

  const items = [...aiComments, ...visitorComments].sort(
    (a: any, b: any) => new Date(a.generatedAt || a.created_at).getTime() - new Date(b.generatedAt || b.created_at).getTime()
  )

  return c.json({ code: 0, data: items })
})

// ── Delete a visitor comment (admin) ──

router.delete('/sites/:siteId/comments/visitor/:id', async (c) => {
  const db = getDb()
  const raw = getRawDb() as import('better-sqlite3').Database
  const siteId = c.req.param('siteId')
  const id = c.req.param('id')
  requireSiteOwnership(c, siteId)

  const comment = raw.prepare('SELECT * FROM visitor_comments WHERE id = ? AND site_id = ?').get(id, siteId) as any
  if (!comment) throw new HTTPException(404, { message: 'Comment not found' })

  raw.prepare('DELETE FROM visitor_comments WHERE id = ?').run(id)
  return c.json({ code: 0, message: 'Comment deleted' })
})

router.delete('/sites/:siteId/comments/fedi/:id', async (c) => {
  const raw = getRawDb() as import('better-sqlite3').Database
  const siteId = c.req.param('siteId')
  const id = c.req.param('id')
  requireSiteOwnership(c, siteId)
  const cacheId = id.replace(/^fedi-/, 'mastodon-cache-')
  const comment = raw.prepare('SELECT c.id, c.mastodon_comment_id FROM mastodon_cached_comments c JOIN mastodon_bindings b ON c.binding_id = b.id WHERE c.id = ? AND b.site_id = ?').get(cacheId, siteId) as any
  if (!comment) throw new HTTPException(404, { message: 'Comment not found' })
  raw.prepare('UPDATE mastodon_cached_comments SET hidden = 1 WHERE id = ?').run(cacheId)
  const remoteId = comment.mastodon_comment_id
  if (remoteId) {
    raw.prepare('UPDATE mastodon_cached_comments SET hidden = 1 WHERE binding_id = (SELECT binding_id FROM mastodon_cached_comments WHERE id = ?) AND parent_id = ?').run(cacheId, remoteId)
  }
  return c.json({ code: 0, message: 'Comment hidden' })
})

router.post('/sites/:siteId/comments/fedi/:id/unhide', async (c) => {
  const raw = getRawDb() as import('better-sqlite3').Database
  const siteId = c.req.param('siteId')
  const id = c.req.param('id')
  requireSiteOwnership(c, siteId)
  const cacheId = id.replace(/^fedi-/, 'mastodon-cache-')
  raw.prepare('UPDATE mastodon_cached_comments SET hidden = 0 WHERE id = ?').run(cacheId)
  return c.json({ code: 0, message: 'Comment unhidden' })
})

router.get('/cache/search', async (c) => {
  const user = c.get('user')!
  const db = getDb()
  const q = c.req.query('q') || ''
  const page = parseInt(c.req.query('page') || '1')
  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 200)
  const offset = (page - 1) * limit

  const siteIds = db.select({ id: sites.id }).from(sites).where(eq(sites.userId, user.id)).all().map((s: { id: string }) => s.id)

  if (siteIds.length === 0) {
    return c.json({ code: 0, data: { items: [], total: 0, page, limit } })
  }

  const siteIdConditions = siteIds.map((id: string) => `site_id = '${id.replace(/'/g, "''")}'`).join(' OR ')
  const raw = getRawDb() as any

  let rows: any[]
  let total: number
  if (q) {
    const escapedQ = q.replace(/'/g, "''")
    total = (raw.prepare(`SELECT COUNT(*) as count FROM page_cache pc JOIN sites s ON pc.site_id = s.id WHERE (${siteIdConditions}) AND (pc.path LIKE '%' || ? || '%' OR pc.title LIKE '%' || ? || '%')`).get(escapedQ, escapedQ) as any)?.count ?? 0
    rows = raw.prepare(`SELECT pc.*, s.domain FROM page_cache pc JOIN sites s ON pc.site_id = s.id WHERE (${siteIdConditions}) AND (pc.path LIKE '%' || ? || '%' OR pc.title LIKE '%' || ? || '%') ORDER BY pc.updated_at DESC LIMIT ? OFFSET ?`).all(escapedQ, escapedQ, limit, offset)
  } else {
    total = (raw.prepare(`SELECT COUNT(*) as count FROM page_cache pc JOIN sites s ON pc.site_id = s.id WHERE ${siteIdConditions}`).get() as any)?.count ?? 0
    rows = raw.prepare(`SELECT pc.*, s.domain FROM page_cache pc JOIN sites s ON pc.site_id = s.id WHERE ${siteIdConditions} ORDER BY pc.updated_at DESC LIMIT ? OFFSET ?`).all(limit, offset)
  }

  return c.json({ code: 0, data: {
    items: rows.map((r: any) => ({
      id: r.id,
      siteId: r.site_id,
      domain: r.domain,
      path: r.path,
      title: r.title,
      status: r.status,
      etag: r.etag,
      generatedAt: r.generated_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
    total, page, limit,
  } })
})

// ── API Tokens ──

router.get('/api-tokens', async (c) => {
  const user = requireAuth(c)
  const db = getDb()
  const tokens = db
    .select({
      id: apiTokens.id,
      name: apiTokens.name,
      tokenPrefix: apiTokens.tokenPrefix,
      scope: apiTokens.scope,
      lastUsedAt: apiTokens.lastUsedAt,
      createdAt: apiTokens.createdAt,
    })
    .from(apiTokens)
    .where(eq(apiTokens.userId, user.id))
    .all()
  return c.json({ code: 0, data: tokens })
})

router.post('/api-tokens', zValidator('json', z.object({
  name: z.string().min(1),
  scope: z.enum(['read', 'read_write', 'admin']),
})), async (c) => {
  const user = c.get('user')!
  const db = getDb()
  const { name, scope } = c.req.valid('json')

  const rawToken = randomBytes(32).toString('hex')
  const token = `aigcs_${rawToken}`
  const tokenHash = createHash('sha256').update(token).digest('hex')
  const tokenPrefix = token.slice(0, 8)
  const id = nanoid()

  db.insert(apiTokens).values({ id, userId: user.id, name, tokenHash, tokenPrefix, scope } as any).run()

  insertAuditLog(db, { id: nanoid(), userId: user.id, action: 'api-token.create', details: { name, scope } })
  return c.json({ code: 0, data: { id, name, token } })
})

router.delete('/api-tokens/:id', async (c) => {
  const user = c.get('user')!
  const db = getDb()
  const id = c.req.param('id')

  const token = db.select().from(apiTokens).where(and(eq(apiTokens.id, id), eq(apiTokens.userId, user.id))).get()
  if (!token) throw new HTTPException(404, { message: 'API token not found' })

  db.delete(apiTokens).where(eq(apiTokens.id, id)).run()

  insertAuditLog(db, { id: nanoid(), userId: user.id, action: 'api-token.delete', details: { id } })
  return c.json({ code: 0 })
})

// ── Manual Comment Generation ──

const generateCommentSchema = z.object({
  url: z.string().min(1),
  selector: z.string().optional(),
})

router.post('/sites/:siteId/comments/generate', zValidator('json', generateCommentSchema), async (c) => {
  const db = getDb()
  const siteId = c.req.param('siteId')
  const { url, selector } = c.req.valid('json')

  const site = requireSiteOwnership(c, siteId)

  // Parse path from URL
  const parsedUrl = new URL(url)
  const path = parsedUrl.pathname || '/'

  // Check/init page_cache
  const cacheHash = createHash('md5').update(`${siteId}:${path}`).digest('hex')
  const existing = db.select().from(pageCache).where(eq(pageCache.id, cacheHash)).get()
  if (!existing) {
    db.insert(pageCache).values({ id: cacheHash, siteId, path, status: 'pending' }).run()
  }

  // Trigger generation — generateComments fetches content using site settings + optional user selector
  const { generateComments } = await import('../routes/widget.js')
  try {
    const result = await Promise.race([
      generateComments(siteId, path, (site as any).domain, undefined, undefined, { userSelector: selector }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Generation timed out after 60s')), 60000)),
    ]) as { success: number; total: number; errors: string[] }

    if (result.success > 0) {
      return c.json({ code: 0, message: `Generated ${result.success}/${result.total} comments`, data: { path, ...result } })
    }
    const errMsg = result.errors[0] || 'All providers failed'
    return c.json({ code: 1, message: `Generation failed: ${errMsg}` })
  } catch (err) {
    return c.json({ code: 1, message: `Generation failed: ${err}` })
  }
})

// ── System Config ──

router.get('/system/config', requireRole('admin'), async (c) => {
  const raw = getRawDb()
  const config = raw.prepare?.("SELECT * FROM system_config WHERE id = 'global'").get()
  return c.json({ code: 0, data: maskSensitiveConfig(config as Record<string, unknown> || {}) })
})

router.put('/system/config', requireRole('admin'), async (c) => {
  const raw = getRawDb()
  const body = await c.req.json() as Record<string, unknown>
  delete body.id

  const keys = Object.keys(body).filter(k => ALLOWED_CONFIG_KEYS.has(toSnakeCase(k)))
  if (keys.length === 0) {
    return c.json({ code: 1, message: 'No valid fields to update' })
  }

  const setClauses = keys.map((k) => `${toSnakeCase(k)} = ?`)
  const values = keys.map((k) => {
    let val = body[k]
    if (val === '******' || (val === null && SENSITIVE_CONFIG_KEYS.has(k))) return undefined
    if (typeof val === 'boolean') val = val ? 1 : 0
    if (k === 'smtp_pass' && val) val = encrypt(val as string)
    return val
  })
  // Filter out undefined values (masked/unchanged sensitive fields)
  const validIndices = values.map((v, i) => v !== undefined ? i : -1).filter(i => i >= 0)
  const validKeys = validIndices.map(i => keys[i])
  const validValues = validIndices.map(i => values[i])
  if (validKeys.length === 0) return c.json({ code: 0, message: 'No changes' })

  raw.prepare?.(
    `UPDATE system_config SET ${validKeys.map((k) => `${toSnakeCase(k)} = ?`).join(', ')} WHERE id = ?`,
  ).run(...validValues, 'global')

  const user = c.get('user')!
  insertAuditLog(getDb(), { id: nanoid(), userId: user.id, action: 'system.config.update', details: {} })
  return c.json({ code: 0 })
})

// ── Comments ──

router.get('/sites/:siteId/comments', async (c) => {
  const siteId = c.req.param('siteId')
  requireSiteOwnership(c, siteId)
  const db = getDb()
  const page = parseInt(c.req.query('page') || '1')
  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 200)
  const offset = (page - 1) * limit

  const total = db.select({ count: sql<number>`count(*)` }).from(comments).where(eq(comments.siteId, siteId)).get()
  const items = db.select().from(comments).where(eq(comments.siteId, siteId))
    .orderBy(comments.generatedAt).limit(limit).offset(offset).all()

  return c.json({ code: 0, data: { items, total: total?.count ?? 0, page, limit } })
})

// ── Search comments (AI + visitor) across all paths ──

router.get('/sites/:siteId/comments/search', async (c) => {
  const db = getDb()
  const raw = getRawDb() as import('better-sqlite3').Database
  const siteId = c.req.param('siteId')
  requireSiteOwnership(c, siteId)

  const q = (c.req.query('q') || '').trim()
  const type = c.req.query('type') || 'all'
  const sort = c.req.query('sort') || 'time'
  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10))
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') || '20', 10)))
  const offset = (page - 1) * limit

  function likeClause(cols: string[], q: string): { sql: string; params: string[] } {
    const keywords = q.split(/\s+/).filter(Boolean)
    if (keywords.length === 0) return { sql: '', params: [] }
    const esc = (s: string) => `%${s.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`
    const parts = keywords.map(kw => {
      const colParts = cols.map(c => `${c} LIKE ? ESCAPE '\\'`)
      return `(${colParts.join(' OR ')})`
    })
    const params = keywords.flatMap(kw => cols.map(() => esc(kw)))
    return { sql: parts.join(' AND '), params }
  }

  const aiResults: any[] = []
  const visitorResults: any[] = []

  const actualLimit = type === 'all' ? limit * 2 : limit

  if (type === 'all' || type === 'ai') {
    let sql = "SELECT c.id, c.path, c.author_name as authorName, c.content, c.model, c.provider_name as providerName, c.generated_at as createdAt FROM comments c LEFT JOIN page_cache pc ON c.site_id = pc.site_id AND c.path = pc.path WHERE c.site_id = ?"
    const params: any[] = [siteId]
    if (q) {
      const lc = likeClause(['c.content', 'c.author_name', 'c.path', 'pc.title'], q)
      if (lc.sql) { sql += ' AND ' + lc.sql; params.push(...lc.params) }
    }
    aiResults.push(...raw.prepare(sql + " ORDER BY c.generated_at DESC LIMIT ? OFFSET ?").all(...params, actualLimit, offset) as any[])
  }

  if (type === 'all' || type === 'visitor') {
    let sql = "SELECT v.id, v.path, v.author_name as authorName, v.author_email as authorEmail, v.content, v.created_at as createdAt, v.parent_id as parentId FROM visitor_comments v LEFT JOIN page_cache pc ON v.site_id = pc.site_id AND v.path = pc.path WHERE v.site_id = ?"
    const params: any[] = [siteId]
    if (q) {
      const lc = likeClause(['v.content', 'v.author_name', 'v.path', 'pc.title'], q)
      if (lc.sql) { sql += ' AND ' + lc.sql; params.push(...lc.params) }
    }
    visitorResults.push(...raw.prepare(sql + " ORDER BY v.created_at DESC LIMIT ? OFFSET ?").all(...params, actualLimit, offset) as any[])
  }

  const items: any[] = []
  for (const ai of aiResults) {
    items.push({ id: ai.id, path: ai.path, type: 'ai', authorName: ai.authorName, content: ai.content, model: ai.model, providerName: ai.providerName, createdAt: ai.createdAt })
  }
  for (const vc of visitorResults) {
    items.push({ id: vc.id, path: vc.path, type: 'visitor', authorName: vc.authorName, content: vc.content, authorEmail: vc.authorEmail || '', parentId: vc.parentId || '', createdAt: vc.createdAt, avatarHash: vc.authorEmail ? md5(vc.authorEmail.toLowerCase().trim()) : '' })
  }

  // Read fedi config for avatar proxy
  const siteRow = raw.prepare("SELECT settings FROM sites WHERE id = ?").get(siteId) as any
  const siteSettings = siteRow?.settings ? (typeof siteRow.settings === 'string' ? JSON.parse(siteRow.settings) : siteRow.settings) : {}
  const fediCfg = siteSettings.fediConfig || {}
  const avatarMode = fediCfg.avatarMode || 'aigcs'
  const mravatarUrl = fediCfg.mravatarUrl || ''
  const mravatarDefault = fediCfg.mravatarDefault || ''
  const mravatarProxied = fediCfg.mravatarProxied !== false
  const mravatarNoCache = fediCfg.mravatarNoCache !== false
  const proxyAvatar = (url: string, acct: string) => {
    if (!url) return url
    if (avatarMode === 'off') return url
    if (avatarMode === 'mravatar' && mravatarUrl && acct) {
      let base = mravatarUrl.trim()
      if (!base.startsWith('http://') && !base.startsWith('https://')) base = 'https://' + base
      base = base.replace(/\/+$/, '')
      if (!base.endsWith('/avatar')) base += '/avatar'
      let result = `${base}/${acct}`
      const params: string[] = []
      if (mravatarProxied) params.push('proxied=true')
      if (mravatarNoCache) params.push('no-cache=true')
      if (mravatarDefault) params.push(`default=${encodeURIComponent(mravatarDefault)}`)
      if (params.length) result += '?' + params.join('&')
      return result
    }
    const reqUrl = new URL(c.req.url)
    const proto = c.req.header('x-forwarded-proto') ? `${c.req.header('x-forwarded-proto')}:` : reqUrl.protocol
    return `${proto}//${reqUrl.host}/api/avatar-proxy?url=${encodeURIComponent(url)}`
  }

  // Fedi comments (via mastodon bindings)
  const includeHidden = c.req.query('includeHidden') === 'true'
  if (type === 'all' || type === 'fedi') {
    let sql = "SELECT c.id AS cid, c.author_name as authorName, c.author_fedi_id as authorFediId, c.author_avatar as avatar, c.content, c.created_at as createdAt, c.hidden, b.slug as path FROM mastodon_cached_comments c JOIN mastodon_bindings b ON c.binding_id = b.id LEFT JOIN page_cache pc ON b.site_id = pc.site_id AND b.slug = pc.path WHERE b.site_id = ?"
    const params: any[] = [siteId]
    if (!includeHidden) sql += " AND c.hidden = 0"
    if (q) {
      const lc = likeClause(['c.content', 'c.author_name', 'b.slug'], q)
      if (lc.sql) { sql += ' AND ' + lc.sql; params.push(...lc.params) }
    }
    const fediRows = raw.prepare(sql + " ORDER BY c.created_at DESC LIMIT ? OFFSET ?").all(...params, actualLimit, offset) as any[]
    for (const f of fediRows) {
      const acct = f.authorFediId || ''
      let emailHash = ''
      if (acct.includes('@')) {
        emailHash = md5(acct.toLowerCase().trim())
      }
      items.push({ id: `fedi-${f.cid}`, path: f.path, type: 'visitor', authorName: f.authorName, content: f.content, createdAt: f.createdAt, avatarHash: emailHash, source: 'fedi', avatar: proxyAvatar(f.avatar || '', f.authorFediId || ''), hidden: !!f.hidden })
    }
  }

  if (sort === 'path') {
    items.sort((a, b) => a.path.localeCompare(b.path) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  } else {
    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }

  const sliced = type === 'all' ? items.slice(0, limit) : items
  if (type === 'all') { items.length = 0; items.push(...sliced) }

  // Count total for pagination
  let total = 0
  if (type === 'all' || type === 'ai') {
    let sql = "SELECT COUNT(*) as cnt FROM comments WHERE site_id = ?"
    const params: any[] = [siteId]
    if (q) { const lc = likeClause(['content', 'author_name', 'path'], q); if (lc.sql) { sql += ' AND ' + lc.sql; params.push(...lc.params) } }
    const row = raw.prepare(sql).get(...params) as { cnt: number }
    total += row.cnt
  }
  if (type === 'all' || type === 'visitor') {
    let sql = "SELECT COUNT(*) as cnt FROM visitor_comments WHERE site_id = ?"
    const params: any[] = [siteId]
    if (q) { const lc = likeClause(['content', 'author_name', 'path'], q); if (lc.sql) { sql += ' AND ' + lc.sql; params.push(...lc.params) } }
    const row = raw.prepare(sql).get(...params) as { cnt: number }
    total += row.cnt
  }
  if (type === 'all' || type === 'fedi') {
    let sql = "SELECT COUNT(*) as cnt FROM mastodon_cached_comments c JOIN mastodon_bindings b ON c.binding_id = b.id WHERE b.site_id = ?"
    const params: any[] = [siteId]
    if (!includeHidden) sql += " AND c.hidden = 0"
    if (q) { const lc = likeClause(['c.content', 'c.author_name', 'b.slug'], q); if (lc.sql) { sql += ' AND ' + lc.sql; params.push(...lc.params) } }
    const row = raw.prepare(sql).get(...params) as { cnt: number }
    total += row.cnt
  }

  return c.json({ code: 0, data: { items, total, page, limit } })
})

router.delete('/sites/:siteId/comments/:commentId', async (c) => {
  const siteId = c.req.param('siteId')
  requireSiteOwnership(c, siteId)
  const db = getDb()
  db.delete(comments).where(and(eq(comments.id, c.req.param('commentId')), eq(comments.siteId, siteId))).run()
  return c.json({ code: 0 })
})

// ── Export visitor comments (native plugin) for a site ──

router.get('/sites/:siteId/comments/export', async (c) => {
  const siteId = c.req.param('siteId')
  requireSiteOwnership(c, siteId)
  const db = getDb()
  const raw = getRawDb() as import('better-sqlite3').Database

  const site = db.select().from(sites).where(eq(sites.id, siteId)).get() as any
  if (!site) throw new HTTPException(404, { message: 'Site not found' })

  const visitorRows = raw.prepare(
    "SELECT id, path, parent_id, author_name, author_email, author_url, content, status, edited_at, created_at FROM visitor_comments WHERE site_id = ? ORDER BY created_at ASC"
  ).all(siteId) as any[]

  const exportComments = visitorRows.map((v) => ({
    id: v.id,
    path: v.path,
    parentId: v.parent_id || null,
    authorName: v.author_name,
    authorEmail: v.author_email || '',
    authorUrl: v.author_url || '',
    content: v.content,
    status: v.status || 'approved',
    editedAt: v.edited_at || null,
    createdAt: v.created_at,
  }))

  const payload = {
    version: 1,
    type: 'aigcs-native-comments',
    exportedAt: new Date().toISOString(),
    site: { id: site.id, name: site.name, domain: site.domain },
    totalComments: exportComments.length,
    comments: exportComments,
  }

  const json = JSON.stringify(payload, null, 2)
  const filename = `aigcs-comments-${site.domain || siteId}-${Date.now()}.json`
  c.header('Content-Type', 'application/json; charset=utf-8')
  c.header('Content-Disposition', `attachment; filename="${filename}"`)
  return c.body(json)
})

// ── Import native visitor comments from JSON ──

router.post('/sites/:siteId/comments/import', async (c) => {
  const siteId = c.req.param('siteId')
  requireSiteOwnership(c, siteId)
  const db = getDb()
  const raw = getRawDb() as import('better-sqlite3').Database

  const fd = await c.req.parseBody()
  const file = fd['file']
  if (!file || !(file instanceof File)) {
    return c.json({ code: 1, message: 'File is required' }, 400)
  }

  const text = await file.text()
  let payload: any
  try {
    payload = JSON.parse(text)
  } catch {
    return c.json({ code: 1, message: 'Invalid JSON file' }, 400)
  }

  if (!payload.comments || !Array.isArray(payload.comments)) {
    return c.json({ code: 1, message: 'Invalid format: missing comments array' }, 400)
  }

  const existingIds = new Set(
    (raw.prepare('SELECT id FROM visitor_comments WHERE site_id = ?').all(siteId) as any[]).map(r => r.id)
  )

  let imported = 0
  let skipped = 0
  const now = new Date().toISOString()

  const insertVisitor = raw.prepare(
    `INSERT OR IGNORE INTO visitor_comments (id, site_id, path, parent_id, author_name, author_email, author_url, content, status, edited_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )

  const importComments = raw.transaction(() => {
    for (const c of payload.comments) {
      if (existingIds.has(c.id)) { skipped++; continue }
      const newId = c.id || crypto.randomUUID()
      try {
        insertVisitor.run(
          newId, siteId, c.path,
          c.parentId || null,
          c.authorName || '',
          c.authorEmail || '',
          c.authorUrl || '',
          c.content || '',
          c.status || 'approved',
          c.editedAt || null,
          c.createdAt || now,
        )
        imported++
      } catch (err) {
        skipped++
      }
    }
  })

  importComments()

  const user = c.get('user')!
  insertAuditLog(db, {
    id: nanoid(),
    userId: user.id,
    action: 'comments.import',
    details: { siteId, imported, skipped, total: payload.comments.length },
  })

  return c.json({ code: 0, data: { imported, skipped, total: payload.comments.length } })
})

// ── SMTP Test ──

router.post('/system/smtp-test', requireRole('admin'), async (c) => {
  const raw = getRawDb()
  const config = raw.prepare?.("SELECT * FROM system_config WHERE id = 'global'").get() as Record<string, unknown> | undefined
  if (!config?.smtp_host) {
    return c.json({ code: 1, message: 'SMTP not configured' })
  }

  try {
    let body: { email?: string } = {}
    try { body = await c.req.json() } catch { /* ignore */ }
    const targetEmail = body.email || c.get('user')!.email
    const { sendEmail } = await import('../services/email.js')
    const { renderEmail, getEmailSubject, getEmailLocale } = await import('../email-templates/index.js')
    const emailLocale = getEmailLocale(getRawDb())
    await sendEmail(
      targetEmail,
      getEmailSubject('smtp-test', emailLocale),
      renderEmail({ template: 'smtp-test', locale: emailLocale, title: getEmailSubject('smtp-test', emailLocale) }),
    )
    return c.json({ code: 0, data: { message: 'Test email sent successfully' } })
  } catch (err) {
    return c.json({ code: 1, message: `SMTP test failed: ${String(err)}` })
  }
})

// ── Audit Log ──

router.get('/audit-log', async (c) => {
  const user = c.get('user')!
  const raw = getRawDb()
  const page = parseInt(c.req.query('page') || '1')
  const limit = parseInt(c.req.query('limit') || '20')
  const offset = (page - 1) * limit

  const items = raw.prepare?.(
    `SELECT al.* FROM audit_log al LEFT JOIN sites s ON json_extract(al.details, '$.siteId') = s.id WHERE s.user_id = ? OR al.user_id = ? ORDER BY al.created_at DESC LIMIT ? OFFSET ?`,
  ).all(user.id, user.id, limit, offset) || []

  const totalRow = raw.prepare?.(
    `SELECT COUNT(*) as count FROM audit_log al LEFT JOIN sites s ON json_extract(al.details, '$.siteId') = s.id WHERE s.user_id = ? OR al.user_id = ?`,
  ).get(user.id, user.id) as { count: number } | undefined

  return c.json({ code: 0, data: { items, total: totalRow?.count ?? 0, page, limit } })
})

// ── Dashboard ──

router.get('/dashboard/stats', async (c) => {
  const user = c.get('user')!
  const db = getDb()

  const siteCount = db.select({ count: sql<number>`count(*)` }).from(sites).where(eq(sites.userId, user.id)).get()
  const providerCount = db.select({ count: sql<number>`count(*)` }).from(providers).where(sql`site_id IN (SELECT id FROM sites WHERE user_id = ${user.id})`).get()
  const commentCount = db.select({ count: sql<number>`count(*)` }).from(comments).where(sql`site_id IN (SELECT id FROM sites WHERE user_id = ${user.id})`).get()
  const cacheCount = db.select({ count: sql<number>`count(*)` }).from(pageCache).where(sql`site_id IN (SELECT id FROM sites WHERE user_id = ${user.id})`).get()

  return c.json({ code: 0, data: {
    sites: siteCount?.count ?? 0,
    providers: providerCount?.count ?? 0,
    comments: commentCount?.count ?? 0,
    cacheEntries: cacheCount?.count ?? 0,
  }})
})

// ── Users (admin only) ──

// POST /admin/users — create a new user (admin only)
const createUserSchema = z.object({
  username: z.string().min(1).max(64),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  displayName: z.string().max(64).optional(),
  role: z.enum(['user', 'admin']).default('user'),
})

router.post('/users', requireRole('admin'), zValidator('json', createUserSchema), async (c) => {
  const db = getDb()

  const existingEmail = db.select().from(users).where(eq(users.email, c.req.valid('json').email)).get()
  if (existingEmail) throw new HTTPException(409, { message: 'Email already in use' })

  const existingUsername = db.select().from(users).where(eq(users.username, c.req.valid('json').username)).get()
  if (existingUsername) throw new HTTPException(409, { message: 'Username already taken' })

  const { hashPassword } = await import('../services/password.js')
  const id = nanoid()
  const body = c.req.valid('json')
  const passwordHash = await hashPassword(body.password)

  db.insert(users).values({
    id,
    email: body.email,
    username: body.username,
    passwordHash,
    displayName: body.displayName || body.username,
    role: body.role,
  }).run()

  const user = c.get('user')!
  insertAuditLog(db, { id: nanoid(), userId: user.id, action: 'user.create', details: { username: body.username, email: body.email, role: body.role } })
  return c.json({ code: 0, data: { id } })
})

router.get('/users', requireRole('admin'), async (c) => {
  const db = getDb()
  const currentUser = c.get('user')!
  const page = parseInt(c.req.query('page') || '1', 10)
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 100)
  const offset = (page - 1) * limit

  const allUsers = db.select({
    id: users.id,
    email: users.email,
    username: users.username,
    displayName: users.displayName,
    role: users.role,
    emailVerifiedAt: users.emailVerifiedAt,
    totpEnabled: users.totpEnabled,
    createdAt: users.createdAt,
  }).from(users).limit(limit).offset(offset).all()

  const total = db.select({ count: sql<number>`count(*)` }).from(users).get()
  const isCurrentUserIncluded = allUsers.some((u: { id: string }) => u.id === currentUser.id)
  let currentUserData = null
  if (!isCurrentUserIncluded) {
    currentUserData = db.select({
      id: users.id,
      email: users.email,
      username: users.username,
      displayName: users.displayName,
      role: users.role,
      emailVerifiedAt: users.emailVerifiedAt,
      totpEnabled: users.totpEnabled,
      createdAt: users.createdAt,
    }).from(users).where(eq(users.id, currentUser.id)).get()
  }

  return c.json({
    code: 0,
    data: {
      users: currentUserData ? [currentUserData, ...allUsers] : allUsers,
      total: total?.count ?? 0,
      page,
      limit,
    },
  })
})

// PUT /admin/users/:id — update user (admin only)
const updateUserSchema = z.object({
  username: z.string().min(1).max(64).optional(),
  email: z.string().email().optional(),
  password: z.string().min(8).max(128).optional(),
})

router.put('/users/:id', requireRole('admin'), zValidator('json', updateUserSchema), async (c) => {
  const db = getDb()
  const id = c.req.param('id')
  const body = c.req.valid('json')

  const existing = db.select().from(users).where(eq(users.id, id)).get()
  if (!existing) throw new HTTPException(404, { message: 'User not found' })

  const updates: Record<string, unknown> = {}
  if (body.username !== undefined) updates.username = body.username
  if (body.email !== undefined) {
    const dup = db.select().from(users).where(and(eq(users.email, body.email), sql`id != ${id}`)).get()
    if (dup) throw new HTTPException(409, { message: 'Email already in use' })
    updates.email = body.email
  }
  if (body.password !== undefined) {
    const { hashPassword } = await import('../services/password.js')
    updates.passwordHash = await hashPassword(body.password)
  }
  updates.updatedAt = new Date().toISOString()

  db.update(users).set(updates).where(eq(users.id, id)).run()
  const user = c.get('user')!
  insertAuditLog(db, { id: nanoid(), userId: user.id, action: 'user.update', details: { id, ...body } })
  return c.json({ code: 0, message: 'User updated' })
})

// ── Reaction Types ──

router.get('/reaction-types', async (c) => {
  const db = getDb()
  const types = db.select().from(reactionTypes).all()
  return c.json({ code: 0, data: types })
})

const createReactionSchema = z.object({
  id: z.string().min(1).max(32),
  emoji: z.string().min(1),
  label: z.string().min(1).max(64),
  sortOrder: z.number().int().optional(),
})

router.post('/reaction-types', requireRole('admin'), zValidator('json', createReactionSchema), async (c) => {
  const db = getDb()
  const { id, emoji, label, sortOrder } = c.req.valid('json')

  const existing = db.select().from(reactionTypes).where(eq(reactionTypes.id, id)).get()
  if (existing) throw new HTTPException(409, { message: 'Reaction type already exists' })

  const duplicateLabel = db.select().from(reactionTypes).where(and(eq(reactionTypes.label, label), eq(reactionTypes.isSystem, true as any))).get()
  if (duplicateLabel) throw new HTTPException(409, { message: 'A system reaction with this label already exists' })

  db.insert(reactionTypes).values({
    id,
    emoji,
    label,
    sortOrder: sortOrder ?? 99,
    isSystem: false,
  }).run()

  const user = c.get('user')!
  insertAuditLog(db, { id: nanoid(), userId: user.id, action: 'reaction-type.create', details: { id, emoji, label } })
  return c.json({ code: 0, message: 'Reaction type created' })
})

const updateReactionSchema = z.object({
  emoji: z.string().min(1).optional(),
  label: z.string().min(1).max(64).optional(),
  sortOrder: z.number().int().optional(),
})

router.put('/reaction-types/:id', requireRole('admin'), zValidator('json', updateReactionSchema), async (c) => {
  const db = getDb()
  const id = c.req.param('id')
  const body = c.req.valid('json')

  const existing = db.select().from(reactionTypes).where(eq(reactionTypes.id, id)).get()
  if (!existing) throw new HTTPException(404, { message: 'Reaction type not found' })

  const updates: Record<string, unknown> = {}
  if (body.emoji !== undefined) updates.emoji = body.emoji
  if (body.label !== undefined) updates.label = body.label
  if (body.sortOrder !== undefined) updates.sortOrder = body.sortOrder

  if (Object.keys(updates).length > 0) {
    db.update(reactionTypes).set(updates).where(eq(reactionTypes.id, id)).run()
  }

  const user = c.get('user')!
  insertAuditLog(db, { id: nanoid(), userId: user.id, action: 'reaction-type.update', details: { id, ...body } })
  return c.json({ code: 0, message: 'Reaction type updated' })
})

router.delete('/reaction-types/:id', requireRole('admin'), async (c) => {
  const db = getDb()
  const id = c.req.param('id')

  const existing = db.select({ isSystem: reactionTypes.isSystem }).from(reactionTypes).where(eq(reactionTypes.id, id)).get()
  if (!existing) throw new HTTPException(404, { message: 'Reaction type not found' })
  if (existing.isSystem) throw new HTTPException(400, { message: 'Cannot delete system reaction type' })

  db.delete(reactionTypes).where(eq(reactionTypes.id, id)).run()
  const user = c.get('user')!
  insertAuditLog(db, { id: nanoid(), userId: user.id, action: 'reaction-type.delete', details: { id } })
  return c.json({ code: 0, message: 'Reaction type deleted' })
})

// PUT /admin/reaction-types/:id/toggle — enable/disable a reaction type
router.put('/reaction-types/:id/toggle', requireRole('admin'), async (c) => {
  const db = getDb()
  const id = c.req.param('id')
  const existing = db.select({ enabled: reactionTypes.enabled }).from(reactionTypes).where(eq(reactionTypes.id, id)).get()
  if (!existing) throw new HTTPException(404, { message: 'Reaction type not found' })
  db.update(reactionTypes).set({ enabled: !existing.enabled }).where(eq(reactionTypes.id, id)).run()
  const user = c.get('user')!
  insertAuditLog(db, { id: nanoid(), userId: user.id, action: 'reaction-type.toggle', details: { id, enabled: !existing.enabled } })
  return c.json({ code: 0, message: existing.enabled ? 'Disabled' : 'Enabled' })
})

// ── Plugin Management ──

router.get('/plugins', async (c) => {
  const { getAllPlugins } = await import('../plugins/registry.js')
  const db = getDb()
  const serverPlugins = getAllPlugins()
  const dbRows = db.select().from(plugins).all() as Array<{ id: string; name: string; version: string; enabled: number }>

  const seen = new Set<string>()
  const merged: Array<{
    name: string; displayName?: Record<string, string>; descriptions?: Record<string, string>
    homepage?: string
    version: string; description?: string; hooks: string[]
    enabled: boolean; defaultSettings?: Record<string, any>; settings?: Record<string, any>
    source: 'filesystem' | 'uploaded'
    dbId?: string
  }> = []

  for (const p of serverPlugins) {
    seen.add(p.name)
    const dbRow = dbRows.find(r => r.name === p.name)
    let dbSettings: Record<string, any> = {}
    if (dbRow) {
      const raw = (dbRow as any).settings
      if (typeof raw === 'string') {
        try { dbSettings = JSON.parse(raw || '{}') } catch {}
      } else if (raw && typeof raw === 'object') {
        dbSettings = raw
      }
    }
    merged.push({
      name: p.name,
      displayName: p.displayName,
      descriptions: p.descriptions,
      homepage: p.homepage,
      version: p.version,
      description: p.description || '',
      hooks: Object.keys(p.hooks),
      enabled: dbRow ? !!dbRow.enabled : false,
      defaultSettings: p.defaultSettings || {},
      settings: dbSettings,
      source: 'filesystem',
    })
  }

  for (const row of dbRows) {
    if (!seen.has(row.name)) {
      merged.push({
        name: row.name,
        version: row.version || '',
        description: '',
        hooks: [],
        enabled: !!row.enabled,
        source: 'uploaded',
        dbId: row.id,
      })
    }
  }

  return c.json({ code: 0, data: merged })
})

router.get('/comment-plugins', async (c) => {
  const { getCommentPlugins } = await import('../plugins/registry.js')
  const list = getCommentPlugins().map(p => ({
    name: p.name,
    displayName: p.displayName,
    descriptions: p.descriptions,
    homepage: p.homepage,
    version: p.version,
    description: p.description || '',
  }))
  return c.json({ code: 0, data: list })
})

router.post('/plugins/:name/reload', requireRole('admin'), async (c) => {
  return c.json({ code: 0, message: 'Plugin reloaded' })
})

// GET /admin/plugins/installed — list plugins from DB
router.get('/plugins/installed', async (c) => {
  const db = getDb()
  const list = db.select().from(plugins).all()
  return c.json({ code: 0, data: list })
})

// POST /admin/plugins/upload — install a plugin via manifest
const pluginUploadSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().optional(),
})

router.post('/plugins/upload', requireRole('admin'), zValidator('json', pluginUploadSchema), async (c) => {
  const db = getDb()
  const body = c.req.valid('json')

  const existing = db.select().from(plugins).where(eq(plugins.name, body.name)).get()
  if (existing) throw new HTTPException(409, { message: 'Plugin already installed' })

  db.insert(plugins).values({
    id: nanoid(),
    name: body.name,
    version: body.version,
    enabled: true,
    settings: body.description ? { description: body.description } : {},
  }).run()

  const user = c.get('user')!
  insertAuditLog(db, { id: nanoid(), userId: user.id, action: 'plugin.install', details: { name: body.name, version: body.version } })
  return c.json({ code: 0, message: 'Plugin installed. Restart server to activate.' })
})

// POST /admin/plugins/upload-file — upload a plugin package file
router.post('/plugins/upload-file', requireRole('admin'), async (c) => {
  const db = getDb()
  let name = '', version = '', description = ''

  try {
    const body = await c.req.parseBody()
    name = (body.name as string) || ''
    version = (body.version as string) || ''
    description = (body.description as string) || ''

    if (!name || !version) {
      return c.json({ code: 1, message: 'name and version are required' })
    }

    const existing = db.select().from(plugins).where(eq(plugins.name, name)).get()
    if (existing) throw new HTTPException(409, { message: 'Plugin already installed' })

    db.insert(plugins).values({
      id: nanoid(),
      name,
      version,
      enabled: 1,
      settings: { description, uploadedAt: new Date().toISOString() },
    }).run()

    const user = c.get('user')!
    insertAuditLog(db, { id: nanoid(), userId: user.id, action: 'plugin.upload', details: { name, version } })
    return c.json({ code: 0, message: 'Plugin uploaded and installed. Restart server to activate.' })
  } catch (err) {
    if (err instanceof HTTPException) throw err
    return c.json({ code: 1, message: String(err) })
  }
})

// DELETE /admin/plugins/:name — uninstall a plugin
router.delete('/plugins/:name', requireRole('admin'), async (c) => {
  const db = getDb()
  const name = c.req.param('name')
  db.delete(plugins).where(eq(plugins.name, name)).run()

  // Also reset in-memory state
  const { getPlugin } = await import('../plugins/registry.js')
  const plugin = getPlugin(name)
  if (plugin) {
    delete (plugin as any)._disabled
    delete (plugin as any)._settings
  }

  const user = c.get('user')!
  insertAuditLog(db, { id: nanoid(), userId: user.id, action: 'plugin.uninstall', details: { name } })
  return c.json({ code: 0, message: 'Plugin uninstalled' })
})

// POST /admin/plugins/:name/toggle — enable/disable a plugin (live, no restart)
router.post('/plugins/:name/toggle', requireRole('admin'), async (c) => {
  const db = getDb()
  const name = c.req.param('name')

  const existing = db.select().from(plugins).where(eq(plugins.name, name)).get() as any
  let newEnabled: boolean

  if (existing) {
    newEnabled = !existing.enabled
    db.update(plugins).set({ enabled: newEnabled ? 1 : 0 }).where(eq(plugins.name, name)).run()
  } else {
    // No DB row yet: GET defaults to enabled=false, so first toggle means enable
    newEnabled = true
    db.insert(plugins).values({
      id: nanoid(),
      name,
      version: '',
      enabled: 1,
      settings: {},
    }).run()
  }

  // Update in-memory state live
  const { getPlugin } = await import('../plugins/registry.js')
  const plugin = getPlugin(name)
  if (plugin) {
    ;(plugin as any)._disabled = !newEnabled
  }

  const user = c.get('user')!
  insertAuditLog(db, { id: nanoid(), userId: user.id, action: 'plugin.toggle', details: { name, enabled: newEnabled } })
  return c.json({ code: 0, data: { enabled: newEnabled } })
})

// PUT /admin/plugins/:name/settings — update plugin settings (live, no restart)
const pluginSettingsSchema = z.object({
  settings: z.record(z.string(), z.unknown()),
})

router.put('/plugins/:name/settings', requireRole('admin'), zValidator('json', pluginSettingsSchema), async (c) => {
  const db = getDb()
  const name = c.req.param('name')
  const { settings } = c.req.valid('json')

  const existing = db.select().from(plugins).where(eq(plugins.name, name)).get()
  if (existing) {
    db.update(plugins).set({ settings }).where(eq(plugins.name, name)).run()
  } else {
    db.insert(plugins).values({
      id: nanoid(),
      name,
      version: '',
      enabled: 1,
      settings,
    }).run()
  }

  // Update in-memory state live
  const { getPlugin } = await import('../plugins/registry.js')
  const plugin = getPlugin(name)
  if (plugin) {
    ;(plugin as any)._settings = settings
  }

  const user = c.get('user')!
  insertAuditLog(db, { id: nanoid(), userId: user.id, action: 'plugin.settings.update', details: { name, settings } })
  return c.json({ code: 0, message: 'Settings saved' })
})

// ── Export JSON ──

router.get('/export', requireRole('admin'), async (c) => {
  const db = getDb()
  const scope = c.req.query('scope') || 'global'
  const siteId = c.req.query('siteId') || ''
  const includeSites = c.req.query('includeSites') === 'true'

  const payload: Record<string, any> = {
    version: 1,
    exportedAt: new Date().toISOString(),
    scope,
    siteId: scope === 'site' ? siteId : undefined,
    data: {},
  }

  if (scope === 'global') {
    payload.data.system_config = db.select().from(systemConfig).where(eq(systemConfig.id, 'global')).get() || null
    payload.data.users = db.select().from(users).all()
    payload.data.api_tokens = db.select().from(apiTokens).all()
    payload.data.plugins = db.select().from(plugins).all()
    payload.data.prompt_templates = db.select().from(promptTemplates).all()
    payload.data.reaction_types = db.select().from(reactionTypes).all()
    payload.data.comment_reactions = db.select().from(commentReactions).all()
    payload.data.reaction_votes = db.select().from(reactionVotes).all()
    payload.data.audit_log = db.select().from(auditLog).all()

    if (includeSites) {
      const allSites = db.select().from(sites).all()
      payload.data.sites = allSites.map((site: any) => ({
        ...site,
        comments: db.select().from(comments).where(eq(comments.siteId, site.id)).all(),
        visitor_comments: db.select().from(visitorComments).where(eq(visitorComments.siteId, site.id)).all(),
        providers: db.select().from(providers).where(eq(providers.siteId, site.id)).all(),
        webhooks: db.select().from(webhooks).where(eq(webhooks.siteId, site.id)).all(),
        page_cache: db.select().from(pageCache).where(eq(pageCache.siteId, site.id)).all(),
      }))
    }
  } else if (scope === 'site') {
    if (!siteId) return c.json({ code: 1, message: 'siteId required for site scope' }, 400)
    requireSiteOwnership(c, siteId)

    const site = db.select().from(sites).where(eq(sites.id, siteId)).get()
    if (!site) return c.json({ code: 1, message: 'Site not found' }, 404)

    payload.site = site
    payload.data.comments = db.select().from(comments).where(eq(comments.siteId, siteId)).all()
    payload.data.visitor_comments = db.select().from(visitorComments).where(eq(visitorComments.siteId, siteId)).all()
    payload.data.providers = db.select().from(providers).where(eq(providers.siteId, siteId)).all()
    payload.data.webhooks = db.select().from(webhooks).where(eq(webhooks.siteId, siteId)).all()
    payload.data.page_cache = db.select().from(pageCache).where(eq(pageCache.siteId, siteId)).all()
  } else {
    return c.json({ code: 1, message: 'Invalid scope' }, 400)
  }

  const json = JSON.stringify(payload, null, 2)
  const filename = `aigcs-export-${scope}-${Date.now()}.json`
  c.header('Content-Type', 'application/json')
  c.header('Content-Disposition', `attachment; filename="${filename}"`)
  return c.body(json)
})

// ── Export SQLite backup ──

router.get('/export/sqlite', requireRole('admin'), async (c) => {
  const { getDialect } = await import('../db/index.js')
  if (getDialect() !== 'sqlite') {
    return c.json({ code: 1, message: 'SQLite backup only available for SQLite database' }, 400)
  }

  const raw = getRawDb() as any
  const backupPath = `/tmp/aigcs-backup-${Date.now()}.db`
  await raw.backup(backupPath)

  const fs = await import('node:fs')
  const buf = fs.readFileSync(backupPath)
  fs.unlinkSync(backupPath)

  const filename = `aigcs-backup-${Date.now()}.db`
  c.header('Content-Type', 'application/octet-stream')
  c.header('Content-Disposition', `attachment; filename="${filename}"`)
  return c.body(buf)
})

// ── Import JSON ──

router.post('/import', requireRole('admin'), async (c) => {
  const db = getDb()
  const raw = getRawDb()

  const fd = await c.req.parseBody()
  const file = fd['file']
  if (!file || !(file instanceof File)) {
    return c.json({ code: 1, message: 'File is required' }, 400)
  }

  const text = await file.text()
  let payload: any
  try {
    payload = JSON.parse(text)
  } catch {
    return c.json({ code: 1, message: 'Invalid JSON file' }, 400)
  }

  if (payload.version !== 1) {
    return c.json({ code: 1, message: 'Unsupported export version' }, 400)
  }

  const scope = payload.scope
  const d = payload.data || {}
  const summary: Record<string, number> = {}

  if (scope === 'global') {
    // system_config
    if (d.system_config) {
      const existing = db.select().from(systemConfig).where(eq(systemConfig.id, 'global')).get()
      if (existing) {
        db.update(systemConfig).set({ ...d.system_config, updatedAt: new Date().toISOString() })
          .where(eq(systemConfig.id, 'global')).run()
      } else {
        db.insert(systemConfig).values({ id: 'global', ...d.system_config }).run()
      }
      summary.system_config = 1
    }

    // users
    if (Array.isArray(d.users)) {
      for (const u of d.users) {
        const existing = db.select().from(users).where(eq(users.email, u.email)).get()
        if (existing) {
          db.update(users).set({ ...u, id: existing.id }).where(eq(users.id, existing.id)).run()
        } else {
          db.insert(users).values(u).run()
        }
      }
      summary.users = d.users.length
    }

    // api_tokens
    if (Array.isArray(d.api_tokens)) {
      db.delete(apiTokens).run()
      for (const t of d.api_tokens) {
        db.insert(apiTokens).values(t).run()
      }
      summary.api_tokens = d.api_tokens.length
    }

    // plugins
    if (Array.isArray(d.plugins)) {
      for (const p of d.plugins) {
        const existing = db.select().from(plugins).where(eq(plugins.name, p.name)).get()
        if (existing) {
          db.update(plugins).set({ ...p, id: existing.id }).where(eq(plugins.id, existing.id)).run()
        } else {
          db.insert(plugins).values(p).run()
        }
      }
      summary.plugins = d.plugins.length
    }

    // prompt_templates
    if (Array.isArray(d.prompt_templates)) {
      for (const pt of d.prompt_templates) {
        const existing = db.select().from(promptTemplates).where(eq(promptTemplates.id, pt.id)).get()
        if (existing) {
          db.update(promptTemplates).set(pt).where(eq(promptTemplates.id, pt.id)).run()
        } else {
          db.insert(promptTemplates).values(pt).run()
        }
      }
      summary.prompt_templates = d.prompt_templates.length
    }

    // reaction_types
    if (Array.isArray(d.reaction_types)) {
      for (const rt of d.reaction_types) {
        const existing = db.select().from(reactionTypes).where(eq(reactionTypes.id, rt.id)).get()
        if (existing) {
          db.update(reactionTypes).set(rt).where(eq(reactionTypes.id, rt.id)).run()
        } else {
          db.insert(reactionTypes).values(rt).run()
        }
      }
      summary.reaction_types = d.reaction_types.length
    }

    // comment_reactions
    if (Array.isArray(d.comment_reactions)) {
      db.delete(commentReactions).run()
      for (const cr of d.comment_reactions) {
        db.insert(commentReactions).values(cr).run()
      }
      summary.comment_reactions = d.comment_reactions.length
    }

    // reaction_votes
    if (Array.isArray(d.reaction_votes)) {
      db.delete(reactionVotes).run()
      for (const rv of d.reaction_votes) {
        db.insert(reactionVotes).values(rv).run()
      }
      summary.reaction_votes = d.reaction_votes.length
    }

    // audit_log
    if (Array.isArray(d.audit_log)) {
      db.delete(auditLog).run()
      for (const al of d.audit_log) {
        insertAuditLog(db, al)
      }
      summary.audit_log = d.audit_log.length
    }

    // sites
    if (Array.isArray(d.sites)) {
      for (const site of d.sites) {
        const { comments: siteComments, visitor_comments: siteVC, providers: siteProviders, webhooks: siteWebhooks, page_cache: siteCache, ...siteData } = site
        const existing = db.select().from(sites).where(and(eq(sites.userId, siteData.userId), eq(sites.domain, siteData.domain))).get()
        const siteId = existing ? existing.id : nanoid()

        if (existing) {
          db.update(sites).set({ ...siteData, id: siteId }).where(eq(sites.id, siteId)).run()
        } else {
          db.insert(sites).values({ ...siteData, id: siteId }).run()
        }

        // Replace all child data for this site
        db.delete(comments).where(eq(comments.siteId, siteId)).run()
        db.delete(visitorComments).where(eq(visitorComments.siteId, siteId)).run()
        db.delete(providers).where(eq(providers.siteId, siteId)).run()
        db.delete(webhooks).where(eq(webhooks.siteId, siteId)).run()
        db.delete(pageCache).where(eq(pageCache.siteId, siteId)).run()

        if (Array.isArray(siteComments)) {
          for (const c of siteComments) {
            db.insert(comments).values({ ...c, siteId }).run()
          }
        }
        if (Array.isArray(siteVC)) {
          for (const vc of siteVC) {
            db.insert(visitorComments).values({ ...vc, siteId }).run()
          }
        }
        if (Array.isArray(siteProviders)) {
          for (const p of siteProviders) {
            db.insert(providers).values({ ...p, siteId }).run()
          }
        }
        if (Array.isArray(siteWebhooks)) {
          for (const w of siteWebhooks) {
            db.insert(webhooks).values({ ...w, siteId }).run()
          }
        }
        if (Array.isArray(siteCache)) {
          for (const pc of siteCache) {
            db.insert(pageCache).values({ ...pc, siteId }).run()
          }
        }
      }
      summary.sites = d.sites.length
    }
  } else if (scope === 'site') {
    const siteData = payload.site
    if (!siteData) return c.json({ code: 1, message: 'Missing site data in import file' }, 400)

    const existing = db.select().from(sites).where(and(eq(sites.userId, siteData.userId), eq(sites.domain, siteData.domain))).get()
    const siteId = existing ? existing.id : nanoid()

    if (existing) {
      db.update(sites).set({ ...siteData, id: siteId }).where(eq(sites.id, siteId)).run()
    } else {
      db.insert(sites).values({ ...siteData, id: siteId }).run()
    }

    // Replace child data
    db.delete(comments).where(eq(comments.siteId, siteId)).run()
    db.delete(visitorComments).where(eq(visitorComments.siteId, siteId)).run()
    db.delete(providers).where(eq(providers.siteId, siteId)).run()
    db.delete(webhooks).where(eq(webhooks.siteId, siteId)).run()
    db.delete(pageCache).where(eq(pageCache.siteId, siteId)).run()

    if (Array.isArray(d.comments)) {
      for (const c of d.comments) {
        db.insert(comments).values({ ...c, siteId }).run()
      }
      summary.comments = d.comments.length
    }
    if (Array.isArray(d.visitor_comments)) {
      for (const vc of d.visitor_comments) {
        db.insert(visitorComments).values({ ...vc, siteId }).run()
      }
      summary.visitor_comments = d.visitor_comments.length
    }
    if (Array.isArray(d.providers)) {
      for (const p of d.providers) {
        db.insert(providers).values({ ...p, siteId }).run()
      }
      summary.providers = d.providers.length
    }
    if (Array.isArray(d.webhooks)) {
      for (const w of d.webhooks) {
        db.insert(webhooks).values({ ...w, siteId }).run()
      }
      summary.webhooks = d.webhooks.length
    }
    if (Array.isArray(d.page_cache)) {
      for (const pc of d.page_cache) {
        db.insert(pageCache).values({ ...pc, siteId }).run()
      }
      summary.page_cache = d.page_cache.length
    }

    summary.site = 1
  } else {
    return c.json({ code: 1, message: 'Invalid scope in import file' }, 400)
  }

  const user = c.get('user')!
  insertAuditLog(db, { id: nanoid(), userId: user.id, action: 'system.import', details: { scope, summary } })
  return c.json({ code: 0, message: 'Import completed', summary })
})

export { router as adminRouter }
