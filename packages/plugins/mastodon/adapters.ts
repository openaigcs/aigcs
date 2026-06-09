import type { InstanceAdapter } from './types.js'

export function extractAcct(raw: any, instanceUrl: string): string {
  const acct = raw.account?.acct || ''
  if (acct.includes('@')) return acct
  const domain = instanceUrl.replace(/^https?:\/\//, '')
  return `${acct}@${domain}`
}

function idFromInput(input: string): string {
  return input
}

const mastodonAdapter: InstanceAdapter = {
  name: 'Mastodon',
  searchUrl(instanceUrl, query) {
    return `${instanceUrl}/api/v1/search?q=${encodeURIComponent(query)}&type=statuses&limit=10`
  },
  statusUrl(instanceUrl, statusId) {
    return `${instanceUrl}/api/v1/statuses/${statusId}`
  },
  contextUrl(instanceUrl, statusId) {
    return `${instanceUrl}/api/v1/statuses/${statusId}/context`
  },
  verifyUrl(instanceUrl) {
    return `${instanceUrl}/api/v1/accounts/verify_credentials`
  },
  authHeader(token) {
    return { Authorization: `Bearer ${token}` }
  },
  parseSearchResults(raw) {
    return (raw.statuses || []).map((s: any) => ({ id: s.id, url: s.url || s.uri }))
  },
  parseContext(raw) {
    return { descendants: raw.descendants || [] }
  },
  parseAccount(raw) {
    return {
      displayName: raw.account?.display_name || raw.account?.username || '',
      avatar: raw.account?.avatar_static || raw.account?.avatar || '',
      acct: raw.account?.acct || '',
    }
  },
  parseFavourites(raw) {
    return raw.favourites_count || 0
  },
  resolveStatusId(_instanceUrl, input) {
    // Try Mastodon format: /@user/123456
    let m = input.match(/\/@[^/]+\/(\d+)$/)
    if (m) return m[1]
    // Try GoToSocial format: /@user/statuses/01ABCDEF
    m = input.match(/\/@[^/]+\/statuses\/(.+)$/)
    if (m) return m[1]
    // Try Misskey format: /notes/id
    m = input.match(/\/notes\/(.+)$/)
    if (m) return m[1]
    return input
  },
}

function gotosocialAdapter(): InstanceAdapter {
  const base = Object.create(mastodonAdapter)
  base.name = 'GoToSocial'
  base.statusUrl = function (instanceUrl: string, statusId: string) {
    return `${instanceUrl}/api/v1/statuses/${statusId}`
  }
  base.resolveStatusId = function (_instanceUrl: string, input: string) {
    // GoToSocial: https://instance/@user/statuses/01ABCDEF123 → 01ABCDEF123
    const m = input.match(/\/@[^/]+\/statuses\/(.+)$/)
    return m ? m[1] : input
  }
  return base
}

function pleromaAdapter(): InstanceAdapter {
  const base = Object.create(mastodonAdapter)
  base.name = 'Pleroma'
  base.searchUrl = function (instanceUrl: string, query: string) {
    return `${instanceUrl}/api/v2/search?q=${encodeURIComponent(query)}`
  }
  return base
}

export const adapters: Record<string, InstanceAdapter> = {
  mastodon: mastodonAdapter,
  gotosocial: gotosocialAdapter(),
  pleroma: pleromaAdapter(),

  misskey: {
    name: 'Misskey',
    searchUrl(instanceUrl, query) {
      return `${instanceUrl}/api/notes/search?q=${encodeURIComponent(query)}&limit=10`
    },
    statusUrl(instanceUrl, statusId) {
      return `${instanceUrl}/api/notes/show?noteId=${statusId}`
    },
    contextUrl(instanceUrl, statusId) {
      return `${instanceUrl}/api/notes/children?noteId=${statusId}&limit=100`
    },
    verifyUrl(instanceUrl) {
      return `${instanceUrl}/api/notes/search?limit=1`
    },
    authHeader(token) {
      return { i: token }
    },
    parseSearchResults(raw) {
      return (raw || []).map((s: any) => ({ id: s.id, url: s.url || '' }))
    },
    parseContext(raw) {
      return { descendants: raw || [] }
    },
    parseAccount(raw) {
      return {
        displayName: raw.user?.name || raw.user?.username || '',
        avatar: raw.user?.avatarUrl || '',
        acct: `@${raw.user?.username}@${raw.user?.host || ''}`,
      }
    },
    parseFavourites(raw) {
      return raw.likedCount || 0
    },
    resolveStatusId: idFromInput,
  },

  writefreely: {
    name: 'WriteFreely',
    searchUrl(instanceUrl, query) {
      return `${instanceUrl}/api/collections?alias=${encodeURIComponent(query)}`
    },
    statusUrl(instanceUrl, statusId) {
      return `${instanceUrl}/api/posts/${statusId}`
    },
    contextUrl(instanceUrl, _statusId) {
      return `${instanceUrl}/api/posts`
    },
    verifyUrl(instanceUrl) {
      return `${instanceUrl}/api/me`
    },
    authHeader(token) {
      return { Authorization: `Bearer ${token}` }
    },
    parseSearchResults(raw) {
      return (raw?.data?.collections || []).map((c: any) => ({ id: c.id, url: c.url || '' }))
    },
    parseContext(raw) {
      return { descendants: raw?.data?.posts || [] }
    },
    parseAccount(raw) {
      return {
        displayName: raw?.display_name || raw?.username || '',
        avatar: raw?.avatar_url || '',
        acct: raw?.username || '',
      }
    },
    parseFavourites(_raw) {
      return 0
    },
    resolveStatusId: idFromInput,
  },

  lemmy: {
    name: 'Lemmy',
    searchUrl(instanceUrl, query) {
      return `${instanceUrl}/api/v3/search?q=${encodeURIComponent(query)}&type_=Posts&limit=10`
    },
    statusUrl(instanceUrl, statusId) {
      return `${instanceUrl}/api/v3/post?id=${statusId}`
    },
    contextUrl(instanceUrl, statusId) {
      return `${instanceUrl}/api/v3/comment/list?post_id=${statusId}`
    },
    verifyUrl(instanceUrl) {
      return `${instanceUrl}/api/v3/site`
    },
    authHeader(token) {
      return { Authorization: `Bearer ${token}` }
    },
    parseSearchResults(raw) {
      return (raw.posts || []).map((p: any) => ({ id: p.post?.id?.toString() || '', url: p.post?.ap_id || '' }))
    },
    parseContext(raw) {
      return { descendants: raw.comments || [] }
    },
    parseAccount(raw) {
      return {
        displayName: raw.creator?.display_name || raw.creator?.name || raw.creator_name || '',
        avatar: raw.creator?.avatar || '',
        acct: raw.creator?.actor_id || raw.creator?.name || '',
      }
    },
    parseFavourites(raw) {
      return raw.counts?.score || raw.score || 0
    },
    resolveStatusId: idFromInput,
  },

  loops: {
    name: 'Loops',
    searchUrl(instanceUrl, query) {
      return `${instanceUrl}/api/v1/video?q=${encodeURIComponent(query)}`
    },
    statusUrl(instanceUrl, statusId) {
      return `${instanceUrl}/api/v1/video/${statusId}`
    },
    contextUrl(instanceUrl, statusId) {
      return `${instanceUrl}/api/v1/video/${statusId}/comment`
    },
    verifyUrl(instanceUrl) {
      return `${instanceUrl}/api/v1/account/info/self`
    },
    authHeader(token) {
      return { Authorization: `Bearer ${token}` }
    },
    parseSearchResults(raw) {
      return (raw.data || []).map((v: any) => ({ id: v.id, url: v.url || '' }))
    },
    parseContext(raw) {
      return { descendants: raw.data || [] }
    },
    parseAccount(raw) {
      return {
        displayName: raw?.account?.display_name || raw?.account?.username || '',
        avatar: raw?.account?.avatar || '',
        acct: raw?.account?.acct || raw?.account?.username || '',
      }
    },
    parseFavourites(raw) {
      return 0
    },
    resolveStatusId: idFromInput,
  },
}

export function getAdapter(type: string, software?: string): InstanceAdapter {
  if (software && adapters[software]) return adapters[software]
  return adapters[type] || adapters.mastodon
}
