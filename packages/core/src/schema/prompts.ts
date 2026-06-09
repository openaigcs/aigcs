import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const promptTemplates = sqliteTable('prompt_templates', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  content: text('content').notNull(),
  lang: text('lang').notNull().default('zh'),
  category: text('category').notNull().default('general'),
  isSystem: integer('is_system', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull().$default(() => new Date().toISOString()),
})
