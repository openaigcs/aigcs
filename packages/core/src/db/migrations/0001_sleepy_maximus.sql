CREATE TABLE `visitor_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`path` text NOT NULL,
	`author_name` text NOT NULL,
	`author_email` text DEFAULT '' NOT NULL,
	`author_url` text DEFAULT '' NOT NULL,
	`content` text NOT NULL,
	`ip` text DEFAULT '' NOT NULL,
	`user_agent` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'approved' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `page_cache` ADD `title` text;--> statement-breakpoint
ALTER TABLE `page_cache` ADD `content_source` text;