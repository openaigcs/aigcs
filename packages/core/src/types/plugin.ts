export interface PluginHookContext {
  siteId: string
  path: string
  pageTitle?: string
  pageContent?: string
  providerName?: string
  model?: string
  systemPrompt?: string
  commentContent?: string
  commentId?: string
  [key: string]: unknown
}

export interface ServerContext {
  app: any
  db: any
  rawDb: any
  config: Record<string, any>
  settings: Record<string, any>
  [key: string]: unknown
}

export interface FetchContext {
  siteId: string
  path: string
  comments: any[]
  visitorComments?: any[]
  config?: Record<string, any>
  [key: string]: unknown
}

export interface SubmitContext {
  siteId: string
  path: string
  authorName: string
  authorEmail: string
  authorUrl: string
  content: string
  parentId?: string
  visitorId?: string
  editId?: string
  notifyReplyAuthor?: boolean
  pin?: string
  captchaToken?: string
  ip: string
  userAgent: string
  result?: any
  [key: string]: unknown
}

export interface Plugin {
  name: string
  displayName?: Record<string, string>
  version: string
  description?: string
  homepage?: string
  descriptions?: Record<string, string>
  defaultSettings?: Record<string, any>
  commentHandler?: 'none' | 'ai' | 'visitor' | 'both'
  hooks: {
    onServerInit?: (ctx: ServerContext) => void | Promise<void>
    beforeGenerate?: (ctx: PluginHookContext) => PluginHookContext | Promise<PluginHookContext>
    afterGenerate?: (ctx: PluginHookContext) => PluginHookContext | Promise<PluginHookContext>
    pageReady?: (ctx: PluginHookContext) => PluginHookContext | Promise<PluginHookContext>
    beforeRender?: (ctx: PluginHookContext) => PluginHookContext | Promise<PluginHookContext>
    onFetchComments?: (ctx: FetchContext) => FetchContext | Promise<FetchContext>
    onCommentSubmit?: (ctx: SubmitContext) => SubmitContext | Promise<SubmitContext>
  }
}
