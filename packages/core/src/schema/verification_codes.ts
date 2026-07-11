import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core'

export const verificationCodes = sqliteTable('verification_codes', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  code: text('code').notNull(),
  purpose: text('purpose').notNull().default('delete_comment'),
  targetId: text('target_id').notNull().default(''),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull().$default(() => new Date().toISOString()),
}, (table) => ({
  verifIdx: index('idx_verification_codes_lookup').on(table.email, table.purpose, table.createdAt),
}))

