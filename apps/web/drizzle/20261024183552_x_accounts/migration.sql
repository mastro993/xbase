CREATE TABLE `x_accounts` (
	`id` text PRIMARY KEY,
	`username` text NOT NULL,
	`name` text NOT NULL,
	`avatar_url` text,
	`access_token` text NOT NULL,
	`refresh_token` text,
	`token_expires_at` integer NOT NULL,
	`scope` text NOT NULL,
	`voice` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
-- Sessions and posts from password sign-in belong to no X account. Old sessions would otherwise
-- work again as soon as someone claims this XBase, so everyone signs in again; the posts start over.
DELETE FROM `sessions`;--> statement-breakpoint
ALTER TABLE `sessions` ADD `account_id` text REFERENCES x_accounts(id) ON DELETE SET NULL;--> statement-breakpoint
DROP TABLE `posts`;--> statement-breakpoint
CREATE TABLE `posts` (
	`id` text PRIMARY KEY,
	`account_id` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`parts` text NOT NULL,
	`publish_at` integer,
	`published_at` integer,
	`x_post_id` text,
	`error` text,
	`origin` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_posts_account_id_x_accounts_id_fk` FOREIGN KEY (`account_id`) REFERENCES `x_accounts`(`id`) ON DELETE CASCADE,
	CONSTRAINT "posts_status_ck" CHECK("status" in ('draft', 'scheduled', 'publishing', 'published', 'failed')),
	CONSTRAINT "posts_origin_ck" CHECK("origin" in ('web', 'api', 'mcp'))
);
--> statement-breakpoint
CREATE INDEX `posts_account_status_publish_at_idx` ON `posts` (`account_id`,`status`,`publish_at`);
