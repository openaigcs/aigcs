import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createMiddleware } from 'hono/factory'
import { logger } from 'hono/logger'
import { secureHeaders } from 'hono/secure-headers'
import { serveStatic } from '@hono/node-server/serve-static'
import { HTTPException } from 'hono/http-exception'
import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { authMiddleware } from './middleware/auth.js'
import { rateLimiter } from './middleware/rate-limit.js'
import { csrfProtection } from './middleware/csrf.js'
import { authRouter } from './routes/auth.js'
import { adminRouter } from './routes/admin.js'
import { widgetRouter } from './routes/widget.js'
import { unsubscribeRouter } from './routes/unsubscribe.js'
import { getAllPlugins, runHook } from './plugins/registry.js'
import { getDb, getRawDb } from './db/index.js'

async function getAllowedOrigins(): Promise<string[]> {
  try {
    const { getRawDb } = await import('./db/index.js')
    const raw = getRawDb() as any
    const config = raw.prepare?.("SELECT allowed_origins FROM system_config WHERE id = 'global'").get() as { allowed_origins: string | null } | undefined
    if (config?.allowed_origins) {
      const parsed = JSON.parse(config.allowed_origins)
      if (Array.isArray(parsed)) return parsed
    }
  } catch {}
  return []
}

const corsOriginCheck = createMiddleware(async (c, next) => {
  const origin = c.req.header('Origin')
  if (!origin) return next()

  const allowed = await getAllowedOrigins()
  if (allowed.includes('*')) return next()
  if (!allowed.includes(origin)) {
    throw new HTTPException(403, { message: 'Origin not allowed' })
  }
  return next()
})

export async function createApp() {
  const app = new Hono()

  app.use('*', async (c, next) => {
    if (c.req.path === '/api/health') return next()
    return logger()(c, next)
  })
  app.use('*', secureHeaders({
    strictTransportSecurity: 'max-age=31536000; includeSubDomains',
    crossOriginResourcePolicy: false,
  }))
  app.use('*', cors({
    origin: (origin, c) => {
      if (!origin) return '*'
      const path = c.req.path
      if (path.startsWith('/api/widget/') || path.startsWith('/widget.')) return origin
      return origin
    },
    credentials: true,
  }))
  app.use('/api/widget/*', corsOriginCheck)
  app.use('*', authMiddleware)
  app.use('/api/*', rateLimiter())
  app.use('/api/admin/*', csrfProtection)

  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return c.json({ code: err.status, message: err.message }, err.status)
    }
    console.error('[server] Unhandled error:', err)
    return c.json({ code: 500, message: 'Internal server error' }, 500)
  })

  app.route('/api/auth', authRouter)
  app.route('/api/admin', adminRouter)
  app.route('/api/widget', widgetRouter)
  app.route('/api', unsubscribeRouter)

  // Initialize plugins (server init hook)
  const db = getDb()
  const rawDb = getRawDb()
  const plugins = getAllPlugins()
  for (const plugin of plugins) {
    if ((plugin as any)._disabled) continue
    if (plugin.hooks.onServerInit) {
      try {
        await plugin.hooks.onServerInit({
          app,
          db,
          rawDb,
          config: process.env as any,
          settings: (plugin as any)._settings || {},
        })
      } catch (err) {
        console.error(`[plugins] onServerInit failed for "${plugin.name}":`, err)
      }
    }
  }

    app.get('/api/avatar-proxy', async (c) => {
    const url = c.req.query('url')
    if (!url) return c.text('Missing url', 400)
    try {
      new URL(url)
    } catch {
      return c.text('Invalid url', 400)
    }
    const origin = c.req.header('origin') || c.req.header('referer') || '*'
    const hash = createHash('md5').update(url).digest('hex')
    const dataDir = join(process.cwd(), 'data', 'avatars')
    mkdirSync(dataDir, { recursive: true })

    // Enforce cache limit: max ~10000 files
    const MAX_CACHE = 10000
    let entries: string[] = []
    try { entries = readdirSync(dataDir) } catch {}
    if (entries.length >= MAX_CACHE) {
      entries.sort().slice(0, Math.floor(MAX_CACHE * 0.2)).forEach(f => {
        try { rmSync(join(dataDir, f)) } catch {}
      })
    }

    const cachePath = join(dataDir, hash)
    if (existsSync(cachePath)) {
      const data = readFileSync(cachePath)
      return c.newResponse(data, 200, {
        'Content-Type': 'image/webp',
        'Cache-Control': 'public, max-age=31536000',
        'Access-Control-Allow-Origin': origin,
      })
    }
    try {
      const { safeFetch } = await import('./services/safe-fetch.js')
      const res = await safeFetch(url, { timeout: 10000 })
      if (!res.ok) return c.text('Failed to fetch', 502)
      const buffer = Buffer.from(await res.arrayBuffer())
      writeFileSync(cachePath, buffer)
      return c.newResponse(buffer, 200, {
        'Content-Type': res.headers.get('content-type') || 'image/webp',
        'Cache-Control': 'public, max-age=31536000',
        'Access-Control-Allow-Origin': origin,
      })
    } catch (err) {
      console.error('[avatar-proxy] fetch failed:', url, err)
      return c.text('Proxy failed', 502)
    }
  })

  app.get('/api/health', (c) => {
    return c.json({ status: 200 })
  })

  // Serve widget.js with explicit CORS and Content-Type headers
  const __dirname = dirname(fileURLToPath(import.meta.url))
  const widgetPath = join(__dirname, '..', '..', 'widget', 'dist', 'aigcs.js')
  app.get('/widget.js', (c) => {
    if (!existsSync(widgetPath)) return c.text('Widget not built', 404)
    const widgetContent = readFileSync(widgetPath, 'utf-8')
    return c.newResponse(widgetContent, 200, {
      'Content-Type': 'application/javascript',
      'Access-Control-Allow-Origin': '*',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'Cache-Control': 'no-cache',
    })
  })

  // Serve admin static files (production only; Vite handles dev)
  app.use('/*', serveStatic({ root: './packages/admin/dist', index: 'index.html' }))
  // SPA fallback: serve index.html for unmatched routes (client-side routing)
  app.get('/*', (c) => {
    const indexPath = join(process.cwd(), 'packages', 'admin', 'dist', 'index.html')
    if (existsSync(indexPath)) {
      return c.html(readFileSync(indexPath, 'utf-8'))
    }
    return c.text('Not found', 404)
  })

  return app
}
