import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sites } from './sites.js'

export const comments = sqliteTable('comments', {
  id: text('id').primaryKey(),
  siteId: text('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  path: text('path').notNull(),
  providerName: text('provider_name').notNull(),
  model: text('model').notNull().default(''),
  authorName: text('author_name').notNull(),
  authorAvatar: text('author_avatar').notNull().default(''),
  content: text('content').notNull(),
  contentMd5: text('content_md5').notNull(),
  generatedAt: text('generated_at').notNull().$default(() => new Date().toISOString()),
}, (table) => ({
  uniq: uniqueIndex('idx_comments_unique').on(table.siteId, table.path, table.providerName),
  lookup: uniqueIndex('idx_comments_lookup').on(table.siteId, table.path),
}))

export const pageCache = sqliteTable('page_cache', {
  id: text('id').primaryKey(),
  siteId: text('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  path: text('path').notNull(),
  status: text('status').notNull().default('pending'),
  // 'pending' | 'generating' | 'ready' | 'failed'
  title: text('title'),
  contentSource: text('content_source'),
  etag: text('etag'),
  generatedAt: text('generated_at'),
  expiresAt: text('expires_at'),
  error: text('error'),
  lockedAt: text('locked_at'),
  createdAt: text('created_at').notNull().$default(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$default(() => new Date().toISOString()),
}, (table) => ({
  uniq: uniqueIndex('idx_page_cache_unique').on(table.siteId, table.path),
}))
