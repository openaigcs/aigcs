import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { sites } from './sites.js'

export const plugins = sqliteTable('plugins', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  version: text('version').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
  settings: text('settings', { mode: 'json' }).notNull().default({}),
  createdAt: text('created_at').notNull().$default(() => new Date().toISOString()),
})

export const webhooks = sqliteTable('webhooks', {
  id: text('id').primaryKey(),
  siteId: text('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  url: text('url').notNull(),
  events: text('events', { mode: 'json' }).notNull(),
  secret: text('secret'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull().$default(() => new Date().toISOString()),
})
