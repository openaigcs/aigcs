import Handlebars from 'handlebars'

const LAYOUT = `<!DOCTYPE html>
<html lang="{{locale}}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { margin: 0; padding: 0; background-color: #f4f5f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; }
    table { border-collapse: collapse; width: 100%; }
    .wrapper { max-width: 600px; margin: 0 auto; padding: 24px 16px; }
    .card { background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 28px 24px; text-align: center; }
    .header h1 { margin: 0; color: #ffffff; font-size: 18px; font-weight: 600; }
    .body { padding: 24px; font-size: 14px; line-height: 1.7; color: #374151; }
    .body p { margin: 0 0 12px; }
    .body a { color: #6366f1; text-decoration: none; font-weight: 500; }
    .code-block { text-align: center; padding: 16px 0; }
    .code-block strong { font-size: 32px; letter-spacing: 6px; color: #6366f1; font-weight: 700; }
    .blockquote { padding: 12px 16px; margin: 12px 0; border-left: 4px solid #6366f1; background: #f9fafb; border-radius: 8px; font-size: 13px; color: #4b5563; }
    .footer { text-align: center; padding: 20px 24px; font-size: 12px; color: #9ca3af; }
    .footer a { color: #6366f1; }
    .btn { display: inline-block; padding: 10px 20px; background: #6366f1; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 500; }
    .meta { font-size: 12px; color: #9ca3af; margin-top: 8px; }
    hr { border: none; border-top: 1px solid #e5e7eb; margin: 20px 0; }
  </style>
</head>
<body>
  <table><tr><td>
    <div class="wrapper">
      <div class="card">
        <div class="header"><h1>{{title}}</h1></div>
        <div class="body">{{{body}}}</div>
        <div class="footer">
          {{#if unsubscribeUrl}}
          <p><a href="{{unsubscribeUrl}}">{{unsubscribeText}}</a></p>
          {{/if}}
          <p>AIGCS &mdash; AI Comment System</p>{{#if adminUrl}}<p><a href="{{adminUrl}}">Admin</a></p>{{/if}}
        </div>
      </div>
    </div>
  </td></tr></table>
</body>
</html>`

const layoutTemplate = Handlebars.compile(LAYOUT)

const subjectTemplates: Record<string, Record<string, string>> = {
  welcome: {
    en: 'Welcome to AIGCS',
    zh: '欢迎注册 AIGCS',
  },
  'delete-code': {
    en: 'Your verification code',
    zh: '您的验证码',
  },
  'comment-generated': {
    en: 'New AI comments generated',
    zh: '新 AI 评论已生成',
  },
  'rss-import': {
    en: 'RSS import completed',
    zh: 'RSS 导入完成',
  },
  'smtp-test': {
    en: 'AIGCS SMTP Test',
    zh: 'AIGCS SMTP 测试',
  },
  'new-comment': {
    en: 'New visitor comment',
    zh: '新访客评论',
  },
  'reply-notification': {
    en: 'New reply to your comment',
    zh: '您的评论有新回复',
  },
}

const bodyTemplates: Record<string, Record<string, string>> = {
  welcome: {
    en: `<p>Your AIGCS account has been created.</p>
<p><strong>Email:</strong> {{email}}</p>
<p>You can now add sites and configure AI comment providers.</p>`,
    zh: `<p>您的 AIGCS 账号已创建。</p>
<p><strong>邮箱：</strong>{{email}}</p>
<p>现在可以添加站点并配置 AI 评论提供商。</p>`,
  },
  'delete-code': {
    en: `<p>{{prompt}}</p>
<div class="code-block"><strong>{{code}}</strong></div>
<p class="meta">{{expiryHint}}</p>`,
    zh: `<p>{{prompt}}</p>
<div class="code-block"><strong>{{code}}</strong></div>
<p class="meta">{{expiryHint}}</p>`,
  },
  'comment-generated': {
    en: `<p>New AI comments have been generated for your page:</p>
<p><strong>Page:</strong> {{path}}</p>
<p><strong>Site:</strong> {{domain}}</p>`,
    zh: `<p>以下页面的 AI 评论已生成：</p>
<p><strong>页面：</strong>{{path}}</p>
<p><strong>站点：</strong>{{domain}}</p>`,
  },
  'rss-import': {
    en: `<p>RSS/Sitemap import completed for <strong>{{domain}}</strong>.</p>
<hr />
<p><strong>Total entries:</strong> {{total}}</p>
<p><strong>Succeeded:</strong> {{success}}</p>
<p><strong>Failed:</strong> {{fail}}</p>`,
    zh: `<p><strong>{{domain}}</strong> 的 RSS/Sitemap 导入已完成。</p>
<hr />
<p><strong>总计：</strong>{{total}}</p>
<p><strong>成功：</strong>{{success}}</p>
<p><strong>失败：</strong>{{fail}}</p>`,
  },
  'smtp-test': {
    en: `<p>This is a test email from AIGCS. If you receive this, SMTP is configured correctly.</p>`,
    zh: `<p>这是来自 AIGCS 的测试邮件。如果您收到此邮件，说明 SMTP 配置正确。</p>`,
  },
  'new-comment': {
    en: `<p><strong>{{authorName}}</strong> commented on <a href="{{pageUrl}}">{{domain}}{{path}}</a>:</p>
<div class="blockquote">{{{content}}}</div>`,
    zh: `<p><strong>{{authorName}}</strong> 在 <a href="{{pageUrl}}">{{domain}}{{path}}</a> 发表了评论：</p>
<div class="blockquote">{{{content}}}</div>`,
  },
  'reply-notification': {
    en: `<p><strong>{{authorName}}</strong> replied to your comment on <a href="{{pageUrl}}">{{domain}}{{path}}</a>:</p>
<div class="blockquote">{{{content}}}</div>`,
    zh: `<p><strong>{{authorName}}</strong> 在 <a href="{{pageUrl}}">{{domain}}{{path}}</a> 回复了您的评论：</p>
<div class="blockquote">{{{content}}}</div>`,
  },
}

export interface RenderEmailOptions {
  template?: string
  body?: string
  data?: Record<string, unknown>
  locale?: string
  title?: string
  adminUrl?: string
  unsubscribeUrl?: string
  unsubscribeText?: string
  subject?: string
}

export function renderEmail(opts: RenderEmailOptions): string {
  const locale = opts.locale || 'en'
  const enBody = bodyTemplates[opts.template || '']?.en || ''
  const bodySource = bodyTemplates[opts.template || '']?.[locale] || enBody
  const bodyTmpl = Handlebars.compile(bodySource)
  const body = bodyTmpl(opts.data || {})
  return layoutTemplate({
    title: opts.title || 'AIGCS',
    locale,
    body,
    adminUrl: opts.adminUrl || '',
    unsubscribeUrl: opts.unsubscribeUrl || '',
    unsubscribeText: opts.unsubscribeText || (locale === 'zh' ? '取消订阅' : 'Unsubscribe'),
  })
}

export function getEmailSubject(template: string, locale?: string): string {
  const lang = locale || 'en'
  return subjectTemplates[template]?.[lang] || subjectTemplates[template]?.en || 'AIGCS'
}

export function getEmailLocale(rawDb: any): string {
  try {
    const config = rawDb.prepare?.("SELECT email_locale FROM system_config WHERE id = 'global'").get() as { email_locale?: string } | undefined
    if (config?.email_locale) return config.email_locale
  } catch {}
  return 'en'
}