import { marked } from 'marked'
import { TRANSLATIONS } from './i18n.js'

marked.setOptions({ gfm: true, breaks: false })

export function renderMarkdown(text: string): string {
  return marked.parse(text) as string
}

interface CommentDTO {
  id: string
  providerName: string
  model: string
  authorName: string
  authorAvatar: string
  avatarSvg: string
  content: string
  generatedAt: string
  showModel: boolean
  reactions: Record<string, number>
  userVoted: string[]
}

interface WidgetResponse {
  status: 'ready' | 'generating'
  comments?: CommentDTO[]
  visitorComments?: VisitorCommentDTO[]
  estimatedWait?: number
}

interface VisitorCommentDTO {
  id: string
  authorName: string
  authorEmail: string
  authorUrl: string
  content: string
  createdAt: string
  avatarHash?: string
  reactions: Record<string, number>
  userVoted: string[]
}

class AIGCSWidget extends HTMLElement {
  static css = ''
  private shadow: ShadowRoot
  private domain = ''
  private path = ''
  private visitorId = ''
  private pollingTimer: ReturnType<typeof setInterval> | null = null
  private pollCount = 0
  private maxPolls = 40
  private _lang: 'zh-hans' | 'zh-hant' | 'en' = 'en'
  private autoGenerate = false
  private disableCopyright = false
  private serverUrl = ''
  private themeObserver: MutationObserver | null = null
  private darkTheme = ''
  private lightTheme = ''
  private etag: string | null = null
  private commentsData: CommentDTO[] = []
  private visitorComments: VisitorCommentDTO[] = []
  private pluginConfig: Record<string, unknown> | null = null
  private showAiBadge = true
  private aiBadgePosition = 'nick'
  private showReactions = false
  private showAiReactions = true
  private reactionTypes: Array<{ id: string; emoji: string; label: string }> = []
  private showFediBadge = true
  private enabledCommentPlugins: string[] = []
  config: Record<string, unknown> = {}
  private adminPinSession = ''
  private replyToId = ''
  private editableComments = new Map<string, string>()
  private editCommentId = ''
  private deleteFormId = ''
  private pinRequired = false
  private _pickerClickHandler: (() => void) | null = null
  private captchaConfig: { provider: string; siteKey: string } | null = null
  private captchaToken = ''
  private _contentListenersAttached = false

  static get observedAttributes() {
    return ['theme', 'light-theme', 'dark-theme', 'server', 'auto-generate', 'disable-copyright']
  }

  constructor() {
    super()
    this.shadow = this.attachShadow({ mode: 'open' })
  }

  connectedCallback() {
    this.domain = this.getAttribute('domain') || ''
    this.path = this.getAttribute('path') || window.location.pathname
    this._lang = this.detectLang()
    this.autoGenerate = this.getAttribute('auto-generate') === 'true'
    this.disableCopyright = this.getAttribute('disable-copyright') === 'true'
    this.darkTheme = this.getAttribute('dark-theme') || ''
    this.lightTheme = this.getAttribute('light-theme') || ''

    this.visitorId = localStorage.getItem('aigcs_visitor') || ''
    if (!this.visitorId) {
      this.visitorId = crypto.randomUUID()
      localStorage.setItem('aigcs_visitor', this.visitorId)
    }

    this.applyTheme()
    this.render()
    this.fetchComments()

    this.themeObserver = new MutationObserver(() => this.applyTheme())
    this.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] })
    this.themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-theme'] })
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
    if (name === 'theme') {
      this.applyTheme()
    } else if (name === 'theme-color') {
      if (newValue === 'inverted') {
        this.dataset.themeColor = 'inverted'
      } else {
        delete this.dataset.themeColor
      }
    } else if (name === 'server') {
      this.serverUrl = newValue || ''
    } else if (name === 'auto-generate') {
      this.autoGenerate = newValue === 'true'
    } else if (name === 'disable-copyright') {
      this.disableCopyright = newValue === 'true'
    } else if (name === 'dark-theme') {
      this.darkTheme = newValue || ''
      this.applyTheme()
    } else if (name === 'light-theme') {
      this.lightTheme = newValue || ''
      this.applyTheme()
    }
  }

  disconnectedCallback() {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer)
    }
    this.themeObserver?.disconnect()
  }

  private detectLang(): 'zh-hans' | 'zh-hant' | 'en' {
    const attr = this.getAttribute('lang')
    if (attr === 'zh-hans') return 'zh-hans'
    if (attr === 'zh-hant') return 'zh-hant'
    if (attr === 'en') return 'en'

    // 'zh', 'auto', or unset → detect from browser
    const full = (navigator.language || '').replace(/_/g, '-')
    const primary = full.slice(0, 2)
    if (primary === 'zh') {
      const region = full.split('-')[1] || ''
      if (region === 'TW' || region === 'HK' || region === 'MO' || region === 'Hant') return 'zh-hant'
      return 'zh-hans'
    }
    if (primary === 'en') return 'en'

    // Fallback: check html lang
    const htmlLang = document.documentElement.lang?.replace(/_/g, '-').slice(0, 2)
    if (htmlLang === 'zh') return 'zh-hans'
    return 'en'
  }

  private t(key: string): string {
    const lang = this._lang
    if (lang === 'zh-hant') {
      return TRANSLATIONS['zh-hant']?.[key] || TRANSLATIONS['zh-hans']?.[key] || TRANSLATIONS['en'][key] || key
    }
    return TRANSLATIONS[lang]?.[key] || TRANSLATIONS['en'][key] || key
  }

  private applyTheme() {
    const theme = this.getAttribute('theme') || 'auto'
    const lightTheme = this.getAttribute('light-theme') || 'light'
    const darkTheme = this.getAttribute('dark-theme') || 'dark_dimmed'
    let isDark = false
    if (theme === 'dark') {
      isDark = true
    } else if (theme === 'light') {
      isDark = false
    } else if (
      document.documentElement.classList.contains('dark') ||
      document.documentElement.dataset.theme === 'dark' ||
      document.body.classList.contains('dark') ||
      document.body.dataset.theme === 'dark'
    ) {
      isDark = true
    }
    if (isDark) {
      this.dataset.theme = 'dark'
      this.dataset.activeTheme = darkTheme
    } else {
      this.dataset.theme = 'light'
      this.dataset.activeTheme = lightTheme
    }
  }

  private render() {
    const hideTitle = this.getAttribute('hide-title') === 'true'
    const titleKey = this.pluginConfig ? 'visitorTitle' : 'title'
    this.shadow.innerHTML = `
      <style>${AIGCSWidget.css}</style>
      <div class="aigcs-wrapper">
        ${hideTitle ? '' : `<div class="aigcs-title-row"><h3>${this.t(titleKey)}</h3>${this.disableCopyright ? '' : `<p class="aigcs-powered">${this.t('poweredBy')}</p>`}</div>`}
        <div id="content">${this.t('loading')}</div>
      </div>
    `
  }

  private getContentEl() {
    return this.shadow.querySelector('#content') as HTMLElement
  }

  private async fetchComments(force = false) {
    const el = this.getContentEl()
    if (!el) return

    try {
      const base = this.serverUrl || ''
      const generate = this.autoGenerate ? '' : '&generate=false'
      let url = `${base}/api/widget/${this.domain}/comments?path=${encodeURIComponent(this.path)}${generate}&_v=${this.visitorId}`
      if (force) url += `&_t=${Date.now()}`
      const res = await fetch(url, {
        headers: this.etag ? { 'If-None-Match': this.etag } : {},
      })
      if (res.status === 304) return
      this.etag = res.headers.get('ETag') || null
      const json = await res.json() as { code: number; data: WidgetResponse }

      // Apply server-provided theme defaults if widget has no explicit attributes
      const serverConfig = (json.data as any)._config?.theme
      if (serverConfig) {
        let needsReapply = false
        if (serverConfig.theme && !this.hasAttribute('theme')) {
          this.setAttribute('theme', serverConfig.theme)
          needsReapply = true
        }
        if (serverConfig.lightTheme && !this.hasAttribute('light-theme')) {
          this.setAttribute('light-theme', serverConfig.lightTheme)
          needsReapply = true
        }
        if (serverConfig.darkTheme && !this.hasAttribute('dark-theme')) {
          this.setAttribute('dark-theme', serverConfig.darkTheme)
          needsReapply = true
        }
        if (needsReapply) this.applyTheme()
      }

      if (json.data.status === 'generating') {
        el.innerHTML = `<div class="aigcs-loading">${this.t('loading')}</div>`
        this.startPolling()
        return
      }

      this.commentsData = json.data.comments || []
      this.visitorComments = json.data.visitorComments || []
      const rawConfig = (json.data as any)._config || {}
      this.config = rawConfig
      this.pluginConfig = Array.isArray(rawConfig.commentPlugin)
        ? (rawConfig.commentPlugin.length > 0 ? rawConfig : null)
        : (rawConfig.commentPlugin ? rawConfig : null)
      this.showAiBadge = rawConfig.showAiBadge !== false
      this.aiBadgePosition = (rawConfig.aiBadgePosition as string) || 'nick'
      this.showFediBadge = rawConfig.showFediBadge !== false
      this.enabledCommentPlugins = Array.isArray(rawConfig.enabledCommentPlugins) ? rawConfig.enabledCommentPlugins : []
      this.showReactions = rawConfig.showReactions !== false
      this.showAiReactions = rawConfig.aiShowReactions !== false
      this.reactionTypes = Array.isArray(rawConfig.reactionTypes) ? rawConfig.reactionTypes : []
      this.renderContent()
    } catch {
      el.innerHTML = `<div class="aigcs-error">${this.t('error')}</div>`
    }
  }

  private startPolling() {
    this.pollCount = 0
    this.pollingTimer = setInterval(async () => {
      this.pollCount++
      if (this.pollCount > this.maxPolls) {
        if (this.pollingTimer) clearInterval(this.pollingTimer)
        const el = this.getContentEl()
        if (el) el.innerHTML = `<div class="aigcs-error">${this.t('timeout')}</div>`
        return
      }
      await this.fetchComments()
    }, 3000)
  }

  private formatTime(dateStr: string): string {
    const isZh = this._lang === 'zh-hans' || this._lang === 'zh-hant'
    const fmt = (this.pluginConfig?.timeFormat as string) || 'relative'
    if (fmt === 'absolute') {
      return new Date(dateStr).toLocaleString(isZh ? 'zh-CN' : 'en-US')
    }
    if (fmt === 'iso') {
      return new Date(dateStr).toISOString()
    }
    const now = Date.now()
    const then = new Date(dateStr).getTime()
    const diffSec = Math.floor((now - then) / 1000)
    const rtf = new Intl.RelativeTimeFormat(isZh ? 'zh-CN' : 'en-US', { numeric: 'auto' })
    if (diffSec < 60) return rtf.format(-diffSec, 'second')
    const diffMin = Math.floor(diffSec / 60)
    if (diffMin < 60) return rtf.format(-diffMin, 'minute')
    const diffHr = Math.floor(diffMin / 60)
    if (diffHr < 24) return rtf.format(-diffHr, 'hour')
    const diffDay = Math.floor(diffHr / 24)
    if (diffDay < 7) return rtf.format(-diffDay, 'day')
    const diffWeek = Math.floor(diffDay / 7)
    if (diffWeek < 5) return rtf.format(-diffWeek, 'week')
    const diffMonth = Math.floor(diffDay / 30)
    if (diffMonth < 12) return rtf.format(-diffMonth, 'month')
    return rtf.format(-Math.floor(diffDay / 365), 'year')
  }

  private renderContent() {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer)
      this.pollingTimer = null
    }

    const el = this.getContentEl()
    if (!el) return

    const commentLimit = parseInt(this.getAttribute('comment-limit') || '0', 10)
    const rendered: string[] = []

    const aiComments = commentLimit > 0
      ? this.commentsData.slice(0, commentLimit)
      : this.commentsData

    if (this.pluginConfig) {
      const formPosition = (this.pluginConfig.formPosition as string) || 'bottom'
      const aiPosition = (this.pluginConfig.aiPosition as string) || 'before'
      const fediDisplay = (this.pluginConfig.fediDisplay as string) || 'mixed'
      const fediGroupOrder = (this.pluginConfig.fediGroupOrder as string) || 'fediFirst'

      // Render form at top if configured (skip if replying inline)
      const isNativeEnabled = this.enabledCommentPlugins.length === 0 || this.enabledCommentPlugins.includes('native')
      if (isNativeEnabled && !this.replyToId && formPosition === 'top') {
        rendered.push(this.renderCommentForm())
      }

      // Filter visitor comments by enabled plugins
      const sourcePluginMap: Record<string, string> = {
        native: 'native',
        fedi: 'mastodon',
      }
      const isSourceEnabled = (source?: string) => {
        if (this.enabledCommentPlugins.length === 0) return true
        if (!source) return this.enabledCommentPlugins.includes('native')
        const plugin = sourcePluginMap[source] || source
        return this.enabledCommentPlugins.includes(plugin)
      }
      const filteredComments = this.visitorComments.filter((c: any) => isSourceEnabled(c.source))

      // Separate fedi comments for badge rendering
      const nativeComments = filteredComments.filter((c: any) => c.source !== 'fedi')
      const fediComments = filteredComments.filter((c: any) => c.source === 'fedi')

      // Build comment trees
      const buildForest = (comments: any[]) => {
        const map = new Map<string, any[]>()
        for (const c of comments) {
          const pid = c.parentId || '__root__'
          if (!map.has(pid)) map.set(pid, [])
          map.get(pid)!.push(c)
        }
        const tree = (parentId: string): any[] => {
          const nodes = (map.get(parentId) || []).map(c => ({ data: c, children: tree(c.id) }))
          return nodes.filter(node => {
            const isSoftDeleted = node.data.authorName === '已删除' || node.data.content === '此评论已被作者删除'
            if (isSoftDeleted && node.children.length === 0) {
              return false
            }
            return true
          })
        }
        return tree('__root__')
      }

      const nativeForest = buildForest(nativeComments)
      const fediForest = buildForest(fediComments)

      // Build unified list: AI + visitor trees (with fedi support)
      const unified: Array<{ type: 'ai'; data: any } | { type: 'tree'; root: any; group?: 'native' | 'fedi' }> = []

      const pushAi = () => aiComments.forEach(c => unified.push({ type: 'ai', data: c }))

      if (fediDisplay === 'mixed') {
        // Interleave fedi + native root comments by time
        const allRoots: Array<{ type: 'tree'; root: any; group: 'native' | 'fedi' }> = [
          ...nativeForest.map(r => ({ type: 'tree' as const, root: r, group: 'native' as const })),
          ...fediForest.map(r => ({ type: 'tree' as const, root: r, group: 'fedi' as const })),
        ]
        allRoots.sort((a, b) => new Date(a.root.data.createdAt).getTime() - new Date(b.root.data.createdAt).getTime())

        if (aiPosition === 'before') pushAi()
        unified.push(...allRoots)
        if (aiPosition === 'after') pushAi()
      } else {
        // Separate native + fedi groups
        if (aiPosition === 'before') pushAi()
        if (fediGroupOrder === 'fediFirst') {
          fediForest.forEach(r => unified.push({ type: 'tree', root: r, group: 'fedi' }))
          nativeForest.forEach(r => unified.push({ type: 'tree', root: r, group: 'native' }))
        } else {
          nativeForest.forEach(r => unified.push({ type: 'tree', root: r, group: 'native' }))
          fediForest.forEach(r => unified.push({ type: 'tree', root: r, group: 'fedi' }))
        }
        if (aiPosition === 'after') pushAi()
      }

      if (unified.length > 0) {
        for (const item of unified) {
          if (item.type === 'tree') {
            rendered.push(`<div class="aigcs-comment-group">`)
            this.renderCommentTree(item.root, 1, rendered, item.group)
            rendered.push(`</div>`)
          } else {
            rendered.push(`<div class="aigcs-comment-card">${this.renderCommentCard('ai', item.data)}</div>`)
          }
        }
      } else {
        rendered.push(`<div class="aigcs-loading">${this.t('empty')}</div>`)
      }

      // Render form at bottom (only if not replying inline)
      if (isNativeEnabled && !this.replyToId && formPosition === 'bottom') {
        rendered.push(this.renderCommentForm())
      }
    } else {
      // No plugin: original AI-only behavior
      if (aiComments.length > 0) {
        rendered.push(...aiComments.map(c => `<div class="aigcs-comment-card">${this.renderCommentCard('ai', c)}</div>`))
      } else {
        rendered.push(`<div class="aigcs-loading">${this.t('empty')}</div>`)
      }
    }

    el.innerHTML = rendered.join('')

    this.renderReactionListeners(el)
    this.initFormExtras()

    // Restore delete form visibility after re-render
    if (this.deleteFormId) {
      const form = this.shadow.getElementById(`delete-email-${this.deleteFormId}`)
      if (form) form.classList.remove('aigcs-hidden')
    }
  }

  private renderCommentForm(): string {
    const requiredFields = ((this.pluginConfig?.requiredFields as string) || 'name,email').split(',').map(s => s.trim())
    const req = (f: string) => requiredFields.includes(f) ? ' required' : ''
    const star = (f: string) => requiredFields.includes(f) ? '<span class="aigcs-form-required">*</span>' : ''
    const pinRow = this.pinRequired
      ? `<div class="aigcs-form-pin-row" id="aigcs-form-pin-row"><span class="aigcs-form-pin-label">${this.t('pinRequired')}</span><input class="aigcs-form-input aigcs-form-pin-input" id="aigcs-form-pin" type="password" placeholder="${this.t('adminPin')}" /></div>`
      : ''
    return `<div class="aigcs-comment-form" id="aigcs-comment-form">
      <div class="aigcs-form-row">
        <label class="aigcs-form-label"><span>${this.t('formName')}${star('name')}</span><input class="aigcs-form-input" id="aigcs-form-name" type="text" placeholder="${this.t('formName')}"${req('name')} /></label>
        <label class="aigcs-form-label"><span>${this.t('formEmail')}${star('email')}</span><input class="aigcs-form-input" id="aigcs-form-email" type="email" placeholder="${this.t('formEmail')}"${req('email')} /></label>
        <label class="aigcs-form-label"><span>${this.t('formUrl')}${star('url')}</span><input class="aigcs-form-input" id="aigcs-form-url" type="url" placeholder="${this.t('formUrl')}"${req('url')} /></label>
      </div>
      <textarea class="aigcs-form-textarea" id="aigcs-form-content" placeholder="${this.t('formContent')}" required></textarea>
      ${pinRow}
      <div class="aigcs-captcha-container aigcs-hidden" id="aigcs-captcha-container"></div>
      <label class="aigcs-reply-notify"><input type="checkbox" id="aigcs-reply-notify" /> ${this.t('replyNotify')}</label>
      <div class="aigcs-form-actions">
        <button class="aigcs-form-submit" id="aigcs-form-submit">${this.replyToId ? this.t('formReply') : this.t('formSubmit')}</button>
        ${this.replyToId ? `<button class="aigcs-header-action-btn" id="aigcs-cancel-reply">${this.t('cancelReply')}</button>` : ''}
      </div>
      <div class="aigcs-form-status" id="aigcs-form-status"></div>
    </div>`
  }

  private renderCommentCard(type: 'ai' | 'visitor' | 'fedi', data: any): string {
    const isSoftDeleted = (type === 'visitor' || type === 'fedi') && (data.authorName === '已删除' || data.content === '此评论已被作者删除')
    const time = data.createdAt || data.generatedAt
    const timeHtml = time && !isSoftDeleted ? `<span class="aigcs-comment-model">· ${this.formatTime(time)}</span>` : ''

    const avatarParams = (this.pluginConfig?.avatarParams as string) || 'd=mp&s=48'

    let avatarInner: string
    if (isSoftDeleted) {
      avatarInner = `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>`
    } else if (type === 'ai' && data.avatarSvg) {
      avatarInner = `<img src="${data.avatarSvg}" alt="${data.authorName}" loading="lazy" />`
    } else if (type === 'fedi' && data.avatar) {
      avatarInner = `<img src="${this.escapeHtml(data.avatar)}" alt="${this.escapeHtml(data.authorName)}" loading="lazy" onerror="this.style.display='none';this.parentNode.innerHTML='<svg viewBox=\\'0 0 24 24\\' width=\\'100%\\' height=\\'100%\\' fill=\\'currentColor\\'><path d=\\'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z\\'/></svg>'" />`
    } else if (type === 'visitor' && data.avatarHash) {
      const hash = data.avatarHash
      const gravatarProxy = (this.pluginConfig?.gravatarProxy as string) || ''
      const src = !gravatarProxy
        ? `https://www.gravatar.com/avatar/${hash}?${avatarParams}`
        : gravatarProxy.includes('HASH')
          ? gravatarProxy.replace('HASH', hash)
          : `https://${gravatarProxy.replace(/^https?:\/\//, '').replace(/\/+$/, '')}/avatar/${hash}?${avatarParams}`
      avatarInner = `<img src="${src}" alt="${this.escapeHtml(data.authorName)}" loading="lazy" onerror="this.style.display='none';this.parentNode.innerHTML='<svg viewBox=\\'0 0 24 24\\' width=\\'100%\\' height=\\'100%\\' fill=\\'currentColor\\'><path d=\\'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z\\'/></svg>'" />`
    } else {
      avatarInner = this.escapeHtml(data.authorName[0])
    }
    const badgePosClass = 'aigcs-ai-badge-' + this.aiBadgePosition
    const showAiBadgeOnAvatar = type === 'ai' && this.showAiBadge && this.aiBadgePosition !== 'nick'
    const avatarHtml = showAiBadgeOnAvatar
      ? `<span class="aigcs-avatar-wrap">${avatarInner}<span class="aigcs-ai-badge ${badgePosClass}">AI</span></span>`
      : avatarInner

    const aiNickBadgeHtml = type === 'ai' && this.showAiBadge && this.aiBadgePosition === 'nick'
      ? `<span class="aigcs-ai-nick-badge" data-tooltip="AI-Generated Comments System.">AI</span>`
      : ''

    const fediBadgeInner = `<span class="aigcs-fedi-badge" data-tooltip="${this.t('fediTitle')}"><svg class="aigcs-fedi-icon" viewBox="0 0 196.52 196.52" width="14" height="14"><path fill="#a730b8" d="M47.924 72.797a18.23 18.23.0 01-7.796 7.76l42.799 42.965 10.318-5.23zm56.453 56.67-10.319 5.23 21.686 21.77a18.23 18.23.0 017.798-7.76z"></path><path fill="#5496be" d="m129.665 102.077 1.786 11.427 27.415-13.895a18.23 18.23.0 01-4.972-9.812zm-14.066 7.128-57.29 29.034a18.23 18.23.0 014.973 9.813l54.103-27.42z"></path><path fill="#ce3d1a" d="m69.531 91.654 8.162 8.193 29.269-57.139a18.23 18.23.0 01-9.787-5.021zm-7.19 14.036L48.34 133.025a18.23 18.23.0 019.786 5.022l12.378-24.164z"></path><path fill="#d0188f" d="M39.89 80.676a18.23 18.23.0 01-10.865 1.72l8.176 52.298a18.23 18.23.0 0110.865-1.72z"></path><path fill="#5b36e9" d="M63.326 148.31a18.23 18.23.0 01-1.732 10.864l52.289 8.39a18.23 18.23.0 011.732-10.862z"></path><path fill="#30b873" d="M134.915 146.918a18.23 18.23.0 019.788 5.023l24.134-47.117a18.23 18.23.0 01-9.787-5.023z"></path><path fill="#ebe305" d="M126.133 33.16a18.23 18.23.0 01-7.798 7.761l37.377 37.52a18.23 18.23.0 017.797-7.76z"></path><path fill="#f47601" d="M44.77 51.628a18.23 18.23.0 014.973 9.812L96.99 37.495a18.23 18.23.0 01-4.971-9.811z"></path><path fill="#57c115" d="M118.25 40.965a18.23 18.23.0 01-10.852 1.812l4.185 26.8 11.42 1.832zm-4.234 44.192 9.895 63.363a18.23 18.23.0 0110.88-1.627l-9.355-59.904z"></path><path fill="#dbb210" d="M49.776 61.641A18.23 18.23.0 0148.082 72.51l26.82 4.307 5.272-10.294zm45.968 7.382L90.472 79.32l63.371 10.177a18.23 18.23.0 011.76-10.859z"></path><path fill="#ffca00" d="M93.439 23.842a1 1 0 1033.092 1.802 1 1 0 10-33.092-1.802"></path><path fill="#64ff00" d="M155.314 85.957a1 1 0 1033.092 1.803 1 1 0 10-33.092-1.803"></path><path fill="#00a3ff" d="M115.347 163.982a1 1 0 1033.092 1.803 1 1 0 10-33.092-1.803"></path><path fill="#9500ff" d="M28.77 150.09a1 1 0 1033.092 1.802A1 1 0 1028.77 150.09"></path><path fill="red" d="M15.23 63.478a1 1 0 1033.092 1.803A1 1 0 1015.23 63.478"></path></svg></span>`
    const fediBadgeHtml = type === 'fedi' && this.showFediBadge
      ? data.statusUrl
        ? `<a href="${this.escapeHtml(data.statusUrl)}" target="_blank" rel="noopener" class="aigcs-fedi-badge" data-tooltip="${this.t('fediTitle')}"><svg class="aigcs-fedi-icon" viewBox="0 0 196.52 196.52" width="14" height="14"><path fill="#a730b8" d="M47.924 72.797a18.23 18.23.0 01-7.796 7.76l42.799 42.965 10.318-5.23zm56.453 56.67-10.319 5.23 21.686 21.77a18.23 18.23.0 017.798-7.76z"></path><path fill="#5496be" d="m129.665 102.077 1.786 11.427 27.415-13.895a18.23 18.23.0 01-4.972-9.812zm-14.066 7.128-57.29 29.034a18.23 18.23.0 014.973 9.813l54.103-27.42z"></path><path fill="#ce3d1a" d="m69.531 91.654 8.162 8.193 29.269-57.139a18.23 18.23.0 01-9.787-5.021zm-7.19 14.036L48.34 133.025a18.23 18.23.0 019.786 5.022l12.378-24.164z"></path><path fill="#d0188f" d="M39.89 80.676a18.23 18.23.0 01-10.865 1.72l8.176 52.298a18.23 18.23.0 0110.865-1.72z"></path><path fill="#5b36e9" d="M63.326 148.31a18.23 18.23.0 01-1.732 10.864l52.289 8.39a18.23 18.23.0 011.732-10.862z"></path><path fill="#30b873" d="M134.915 146.918a18.23 18.23.0 019.788 5.023l24.134-47.117a18.23 18.23.0 01-9.787-5.023z"></path><path fill="#ebe305" d="M126.133 33.16a18.23 18.23.0 01-7.798 7.761l37.377 37.52a18.23 18.23.0 017.797-7.76z"></path><path fill="#f47601" d="M44.77 51.628a18.23 18.23.0 014.973 9.812L96.99 37.495a18.23 18.23.0 01-4.971-9.811z"></path><path fill="#57c115" d="M118.25 40.965a18.23 18.23.0 01-10.852 1.812l4.185 26.8 11.42 1.832zm-4.234 44.192 9.895 63.363a18.23 18.23.0 0110.88-1.627l-9.355-59.904z"></path><path fill="#dbb210" d="M49.776 61.641A18.23 18.23.0 0148.082 72.51l26.82 4.307 5.272-10.294zm45.968 7.382L90.472 79.32l63.371 10.177a18.23 18.23.0 011.76-10.859z"></path><path fill="#ffca00" d="M93.439 23.842a1 1 0 1033.092 1.802 1 1 0 10-33.092-1.802"></path><path fill="#64ff00" d="M155.314 85.957a1 1 0 1033.092 1.803 1 1 0 10-33.092-1.803"></path><path fill="#00a3ff" d="M115.347 163.982a1 1 0 1033.092 1.803 1 1 0 10-33.092-1.803"></path><path fill="#9500ff" d="M28.77 150.09a1 1 0 1033.092 1.802A1 1 0 1028.77 150.09"></path><path fill="red" d="M15.23 63.478a1 1 0 1033.092 1.803A1 1 0 1015.23 63.478"></path></svg></a>`
        : fediBadgeInner
    : ''

    let authorHtml: string
    if (isSoftDeleted) {
      authorHtml = `<span class="aigcs-comment-author aigcs-comment-author-deleted">${this.escapeHtml(data.authorName)}</span>`
    } else if ((type === 'visitor' || type === 'fedi') && data.authorUrl) {
      authorHtml = `${fediBadgeHtml}<a href="${this.escapeHtml(data.authorUrl)}" target="_blank" rel="noopener" class="aigcs-comment-author aigcs-visitor-link">${this.escapeHtml(data.authorName)}</a>`
    } else if (type === 'ai') {
      authorHtml = `${aiNickBadgeHtml}<span class="aigcs-comment-author">${this.escapeHtml(data.authorName)}</span>`
    } else {
      authorHtml = `${fediBadgeHtml}<span class="aigcs-comment-author">${this.escapeHtml(data.authorName)}</span>`
    }

    // Reply-to indicator
    if (!isSoftDeleted && (type === 'visitor' || type === 'fedi') && data.parentId) {
      const parent = this.visitorComments.find(c => c.id === data.parentId)
      if (parent) {
        authorHtml += `<span class="aigcs-reply-to">${this.escapeHtml(parent.authorName)}</span>`
      }
    }

    const modelHtml = type === 'ai' && data.showModel && data.model ? `<span class="aigcs-comment-model">· ${data.model}</span>` : ''
    const reactionsHtml = !isSoftDeleted && data.reactions && (type === 'ai' ? this.showAiReactions : type === 'fedi' ? false : this.showReactions) ? this.renderReactions(data) : ''

    const emptyNote = type === 'ai' && data.authorAvatar === '#empty-content'
      ? `<p class="aigcs-empty-content-note">${this.t('emptyContentWarning')}</p>`
      : ''

    const editedLabel = !isSoftDeleted && (type === 'visitor' || type === 'fedi') && data.editedAt
      ? `<span class="aigcs-edited-label">· ${this.t('edited')}</span>`
      : ''

    // Header action buttons
    let headerActionsHtml = ''
    if (type === 'visitor' && !isSoftDeleted) {
      const btns: string[] = []
      btns.push(`<button class="aigcs-more-toggle" data-comment-id="${data.id}" title="More">⋮</button>`)
      btns.push(`<button class="aigcs-header-action-btn" data-action="reply" data-comment-id="${data.id}">${this.t('reply')}</button>`)

      // Edit button - check time window and session token in editableComments Map
      const editWindow = parseInt(String((this.pluginConfig as any)?.edit_window_minutes || '3'), 10) * 60 * 1000
      const commentTime = data.createdAt ? new Date(data.createdAt).getTime() : 0
      const withinWindow = commentTime > 0 && (Date.now() - commentTime) < editWindow
      if (this.editableComments.has(data.id) && withinWindow) {
        btns.push(`<button class="aigcs-header-action-btn" data-action="edit" data-comment-id="${data.id}">${this.t('edit')}</button>`)
      }

      // PIN delete
      if (this.adminPinSession) {
        btns.push(`<button class="aigcs-header-action-btn" data-action="delete" data-comment-id="${data.id}">${this.t('delete')}</button>`)
      }

      // Email delete
      if (!this.adminPinSession && data.authorEmail && this.config.emailDeletion !== false) {
        btns.push(`<button class="aigcs-header-action-btn" data-action="toggle-email-delete" data-comment-id="${data.id}" title="${this.t('deleteByEmail')}">${this.t('delete')}</button>`)
      }

      if (btns.length > 0) {
        headerActionsHtml = `<span class="aigcs-header-actions">${btns.join('')}</span>`
      }
    }

    // Email delete form
    let emailFormHtml = ''
    if (type === 'visitor' && !isSoftDeleted && !this.adminPinSession && data.authorEmail && this.config.emailDeletion !== false) {
      emailFormHtml = `<div class="aigcs-delete-email-form aigcs-hidden" id="delete-email-${data.id}">
        <input class="aigcs-delete-email-input" type="email" placeholder="${this.t('deleteEmailPlaceholder')}" id="delete-email-input-${data.id}" />
        <button class="aigcs-delete-email-btn" data-action="send-code" data-comment-id="${data.id}">${this.t('sendCode')}</button>
        <input class="aigcs-delete-email-input aigcs-delete-email-input-code" type="text" placeholder="${this.t('verifyCode')}" id="delete-code-input-${data.id}" />
        <button class="aigcs-delete-email-btn" data-action="verify-delete" data-comment-id="${data.id}" disabled>${this.t('verifyDelete')}</button>
        <div class="aigcs-delete-status" id="delete-status-${data.id}"></div>
      </div>`
    }

    // Edit mode content override
    const isEditing = this.editCommentId === data.id
    const contentHtml = isEditing
      ? `<textarea class="aigcs-edit-textarea" id="edit-textarea-${data.id}">${this.escapeHtml(data.content)}</textarea>
         <div class="aigcs-edit-actions">
           <button class="aigcs-edit-save" data-action="save-edit" data-comment-id="${data.id}">${this.t('formSubmit')}</button>
           <button class="aigcs-edit-cancel" data-action="cancel-edit" data-comment-id="${data.id}">${this.t('cancelEdit')}</button>
         </div>`
      : isSoftDeleted
        ? `<div class="aigcs-deleted-content-text">${this.escapeHtml(data.content)}</div>`
        : type === 'fedi'
          ? `${emptyNote}<div class="aigcs-fedi-content">${this.sanitizeHtml(data.content)}</div>`
          : `${emptyNote}<div class="aigcs-md-content">${this.sanitizeHtml(renderMarkdown(data.content))}</div>`

    return `<div class="aigcs-comment-floor ${isSoftDeleted ? 'aigcs-comment-deleted' : ''}">
      <div class="aigcs-comment-body">
        <div class="aigcs-comment-avatar">${avatarHtml}</div>
        <div class="aigcs-comment-main">
          <div class="aigcs-comment-header">
            ${authorHtml}
            ${modelHtml || timeHtml}
            ${editedLabel}
            ${headerActionsHtml}
          </div>
          ${emailFormHtml}
          <div class="aigcs-comment-content">${contentHtml}</div>
          ${reactionsHtml ? `<div class="aigcs-comment-footer">${reactionsHtml}</div>` : ''}
        </div>
      </div>
    </div>`
  }

  private renderCommentTree(node: { data: any; children: any[] }, depth: number, rendered: string[], group?: 'native' | 'fedi') {
    const baseIndent = 2.5
    const type = group === 'fedi' ? 'fedi' : 'visitor'
    const isSoftDeleted = node.data.authorName === '已删除' || node.data.content === '此评论已被作者删除'

    rendered.push(isSoftDeleted ? `<div class="aigcs-comment-collapsed">${this.renderCommentCard(type, node.data)}</div>` : this.renderCommentCard(type, node.data))

    const isNativeEnabled = this.enabledCommentPlugins.length === 0 || this.enabledCommentPlugins.includes('native')
    if (isNativeEnabled && this.replyToId === node.data.id) {
      rendered.push(`<div class="aigcs-inline-reply">${this.renderCommentForm()}</div>`)
    }

    if (node.children.length > 0) {
      // Only create the wrapper once for the first level of replies
      // All nested replies at any depth render directly inside this same wrapper
      if (depth === 1) {
        const threadLeft = baseIndent + 0.5
        rendered.push(`<div class="aigcs-comment-replies" style="padding-left:${baseIndent}rem">`)
        rendered.push(`<div class="aigcs-thread-line" style="left:${threadLeft}rem"></div>`)
      }
      for (const child of node.children) {
        rendered.push(`<div class="aigcs-comment-reply">`)
        this.renderCommentTree(child, depth + 1, rendered, group)
        rendered.push(`</div>`)
      }
      if (depth === 1) {
        rendered.push(`</div>`)
      }
    }
  }

  private initFormExtras() {
    const nameInput = this.shadow.getElementById('aigcs-form-name') as HTMLInputElement
    const emailInput = this.shadow.getElementById('aigcs-form-email') as HTMLInputElement
    const urlInput = this.shadow.getElementById('aigcs-form-url') as HTMLInputElement
    if (nameInput) nameInput.value = localStorage.getItem('aigcs_form_name') || ''
    if (emailInput) emailInput.value = localStorage.getItem('aigcs_form_email') || ''
    if (urlInput) urlInput.value = localStorage.getItem('aigcs_form_url') || ''
  }

  private async initCaptcha(container: HTMLElement) {
    if (!this.captchaConfig) {
      try {
        const base = this.serverUrl || ''
        const res = await fetch(`${base}/api/widget/captcha/config`)
        const json = await res.json() as { code: number; data: { provider: string; siteKey: string } }
        this.captchaConfig = json.data
      } catch {
        return
      }
    }
    if (!this.captchaConfig || this.captchaConfig.provider === 'none') return
    container.style.display = 'block'
    const provider = this.captchaConfig.provider
    const siteKey = this.captchaConfig.siteKey

    if (provider === 'turnstile') {
      this.renderCaptchaScript('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit', 'turnstile', container, siteKey)
    } else if (provider === 'recaptcha') {
      this.renderCaptchaScript('https://www.google.com/recaptcha/api.js', 'grecaptcha', container, siteKey)
    } else if (provider === 'hcaptcha') {
      this.renderCaptchaScript('https://js.hcaptcha.com/1/api.js', 'hcaptcha', container, siteKey)
    } else if (provider === 'cap') {
      this.renderCaptchaScript('https://cdn.cap.so/js/cap.js', 'CAPTCHA', container, siteKey)
    } else if (provider === 'altcha') {
      // Altcha uses a web component — no script load needed if defined, otherwise load it
      if (customElements.get('altcha-widget')) {
        this.renderAltcha(container, siteKey)
      } else {
        const s = document.createElement('script')
        s.src = 'https://cdn.altcha.org/altcha.js'
        s.onload = () => this.renderAltcha(container, siteKey)
        document.head.appendChild(s)
      }
    } else if (provider === 'geetest') {
      this.renderGeetest(container, siteKey)
    }
  }

  private renderCaptchaScript(scriptSrc: string, globalKey: string, container: HTMLElement, siteKey: string) {
    const render = () => {
      const win = window as any
      if (globalKey === 'turnstile' && win.turnstile) {
        container.innerHTML = '<div class="cf-turnstile"></div>'
        win.turnstile.render(container.querySelector('.cf-turnstile'), {
          sitekey: siteKey, callback: (token: string) => { this.captchaToken = token },
        })
      } else if (globalKey === 'grecaptcha' && win.grecaptcha) {
        container.innerHTML = '<div class="g-recaptcha"></div>'
        win.grecaptcha.render(container.querySelector('.g-recaptcha'), {
          sitekey: siteKey, callback: (token: string) => { this.captchaToken = token },
        })
      } else if (globalKey === 'hcaptcha' && win.hcaptcha) {
        container.innerHTML = '<div class="h-captcha"></div>'
        win.hcaptcha.render(container.querySelector('.h-captcha'), {
          sitekey: siteKey, callback: (token: string) => { this.captchaToken = token },
        })
      } else if (globalKey === 'CAPTCHA' && win.CAPTCHA) {
        container.innerHTML = '<div id="cap-captcha"></div>'
        win.CAPTCHA.render(container.querySelector('#cap-captcha'), {
          siteKey, callback: (token: string) => { this.captchaToken = token },
        })
      }
    }
    const win = window as any
    if (win[globalKey]) {
      render()
    } else {
      const s = document.createElement('script')
      s.src = scriptSrc
      s.async = true
      s.defer = true
      s.onload = render
      document.head.appendChild(s)
    }
  }

  private renderAltcha(container: HTMLElement, siteKey: string) {
    container.innerHTML = `<altcha-widget style="--altcha-max-width:100%" sitekey="${siteKey}"></altcha-widget>`
    const el = container.querySelector('altcha-widget') as any
    if (el) {
      el.addEventListener('verified', (e: any) => {
        this.captchaToken = el.payload
      })
    }
  }

  private renderGeetest(container: HTMLElement, siteKey: string) {
    const render = () => {
      const win = window as any
      if (win.initGeetest4) {
        win.initGeetest4({
          captchaId: siteKey,
          product: 'bind',
        }, (captchaObj: any) => {
          captchaObj.onReady(() => captchaObj.showCaptcha())
          captchaObj.onSuccess(() => {
            this.captchaToken = JSON.stringify(captchaObj.getValidate())
            // Automatically submit after captcha
            const submitBtn = this.shadow.getElementById('aigcs-form-submit') as HTMLButtonElement
            if (submitBtn) submitBtn.click()
          })
        })
      }
    }
    const win = window as any
    if (win.initGeetest4) {
      render()
    } else {
      const s = document.createElement('script')
      s.src = 'https://static.geetest.com/v4/gt4.js'
      s.async = true
      s.defer = true
      s.onload = render
      document.head.appendChild(s)
    }
  }

  private async handleDeleteComment(id: string) {
    if (!this.adminPinSession) return
    if (!confirm(this.t('deleteConfirm'))) return
    try {
      const base = this.serverUrl || ''
      const res = await fetch(`${base}/api/widget/${this.domain}/comment/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: this.adminPinSession }),
      })
      const json = await res.json() as { code: number }
      if (json.code === 0) {
        this.visitorComments = this.visitorComments.filter(c => c.id !== id)
        this.renderContent()
      }
    } catch {}
  }

  private renderReactionListeners(el: HTMLElement) {
    if (this._contentListenersAttached) return
    this._contentListenersAttached = true
    
    // Use event delegation on the content container
    el.addEventListener('click', (e) => {
      const target = e.target as HTMLElement

      // Reaction picker trigger
      const trigger = target.closest('.aigcs-reaction-trigger') as HTMLElement
      if (trigger) {
        e.stopPropagation()
        const commentId = trigger.getAttribute('data-picker')
        const picker = commentId ? this.shadow.getElementById(`picker-${commentId}`) : null
        if (picker) picker.classList.toggle('show')
        return
      }

      // Reaction overflow
      const more = target.closest('.aigcs-reaction-more') as HTMLElement
      if (more) {
        e.stopPropagation()
        const overflowId = more.getAttribute('data-overflow')
        const overflow = overflowId ? this.shadow.getElementById(overflowId) : null
        if (overflow) overflow.classList.toggle('show')
        return
      }

      // Reaction item / picker-btn (data-comment + data-type)
      const reactionBtn = target.closest('[data-comment][data-type]') as HTMLElement
      if (reactionBtn) {
        const commentId = reactionBtn.getAttribute('data-comment')
        const reactionType = reactionBtn.getAttribute('data-type')
        if (commentId && reactionType) this.handleReaction(commentId, reactionType)
        return
      }

      // ⋮ toggle
      const moreToggle = target.closest('.aigcs-more-toggle') as HTMLElement
      if (moreToggle) {
        e.stopPropagation()
        const headerActions = moreToggle.closest('.aigcs-header-actions')
        if (headerActions) headerActions.classList.toggle('show')
        return
      }

      // Comment form submit
      if (target.closest('#aigcs-form-submit')) {
        this.handleCommentSubmit()
        return
      }

      // Cancel reply
      if (target.closest('#aigcs-cancel-reply')) {
        this.replyToId = ''
        this.renderContent()
        return
      }

      // Actions via data-action
      const actionBtn = target.closest('[data-action]') as HTMLElement
      if (!actionBtn) return
      const action = actionBtn.getAttribute('data-action')
      const id = actionBtn.getAttribute('data-comment-id')

      if (action === 'delete' && id) {
        this.handleDeleteComment(id)
      } else if (action === 'reply' && id) {
        this.replyToId = id
        this.renderContent()
      } else if (action === 'edit' && id) {
        this.editCommentId = id
        this.renderContent()
        requestAnimationFrame(() => {
          const ta = this.shadow.getElementById(`edit-textarea-${id}`) as HTMLTextAreaElement
          if (ta) ta.focus()
        })
      } else if (action === 'save-edit' && id) {
        this.handleSaveEdit(id)
      } else if (action === 'cancel-edit') {
        this.editCommentId = ''
        this.renderContent()
      } else if (action === 'toggle-email-delete' && id) {
        if (this.deleteFormId === id) {
          this.deleteFormId = ''
        } else {
          this.deleteFormId = id
        }
        this.shadow.querySelectorAll('.aigcs-delete-email-form').forEach(f => {
          f.classList.add('aigcs-hidden')
        })
        if (this.deleteFormId) {
          const form = this.shadow.getElementById(`delete-email-${this.deleteFormId}`)
          if (form) form.classList.remove('aigcs-hidden')
        }
      } else if (action === 'send-code' && id) {
        this.handleSendCode(actionBtn, id)
      } else if (action === 'verify-delete' && id) {
        this.handleVerifyDelete(id)
      }
    })

    // Desktop hover: show header actions
    el.querySelectorAll('.aigcs-comment-floor').forEach((floor) => {
      floor.addEventListener('mouseenter', () => {
        const actions = floor.querySelector('.aigcs-header-actions')
        if (actions) actions.classList.add('hover')
      })
      floor.addEventListener('mouseleave', () => {
        const actions = floor.querySelector('.aigcs-header-actions')
        if (actions) actions.classList.remove('hover')
      })
    })

    // Close pickers on outside click (only once)
    if (!this._pickerClickHandler) {
      this._pickerClickHandler = () => {
        this.shadow.querySelectorAll('.aigcs-reaction-picker.show').forEach(p => p.classList.remove('show'))
        this.shadow.querySelectorAll('.aigcs-reaction-overflow.show').forEach(o => o.classList.remove('show'))
        this.shadow.querySelectorAll('.aigcs-header-actions.show').forEach(a => a.classList.remove('show'))
      }
      document.addEventListener('click', this._pickerClickHandler)
    }
  }

  private async handleSaveEdit(id: string) {
    const ta = this.shadow.getElementById(`edit-textarea-${id}`) as HTMLTextAreaElement
    if (!ta || !ta.value.trim()) return
    try {
      const base = this.serverUrl || ''
      const res = await fetch(`${base}/api/widget/${this.domain}/comment/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: ta.value.trim(),
          visitorId: this.visitorId,
          editToken: this.editableComments.get(id) || '',
        }),
      })
      const json = await res.json()
      if (json.code === 0) {
        this.editCommentId = ''
        this.fetchComments(true)
      }
    } catch {}
  }

  private async handleSendCode(btn: HTMLElement, id: string) {
    const emailInput = this.shadow.getElementById(`delete-email-input-${id}`) as HTMLInputElement
    const statusEl = this.shadow.getElementById(`delete-status-${id}`) as HTMLElement
    if (!emailInput || !emailInput.value.trim()) {
      statusEl.textContent = this.t('deleteEmailRequired')
      return
    }
    btn.setAttribute('disabled', '')
    try {
      const base = this.serverUrl || ''
      const res = await fetch(`${base}/api/widget/${this.domain}/comment/${id}/request-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailInput.value.trim() }),
      })
      let msg: string
      try {
        const json = await res.json()
        if (json.code === 0) {
          msg = this.t('codeSent')
          const verifyBtn = this.shadow.querySelector(`[data-action="verify-delete"][data-comment-id="${id}"]`) as HTMLElement
          if (verifyBtn) verifyBtn.removeAttribute('disabled')
          const codeInput = this.shadow.getElementById(`delete-code-input-${id}`) as HTMLInputElement
          if (codeInput) setTimeout(() => codeInput.focus(), 100)
        } else {
          msg = json.message || this.t('deleteFormError')
        }
      } catch {
        msg = `\u8BF7\u6C42\u5931\u8D25 (HTTP ${res.status})`
      }
      statusEl.textContent = msg
    } catch {
      statusEl.textContent = this.t('deleteFormError')
    }
    setTimeout(() => btn.removeAttribute('disabled'), 2000)
  }

  private async handleVerifyDelete(id: string) {
    const emailInput = this.shadow.getElementById(`delete-email-input-${id}`) as HTMLInputElement
    const codeInput = this.shadow.getElementById(`delete-code-input-${id}`) as HTMLInputElement
    const statusEl = this.shadow.getElementById(`delete-status-${id}`) as HTMLElement
    if (!emailInput || !codeInput || !emailInput.value.trim() || !codeInput.value.trim()) {
      statusEl.textContent = this.t('deleteEmailRequired')
      return
    }
    try {
      const base = this.serverUrl || ''
      const res = await fetch(`${base}/api/widget/${this.domain}/comment/${id}/verify-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailInput.value.trim(), code: codeInput.value.trim() }),
      })
      let msg: string
      try {
        const json = await res.json()
        if (json.code === 0) {
          this.visitorComments = this.visitorComments.filter(c => c.id !== id)
          this.renderContent()
          return
        }
        msg = json.message || this.t('deleteFormError')
      } catch {
        msg = `\u8BF7\u6C42\u5931\u8D25 (HTTP ${res.status})`
      }
      statusEl.textContent = msg
    } catch {
      statusEl.textContent = this.t('deleteFormError')
    }
  }

  private async handleReaction(commentId: string, reactionType: string) {
    try {
      const base = this.serverUrl || ''
      const res = await fetch(`${base}/api/widget/${this.domain}/react`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentId, reaction: reactionType, visitorId: this.visitorId }),
      })
      const json = await res.json() as { code: number; data: { action: string } }
      const comment = this.commentsData.find(c => c.id === commentId) || this.visitorComments.find(c => c.id === commentId)
      if (!comment) return
      if (json.data?.action === 'added') {
        comment.reactions[reactionType] = (comment.reactions[reactionType] || 0) + 1
        comment.userVoted.push(reactionType)
      } else if (json.data?.action === 'removed') {
        comment.reactions[reactionType] = Math.max(0, (comment.reactions[reactionType] || 1) - 1)
        comment.userVoted = comment.userVoted.filter(t => t !== reactionType)
      }
      this.renderContent()
    } catch {}
  }

  private displayWidth(s: string): number {
    let w = 0
    try {
      const seg = new Intl.Segmenter('en', { granularity: 'grapheme' })
      for (const { segment } of seg.segment(s)) {
        const cp = segment.codePointAt(0)!
        if (cp >= 0x1100 && cp <= 0x115F || cp === 0x2329 || cp === 0x232A ||
            cp >= 0x2E80 && cp <= 0x9FFF || cp >= 0xA000 && cp <= 0xA4CF ||
            cp >= 0xAC00 && cp <= 0xD7AF || cp >= 0xF900 && cp <= 0xFAFF ||
            cp >= 0xFE30 && cp <= 0xFE6F || cp >= 0xFF01 && cp <= 0xFF60 ||
            cp >= 0xFFE0 && cp <= 0xFFE6 || cp >= 0x1B000 && cp <= 0x1B0FF ||
            cp >= 0x20000 && cp <= 0x2FA1F || cp >= 0x30000 && cp <= 0x3134F ||
            segment.length > 1) {
          w += 2
        } else {
          w += 1
        }
      }
    } catch {
      w = s.length
    }
    return w
  }

  private async handleCommentSubmit() {
    const nameInput = this.shadow.getElementById('aigcs-form-name') as HTMLInputElement
    const emailInput = this.shadow.getElementById('aigcs-form-email') as HTMLInputElement
    const urlInput = this.shadow.getElementById('aigcs-form-url') as HTMLInputElement
    const contentInput = this.shadow.getElementById('aigcs-form-content') as HTMLTextAreaElement
    const statusEl = this.shadow.getElementById('aigcs-form-status') as HTMLElement
    const submitBtn = this.shadow.getElementById('aigcs-form-submit') as HTMLButtonElement

    if (!nameInput || !contentInput || !statusEl || !submitBtn) return

    const captchaContainer = this.shadow.getElementById('aigcs-captcha-container') as HTMLElement
    if (captchaContainer && (this.pluginConfig?.captchaEnabled as boolean) && !this.captchaToken) {
      captchaContainer.classList.remove('aigcs-hidden')
      this.initCaptcha(captchaContainer)
      statusEl.textContent = this.t('captchaPrompt')
      return
    }

    const requiredFields = ((this.pluginConfig?.requiredFields as string) || 'name,email').split(',').map(s => s.trim())
    const name = nameInput.value.trim()
    const email = emailInput?.value?.trim() || ''
    const url = urlInput?.value?.trim() || ''
    const content = contentInput.value.trim()
    if (!name || !content || (requiredFields.includes('email') && !email) || (requiredFields.includes('url') && !url)) {
      statusEl.textContent = this.t('formError')
      return
    }

    if (this.displayWidth(name) > 16) {
      statusEl.textContent = this.t('nameTooLong')
      return
    }

    submitBtn.disabled = true
    submitBtn.textContent = this.t('formSubmitting')

    const pinInput = this.shadow.getElementById('aigcs-form-pin') as HTMLInputElement

    const body: Record<string, string> = {
      path: this.path,
      authorName: name,
      authorEmail: emailInput?.value?.trim() || '',
      authorUrl: urlInput?.value?.trim() || '',
      content,
    }

    if (pinInput?.value?.trim()) {
      body.pin = pinInput.value.trim()
    } else if (this.adminPinSession) {
      body.pin = this.adminPinSession
    }
    if (this.captchaToken) {
      body.captchaToken = this.captchaToken
    }

    if (this.replyToId) {
      body.parentId = this.replyToId
    }

    const notifyCheckbox = this.shadow.getElementById('aigcs-reply-notify') as HTMLInputElement
    if (notifyCheckbox) {
      body.notifyReplyAuthor = notifyCheckbox.checked ? 'true' : ''
    }

    try {
      const base = this.serverUrl || ''
      const res = await fetch(`${base}/api/widget/${this.domain}/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const json = await res.json()
      if (json.code === 0) {
        if (json.data?.requirePin || json.data?.requiresPin) {
          // Server requires PIN — show PIN input
          const savedName = nameInput.value
          const savedEmail = emailInput?.value || ''
          const savedUrl = urlInput?.value || ''
          const savedContent = contentInput.value
          this.pinRequired = true
          this.renderContent()
          requestAnimationFrame(() => {
            const newPin = this.shadow.getElementById('aigcs-form-pin') as HTMLInputElement
            if (newPin) newPin.focus()
            const newName = this.shadow.getElementById('aigcs-form-name') as HTMLInputElement
            if (newName) newName.value = savedName
            const newEmail = this.shadow.getElementById('aigcs-form-email') as HTMLInputElement
            if (newEmail) newEmail.value = savedEmail
            const newUrl = this.shadow.getElementById('aigcs-form-url') as HTMLInputElement
            if (newUrl) newUrl.value = savedUrl
            const newContent = this.shadow.getElementById('aigcs-form-content') as HTMLTextAreaElement
            if (newContent) newContent.value = savedContent
          })
          statusEl.textContent = ''
          return
        }
        if (json.data?.pinError || json.data?.error) {
          statusEl.textContent = this.t('pinError')
          submitBtn.disabled = false
          submitBtn.textContent = this.t('formSubmit')
          this.captchaToken = ''
          return
        }
        if (json.data?.id) {
          // Store editToken in memory Map if returned
          if (json.data.editToken) {
            this.editableComments.set(json.data.id, json.data.editToken)
          }
          // Store PIN in session if it was used
          if (body.pin && !this.adminPinSession) {
            this.adminPinSession = body.pin
            this.pinRequired = false
            this.renderContent()
            return
          }
          statusEl.textContent = this.t('formSuccess')
          localStorage.setItem('aigcs_form_name', nameInput.value)
          localStorage.setItem('aigcs_form_email', emailInput.value)
          localStorage.setItem('aigcs_form_url', urlInput.value)
          contentInput.value = ''
          this.pinRequired = false
          this.captchaToken = ''
          setTimeout(() => this.fetchComments(true), 1500)
        }
      } else {
        statusEl.textContent = json.data?.error || this.t('formError')
        this.captchaToken = ''
      }
    } catch {
      statusEl.textContent = this.t('formError')
      this.captchaToken = ''
    } finally {
      submitBtn.disabled = false
      submitBtn.textContent = this.t('formSubmit')
    }
  }

  private renderReactions(c: CommentDTO): string {
    const types = this.reactionTypes.length > 0 ? this.reactionTypes : []
    const entries = types.map(t => [t.id, c.reactions[t.id] || 0] as [string, number])

    let html = '<div class="aigcs-reactions">'

    html += `<button class="aigcs-reaction-trigger" data-picker="${c.id}"><svg height="18" viewBox="0 0 16 16" width="18"><path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm3.82 1.636a.75.75 0 0 1 1.038.175l.007.009c.103.118.22.222.35.31.264.178.683.37 1.285.37.602 0 1.02-.192 1.285-.371.13-.088.247-.192.35-.31l.007-.008a.75.75 0 0 1 1.222.87l-.022-.015c.02.013.021.015.021.015v.001l-.001.002-.002.003-.005.007-.014.019a2.066 2.066 0 0 1-.184.213c-.16.166-.338.316-.53.445-.63.418-1.37.638-2.127.629-.946 0-1.652-.308-2.126-.63a3.331 3.331 0 0 1-.715-.657l-.014-.02-.005-.006-.002-.003v-.002h-.001l.613-.432-.614.43a.75.75 0 0 1 .183-1.044ZM12 7a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM5 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm5.25 2.25.592.416a97.71 97.71 0 0 0-.592-.416Z"/></svg></button>`

    html += `<div class="aigcs-reaction-picker" id="picker-${c.id}">`
    types.forEach(t => {
      html += `<button class="aigcs-reaction-picker-btn" data-comment="${c.id}" data-type="${t.id}">${t.emoji}</button>`
    })
    html += '</div>'

    const activeEntries = entries.filter(([, count]) => count > 0)
    const visible = activeEntries.slice(0, 3)
    const overflow = activeEntries.slice(3)

    visible.forEach(([type, count]) => {
      const active = c.userVoted.includes(type) ? 'active' : ''
      const emoji = types.find(t => t.id === type)?.emoji || '👍'
      html += `<button class="aigcs-reaction-item ${active}" data-comment="${c.id}" data-type="${type}">
        <span class="aigcs-emoji">${emoji}</span>
        <span class="aigcs-count">${count}</span>
      </button>`
    })

    if (overflow.length > 0) {
      html += `<button class="aigcs-reaction-more" data-overflow="overflow-${c.id}">+${overflow.length}</button>`
      html += `<div class="aigcs-reaction-overflow" id="overflow-${c.id}">`
      overflow.forEach(([type, count]) => {
        const active = c.userVoted.includes(type) ? 'active' : ''
        const emoji = types.find(t => t.id === type)?.emoji || '👍'
        html += `<button class="aigcs-reaction-item ${active}" data-comment="${c.id}" data-type="${type}">
          <span class="aigcs-emoji">${emoji}</span>
          <span class="aigcs-count">${count}</span>
        </button>`
      })
      html += '</div>'
    }

    html += '</div>'
    return html
  }

  private getEmoji(type: string): string {
    const rt = this.reactionTypes.find(t => t.id === type)
    return rt?.emoji || '👍'
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }

  private sanitizeHtml(html: string): string {
    const div = document.createElement('div')
    div.innerHTML = html
    const scripts = div.querySelectorAll('script, iframe, object, embed, style, link, meta, svg, math, form, button, input, textarea, select, option')
    scripts.forEach(el => el.remove())
    const all = div.querySelectorAll('*')
    all.forEach(el => {
      for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase()
        if (name.startsWith('on')) {
          el.removeAttribute(attr.name)
          continue
        }
        if (name === 'href' || name === 'src' || name === 'xlink:href' || name === 'formaction' || name === 'action' || name === 'poster' || name === 'srcdoc') {
          let val = attr.value.replace(/[\x00-\x20]/g, '').toLowerCase().trim()
          
          const temp = document.createElement('div')
          temp.innerHTML = attr.value
          let decodedVal = temp.textContent || temp.innerText || ''
          decodedVal = decodedVal.replace(/[\x00-\x20]/g, '').toLowerCase().trim()

          if (
            val.startsWith('javascript:') || val.startsWith('data:') || val.startsWith('vbscript:') || val.startsWith('file:') ||
            decodedVal.startsWith('javascript:') || decodedVal.startsWith('data:') || decodedVal.startsWith('vbscript:') || decodedVal.startsWith('file:') ||
            !attr.value.trim()
          ) {
            el.removeAttribute(attr.name)
          }
        }
      }
    })
    const imgs = div.querySelectorAll('img[src]')
    imgs.forEach(img => {
      const src = img.getAttribute('src') || ''
      if (!src.startsWith('http://') && !src.startsWith('https://') && !src.startsWith('/') && !src.startsWith('data:image/')) {
        img.removeAttribute('src')
      }
    })
    return div.innerHTML
  }
}

export { AIGCSWidget }
