import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { users } from './users.js'

export const auditLog = sqliteTable('audit_log', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id),
  action: text('action').notNull(),
  ip: text('ip'),
  userAgent: text('user_agent'),
  details: text('details', { mode: 'json' }),
  createdAt: text('created_at').notNull().$default(() => new Date().toISOString()),
})
