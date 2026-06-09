import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const mastodonBindings = sqliteTable('mastodon_bindings', {
  id: text('id').primaryKey(),
  siteId: text('site_id').notNull(),
  slug: text('slug').notNull(),
  instanceType: text('instance_type').notNull().default('mastodon'),
  instanceUrl: text('instance_url').notNull(),
  statusId: text('status_id').notNull(),
  software: text('software').notNull().default(''),
  accessToken: text('access_token').notNull().default(''),
  fediAuthor: text('fedi_author').notNull().default(''),
  autoFetch: integer('auto_fetch').notNull().default(1),
  cacheTtl: integer('cache_ttl').notNull().default(30),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const mastodonCachedComments = sqliteTable('mastodon_cached_comments', {
  id: text('id').primaryKey(),
  bindingId: text('binding_id').notNull(),
  mastodonCommentId: text('mastodon_comment_id').notNull(),
  authorName: text('author_name').notNull().default(''),
  authorAvatar: text('author_avatar').notNull().default(''),
  authorFediId: text('author_fedi_id').notNull().default(''),
  content: text('content').notNull().default(''),
  createdAt: text('created_at').notNull(),
  fetchedAt: text('fetched_at').notNull(),
  favouritesCount: integer('favourites_count').notNull().default(0),
  parentId: text('parent_id').notNull().default(''),
  hidden: integer('hidden').notNull().default(0),
})
