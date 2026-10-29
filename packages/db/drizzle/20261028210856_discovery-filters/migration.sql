CREATE TABLE `hidden_authors` (
	`account_id` text NOT NULL,
	`user_id` text NOT NULL,
	CONSTRAINT `hidden_authors_pk` PRIMARY KEY(`account_id`, `user_id`),
	CONSTRAINT `fk_hidden_authors_account_id_x_accounts_id_fk` FOREIGN KEY (`account_id`) REFERENCES `x_accounts`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `suggested_posts` (
	`account_id` text NOT NULL,
	`x_post_id` text NOT NULL,
	`author_id` text,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `suggested_posts_pk` PRIMARY KEY(`account_id`, `x_post_id`),
	CONSTRAINT `fk_suggested_posts_account_id_x_accounts_id_fk` FOREIGN KEY (`account_id`) REFERENCES `x_accounts`(`id`) ON DELETE CASCADE,
	CONSTRAINT "suggested_posts_status_ck" CHECK("status" in ('shown', 'skipped', 'replied'))
);
--> statement-breakpoint
ALTER TABLE `discovery_candidates` ADD `excluded_reason` text;--> statement-breakpoint
ALTER TABLE `x_accounts` ADD `hidden_authors_refreshed_at` integer;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_discovery_candidates` (
	`id` text PRIMARY KEY,
	`account_id` text NOT NULL,
	`x_post_id` text NOT NULL,
	`source` text NOT NULL,
	`saved_search_id` text,
	`url` text NOT NULL,
	`author_id` text,
	`author_handle` text,
	`author_name` text,
	`author_followers` integer,
	`author_following` integer,
	`text` text NOT NULL,
	`lang` text,
	`posted_at` integer NOT NULL,
	`views` integer,
	`likes` integer,
	`replies` integer,
	`reposts` integer,
	`quotes` integer,
	`has_media` integer DEFAULT false NOT NULL,
	`is_quote` integer DEFAULT false NOT NULL,
	`conversation_id` text,
	`quoted_post_id` text,
	`quoted_text` text,
	`quoted_author_id` text,
	`quoted_author_handle` text,
	`fetched_at` integer NOT NULL,
	`excluded_reason` text,
	CONSTRAINT `fk_discovery_candidates_account_id_x_accounts_id_fk` FOREIGN KEY (`account_id`) REFERENCES `x_accounts`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_discovery_candidates_saved_search_id_saved_searches_id_fk` FOREIGN KEY (`saved_search_id`) REFERENCES `saved_searches`(`id`) ON DELETE SET NULL,
	CONSTRAINT "discovery_candidates_source_ck" CHECK("source" in ('home', 'search')),
	CONSTRAINT "discovery_candidates_excluded_reason_ck" CHECK("excluded_reason" in ('blocked_author', 'image_only', 'thread_too_long', 'bait', 'giveaway', 'promo', 'politics', 'crypto', 'off_topic'))
);
--> statement-breakpoint
INSERT INTO `__new_discovery_candidates`(`id`, `account_id`, `x_post_id`, `source`, `saved_search_id`, `url`, `author_id`, `author_handle`, `author_name`, `author_followers`, `author_following`, `text`, `lang`, `posted_at`, `views`, `likes`, `replies`, `reposts`, `quotes`, `has_media`, `is_quote`, `conversation_id`, `quoted_post_id`, `quoted_text`, `quoted_author_id`, `quoted_author_handle`, `fetched_at`) SELECT `id`, `account_id`, `x_post_id`, `source`, `saved_search_id`, `url`, `author_id`, `author_handle`, `author_name`, `author_followers`, `author_following`, `text`, `lang`, `posted_at`, `views`, `likes`, `replies`, `reposts`, `quotes`, `has_media`, `is_quote`, `conversation_id`, `quoted_post_id`, `quoted_text`, `quoted_author_id`, `quoted_author_handle`, `fetched_at` FROM `discovery_candidates`;--> statement-breakpoint
DROP TABLE `discovery_candidates`;--> statement-breakpoint
ALTER TABLE `__new_discovery_candidates` RENAME TO `discovery_candidates`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `discovery_candidates_account_post_uq` ON `discovery_candidates` (`account_id`,`x_post_id`);--> statement-breakpoint
CREATE INDEX `discovery_candidates_account_search_posted_at_idx` ON `discovery_candidates` (`account_id`,`saved_search_id`,`posted_at`);