import { Hono } from 'hono'
import { getDb, getRawDb } from '../db/index.js'
import { comments, pageCache, providers, sites, users, reactionTypes } from '@aigcs/core'
import { eq, and, sql } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { createHash, createHmac, randomUUID } from 'node:crypto'
import DOMPurify from 'dompurify'
import { JSDOM } from 'jsdom'
import { decrypt } from '../services/encryption.js'
import { isUnsubscribed, buildUnsubscribeUrl, resolveAdminUrl } from '../services/unsubscribe.js'
import type { FetchContext, SubmitContext } from '@aigcs/core'
import { runHook } from '../plugins/registry.js'
import { extractPageContent, extractPageTitle } from '../lib/extract-content.js'
import { fireWebhook } from '../services/webhook.js'
import jwt from 'jsonwebtoken'
import { getJwtSecret } from '../middleware/auth.js'

const purify = DOMPurify(new JSDOM('').window)

const reactionRateLimits = new Map<string, number[]>()

// Periodically clean stale entries every 10 minutes
setInterval(() => {
  const now = Date.now()
  const cutoff = now - 60 * 60 * 1000
  for (const [key, times] of reactionRateLimits) {
    const filtered = times.filter(t => t >= cutoff)
    if (filtered.length === 0) reactionRateLimits.delete(key)
    else reactionRateLimits.set(key, filtered)
  }
}, 10 * 60 * 1000)

import { getProviderAvatar } from '../providers/avatars.js'

const router = new Hono()

function md5(s: string): string {
  return createHash('md5').update(s).digest('hex')
}

function assertWidgetOrigin(c: any, siteDomain: string): void {
  const origin = c.req.header('Origin')
  const referer = c.req.header('Referer')
  const source = origin || referer

  const isWriteMethod = ['POST', 'PUT', 'DELETE'].includes(c.req.method.toUpperCase())

  if (!source) {
    if (isWriteMethod) {
      throw new HTTPException(403, { message: 'Origin or Referer header is required for write operations' })
    }
    return
  }

  let sourceHost: string | undefined
  try {
    sourceHost = new URL(source).hostname
  } catch {
    throw new HTTPException(400, { message: 'Invalid Origin or Referer header' })
  }

  const siteHost = new URL(`https://${siteDomain}`).hostname
  if (sourceHost === siteHost) return

  // Also allow if origin is in the global allowed_origins (covers local dev, etc.)
  try {
    const raw = getRawDb() as any
    const config = raw.prepare?.("SELECT allowed_origins FROM system_config WHERE id = 'global'").get() as { allowed_origins: string | null } | undefined
    if (config?.allowed_origins) {
      const allowed = JSON.parse(config.allowed_origins) as string[]
      if (Array.isArray(allowed) && (allowed.includes('*') || allowed.includes(source) || allowed.includes(sourceHost) || allowed.some(a => a.includes(sourceHost!)))) return
    }
  } catch {}

  throw new HTTPException(403, { message: 'Origin does not match site domain' })
}

// GET /api/widget/captcha/config — public captcha config for widget forms
router.get('/captcha/config', async (c) => {
  const raw = getRawDb() as import('better-sqlite3').Database
  const config = raw.prepare("SELECT * FROM system_config WHERE id = 'global'").get() as any
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

// GET /api/widget/:domain/comments?path=/...
router.get('/:domain/comments', async (c) => {
  const domain = c.req.param('domain')
  const path = c.req.query('path')
  const generateParam = c.req.query('generate')
  const autoGenerate = generateParam !== 'false'
  const visitorId = c.req.query('_v')
  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || '0.0.0.0'

  if (!path) {
    throw new HTTPException(400, { message: 'path query parameter is required' })
  }

  const db = getDb()
  const raw = getRawDb() as import('better-sqlite3').Database

  let site = db.select().from(sites).where(eq(sites.domain, domain)).get()
  if (!site) {
    // Fallback: match site whose domain starts with the requested hostname
    site = db.select().from(sites).where(sql`${sites.domain} LIKE ${domain + ':%'} OR ${sites.domain} = ${domain}`).get()
  }
  if (!site) {
    throw new HTTPException(404, { message: 'Site not found' })
  }

  const siteDomain = (site as any).domain
  assertWidgetOrigin(c, siteDomain)

  const siteSettings = (site as any).settings || {}
  const finalAutoGenerate = typeof siteSettings.autoGenerate === 'boolean' ? siteSettings.autoGenerate : autoGenerate
  const commentPlugin = (siteSettings.commentPlugin as string) || ''

  const themeConfig: Record<string, string> = {}
  if (siteSettings.theme) themeConfig.theme = siteSettings.theme
  if (siteSettings.lightTheme) themeConfig.lightTheme = siteSettings.lightTheme
  if (siteSettings.darkTheme) themeConfig.darkTheme = siteSettings.darkTheme

  const reactionTypeList = raw.prepare(
    "SELECT id, emoji, label FROM reaction_types WHERE enabled = 1 ORDER BY sort_order"
  ).all() as Array<{ id: string; emoji: string; label: string }>

  const cacheKey = `${site.id}:${path}`
  const cacheHash = md5(cacheKey)
  let pc = db.select().from(pageCache).where(eq(pageCache.id, cacheHash)).get()
  const now = new Date().toISOString()

  if (!pc) {
    db.insert(pageCache).values({ id: cacheHash, siteId: site.id, path, status: 'pending', createdAt: now, updatedAt: now }).onConflictDoNothing().run()
    pc = db.select().from(pageCache).where(eq(pageCache.id, cacheHash)).get()
    if (!pc) {
      pc = { id: cacheHash, siteId: site.id, path, status: 'pending', createdAt: now, updatedAt: now, lockedAt: null, etag: null, generatedAt: null, error: null }
    }
  }

  // Handle stuck generating status (timeout after 5 minutes)
  if (pc.status === 'generating' && pc.lockedAt) {
    if (Date.now() - new Date(pc.lockedAt).getTime() > 5 * 60 * 1000) {
      raw.prepare("UPDATE page_cache SET status = 'pending', locked_at = NULL WHERE id = ?").run(cacheHash)
      pc.status = 'pending'
    }
  }

  if (finalAutoGenerate) {
    raw.prepare(
      "UPDATE page_cache SET status = 'generating', locked_at = ?, updated_at = ? WHERE id = ? AND status = 'pending'"
    ).run(now, now, cacheHash)

    const updated = raw.prepare('SELECT status FROM page_cache WHERE id = ?').get(cacheHash) as { status: string } | undefined

    if (updated?.status === 'generating') {
      generateComments(site.id, path, domain).catch((err) => {
        console.error(`[generation] Error for ${cacheKey}:`, err)
        db.update(pageCache).set({ status: 'error', error: String(err) }).where(eq(pageCache.id, cacheHash)).run()
      })
    }

    if (updated?.status !== 'ready') {
      const fetchCtxGen = await runHook<FetchContext>('onFetchComments', {
        siteId: site.id, path, comments: [], config: {},
      })
      return c.json({
        code: 0,
        data: {
          status: 'generating',
          estimatedWait: 30,
          visitorComments: fetchCtxGen.visitorComments || [],
          _config: { theme: themeConfig, reactionTypes: reactionTypeList, ...(fetchCtxGen.config || {}) },
        },
      })
    }
  }

  if (pc.status === 'error') {
    const fetchCtxErr = await runHook<FetchContext>('onFetchComments', {
      siteId: site.id, path, comments: [], config: {},
    })
    return c.json({
      code: 0,
      data: {
        status: 'ready',
        comments: [],
        visitorComments: fetchCtxErr.visitorComments || [],
        _config: { theme: themeConfig, reactionTypes: reactionTypeList, ...(fetchCtxErr.config || {}) },
      },
    })
  }

  const commentList = db
    .select()
    .from(comments)
    .where(and(eq(comments.siteId, site.id), eq(comments.path, path)))
    .all()

  const visitorHash = visitorId ? md5(visitorId) : md5(ip)

  const providerRows = db
    .select()
    .from(providers)
    .where(eq(providers.siteId, site.id))
    .all() as any[]
  const providerAvatarMap: Record<string, string> = {}
  for (const p of providerRows) {
    if (p.avatarSvg && p.avatarSvg !== '#empty-content') {
      providerAvatarMap[p.displayName] = p.avatarSvg
    } else {
      const fallback = getProviderAvatar(p.name)
      if (fallback) providerAvatarMap[p.displayName] = fallback
    }
  }

  const commentIds = (commentList as any[]).map((c: any) => c.id)
  const commentReactionsMap = new Map<string, Record<string, number>>()
  const commentVotesMap = new Map<string, string[]>()
  if (commentIds.length > 0) {
    const placeholders = commentIds.map(() => '?').join(',')
    const reactionRows = raw.prepare(`SELECT cr.comment_id, cr.reaction_type, cr.count FROM comment_reactions cr JOIN reaction_types rt ON cr.reaction_type = rt.id WHERE cr.comment_id IN (${placeholders}) AND rt.enabled = 1`).all(...commentIds) as Array<{ comment_id: string; reaction_type: string; count: number }>
    for (const r of reactionRows) {
      if (!commentReactionsMap.has(r.comment_id)) commentReactionsMap.set(r.comment_id, {})
      commentReactionsMap.get(r.comment_id)![r.reaction_type] = r.count
    }
    const voteRows = raw.prepare(`SELECT comment_id, reaction_type FROM reaction_votes WHERE comment_id IN (${placeholders}) AND visitor_hash = ?`).all(...commentIds, visitorHash) as Array<{ comment_id: string; reaction_type: string }>
    for (const v of voteRows) {
      if (!commentVotesMap.has(v.comment_id)) commentVotesMap.set(v.comment_id, [])
      commentVotesMap.get(v.comment_id)!.push(v.reaction_type)
    }
  }

  const commentDTOs = (commentList as any[]).map((c: any) => {
    return {
      id: c.id,
      providerName: c.providerName,
      model: c.model,
      authorName: c.authorName,
      authorAvatar: c.authorAvatar,
      avatarSvg: providerAvatarMap[c.providerName] || '',
      content: c.content,
      generatedAt: c.generatedAt,
      showModel: true,
      reactions: commentReactionsMap.get(c.id) || {},
      userVoted: commentVotesMap.get(c.id) || [],
    }
  })

  // Run onFetchComments hook — plugins can add visitor comments
  const fetchCtx = await runHook<FetchContext>('onFetchComments', {
    siteId: site.id,
    path,
    comments: commentDTOs,
    config: {},
  })

  const responseConfig: Record<string, unknown> = {
    theme: themeConfig,
    showAiBadge: siteSettings.showAiBadge ?? true,
    aiBadgePosition: siteSettings.aiBadgePosition || 'nick',
    showFediBadge: (siteSettings.fediConfig?.showBadge ?? true) as boolean,
    enabledCommentPlugins: Array.isArray(siteSettings.commentPlugin) ? siteSettings.commentPlugin : [],
    showReactions: siteSettings.showReactions ?? false,
    reactionTypes: reactionTypeList,
    ...(fetchCtx.config || {}),
    aiShowReactions: siteSettings.showReactions ?? true,
  }

  // Include responseConfig in etag so plugin config changes invalidate the cache
  const fediCfg = (siteSettings.fediConfig as any) || {}
  const avatarMode = fediCfg.avatarMode || 'aigcs'
  const mravatarUrl = fediCfg.mravatarUrl || ''
  const mravatarDefault = fediCfg.mravatarDefault || ''
  const mravatarProxied = fediCfg.mravatarProxied !== false
  const mravatarNoCache = fediCfg.mravatarNoCache !== false

  const proxyAvatar = (url: string) => {
    if (!url || !url.startsWith('http')) return url
    if (avatarMode === 'off') return url
    if (url.startsWith('/api/avatar-proxy')) return url
    const reqUrl = new URL(c.req.url)
    const proto = c.req.header('x-forwarded-proto') ? `${c.req.header('x-forwarded-proto')}:` : reqUrl.protocol
    return `${proto}//${reqUrl.host}/api/avatar-proxy?url=${encodeURIComponent(url)}`
  }

  const visitorCommentIds = (fetchCtx.visitorComments || []).map((vc: any) => vc.id)
  const vCommentReactionsMap = new Map<string, Record<string, number>>()
  const vCommentVotesMap = new Map<string, string[]>()
  if (visitorCommentIds.length > 0) {
    const placeholders = visitorCommentIds.map(() => '?').join(',')
    const reactionRows = raw.prepare(`SELECT cr.comment_id, cr.reaction_type, cr.count FROM comment_reactions cr JOIN reaction_types rt ON cr.reaction_type = rt.id WHERE cr.comment_id IN (${placeholders}) AND rt.enabled = 1`).all(...visitorCommentIds) as Array<{ comment_id: string; reaction_type: string; count: number }>
    for (const r of reactionRows) {
      if (!vCommentReactionsMap.has(r.comment_id)) vCommentReactionsMap.set(r.comment_id, {})
      vCommentReactionsMap.get(r.comment_id)![r.reaction_type] = r.count
    }
    const voteRows = raw.prepare(`SELECT comment_id, reaction_type FROM reaction_votes WHERE comment_id IN (${placeholders}) AND visitor_hash = ?`).all(...visitorCommentIds, visitorHash) as Array<{ comment_id: string; reaction_type: string }>
    for (const v of voteRows) {
      if (!vCommentVotesMap.has(v.comment_id)) vCommentVotesMap.set(v.comment_id, [])
      vCommentVotesMap.get(v.comment_id)!.push(v.reaction_type)
    }
  }

  const enrichedVisitorComments = (fetchCtx.visitorComments || []).map((vc: any) => {
    const reactionMap = vCommentReactionsMap.get(vc.id) || {}
    const votes = vCommentVotesMap.get(vc.id) || []
    let avatar = vc.avatar || ''
    if (avatarMode === 'mravatar' && mravatarUrl && vc.source === 'fedi' && vc.authorFediId) {
      const acct = vc.authorFediId.startsWith('@') ? vc.authorFediId.slice(1) : vc.authorFediId
      let base = mravatarUrl.trim()
      if (!base.startsWith('http://') && !base.startsWith('https://')) base = 'https://' + base
      base = base.replace(/\/+$/, '')
      if (!base.endsWith('/avatar')) base += '/avatar'
      let mravatarUrl_ = `${base}/${acct}`
      const params: string[] = []
      if (mravatarProxied) params.push('proxied=true')
      if (mravatarNoCache) params.push('no-cache=true')
      if (mravatarDefault) params.push(`default=${encodeURIComponent(mravatarDefault)}`)
      if (params.length) mravatarUrl_ += '?' + params.join('&')
      avatar = mravatarUrl_
    } else {
      avatar = proxyAvatar(avatar)
    }
    return {
      ...vc,
      avatar,
      reactions: reactionMap,
      userVoted: votes,
      visitorId: (visitorId && vc.visitorId === visitorId) ? vc.visitorId : '',
    }
  })

  const etag = md5(JSON.stringify({ comments: commentDTOs, visitorComments: enrichedVisitorComments, config: responseConfig }))

  c.header('ETag', `"${etag}"`)
  c.header('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400')

  const ifNoneMatch = c.req.header('If-None-Match')
  if (ifNoneMatch === `"${etag}"`) {
    return c.newResponse(null, 304)
  }

  return c.json({
    code: 0,
    data: {
      status: 'ready',
      comments: commentDTOs,
      visitorComments: enrichedVisitorComments,
      _config: responseConfig,
    },
  })
})

// POST /api/widget/:domain/react
router.post('/:domain/react', async (c) => {
  const domain = c.req.param('domain')
  const body = await c.req.json() as { commentId: string; reaction: string; visitorId?: string }
  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || '0.0.0.0'

  if (!body.commentId || !body.reaction) {
    throw new HTTPException(400, { message: 'commentId and reaction are required' })
  }

  const db = getDb()
  const site = db.select().from(sites).where(eq(sites.domain, domain)).get() as any
  if (!site) throw new HTTPException(404, { message: 'Site not found' })
  assertWidgetOrigin(c, (site as any).domain)
  const raw = getRawDb() as import('better-sqlite3').Database
  const visitorHash = body.visitorId ? md5(body.visitorId) : md5(ip)

  // Verify commentId belongs to this site
  const commentOwner = raw.prepare(
    'SELECT id FROM comments WHERE id = ? AND site_id = ? UNION ALL SELECT id FROM visitor_comments WHERE id = ? AND site_id = ?'
  ).get(body.commentId, site.id, body.commentId, site.id) as { id: string } | undefined
  if (!commentOwner) throw new HTTPException(404, { message: 'Comment not found' })

  // Reaction rate limit: 50 per visitor per hour
  const visitorKey = `react:${visitorHash}`
  const now = Date.now()
  const windowMs = 60 * 60 * 1000
  const maxRequests = 50
  const timestamps = reactionRateLimits.get(visitorKey) || []
  const recent = timestamps.filter(t => now - t < windowMs)
  if (recent.length >= maxRequests) {
    throw new HTTPException(429, { message: 'Too many reactions. Please slow down.' })
  }
  recent.push(now)
  reactionRateLimits.set(visitorKey, recent)

  const reactionType = db.select().from(reactionTypes).where(eq(reactionTypes.id, body.reaction)).get()
  if (!reactionType) {
    throw new HTTPException(400, { message: `Invalid reaction type: ${body.reaction}` })
  }
  if (!(reactionType as any).enabled) {
    throw new HTTPException(400, { message: 'This reaction type is disabled' })
  }

  const existing = raw.prepare(
    'SELECT id FROM reaction_votes WHERE comment_id = ? AND reaction_type = ? AND visitor_hash = ?',
  ).get(body.commentId, body.reaction, visitorHash) as { id: string } | undefined

  if (existing) {
    raw.prepare('DELETE FROM reaction_votes WHERE id = ?').run(existing.id)
    raw.prepare('UPDATE comment_reactions SET count = count - 1 WHERE comment_id = ? AND reaction_type = ?').run(body.commentId, body.reaction)
    fireWebhook(site.id, 'comment.reacted', { site: site.id, commentId: body.commentId, reaction: body.reaction, action: 'removed' })
    return c.json({ code: 0, data: { action: 'removed' } })
  }

  const voteId = randomUUID()
  raw.prepare('INSERT INTO reaction_votes (id, comment_id, reaction_type, visitor_hash) VALUES (?, ?, ?, ?)').run(voteId, body.commentId, body.reaction, visitorHash)

  const existingCount = raw.prepare(
    'SELECT id FROM comment_reactions WHERE comment_id = ? AND reaction_type = ?',
  ).get(body.commentId, body.reaction)

  if (existingCount) {
    raw.prepare('UPDATE comment_reactions SET count = count + 1 WHERE comment_id = ? AND reaction_type = ?').run(body.commentId, body.reaction)
  } else {
    const crId = randomUUID()
    raw.prepare('INSERT INTO comment_reactions (id, comment_id, reaction_type, count) VALUES (?, ?, ?, 1)').run(crId, body.commentId, body.reaction)
  }

  fireWebhook(site.id, 'comment.reacted', { site: site.id, commentId: body.commentId, reaction: body.reaction, action: 'added' })
  return c.json({ code: 0, data: { action: 'added' } })
})

// POST /api/widget/:domain/comment — submit a visitor comment (or edit if editId provided)
router.post('/:domain/comment', async (c) => {
  const domain = c.req.param('domain')
  const body = await c.req.json() as {
    path: string
    authorName: string
    authorEmail?: string
    authorUrl?: string
    content: string
    pin?: string
    captchaToken?: string
    parentId?: string
    visitorId?: string
    editId?: string
    notifyReplyAuthor?: boolean
  }
  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || '0.0.0.0'
  const ua = c.req.header('user-agent') || ''

  if (!body.path || !body.authorName?.trim() || !body.content?.trim()) {
    throw new HTTPException(400, { message: 'path, authorName, and content are required' })
  }

  const db = getDb()
  const site = db.select().from(sites).where(eq(sites.domain, domain)).get() as any
  if (!site) throw new HTTPException(404, { message: 'Site not found' })
  assertWidgetOrigin(c, (site as any).domain)

  const submitPlugin = ((site as any).settings?.commentPlugin as string) || ''

  // CAPTCHA verification if enabled by the active plugin (skip for edits)
  if (!body.editId && submitPlugin) {
    const raw = getRawDb() as import('better-sqlite3').Database
    const pluginRow = raw.prepare("SELECT settings FROM plugins WHERE name = ?").get(submitPlugin) as any
    if (pluginRow) {
      const settings = typeof pluginRow.settings === 'string' ? JSON.parse(pluginRow.settings) : (pluginRow.settings || {})
      if (settings.captchaEnabled) {
        if (!body.captchaToken) throw new HTTPException(400, { message: 'CAPTCHA verification required' })
        const config = raw.prepare("SELECT * FROM system_config WHERE id = 'global'").get() as any
        const provider = (config.captcha_provider as string) || 'none'
        if (provider === 'none') throw new HTTPException(400, { message: 'No CAPTCHA provider configured' })
        const ok = await verifyWidgetCaptcha(body.captchaToken, provider)
        if (!ok) throw new HTTPException(400, { message: 'CAPTCHA verification failed' })
      }
    }
  }

  const submitCtx = await runHook<SubmitContext>('onCommentSubmit', {
    siteId: site.id,
    path: body.path,
    authorName: body.authorName.trim(),
    authorEmail: (body.authorEmail || '').trim(),
    authorUrl: (body.authorUrl || '').trim(),
    content: body.content.trim(),
    ip,
    userAgent: ua,
    pin: body.pin || '',
    parentId: body.parentId || '',
    visitorId: body.visitorId || '',
    editId: body.editId || '',
    notifyReplyAuthor: !!body.notifyReplyAuthor,
  }, submitPlugin)

  if (submitCtx.result) {
    if (submitCtx.result.id && !submitCtx.result.error && !submitCtx.result.requirePin && !submitCtx.result.pinError) {
      const raw = getRawDb() as import('better-sqlite3').Database
      const pluginRow = raw.prepare("SELECT settings FROM plugins WHERE name = ?").get(submitPlugin) as any
      const settings = pluginRow ? (typeof pluginRow.settings === 'string' ? JSON.parse(pluginRow.settings) : (pluginRow.settings || {})) : {}
      const editWindow = parseInt(settings.edit_window_minutes || '3', 10)
      const token = jwt.sign(
        { commentId: submitCtx.result.id, visitorId: body.visitorId },
        getJwtSecret(),
        { expiresIn: `${editWindow}m` }
      )
      submitCtx.result.editToken = token
    }
    return c.json({ code: 0, data: submitCtx.result })
  }

  throw new HTTPException(501, { message: 'No comment plugin is active to handle this submission' })
})

// PUT /:domain/comment/:id — edit a visitor comment (within time window)
router.put('/:domain/comment/:id', async (c) => {
  const domain = c.req.param('domain')
  const id = c.req.param('id')
  const body = await c.req.json() as { content: string; editToken?: string; visitorId?: string }
  const raw = getRawDb() as import('better-sqlite3').Database
  const site = getDb().select().from(sites).where(eq(sites.domain, domain)).get() as any
  if (!site) throw new HTTPException(404, { message: 'Site not found' })
  assertWidgetOrigin(c, (site as any).domain)

  const comment = raw.prepare("SELECT * FROM visitor_comments WHERE id = ? AND site_id = ?").get(id, site.id) as any
  if (!comment) throw new HTTPException(404, { message: 'Comment not found' })

  // Verify editToken
  if (!body.editToken) {
    throw new HTTPException(403, { message: '缺少编辑凭证' })
  }
  try {
    const payload = jwt.verify(body.editToken, getJwtSecret()) as { commentId: string; visitorId: string }
    if (payload.commentId !== id) {
      throw new HTTPException(403, { message: '编辑凭证不匹配' })
    }
    if (comment.visitor_id && comment.visitor_id !== payload.visitorId) {
      throw new HTTPException(403, { message: '无权编辑此评论' })
    }
  } catch {
    throw new HTTPException(403, { message: '编辑凭证无效或已过期' })
  }

  // Check time window
  const pluginName = ((site as any).settings?.commentPlugin as string) || ''
  const pluginRow = raw.prepare("SELECT settings FROM plugins WHERE name = ?").get(pluginName) as any
  const settings = pluginRow ? (typeof pluginRow.settings === 'string' ? JSON.parse(pluginRow.settings) : (pluginRow.settings || {})) : {}
  const editWindow = parseInt(settings.edit_window_minutes || '3', 10)
  const createdTime = new Date(comment.created_at).getTime()
  if (Date.now() - createdTime > editWindow * 60 * 1000) {
    throw new HTTPException(403, { message: `评论提交超过 ${editWindow} 分钟，无法编辑` })
  }

  raw.prepare("UPDATE visitor_comments SET content = ?, edited_at = ? WHERE id = ?").run(body.content, new Date().toISOString(), id)
  return c.json({ code: 0, data: { id, edited: true } })
})

// DELETE /:domain/comment/:id — delete a visitor comment (PIN required)
router.delete('/:domain/comment/:id', async (c) => {
  const domain = c.req.param('domain')
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => ({})) as { pin?: string }
  const raw = getRawDb() as import('better-sqlite3').Database
  const site = getDb().select().from(sites).where(eq(sites.domain, domain)).get() as any
  if (!site) throw new HTTPException(404, { message: 'Site not found' })
  assertWidgetOrigin(c, (site as any).domain)

  const pluginName = ((site as any).settings?.commentPlugin as string) || ''
  if (!pluginName) throw new HTTPException(400, { message: 'No comment plugin active' })

  const pluginRow = raw.prepare("SELECT settings FROM plugins WHERE name = ?").get(pluginName) as any
  if (!pluginRow) throw new HTTPException(400, { message: 'Plugin not found' })

  const settings = typeof pluginRow.settings === 'string' ? JSON.parse(pluginRow.settings) : (pluginRow.settings || {})
  const adminPin = settings.adminPin || ''
  if (!adminPin) throw new HTTPException(403, { message: 'Admin PIN not configured' })
  if (body.pin !== adminPin) throw new HTTPException(403, { message: 'Invalid admin PIN' })

  const comment = raw.prepare("SELECT * FROM visitor_comments WHERE id = ? AND site_id = ?").get(id, site.id) as any
  if (!comment) throw new HTTPException(404, { message: 'Comment not found' })

  raw.prepare("DELETE FROM visitor_comments WHERE id = ?").run(id)
  return c.json({ code: 0, message: 'Comment deleted' })
})

// POST /:domain/comment/:id/request-delete — request email verification code to delete own comment
router.post('/:domain/comment/:id/request-delete', async (c) => {
  const domain = c.req.param('domain')
  const id = c.req.param('id')
  const body = await c.req.json() as { email: string }
  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || '0.0.0.0'
  const raw = getRawDb() as import('better-sqlite3').Database
  const site = getDb().select().from(sites).where(eq(sites.domain, domain)).get() as any
  if (!site) throw new HTTPException(404, { message: 'Site not found' })
  assertWidgetOrigin(c, (site as any).domain)

  if (!body.email) throw new HTTPException(400, { message: 'Email is required' })

  const comment = raw.prepare("SELECT * FROM visitor_comments WHERE id = ? AND site_id = ?").get(id, site.id) as any
  if (!comment) throw new HTTPException(404, { message: '评论不存在' })

  // Verify email matches comment author
  if (comment.author_email?.toLowerCase() !== body.email.toLowerCase()) {
    throw new HTTPException(403, { message: '邮箱与评论作者不匹配' })
  }

  // Rate limit: max 5 requests per email per 24 hours
  const dayCount = raw.prepare(
    "SELECT COUNT(*) AS cnt FROM verification_codes WHERE email = ? AND purpose = 'delete_comment' AND created_at > ?"
  ).get(body.email.toLowerCase(), new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) as { cnt: number } | undefined
  if (dayCount && dayCount.cnt >= 5) {
    throw new HTTPException(429, { message: '该邮箱今日已使用 5 次删除验证，请 24 小时后再试' })
  }

  // Rate limit: 120s cooldown per email
  const recent = raw.prepare(
    "SELECT id FROM verification_codes WHERE email = ? AND purpose = 'delete_comment' AND created_at > ?"
  ).get(body.email.toLowerCase(), new Date(Date.now() - 120000).toISOString()) as any
  if (recent) {
    throw new HTTPException(429, { message: '验证码已发送，请 120 秒后再试' })
  }

  // Generate verification code (6-char uppercase hex)
  const code = createHash('sha256').update(randomUUID() + Date.now()).digest('hex').slice(0, 6).toUpperCase()
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString()
  const codeId = randomUUID()

  const adminUrl = process.env.ADMIN_URL || (() => {
    try {
      const reqUrl = new URL(c.req.url)
      const proto = c.req.header('x-forwarded-proto') ? `${c.req.header('x-forwarded-proto')}:` : reqUrl.protocol
      return `${proto}//${reqUrl.host}`
    } catch { return '' }
  })()
  const locale = c.req.query('locale') || 'en'
  const unsubscribeText = locale?.startsWith('zh') ? 'Unsubscribe（取消订阅）' : 'Unsubscribe'

  // Send email with code FIRST, then store in DB
  try {
    const { renderEmail, getEmailSubject, getEmailLocale } = await import('../email-templates/index.js')
    const emailLocale = getEmailLocale(raw)
    const unsubscribeUrl = buildUnsubscribeUrl(adminUrl, body.email.toLowerCase(), site.id, emailLocale)
    const emailHtml = renderEmail({
      template: 'delete-code',
      title: getEmailSubject('delete-code', emailLocale),
      locale: emailLocale,
      data: {
        prompt: emailLocale === 'zh' ? '您的评论删除验证码为：' : 'Your verification code to delete comment:',
        code,
        expiryHint: emailLocale === 'zh' ? '验证码有效期为 30 分钟。' : 'The code expires in 30 minutes.',
      },
      unsubscribeUrl,
      unsubscribeText: emailLocale === 'zh' ? '取消订阅' : 'Unsubscribe',
    })
    const pluginName = ((site as any).settings?.commentPlugin as string) || ''
    const pluginRow = raw.prepare("SELECT settings FROM plugins WHERE name = ?").get(pluginName) as any
    const pSettings = pluginRow ? (typeof pluginRow.settings === 'string' ? JSON.parse(pluginRow.settings) : (pluginRow.settings || {})) : {}
    const smtpMode = pSettings.smtp_mode || 'global'
const usePluginSmtp = smtpMode === 'custom' && !!(pSettings.smtp_host && pSettings.smtp_user && pSettings.smtp_pass)

      // Verify SMTP is configured before attempting to send
      if (!usePluginSmtp) {
        const globalConfig = raw.prepare("SELECT smtp_host FROM system_config WHERE id = 'global'").get() as { smtp_host: string | null } | undefined
        if (!globalConfig?.smtp_host) {
          throw new HTTPException(400, { message: 'SMTP 未配置，无法发送验证码邮件，请联系管理员配置 SMTP' })
        }
      }

    if (usePluginSmtp) {
      const nodemailer = await import('nodemailer')
      const transporter = nodemailer.default.createTransport({
        host: pSettings.smtp_host,
        port: parseInt(pSettings.smtp_port || '587', 10),
        secure: parseInt(pSettings.smtp_port || '587', 10) === 465,
        auth: {
          user: pSettings.smtp_user || '',
          pass: pSettings.smtp_pass || '',
        },
      })
      transporter.sendMail({
        from: `"${pSettings.smtp_from_name || 'AIGCS Notify'}" <${pSettings.smtp_from_email || 'noreply@aigcs.local'}>`,
        to: body.email,
        subject: '验证码 - 删除评论',
        html: emailHtml,
      }).catch(err => {
        console.error('[widget] Failed to send delete verification email via plugin SMTP:', err)
      })
    } else {
      import('../services/email.js').then(({ sendEmail }) => {
        sendEmail(body.email, '验证码 - 删除评论', emailHtml).catch(err => {
          console.error('[widget] Failed to send delete verification email:', err)
        })
      })
    }
  } catch (err) {
    console.error('[widget] Failed to send verification email:', err)
    throw new HTTPException(500, { message: '验证码邮件发送失败' })
  }

  raw.prepare(
    'INSERT INTO verification_codes (id, email, code, purpose, target_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(codeId, body.email.toLowerCase(), code, 'delete_comment', id, expiresAt, new Date().toISOString())

  return c.json({ code: 0, message: '验证码已发送到您的邮箱' })
})

// POST /:domain/comment/:id/verify-delete — verify code and delete comment
router.post('/:domain/comment/:id/verify-delete', async (c) => {
  const domain = c.req.param('domain')
  const id = c.req.param('id')
  const body = await c.req.json() as { email: string; code: string }
  const raw = getRawDb() as import('better-sqlite3').Database
  const site = getDb().select().from(sites).where(eq(sites.domain, domain)).get() as any
  if (!site) throw new HTTPException(404, { message: 'Site not found' })
  assertWidgetOrigin(c, (site as any).domain)

  if (!body.email || !body.code) {
    throw new HTTPException(400, { message: 'Email and code are required' })
  }

  // Find valid code
  const record = raw.prepare(
    "SELECT * FROM verification_codes WHERE email = ? AND target_id = ? AND purpose = 'delete_comment' AND expires_at > ? ORDER BY created_at DESC LIMIT 1"
  ).get(body.email.toLowerCase(), id, new Date().toISOString()) as any

  if (!record) {
    throw new HTTPException(400, { message: '验证码无效或已过期' })
  }

  if (record.code !== body.code.toUpperCase()) {
    // Consume the code on wrong attempt to prevent brute force
    raw.prepare("UPDATE verification_codes SET expires_at = ? WHERE id = ?").run(new Date(0).toISOString(), record.id)
    throw new HTTPException(403, { message: '验证码错误' })
  }

  // Verify the comment exists
  const comment = raw.prepare("SELECT * FROM visitor_comments WHERE id = ? AND site_id = ?").get(id, site.id) as any
  if (!comment) {
    throw new HTTPException(404, { message: '评论不存在' })
  }

  // Soft delete the comment (keep row to avoid breaking children trees, clean up personal data)
  raw.prepare(`
    UPDATE visitor_comments 
    SET content = '此评论已被作者删除', 
        author_name = '已删除', 
        author_email = '', 
        author_url = '', 
        edited_at = ? 
    WHERE id = ?
  `).run(new Date().toISOString(), id)

  // Consume the code
  raw.prepare("UPDATE verification_codes SET expires_at = ? WHERE id = ?").run(new Date(0).toISOString(), record.id)

  return c.json({ code: 0, message: '评论已删除' })
})

async function verifyWidgetCaptcha(token: string, provider: string): Promise<boolean> {
  const raw = getRawDb() as import('better-sqlite3').Database
  const config = raw.prepare("SELECT * FROM system_config WHERE id = 'global'").get() as any
  if (provider === 'turnstile') {
    const secret = (config.turnstile_secret_key as string) || ''
    if (!secret) return false
      try {
        const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ secret, response: token }),
        })
        const data = await res.json() as { success?: boolean }
        return !!data.success
      } catch { return false }
  }
  if (provider === 'recaptcha') {
    const secret = (config.recaptcha_secret_key as string) || ''
    if (!secret) return false
    const params = new URLSearchParams({ secret, response: token })
      try {
        const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params,
        })
        const data = await res.json() as { success?: boolean }
        return !!data.success
      } catch { return false }
  }
  if (provider === 'cap') {
    const secret = (config.cap_secret_key as string) || ''
    if (!secret) return false
    const verifyUrl = (config.cap_verify_url as string) || 'https://verify.cap.so/api/verify'
      try {
        const res = await fetch(verifyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ secret, token }),
        })
        const data = await res.json() as { success?: boolean }
        return !!data.success
      } catch { return false }
  }
  if (provider === 'altcha') {
    const secret = (config.altcha_secret_key as string) || ''
    if (!secret) return false
    // Altcha local HMAC verification
    try {
      const payload = JSON.parse(Buffer.from(token, 'base64').toString())
      if (!payload.challenge || !payload.salt || !payload.number || !payload.signature) return false
      const expected = createHmac('sha256', secret).update(payload.challenge + payload.salt + payload.number).digest('hex')
      return expected === payload.signature
    } catch { return false }
  }
  if (provider === 'hcaptcha') {
    const secret = (config.hcaptcha_secret_key as string) || ''
    if (!secret) return false
    const params = new URLSearchParams({ secret, response: token })
      try {
        const res = await fetch('https://hcaptcha.com/siteverify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params,
        })
        const data = await res.json() as { success?: boolean }
        return !!data.success
      } catch { return false }
  }
  return false
}

async function generateComments(siteId: string, path: string, siteDomain?: string, overrideContent?: string, overrideTitle?: string, options?: { providerIds?: string[]; userSelector?: string }): Promise<{ success: number; total: number; errors: string[] }> {
  const db = getDb()
  const raw = getRawDb() as import('better-sqlite3').Database

  let providerList = db
    .select()
    .from(providers)
    .where(and(eq(providers.siteId, siteId), eq(providers.enabled, 1 as any)))
    .all()

  if (options?.providerIds && options.providerIds.length > 0) {
    providerList = (providerList as any[]).filter((p) => options?.providerIds?.includes(p.id))
  }

  if (providerList.length === 0) return { success: 0, total: 0, errors: ['No enabled providers configured'] }

  providerList.sort((a: any, b: any) => a.sortWeight - b.sortWeight)
  const cacheHash = md5(`${siteId}:${path}`)

  // Fetch page content for AI context
  let pageContent = '(page content could not be fetched)'
  let pageTitle = path
  let emptyContent = true

  if (overrideContent) {
    pageContent = overrideContent
    emptyContent = !overrideContent.trim()
  }
  if (overrideTitle) {
    pageTitle = overrideTitle
  }

  if (siteDomain && !overrideContent) {
    try {
      const isLocal = /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0)/.test(siteDomain)
      const proto = isLocal ? 'http' : 'https'
      const pageUrl = `${proto}://${siteDomain}${path}`
      const pageRes = await fetch(pageUrl, {
        signal: AbortSignal.timeout(10000),
        headers: { 'User-Agent': 'AIGCS/1.0 Comment Bot' },
      })
      if (pageRes.ok) {
        const html = await pageRes.text()
        pageTitle = extractPageTitle(html) || path

        const site = db.select().from(sites).where(eq(sites.domain, siteDomain)).get() as any
        const siteSel = site?.settings?.contentSelector as string | undefined
        pageContent = extractPageContent(html, {
          userSelector: options?.userSelector,
          siteSelectors: siteSel,
        })

        if (pageContent) emptyContent = false
      }
    } catch (err) {
      console.error('[widget] Failed to fetch page content:', err)
    }
  }

  const results = await Promise.allSettled(
    providerList.map(async (provider: any) => {
      const { getProvider } = await import('../providers/index.js')
      const providerImpl = getProvider((provider as any).name)
      if (!providerImpl) return

      let systemPrompt: string | undefined

      const globalCfg = raw.prepare("SELECT global_system_prompt FROM system_config WHERE id = 'global'").get() as { global_system_prompt: string | null } | undefined
      const globalPrompt = globalCfg?.global_system_prompt || ''

      let templatePrompt = ''
      if ((provider as any).promptTemplateId) {
        const tmpl = raw.prepare('SELECT content FROM prompt_templates WHERE id = ?').get((provider as any).promptTemplateId) as { content: string } | undefined
        if (tmpl) templatePrompt = tmpl.content
      }

      systemPrompt = [globalPrompt, templatePrompt].filter(Boolean).join('\n\n') || undefined

      const hookCtx = await runHook('beforeGenerate', {
        siteId,
        path,
        pageTitle,
        pageContent,
        providerName: (provider as any).displayName,
        model: (provider as any).model,
        systemPrompt,
      })
      pageTitle = hookCtx.pageTitle || pageTitle
      pageContent = hookCtx.pageContent || pageContent
      systemPrompt = hookCtx.systemPrompt || systemPrompt

      const result = await providerImpl.generate({
        pageTitle,
        pageContent,
        pageUrl: path,
        model: (provider as any).model,
        apiKey: decrypt((provider as any).apiKey),
        apiEndpoint: (provider as any).apiEndpoint,
        systemPrompt,
        extraParams: (provider as any).extraParams as Record<string, unknown>,
      })

      const commentId = randomUUID()
      const cleanContent = purify.sanitize(result.content, {
        ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'b', 'i', 'a', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
        ALLOWED_ATTR: ['href', 'target', 'rel'],
      })
      const contentMd5 = md5(cleanContent)
      const writeTx = raw.transaction(() => {
        raw.prepare('DELETE FROM comments WHERE site_id = ? AND path = ? AND provider_name = ?').run(siteId, path, (provider as any).displayName)
        db.insert(comments).values({
          id: commentId,
          siteId,
          path,
          providerName: (provider as any).displayName,
          model: result.model,
          authorName: (provider as any).displayName,
          authorAvatar: emptyContent ? '#empty-content' : '',
          content: cleanContent,
          contentMd5,
          generatedAt: new Date().toISOString(),
        }).run()

        const defaultReactions = raw.prepare("SELECT id FROM reaction_types WHERE is_system = 1 AND enabled = 1").all() as Array<{ id: string }>
        const insertReaction = raw.prepare('INSERT OR IGNORE INTO comment_reactions (id, comment_id, reaction_type, count) VALUES (?, ?, ?, 0)')
        for (const rt of defaultReactions) {
          insertReaction.run(randomUUID(), commentId, rt.id)
        }
      })

      writeTx()

      await runHook('afterGenerate', {
        siteId,
        path,
        providerName: (provider as any).displayName,
        model: result.model,
        commentContent: cleanContent,
        commentId,
      })
    })
  )

  const providerErrors: string[] = []
  let providerSuccess = 0
  for (const result of results) {
    if (result.status === 'rejected') {
      console.error('[generation] Provider failed:', result.reason)
      providerErrors.push(String(result.reason))
    } else {
      providerSuccess++
    }
  }

  const etag = md5(`${siteId}:${path}:${Date.now()}`)
  const allFailed = providerSuccess === 0
  const hasComments = !allFailed || (raw.prepare('SELECT COUNT(*) as cnt FROM comments WHERE site_id = ? AND path = ?').get(siteId, path) as any)?.cnt > 0
  db.update(pageCache).set({
    status: hasComments ? 'ready' : 'failed',
    etag,
    title: pageTitle,
    error: allFailed ? providerErrors.join('; ') : null,
    generatedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }).where(eq(pageCache.id, cacheHash)).run()

  await runHook('pageReady', { siteId, path })

  // Send email notification (optional, controlled by site settings)
  try {
    const site = db.select().from(sites).where(eq(sites.id, siteId)).get() as any
    const siteSettings = (site as any)?.settings || {}
    if (site && siteSettings.emailNotifyComments) {
      const { sendEmail } = await import('../services/email.js')
      const { renderEmail, getEmailSubject, getEmailLocale } = await import('../email-templates/index.js')
      const user = db.select().from(users).where(eq(users.id, site.userId)).get() as any
      if (user?.email && !isUnsubscribed(raw, user.email, siteId)) {
        const adminUrl = resolveAdminUrl(process.env.ADMIN_URL, site.domain)
        const emailLocale = getEmailLocale(raw)
        const templateData = { path, domain: site.domain }
        let body: string | undefined
        if (siteSettings.commentGeneratedTemplate) {
          const Handlebars = (await import('handlebars')).default
          body = Handlebars.compile(siteSettings.commentGeneratedTemplate)(templateData)
        }
        const unsubscribeUrl = buildUnsubscribeUrl(adminUrl, user.email, siteId, emailLocale)
        const unsubscribeText = emailLocale === 'zh' ? '取消订阅' : 'Unsubscribe'
        sendEmail(
          user.email,
          getEmailSubject('comment-generated', emailLocale),
          renderEmail({
            template: body ? undefined : 'comment-generated',
            body,
            locale: emailLocale,
            title: getEmailSubject('comment-generated', emailLocale),
            data: templateData,
            adminUrl,
            unsubscribeUrl,
            unsubscribeText,
          }),
        ).catch(err => console.error('[email] Failed to send comment-generated email:', err))
      }
    }
  } catch (err) {
    console.error('[email] Failed to send notification:', err)
  }

  // Fire webhook
  try {
    const { fireWebhook } = await import('../services/webhook.js')
    fireWebhook(siteId, 'comment.generated', { path })
  } catch (err) {
    console.error('[webhook] Failed to fire:', err)
  }

  return { success: providerSuccess, total: results.length, errors: providerErrors }
}

// ── Ping Webhook Receiver ──
// External systems can POST here to trigger actions via a secret token.
// Optional ?slug=xxx to target a specific page path (e.g. /blog/my-post).

router.post('/:domain/ping/:type/:token', async (c) => {
  const domain = c.req.param('domain')
  const type = c.req.param('type')
  const token = c.req.param('token')
  const slug = c.req.query('slug')

  if (type !== 'rss' && type !== 'cache') {
    throw new HTTPException(400, { message: 'Invalid ping type. Use "rss" or "cache".' })
  }

  const db = getDb()
  const site = db.select().from(sites).where(eq(sites.domain, domain)).get() as any
  if (!site) throw new HTTPException(404, { message: 'Site not found' })
  assertWidgetOrigin(c, (site as any).domain)

  const settings = (site.settings || {}) as any
  const ping = settings.ping?.[type]

  if (!ping?.enabled || ping?.token !== token) {
    throw new HTTPException(403, { message: 'Invalid or disabled ping token' })
  }

  if (type === 'rss') {
    const rss = settings.rss as { url?: string; auto_generate?: boolean } | undefined
    if (!rss?.url) throw new HTTPException(400, { message: 'RSS not configured for this site' })

    const body = await c.req.json().catch(() => ({})) as { url?: string }
    let imported = 0
    let total = 0

    if (slug) {
      // Fetch RSS feed and import only the entry matching the slug
      const { parseRssFeed, importRssEntries } = await import('../services/rss-cron.js')
      const response = await fetch(rss.url)
      if (!response.ok) throw new HTTPException(400, { message: `Failed to fetch RSS: ${response.status}` })
      const xml = await response.text()
      const allEntries = parseRssFeed(xml)
      const match = allEntries.find((e: any) => e.link?.includes(slug))
      if (!match) return c.json({ success: true, imported: 0, total: 0, note: 'No matching entry found' })
      const result = importRssEntries(site.id, [match])
      imported = result.imported
      total = 1
    } else if (body.url) {
      const { importRssEntries } = await import('../services/rss-cron.js')
      const result = importRssEntries(site.id, [{ title: '', link: body.url }])
      imported = result.imported
      total = result.total
    } else {
      try {
        const response = await fetch(rss.url)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const xml = await response.text()
        const { parseRssFeed, importRssEntries } = await import('../services/rss-cron.js')
        const entries = parseRssFeed(xml)
        total = entries.length
        const result = importRssEntries(site.id, entries)
        imported = result.imported

        const now = new Date().toISOString()
        db.update(sites).set({ settings: { ...settings, rss: { ...rss, last_fetched_at: now } } }).where(eq(sites.id, site.id)).run()
      } catch (err: any) {
        throw new HTTPException(500, { message: err.message })
      }
    }

    return c.json({ success: true, imported, total })
  }

  if (type === 'cache') {
    try {
      const { extractPageContent, extractPageTitle } = await import('../lib/extract-content.js')

      let cacheEntries: any[] = []
      if (slug) {
        const entry = db.select({ path: pageCache.path }).from(pageCache).where(and(eq(pageCache.siteId, site.id), eq(pageCache.path, slug))).get() as any
        if (entry) cacheEntries = [entry]
      } else {
        cacheEntries = db.select({ path: pageCache.path }).from(pageCache).where(eq(pageCache.siteId, site.id)).all() as any[]
      }

      let warmed = 0

      await Promise.allSettled(cacheEntries.map(async (entry: any) => {
        const pageUrl = `https://${domain}${entry.path}`
        const resp = await fetch(pageUrl)
        if (!resp.ok) return
        const html = await resp.text()
        const content = extractPageContent(html)
        const title = extractPageTitle(html)
        db.update(pageCache).set({
          content, title,
          status: 'ready',
          generatedAt: new Date().toISOString(),
        }).where(and(eq(pageCache.siteId, site.id), eq(pageCache.path, entry.path))).run()
        warmed++
      }))

      return c.json({ success: true, warmed })
    } catch (err: any) {
      throw new HTTPException(500, { message: err.message })
    }
  }

  return c.json({ success: true })
})

export { generateComments }
export { router as widgetRouter }
