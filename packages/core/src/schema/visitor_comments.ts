import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { sites } from './sites.js'

export const visitorComments = sqliteTable('visitor_comments', {
  id: text('id').primaryKey(),
  siteId: text('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  path: text('path').notNull(),
  parentId: text('parent_id'),
  authorName: text('author_name').notNull(),
  authorEmail: text('author_email').notNull().default(''),
  authorUrl: text('author_url').notNull().default(''),
  content: text('content').notNull(),
  ip: text('ip').notNull().default(''),
  userAgent: text('user_agent').notNull().default(''),
  status: text('status').notNull().default('approved'),
  visitorId: text('visitor_id').notNull().default(''),
  notifyOnReply: integer('notify_on_reply').notNull().default(0),
  editedAt: text('edited_at'),
  createdAt: text('created_at').notNull().$default(() => new Date().toISOString()),
}, (table) => ({
  lookupIdx: index('idx_visitor_comments_lookup').on(table.siteId, table.path, table.status, table.createdAt),
}))

