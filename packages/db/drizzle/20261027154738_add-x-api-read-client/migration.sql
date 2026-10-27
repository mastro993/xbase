CREATE TABLE `x_api_calls` (
	`id` text PRIMARY KEY,
	`account_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`feature` text NOT NULL,
	`item_count` integer DEFAULT 0 NOT NULL,
	`cost_micros` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_x_api_calls_account_id_x_accounts_id_fk` FOREIGN KEY (`account_id`) REFERENCES `x_accounts`(`id`) ON DELETE CASCADE,
	CONSTRAINT "x_api_calls_feature_ck" CHECK("feature" in ('discovery', 'full_text', 'performance', 'profile')),
	CONSTRAINT "x_api_calls_status_ck" CHECK("status" in ('ok', 'error', 'rate_limited'))
);
--> statement-breakpoint
CREATE TABLE `x_posts` (
	`account_id` text NOT NULL,
	`post_id` text NOT NULL,
	`author_id` text,
	`author_username` text,
	`text` text NOT NULL,
	`data` text NOT NULL,
	`fetched_at` integer NOT NULL,
	CONSTRAINT `x_posts_pk` PRIMARY KEY(`account_id`, `post_id`),
	CONSTRAINT `fk_x_posts_account_id_x_accounts_id_fk` FOREIGN KEY (`account_id`) REFERENCES `x_accounts`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `x_rate_limits` (
	`account_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`limit` integer,
	`remaining` integer,
	`reset_at` integer,
	`day_limit` integer,
	`day_remaining` integer,
	`day_reset_at` integer,
	`updated_at` integer NOT NULL,
	CONSTRAINT `x_rate_limits_pk` PRIMARY KEY(`account_id`, `endpoint`),
	CONSTRAINT `fk_x_rate_limits_account_id_x_accounts_id_fk` FOREIGN KEY (`account_id`) REFERENCES `x_accounts`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `x_api_calls_account_created_at_idx` ON `x_api_calls` (`account_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `x_api_calls_created_at_idx` ON `x_api_calls` (`created_at`);--> statement-breakpoint
CREATE INDEX `x_posts_account_fetched_at_idx` ON `x_posts` (`account_id`,`fetched_at`);