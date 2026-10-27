CREATE TABLE `discovery_candidates` (
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
	CONSTRAINT `fk_discovery_candidates_account_id_x_accounts_id_fk` FOREIGN KEY (`account_id`) REFERENCES `x_accounts`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_discovery_candidates_saved_search_id_saved_searches_id_fk` FOREIGN KEY (`saved_search_id`) REFERENCES `saved_searches`(`id`) ON DELETE SET NULL,
	CONSTRAINT "discovery_candidates_source_ck" CHECK("source" in ('home', 'search'))
);
--> statement-breakpoint
CREATE TABLE `followed_accounts` (
	`account_id` text NOT NULL,
	`user_id` text NOT NULL,
	CONSTRAINT `followed_accounts_pk` PRIMARY KEY(`account_id`, `user_id`),
	CONSTRAINT `fk_followed_accounts_account_id_x_accounts_id_fk` FOREIGN KEY (`account_id`) REFERENCES `x_accounts`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
ALTER TABLE `saved_searches` ADD `enabled` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `saved_searches` ADD `last_run_at` integer;--> statement-breakpoint
ALTER TABLE `saved_searches` ADD `last_candidate_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `x_accounts` ADD `following_refreshed_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `discovery_candidates_account_post_uq` ON `discovery_candidates` (`account_id`,`x_post_id`);--> statement-breakpoint
CREATE INDEX `discovery_candidates_account_search_posted_at_idx` ON `discovery_candidates` (`account_id`,`saved_search_id`,`posted_at`);