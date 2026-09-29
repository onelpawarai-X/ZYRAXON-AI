-- SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
-- Copyright (c) 2026 onelpawarai. All rights reserved.

ALTER TABLE `user` ADD `account_id` varchar(30);--> statement-breakpoint
ALTER TABLE `user` ADD `old_account_id` varchar(30);--> statement-breakpoint
ALTER TABLE `user` ADD CONSTRAINT `user_account_id` UNIQUE(`workspace_id`,`account_id`);