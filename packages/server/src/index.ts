import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { createDb, getRawDb, getDialect } from './db/index.js'
import { migrate } from './db/migrate.js'
import { createHash } from 'node:crypto'
import dotenv from 'dotenv'
dotenv.config({ path: '.env' })
dotenv.config({ path: '.env.local' })

async function main() {
  console.log('[server] Starting AIGCS...')

  if (process.env.JWT_SECRET === 'change-me-in-production' || !process.env.JWT_SECRET) {
    console.warn('[server] WARNING: JWT_SECRET is set to default value. Change it in production to prevent token forgery.')
  }
  if (process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY === 'change-me-in-production') {
    console.warn('[server] WARNING: ENCRYPTION_KEY is set to default value. Change it in production to prevent key decryption.')
  }
  if (!process.env.ENCRYPTION_KEY && !process.env.JWT_SECRET) {
    console.warn('[server] WARNING: ENCRYPTION_KEY not set. Falling back to JWT_SECRET for encryption. Set ENCRYPTION_KEY for better isolation.')
  }

  await createDb()
  const dialect = getDialect()
  await migrate(dialect)

  // Seed default system data if needed
  const raw = getRawDb()
  if (dialect === 'sqlite') {

    // Seed system_config default row
    const configExists = raw.prepare("SELECT COUNT(*) as count FROM system_config WHERE id = 'global'").get() as { count: number } | undefined
    if (!configExists || configExists.count === 0) {
      raw.prepare("INSERT INTO system_config (id) VALUES ('global')").run()
      console.log('[server] Default system config seeded')
    }

    const { DEFAULT_REACTIONS, DEFAULT_PROMPTS } = await import('@aigcs/core')

    // Remove deprecated thumbs_down reaction type
    const thumbsDownExists = raw.prepare("SELECT id FROM reaction_types WHERE id = 'thumbs_down'").get()
    if (thumbsDownExists) {
      raw.prepare("DELETE FROM comment_reactions WHERE reaction_type = 'thumbs_down'").run()
      raw.prepare("DELETE FROM reaction_votes WHERE reaction_type = 'thumbs_down'").run()
      raw.prepare("DELETE FROM reaction_types WHERE id = 'thumbs_down'").run()
      console.log('[server] Removed deprecated thumbs_down reaction type')
    }

    // Ensure all default reactions exist
    const insertReact = raw.prepare("INSERT OR IGNORE INTO reaction_types (id, emoji, label, sort_order, is_system, site_id) VALUES (?, ?, ?, ?, 1, NULL)")
    for (const r of DEFAULT_REACTIONS) {
      insertReact.run(r.id, r.emoji, r.label, r.sortOrder)
    }

    // Ensure all default prompt templates exist
    const hasPrompts = raw.prepare("SELECT COUNT(*) as count FROM prompt_templates WHERE is_system = 1").get() as { count: number } | undefined
    if (!hasPrompts || hasPrompts.count === 0) {
      const insertPrompt = raw.prepare("INSERT OR IGNORE INTO prompt_templates (id, name, content, lang, category, is_system) VALUES (?, ?, ?, ?, ?, 1)")
      for (const p of DEFAULT_PROMPTS) {
        const id = createHash('md5').update(p.name).digest('hex')
        insertPrompt.run(id, p.name, p.content, p.lang, p.category)
      }
      console.log('[server] Default prompt templates seeded')
    }

    // Clean up duplicate reaction types that may have been created via admin UI or site creation
    const dupes = raw.prepare(`
      SELECT rt1.id FROM reaction_types rt1
      WHERE rt1.is_system = 0 AND EXISTS (
        SELECT 1 FROM reaction_types rt2
        WHERE rt2.is_system = 1 AND rt2.emoji = rt1.emoji
      )
    `).all() as Array<{ id: string }>
    for (const d of dupes) {
      raw.prepare("DELETE FROM comment_reactions WHERE reaction_type = ?").run(d.id)
      raw.prepare("DELETE FROM reaction_votes WHERE reaction_type = ?").run(d.id)
      raw.prepare("DELETE FROM reaction_types WHERE id = ?").run(d.id)
    }
    if (dupes.length > 0) console.log(`[server] Cleaned up ${dupes.length} duplicate reaction types`)

    // Sync env vars to system_config (Docker-friendly)
    const envConfig: Record<string, string | number | null> = {
      ...(process.env.SMTP_HOST && { smtp_host: process.env.SMTP_HOST }),
      ...(process.env.SMTP_PORT && { smtp_port: parseInt(process.env.SMTP_PORT, 10) }),
      ...(process.env.SMTP_USER && { smtp_user: process.env.SMTP_USER }),
      ...(process.env.SMTP_PASS && { smtp_pass: process.env.SMTP_PASS }),
      ...(process.env.SMTP_FROM_EMAIL && { smtp_from_email: process.env.SMTP_FROM_EMAIL }),
      ...(process.env.SMTP_FROM_NAME && { smtp_from_name: process.env.SMTP_FROM_NAME }),
      ...(process.env.CAPTCHA_PROVIDER && { captcha_provider: process.env.CAPTCHA_PROVIDER }),
      ...(process.env.TURNSTILE_SITE_KEY && { turnstile_site_key: process.env.TURNSTILE_SITE_KEY }),
      ...(process.env.TURNSTILE_SECRET_KEY && { turnstile_secret_key: process.env.TURNSTILE_SECRET_KEY }),
      ...(process.env.RECAPTCHA_SITE_KEY && { recaptcha_site_key: process.env.RECAPTCHA_SITE_KEY }),
      ...(process.env.RECAPTCHA_SECRET_KEY && { recaptcha_secret_key: process.env.RECAPTCHA_SECRET_KEY }),
      ...(process.env.GEETEST_CAPTCHA_ID && { geetest_captcha_id: process.env.GEETEST_CAPTCHA_ID }),
      ...(process.env.GEETEST_CAPTCHA_KEY && { geetest_captcha_key: process.env.GEETEST_CAPTCHA_KEY }),
      ...(process.env.CAP_SITE_KEY && { cap_site_key: process.env.CAP_SITE_KEY }),
      ...(process.env.CAP_SECRET_KEY && { cap_secret_key: process.env.CAP_SECRET_KEY }),
      ...(process.env.CAP_VERIFY_URL && { cap_verify_url: process.env.CAP_VERIFY_URL }),
      ...(process.env.ALTCHA_SITE_KEY && { altcha_site_key: process.env.ALTCHA_SITE_KEY }),
      ...(process.env.ALTCHA_SECRET_KEY && { altcha_secret_key: process.env.ALTCHA_SECRET_KEY }),
      ...(process.env.HCAPTCHA_SITE_KEY && { hcaptcha_site_key: process.env.HCAPTCHA_SITE_KEY }),
      ...(process.env.HCAPTCHA_SECRET_KEY && { hcaptcha_secret_key: process.env.HCAPTCHA_SECRET_KEY }),
      ...(process.env.ALLOWED_ORIGINS && { allowed_origins: process.env.ALLOWED_ORIGINS }),
      ...(process.env.REGISTRATION_OPEN !== undefined && { registration_open: process.env.REGISTRATION_OPEN === 'true' ? 1 : 0 }),
      ...(process.env.GLOBAL_SYSTEM_PROMPT && { global_system_prompt: process.env.GLOBAL_SYSTEM_PROMPT }),
    }

    if (Object.keys(envConfig).length > 0) {
      const setClauses = Object.entries(envConfig).map(([k, v]) => {
        if (v === null) return `${k} = NULL`
        if (typeof v === 'number') return `${k} = ${v}`
        return `${k} = '${String(v).replace(/'/g, "''")}'`
      })
      setClauses.push("updated_at = datetime('now')")
      raw.prepare(`UPDATE system_config SET ${setClauses.join(', ')} WHERE id = 'global'`).run()
      console.log(`[server] Synced ${Object.keys(envConfig).length} config values from env`)
    }
  }

  // Load plugins
  const { loadPlugins, loadPluginsFromDb } = await import('./plugins/loader.js')
  await loadPlugins()
  await loadPluginsFromDb(raw)

  const app = await createApp()
  const port = parseInt(process.env.PORT || '41905', 10)

  // Start RSS cron scheduler
  const { startRssCron } = await import('./services/rss-cron.js')
  startRssCron()
  console.log('[server] RSS cron scheduler started')

  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`[server] AIGCS running at http://localhost:${info.port}`)
  })
}

main().catch((err) => {
  console.error('[server] Fatal error:', err)
  process.exit(1)
})
