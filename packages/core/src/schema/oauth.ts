import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { users } from './users.js'

export const userOauthAccounts = sqliteTable('user_oauth_accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  providerId: text('provider_id').notNull(),
  providerUserId: text('provider_user_id').notNull(),
  createdAt: text('created_at').notNull().$default(() => new Date().toISOString()),
})
