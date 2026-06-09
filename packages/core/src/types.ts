// ── Provider related types ──

export interface GenerateInput {
  pageTitle: string
  pageContent: string
  pageUrl: string
  model: string
  apiKey: string
  apiEndpoint: string
  systemPrompt?: string
  extraParams?: Record<string, unknown>
}

export interface GenerateResult {
  content: string
  model: string
  tokenUsage?: { input: number; output: number }
}

export interface AIProviderInterface {
  name: string
  displayName: string
  generate(input: GenerateInput): Promise<GenerateResult>
  listModels?(apiKey: string, endpoint: string): Promise<string[]>
}

// ── Cache types ──

export interface CacheEntry<T> {
  data: T
  etag?: string
  expiresAt?: number
}

export interface CacheAdapter {
  get<T>(key: string): Promise<CacheEntry<T> | null>
  set<T>(key: string, entry: CacheEntry<T>): Promise<void>
  del(key: string): Promise<void>
}

// ── Widget API types ──

export interface CommentDTO {
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

export interface WidgetResponse {
  status: 'ready' | 'generating'
  comments?: CommentDTO[]
  estimatedWait?: number
}

// ── Auth types ──

export type UserRole = 'admin' | 'user'
export type TokenScope = 'read' | 'read_write' | 'admin'
export type CaptchaProvider = 'none' | 'turnstile' | 'recaptcha' | 'geetest' | 'cap' | 'altcha' | 'hcaptcha'

// ── Webhook types ──

export type WebhookEvent = 'comment.generated' | 'page.ready' | 'cache.cleared' | 'cache.refreshed'

export interface WebhookPayload {
  event: WebhookEvent
  siteId: string
  path: string
  data: Record<string, unknown>
}
