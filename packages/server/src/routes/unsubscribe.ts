import { Hono } from 'hono'
import { randomUUID } from 'node:crypto'
import { getRawDb } from '../db/factory.js'
import { generateUnsubscribeToken, verifyUnsubscribeToken } from '../services/unsubscribe.js'

const router = new Hono()

router.get('/unsubscribe', async (c) => {
  const email = c.req.query('email')
  const ctx = c.req.query('ctx') || 'global'
  const token = c.req.query('token')
  const locale = c.req.query('locale') || 'en'

  if (!email || !token) {
    return c.html(`<html><body style="font-family:sans-serif;text-align:center;padding:40px"><h2>Missing parameters</h2></body></html>`)
  }

  const valid = verifyUnsubscribeToken(email, ctx, token)
  if (!valid) {
    return c.html(`<html><body style="font-family:sans-serif;text-align:center;padding:40px"><h2>Invalid or expired link</h2></body></html>`)
  }

  const raw = getRawDb()
  const existing = raw.prepare('SELECT id FROM email_unsubscribes WHERE email = ? AND context = ?').get(email.toLowerCase(), ctx) as any
  if (existing) {
    raw.prepare('DELETE FROM email_unsubscribes WHERE id = ?').run(existing.id)
    const title = locale === 'zh' ? '已重新订阅' : 'Resubscribed'
    const msg = locale === 'zh'
      ? '您已成功重新订阅。您将重新开始接收与此相关的邮件通知。'
      : 'You have been resubscribed. You will resume receiving email notifications for this.'
    return c.html(`<html><body style="font-family:sans-serif;text-align:center;padding:40px">
      <h2>${title}</h2>
      <p style="color:#666">${msg}</p>
    </body></html>`)
  }

  raw.prepare('INSERT INTO email_unsubscribes (id, email, context, created_at) VALUES (?, ?, ?, ?)').run(
    randomUUID(), email.toLowerCase(), ctx, new Date().toISOString(),
  )

  const title = locale === 'zh' ? '已取消订阅' : 'Unsubscribed'
  const msg = locale === 'zh'
    ? '您已成功取消订阅。您将不再收到与此相关的邮件通知。'
    : 'You have been unsubscribed. You will no longer receive email notifications for this.'

  return c.html(`<html><body style="font-family:sans-serif;text-align:center;padding:40px">
    <h2>${title}</h2>
    <p style="color:#666">${msg}</p>
  </body></html>`)
})

export { router as unsubscribeRouter }
