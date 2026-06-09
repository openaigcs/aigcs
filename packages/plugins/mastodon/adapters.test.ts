import { describe, it, expect } from 'vitest'
import { adapters, getAdapter } from './adapters.js'

const SAMPLE_MASTODON_ACCOUNT = {
  account: {
    display_name: 'Test User',
    username: 'testuser',
    acct: 'testuser@mastodon.social',
    avatar_static: 'https://mastodon.social/avatars/test.png',
    avatar: 'https://mastodon.social/avatars/test.png',
  },
  favourites_count: 5,
  content: '<p>Hello world</p>',
  created_at: '2026-01-15T10:00:00Z',
  id: '123456',
  in_reply_to_id: '123455',
}

const SAMPLE_MISSKEY_NOTE = {
  user: {
    name: 'Misskey User',
    username: 'mkuser',
    host: 'misskey.example',
    avatarUrl: 'https://misskey.example/avatar.png',
  },
  likedCount: 3,
  content: '<p>Misskey post</p>',
  created_at: '2026-01-15T10:00:00Z',
  id: 'abc-def',
}

const SAMPLE_LEMMY_COMMENT = {
  creator: {
    display_name: 'Lemmy User',
    name: 'lemmyuser',
    actor_id: 'https://lemmy.world/u/lemmyuser',
    avatar: 'https://lemmy.world/avatar.png',
  },
  counts: { score: 7 },
  content: '<p>Lemmy comment</p>',
  created_at: '2026-01-15T10:00:00Z',
  id: 42,
}

describe('adapter names', () => {
  it('should have 7 adapters', () => {
    expect(Object.keys(adapters)).toHaveLength(7)
  })
  it('should have all expected adapter types', () => {
    expect(adapters).toHaveProperty('mastodon')
    expect(adapters).toHaveProperty('gotosocial')
    expect(adapters).toHaveProperty('pleroma')
    expect(adapters).toHaveProperty('misskey')
    expect(adapters).toHaveProperty('writefreely')
    expect(adapters).toHaveProperty('lemmy')
    expect(adapters).toHaveProperty('loops')
  })
})

describe('getAdapter', () => {
  it('should return mastodon adapter by default', () => {
    const a = getAdapter('unknown')
    expect(a.name).toBe('Mastodon')
  })
  it('should return correct adapter for each type', () => {
    expect(getAdapter('mastodon').name).toBe('Mastodon')
    expect(getAdapter('gotosocial').name).toBe('GoToSocial')
    expect(getAdapter('pleroma').name).toBe('Pleroma')
    expect(getAdapter('misskey').name).toBe('Misskey')
    expect(getAdapter('writefreely').name).toBe('WriteFreely')
    expect(getAdapter('lemmy').name).toBe('Lemmy')
    expect(getAdapter('loops').name).toBe('Loops')
  })
  it('should prefer software over type', () => {
    const a = getAdapter('mastodon', 'gotosocial')
    expect(a.name).toBe('GoToSocial')
  })
})

describe('parseAccount', () => {
  it('should parse Mastodon account correctly', () => {
    const a = adapters.mastodon.parseAccount(SAMPLE_MASTODON_ACCOUNT)
    expect(a.displayName).toBe('Test User')
    expect(a.avatar).toBe('https://mastodon.social/avatars/test.png')
    expect(a.acct).toBe('testuser@mastodon.social')
  })
  it('should parse Misskey account correctly', () => {
    const a = adapters.misskey.parseAccount(SAMPLE_MISSKEY_NOTE)
    expect(a.displayName).toBe('Misskey User')
    expect(a.avatar).toBe('https://misskey.example/avatar.png')
    expect(a.acct).toBe('@mkuser@misskey.example')
  })
  it('should parse Lemmy account correctly', () => {
    const a = adapters.lemmy.parseAccount(SAMPLE_LEMMY_COMMENT)
    expect(a.displayName).toBe('Lemmy User')
    expect(a.avatar).toBe('https://lemmy.world/avatar.png')
    expect(a.acct).toContain('lemmyuser')
  })
  it('should handle empty account gracefully', () => {
    for (const key of Object.keys(adapters)) {
      const a = adapters[key].parseAccount({})
      expect(typeof a.displayName).toBe('string')
      expect(typeof a.avatar).toBe('string')
    }
  })
})

describe('parseFavourites', () => {
  it('should parse Mastodon favourites_count', () => {
    expect(adapters.mastodon.parseFavourites(SAMPLE_MASTODON_ACCOUNT)).toBe(5)
  })
  it('should parse Misskey likedCount', () => {
    expect(adapters.misskey.parseFavourites(SAMPLE_MISSKEY_NOTE)).toBe(3)
  })
  it('should parse Lemmy score', () => {
    expect(adapters.lemmy.parseFavourites(SAMPLE_LEMMY_COMMENT)).toBe(7)
  })
  it('should default to 0 when missing', () => {
    for (const key of Object.keys(adapters)) {
      expect(adapters[key].parseFavourites({})).toBe(0)
    }
  })
})

describe('searchUrl', () => {
  it('should build correct Mastodon search URL', () => {
    const url = adapters.mastodon.searchUrl('https://mastodon.social', 'hello')
    expect(url).toBe('https://mastodon.social/api/v1/search?q=hello&type=statuses&limit=10')
  })
  it('should build correct Misskey search URL', () => {
    const url = adapters.misskey.searchUrl('https://misskey.example', 'hello')
    expect(url).toBe('https://misskey.example/api/notes/search?q=hello&limit=10')
  })
  it('should build correct Lemmy search URL', () => {
    const url = adapters.lemmy.searchUrl('https://lemmy.world', 'hello')
    expect(url).toBe('https://lemmy.world/api/v3/search?q=hello&type_=Posts&limit=10')
  })
  it('should encode query parameters', () => {
    const url = adapters.mastodon.searchUrl('https://masto.ai', 'test query')
    expect(url).toContain('q=test%20query')
  })
})

describe('authHeader', () => {
  it('should return Bearer token for Mastodon', () => {
    const h = adapters.mastodon.authHeader('tok123')
    expect(h).toEqual({ Authorization: 'Bearer tok123' })
  })
  it('should return i header for Misskey', () => {
    const h = adapters.misskey.authHeader('tok123')
    expect(h).toEqual({ i: 'tok123' })
  })
  it('should return Bearer for WriteFreely', () => {
    const h = adapters.writefreely.authHeader('tok123')
    expect(h).toEqual({ Authorization: 'Bearer tok123' })
  })
  it('should return Bearer for Lemmy', () => {
    const h = adapters.lemmy.authHeader('tok123')
    expect(h).toEqual({ Authorization: 'Bearer tok123' })
  })
})

describe('contextUrl', () => {
  it('should build correct Mastodon context URL', () => {
    const url = adapters.mastodon.contextUrl('https://mastodon.social', '123')
    expect(url).toBe('https://mastodon.social/api/v1/statuses/123/context')
  })
  it('should build correct Misskey context URL', () => {
    const url = adapters.misskey.contextUrl('https://misskey.example', 'abc')
    expect(url).toBe('https://misskey.example/api/notes/children?noteId=abc&limit=100')
  })
  it('should build correct Lemmy context URL', () => {
    const url = adapters.lemmy.contextUrl('https://lemmy.world', '42')
    expect(url).toBe('https://lemmy.world/api/v3/comment/list?post_id=42')
  })
})

describe('parseSearchResults', () => {
  it('should parse Mastodon search results', () => {
    const raw = { statuses: [{ id: '1', url: 'https://masto.ai/@u/1' }] }
    const r = adapters.mastodon.parseSearchResults(raw)
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('1')
  })
  it('should return empty array for no results', () => {
    expect(adapters.mastodon.parseSearchResults({})).toEqual([])
  })
  it('should parse Misskey search results (flat array)', () => {
    const raw = [{ id: 'abc', url: '' }]
    const r = adapters.misskey.parseSearchResults(raw)
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('abc')
  })
  it('should parse Lemmy search results', () => {
    const raw = { posts: [{ post: { id: 1, ap_id: 'https://lemmy.world/post/1' } }] }
    const r = adapters.lemmy.parseSearchResults(raw)
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('1')
  })
})

describe('parseContext', () => {
  it('should parse Mastodon context', () => {
    const raw = { ancestors: [], descendants: [{ id: '2' }] }
    const r = adapters.mastodon.parseContext(raw)
    expect(r.descendants).toHaveLength(1)
  })
  it('should handle empty context', () => {
    const r = adapters.mastodon.parseContext({})
    expect(r.descendants).toEqual([])
  })
  it('should parse Misskey context (flat array)', () => {
    const raw = [{ id: 'child1' }]
    const r = adapters.misskey.parseContext(raw)
    expect(r.descendants).toHaveLength(1)
  })
  it('should parse Lemmy context', () => {
    const raw = { comments: [{ id: 1 }] }
    const r = adapters.lemmy.parseContext(raw)
    expect(r.descendants).toHaveLength(1)
  })
})

describe('resolveStatusId', () => {
  it('should extract numeric ID from Mastodon URL', () => {
    expect(adapters.mastodon.resolveStatusId('https://masto.ai', 'https://masto.ai/@user/123456')).toBe('123456')
  })
  it('should return input if no pattern matches for Mastodon', () => {
    expect(adapters.mastodon.resolveStatusId('https://masto.ai', '123456')).toBe('123456')
  })
  it('should extract GoToSocial ID from URL', () => {
    expect(adapters.gotosocial.resolveStatusId('https://m.e.com', 'https://m.e.com/@user/statuses/01ABCDEF')).toBe('01ABCDEF')
  })
  it('should pass raw ID through for GoToSocial', () => {
    expect(adapters.gotosocial.resolveStatusId('https://m.e.com', '01ABCDEF')).toBe('01ABCDEF')
  })
  it('should pass through for Misskey', () => {
    expect(adapters.misskey.resolveStatusId('https://mk.example', 'abc-def')).toBe('abc-def')
  })
})
