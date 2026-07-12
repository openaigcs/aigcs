import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { users } from './users.js'
import { sites } from './sites.js'

export const notifications = sqliteTable('notifications', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  siteId: text('site_id').references(() => sites.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // 'success', 'error', 'info', 'warning'
  title: text('title').notNull(),
  message: text('message').notNull(),
  isRead: integer('is_read', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull().$default(() => new Date().toISOString()),
}, (table) => ({
  userIdx: index('idx_notifications_user').on(table.userId),
  readIdx: index('idx_notifications_is_read').on(table.isRead),
}))
