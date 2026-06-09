export const WEBHOOK_EVENTS = [
  'comment.generated',
  'cache.cleared',
  'cache.warm_completed',
  'rss.import_completed',
  'comment.reacted',
  'provider.created',
  'provider.updated',
] as const

const eventLabels: Record<string, string> = {
  'comment.generated': 'sites.webhookEvent.commentGenerated',
  'cache.cleared': 'sites.webhookEvent.cacheCleared',
  'cache.warm_completed': 'sites.webhookEvent.cacheWarmCompleted',
  'rss.import_completed': 'sites.webhookEvent.rssImportCompleted',
  'comment.reacted': 'sites.webhookEvent.commentReacted',
  'provider.created': 'sites.webhookEvent.providerCreated',
  'provider.updated': 'sites.webhookEvent.providerUpdated',
}

export function webhookEventLabel(ev: string, t: (key: string) => string): string {
  return t(eventLabels[ev] || ev)
}
