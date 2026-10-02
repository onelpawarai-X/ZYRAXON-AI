-- Copyright (c) 2026 onelpawarai. All rights reserved.

ALTER TABLE `model_tpm_limit` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `model_tpm_limit` ADD PRIMARY KEY (`id`);--> statement-breakpoint
ALTER TABLE `model_tpm_limit` DROP COLUMN `interval`;