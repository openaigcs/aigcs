import { getRawDb } from '../db/index.js'
import { createHmac } from 'node:crypto'

export async function fireWebhook(siteId: string, event: string, data: Record<string, unknown>) {
  try {
    const raw = getRawDb()
    const rows = raw.prepare?.(
      `SELECT * FROM webhooks WHERE site_id = ? AND enabled = 1`,
    ).all(siteId) as Array<{
      id: string
      url: string
      secret: string | null
      events: string
    }> | undefined

    if (!rows) return

    for (const webhook of rows) {
      const events: string[] = JSON.parse(webhook.events)
      if (!events.includes(event) && !events.includes('*')) continue

      const timestamp = new Date().toISOString()
      const payload = JSON.stringify({ event, site_id: siteId, data, timestamp })
      const headers: Record<string, string> = { 'Content-Type': 'application/json', 'User-Agent': 'AIGCS-Webhook/1.0' }

      if (webhook.secret) {
        const hmac = createHmac('sha256', webhook.secret).update(payload).digest('hex')
        headers['X-AIGCS-Signature'] = `sha256=${hmac}`
      }

      fetch(webhook.url, {
        method: 'POST',
        headers,
        body: payload,
      }).catch((err) => {
        console.error(`[webhook] Error firing webhook ${webhook.id}:`, err)
      })
    }
  } catch (err) {
    console.error('[webhook] Error in fireWebhook:', err)
  }
}
