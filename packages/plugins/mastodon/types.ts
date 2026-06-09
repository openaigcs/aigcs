export interface CachedComment {
  id: string
  mastodonCommentId: string
  authorName: string
  authorAvatar: string
  authorFediId: string
  content: string
  createdAt: string
  fetchedAt: string
  favouritesCount: number
  parentId: string
  bindingId: string
  siteId: string
  slug: string
}

export interface InstanceAdapter {
  name: string
  searchUrl(instanceUrl: string, query: string): string
  statusUrl(instanceUrl: string, statusId: string): string
  contextUrl(instanceUrl: string, statusId: string): string
  verifyUrl(instanceUrl: string): string
  authHeader(token: string): Record<string, string>
  parseSearchResults(raw: any): Array<{ id: string; url: string }>
  parseContext(raw: any): { descendants: any[] }
  parseAccount(raw: any): { displayName: string; avatar: string; acct: string }
  parseFavourites(raw: any): number
  resolveStatusId(instanceUrl: string, input: string): string
}
