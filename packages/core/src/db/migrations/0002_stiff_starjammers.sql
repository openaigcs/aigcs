ALTER TABLE `mastodon_bindings` ADD `software` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE TABLE `mastodon_cached_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`binding_id` text NOT NULL,
	`mastodon_comment_id` text NOT NULL,
	`author_name` text DEFAULT '' NOT NULL,
	`author_avatar` text DEFAULT '' NOT NULL,
	`author_fedi_id` text DEFAULT '' NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`fetched_at` text NOT NULL,
	`favourites_count` integer DEFAULT 0 NOT NULL,
	`parent_id` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE `system_config` ADD `cap_site_key` text;--> statement-breakpoint
ALTER TABLE `system_config` ADD `cap_secret_key` text;--> statement-breakpoint
ALTER TABLE `system_config` ADD `cap_verify_url` text;--> statement-breakpoint
ALTER TABLE `system_config` ADD `altcha_site_key` text;--> statement-breakpoint
ALTER TABLE `system_config` ADD `altcha_secret_key` text;--> statement-breakpoint
ALTER TABLE `system_config` ADD `hcaptcha_site_key` text;--> statement-breakpoint
ALTER TABLE `system_config` ADD `hcaptcha_secret_key` text;--> statement-breakpoint
ALTER TABLE `visitor_comments` ADD `parent_id` text;--> statement-breakpoint
ALTER TABLE `visitor_comments` ADD `visitor_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `visitor_comments` ADD `notify_on_reply` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `visitor_comments` ADD `edited_at` text;
