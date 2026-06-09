import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sites } from './sites.js'
import { promptTemplates } from './prompts.js'

export const providers = sqliteTable('providers', {
  id: text('id').primaryKey(),
  siteId: text('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  displayName: text('display_name').notNull(),
  providerType: text('provider_type').notNull().default('openai-compatible'),
  // 'native' | 'openai-compatible' | 'ollama'
  apiKey: text('api_key').notNull().default(''),
  apiEndpoint: text('api_endpoint').notNull().default(''),
  models: text('models', { mode: 'json' }).notNull().default([]),
  model: text('model').notNull().default(''),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  showOnFrontend: integer('show_on_frontend', { mode: 'boolean' }).notNull().default(true),
  sortWeight: integer('sort_weight').notNull().default(0),
  promptTemplateId: text('prompt_template_id').references(() => promptTemplates.id),
  extraParams: text('extra_params', { mode: 'json' }).notNull().default({}),
  avatarSvg: text('avatar_svg').notNull().default(''),
  createdAt: text('created_at').notNull().$default(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$default(() => new Date().toISOString()),
}, (table) => ({
  uniq: uniqueIndex('idx_providers_site_name').on(table.siteId, table.name),
}))
