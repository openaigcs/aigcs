import { getDb, getRawDb } from '../db/index.js'
import { sites, pageCache } from '@aigcs/core'
import { eq, and, sql } from 'drizzle-orm'
import { createHash } from 'node:crypto'
import { JSDOM } from 'jsdom'
import { fireWebhook } from './webhook.js'

type RssSettings = {
  url?: string
  auto_generate?: boolean
  cron_schedule?: string
  cron_expr?: string
  last_fetched_at?: string
}

type RssEntry = { title: string; link: string }

export function parseRssFeed(xml: string): RssEntry[] {
  const dom = new JSDOM(xml, { contentType: 'text/xml' })
  const doc = dom.window.document
  const entries: RssEntry[] = []

  const items = doc.querySelectorAll('item')
  items.forEach((item: Element) => {
    let link = item.querySelector('link')?.textContent || ''
    link = link.trim()
    const title = item.querySelector('title')?.textContent || ''
    if (link) entries.push({ title, link })
  })

  const atomEntries = doc.querySelectorAll('entry')
  atomEntries.forEach((entry: Element) => {
    const title = entry.querySelector('title')?.textContent || ''
    let link = ''
    const linkEl = entry.querySelector('link')
    if (linkEl) {
      link = linkEl.getAttribute('href') || linkEl.textContent || ''
    }
    link = link.trim()
    if (link) entries.push({ title, link })
  })

  return entries
}

export function importRssEntries(siteId: string, entries: RssEntry[]): { imported: number; total: number } {
  const db = getDb()
  let imported = 0

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
      db.insert(pageCache).values({ id: cacheHash, siteId, path, status: 'pending', createdAt: now, updatedAt: now }).run()
      imported++
    }
  }

  return { imported, total: entries.length }
}

function matchCron(cronExpr: string, lastFetchedAt: string | undefined): boolean {
  if (!cronExpr || cronExpr === 'never') return false

  const now = new Date()
  const last = lastFetchedAt ? new Date(lastFetchedAt) : null

  // Preset shortcuts
  const periodMap: Record<string, number> = {
    hourly: 60,
    every_6_hours: 360,
    daily: 1440,
    weekly: 10080,
  }

  const intervalMin = periodMap[cronExpr]
  if (intervalMin) {
    if (!last) return true
    const elapsed = (now.getTime() - last.getTime()) / 60000
    return elapsed >= intervalMin
  }

  // Custom cron expression (* * * * *)
  if (/^(\*|\d+|\*\/\d+|\d+-\d+|\d+(,\d+)*)(\s(\*|\d+|\*\/\d+|\d+-\d+|\d+(,\d+)*)){4}$/.test(cronExpr.trim())) {
    if (!last) return true
    const parts = cronExpr.trim().split(/\s+/)
    const minuteMatch = matchCronField(parts[0], now.getMinutes())
    const hourMatch = matchCronField(parts[1], now.getHours())
    const dayMatch = matchCronField(parts[2], now.getDate())
    const monthMatch = matchCronField(parts[3], now.getMonth() + 1)
    const weekMatch = matchCronField(parts[4], now.getDay())

    if (minuteMatch && hourMatch && dayMatch && monthMatch && weekMatch) {
      // Only fire if last fetch was more than the interval in cron, not within same minute
      if (last) {
        const elapsed = (now.getTime() - last.getTime()) / 60000
        return elapsed >= 1
      }
      return true
    }
  }

  return false
}

function matchCronField(part: string, value: number): boolean {
  if (part === '*') return true
  if (part.startsWith('*/')) {
    const step = parseInt(part.slice(2), 10)
    return step > 0 && value % step === 0
  }
  if (part.includes('-')) {
    const [minStr, maxStr] = part.split('-')
    const min = parseInt(minStr, 10)
    const max = parseInt(maxStr, 10)
    return value >= min && value <= max
  }
  if (part.includes(',')) {
    return part.split(',').map(Number).includes(value)
  }
  return parseInt(part, 10) === value
}

export async function checkAndFetchRssFeeds(): Promise<void> {
  const db = getDb()
  const allSites = db.select().from(sites).all() as any[]

  for (const site of allSites) {
    const settings: { rss?: RssSettings } = site.settings || {}
    const rss = settings.rss
    if (!rss?.url) continue

    const cronKey = rss.cron_expr || rss.cron_schedule || 'never'

    if (!matchCron(cronKey, rss.last_fetched_at)) continue

    try {
      const response = await fetch(rss.url)
      if (!response.ok) {
        console.error(`[rss-cron] Failed to fetch RSS for site ${site.id}: ${response.status}`)
        continue
      }
      const xml = await response.text()
      const entries = parseRssFeed(xml)
      const { imported } = importRssEntries(site.id, entries)

      // Update last_fetched_at
      const now = new Date().toISOString()
      const updatedSettings = { ...settings, rss: { ...rss, last_fetched_at: now } }
      db.update(sites).set({ settings: updatedSettings }).where(eq(sites.id, site.id)).run()

      if (imported > 0) {
        fireWebhook(site.id, 'rss.import_completed', { site: site.id, url: rss.url, total: entries.length, imported })
      }
    } catch (err) {
      console.error(`[rss-cron] Error processing RSS for site ${site.id}:`, err)
    }
  }
}

export function startRssCron(): void {
  // Check every 60 seconds
  setInterval(() => {
    checkAndFetchRssFeeds().catch((err) => console.error('[rss-cron] Error:', err))
  }, 60_000)
  // Run once immediately after startup
  checkAndFetchRssFeeds().catch((err) => console.error('[rss-cron] Initial check error:', err))
}
