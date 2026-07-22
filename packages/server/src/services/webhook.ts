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
      }).then(async (res) => {
        if (!res.ok) {
          const site = raw.prepare?.(`SELECT user_id FROM sites WHERE id = ?`).get(siteId) as { user_id: string } | undefined
          if (site?.user_id) {
            const { createNotification } = await import('./notification.js')
            createNotification(site.user_id, 'warning', 'Webhook 响应异常', `Webhook 推送至 "${webhook.url}" 返回 HTTP ${res.status}`, siteId)
          }
        }
      }).catch(async (err) => {
        console.error(`[webhook] Error firing webhook ${webhook.id}:`, err)
        const site = raw.prepare?.(`SELECT user_id FROM sites WHERE id = ?`).get(siteId) as { user_id: string } | undefined
        if (site?.user_id) {
          const { createNotification } = await import('./notification.js')
          createNotification(site.user_id, 'error', 'Webhook 推送失败', `Webhook 推送至 "${webhook.url}" 出错: ${err.message || err}`, siteId)
        }
      })
    }
  } catch (err) {
    console.error('[webhook] Error in fireWebhook:', err)
  }
}
