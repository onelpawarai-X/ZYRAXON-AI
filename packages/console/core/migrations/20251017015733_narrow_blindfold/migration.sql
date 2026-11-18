-- Copyright (c) 2026 onelpawarai. All rights reserved.

ALTER TABLE `account` DROP INDEX `email`;--> statement-breakpoint
CREATE INDEX `account_id` ON `auth` (`account_id`);--> statement-breakpoint
ALTER TABLE `account` DROP COLUMN `email`;