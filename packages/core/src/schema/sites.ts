import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { users } from './users.js'

export const sites = sqliteTable('sites', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  domain: text('domain').notNull(),
  name: text('name').notNull().default(''),
  settings: text('settings', { mode: 'json' }).notNull().default({}),
  // { auto_generate: boolean, cache_ttl: number, admin_prefix: string,
  //   show_model: boolean, seo_enabled: boolean, reaction_enabled: boolean }
  createdAt: text('created_at').notNull().$default(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$default(() => new Date().toISOString()),
}, (table) => ({
  uniq: uniqueIndex('idx_sites_user_domain').on(table.userId, table.domain),
}))
