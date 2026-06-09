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
          <p>AIGCS &mdash; AI Comment System</p>{{#if adminUrl}}<p><a href="{{adminUrl}}">Open Admin Panel</a></p>{{/if}}
        </div>
      </div>
    </div>
  </td></tr></table>
</body>
</html>`

const layoutTemplate = Handlebars.compile(LAYOUT)

const templates: Record<string, Handlebars.TemplateDelegate> = {}

function register(name: string, content: string) {
  templates[name] = Handlebars.compile(content)
}

register('welcome',
`<p>Your AIGCS account has been created.</p>
<p><strong>Email:</strong> {{email}}</p>
<p>You can now add sites and configure AI comment providers.</p>`)

register('delete-code',
`<p>{{prompt}}</p>
<div class="code-block"><strong>{{code}}</strong></div>
<p class="meta">{{expiryHint}}</p>`)

register('comment-generated',
`<p>New AI comments have been generated for your page:</p>
<p><strong>Page:</strong> {{path}}</p>
<p><strong>Site:</strong> {{domain}}</p>`)

register('rss-import',
`<p>RSS/Sitemap import completed for <strong>{{domain}}</strong>.</p>
<hr />
<p><strong>Total entries:</strong> {{total}}</p>
<p><strong>Succeeded:</strong> {{success}}</p>
<p><strong>Failed:</strong> {{fail}}</p>`)

register('smtp-test',
`<p>This is a test email from AIGCS. If you receive this, SMTP is configured correctly.</p>`)

register('new-comment',
`<p><strong>{{authorName}}</strong> commented on <a href="{{pageUrl}}">{{domain}}{{path}}</a>:</p>
<div class="blockquote">{{{content}}}</div>`)

register('reply-notification',
`<p><strong>{{authorName}}</strong> replied to your comment on <a href="{{pageUrl}}">{{domain}}{{path}}</a>:</p>
<div class="blockquote">{{{content}}}</div>`)

export interface RenderEmailOptions {
  template?: string
  body?: string
  data?: Record<string, unknown>
  locale?: string
  title?: string
  adminUrl?: string
  unsubscribeUrl?: string
  unsubscribeText?: string
}

export function renderEmail(opts: RenderEmailOptions): string {
  let body: string
  if (opts.body !== undefined) {
    body = opts.body
  } else if (opts.template) {
    const tmpl = templates[opts.template]
    if (!tmpl) throw new Error(`Unknown email template: ${opts.template}`)
    body = tmpl(opts.data || {})
  } else {
    throw new Error('Either template or body must be provided')
  }
  return layoutTemplate({
    title: opts.title || 'AIGCS',
    locale: opts.locale || 'en',
    body,
    adminUrl: opts.adminUrl || '',
    unsubscribeUrl: opts.unsubscribeUrl || '',
    unsubscribeText: opts.unsubscribeText || 'Unsubscribe',
  })
}
