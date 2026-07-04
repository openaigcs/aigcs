import type { Plugin } from '@aigcs/core'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { nanoid } from 'nanoid'
import { eq, and } from 'drizzle-orm'
import { getAdapter, extractAcct } from './adapters.js'
import { mastodonBindings, mastodonCachedComments, sites, pageCache } from '@aigcs/core'

let _rawDb: any = null

async function detectSoftware(instanceUrl: string): Promise<string> {
  try {
    const res = await fetch(`${instanceUrl}/api/v1/instance`, { signal: AbortSignal.timeout(10000) })
    if (res.ok) {
      const data = await res.json() as any
      const version = (data.version || '').toLowerCase()
      const nodeName = data?.metadata?.nodeName || ''
      if (nodeName === 'GoToSocial') return 'gotosocial'
      if (nodeName === 'Friendica' || version.includes('friendica')) return 'friendica'
      if (version.includes('pleroma')) return 'pleroma'
      if (version.includes('akkoma')) return 'akkoma'
    }
  } catch {}
  return ''
}

interface PendingOAuth {
  siteId: string
  instanceType: string
  instanceUrl: string
  clientId?: string
  clientSecret?: string
  redirectUri?: string
  state: string
  appSecret?: string
  createdAt: number
}

const pendingOAuth = new Map<string, PendingOAuth>()

const plugin: Plugin = {
  name: 'mastodon',
  displayName: { zh: '联邦评论', en: 'Fediverse Comments' },
  version: '1.0.0',
  description: '从 Mastodon/GoToSocial 等联邦实例拉取评论',
  commentHandler: 'none',
  hooks: {
    onServerInit: async (ctx) => {
      _rawDb = ctx.rawDb
      const router = new Hono()

      function requireSite(c: any, siteId: string) {
        const user = c.get('user') as { id: string } | undefined
        if (!user) throw new HTTPException(401, { message: 'Authentication required' })
        const db = getDb()
        const site = db.select().from(sites).where(and(eq(sites.id, siteId), eq(sites.userId, user.id))).get()
        if (!site) throw new HTTPException(404, { message: 'Site not found' })
        return site
      }

      // Cleanup expired sessions every 10 minutes
      setInterval(() => {
        const now = Date.now()
        for (const [key, s] of pendingOAuth) {
          if (now - s.createdAt > 10 * 60 * 1000) pendingOAuth.delete(key)
        }
      }, 10 * 60 * 1000)

      function getDb() {
        return ctx.db
      }

      async function fetchFedi(url: string, headers: Record<string, string>, timeoutMs = 10000): Promise<any> {
        const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) })
        if (!res.ok) throw new Error(`Fedi API error: ${res.status} ${res.statusText}`)
        return res.json()
      }

      // GET /api/admin/sites/:siteId/mastodon/bindings
      router.get('/api/admin/sites/:siteId/mastodon/bindings', async (c) => {
        const { siteId } = c.req.param()
        requireSite(c, siteId)
        const db = getDb()
        const filterQ = c.req.query('q') || ''
        let query = db.select().from(mastodonBindings).where(eq(mastodonBindings.siteId, siteId)) as any
        if (filterQ) {
          const keywords = filterQ.split(/\s+/).filter(Boolean)
          for (const kw of keywords) {
            query = query.where(sql`(${mastodonBindings.slug} LIKE '%' || ${kw} || '%' OR ${mastodonBindings.statusId} LIKE '%' || ${kw} || '%' OR ${mastodonBindings.fediAuthor} LIKE '%' || ${kw} || '%')`)
          }
        }
        const rows = query.all() as any[]
        const safe = rows.map((r: any) => {
          const { accessToken, ...rest } = r
          return rest
        })
        return c.json({ code: 0, data: safe })
      })

      // POST /api/admin/sites/:siteId/mastodon/bindings
      router.post(
        '/api/admin/sites/:siteId/mastodon/bindings',
        zValidator(
          'json',
          z.object({
            slug: z.string().min(1),
            instanceType: z.string().default('mastodon'),
            instanceUrl: z.string().min(1),
            statusId: z.string().min(1),
            accessToken: z.string().default(''),
            fediAuthor: z.string().default(''),
            autoFetch: z.boolean().default(false),
            cacheTtl: z.number().int().default(30),
          }),
        ),
        async (c) => {
          const { siteId } = c.req.param()
        requireSite(c, siteId)
          const body = await c.req.valid('json')
          const db = getDb()
          const now = new Date().toISOString()
          const id = nanoid()

          let token = body.accessToken
          let software = ''
          let fediAuthor = ''
          if (!token) {
            const site = db.select().from(sites).where(eq(sites.id, siteId)).get() as any
            if (site) {
              const settings = typeof site.settings === 'string' ? JSON.parse(site.settings) : (site.settings || {})
              token = settings.fediConfig?.accessToken || ''
              software = settings.fediConfig?.software || ''
              fediAuthor = settings.fediConfig?.fediAuthor || settings.fediConfig?.fedAdminAcct || ''
            }
          }

          if (!token) throw new HTTPException(401, { message: 'Instance not authorized. Please complete OAuth first.' })

          // Detect software if not known
          if (!software && body.instanceUrl) {
            try { software = await detectSoftware(body.instanceUrl) } catch {}
          }

          const adapter = getAdapter(body.instanceType, software)
          const resolvedId = adapter.resolveStatusId(body.instanceUrl, body.statusId)

          // Verify the status exists and belongs to the authorized account
          try {
            const headers: Record<string, string> = { Accept: 'application/json' }
            Object.assign(headers, adapter.authHeader(token))
            const statusRes = await fetchFedi(adapter.statusUrl(body.instanceUrl, resolvedId), headers)
            const authorAcct = adapter.parseAccount(statusRes).acct
            const domain = fediAuthor.includes('@') ? fediAuthor.split('@')[1] : body.instanceUrl.replace(/^https?:\/\//, '')
            const fullAcct = authorAcct.includes('@') ? authorAcct : `${authorAcct}@${domain}`
            if (fullAcct !== fediAuthor) throw new HTTPException(403, { message: `Status author ${fullAcct} does not match authorized account ${fediAuthor}` })
          } catch (err: any) {
            if (err instanceof HTTPException) throw err
            throw new HTTPException(502, { message: `Failed to verify status: ${err.message}` })
          }

          // One-to-one: check for duplicate slug or statusId
          const existingSlug = db.select().from(mastodonBindings)
            .where(and(eq(mastodonBindings.siteId, siteId), eq(mastodonBindings.slug, body.slug)))
            .get()
          if (existingSlug) throw new HTTPException(409, { message: `Slug "${body.slug}" already bound to a status` })

          const existingStatus = db.select().from(mastodonBindings)
            .where(and(eq(mastodonBindings.siteId, siteId), eq(mastodonBindings.statusId, resolvedId)))
            .get()
          if (existingStatus) throw new HTTPException(409, { message: `Status "${body.statusId}" already bound to another page` })

          db.insert(mastodonBindings)
            .values({
              id,
              siteId,
              slug: body.slug,
              instanceType: body.instanceType,
              instanceUrl: body.instanceUrl,
              statusId: resolvedId,
              software,
              fediAuthor: body.fediAuthor,
              autoFetch: body.autoFetch ? 1 : 0,
              cacheTtl: body.cacheTtl,
              createdAt: now,
              updatedAt: now,
            })
            .run()
          const row = db.select().from(mastodonBindings).where(eq(mastodonBindings.id, id)).get() as any
          const { accessToken: _at1, ...safe } = row
          return c.json({ code: 0, data: safe })
        },
      )

      // POST /api/admin/sites/:siteId/mastodon/bindings/import
      router.post(
        '/api/admin/sites/:siteId/mastodon/bindings/import',
        zValidator(
          'json',
          z.object({
            items: z.array(
              z.object({
                slug: z.string().min(1),
                instanceType: z.string().default('mastodon'),
instanceUrl: z.string().optional(),
                statusId: z.string().optional(),
                statusUrl: z.string().optional(),
                accessToken: z.string().default(''),
                fediAuthor: z.string().default(''),
                autoFetch: z.boolean().default(false),
                cacheTtl: z.number().int().default(30),
              }).refine(d => d.statusId || d.statusUrl, { message: 'statusId or statusUrl required' }),
            ).min(1).max(10000),
          }),
        ),
        async (c) => {
          const { siteId } = c.req.param()
          requireSite(c, siteId)
          const { items } = await c.req.valid('json')
          const db = getDb()
          const now = new Date().toISOString()
          const failed: { item: any; error: string }[] = []
          let successCount = 0

          // Get site's mastodon config for defaults
          const siteRow = db.select().from(sites).where(eq(sites.id, siteId)).get() as any
          const fediConfig = siteRow?.settings?.fediConfig || {}
          const defaultInstanceUrl = fediConfig.instanceUrl || ''

          for (const item of items) {
            const rawStatusId = item.statusId || item.statusUrl || ''
            const instanceUrl = (item.instanceUrl || defaultInstanceUrl).replace(/\/+$/, '')
            const slug = item.slug.replace(/^\/+|\/+$/g, '')
            if (!rawStatusId) {
              failed.push({ item, error: 'statusId or statusUrl is required' })
              continue
            }
            if (!instanceUrl) {
              failed.push({ item, error: 'instanceUrl is required' })
              continue
            }
            const adapter = getAdapter(item.instanceType)
            const statusId = adapter.resolveStatusId(instanceUrl, rawStatusId)
            const id = nanoid()
            try {
              const existing = db.select().from(mastodonBindings)
                .where(and(eq(mastodonBindings.siteId, siteId), eq(mastodonBindings.slug, slug)))
                .get()
              if (existing) {
                failed.push({ item, error: `slug "${slug}" already bound` })
                continue
              }
              const dupStatus = db.select().from(mastodonBindings)
                .where(and(eq(mastodonBindings.siteId, siteId), eq(mastodonBindings.statusId, statusId)))
                .get()
              if (dupStatus) {
                failed.push({ item, error: `statusId "${statusId}" already bound to another page` })
                continue
              }
              db.insert(mastodonBindings).values({
                id,
                siteId,
                slug,
                instanceType: item.instanceType,
                instanceUrl,
                statusId,
                accessToken: item.accessToken,
                fediAuthor: item.fediAuthor,
                autoFetch: item.autoFetch ? 1 : 0,
                cacheTtl: item.cacheTtl,
                createdAt: now,
                updatedAt: now,
              }).run()
              // Create cache entry if not exists so it appears in the bindings table
              const existingCache = db.select().from(pageCache).where(and(eq(pageCache.siteId, siteId), eq(pageCache.path, `/` + slug + `/`))).get()
              if (!existingCache) {
                db.insert(pageCache).values({
                  id: nanoid(),
                  siteId,
                  path: `/` + slug + `/`,
                  title: slug,
                  status: 'ready',
                  etag: '',
                }).run()
              }
              successCount++
            } catch (err: any) {
              failed.push({ item, error: err.message || 'Unknown error' })
            }
          }

          return c.json({ code: 0, data: { success: successCount, failed: failed.length, total: items.length, failedDetails: failed } })
        },
      )

      // PUT /api/admin/sites/:siteId/mastodon/bindings/:id
      router.put(
        '/api/admin/sites/:siteId/mastodon/bindings/:id',
        zValidator(
          'json',
          z.object({
            slug: z.string().optional(),
            instanceType: z.string().optional(),
            instanceUrl: z.string().optional(),
            statusId: z.string().optional(),
            accessToken: z.string().optional(),
            fediAuthor: z.string().optional(),
            autoFetch: z.boolean().optional(),
            cacheTtl: z.number().int().optional(),
          }),
        ),
        async (c) => {
          const { id } = c.req.param()
          const body = await c.req.valid('json')
          const db = getDb()
          const updates: any = { updatedAt: new Date().toISOString() }
          if (body.slug !== undefined) updates.slug = body.slug
          if (body.instanceType !== undefined) updates.instanceType = body.instanceType
          if (body.instanceUrl !== undefined) updates.instanceUrl = body.instanceUrl
          if (body.statusId !== undefined) updates.statusId = body.statusId
          if (body.accessToken !== undefined) updates.accessToken = body.accessToken
          if (body.fediAuthor !== undefined) updates.fediAuthor = body.fediAuthor
          if (body.autoFetch !== undefined) updates.autoFetch = body.autoFetch ? 1 : 0
          if (body.cacheTtl !== undefined) updates.cacheTtl = body.cacheTtl
          db.update(mastodonBindings).set(updates).where(eq(mastodonBindings.id, id)).run()
          const row = db.select().from(mastodonBindings).where(eq(mastodonBindings.id, id)).get() as any
          const { accessToken: _at2, ...safe } = row
          return c.json({ code: 0, data: safe })
        },
      )

      // DELETE /api/admin/sites/:siteId/mastodon/bindings/:id
      router.delete('/api/admin/sites/:siteId/mastodon/bindings/:id', async (c) => {
        const { id } = c.req.param()
        const db = getDb()
        db.delete(mastodonCachedComments).where(eq(mastodonCachedComments.bindingId, id)).run()
        db.delete(mastodonBindings).where(eq(mastodonBindings.id, id)).run()
        return c.json({ code: 0 })
      })

      // POST /api/admin/sites/:siteId/mastodon/bindings/search
      router.post(
        '/api/admin/sites/:siteId/mastodon/bindings/search',
        zValidator(
          'json',
          z.object({
            instanceType: z.string().default('mastodon'),
            instanceUrl: z.string().min(1),
            query: z.string().min(1),
            accessToken: z.string().default(''),
          }),
        ),
        async (c) => {
          const { siteId } = c.req.param()
        requireSite(c, siteId)
          const body = await c.req.valid('json')

          let token = body.accessToken
          let software = ''
          if (!token) {
            const db = getDb()
            const site = db.select().from(sites).where(eq(sites.id, siteId)).get() as any
            if (site) {
              const settings = typeof site.settings === 'string' ? JSON.parse(site.settings) : (site.settings || {})
              token = settings.fediConfig?.accessToken || ''
              software = settings.fediConfig?.software || ''
            }
          }
          const adapter = getAdapter(body.instanceType, software)

          const headers: Record<string, string> = { Accept: 'application/json' }
          if (token) Object.assign(headers, adapter.authHeader(token))
          try {
            const url = adapter.searchUrl(body.instanceUrl, body.query)
            const raw = await fetchFedi(url, headers)
            const results = adapter.parseSearchResults(raw)
            return c.json({ code: 0, data: results })
          } catch (err: any) {
          return c.json({ code: 1, message: err.message }, 502)
          }
        },
      )

      // POST /api/admin/sites/:siteId/mastodon/bindings/:id/refresh
      router.post('/api/admin/sites/:siteId/mastodon/bindings/:id/refresh', async (c) => {
        const { id } = c.req.param()
        const db = getDb()
        const rawDb = _rawDb
        const binding = db.select().from(mastodonBindings).where(eq(mastodonBindings.id, id)).get() as any
        if (!binding) return c.json({ code: 1, message: 'Binding not found' }, 404)

        const adapter = getAdapter(binding.instanceType, binding.software)
        const headers: Record<string, string> = { Accept: 'application/json' }
        let accessToken = binding.accessToken
        if (!accessToken) {
          const site = db.select().from(sites).where(eq(sites.id, binding.siteId)).get() as any
          if (site) {
            const settings = typeof site.settings === 'string' ? JSON.parse(site.settings) : (site.settings || {})
            accessToken = settings.fediConfig?.accessToken || ''
          }
        }
        if (accessToken) {
          Object.assign(headers, adapter.authHeader(accessToken))
        }

        const contextUrl = adapter.contextUrl(binding.instanceUrl, binding.statusId)
        try {
          const raw = await fetchFedi(contextUrl, headers)
          const { descendants } = adapter.parseContext(raw)
          const now = new Date().toISOString()

          db.delete(mastodonCachedComments).where(eq(mastodonCachedComments.bindingId, id)).run()

          const insertStmt = rawDb.prepare(
            'INSERT INTO mastodon_cached_comments (id, binding_id, mastodon_comment_id, author_name, author_avatar, author_fedi_id, content, created_at, fetched_at, favourites_count, parent_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          )
          const insertMany = rawDb.transaction((items: any[]) => {
            for (const item of items) {
              insertStmt.run(
                item.id,
                item.bindingId,
                item.mastodonCommentId,
                item.authorName,
                item.authorAvatar,
                item.authorFediId,
                item.content,
                item.createdAt,
                item.fetchedAt,
                item.favouritesCount,
                item.parentId,
              )
            }
          })

          const cached = descendants.map((d: any) => {
            const account = adapter.parseAccount(d)
            return {
              id: `mastodon-cache-${nanoid()}`,
              bindingId: id,
              mastodonCommentId: d.id,
              authorName: account.displayName,
              authorAvatar: account.avatar,
              authorFediId: account.acct,
              content: d.content || '',
              createdAt: d.created_at || now,
              fetchedAt: now,
              favouritesCount: adapter.parseFavourites(d),
              parentId: d.in_reply_to_id || '',
            }
          })

          if (cached.length > 0) {
            insertMany(cached)
          }

          return c.json({ code: 0, data: { count: cached.length } })
        } catch (err: any) {
          return c.json({ code: 1, message: err.message }, 502)
        }
      })

      // GET /api/admin/sites/:siteId/mastodon/bindings/:id/comments
      router.get('/api/admin/sites/:siteId/mastodon/bindings/:id/comments', async (c) => {
        const { id } = c.req.param()
        const db = getDb()
        const rows = _rawDb.prepare('SELECT * FROM mastodon_cached_comments WHERE binding_id = ? AND hidden = 0').all(id) as any[]
        return c.json({ code: 0, data: rows })
      })

      // POST /api/admin/sites/:siteId/mastodon/test-connection
      router.post(
        '/api/admin/sites/:siteId/mastodon/test-connection',
        zValidator(
          'json',
          z.object({
            instanceType: z.string().default('mastodon'),
            instanceUrl: z.string().min(1),
            accessToken: z.string().default(''),
          }),
        ),
        async (c) => {
          const { siteId } = c.req.param()
        requireSite(c, siteId)
          const body = await c.req.valid('json')

          let token = body.accessToken
          let software = ''
          if (!token) {
            const db = getDb()
            const site = db.select().from(sites).where(eq(sites.id, siteId)).get() as any
            if (site) {
              const settings = typeof site.settings === 'string' ? JSON.parse(site.settings) : (site.settings || {})
              token = settings.fediConfig?.accessToken || ''
              software = settings.fediConfig?.software || ''
            }
          }
          const adapter = getAdapter(body.instanceType, software)
          const isMisskey = adapter.name === 'Misskey'

          try {
            const url = adapter.verifyUrl(body.instanceUrl)
            const reqHeaders: Record<string, string> = { Accept: 'application/json' }
            if (token) Object.assign(reqHeaders, adapter.authHeader(token))
            const res = isMisskey
              ? await fetch(url, { method: 'POST', headers: { ...reqHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ limit: 1 }), signal: AbortSignal.timeout(10000) })
              : await fetch(url, { headers: reqHeaders, signal: AbortSignal.timeout(10000) })
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            return c.json({ code: 0, data: { success: true } })
          } catch (err: any) {
            return c.json({ code: 1, message: err.message })
          }
        },
      )

      // POST /api/admin/sites/:siteId/mastodon/oauth/start
      router.post(
        '/api/admin/sites/:siteId/mastodon/oauth/start',
        zValidator(
          'json',
          z.object({
            instanceType: z.string().default('mastodon'),
            instanceUrl: z.string().min(1),
          }),
        ),
        async (c) => {
          const { siteId } = c.req.param()
        requireSite(c, siteId)
          const { instanceType, instanceUrl } = await c.req.valid('json')
          const adapter = getAdapter(instanceType)
          const isMisskey = adapter.name === 'Misskey'
          const cleanUrl = instanceUrl.replace(/\/$/, '')

          if (isMisskey) {
            const res = await fetch(`${cleanUrl}/api/auth/session/generate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({}),
              signal: AbortSignal.timeout(10000),
            })
            if (!res.ok) return c.json({ code: 1, message: `Misskey API error: ${res.status}` }, 502)
            const data = await res.json() as any

            const state = `misskey-${siteId}-${nanoid()}`
            pendingOAuth.set(state, {
              siteId,
              instanceType,
              instanceUrl: cleanUrl,
              appSecret: data.token,
              state,
              createdAt: Date.now(),
            })

            return c.json({ code: 0, data: { authorizeUrl: data.url, state } })
          }

          const origin = c.req.header('Origin') || `${new URL(c.req.url).protocol}//${new URL(c.req.url).host}`
          const redirectUri = `${origin}/api/oauth/mastodon/callback?siteId=${siteId}`

          const appRes = await fetch(`${cleanUrl}/api/v1/apps`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              client_name: 'AIGCS',
              redirect_uris: redirectUri,
              scopes: 'read write',
              website: origin,
            }),
            signal: AbortSignal.timeout(10000),
          })
          if (!appRes.ok) return c.json({ code: 1, message: `App registration failed: ${appRes.status}` }, 502)
          const app = await appRes.json() as any

          const state = `masto-${siteId}-${nanoid()}`
          pendingOAuth.set(state, {
            siteId,
            instanceType,
            instanceUrl: cleanUrl,
            clientId: app.client_id,
            clientSecret: app.client_secret,
            redirectUri,
            state,
            createdAt: Date.now(),
          })

          const authorizeUrl = `${cleanUrl}/oauth/authorize?client_id=${app.client_id}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=read%20write&state=${state}`
          return c.json({ code: 0, data: { authorizeUrl, state } })
        },
      )

      // GET /api/oauth/mastodon/callback — Mastodon API OAuth redirect (outside /api/admin/* to bypass auth middleware)
      router.get('/api/oauth/mastodon/callback', async (c) => {
        const siteId = c.req.query('siteId') || ''
        const code = c.req.query('code')
        const error = c.req.query('error')
        const state = c.req.query('state')

        if (!siteId) {
          return c.html(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Invalid Request</title></head><body><h2>Missing siteId parameter.</h2></body></html>`)
        }

        if (error) {
          return c.html(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Auth Failed</title></head><body><script>
            if (window.opener) { window.opener.postMessage({ type: 'mastodon-oauth', status: 'error', siteId: '${siteId}' }, '*'); window.close() }
            else { document.write('<h2>Authorization denied.</h2>') }
          </script></body></html>`)
        }

        const session = pendingOAuth.get(state || '')
        if (!session || session.siteId !== siteId || !session.clientId || !session.clientSecret) {
          return c.html(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Invalid Session</title></head><body><script>
            if (window.opener) { window.opener.postMessage({ type: 'mastodon-oauth', status: 'error', siteId: '${siteId}' }, '*'); window.close() }
            else { document.write('<h2>Invalid OAuth session. Please try again.</h2>') }
          </script></body></html>`)
        }

        try {
          const tokenRes = await fetch(`${session.instanceUrl}/oauth/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              grant_type: 'authorization_code',
              code,
              client_id: session.clientId,
              client_secret: session.clientSecret,
              redirect_uri: session.redirectUri,
            }),
            signal: AbortSignal.timeout(10000),
          })
          if (!tokenRes.ok) throw new Error(`Token exchange failed: ${tokenRes.status}`)
          const tokenData = await tokenRes.json() as any

          const db = getDb()
          const site = db.select().from(sites).where(eq(sites.id, siteId)).get() as any
          if (site) {
            const existing = typeof site.settings === 'string' ? JSON.parse(site.settings) : (site.settings || {})

            let fediAuthor = existing.fediConfig?.fediAuthor || ''
            try {
              const isWriteFreely = session.instanceType === 'writefreely'
              const isLoops = session.instanceType === 'loops'
              const verifyUrl = isLoops
                ? `${session.instanceUrl}/api/v1/account/info/self`
                : isWriteFreely
                  ? `${session.instanceUrl}/api/me`
                  : `${session.instanceUrl}/api/v1/accounts/verify_credentials`
              const verifyRes = await fetch(verifyUrl, {
                headers: { Authorization: `Bearer ${tokenData.access_token}` },
                signal: AbortSignal.timeout(10000),
              })
              if (verifyRes.ok) {
                const me = await verifyRes.json() as any
                if (isLoops) {
                  fediAuthor = me?.account?.acct || me?.account?.username || ''
                } else if (isWriteFreely) {
                  const user = me?.user || me
                  fediAuthor = user?.username || ''
                } else {
                  fediAuthor = me.acct || ''
                }
                const domain = session.instanceUrl.replace(/^https?:\/\//, '')
                if (fediAuthor && !fediAuthor.includes('@')) {
                  fediAuthor = `${fediAuthor}@${domain}`
                }
              }
              } catch {}

            let software = ''
            try { software = await detectSoftware(session.instanceUrl) } catch {}

            db.update(sites).set({
              settings: {
                ...existing,
                fediConfig: {
                  ...(existing.fediConfig || {}),
                  instanceType: session.instanceType,
                  instanceUrl: session.instanceUrl,
                  accessToken: tokenData.access_token,
                  clientId: session.clientId,
                  clientSecret: session.clientSecret,
                  fediAuthor,
                  ...(software ? { software } : {}),
                },
              },
            }).where(eq(sites.id, siteId)).run()
          }

          pendingOAuth.delete(state!)
          return c.html(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Auth Complete</title></head><body><script>
            if (window.opener) { window.opener.postMessage({ type: 'mastodon-oauth', status: 'success', siteId: '${siteId}' }, '*'); window.close() }
            else { document.write('<h2>Authorization complete. You can close this window.</h2>') }
          </script></body></html>`)
        } catch (err: any) {
          pendingOAuth.delete(state!)
          return c.html(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Auth Failed</title></head><body><script>
            if (window.opener) { window.opener.postMessage({ type: 'mastodon-oauth', status: 'error', siteId: '${siteId}' }, '*'); window.close() }
            else { document.write('<h2>Authorization failed: ${err.message}</h2>') }
          </script></body></html>`)
        }
      })

      // POST /api/admin/sites/:siteId/mastodon/oauth/callback — completes Misskey auth
      router.post(
        '/api/admin/sites/:siteId/mastodon/oauth/callback',
        zValidator(
          'json',
          z.object({
            instanceType: z.string(),
            instanceUrl: z.string(),
            state: z.string(),
          }),
        ),
        async (c) => {
          const { siteId } = c.req.param()
        requireSite(c, siteId)
          const { instanceType, instanceUrl, state } = await c.req.valid('json')
          const adapter = getAdapter(instanceType)

          if (adapter.name !== 'Misskey') {
            return c.json({ code: 1, message: 'Not supported for this instance type' })
          }

          const session = pendingOAuth.get(state)
          if (!session || session.siteId !== siteId) {
            return c.json({ code: 1, message: 'Invalid session' })
          }

          try {
            const cleanUrl = instanceUrl.replace(/\/$/, '')
            const res = await fetch(`${cleanUrl}/api/auth/session/userkey`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ appSecret: session.appSecret }),
              signal: AbortSignal.timeout(10000),
            })
            if (!res.ok) {
              pendingOAuth.delete(state)
              return c.json({ code: 1, message: `Misskey API error: ${res.status}` })
            }
            const data = await res.json() as any

            const db = getDb()
            const site = db.select().from(sites).where(eq(sites.id, siteId)).get() as any
            if (site) {
              const existing = typeof site.settings === 'string' ? JSON.parse(site.settings) : (site.settings || {})
              const fediAuthor = data.user
                ? `@${data.user.username || ''}@${data.user.host || ''}`
                : (existing.fediConfig?.fediAuthor || '')
              db.update(sites).set({
                settings: {
                  ...existing,
                  fediConfig: {
                    ...(existing.fediConfig || {}),
                    instanceType,
                    instanceUrl: cleanUrl,
                    accessToken: data.accessToken,
                    fediAuthor,
                  },
                },
              }).where(eq(sites.id, siteId)).run()
            }

            pendingOAuth.delete(state)
            return c.json({ code: 0, data: { success: true } })
          } catch (err: any) {
            pendingOAuth.delete(state)
            return c.json({ code: 1, message: err.message })
          }
        },
      )

      // POST /api/admin/sites/:siteId/mastodon/revoke — revoke authorization
      router.post('/api/admin/sites/:siteId/mastodon/revoke', async (c) => {
        const { siteId } = c.req.param()
        requireSite(c, siteId)
        const db = getDb()
        const site = db.select().from(sites).where(eq(sites.id, siteId)).get() as any
        if (!site) return c.json({ code: 1, message: 'Site not found' }, 404)
        const settings = typeof site.settings === 'string' ? JSON.parse(site.settings) : (site.settings || {})
        const fediConfig = settings.fediConfig || {}

        if (fediConfig.clientId && fediConfig.clientSecret && fediConfig.accessToken) {
          const adapter = getAdapter(fediConfig.instanceType || 'mastodon')
          try {
            await fetch(`${fediConfig.instanceUrl}/oauth/revoke`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                client_id: fediConfig.clientId,
                client_secret: fediConfig.clientSecret,
                token: fediConfig.accessToken,
              }),
              signal: AbortSignal.timeout(10000),
            })
          } catch {
            // Remote revoke is best-effort; clear locally regardless
          }
        }

        const { accessToken: _at, clientId: _ci, clientSecret: _cs, ...rest } = fediConfig
        db.update(sites).set({
          settings: { ...settings, fediConfig: rest },
        }).where(eq(sites.id, siteId)).run()

        return c.json({ code: 0, data: { success: true } })
      })

      // POST /api/admin/sites/:siteId/mastodon/publish — post a toot and auto-bind
      router.post(
        '/api/admin/sites/:siteId/mastodon/publish',
        zValidator(
          'json',
          z.object({
            slug: z.string().min(1),
            title: z.string().default(''),
            description: z.string().default(''),
            domain: z.string().default(''),
          }),
        ),
        async (c) => {
          const { siteId } = c.req.param()
          requireSite(c, siteId)
          const db = getDb()
          const body = await c.req.valid('json')

          const site = db.select().from(sites).where(eq(sites.id, siteId)).get() as any
          if (!site) return c.json({ code: 1, message: 'Site not found' }, 404)

          const settings = typeof site.settings === 'string' ? JSON.parse(site.settings) : (site.settings || {})
          const fediConfig = settings.fediConfig || {}
          const token = fediConfig.accessToken
          if (!token) return c.json({ code: 1, message: 'Not authorized' }, 401)

          const instanceUrl = fediConfig.instanceUrl.replace(/\/+$/, '')
          const instanceType = fediConfig.instanceType || 'mastodon'
          const software = fediConfig.software || ''
          const fediAuthor = fediConfig.fediAuthor || ''
          const adapter = getAdapter(instanceType, software)
          const pageUrl = body.domain ? `https://${body.domain}${body.slug}` : body.slug

          // Read page cache for excerpt
          let excerpt = body.description || ''
          if (!excerpt) {
            try {
              const pc = db.select({ contentSource: pageCache.contentSource }).from(pageCache).where(and(eq(pageCache.siteId, siteId), eq(pageCache.path, body.slug))).get() as any
              if (pc?.contentSource) excerpt = pc.contentSource.replace(/<[^>]*>/g, '').trim()
            } catch {}
          }

          // Compose post text
          let postText = ''
          if (body.title) postText += `《${body.title}》\n`
          postText += pageUrl
          if (excerpt) postText += `\n\n${excerpt.slice(0, 140)}`

          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...adapter.authHeader(token),
          }

          let statusId = ''
          if (['misskey', 'sharkey', 'firefish'].includes(instanceType)) {
            const res = await fetch(`${instanceUrl}/api/notes/create`, {
              method: 'POST', headers, body: JSON.stringify({ text: postText, visibility: 'home' }),
            })
            if (!res.ok) return c.json({ code: 1, message: 'Post failed' }, 502)
            const data = await res.json()
            statusId = data.createdNote?.id || ''
          } else {
            const res = await fetch(`${instanceUrl}/api/v1/statuses`, {
              method: 'POST', headers, body: JSON.stringify({ status: postText, visibility: 'unlisted' }),
            })
            if (!res.ok) return c.json({ code: 1, message: 'Post failed' }, 502)
            const data = await res.json()
            statusId = data.id || ''
          }

          if (!statusId) return c.json({ code: 1, message: 'No status ID returned' }, 502)

          // One-to-one: check for duplicate slug
          const existingSlug = db.select().from(mastodonBindings)
            .where(and(eq(mastodonBindings.siteId, siteId), eq(mastodonBindings.slug, body.slug)))
            .get()
          if (existingSlug) return c.json({ code: 1, message: `Slug "${body.slug}" already bound` }, 409)

          // Auto-bind
          const now = new Date().toISOString()
          const id = nanoid()
          db.insert(mastodonBindings).values({
            id, siteId, slug: body.slug, instanceType, instanceUrl: fediConfig.instanceUrl,
            statusId, accessToken: token, fediAuthor, autoFetch: 1, cacheTtl: 30,
            createdAt: now, updatedAt: now,
          } as any).run()

          return c.json({ code: 0, data: { id } })
        },
      )

      // GET /api/admin/sites/:siteId/mastodon/config — site-level fedi instance config
      router.get('/api/admin/sites/:siteId/mastodon/config', async (c) => {
        const { siteId } = c.req.param()
        requireSite(c, siteId)
        const db = getDb()
        const site = db.select().from(sites).where(eq(sites.id, siteId)).get() as any
        if (!site) return c.json({ code: 1, message: 'Site not found' }, 404)
        const settings = typeof site.settings === 'string' ? JSON.parse(site.settings) : (site.settings || {})
        const fediConfig = settings.fediConfig || {
          instanceType: 'mastodon',
          instanceUrl: '',
          accessToken: '',
          fediAuthor: '',
          showBadge: true,
          avatarMode: 'aigcs',
          mravatarUrl: '',
          mravatarDefault: 'https://cdn.jsdelivr.net/gh/mastodon/mastodon@latest/public/avatars/original/missing.png',
          mravatarProxied: true,
          mravatarNoCache: true,
          fedAdminAcct: '',
        }
        const { accessToken: _at, clientId: _ci, clientSecret: _cs, ...safe } = fediConfig
        return c.json({ code: 0, data: { ...safe, authorized: !!_at } })
      })

      // PUT /api/admin/sites/:siteId/mastodon/config
      router.put(
        '/api/admin/sites/:siteId/mastodon/config',
        zValidator(
          'json',
          z.object({
            instanceType: z.string().default('mastodon'),
            instanceUrl: z.string().min(1),
            accessToken: z.string().default(''),
            fediAuthor: z.string().optional(),
            showBadge: z.boolean().optional(),
            avatarMode: z.string().optional(),
            mravatarUrl: z.string().optional(),
            mravatarDefault: z.string().optional(),
            mravatarProxied: z.boolean().optional(),
            mravatarNoCache: z.boolean().optional(),
            fedAdminAcct: z.string().optional(),
          }),
        ),
        async (c) => {
          const { siteId } = c.req.param()
        requireSite(c, siteId)
          const body = await c.req.valid('json')
          const db = getDb()
          const site = db.select().from(sites).where(eq(sites.id, siteId)).get() as any
          if (!site) return c.json({ code: 1, message: 'Site not found' }, 404)
          const existing = typeof site.settings === 'string' ? JSON.parse(site.settings) : (site.settings || {})
          const currentFediConfig = existing.fediConfig || {}
          const newSettings = {
            ...existing,
            fediConfig: (() => {
              const rawUrl = body.mravatarUrl !== undefined ? body.mravatarUrl : (currentFediConfig.mravatarUrl || '')
              const normalizedUrl = rawUrl ? (() => {
                let u = rawUrl.trim()
                if (!u.startsWith('http://') && !u.startsWith('https://')) u = 'https://' + u
                u = u.replace(/\/+$/, '')
                if (!u.endsWith('/avatar')) u += '/avatar'
                return u + '/'
              })() : ''
              return {
                instanceType: body.instanceType,
                instanceUrl: body.instanceUrl.replace(/\/$/, ''),
                accessToken: body.accessToken || currentFediConfig.accessToken || '',
                fediAuthor: body.fediAuthor !== undefined ? body.fediAuthor : (currentFediConfig.fediAuthor || ''),
                showBadge: body.showBadge !== undefined ? body.showBadge : (currentFediConfig.showBadge !== false),
                avatarMode: body.avatarMode || currentFediConfig.avatarMode || 'aigcs',
                mravatarUrl: normalizedUrl,
                mravatarDefault: body.mravatarDefault !== undefined ? body.mravatarDefault : (currentFediConfig.mravatarDefault || 'https://cdn.jsdelivr.net/gh/mastodon/mastodon@latest/public/avatars/original/missing.png'),
                mravatarProxied: body.mravatarProxied !== undefined ? body.mravatarProxied : (currentFediConfig.mravatarProxied !== false),
                mravatarNoCache: body.mravatarNoCache !== undefined ? body.mravatarNoCache : (currentFediConfig.mravatarNoCache !== false),
                fedAdminAcct: body.fedAdminAcct !== undefined ? body.fedAdminAcct : (currentFediConfig.fedAdminAcct || ''),
              }
            })(),
          }
          db.update(sites).set({ settings: newSettings }).where(eq(sites.id, siteId)).run()
          const { accessToken: _at, ...safe } = newSettings.fediConfig
          return c.json({ code: 0, data: safe })
        },
      )

      ;(ctx.app as any).route('/', router)
    },

    onFetchComments: async (ctx) => {
      try {
        const db = _rawDb

        if (!db?.prepare) return ctx

        const normPath = ctx.path.replace(/^\/+|\/+$/g, '')
        const bindings = db
          .prepare('SELECT * FROM mastodon_bindings WHERE site_id = ? AND slug = ?')
          .all(ctx.siteId, normPath) as any[]

        if (!bindings || bindings.length === 0) return ctx

        for (const binding of bindings) {
          const adp = getAdapter(binding.instance_type, binding.software || '')

          let shouldFetch = true

          // autoFetch ON: use cache if fresh, skip live fetch
          if (binding.auto_fetch === 1) {
            const cacheRows = db
              .prepare('SELECT * FROM mastodon_cached_comments WHERE binding_id = ?')
              .all(binding.id) as any[]
            if (cacheRows.length > 0) {
              const newestFetch = cacheRows.reduce((latest: string, r: any) => {
                return r.fetched_at > latest ? r.fetched_at : latest
              }, '')
              const cacheAge = (Date.now() - new Date(newestFetch).getTime()) / 60000
              if (cacheAge < binding.cache_ttl) {
                shouldFetch = false
              }
            }
          }

          if (shouldFetch) {
            try {
              let token = binding.access_token
              if (!token) {
                const site = db.prepare('SELECT settings FROM sites WHERE id = ?').get(ctx.siteId) as any
                if (site) {
                  const s = typeof site.settings === 'string' ? JSON.parse(site.settings) : (site.settings || {})
                  token = s.fediConfig?.accessToken || ''
                }
              }
              if (token) {
                const headers: Record<string, string> = { Accept: 'application/json' }
                Object.assign(headers, adp.authHeader(token))
                const contextUrl = adp.contextUrl(binding.instance_url, binding.status_id)
                const raw = await fetch(contextUrl, { headers, signal: AbortSignal.timeout(10000) })
                if (raw.ok) {
                  const json = await raw.json()
                  const { descendants } = adp.parseContext(json)
                  const now = new Date().toISOString()

                  db.prepare('DELETE FROM mastodon_cached_comments WHERE binding_id = ?').run(binding.id)

                  const insertStmt = db.prepare(
                    'INSERT INTO mastodon_cached_comments (id, binding_id, mastodon_comment_id, author_name, author_avatar, author_fedi_id, content, created_at, fetched_at, favourites_count, parent_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                  )
                  for (const d of descendants) {
                    const account = adp.parseAccount(d)
                    insertStmt.run(
                      `mastodon-cache-${nanoid()}`,
                      binding.id,
                      d.id,
                      account.displayName,
                      account.avatar,
                      account.acct,
                      d.content || '',
                      d.created_at || now,
                      now,
                      adp.parseFavourites(d),
                      d.in_reply_to_id || '',
                    )
                  }
                }
              }
            } catch (err) {
              console.error('[mastodon] Fetch failed for binding', binding.id, err)
            }
          }

          const allCache = db
            .prepare('SELECT * FROM mastodon_cached_comments WHERE binding_id = ? AND hidden = 0 ORDER BY created_at ASC')
            .all(binding.id) as any[]

          const idMap = new Map<string, string>()
          for (const c of allCache) {
            idMap.set(c.mastodon_comment_id, `fedi-${c.id}`)
          }

          const fediComments = allCache.map((c: any) => ({
            id: `fedi-${c.id}`,
            mastodonCommentId: c.mastodon_comment_id,
            authorName: c.author_name,
            authorEmail: '',
            authorUrl: (() => {
              const acct = c.author_fedi_id || ''
              if (acct.includes('@')) {
                const [user, domain] = acct.split('@')
                return `https://${domain}/@${user}`
              }
              return acct ? `${binding.instance_url}/@${acct}` : ''
            })(),
            authorFediId: (() => {
              const acct = c.author_fedi_id || ''
              if (acct.includes('@')) return acct
              if (acct) {
                try {
                  const siteRow = db.prepare('SELECT settings FROM sites WHERE id = ?').get(ctx.siteId) as any
                  if (siteRow) {
                    const s = typeof siteRow.settings === 'string' ? JSON.parse(siteRow.settings) : (siteRow.settings || {})
                    const adminAcct = s?.fediConfig?.fedAdminAcct || ''
                    if (adminAcct) {
                      const match = adminAcct.match(/@([^@]+)$/)
                      if (match) return `${acct}@${match[1]}`
                    }
                  }
                } catch {}
                try { return `${acct}@${new URL(binding.instance_url).hostname}` } catch { return acct }
              }
              return ''
            })(),
            avatar: c.author_avatar,
            content: c.content,
            createdAt: c.created_at,
            source: 'fedi',
            statusUrl: (() => {
              const sid = binding.status_id || ''
              const instance = binding.instance_url.replace(/\/+$/, '')
              const itype = (binding.software || binding.instance_type || '').toLowerCase()
              const acct = binding.fedi_author || ''
              const username = acct.includes('@') ? acct.split('@')[0] : acct
              if (['gotosocial', 'friendica'].includes(itype)) {
                return username ? `${instance}/@${username}/statuses/${sid}` : `${instance}/api/v1/statuses/${sid}`
              }
              if (['mastodon', 'hometown', 'mitra', 'pixelfed'].includes(itype)) {
                return username ? `${instance}/@${username}/${sid}` : `${instance}/api/v1/statuses/${sid}`
              }
              if (['pleroma', 'akkoma', 'misskey', 'sharkey', 'firefish'].includes(itype)) return `${instance}/notes/${sid}`
              if (itype === 'lemmy' || itype === 'piefed') return `${instance}/comment/${sid}`
              if (itype === 'writefreely') return `${instance}/${sid}`
              if (itype === 'loops') return `${instance}/videos/${sid}`
              return `${instance}/statuses/${sid}`
            })(),
            parentId: c.parent_id ? idMap.get(c.parent_id) : undefined,
            reactions: c.favourites_count > 0 ? [{ type: 'heart', count: c.favourites_count }] : [],
          }))

          if (!ctx.visitorComments) ctx.visitorComments = []
          ctx.visitorComments.push(...fediComments)
        }
      } catch (err) {
        console.error('[mastodon] onFetchComments error:', err)
      }

      return ctx
    },
  },
}

export default plugin
