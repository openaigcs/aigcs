import { JSDOM } from 'jsdom'
import { Readability } from '@mozilla/readability'

const DEFAULT_SELECTORS = [
  // WordPress
  '.entry-content',
  '.post-content',
  '.the-content',
  '.post-body',
  // Typecho
  '.post-content',
  // Hexo
  '.post-content',
  '.article-content',
  '.post-body',
  // Hugo
  '.post-content',
  '.page-content',
  '.content-inner',
  '.article-content',
  // Ghost
  '.gh-content',
  '.post-content',
  // Joomla
  '.article-body',
  '.item-page',
  // Drupal
  '.node__content',
  '.content',
  // Generic semantic
  '[itemprop="articleBody"]',
  '[role="main"]',
  '.main-content',
  '.page-content',
  '.article-text',
  '.article-body',
  '.entry-body',
  '.post-text',
  '.blog-content',
  '.post-entry',
  '.article-main',
  '.content-wrapper',
  '.post-inner',
  '.article-inner',
  '.content-area',
  '.article-container',
  '.post-container',
]

export function extractPageTitle(html: string): string {
  const dom = new JSDOM(html)
  return dom.window.document.title || ''
}

export function extractPageContent(
  html: string,
  options?: { userSelector?: string; siteSelectors?: string },
): string {
  const dom = new JSDOM(html)
  const doc = dom.window.document

  const trySel = (s: string): string | null => {
    const els = doc.querySelectorAll(s)
    if (els.length > 0) {
      return Array.from(els).map((el: any) => el.textContent || '').join('\n').trim()
    }
    return null
  }

  let content = ''

  // ① User input selector (manual generate only)
  if (options?.userSelector) {
    content = trySel(options.userSelector) || ''
  }

  // ② Site settings contentSelector (comma-separated)
  if (!content && options?.siteSelectors) {
    for (const s of options.siteSelectors.split(',').map((s) => s.trim()).filter(Boolean)) {
      content = trySel(s) || ''
      if (content) break
    }
  }

  // ③ Expanded default selector list
  if (!content) {
    for (const s of DEFAULT_SELECTORS) {
      content = trySel(s) || ''
      if (content) break
    }
  }

  // ④ <article>
  if (!content) {
    const el = doc.querySelector('article')
    if (el) content = el.textContent?.replace(/\s+/g, ' ').trim() || ''
  }

  // ⑤ Readability
  if (!content) {
    try {
      const reader = new Readability(doc)
      const article = reader.parse()
      if (article?.textContent) content = article.textContent.replace(/\s+/g, ' ').trim()
    } catch {
      // Readability failed, continue to next fallback
    }
  }

  // ⑥ <main>
  if (!content) {
    const el = doc.querySelector('main')
    if (el) content = el.textContent?.replace(/\s+/g, ' ').trim() || ''
  }

  // ⑦ <body> (ultimate fallback, strip all tags)
  if (!content) {
    const el = doc.querySelector('body')
    if (el) {
      content = el.innerHTML
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    }
  }

  return content
}
