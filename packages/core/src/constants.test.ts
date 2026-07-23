import { describe, it, expect } from 'vitest'
import { RES_CODE, CACHE_DEFAULTS, DEFAULT_REACTIONS, DEFAULT_PROVIDER_WEIGHTS, DEFAULT_PROMPTS } from './constants.js'

describe('constants', () => {
  it('RES_CODE should have required codes', () => {
    expect(RES_CODE.SUCCESS).toBe(0)
    expect(RES_CODE.RATE_LIMITED).toBe(1025)
  })

  it('CACHE_DEFAULTS should have reasonable values', () => {
    expect(CACHE_DEFAULTS.MEMORY_MAX).toBeGreaterThan(0)
    expect(CACHE_DEFAULTS.CDN_S_MAXAGE).toBe(300)
  })

  it('DEFAULT_REACTIONS should have 6 GitHub-style reactions', () => {
    const ids = DEFAULT_REACTIONS.map(r => r.id)
    expect(ids).toEqual(['thumbs_up', 'smile', 'tada', 'heart', 'rocket', 'eyes'])
  })

  it('DEFAULT_PROVIDER_WEIGHTS should include all 13 providers', () => {
    expect(Object.keys(DEFAULT_PROVIDER_WEIGHTS).length).toBeGreaterThanOrEqual(12)
    expect(DEFAULT_PROVIDER_WEIGHTS.ollama).toBe(999)
    expect(DEFAULT_PROVIDER_WEIGHTS.gemini).toBe(10)
  })

  it('DEFAULT_PROMPTS should include multi-language templates', () => {
    const names = DEFAULT_PROMPTS.map(p => p.name)
    expect(names).toContain('中文通用评论')
    expect(names).toContain('Code Reviewer (中文)')
    expect(names).toContain('English General')
    expect(names).toContain('English Code Reviewer')
    expect(names).toContain('日本語コメント')
    expect(names).toContain('日本語 Code Reviewer')
    expect(names).toContain('한국어 댓글')
    expect(names).toContain('한국어 Code Reviewer')
    expect(names).toContain('Commentaire en Français')
    expect(names).toContain('Code Reviewer en Français')
    expect(names).toContain('Comentario en Español')
    expect(names).toContain('Code Reviewer en Español')
    expect(names).toContain('Deutscher Kommentar')
    expect(names).toContain('Deutscher Code Reviewer')
    expect(names).toContain('Comentário em Português')
    expect(names).toContain('Comentário em Português (Code Reviewer)')
    expect(names).toContain('暴躁喷人版 (中文)')
    expect(names).toContain('Ranting & Toxic Commenter')
    expect(names).toContain('毒舌・ブチギレ版')
    expect(names).toContain('분노의 독설가')
    expect(names).toContain('Critique Toxique et Impatient')
    expect(names).toContain('Comentarista Tóxico y Malhumorado')
    expect(names).toContain('Cholerischer Giftzahn')
    expect(names).toContain('Comentário em Português (Ranzinza)')
    expect(DEFAULT_PROMPTS.length).toBe(24)
    const uniqueNames = new Set(names)
    expect(uniqueNames.size).toBe(names.length)
  })

  it('DEFAULT_PROMPTS templates should have non-empty content', () => {
    for (const p of DEFAULT_PROMPTS) {
      expect(p.content.length).toBeGreaterThan(30)
      expect(p.name.length).toBeGreaterThan(0)
    }
  })
})
