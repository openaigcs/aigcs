import { sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const emailUnsubscribes = sqliteTable('email_unsubscribes', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  context: text('context').notNull(),
  createdAt: text('created_at').notNull().$default(() => new Date().toISOString()),
})
