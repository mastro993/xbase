CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`prefix` text NOT NULL,
	`token_hash` text NOT NULL UNIQUE,
	`created_at` integer NOT NULL,
	`last_used_at` integer
);
--> statement-breakpoint
CREATE TABLE `oauth_clients` (
	`client_id` text PRIMARY KEY,
	`kind` text NOT NULL,
	`client_name` text NOT NULL,
	`redirect_uris` text NOT NULL,
	`fetched_at` integer,
	`created_at` integer NOT NULL,
	CONSTRAINT "oauth_clients_kind_ck" CHECK("kind" in ('dcr', 'cimd'))
);
--> statement-breakpoint
CREATE TABLE `oauth_codes` (
	`code_hash` text PRIMARY KEY,
	`client_id` text NOT NULL,
	`redirect_uri` text NOT NULL,
	`code_challenge` text NOT NULL,
	`scope` text NOT NULL,
	`resource` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`grant_id` text
);
--> statement-breakpoint
CREATE TABLE `oauth_grants` (
	`id` text PRIMARY KEY,
	`client_id` text NOT NULL,
	`scope` text NOT NULL,
	`resource` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	`revoked_at` integer,
	CONSTRAINT `fk_oauth_grants_client_id_oauth_clients_client_id_fk` FOREIGN KEY (`client_id`) REFERENCES `oauth_clients`(`client_id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `oauth_tokens` (
	`token_hash` text PRIMARY KEY,
	`kind` text NOT NULL,
	`grant_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`rotated_at` integer,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_oauth_tokens_grant_id_oauth_grants_id_fk` FOREIGN KEY (`grant_id`) REFERENCES `oauth_grants`(`id`) ON DELETE CASCADE,
	CONSTRAINT "oauth_tokens_kind_ck" CHECK("kind" in ('access', 'refresh'))
);
--> statement-breakpoint
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
CREATE TABLE `saved_searches` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`query` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY,
	`account_id` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	CONSTRAINT `fk_sessions_account_id_x_accounts_id_fk` FOREIGN KEY (`account_id`) REFERENCES `x_accounts`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
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
CREATE INDEX `oauth_tokens_grant_id_idx` ON `oauth_tokens` (`grant_id`);--> statement-breakpoint
CREATE INDEX `posts_account_status_publish_at_idx` ON `posts` (`account_id`,`status`,`publish_at`);