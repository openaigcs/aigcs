import type { Plugin, FetchContext, SubmitContext, ServerContext } from '@aigcs/core'
import { createHash, randomUUID } from 'node:crypto'

let _rawDb: any = null

function md5(s: string): string {
  return createHash('md5').update(s.toLowerCase().trim()).digest('hex')
}

function displayWidth(s: string): number {
  let w = 0
  try {
    for (let i = 0; i < s.length; ) {
      const cp = s.codePointAt(i)!
      const charLen = cp > 0xFFFF ? 2 : 1
      if (cp >= 0x1100 && cp <= 0x115F || cp === 0x2329 || cp === 0x232A ||
          cp >= 0x2E80 && cp <= 0x9FFF || cp >= 0xA000 && cp <= 0xA4CF ||
          cp >= 0xAC00 && cp <= 0xD7AF || cp >= 0xF900 && cp <= 0xFAFF ||
          cp >= 0xFE30 && cp <= 0xFE6F || cp >= 0xFF01 && cp <= 0xFF60 ||
          cp >= 0xFFE0 && cp <= 0xFFE6 || cp >= 0x1B000 && cp <= 0x1B0FF ||
          cp >= 0x20000 && cp <= 0x2FA1F || cp >= 0x30000 && cp <= 0x3134F) {
        w += 2
      } else {
        w += 1
      }
      i += charLen
    }
  } catch {
    w = s.length
  }
  return w
}

function getPluginSetting(key: string): string {
  return ((plugin as any)._settings?.[key] as string) || ''
}

function getPluginSettings(): Record<string, string> {
  return ((plugin as any)._settings as Record<string, string>) || {}
}

function hasSmtpConfig(settings: Record<string, string>): boolean {
  return !!(settings.smtp_host && settings.smtp_user && settings.smtp_pass)
}

const plugin: Plugin = {
  name: 'native',
  displayName: { zh: '原生评论', en: 'Native' },
  version: '1.0.0',
  description: 'Stores visitor comments in the local AIGCS database with reply, edit, and email notification support.',
  descriptions: { zh: '将访客评论存储到本地 AIGCS 数据库中，支持回复、编辑和邮件通知。' },
  commentHandler: 'visitor',
  defaultSettings: {
    gravatarProxy: '',
    avatarParams: 'd=mp&s=48',
    requiredFields: 'name,email',
    formPosition: 'top',
    aiPosition: 'before',
    fediDisplay: 'mixed',
    fediGroupOrder: 'fediFirst',
    timeFormat: 'relative',
    adminPin: '',
    adminEmail: '',
    captchaEnabled: false,
    smtp_mode: 'global',
    smtp_host: '',
    smtp_port: '',
    smtp_user: '',
    smtp_pass: '',
    smtp_from_email: '',
    smtp_from_name: '',
    showReactions: true,
    emailDeletion: true,
    emailDomainMode: 'off',
    emailDomains: '',
    edit_window_minutes: '3',
    notify_on_comment: true,
    reply_notification: true,
    notify_email: '',
    replyNotificationTemplate: '',
    blockedKeywords: '',
  },

  hooks: {
    onServerInit: (ctx: ServerContext) => {
      _rawDb = ctx.rawDb
      const proxy = getPluginSetting('gravatarProxy')
      console.log('[plugin:native] Initialized, using local DB for visitor comments')
      if (proxy) console.log('[plugin:native] Gravatar proxy:', proxy)
    },

    onFetchComments: async (ctx: FetchContext): Promise<FetchContext> => {
      ctx.config = {
        ...(ctx.config || {}),
        commentPlugin: 'native',
        gravatarProxy: getPluginSetting('gravatarProxy'),
        avatarParams: getPluginSetting('avatarParams') || 'd=mp&s=48',
        requiredFields: getPluginSetting('requiredFields') || 'name,email',
formPosition: getPluginSetting('formPosition') || 'top',
    aiPosition: getPluginSetting('aiPosition') || 'before',
    fediDisplay: getPluginSetting('fediDisplay') || 'mixed',
    fediGroupOrder: getPluginSetting('fediGroupOrder') || 'fediFirst',
    timeFormat: getPluginSetting('timeFormat') || 'relative',
    showReactions: getPluginSettings().showReactions !== false,
    emailDeletion: getPluginSettings().emailDeletion !== false,
    editWindowMinutes: parseInt(getPluginSetting('edit_window_minutes') || '3', 10),
    emailDomainMode: getPluginSetting('emailDomainMode') || 'off',
    emailDomains: getPluginSetting('emailDomains') || '',
        captchaEnabled: getPluginSetting('captchaEnabled') === 'true',
      }

      if (!_rawDb) return ctx

      try {
        const nativeRows = _rawDb.prepare(
          'SELECT id, parent_id, author_name, author_email, author_url, content, created_at, edited_at, visitor_id FROM visitor_comments WHERE site_id = ? AND path = ? AND status = ? ORDER BY created_at ASC'
        ).all(ctx.siteId, ctx.path, 'approved')

        const nativeComments = (nativeRows as any[]).map((r: any) => {
          const email: string = r.author_email || ''
          return {
            id: r.id,
            parentId: r.parent_id || '',
            authorName: r.author_name,
            authorEmail: email,
            authorUrl: r.author_url,
            content: r.content,
            createdAt: r.created_at,
            editedAt: r.edited_at || '',
            avatarHash: email ? md5(email) : '',
            visitorId: r.visitor_id || '',
            source: 'native',
          }
        })
        if (!ctx.visitorComments) ctx.visitorComments = []
        ctx.visitorComments.push(...nativeComments)
      } catch (err) {
        console.warn('[plugin:native] Error fetching visitor comments:', err)
      }

      return ctx
    },

    onCommentSubmit: async (ctx: SubmitContext): Promise<SubmitContext> => {
      if (!_rawDb) return ctx

      const adminPin = getPluginSetting('adminPin')
      const adminEmailSetting = getPluginSetting('adminEmail')

      // Determine admin emails
      let adminEmails: string[] = []
      if (adminEmailSetting) {
        adminEmails = adminEmailSetting.split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
      } else {
        try {
          const row = _rawDb.prepare(
            'SELECT u.email FROM users u JOIN sites s ON s.user_id = u.id WHERE s.id = ?'
          ).get(ctx.siteId) as { email: string } | undefined
          if (row?.email) adminEmails = [row.email.toLowerCase()]
        } catch {}
      }

      // Admin PIN check
      if (adminEmails.length > 0 && adminEmails.includes(ctx.authorEmail.toLowerCase())) {
        if (!adminPin) {
          ctx.result = { error: '管理员邮箱已被保护，但系统未配置 PIN 码，暂禁止使用此邮箱发表评论。' }
          return ctx
        }
        const submittedPin = ctx.pin as string | undefined
        if (!submittedPin) {
          ctx.result = { requirePin: true }
          return ctx
        }
        if (submittedPin !== adminPin) {
          ctx.result = { pinError: true }
          return ctx
        }
      }

      // Email domain mode check (off / whitelist / blacklist)
      const domainMode = getPluginSetting('emailDomainMode') || 'off'
      const domainsRaw = getPluginSetting('emailDomains')
      if (domainMode !== 'off' && domainsRaw) {
        const domainList = domainsRaw.split(',').map(d => d.trim().toLowerCase()).filter(Boolean)
        const emailDomain = ctx.authorEmail.split('@')[1]?.toLowerCase()
        if (emailDomain && domainList.length > 0) {
          if (domainMode === 'whitelist' && !domainList.includes(emailDomain)) {
            ctx.result = { error: '该邮箱域名不在允许列表中' }
            return ctx
          }
          if (domainMode === 'blacklist' && domainList.includes(emailDomain)) {
            ctx.result = { error: '该邮箱域名已被禁止' }
            return ctx
          }
        }
      }

      try {
        // Check blocked keywords
        const blockedRaw = getPluginSetting('blockedKeywords')
        if (blockedRaw) {
          let keywords: string[]
          try { keywords = JSON.parse(blockedRaw) } catch { keywords = [] }
          const lowerContent = ctx.content.toLowerCase()
          for (const kw of keywords) {
            if (kw && lowerContent.includes(kw.toLowerCase())) {
              ctx.result = { error: '评论包含被屏蔽的关键词' }
              return ctx
            }
          }
        }

        const now = new Date().toISOString()

        // Handle edit (update existing comment)
        if (ctx.editId) {
          const existing = _rawDb.prepare(
            'SELECT id, visitor_id, created_at FROM visitor_comments WHERE id = ? AND site_id = ?'
          ).get(ctx.editId, ctx.siteId) as any

          if (!existing) {
            ctx.result = { error: '评论不存在' }
            return ctx
          }

          if (existing.visitor_id && existing.visitor_id !== ctx.visitorId) {
            ctx.result = { error: '无权编辑此评论' }
            return ctx
          }

          const editWindow = parseInt(getPluginSetting('edit_window_minutes') || '3', 10)
          const createdTime = new Date(existing.created_at).getTime()
          if (Date.now() - createdTime > editWindow * 60 * 1000) {
            ctx.result = { error: `评论提交超过 ${editWindow} 分钟，无法编辑` }
            return ctx
          }

          _rawDb.prepare(
            'UPDATE visitor_comments SET content = ?, edited_at = ? WHERE id = ?'
          ).run(ctx.content, now, ctx.editId)

          ctx.result = { id: ctx.editId, edited: true }
          return ctx
        }

        // New comment
        const id = randomUUID()
        const parentId = ctx.parentId || null
        const visitorId = ctx.visitorId || ''

        // Validate authorName length using display width (16 units = ~8 CJK chars)
        const nameWidth = displayWidth(ctx.authorName || '')
        if (nameWidth > 16) {
          ctx.result = { error: `昵称太长，请控制在 8 个汉字以内 (当前宽度: ${nameWidth})` }
          return ctx
        }

        _rawDb.prepare(
          'INSERT INTO visitor_comments (id, site_id, path, parent_id, author_name, author_email, author_url, content, ip, user_agent, status, visitor_id, notify_on_reply, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(id, ctx.siteId, ctx.path, parentId, ctx.authorName, ctx.authorEmail, ctx.authorUrl, ctx.content, ctx.ip, ctx.userAgent, 'approved', visitorId, ctx.notifyReplyAuthor ? 1 : 0, now)

        ctx.result = { id }

        // Send Notification Center alert
        try {
          const row = _rawDb.prepare(
            'SELECT u.id FROM users u JOIN sites s ON s.user_id = u.id WHERE s.id = ?'
          ).get(ctx.siteId) as { id: string } | undefined
          if (row?.id) {
            import('../../../packages/server/src/services/notification.js').then(({ createNotification }) => {
              createNotification(row.id, 'info', '原生评论有新留言', `收到来自访客 ${ctx.authorName} 的新留言`, ctx.siteId)
            }).catch(e => console.error('[plugin:native] Failed to import notification service:', e))
          }
        } catch (err) {
          console.error('[plugin:native] Failed to create notification:', err)
        }

        // Send email notification on new comment
        try {
          const notifyOnComment = getPluginSettings().notify_on_comment
          if (notifyOnComment !== false) {
            const settings = getPluginSettings()
            let notifyEmail = settings.notify_email || ''
            if (!notifyEmail) {
              const row = _rawDb.prepare(
                'SELECT u.email FROM users u JOIN sites s ON s.user_id = u.id WHERE s.id = ?'
              ).get(ctx.siteId) as { email: string } | undefined
              if (row?.email) notifyEmail = row.email
            }

            if (notifyEmail) {
              const { isUnsubscribed, buildUnsubscribeUrl, resolveAdminUrl } = await import('../../../packages/server/src/services/unsubscribe.js')

              if (!isUnsubscribed(_rawDb, notifyEmail, ctx.siteId)) {
                const siteRow = _rawDb.prepare(
                  'SELECT domain FROM sites WHERE id = ?'
                ).get(ctx.siteId) as { domain: string } | undefined

                const siteDomain = siteRow?.domain || ''
                const pageUrl = `https://${siteDomain}${ctx.path}`
                const adminUrl = resolveAdminUrl(process.env.ADMIN_URL, siteDomain)
                const unsubscribeUrl = buildUnsubscribeUrl(adminUrl, notifyEmail, ctx.siteId, 'en')
                const unsubscribeText = 'Unsubscribe'

                const smtpMode = settings.smtp_mode || 'global'
                if (smtpMode === 'custom' && hasSmtpConfig(settings)) {
                  import('../../../packages/server/src/email-templates/index.js').then(({ renderEmail }) => {
                    sendMailWithConfig(settings, notifyEmail,
                      `[AIGCS] 新评论 - ${ctx.authorName}`,
                      renderEmail({
                        template: 'new-comment',
                        title: `New Comment from ${ctx.authorName}`,
                        data: { authorName: ctx.authorName, domain: siteDomain, path: ctx.path, pageUrl, content: ctx.content },
                        adminUrl,
                        unsubscribeUrl,
                        unsubscribeText,
                      }),
                    ).catch(err => console.warn('[plugin:native] Failed to send custom SMTP notification:', err))
                  })
                } else {
                  const { sendEmail } = await import('../../../packages/server/src/services/email.js')
                  const { renderEmail } = await import('../../../packages/server/src/email-templates/index.js')
                  sendEmail(notifyEmail,
                    `[AIGCS] New comment from ${ctx.authorName}`,
                    renderEmail({
                      template: 'new-comment',
                      title: `New Comment from ${ctx.authorName}`,
                      data: { authorName: ctx.authorName, domain: siteDomain, path: ctx.path, pageUrl, content: ctx.content },
                      adminUrl,
                      unsubscribeUrl,
                      unsubscribeText,
                    }),
                  )
                }
              }
            }
          }
        } catch (emailErr) {
          console.warn('[plugin:native] Failed to send notification email:', emailErr)
        }

        // Notify parent comment author on reply
        try {
          const replyNotif = getPluginSetting('reply_notification')
          const replyTemplate = getPluginSetting('replyNotificationTemplate')
          if (ctx.parentId && replyNotif !== 'false') {
            const parentRow = _rawDb.prepare(
              'SELECT author_name, author_email, notify_on_reply FROM visitor_comments WHERE id = ?'
            ).get(ctx.parentId) as { author_name: string; author_email: string; notify_on_reply: number } | undefined

            if (parentRow?.author_email && parentRow.notify_on_reply === 1 && parentRow.author_email.toLowerCase() !== (ctx.authorEmail || '').toLowerCase()) {
              const { isUnsubscribed, buildUnsubscribeUrl, resolveAdminUrl } = await import('../../../packages/server/src/services/unsubscribe.js')

              if (!isUnsubscribed(_rawDb, parentRow.author_email, ctx.siteId)) {
                const siteRow = _rawDb.prepare(
                  'SELECT domain FROM sites WHERE id = ?'
                ).get(ctx.siteId) as { domain: string } | undefined
                const siteDomain = siteRow?.domain || ''
                const pageUrl = `https://${siteDomain}${ctx.path}`
                const adminUrl = resolveAdminUrl(process.env.ADMIN_URL, siteDomain)
                const unsubscribeUrl = buildUnsubscribeUrl(adminUrl, parentRow.author_email, ctx.siteId, 'en')
                const unsubscribeText = 'Unsubscribe'
                const templateData = { authorName: ctx.authorName, domain: siteDomain, path: ctx.path, pageUrl, content: ctx.content }
                let emailBody: string
                if (replyTemplate) {
                  const { renderEmail } = await import('../../../packages/server/src/email-templates/index.js')
                  const Handlebars = (await import('handlebars')).default
                  const customBody = Handlebars.compile(replyTemplate)(templateData)
                  emailBody = renderEmail({ body: customBody, title: `${ctx.authorName} replied to your comment`, data: templateData, adminUrl, unsubscribeUrl, unsubscribeText })
                } else {
                  const { renderEmail } = await import('../../../packages/server/src/email-templates/index.js')
                  emailBody = renderEmail({
                    template: 'reply-notification',
                    title: `${ctx.authorName} replied to your comment`,
                    data: templateData,
                    adminUrl,
                    unsubscribeUrl,
                    unsubscribeText,
                  })
                }
                const settings = getPluginSettings()
                const smtpMode = settings.smtp_mode || 'global'

                if (smtpMode === 'custom' && hasSmtpConfig(settings)) {
                  sendMailWithConfig(settings, parentRow.author_email,
                    `[AIGCS] ${ctx.authorName} 回复了您的评论`,
                    emailBody,
                  ).catch(err => console.warn('[plugin:native] Failed to send custom SMTP reply notification:', err))
                } else {
                  import('../../../packages/server/src/services/email.js').then(({ sendEmail }) => {
                    sendEmail(parentRow.author_email,
                      `[AIGCS] ${ctx.authorName} replied to your comment`,
                      emailBody,
                    ).catch(err => console.warn('[plugin:native] Failed to send global SMTP reply notification:', err))
                  })
                }
              }
            }
          }
        } catch (replyErr) {
          console.warn('[plugin:native] Failed to send reply notification:', replyErr)
        }
      } catch (err) {
        ctx.result = { error: String(err) }
      }

      return ctx
    },
  },
}

async function sendMailWithConfig(settings: Record<string, string>, to: string, subject: string, html: string) {
  const nodemailer = await import('nodemailer')
  const transporter = nodemailer.default.createTransport({
    host: settings.smtp_host,
    port: parseInt(settings.smtp_port || '587', 10),
    secure: parseInt(settings.smtp_port || '587', 10) === 465,
    auth: {
      user: settings.smtp_user || '',
      pass: settings.smtp_pass || '',
    },
  })
  await transporter.sendMail({
    from: `"${settings.smtp_from_name || 'AIGCS Notify'}" <${settings.smtp_from_email || 'noreply@aigcs.local'}>`,
    to,
    subject,
    html,
  })
}

export default plugin
