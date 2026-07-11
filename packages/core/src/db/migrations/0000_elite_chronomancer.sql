CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`action` text NOT NULL,
	`ip` text,
	`user_agent` text,
	`details` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`path` text NOT NULL,
	`provider_name` text NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`author_name` text NOT NULL,
	`author_avatar` text DEFAULT '' NOT NULL,
	`content` text NOT NULL,
	`content_md5` text NOT NULL,
	`generated_at` text NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_comments_unique` ON `comments` (`site_id`,`path`,`provider_name`);--> statement-breakpoint
CREATE INDEX `idx_comments_lookup` ON `comments` (`site_id`,`path`);--> statement-breakpoint
CREATE TABLE `page_cache` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`path` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`title` text,
	`content_source` text,
	`etag` text,
	`generated_at` text,
	`expires_at` text,
	`error` text,
	`locked_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_page_cache_unique` ON `page_cache` (`site_id`,`path`);--> statement-breakpoint
CREATE TABLE `email_unsubscribes` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`context` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `mastodon_bindings` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`slug` text NOT NULL,
	`instance_type` text DEFAULT 'mastodon' NOT NULL,
	`instance_url` text NOT NULL,
	`status_id` text NOT NULL,
	`software` text DEFAULT '' NOT NULL,
	`access_token` text DEFAULT '' NOT NULL,
	`fedi_author` text DEFAULT '' NOT NULL,
	`auto_fetch` integer DEFAULT 1 NOT NULL,
	`cache_ttl` integer DEFAULT 30 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
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
	`parent_id` text DEFAULT '' NOT NULL,
	`hidden` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_mastodon_cached_comments_binding` ON `mastodon_cached_comments` (`binding_id`);--> statement-breakpoint
CREATE TABLE `plugins` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`version` text NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`settings` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `webhooks` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`events` text NOT NULL,
	`secret` text,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `prompt_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`content` text NOT NULL,
	`lang` text DEFAULT 'zh' NOT NULL,
	`category` text DEFAULT 'general' NOT NULL,
	`is_system` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `providers` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`name` text NOT NULL,
	`display_name` text NOT NULL,
	`provider_type` text DEFAULT 'openai-compatible' NOT NULL,
	`api_key` text DEFAULT '' NOT NULL,
	`api_endpoint` text DEFAULT '' NOT NULL,
	`models` text DEFAULT '[]' NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`show_on_frontend` integer DEFAULT true NOT NULL,
	`sort_weight` integer DEFAULT 0 NOT NULL,
	`prompt_template_id` text,
	`extra_params` text DEFAULT '{}' NOT NULL,
	`avatar_svg` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`prompt_template_id`) REFERENCES `prompt_templates`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_providers_site_name` ON `providers` (`site_id`,`name`);--> statement-breakpoint
CREATE TABLE `comment_reactions` (
	`id` text PRIMARY KEY NOT NULL,
	`comment_id` text NOT NULL,
	`reaction_type` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_comment_reaction` ON `comment_reactions` (`comment_id`,`reaction_type`);--> statement-breakpoint
CREATE TABLE `reaction_types` (
	`id` text PRIMARY KEY NOT NULL,
	`emoji` text NOT NULL,
	`label` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_system` integer DEFAULT false NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`site_id` text,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `reaction_votes` (
	`id` text PRIMARY KEY NOT NULL,
	`comment_id` text NOT NULL,
	`reaction_type` text NOT NULL,
	`visitor_hash` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_reaction_vote` ON `reaction_votes` (`comment_id`,`reaction_type`,`visitor_hash`);--> statement-breakpoint
CREATE TABLE `sites` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`domain` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`settings` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sites_user_domain` ON `sites` (`user_id`,`domain`);--> statement-breakpoint
CREATE TABLE `system_config` (
	`id` text PRIMARY KEY DEFAULT 'global' NOT NULL,
	`smtp_host` text,
	`smtp_port` integer,
	`smtp_user` text,
	`smtp_pass` text,
	`smtp_from_email` text,
	`smtp_from_name` text,
	`captcha_provider` text DEFAULT 'none' NOT NULL,
	`turnstile_site_key` text,
	`turnstile_secret_key` text,
	`recaptcha_site_key` text,
	`recaptcha_secret_key` text,
	`geetest_captcha_id` text,
	`geetest_captcha_key` text,
	`cap_site_key` text,
	`cap_secret_key` text,
	`cap_verify_url` text,
	`altcha_site_key` text,
	`altcha_secret_key` text,
	`hcaptcha_site_key` text,
	`hcaptcha_secret_key` text,
	`jwt_secret` text,
	`global_system_prompt` text,
	`email_notify_comments` integer DEFAULT false NOT NULL,
	`registration_open` integer DEFAULT false NOT NULL,
	`allowed_origins` text,
	`rate_limit_max` integer DEFAULT 100 NOT NULL,
	`rate_limit_window` integer DEFAULT 60 NOT NULL,
	`provider_defaults` text,
	`email_locale` text DEFAULT 'en' NOT NULL,
	`updated_at` text
);
--> statement-breakpoint
CREATE TABLE `api_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`token_prefix` text NOT NULL,
	`scope` text DEFAULT 'read' NOT NULL,
	`last_used_at` text,
	`expires_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`display_name` text DEFAULT '' NOT NULL,
	`username` text,
	`role` text DEFAULT 'user' NOT NULL,
	`email_verified_at` text,
	`totp_secret` text,
	`totp_enabled` integer DEFAULT false NOT NULL,
	`totp_backup_codes` text,
	`avatar` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `verification_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`code` text NOT NULL,
	`purpose` text DEFAULT 'delete_comment' NOT NULL,
	`target_id` text DEFAULT '' NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `visitor_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`path` text NOT NULL,
	`parent_id` text,
	`author_name` text NOT NULL,
	`author_email` text DEFAULT '' NOT NULL,
	`author_url` text DEFAULT '' NOT NULL,
	`content` text NOT NULL,
	`ip` text DEFAULT '' NOT NULL,
	`user_agent` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'approved' NOT NULL,
	`visitor_id` text DEFAULT '' NOT NULL,
	`notify_on_reply` integer DEFAULT 0 NOT NULL,
	`edited_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_visitor_comments_lookup` ON `visitor_comments` (`site_id`,`path`,`status`,`created_at`);