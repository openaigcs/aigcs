import { getRawDb } from '../db/index.js'
import nodemailer from 'nodemailer'
import { decrypt } from './encryption.js'

export async function sendEmail(to: string, subject: string, html: string) {
  const raw = getRawDb()
  const config = raw.prepare?.(
    "SELECT smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from_email, smtp_from_name FROM system_config WHERE id = 'global'",
  ).get() as Record<string, unknown> | undefined

  if (!config?.smtp_host) {
    console.log(`[email] SMTP not configured, skipping email to ${to}: ${subject}`)
    return
  }

  const port = Number(config.smtp_port) || 587
  const transporter = nodemailer.createTransport({
    host: config.smtp_host as string,
    port,
    secure: port === 465,
    auth: {
      user: (config.smtp_user as string) || '',
      pass: decrypt((config.smtp_pass as string) || ''),
    },
  })

  try {
    await transporter.sendMail({
      from: `"${config.smtp_from_name || 'AIGCS Notify'}" <${config.smtp_from_email || 'noreply@aigcs.local'}>`,
      to,
      subject,
      html,
    })
    console.log(`[email] Sent to ${to}: ${subject}`)
  } catch (err: any) {
    console.error(`[email] Failed to send email to ${to}:`, err)
    try {
      const adminUser = raw.prepare?.("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get() as { id: string } | undefined
      if (adminUser?.id) {
        const { createNotification } = await import('./notification.js')
        createNotification(adminUser.id, 'error', '邮件发送失败', `发往 ${to} 的邮件发送失败: ${err?.message || err}`)
      }
    } catch {}
    throw err
  }
}
