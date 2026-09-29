-- SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
-- Copyright (c) 2026 onelpawarai. All rights reserved.

DROP INDEX `referral_workspace_id` ON `referral`;--> statement-breakpoint
ALTER TABLE `referral` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `referral` ADD PRIMARY KEY (`workspace_id`,`id`);