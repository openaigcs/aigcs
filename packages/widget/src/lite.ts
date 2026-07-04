import { AIGCSWidget } from './widget.js'

customElements.define('aigcs-widget', AIGCSWidget)

document.addEventListener('DOMContentLoaded', () => {
  const placeholder = document.getElementById('aigcs')
  if (placeholder) {
    const widget = document.createElement('aigcs-widget')
    widget.setAttribute('domain', placeholder.getAttribute('data-domain') || window.location.hostname)
    widget.setAttribute('path', placeholder.getAttribute('data-path') || window.location.pathname)
    const sv = placeholder.getAttribute('data-server')
    if (sv) widget.setAttribute('server', sv)
    const autoGen = placeholder.getAttribute('data-auto-generate')
    if (autoGen === 'true') widget.setAttribute('auto-generate', 'true')
    placeholder.replaceWith(widget)
  }
})

declare global {
  interface Window {
    AIGCS?: ReturnType<typeof createAIGCSAPI>
  }
}

function createAIGCSAPI() {
  return {
    init(config: {
      el?: string | HTMLElement
      server?: string
      site: string
      path: string
      darkMode?: 'auto' | 'light' | 'dark'
      theme?: 'auto' | 'light' | 'dark'
      lightTheme?: string
      darkTheme?: string
      lang?: 'zh' | 'en' | 'zh-hans' | 'zh-hant'
      autoGenerate?: boolean
      themeColor?: string
      disableCopyright?: boolean
    }) {
      const el = typeof config.el === 'string'
        ? document.querySelector(config.el)
        : config.el || document.getElementById('aigcs')
      if (!el) {
        console.error('[AIGCS] Element not found:', config.el)
        return
      }
      const widget = document.createElement('aigcs-widget')
      widget.setAttribute('domain', config.site)
      widget.setAttribute('path', config.path)
      if (config.server) widget.setAttribute('server', config.server)
      if (config.darkMode) widget.setAttribute('theme', config.darkMode)
      if (config.theme) widget.setAttribute('theme', config.theme)
      if (config.darkTheme) widget.setAttribute('dark-theme', config.darkTheme)
      if (config.lightTheme) widget.setAttribute('light-theme', config.lightTheme)
      if (config.lang) widget.setAttribute('lang', config.lang)
      if (config.autoGenerate === true) widget.setAttribute('auto-generate', 'true')
      if (config.themeColor) widget.setAttribute('theme-color', config.themeColor)
      if (config.disableCopyright) widget.setAttribute('disable-copyright', 'true')
      if (el.className) widget.className = el.className
      el.replaceWith(widget)
    },
  }
}

export default createAIGCSAPI()
