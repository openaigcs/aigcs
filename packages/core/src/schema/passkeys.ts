import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { users } from './users.js'

export const userPasskeys = sqliteTable('user_passkeys', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  credentialId: text('credential_id').notNull().unique(),
  publicKey: text('public_key').notNull(),
  counter: integer('counter').notNull().default(0),
  deviceType: text('device_type').notNull().default('singleDevice'),
  backedUp: integer('backed_up', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull().$default(() => new Date().toISOString()),
})
