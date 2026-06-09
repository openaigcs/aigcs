import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sites } from './sites.js'

export const reactionTypes = sqliteTable('reaction_types', {
  id: text('id').primaryKey(),
  emoji: text('emoji').notNull(),
  label: text('label').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  isSystem: integer('is_system', { mode: 'boolean' }).notNull().default(false),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  siteId: text('site_id').references(() => sites.id, { onDelete: 'cascade' }),
})

export const commentReactions = sqliteTable('comment_reactions', {
  id: text('id').primaryKey(),
  commentId: text('comment_id').notNull(),
  reactionType: text('reaction_type').notNull(),
  count: integer('count').notNull().default(0),
}, (table) => ({
  uniq: uniqueIndex('idx_comment_reaction').on(table.commentId, table.reactionType),
}))

export const reactionVotes = sqliteTable('reaction_votes', {
  id: text('id').primaryKey(),
  commentId: text('comment_id').notNull(),
  reactionType: text('reaction_type').notNull(),
  visitorHash: text('visitor_hash').notNull(),
  createdAt: text('created_at').notNull().$default(() => new Date().toISOString()),
}, (table) => ({
  uniq: uniqueIndex('idx_reaction_vote').on(table.commentId, table.reactionType, table.visitorHash),
}))
