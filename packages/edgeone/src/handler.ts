import { createApp } from '@aigcs/server/app.js'
import { createDb, getDb, getRawDb } from '@aigcs/server/db/index.js'
import { migrate } from '@aigcs/server/db/migrate.js'
import { DEFAULT_REACTIONS, DEFAULT_PROMPTS } from '@aigcs/core'
import { createHash } from 'node:crypto'

let app: Awaited<ReturnType<typeof createApp>> | null = null
let initPromise: Promise<void> | null = null

async function init(env: Record<string, string | undefined>) {
  const dbUrl = env.DATABASE_URL
  await createDb(dbUrl)
  const raw = getRawDb()

  const isSqlite = typeof raw.prepare === 'function' && typeof raw.exec === 'function'
  const dialect = isSqlite ? 'sqlite' as const : 'mysql' as const

  await migrate(dialect)

  const hasReactions = isSqlite
    ? (raw.prepare("SELECT COUNT(*) as count FROM reaction_types WHERE is_system = 1").get() as any)?.count
    : 0

  if (!hasReactions || Number(hasReactions) === 0) {
    if (isSqlite) {
      for (const r of DEFAULT_REACTIONS) {
        raw.prepare("INSERT OR IGNORE INTO reaction_types (id, emoji, label, sort_order, is_system, site_id) VALUES (?, ?, ?, ?, 1, NULL)").run(r.id, r.emoji, r.label, r.sortOrder)
      }
      for (const p of DEFAULT_PROMPTS) {
        const id = createHash('md5').update(p.name).digest('hex')
        raw.prepare("INSERT OR IGNORE INTO prompt_templates (id, name, content, lang, category, is_system) VALUES (?, ?, ?, ?, ?, 1)").run(id, p.name, p.content, p.lang, p.category)
      }
    } else {
      for (const r of DEFAULT_REACTIONS) {
        await raw.execute?.("INSERT IGNORE INTO reaction_types (id, emoji, label, sort_order, is_system, site_id) VALUES (?, ?, ?, ?, 1, NULL)", [r.id, r.emoji, r.label, r.sortOrder])
      }
      for (const p of DEFAULT_PROMPTS) {
        const id = createHash('md5').update(p.name).digest('hex')
        await raw.execute?.("INSERT IGNORE INTO prompt_templates (id, name, content, lang, category, is_system) VALUES (?, ?, ?, ?, ?, 1)", [id, p.name, p.content, p.lang, p.category])
      }
    }
  }

  app = await createApp()
}

export async function onRequest(context: any) {
  if (!initPromise) {
    initPromise = init(context.env || {}).catch((err) => {
      console.error('[edgeone] Init failed:', err)
      initPromise = null
      throw err
    })
  }

  await initPromise
  return app!.fetch(context.request, context.env)
}
